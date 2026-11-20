//! Shared, extensible agent metadata and opt-in modern MCP operations.
use crate::store::{self, List, Task};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub fn error(code: &str, message: &str) -> String {
    json!({"code":code,"message":message}).to_string()
}
pub fn string<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| error("invalid_request", &format!("{key} is required")))
}
pub fn source(v: &Value) -> Result<Value, String> {
    if !v.is_object() {
        return Err(error("invalid_source", "source is required"));
    }
    for (key, max, required) in [
        ("client_id", 200, true),
        ("conversation_id", 500, true),
        ("title", 500, false),
        ("url", 2048, false),
    ] {
        match v.get(key) {
            None | Some(Value::Null) if !required => (),
            Some(Value::String(s))
                if (!required || !s.trim().is_empty()) && s.chars().count() <= max =>
            {
                ()
            }
            _ => return Err(error("invalid_source", &format!("Invalid source.{key}"))),
        }
    }
    if let Some(url) = v["url"].as_str().filter(|s| !s.is_empty()) {
        valid_link(url)?;
    }
    Ok(v.clone())
}
pub fn same_source(a: &Value, b: &Value) -> bool {
    a["client_id"] == b["client_id"] && a["conversation_id"] == b["conversation_id"]
}
pub fn valid_link(link: &str) -> Result<(), String> {
    let scheme = link
        .split_once(':')
        .map(|(s, _)| s.to_ascii_lowercase())
        .unwrap_or_default();
    if link.is_empty()
        || (crate::app::LINK_SCHEMES.contains(&scheme.as_str())
            && !link.chars().any(char::is_control))
    {
        Ok(())
    } else {
        Err(error(
            "invalid_request",
            "Use an http(s) or supported application link",
        ))
    }
}
pub fn load(list: &List) -> Result<Value, String> {
    let mut seen = HashSet::new();
    for task in list.tasks() {
        if let Some(uid) = &task.uid {
            if uuid::Uuid::parse_str(uid).is_err() || !seen.insert(uid) {
                return Err(error("ambiguous_identity", "Invalid or duplicate task UID"));
            }
        }
    }
    let Some(raw) = list.agent_metadata()? else {
        return Ok(Value::Null);
    };
    let v: Value = serde_json::from_str(raw)
        .map_err(|_| error("invalid_metadata", "Cannot read agent metadata"))?;
    if v["schema_version"] != 1 {
        return Err(error(
            "unsupported_schema",
            "Unsupported agent metadata version",
        ));
    }
    if v["store_uuid"]
        .as_str()
        .is_none_or(|s| uuid::Uuid::parse_str(s).is_err())
        || !v["task_sources"].is_object()
        || !v["request_ledger"].is_array()
    {
        return Err(error(
            "invalid_metadata",
            "Invalid agent identity or receipt storage",
        ));
    }
    let mut receipt_keys = HashSet::new();
    for receipt in v["request_ledger"].as_array().unwrap() {
        if !receipt_keys.insert(
            ["client_id", "conversation_id", "operation", "request_id"]
                .map(|key| receipt[key].to_string()),
        ) || !receipt.is_object()
            || !receipt["result"].is_object()
            || !receipt["canonical_input"].is_object()
            || ["client_id", "conversation_id", "operation", "request_id"]
                .iter()
                .any(|key| receipt[key].as_str().is_none())
        {
            return Err(error("invalid_metadata", "Invalid request receipt"));
        }
    }
    for origin in v["task_sources"]
        .as_object()
        .unwrap()
        .values()
        .filter(|v| !v.is_null())
    {
        source(origin).map_err(|_| error("invalid_metadata", "Invalid task source"))?;
    }
    crate::questions::validate_storage(&v)?;
    if !v["planning"].is_null() {
        if !v["planning"].is_object() {
            return Err(error("invalid_metadata", "Invalid planning storage"));
        }
        let run = &v["planning"]["current"];
        if !run.is_null()
            && (!run.is_object()
                || run["run_id"].as_str().is_none()
                || run["date"].as_str().is_none()
                || !["building", "suggested", "failed", "interrupted"]
                    .contains(&run["status"].as_str().unwrap_or(""))
                || ["started_at_ms", "updated_at_ms", "expires_at_ms"]
                    .iter()
                    .any(|k| !run[k].is_i64())
                || source(&run["source"]).is_err())
        {
            return Err(error("invalid_metadata", "Invalid planning run"));
        }
    }
    Ok(v)
}
pub fn initialized(list: &List) -> Result<Value, String> {
    let v = load(list)?;
    Ok(if v.is_null() {
        json!({"schema_version":1,"store_uuid":id(),"task_sources":{},"request_ledger":[],"planning":null,"questions":{}})
    } else {
        v
    })
}
pub fn save(list: &mut List, state: &Value) -> Result<(), String> {
    let encoded = serde_json::to_string(state)
        .map_err(|e| e.to_string())?
        .replace('<', "\\u003c")
        .replace('>', "\\u003e")
        .replace('&', "\\u0026");
    list.set_agent_metadata(&encoded);
    Ok(())
}
pub fn task_ref(list: &List, reference: &Value) -> Result<Task, String> {
    let task = reference["id"]
        .as_i64()
        .and_then(|id| list.get(id))
        .ok_or_else(|| error("stale_task_reference", "Task is gone"))?;
    if task.uid.is_none() || task.uid.as_deref() != reference["uid"].as_str() {
        return Err(error(
            "stale_task_reference",
            "Discover the current task and ensure its identity first",
        ));
    }
    if list.tasks().filter(|t| t.uid == task.uid).count() != 1 {
        return Err(error("ambiguous_identity", "Duplicate task identity"));
    }
    Ok(task)
}
pub fn check_store(state: &Value, args: &Value) -> Result<(), String> {
    if state.is_null() || args["store_uuid"] != state["store_uuid"] {
        return Err(error("store_changed", "Task store changed. Refresh."));
    }
    Ok(())
}
pub fn canonical(args: &Value) -> Value {
    let mut v = args.clone();
    if let Some(o) = v.as_object_mut() {
        o.remove("request_id");
    }
    v
}
pub fn replay(state: &Value, op: &str, args: &Value) -> Result<Option<Value>, String> {
    source(&args["source"])?;
    let req = string(args, "request_id")?;
    if req.chars().count() > 200 {
        return Err(error("invalid_request", "request_id is too long"));
    }
    let input = canonical(args);
    for receipt in state["request_ledger"].as_array().into_iter().flatten() {
        if receipt["operation"] == op
            && receipt["request_id"] == req
            && same_source(receipt, &args["source"])
        {
            if receipt["canonical_input"] != input {
                return Err(error(
                    "idempotency_conflict",
                    "Request identity was already used with different input",
                ));
            }
            let mut result = receipt["result"].clone();
            result["replayed"] = json!(true);
            return Ok(Some(result));
        }
    }
    Ok(None)
}
pub fn record(state: &mut Value, op: &str, args: &Value, result: &Value) {
    state["request_ledger"].as_array_mut().unwrap().push(json!({"client_id":args["source"]["client_id"],"conversation_id":args["source"]["conversation_id"],"operation":op,"request_id":args["request_id"],"canonical_input":canonical(args),"result":result,"committed_at":store::now()}));
}
pub fn transaction(
    list: &mut List,
    op: &str,
    args: &Value,
    f: impl FnOnce(&mut List, &mut Value) -> Result<Value, String>,
) -> Result<Value, String> {
    let mut state = initialized(list)?;
    if let Some(result) = replay(&state, op, args)? {
        return Ok(result);
    }
    let mut result = f(list, &mut state)?;
    result["replayed"] = json!(false);
    record(&mut state, op, args, &result);
    save(list, &state)?;
    Ok(result)
}
pub fn resolve_list(list: &List, name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Ok(String::new());
    }
    let names = list.chats();
    if names.iter().any(|n| n == name) {
        return Ok(name.into());
    }
    let hits: Vec<_> = names
        .into_iter()
        .filter(|n| n.eq_ignore_ascii_case(name))
        .collect();
    match hits.len() {
        1 => Ok(hits[0].clone()),
        0 => Err(error(
            "unknown_list",
            "Discover lists first; use create_list only for an intentional new home",
        )),
        _ => Err(error(
            "ambiguous_list",
            "More than one list matches that name",
        )),
    }
}
pub fn page(
    list: &List,
    endpoint: &str,
    args: &Value,
    items: Vec<Value>,
    default_limit: usize,
    max: usize,
) -> Result<Value, String> {
    let limit = args
        .get("limit")
        .map(|v| {
            v.as_u64()
                .map(|v| v as usize)
                .filter(|n| *n > 0 && *n <= max)
                .ok_or_else(|| error("invalid_request", "Invalid page limit"))
        })
        .transpose()?
        .unwrap_or(default_limit);
    let revision = hash(&list.original);
    let mut filters = args.clone();
    if let Some(o) = filters.as_object_mut() {
        o.remove("cursor");
        o.remove("limit");
    }
    let offset = if let Some(cursor) = args.get("cursor") {
        let c = cursor
            .as_str()
            .filter(|s| s.len() <= 4096 && s.len() % 2 == 0 && s.is_ascii())
            .ok_or_else(|| error("invalid_request", "Invalid cursor"))?;
        let bytes = (0..c.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&c[i..i + 2], 16))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| error("invalid_request", "Invalid cursor"))?;
        let v: Value = serde_json::from_slice(&bytes)
            .map_err(|_| error("invalid_request", "Invalid cursor"))?;
        if v["endpoint"] != endpoint || v["filters"] != filters || v["limit"] != limit {
            return Err(error("cursor_mismatch", "Cursor belongs to another query"));
        }
        if v["revision"] != revision {
            return Err(error("stale_cursor", "File changed. Restart discovery."));
        }
        v["offset"]
            .as_u64()
            .map(|v| v as usize)
            .filter(|n| *n <= items.len())
            .ok_or_else(|| error("invalid_request", "Invalid cursor offset"))?
    } else {
        0
    };
    let end = (offset + limit).min(items.len());
    let next = if end < items.len() {
        let s=json!({"endpoint":endpoint,"revision":revision,"filters":filters,"limit":limit,"offset":end}).to_string();
        Some(
            s.as_bytes()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>(),
        )
    } else {
        None
    };
    let state = load(list)?;
    Ok(
        json!({"store_uuid":state["store_uuid"],"snapshot_revision":revision,"items":items[offset..end],"next_cursor":next,"has_more":next.is_some()}),
    )
}
pub fn discovery(list: &List, op: &str, args: &Value) -> Result<Value, String> {
    let state = load(list)?;
    if op == "list_lists" {
        return page(list, op, args, store::list_inventory(list), 100, 200);
    }
    let status = args["status"].as_str().unwrap_or("all");
    if !["all", "open", "done"].contains(&status) {
        return Err(error("invalid_request", "Invalid status"));
    }
    let mut selected: Vec<Task> = list
        .tasks()
        .filter(|t| match status {
            "open" => t.done_at.is_none(),
            "done" => t.done_at.is_some(),
            _ => true,
        })
        .filter(|t| args["list_name"].as_str().is_none_or(|n| t.chat == n))
        .filter(|t| {
            args["parent_id"]
                .as_i64()
                .is_none_or(|p| t.parent_id == Some(p))
        })
        .filter(|t| !args["desk"].as_bool().unwrap_or(false) || t.mydesk)
        .cloned()
        .collect();
    if args["parent_id"].is_i64() {
        selected.sort_by_key(|t| (t.position, t.id));
    }
    let items = selected
        .iter()
        .map(|t| {
            let mut v = serde_json::to_value(t).unwrap();
            v["list_name"] = json!(t.chat);
            v["source"] = t
                .uid
                .as_ref()
                .map(|u| state["task_sources"][u].clone())
                .unwrap_or(Value::Null);
            v
        })
        .collect();
    page(list, op, args, items, 100, 200)
}
pub fn mutate(list: &mut List, op: &str, args: &Value, client: &str) -> Result<Value, String> {
    transaction(list, op, args, |list, state| {
        let store_uuid = state["store_uuid"].clone();
        match op {
            "ensure_task_identity" => {
                if args["expected_snapshot_revision"] != hash(&list.original) {
                    return Err(error(
                        "stale_snapshot",
                        "File changed. Discover tasks again.",
                    ));
                }
                let task_id = args["task_id"]
                    .as_i64()
                    .ok_or_else(|| error("invalid_request", "task_id required"))?;
                let uid = list.assign_uid(task_id)?;
                Ok(json!({"store_uuid":store_uuid,"task_ref":{"id":task_id,"uid":uid}}))
            }
            "create_list" => {
                let name = string(args, "name")?.trim();
                let purpose = string(args, "purpose")?;
                if purpose.chars().count() > 500 || purpose.contains(['\n', '\r']) {
                    return Err(error("invalid_request", "Use a short one-line purpose"));
                }
                let (name, created) = match resolve_list(list, name) {
                    Ok(n) => (n, false),
                    Err(e) if e.contains("unknown_list") => {
                        list.create_chat(name)?;
                        (name.into(), true)
                    }
                    Err(e) => return Err(e),
                };
                Ok(
                    json!({"store_uuid":store_uuid,"name":name,"created":created,"request_id":args["request_id"]}),
                )
            }
            "create_tasks" => {
                if args.get("chat").is_some() {
                    return Err(error("invalid_request", "Use destination_list, not chat"));
                }
                let parent = if args["parent_ref"].is_null() {
                    None
                } else {
                    Some(task_ref(list, &args["parent_ref"])?)
                };
                if parent.as_ref().is_some_and(|p| p.parent_id.is_some()) {
                    return Err(error(
                        "invalid_request",
                        "Only one subtask level is supported",
                    ));
                }
                let destination = resolve_list(
                    list,
                    args["destination_list"]
                        .as_str()
                        .unwrap_or_else(|| parent.as_ref().map(|p| p.chat.as_str()).unwrap_or("")),
                )?;
                if parent.as_ref().is_some_and(|p| p.chat != destination) {
                    return Err(error(
                        "invalid_request",
                        "Subtasks inherit their parent's list",
                    ));
                }
                let batch = args["tasks"]
                    .as_array()
                    .filter(|a| !a.is_empty() && a.len() <= 200)
                    .ok_or_else(|| error("invalid_request", "Use 1–200 tasks"))?;
                let mut result = vec![];
                for item in batch {
                    validate_changes(item)?;
                    let title = string(item, "title")?;
                    let task = store::NewTask {
                        title,
                        details: item["details"].as_str().unwrap_or(""),
                        agent: client,
                        chat: &destination,
                        link: item["link"].as_str().unwrap_or(""),
                        priority: item["priority"].as_i64(),
                        due: item["due"].as_str(),
                        mydesk: item["mydesk"].as_bool().unwrap_or(false),
                    };
                    let task_id = if let Some(p) = &parent {
                        list.add_subtask(p.id, task)?
                    } else {
                        list.add(task)
                    };
                    if let Some(ordered) = args["ordered"].as_bool() {
                        list.set_subtask_mode(parent.as_ref().map_or(task_id, |p| p.id), ordered)?;
                    }
                    let uid = list.assign_uid(task_id)?;
                    state["task_sources"][&uid] = args["source"].clone();
                    result.push(
                        json!({"id":task_id,"uid":uid,"title":title,"list_name":destination}),
                    );
                }
                Ok(json!({"store_uuid":store_uuid,"request_id":args["request_id"],"tasks":result}))
            }
            "update_task_v2" => {
                if args["expected_snapshot_revision"] != hash(&list.original) {
                    return Err(error(
                        "stale_snapshot",
                        "File changed. Discover tasks again.",
                    ));
                }
                let task = task_ref(list, &args["task_ref"])?;
                let c = &args["changes"];
                validate_changes(c)?;
                if c.get("chat").is_some() {
                    return Err(error("invalid_request", "Use destination_list, not chat"));
                }
                let dest = c
                    .get("destination_list")
                    .map(|v| {
                        v.as_str()
                            .ok_or_else(|| error("invalid_request", "Invalid destination"))
                            .and_then(|s| resolve_list(list, s))
                    })
                    .transpose()?;
                if dest.is_some() && task.parent_id.is_some() {
                    return Err(error(
                        "invalid_request",
                        "Move the parent to move its subtasks",
                    ));
                }
                if let Some(v) = c.get("origin_source") {
                    if !v.is_null() {
                        source(v)?;
                    }
                    state["task_sources"][task.uid.as_ref().unwrap()] = v.clone();
                }
                if let Some(dest) = &dest {
                    list.preserve_chat(&task.chat);
                    list.preserve_chat(dest);
                }
                list.update(
                    task.id,
                    store::Changes {
                        title: c["title"].as_str(),
                        details: c["details"].as_str(),
                        link: c["link"].as_str(),
                        chat: dest.as_deref(),
                        priority: c.get("priority").map(Value::as_i64),
                        due: c.get("due").map(Value::as_str),
                        mydesk: c["mydesk"].as_bool(),
                        ..Default::default()
                    },
                );
                if let Some(ordered) = c["ordered"].as_bool() {
                    list.set_subtask_mode(task.id, ordered)?;
                }
                Ok(json!({"store_uuid":store_uuid,"task_ref":args["task_ref"],"updated":true}))
            }
            _ => Err(error("invalid_request", "Unknown mutation")),
        }
    })
}
fn validate_changes(v: &Value) -> Result<(), String> {
    if !v.is_object() {
        return Err(error("invalid_request", "Expected task object"));
    }
    for k in ["title", "details", "link", "due"] {
        if let Some(x) = v.get(k) {
            if !(x.is_string() || (k == "due" && x.is_null())) {
                return Err(error("invalid_request", "Invalid text field"));
            }
        }
    }
    if v.get("title")
        .is_some_and(|v| v.as_str().is_none_or(|s| s.trim().is_empty()))
    {
        return Err(error("invalid_request", "Title is required"));
    }
    if v.get("priority")
        .is_some_and(|v| !v.is_null() && !v.as_i64().is_some_and(store::valid_priority))
    {
        return Err(error("invalid_request", "priority must be 0–3 or null"));
    }
    if v["due"].as_str().is_some_and(|d| !store::valid_due(d)) {
        return Err(error("invalid_request", "Invalid due date"));
    }
    for k in ["mydesk", "ordered"] {
        if v.get(k).is_some_and(|v| !v.is_boolean()) {
            return Err(error("invalid_request", "Expected boolean"));
        }
    }
    if let Some(link) = v["link"].as_str() {
        valid_link(link)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn source() -> Value {
        json!({"client_id":"test","conversation_id":"thread"})
    }
    #[test]
    fn discovery_is_read_only_complete_and_cursors_are_snapshot_bound() {
        let list = store::parse(
            "## Empty\n## Work\n- [ ] One @id(1)\n- [x] Old @id(2) @done(2000-01-01 12:00)\n",
        );
        let before = list.render();
        let page1 = discovery(&list, "list_tasks_page", &json!({"limit":1})).unwrap();
        assert_eq!(page1["store_uuid"], Value::Null);
        assert_eq!(before, list.render());
        let args = json!({"limit":1,"cursor":page1["next_cursor"]});
        assert_eq!(
            discovery(&list, "list_tasks_page", &args).unwrap()["items"][0]["id"],
            2
        );
        let changed = store::parse(&(list.original.clone() + "\n"));
        assert!(discovery(&changed, "list_tasks_page", &args)
            .unwrap_err()
            .contains("stale_cursor"));
        assert!(discovery(&list, "list_lists", &args)
            .unwrap_err()
            .contains("cursor_mismatch"));
        assert_eq!(
            discovery(&list, "list_lists", &json!({})).unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
    }
    #[test]
    fn retry_replays_before_snapshot_checks_and_never_duplicates() {
        let mut list = store::parse("- [ ] One @id(1)\n");
        let args = json!({"task_id":1,"expected_snapshot_revision":hash(&list.original),"source":source(),"request_id":"ensure"});
        let first = mutate(&mut list, "ensure_task_identity", &args, "test").unwrap();
        list = store::parse(&list.render());
        let again = mutate(&mut list, "ensure_task_identity", &args, "test").unwrap();
        assert_eq!(first["task_ref"], again["task_ref"]);
        assert_eq!(again["replayed"], true);
        let mut changed = args;
        changed["task_id"] = json!(2);
        assert!(mutate(&mut list, "ensure_task_identity", &changed, "test")
            .unwrap_err()
            .contains("idempotency_conflict"));
        let create = json!({"source":source(),"request_id":"create","destination_list":"","tasks":[{"title":"Two"}]});
        mutate(&mut list, "create_tasks", &create, "test").unwrap();
        mutate(&mut list, "create_tasks", &create, "test").unwrap();
        assert_eq!(list.tasks().count(), 2);
        let uid = list.tasks().last().unwrap().uid.as_ref().unwrap();
        assert_eq!(load(&list).unwrap()["task_sources"][uid], source());
    }
    #[test]
    fn malformed_metadata_is_rejected_and_unknown_extensions_survive() {
        let uid = id();
        let duplicate = store::parse(&format!(
            "- [ ] A @id(1) @uid({uid})\n- [ ] B @id(2) @uid({uid})\n"
        ));
        assert!(load(&duplicate).unwrap_err().contains("ambiguous_identity"));
        let mut list = store::parse("");
        let mut state = initialized(&list).unwrap();
        state["extension"] = json!({"nested":"keep"});
        save(&mut list, &state).unwrap();
        mutate(
            &mut list,
            "create_list",
            &json!({"name":"Home","purpose":"Ongoing work","source":source(),"request_id":"x"}),
            "test",
        )
        .unwrap();
        assert_eq!(load(&list).unwrap()["extension"], state["extension"]);
        state["request_ledger"] = json!([{"result":7}]);
        save(&mut list, &state).unwrap();
        assert!(load(&list).is_err());
    }
}
