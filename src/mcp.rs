//! `tinytasks mcp` — a tiny stdio MCP server agents use to put tasks on the user's list
//! and to see which ones the user has checked off. Writes go straight into the markdown
//! file; the desktop app watches it and notifies the user.

use crate::{desk, store, agent_state, questions};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

pub fn run() {
    let mut client = String::from("agent");
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();

    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                reply(&mut out, json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":e.to_string()}}));
                continue;
            }
        };
        let Some(id) = msg.get("id").cloned() else { continue }; // notifications need no reply
        let method = msg["method"].as_str().unwrap_or("");
        let params = &msg["params"];

        let result = match method {
            "initialize" => {
                if let Some(name) = params["clientInfo"]["name"].as_str() {
                    client = name.to_string();
                }
                Ok(json!({
                    "protocolVersion": params["protocolVersion"].as_str().unwrap_or("2025-06-18"),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "tinytasks", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": "TinyTasks holds HUMAN actions, not your own execution plan. Discover existing lists with list_lists and tasks with list_tasks_page; reuse/update before creating. Prefer create_tasks with an existing destination_list (Personal by default). Create a list only for an intentional continuing home or explicit user request, with create_list and purpose. Keep source conversation identity separate from destination. Related steps belong as subtasks. Use priority sparingly. Modern writes require source and stable request_id for retries. For legacy tasks use ensure_task_identity with the discovery snapshot. For daily planning call get_desk, begin_desk_planning, report_desk_planning at meaningful working stages within five minutes, then submit_desk_plan; only the human accepts. Optional: publish_question on an existing task when you want the user to answer in TinyTasks; poll list_question_responses and acknowledge receipt. Defaults never submit. There are no native agent hooks or automatic wake-ups. Legacy add_tasks/list_tasks/update_task retain older behavior; prefer the modern tools."
                }))
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": tools() })),
            "tools/call" => Ok(call(&client, params)),
            _ => Err(json!({"code": -32601, "message": format!("method not found: {method}")})),
        };
        let resp = match result {
            Ok(r) => json!({"jsonrpc":"2.0","id":id,"result":r}),
            Err(e) => json!({"jsonrpc":"2.0","id":id,"error":e}),
        };
        reply(&mut out, resp);
    }
}

