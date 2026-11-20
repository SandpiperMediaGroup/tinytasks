//! Optional, agent-published questions. Only the desktop human-response command answers them.
use crate::{
    agent_state as a,
    store::{self, List},
};
use serde_json::{json, Value};
use std::collections::HashSet;

fn init(state: &mut Value) -> Result<(), String> {
    if state["questions"].is_null() {
        state["questions"] = json!({});
    }
    if !state["questions"].is_object() {
        return Err(a::error("invalid_metadata", "Invalid questions storage"));
    }
    for key in ["families", "revisions", "responses", "receipts"] {
        if state["questions"].get(key).is_none() {
            state["questions"][key] = json!({});
        }
        if !state["questions"][key].is_object() {
            return Err(a::error("invalid_metadata", "Invalid question records"));
        }
    }
    Ok(())
}
fn bounded(v: &Value, max: usize, required: bool) -> bool {
    v.as_str()
        .is_some_and(|s| (!required || !s.trim().is_empty()) && s.chars().count() <= max)
}
fn validate(q: &Value) -> Result<Value, String> {
    let bad = || {
        a::error(
            "invalid_question",
            "Use a prompt, valid mode and unique choices/defaults within their limits",
        )
    };
    if !q.is_object() || !bounded(&q["prompt"], 4000, true) {
        return Err(bad());
    }
    let mode = a::string(q, "mode")?;
    if !["single", "multiple", "text"].contains(&mode) {
        return Err(bad());
    }
    let mut q = q.clone();
    if q.get("options").is_none() {
        q["options"] = json!([]);
    }
    if q.get("default_option_ids").is_none() {
        q["default_option_ids"] = json!([]);
    }
    if q.get("allow_custom").is_none() {
        q["allow_custom"] = json!(false);
    }
    if !q["allow_custom"].is_boolean() {
        return Err(bad());
    }
    let options = q["options"].as_array().ok_or_else(bad)?;
    if (mode == "text" && !options.is_empty())
        || (mode != "text" && !(2..=12).contains(&options.len()))
    {
        return Err(bad());
    }
    let mut ids = HashSet::new();
    for o in options {
        let id = o["id"].as_str().ok_or_else(bad)?;
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            || !ids.insert(id)
            || !bounded(&o["label"], 120, true)
            || o.get("description")
                .is_some_and(|v| !bounded(v, 500, false))
        {
            return Err(bad());
        }
    }
    let defaults = q["default_option_ids"].as_array().ok_or_else(bad)?;
    let mut seen = HashSet::new();
    for d in defaults {
        let id = d.as_str().ok_or_else(bad)?;
        if !ids.contains(id) || !seen.insert(id) {
            return Err(bad());
        }
    }
    if mode == "single" && defaults.len() > 1 {
        return Err(bad());
    }
    if let Some(v) = q.get("recommended_option_id").filter(|v| !v.is_null()) {
        if !v.as_str().is_some_and(|id| ids.contains(id)) {
            return Err(bad());
        }
    }
    if mode == "multiple" {
        let min = q["min_selected"].as_u64().ok_or_else(bad)?;
        let max = q["max_selected"].as_u64().ok_or_else(bad)?;
        if max == 0
            || max > options.len() as u64
            || min > max
            || (!defaults.is_empty()
                && (defaults.len() < (min as usize) || defaults.len() > (max as usize)))
        {
            return Err(bad());
        }
    }
    if q.get("default_text")
        .is_some_and(|v| mode != "text" || !bounded(v, 8000, false))
    {
        return Err(bad());
    }
    if mode == "text" && q["allow_custom"] == true {
        return Err(bad());
    }
    Ok(q)
}
fn family<'a>(state: &'a Value, id: &str) -> Result<&'a Value, String> {
    state["questions"]["families"]
        .get(id)
        .ok_or_else(|| a::error("invalid_question", "Question not found"))
}
fn owned(state: &Value, args: &Value) -> Result<String, String> {
    a::check_store(state, args)?;
    a::source(&args["source"])?;
    let id = a::string(args, "question_id")?;
    if !a::same_source(&family(state, id)?["source"], &args["source"]) {
        return Err(a::error(
            "source_mismatch",
            "Question belongs to another source",
        ));
    }
    Ok(id.into())
}
fn available(list: &List, f: &Value) -> bool {
    f["task_uid"]
        .as_str()
        .is_some_and(|uid| list.tasks().any(|t| t.uid.as_deref() == Some(uid)))
}
pub fn view(list: &List, state: &Value, id: &str) -> Result<Value, String> {
    let f = family(state, id)?;
    let revision = &state["questions"]["revisions"][f["current_revision_id"]
        .as_str()
        .ok_or_else(|| a::error("invalid_metadata", "Missing revision"))?];
    let response = revision["response_id"]
        .as_str()
        .map(|id| state["questions"]["responses"][id].clone())
        .unwrap_or(Value::Null);
    let receipt = response["response_id"]
        .as_str()
        .map(|id| state["questions"]["receipts"][id].clone())
        .unwrap_or(Value::Null);
    Ok(
        json!({"store_uuid":state["store_uuid"],"family":f,"question_id":id,"revision":revision,"task_available":available(list,f),"response":response,"receipt":receipt,"delivery_mode":"agent_poll"}),
    )
}
pub fn mutate(list: &mut List, op: &str, args: &Value) -> Result<Value, String> {
    let mut normalized = args.clone();
    if op == "publish_question" {
        normalized["question"] = validate(&args["question"])?;
    }
    a::transaction(list, op, &normalized, |list, state| {
        init(state)?;
        a::check_store(state, &normalized)?;
        match op {
            "publish_question" => {
                let task = a::task_ref(list, &normalized["task_ref"])?;
                let uid = task.uid.unwrap();
                let previous = normalized["question_id"].as_str();
                if previous.is_some() != normalized["expected_revision_id"].as_str().is_some() {
                    return Err(a::error(
                        "invalid_question",
                        "Revisions require question_id and expected_revision_id",
                    ));
                }
                if let Some(id) = previous {
                    owned(state, &normalized)?;
                    let f = family(state, id)?;
                    if f["task_uid"] != uid
                        || f["current_revision_id"] != normalized["expected_revision_id"]
                    {
                        return Err(a::error("stale_revision", "Question changed. Refresh."));
                    }
                }
                for (id, f) in state["questions"]["families"].as_object().unwrap() {
                    if f["task_uid"] == uid
                        && state["questions"]["revisions"]
                            [f["current_revision_id"].as_str().unwrap_or("")]["disposition"]
                            == "pending"
                        && Some(id.as_str()) != previous
                    {
                        return Err(a::error(
                            "pending_question_exists",
                            "This task already has a pending question",
                        ));
                    }
                }
                let id = previous.map(String::from).unwrap_or_else(a::id);
                let revision_id = a::id();
                if previous.is_some() {
                    let old = state["questions"]["families"][&id]["current_revision_id"]
                        .as_str()
                        .unwrap()
                        .to_string();
                    if state["questions"]["revisions"][&old]["disposition"] == "pending" {
                        state["questions"]["revisions"][&old]["disposition"] = json!("withdrawn");
                        state["questions"]["revisions"][&old]["withdrawal_reason"] =
                            json!("superseded");
                    }
                } else {
                    state["questions"]["families"][&id] = json!({"question_id":id,"task_uid":uid,"task_id_at_creation":task.id,"source":normalized["source"],"created_at":store::now()});
                }
                state["questions"]["families"][&id]["current_revision_id"] = json!(revision_id);
                let mut revision = normalized["question"].clone();
                revision["revision_id"] = json!(revision_id);
                revision["question_id"] = json!(id);
                revision["disposition"] = json!("pending");
                revision["created_at"] = json!(store::now());
                state["questions"]["revisions"][&revision_id] = revision;
                Ok(json!({"question":view(list,state,&id)?}))
            }
            "withdraw_question" => {
                let id = owned(state, &normalized)?;
                let rev = family(state, &id)?["current_revision_id"]
                    .as_str()
                    .unwrap()
                    .to_string();
                if state["questions"]["families"][&id]["current_revision_id"]
                    != normalized["expected_revision_id"]
                {
                    return Err(a::error("stale_revision", "Question changed"));
                }
                let r = &mut state["questions"]["revisions"][&rev];
                if r["disposition"] == "pending" {
                    r["disposition"] = json!("withdrawn");
                    r["withdrawal_reason"] = json!("source_withdrew");
                    r["resolved_at"] = json!(store::now());
                } else if r["disposition"] != "withdrawn" {
                    return Err(a::error("question_resolved", "Question already answered"));
                }
                Ok(json!({"question":view(list,state,&id)?}))
            }
            "acknowledge_question_response" => {
                let id = owned(state, &normalized)?;
                let response_id = a::string(&normalized, "response_id")?;
                let response = &state["questions"]["responses"][response_id];
                if response.is_null()
                    || response["question_id"] != id
                    || response["revision_id"] != normalized["revision_id"]
                {
                    return Err(a::error("stale_revision", "Response does not match"));
                }
                if state["questions"]["receipts"][response_id].is_null() {
                    state["questions"]["receipts"][response_id] = json!({"receipt_id":a::id(),"response_id":response_id,"source":normalized["source"],"acknowledged_at":store::now()});
                }
                Ok(json!({"receipt":state["questions"]["receipts"][response_id]}))
            }
            _ => Err(a::error("invalid_request", "Unknown question tool")),
        }
    })
}
pub fn read(list: &List, op: &str, args: &Value) -> Result<Value, String> {
    let state = a::load(list)?;
    a::check_store(&state, args)?;
    a::source(&args["source"])?;
    if op == "get_question" {
        let id = owned(&state, args)?;
        return Ok(json!({"question":view(list,&state,&id)?}));
    }
    let acknowledged = args["acknowledged"].as_bool().unwrap_or(false);
    let mut responses:Vec<Value>=state["questions"]["responses"].as_object().into_iter().flat_map(|o|o.values()).filter(|r|a::same_source(&r["source"],&args["source"]))
        .filter(|r|!state["questions"]["receipts"][r["response_id"].as_str().unwrap_or("")].is_null()==acknowledged)
        .map(|r|json!({"response":r,"answered_revision":state["questions"]["revisions"][r["revision_id"].as_str().unwrap_or("")],"source":r["source"],"receipt":state["questions"]["receipts"][r["response_id"].as_str().unwrap_or("")],"task_available":available(list,&state["questions"]["families"][r["question_id"].as_str().unwrap_or("")])})).collect();
    responses.sort_by_key(|r| {
        (
            r["response"]["submitted_at"].as_i64().unwrap_or(0),
            r["response"]["response_id"]
                .as_str()
                .unwrap_or("")
                .to_string(),
        )
    });
    let mut page = a::page(list, op, args, responses, 50, 100)?;
    page["responses"] = page["items"].take();
    page.as_object_mut().unwrap().remove("items");
    Ok(page)
}
pub fn for_tasks(list: &List, refs: &[Value]) -> Result<Value, String> {
    if refs.len() > 200 {
        return Err(a::error("invalid_request", "Read at most 200 tasks"));
    }
    let state = a::load(list)?;
    let mut views = vec![];
    for (id, f) in state["questions"]["families"]
        .as_object()
        .into_iter()
        .flat_map(|o| o.iter())
    {
        if let Some(reference) = refs.iter().find(|r| {
            r["uid"].is_string() && r["uid"] == f["task_uid"] && a::task_ref(list, r).is_ok()
        }) {
            let mut value = view(list, &state, id)?;
            value["task_id"] = reference["id"].clone();
            views.push(value);
        }
    }
    Ok(json!({"store_uuid":state["store_uuid"],"questions":views}))
}
pub fn submit(list: &mut List, args: &Value) -> Result<Value, String> {
    let mut state = a::load(list)?;
    a::check_store(&state, args)?;
    init(&mut state)?;
    let id = a::string(args, "question_id")?;
    let rev = a::string(args, "expected_revision_id")?;
    let submission = a::string(args, "submission_id")?;
    if uuid::Uuid::parse_str(submission).is_err() {
        return Err(a::error("invalid_request", "submission_id must be a UUID"));
    }
    let f = family(&state, id)?.clone();
    let revision = state["questions"]["revisions"][rev].clone();
    if revision["question_id"] != id {
        return Err(a::error("stale_revision", "Wrong question revision"));
    }
    let outcome = a::string(args, "outcome")?;
    let answer = if outcome == "declined" {
        if args.get("answer").is_some_and(|a| !a.is_null()) {
            return Err(a::error("invalid_answer", "Decline has no answer"));
        }
        Value::Null
    } else if outcome == "answered" {
        validate_answer(&revision, &args["answer"])?
    } else {
        return Err(a::error("invalid_answer", "Choose Send answer or Decline"));
    };
    let input = json!({"store_uuid":args["store_uuid"],"question_id":id,"revision_id":rev,"outcome":outcome,"answer":answer});
    for response in state["questions"]["responses"]
        .as_object()
        .unwrap()
        .values()
    {
        if response["question_id"] == id
            && response["revision_id"] == rev
            && response["submission_id"] == submission
        {
            if response["submission_input"] != input {
                return Err(a::error("idempotency_conflict", "Submission already used"));
            }
            return Ok(
                json!({"question":view(list,&state,id)?,"response":response,"replayed":true}),
            );
        }
    }
    if f["current_revision_id"] != rev {
        return Err(a::error(
            "stale_revision",
            "This question changed. Refresh.",
        ));
    }
    if !available(list, &f) {
        return Err(a::error("task_unavailable", "Task is no longer available"));
    }
    if revision["disposition"] != "pending" {
        return Err(a::error(
            "question_resolved",
            "This question is already resolved. Refresh.",
        ));
    }
    let response_id = a::id();
    let response = json!({"response_id":response_id,"question_id":id,"revision_id":rev,"task_uid":f["task_uid"],"source":f["source"],"outcome":outcome,"answer":answer,"submission_id":submission,"submission_input":input,"submitted_at":store::now(),"submitted_via":"desktop"});
    state["questions"]["responses"][&response_id] = response.clone();
    let revision = &mut state["questions"]["revisions"][rev];
    revision["disposition"] = json!(if outcome == "answered" {
        "answered"
    } else {
        "declined"
    });
    revision["response_id"] = json!(response_id);
    revision["resolved_at"] = json!(store::now());
    a::save(list, &state)?;
    Ok(json!({"question":view(list,&state,id)?,"response":response,"replayed":false}))
}
fn validate_answer(q: &Value, answer: &Value) -> Result<Value, String> {
    let bad = || a::error("invalid_answer", "Choose a valid answer before sending");
    let kind = answer["kind"].as_str().ok_or_else(bad)?;
    if kind == "text" || kind == "custom" {
        if !bounded(&answer["text"], 8000, true)
            || (kind == "text" && q["mode"] != "text")
            || (kind == "custom" && q["allow_custom"] != true)
        {
            return Err(bad());
        }
        return Ok(json!({"kind":kind,"text":answer["text"]}));
    }
    if kind != "choices" || q["mode"] == "text" {
        return Err(bad());
    }
    let ids = answer["option_ids"].as_array().ok_or_else(bad)?;
    let mut seen = HashSet::new();
    let options = q["options"].as_array().ok_or_else(bad)?;
    for id in ids {
        let id = id.as_str().ok_or_else(bad)?;
        if !seen.insert(id) || !options.iter().any(|o| o["id"] == id) {
            return Err(bad());
        }
    }
    if (q["mode"] == "single" && ids.len() != 1)
        || (q["mode"] == "multiple"
            && (ids.len() < (q["min_selected"].as_u64().unwrap_or(0) as usize)
                || ids.len() > (q["max_selected"].as_u64().unwrap_or(0) as usize)))
    {
        return Err(bad());
    }
    let ids: Vec<_> = options
        .iter()
        .filter(|o| o["id"].as_str().is_some_and(|id| seen.contains(id)))
        .map(|o| o["id"].clone())
        .collect();
    Ok(json!({"kind":"choices","option_ids":ids}))
}
pub fn reconcile(list: &mut List) -> Result<(), String> {
    let mut state = a::load(list)?;
    if state.is_null() || state["questions"].as_object().is_none_or(|o| o.is_empty()) {
        return Ok(());
    }
    init(&mut state)?;
    let mut changed = false;
    let unavailable: Vec<_> = state["questions"]["families"]
        .as_object()
        .unwrap()
        .values()
        .filter(|f| !available(list, f))
        .filter_map(|f| f["current_revision_id"].as_str().map(String::from))
        .collect();
    for id in unavailable {
        let r = &mut state["questions"]["revisions"][&id];
        if r["disposition"] == "pending" {
            r["disposition"] = json!("withdrawn");
            r["withdrawal_reason"] = json!("task_unavailable");
            r["resolved_at"] = json!(store::now());
            changed = true;
        }
    }
    if changed {
        a::save(list, &state)?;
    }
    Ok(())
}

