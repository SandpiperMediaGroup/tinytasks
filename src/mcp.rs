//! `tinytasks mcp` — a tiny stdio MCP server agents use to put tasks on the user's list
//! and to see which ones the user has checked off. Writes go straight into the markdown
//! file; the desktop app watches it and notifies the user.

use crate::store;
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
                    "instructions": "TinyTasks is the user's desktop to-do list for things THEY must do. \
                        Whenever you ask the user to do something you cannot do yourself, add it with add_tasks. \
                        Use list_tasks to see what they have checked off before relying on it. \
                        When the user asks what to focus on, pick a few open tasks and put them on their desk with set_desk."
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
    json!([
        {
            "name": "add_tasks",
            "description": "Put action items for the USER (the human) on their TinyTasks desktop list. \
                Call this whenever you hand the user something they must do themselves (e.g. 'Approve the PR', \
                'Add the STRIPE_KEY secret in Vercel'), so it doesn't get lost as the chat scrolls. \
                Not for your own todo items. The user gets a desktop notification.",
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
                                "priority": { "type": "integer", "enum": [0, 1, 2, 3], "description": "Optional urgency: 0 = drop everything, 1 = today, 2 = soon, 3 = whenever. Leave out if unsure." },
                                "due": { "type": "string", "description": "Optional due date, YYYY-MM-DD. Only when there's a real deadline." },
                                "mydesk": { "type": "boolean", "description": "Optional. Put it straight on the user's desk (what they focus on today)." }
                            },
                            "required": ["title"]
                        }
                    },
                    "chat": { "type": "string", "description": "The name of this conversation as the user would recognize it: its title if you know it, otherwise 2-5 words on what you're working on together (e.g. 'Stripe billing setup'). Tasks are grouped by this, so reuse the same name for every call in this conversation." },
                    "link": { "type": "string", "description": "Optional URL back to this conversation, applied to every task." },
                    "agent": { "type": "string", "description": "Optional. Which agent you are; normally detected automatically, so leave it out." }
                },
                "required": ["tasks", "chat"]
            }
        },
        {
            "name": "list_tasks",
            "description": "List tasks on the user's TinyTasks list and whether they've checked them off \
                (finished tasks from the last two weeks), most urgent first. Call this when resuming work or before \
                relying on the user having done something. Tasks with an empty `agent` are ones the user added \
                themselves; `mydesk` means it's on their desk (what they're focusing on today; the desk clears overnight).",
            "annotations": { "readOnlyHint": true },
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": { "type": "string", "enum": ["open", "done", "all"], "description": "Default: all." },
                    "chat": { "type": "string", "description": "Only tasks whose chat name contains this text (case-insensitive)." },
                    "desk": { "type": "boolean", "description": "Only tasks on the user's desk." }
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
                    "chat": { "type": "string" },
                    "priority": { "type": ["integer", "null"], "enum": [0, 1, 2, 3, null], "description": "0 = most urgent ... 3 = whenever; null clears it." },
                    "due": { "type": ["string", "null"], "description": "YYYY-MM-DD; null clears it." },
                    "mydesk": { "type": "boolean", "description": "On the user's desk (for today) or not." }
                },
                "required": ["id"]
            }
        },
        {
            "name": "set_desk",
            "description": "Decide what's on the user's desk: the few open tasks they should focus on today. \
                Replaces whatever was there; the desk clears overnight. Use it when the user asks what to focus on or what's next; \
                usually 1-5 tasks. An empty list clears the desk.",
            "annotations": { "idempotentHint": true },
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "integer" } } },
                "required": ["ids"]
            }
        },
        {
            "name": "complete_tasks",
            "description": "Check tasks off for the user, e.g. when they tell you in chat that they've done them.",
            "annotations": { "idempotentHint": true },
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "integer" } } },
                "required": ["ids"]
            }
        },
        {
            "name": "remove_tasks",
            "description": "Delete tasks that were added by mistake or are no longer needed.",
            "annotations": { "destructiveHint": true },
            "inputSchema": {
                "type": "object",
                "properties": { "ids": { "type": "array", "items": { "type": "integer" } } },
                "required": ["ids"]
            }
        }
    ])
}

fn text(s: impl Into<String>, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": s.into() }], "isError": is_error })
}

fn call(client: &str, params: &Value) -> Value {
    let args = &params["arguments"];
    let res: Result<String, String> = match params["name"].as_str().unwrap_or("") {
        "add_tasks" => add_tasks(client, args),
        "list_tasks" => store::load().map(|list| {
            let status = args["status"].as_str().unwrap_or("all");
            let desk = args["desk"].as_bool().unwrap_or(false);
            let items: Vec<Value> = store::for_agents(&list, status, args["chat"].as_str(), desk)
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
                    })
                })
                .collect();
            serde_json::to_string_pretty(&items).unwrap_or_default()
        }),
        "update_task" => update_task(args),
        "set_desk" => set_desk(args),
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
        Ok(batch
            .into_iter()
            .map(|new| {
                let title = new.title;
                format!("#{} {title}", list.add(new))
            })
            .collect::<Vec<_>>())
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
        title: field("title"),
        details: field("details"),
        link: field("link"),
        chat: field("chat"),
        priority,
        due,
        mydesk: args["mydesk"].as_bool(),
    };
    if store::change(|list| Ok(list.update(id, changes)))? {
        Ok(format!("Updated #{id}."))
    } else {
        Err(format!("No task #{id}."))
    }
}

fn set_desk(args: &Value) -> Result<String, String> {
    let ids: Vec<i64> = args["ids"].as_array().ok_or("`ids` must be an array")?.iter().filter_map(id_of).collect();
    let on_desk = store::change(|list| {
        let open: Vec<i64> = ids.iter().copied().filter(|id| list.get(*id).is_some_and(|t| t.done_at.is_none())).collect();
        list.set_desk(&open);
        Ok(open)
    })?;
    Ok(match on_desk.len() {
        0 => "The desk is clear.".into(),
        _ => format!("On the desk: {}", on_desk.iter().map(|id| format!("#{id}")).collect::<Vec<_>>().join(", ")),
    })
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