fn reply(out: &mut impl Write, v: Value) {
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

fn tools() -> Value {
    let mut tools = json!([
        {
            "name": "add_tasks",
            "description": "Legacy tool; prefer create_tasks to avoid accidental list creation. Put action items for the USER (the human) on their TinyTasks desktop list. \
                Call this whenever you hand the user something they must do themselves (e.g. 'Approve the PR', \
                'Add the STRIPE_KEY secret in Vercel'), so it doesn't get lost as the chat scrolls. \
                Not for your own todo items. The user gets a desktop notification. \
                Use priority sparingly and prefer the actual originating conversation title for chat. \
                Group related steps under a parent task rather than creating a flat list; keep independent actions separate. \
                Set parent_id to append subtasks to an existing top-level task in the array's order. \
                Use ordered=true for numbered steps; otherwise subtasks are a checklist.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tasks": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": { "type": "string", "description": "Short imperative action, under ~80 chars." },
                                "details": { "type": "string", "description": "Optional context: why, exact steps, commands, values. Shown when the user opens the task." },
                                "link": { "type": "string", "description": "Optional URL back to where this came up (conversation, thread, PR, ticket). Overrides the top-level link." },
                                "priority": { "type": "integer", "enum": [0, 1, 2, 3], "description": "Optional urgency: 0 = drop everything, 1 = today, 2 = soon, 3 = whenever. Use sparingly; omit by default. Set only for clear urgency or an explicit user request." },
                                "due": { "type": "string", "description": "Optional due date, YYYY-MM-DD. Only when there's a real deadline." },
                                "mydesk": { "type": "boolean", "description": "Optional. Put it straight on the user's desk (what they focus on today)." }
                            },
                            "required": ["title"]
                        }
                    },
                    "parent_id": { "type": "integer", "description": "Optional existing top-level task ID. Every item becomes its subtask; chat and default link come from the parent. One level only." },
                    "ordered": { "type": "boolean", "description": "Optional subtask mode: true = numbered steps, false = checklist. Applies to parent_id when supplied, otherwise to each new top-level task." },
                    "chat": { "type": "string", "description": "Use the actual originating conversation title whenever available; reuse it for calls in that conversation. If unavailable, use a concise descriptive fallback. Omit when adding subtasks via parent_id." },
                    "link": { "type": "string", "description": "Optional URL back to this conversation, applied to every task." },
                    "agent": { "type": "string", "description": "Optional. Which agent you are; normally detected automatically, so leave it out." }
                },
                "required": ["tasks"]
            }
        },
        {
            "name": "list_tasks",
            "description": "List tasks on the user's TinyTasks list and whether they've checked them off \
                (finished tasks from the last two weeks), most urgent first. Call this when resuming work or before \
                relying on the user having done something. Tasks with an empty `agent` are ones the user added \
                themselves; `mydesk` means it's on their desk (what they're focusing on today; the desk clears overnight). \
                Subtasks have parent_id and a zero-based position. Set parent_id to get all siblings in their saved order, \
                including older completed steps, before calling reorder_subtasks.",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": { "type": "string", "enum": ["open", "done", "all"], "description": "Default: all." },
                    "chat": { "type": "string", "description": "Only tasks whose chat name contains this text (case-insensitive)." },
                    "desk": { "type": "boolean", "description": "Only tasks on the user's desk." },
                    "parent_id": { "type": "integer", "description": "Only this parent's subtasks, in position order. Default status=all; no age or count cutoff." }
                }
            }
        },
        {
            "name": "update_task",
            "description": "Edit a task on the user's list (any task, including ones the user added): \
                reword the title, add details or a link, set the chat, priority or due date, or put it on or take \
                it off the user's desk. Only the fields you pass change.",
            "annotations": { "idempotentHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "integer" },
                    "title": { "type": "string" },
                    "details": { "type": "string" },
                    "link": { "type": "string" },
                    "chat": { "type": "string", "description": "Prefer the actual originating conversation title; use a concise descriptive fallback only if unavailable." },
                    "priority": { "type": ["integer", "null"], "enum": [0, 1, 2, 3, null], "description": "Use priority sparingly, only for clear urgency or an explicit user request. 0 = most urgent ... 3 = whenever; null clears it. Omit to preserve the current value." },
                    "due": { "type": ["string", "null"], "description": "YYYY-MM-DD; null clears it." },
                    "mydesk": { "type": "boolean", "description": "On the user's desk (for today) or not." },
                    "ordered": { "type": "boolean", "description": "For a top-level task: show its subtasks as numbered steps (true) or a checklist (false). Preserves their saved order." }
                },
                "required": ["id"]
            }
        },
        {
            "name": "reorder_subtasks",
            "description": "Set a parent's complete subtask order. Pass every current child ID exactly once, including completed children. Use list_tasks with parent_id first. Rejects stale, missing, duplicate or unrelated IDs without changing the file. Applies to checklists and numbered steps alike.",
            "annotations": { "idempotentHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "parent_id": { "type": "integer" },
                    "ids": { "type": "array", "items": { "type": "integer" }, "uniqueItems": true }
                },
                "required": ["parent_id", "ids"]
            }
        },
        {
            "name": "get_desk",
            "description": "Read the user's local date, accepted My Desk items, and any pending suggestion. Times and durations belong only to today's Desk and do not affect due dates or lists. Call before suggesting an arrangement, and use list_tasks for the task titles and details.",
            "annotations": { "readOnlyHint": true },
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "suggest_desk",
            "description": "Suggest the complete arrangement for today's My Desk using existing open tasks or subtasks. Read get_desk first for the local date and current arrangement. Replaces a pending suggestion, never the accepted desk. The user reviews the whole plan with Accept/Decline. Keep the plan realistic; start is HH:MM, duration is optional minutes, and neither changes a due date. An empty items array proposes clearing the desk. Suggestions expire overnight.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "date": { "type": "string", "description": "The local YYYY-MM-DD returned by get_desk. Must be today." },
                    "items": { "type": "array", "maxItems": 200, "items": {
                        "type": "object", "additionalProperties": false,
                        "properties": {
                            "id": { "type": "integer", "description": "Existing open task or subtask ID. Each ID appears once." },
                            "start": { "type": ["string", "null"], "description": "HH:MM in the user's local time; omit or null to leave unscheduled." },
                            "duration": { "type": ["integer", "null"], "minimum": 1, "maximum": 1440, "description": "Optional minutes. Requires start and must end within the same day." }
                        }, "required": ["id"]
                    } },
                    "agent": { "type": "string", "description": "Optional display name; normally detected from the MCP client." }
                },
                "required": ["date", "items"]
            }
        },
        {
            "name": "set_desk",
            "description": "Compatibility shortcut: suggest these open task IDs for today's My Desk without times. This now creates a pending suggestion for the user's Accept/Decline; it does not directly replace the accepted desk. Prefer get_desk and suggest_desk for timed arrangements. An empty list proposes clearing the desk.",
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "integer" } } },
                "required": ["ids"]
            }
        },
        {
            "name": "complete_tasks",
            "description": "Check tasks off for the user. Completing a parent also completes its remaining subtasks. Completing an individual subtask updates the parent's progress; it does not automatically complete the parent.",
            "annotations": { "idempotentHint": true },
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "integer" } } },
                "required": ["ids"]
            }
        },
        {
            "name": "remove_tasks",
            "description": "Delete tasks that were added by mistake or are no longer needed. Deleting a parent also deletes its subtasks.",
            "annotations": { "destructiveHint": true },
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "integer" } } },
                "required": ["ids"]
            }
        }
    ]);
    tools.as_array_mut().unwrap().extend(modern_tools());
    tools
}