// Validate known records before any reader indexes or mutates them. Unknown keys survive.
pub fn validate_storage(state: &Value) -> Result<(), String> {
    let q = &state["questions"];
    if q.is_null() {
        return Ok(());
    }
    let bad = || a::error("invalid_metadata", "Invalid saved question records");
    if !q.is_object() {
        return Err(bad());
    }
    for key in ["families", "revisions", "responses", "receipts"] {
        if q.get(key).is_some_and(|v| !v.is_object()) {
            return Err(bad());
        }
    }
    let mut pending_tasks = HashSet::new();
    for (id, f) in q["families"].as_object().into_iter().flat_map(|o| o.iter()) {
        let revision = f["current_revision_id"].as_str().ok_or_else(bad)?;
        if q["revisions"][revision]["disposition"] == "pending"
            && !pending_tasks.insert(f["task_uid"].to_string())
        {
            return Err(bad());
        }
        if !f.is_object()
            || f["question_id"] != id.as_str()
            || f["task_id_at_creation"].as_i64().is_none()
            || f["task_uid"]
                .as_str()
                .is_none_or(|v| uuid::Uuid::parse_str(v).is_err())
            || a::source(&f["source"]).is_err()
            || q["revisions"][revision]["question_id"] != id.as_str()
        {
            return Err(bad());
        }
    }
    for (id, r) in q["revisions"]
        .as_object()
        .into_iter()
        .flat_map(|o| o.iter())
    {
        if validate(r).is_err()
            || r["revision_id"] != id.as_str()
            || !["pending", "answered", "declined", "withdrawn"]
                .contains(&r["disposition"].as_str().unwrap_or(""))
            || r["question_id"]
                .as_str()
                .is_none_or(|id| !q["families"][id].is_object())
        {
            return Err(bad());
        }
        if ["answered", "declined"].contains(&r["disposition"].as_str().unwrap_or(""))
            && r["response_id"]
                .as_str()
                .is_none_or(|id| !q["responses"][id].is_object())
        {
            return Err(bad());
        }
    }
    let mut submissions = HashSet::new();
    for (id, r) in q["responses"]
        .as_object()
        .into_iter()
        .flat_map(|o| o.iter())
    {
        if !r.is_object()
            || r["response_id"] != id.as_str()
            || !r["submission_input"].is_object()
            || r["submission_id"].as_str().is_none()
            || !r["submitted_at"].is_i64()
            || a::source(&r["source"]).is_err()
            || r["revision_id"]
                .as_str()
                .is_none_or(|id| !q["revisions"][id].is_object())
        {
            return Err(bad());
        }
        let revision = &q["revisions"][r["revision_id"].as_str().ok_or_else(bad)?];
        let family = &q["families"][r["question_id"].as_str().ok_or_else(bad)?];
        if !submissions
            .insert(["question_id", "revision_id", "submission_id"].map(|key| r[key].to_string()))
            || revision["question_id"] != r["question_id"]
            || revision["response_id"] != id.as_str()
            || revision["disposition"] != r["outcome"]
            || family["task_uid"] != r["task_uid"]
            || !a::same_source(&family["source"], &r["source"])
            || (r["outcome"] == "answered" && validate_answer(revision, &r["answer"]).is_err())
            || (r["outcome"] == "declined" && !r["answer"].is_null())
        {
            return Err(bad());
        }
    }
    for (id, r) in q["receipts"].as_object().into_iter().flat_map(|o| o.iter()) {
        if !r.is_object()
            || r["response_id"] != id.as_str()
            || !q["responses"][id].is_object()
            || a::source(&r["source"]).is_err()
        {
            return Err(bad());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (List, Value) {
        let mut list = store::parse("- [ ] Decide @id(1)\n");
        let uid = list.assign_uid(1).unwrap();
        let state = a::initialized(&list).unwrap();
        a::save(&mut list, &state).unwrap();
        let args = json!({"store_uuid":state["store_uuid"],"source":{"client_id":"test","conversation_id":"thread"},"request_id":"publish","task_ref":{"id":1,"uid":uid},"question":{"prompt":"Which option? Exact text.","mode":"single","options":[{"id":"a","label":"First","description":"First details"},{"id":"b","label":"Second"}],"default_option_ids":["a"],"allow_custom":true}});
        (list, args)
    }
    #[test]
    fn publication_defaults_are_not_answers_and_response_requires_explicit_submission() {
        let (mut list, args) = fixture();
        let q = mutate(&mut list, "publish_question", &args).unwrap()["question"].clone();
        assert_eq!(q["revision"]["prompt"], args["question"]["prompt"]);
        assert!(q["response"].is_null());
        assert_eq!(q["revision"]["options"], args["question"]["options"]);
        let answer = json!({"store_uuid":q["store_uuid"],"question_id":q["question_id"],"expected_revision_id":q["revision"]["revision_id"],"submission_id":a::id(),"outcome":"answered","answer":{"kind":"choices","option_ids":["b"]}});
        let result = submit(&mut list, &answer).unwrap();
        let response = &result["response"];
        assert_eq!(result["question"]["revision"]["disposition"], "answered");
        assert!(result["question"]["receipt"].is_null());
        assert_eq!(submit(&mut list, &answer).unwrap()["response"], *response);
        let mut poll = json!({"store_uuid":q["store_uuid"],"source":args["source"]});
        assert_eq!(
            read(&list, "list_question_responses", &poll).unwrap()["responses"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let ack = json!({"store_uuid":q["store_uuid"],"source":args["source"],"request_id":"ack","question_id":q["question_id"],"revision_id":q["revision"]["revision_id"],"response_id":response["response_id"]});
        mutate(&mut list, "acknowledge_question_response", &ack).unwrap();
        assert!(
            read(&list, "list_question_responses", &poll).unwrap()["responses"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        poll["acknowledged"] = json!(true);
        assert_eq!(
            read(&list, "list_question_responses", &poll).unwrap()["responses"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        poll["source"]["conversation_id"] = json!("other");
        assert!(
            read(&list, "list_question_responses", &poll).unwrap()["responses"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn stale_revision_and_removed_task_cannot_be_answered() {
        let (mut list, args) = fixture();
        let q = mutate(&mut list, "publish_question", &args).unwrap()["question"].clone();
        let mut revised = args.clone();
        revised["request_id"] = json!("revise");
        revised["question_id"] = q["question_id"].clone();
        revised["expected_revision_id"] = q["revision"]["revision_id"].clone();
        revised["question"]["prompt"] = json!("Revised");
        let new = mutate(&mut list, "publish_question", &revised).unwrap()["question"].clone();
        let mut answer = json!({"store_uuid":q["store_uuid"],"question_id":q["question_id"],"expected_revision_id":q["revision"]["revision_id"],"submission_id":a::id(),"outcome":"declined"});
        assert!(submit(&mut list, &answer)
            .unwrap_err()
            .contains("stale_revision"));
        list.delete(1);
        reconcile(&mut list).unwrap();
        answer["expected_revision_id"] = new["revision"]["revision_id"].clone();
        assert!(submit(&mut list, &answer)
            .unwrap_err()
            .contains("task_unavailable"));
        let state = a::load(&list).unwrap();
        assert_eq!(
            view(&list, &state, q["question_id"].as_str().unwrap()).unwrap()["revision"]
                ["withdrawal_reason"],
            "task_unavailable"
        );
    }
    #[test]
    fn invalid_choices_and_malformed_saved_question_are_rejected() {
        let (mut list, mut args) = fixture();
        args["question"]["default_option_ids"] = json!(["missing"]);
        assert!(mutate(&mut list, "publish_question", &args).is_err());
        let mut state = a::load(&list).unwrap();
        state["questions"] = json!({"families":{"broken":{"current_revision_id":7}}});
        a::save(&mut list, &state).unwrap();
        assert!(a::load(&list).unwrap_err().contains("invalid_metadata"));
    }
}