fn text(s: impl Into<String>, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": s.into() }], "isError": is_error })
}

fn call(client: &str, params: &Value) -> Value {
    let args = &params["arguments"];
    let name = params["name"].as_str().unwrap_or("");
    if modern_tools().iter().any(|t| t["name"] == name) {
        let result = match name {
            "list_lists" | "list_tasks_page" => store::load().and_then(|l| agent_state::discovery(&l,name,args)),
            "get_question" | "list_question_responses" => store::load().and_then(|l| questions::read(&l,name,args)),
            "publish_question" | "withdraw_question" | "acknowledge_question_response" => store::change(|l|questions::mutate(l,name,args)),
            "begin_desk_planning" | "report_desk_planning" | "submit_desk_plan" => store::change(|l|desk::plan_mutation(l,name,args,client)),
            _ => store::change(|l|agent_state::mutate(l,name,args,client)),
        };
        return match result { Ok(v) => { if !["list_lists","list_tasks_page","get_question","list_question_responses"].contains(&name) {crate::launch::ensure_app_running();} text(v.to_string(),false) }, Err(e) => text(if serde_json::from_str::<Value>(&e).is_ok(){e}else{agent_state::error("write_failed",&e)},true) };
    }
    let res: Result<String, String> = match name {
        "add_tasks" => add_tasks(client, args),
        "list_tasks" => store::load().and_then(|list| {
            let status = args["status"].as_str().unwrap_or("all");
            let desk = args["desk"].as_bool().unwrap_or(false);
            let selected = if let Some(parent) = args.get("parent_id") {
                let parent_id = id_of(parent).ok_or("`parent_id` must be a task id")?;
                if list.get(parent_id).is_none() { return Err("The parent task is gone.".into()); }
                list.children(parent_id).into_iter().filter(|t| match status {
                    "open" => t.done_at.is_none(), "done" => t.done_at.is_some(), _ => true,
                }).filter(|t| !desk || t.mydesk).collect()
            } else { store::for_agents(&list, status, args["chat"].as_str(), desk) };
            let items: Vec<Value> = selected
                .iter()
                .map(|t| {
                    json!({
                        "id": t.id,
                        "title": t.title,
                        "status": if t.done_at.is_some() { "done" } else { "open" },
                        "priority": t.priority,
                        "due": t.due,
                        "mydesk": t.mydesk,
                        "chat": t.chat,
                        "agent": t.agent,
                        "details": t.details,
                        "link": t.link,
                        "parent_id": t.parent_id,
                        "position": t.position,
                        "ordered": t.ordered,
                    })
                })
                .collect();
            Ok(serde_json::to_string_pretty(&items).unwrap_or_default())
        }),
        "update_task" => update_task(args),
        "reorder_subtasks" => reorder_subtasks(args),
        "get_desk" => store::load().and_then(|list| desk::snapshot(&list)).and_then(|snapshot| serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())),
        "suggest_desk" => suggest_desk(client, args),
        "set_desk" => set_desk(client, args),
        "complete_tasks" => for_ids(args, |l, id| l.set_done(id, true), "Checked off"),
        "remove_tasks" => for_ids(args, |l, id| l.delete(id), "Removed"),
        other => Err(format!("unknown tool: {other}")),
    };
    match res {
        Ok(s) => text(s, false),
        Err(e) => text(e, true),
    }
}

fn add_tasks(client: &str, args: &Value) -> Result<String, String> {
    let tasks = args["tasks"].as_array().filter(|a| !a.is_empty()).ok_or("`tasks` must be a non-empty array")?;
    let agent = args["agent"].as_str().map(str::trim).filter(|s| !s.is_empty()).unwrap_or(client);
    let chat = args["chat"].as_str().map(str::trim).unwrap_or("");
    let default_link = args["link"].as_str().unwrap_or("");
    let parent_id = args.get("parent_id").map(|v| id_of(v).ok_or("`parent_id` must be a task id")).transpose()?;
    let ordered = args.get("ordered").map(|v| v.as_bool().ok_or("`ordered` must be true or false")).transpose()?;
    // Validate the whole batch first, so a bad item doesn't leave half of it saved
    // (and duplicated when the agent retries).
    let mut batch = Vec::new();
    for t in tasks {
        let title = t["title"].as_str().map(str::trim).filter(|s| !s.is_empty()).ok_or("every task needs a `title`")?;
        let priority = match &t["priority"] {
            Value::Null => None,
            v => Some(v.as_i64().filter(|p| store::valid_priority(*p)).ok_or("`priority` must be 0, 1, 2 or 3")?),
        };
        let due = match &t["due"] {
            Value::Null => None,
            v => Some(v.as_str().filter(|d| store::valid_due(d)).ok_or("`due` must be a date like 2026-11-06")?),
        };
        let link = t["link"].as_str().unwrap_or(default_link);
        let details = t["details"].as_str().unwrap_or("");
        let mydesk = t["mydesk"].as_bool().unwrap_or(false);
        batch.push(store::NewTask { title, details, agent, chat, link, priority, due, mydesk });
    }
    let added = store::change(|list| {
        if let (Some(parent), Some(ordered)) = (parent_id, ordered) { list.set_subtask_mode(parent, ordered)?; }
        let mut added = Vec::new();
        for new in batch {
            let title = new.title;
            let id = if let Some(parent) = parent_id { list.add_subtask(parent, new)? } else { list.add(new) };
            if parent_id.is_none() {
                if let Some(ordered) = ordered { list.set_subtask_mode(id, ordered)?; }
            }
            added.push(format!("#{id} {title}"));
        }
        Ok(added)
    })?;
    crate::launch::ensure_app_running();
    Ok(format!(
        "Added {} task(s) to the user's list:\n{}\nUse list_tasks later to see which ones they've checked off.",
        added.len(),
        added.join("\n")
    ))
}

fn update_task(args: &Value) -> Result<String, String> {
    let id = id_of(&args["id"]).ok_or("`id` must be a task id")?;
    let field = |k: &str| args[k].as_str().map(str::trim);
    if field("title") == Some("") {
        return Err("`title` can't be empty".into());
    }
    let priority = match args.get("priority") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(v) => Some(Some(v.as_i64().filter(|p| store::valid_priority(*p)).ok_or("`priority` must be 0-3 or null")?)),
    };
    let due = match args.get("due") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(v) => Some(Some(v.as_str().filter(|d| store::valid_due(d)).ok_or("`due` must be a date like 2026-11-06, or null")?)),
    };
    let changes = store::Changes {
        agent: None,
        title: field("title"),
        details: field("details"),
        link: field("link"),
        chat: field("chat"),
        priority,
        due,
        mydesk: args["mydesk"].as_bool(),
    };
    let ordered = args.get("ordered").map(|v| v.as_bool().ok_or("`ordered` must be true or false")).transpose()?;
    if store::change(|list| {
        if let Some(ordered) = ordered { list.set_subtask_mode(id, ordered)?; }
        Ok(list.update(id, changes))
    })? {
        Ok(format!("Updated #{id}."))
    } else {
        Err(format!("No task #{id}."))
    }
}

fn reorder_subtasks(args: &Value) -> Result<String, String> {
    let parent_id = id_of(&args["parent_id"]).ok_or("`parent_id` must be a task id")?;
    let ids = args["ids"].as_array().ok_or("`ids` must be an array")?.iter()
        .map(|v| id_of(v).ok_or("Every item in `ids` must be a task id"))
        .collect::<Result<Vec<_>, _>>()?;
    store::change(|list| list.reorder_subtasks(parent_id, &ids))?;
    Ok(format!("Reordered subtasks of #{parent_id}."))
}

fn suggest_desk(client: &str, args: &Value) -> Result<String, String> {
    let date = args["date"].as_str().ok_or("`date` must be the local date from get_desk")?;
    let items: Vec<desk::Item> = serde_json::from_value(args["items"].clone()).map_err(|e| format!("Invalid arrangement: {e}"))?;
    let agent = args["agent"].as_str().filter(|s| !s.trim().is_empty()).unwrap_or(client);
    store::change(|list| desk::legacy_suggest(list, date, agent, items))?;
    crate::launch::ensure_app_running();
    Ok("Suggested an arrangement for today's My Desk. It is waiting for the user's Accept/Decline; the accepted desk and due dates are unchanged.".into())
}

fn set_desk(client: &str, args: &Value) -> Result<String, String> {
    let items = args["ids"].as_array().ok_or("`ids` must be an array")?.iter()
        .map(|v| id_of(v).map(|id| desk::Item { id, start: None, duration: None }).ok_or("Every item in `ids` must be a task id"))
        .collect::<Result<Vec<_>, _>>()?;
    store::change(|list| desk::legacy_suggest(list, &store::today(), client, items))?;
    crate::launch::ensure_app_running();
    Ok("Suggested these tasks for today's My Desk. Waiting for the user's Accept/Decline.".into())
}

/// Accepts 12, "12" and "#12" (add_tasks reports ids as "#12").
fn id_of(v: &Value) -> Option<i64> {
    v.as_i64().or_else(|| v.as_str()?.trim().trim_start_matches('#').parse().ok())
}

fn for_ids(args: &Value, f: impl Fn(&mut store::List, i64) -> bool, verb: &str) -> Result<String, String> {
    let ids: Vec<i64> = args["ids"].as_array().ok_or("`ids` must be an array")?.iter().filter_map(id_of).collect();
    let hit = store::change(|list| Ok(ids.iter().filter(|id| f(list, **id)).map(|id| format!("#{id}")).collect::<Vec<_>>()))?;
    Ok(if hit.is_empty() { "No matching tasks.".into() } else { format!("{verb}: {}", hit.join(", ")) })
}

fn modern_tools()->Vec<Value>{
    let string=json!({"type":"string"});let reference=json!({"type":"object","properties":{"id":{"type":"integer"},"uid":{"type":"string"}},"required":["id","uid"]});
    let source=json!({"type":"object","properties":{"client_id":{"type":"string","maxLength":200},"conversation_id":{"type":"string","maxLength":500},"title":{"type":"string","maxLength":500},"url":{"type":"string","maxLength":2048}},"required":["client_id","conversation_id"]});
    let question=json!({"type":"object","properties":{"prompt":{"type":"string","maxLength":4000},"mode":{"enum":["single","multiple","text"]},"options":{"type":"array","maxItems":12,"items":{"type":"object","properties":{"id":string,"label":string,"description":string},"required":["id","label"]}},"min_selected":{"type":"integer","minimum":0},"max_selected":{"type":"integer","minimum":1},"allow_custom":{"type":"boolean"},"default_option_ids":{"type":"array","items":string},"recommended_option_id":string,"default_text":string},"required":["prompt","mode"]});
    let task=json!({"type":"object","properties":{"title":string,"details":string,"link":string,"priority":{"type":["integer","null"],"enum":[0,1,2,3,null]},"due":{"type":["string","null"]},"mydesk":{"type":"boolean"}},"required":["title"]});
    let mut result=vec![];
    let mut add=|name:&str,description:&str,props:Value,required:Vec<&str>,write:bool|{
        let mut props=props;let mut required=required;
        if write {props["source"]=source.clone();props["request_id"]=string.clone();required.extend(["source","request_id"]);}
        result.push(json!({"name":name,"description":description,"annotations":{"readOnlyHint":!write},"inputSchema":{"type":"object","properties":props,"required":required}}));
    };
    add("list_lists","Discover all lists including empty lists. Reuse an existing list; Personal has name empty string.",json!({"limit":{"type":"integer","minimum":1,"maximum":200},"cursor":string}),vec![],false);
    add("list_tasks_page","Complete paginated discovery, including old completions. Exact list_name, stable UID and snapshot revision. Restart on stale_cursor.",json!({"status":{"enum":["all","open","done"]},"list_name":string,"parent_id":{"type":"integer"},"desk":{"type":"boolean"},"limit":{"type":"integer","minimum":1,"maximum":200},"cursor":string}),vec![],false);
    add("ensure_task_identity","Allocate immutable identity for a legacy task using the current discovery snapshot. Reread discovery after writes.",json!({"task_id":{"type":"integer"},"expected_snapshot_revision":string}),vec!["task_id","expected_snapshot_revision"],true);
    add("create_list","Explicitly create or reuse a list for a continuing purpose or user request. Do not make a list per conversation.",json!({"name":string,"purpose":string}),vec!["name","purpose"],true);
    add("create_tasks","Create human actions in an existing destination list. Omit destination_list for Personal. Unknown list is an error. Related steps use parent_ref. Retry with identical request_id/input.",json!({"destination_list":string,"parent_ref":reference,"ordered":{"type":"boolean"},"tasks":{"type":"array","minItems":1,"maxItems":200,"items":task}}),vec!["tasks"],true);
    let mut changes=task.clone();changes.as_object_mut().unwrap().remove("required");changes["properties"]["destination_list"]=string.clone();changes["properties"]["ordered"]=json!({"type":"boolean"});changes["properties"]["origin_source"]=json!({"anyOf":[source.clone(),{"type":"null"}]});
    add("update_task_v2","Update a discovered task with UID and snapshot guard. Source attribution and list destination are separate. Prefer updating over duplicate tasks.",json!({"task_ref":reference,"expected_snapshot_revision":string,"changes":changes}),vec!["task_ref","expected_snapshot_revision","changes"],true);
    add("begin_desk_planning","Explicitly start planning today. Shows Building for five minutes; does not change the accepted desk or pending suggestion.",json!({"date":string,"agent":string}),vec!["date"],true);
    add("report_desk_planning","Report actual work or failure on the current run. New logical heartbeat needs a new request_id. No idle heartbeats.",json!({"date":string,"run_id":string,"status":{"enum":["working","failed"]},"message":{"type":"string","maxLength":240}}),vec!["date","run_id","status"],true);
    let mut item=reference.clone();item["properties"]["start"]=json!({"type":["string","null"]});item["properties"]["duration"]=json!({"type":["integer","null"],"minimum":1,"maximum":1440});
    add("submit_desk_plan","Submit a complete reviewable plan for the current run with stable task UIDs. Only the human accepts.",json!({"date":string,"run_id":string,"items":{"type":"array","maxItems":200,"items":item}}),vec!["date","run_id","items"],true);
    add("publish_question","Optional: ask the human a question in an existing task's details. Single/multiple choice or text; defaults never submit. Poll responses later. No native host hooks or wake-up.",json!({"store_uuid":string,"task_ref":reference,"question":question,"question_id":string,"expected_revision_id":string}),vec!["store_uuid","task_ref","question"],true);
    add("get_question","Read a question from its originating source. Does not acknowledge receipt.",json!({"store_uuid":string,"source":source,"question_id":string}),vec!["store_uuid","source","question_id"],false);
    add("list_question_responses","Poll your source's saved human answers, unacknowledged by default. Fetching does not mark received. Retains answered prompt/options.",json!({"store_uuid":string,"source":source,"acknowledged":{"type":"boolean"},"limit":{"type":"integer","minimum":1,"maximum":100},"cursor":string}),vec!["store_uuid","source"],false);
    add("acknowledge_question_response","Acknowledge an exact response after consuming it. TinyTasks then shows Received by agent.",json!({"store_uuid":string,"question_id":string,"revision_id":string,"response_id":string}),vec!["store_uuid","question_id","revision_id","response_id"],true);
    add("withdraw_question","Withdraw a pending question without deleting previous answer history.",json!({"store_uuid":string,"question_id":string,"expected_revision_id":string}),vec!["store_uuid","question_id","expected_revision_id"],true);
    result
}
