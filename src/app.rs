//! The desktop window + tray icon. Watches the task file for changes (from agents, or from
//! another computer through a synced folder), pops a notification, keeps the tray badge current.

use crate::store::{self, Task};
use crate::{desk, launch, notify, trayicon};
use std::collections::HashSet;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_dialog::DialogExt;

type Res<T> = Result<T, String>;

pub fn run(background: bool) {
    notify::init_process();

    let builder = tauri::Builder::default()
        // Must be first: a second launch just focuses the running app (or does nothing
        // when the MCP server launches us with --background).
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // An agent asking for a quiet launch (flag or marker) mustn't pop the window up.
            if launch::quiet_requested() {
                launch::clear_quiet_request();
            } else if !args.iter().any(|a| a == "--background") {
                show(app);
            }
        }))
        .plugin(tauri_plugin_dialog::init());
    #[cfg(not(windows))]
    let builder = builder.plugin(tauri_plugin_notification::init());

    builder
        .invoke_handler(tauri::generate_handler![
            list, add_task, edit_task, set_done, set_priority, set_due, set_desk, delete_task, open_link, open_note,
            location, pick_folder, open_file, list_note, add_subtask, set_subtask_mode, reorder_subtasks, close_note, drag_note, open_about_link,
            open_settings, close_settings, list_chats, create_list, rename_list, archive_list, delete_list,
            ensure_sidebar_visible, app_info, check_for_updates, get_desk, review_desk, edit_desk_time, add_to_desk, set_work_hours
        ])
        .setup(move |app| {
            launch::clear_quiet_request();
            launch::heartbeat();
            let identity_just_registered = notify::init(app.handle());
            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "Show TinyTasks", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quit TinyTasks", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::with_id("main")
                .icon(badge(0))
                .tooltip("TinyTasks")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            if !background {
                show(app.handle());
            }
            watch(app.handle().clone(), identity_just_registered);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window just tucks it away; quit from the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building TinyTasks")
        .run(|_app, event| match event {
            // However we exit (tray, Cmd+Q, logoff), tell agents we're gone so they relaunch us.
            tauri::RunEvent::Exit => launch::stopped(),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show(_app),
            _ => {}
        });
}

pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn badge(count: usize) -> Image<'static> {
    let (rgba, w, h) = trayicon::render(count as i64);
    Image::new_owned(rgba, w, h)
}

/// Refresh the tray icon, tooltip and window title with the open count.
fn update_badge(app: &AppHandle, list: &store::List) {
    let n = list.open_count();
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_icon(Some(badge(n)));
        let tip = match n {
            0 => "TinyTasks — all clear".to_string(),
            1 => "TinyTasks — 1 thing to do".to_string(),
            n => format!("TinyTasks — {n} things to do"),
        };
        let _ = tray.set_tooltip(Some(tip));
    }
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_title(&if n > 0 { format!("TinyTasks ({n})") } else { "TinyTasks".into() });
    }
}

/// Background thread: polls the file's size and modified time (cheap, and works for synced
/// and network drives where change notifications don't), and reacts when they move.
fn watch(app: AppHandle, identity_just_registered: bool) {
    std::thread::spawn(move || {
        if identity_just_registered {
            std::thread::sleep(Duration::from_secs(4)); // let Windows index the new shortcut
        }
        let mut last = None;
        let mut ticks = 0u32;
        loop {
            ticks += 1;
            if ticks % 7 == 0 {
                launch::heartbeat(); // ~every 5s; lets agents know we're running
            }
            let path = store::path();
            let stamp = std::fs::metadata(&path).ok().map(|m| (m.modified().ok(), m.len()));
            let now = Some((path, stamp, store::today()));
            if now != last {
                last = now;
                // Give tasks typed straight into the file their ids and dates (writes only if needed).
                let _ = store::change(desk::rollover);
                if let Ok(list) = store::load() {
                    notify::new_tasks(&app, &unseen(&list));
                    update_badge(&app, &list);
                }
                let _ = app.emit("tasks-changed", ());
            }
            std::thread::sleep(Duration::from_millis(700));
        }
    });
}

/// Agents' tasks this computer hasn't announced yet. Remembered per computer (in
/// `~/.tinytasks/notified`), so with a synced file each machine notifies once.
fn unseen(list: &store::List) -> Vec<Task> {
    let state = store::data_dir().join("notified");
    let file = store::path().to_string_lossy().into_owned();
    let key = |t: &Task| format!("{}:{}", t.id, t.created_at);
    let saved = std::fs::read_to_string(&state).unwrap_or_default();
    let mut lines = saved.lines();
    let from_agents: Vec<&Task> = list.tasks().filter(|t| !t.agent.is_empty()).collect();
    let seen: HashSet<String> = if lines.next() == Some(file.as_str()) {
        lines.map(String::from).collect()
    } else {
        // A new file: don't announce its whole history, only what just arrived.
        let recent = store::now() - 120;
        from_agents.iter().filter(|t| t.created_at < recent).map(|t| key(t)).collect()
    };
    let new: Vec<Task> =
        from_agents.iter().filter(|t| t.done_at.is_none() && !seen.contains(&key(t))).map(|t| (*t).clone()).collect();
    let all: Vec<String> = from_agents.iter().map(|t| key(t)).collect();
    let out = std::iter::once(file).chain(all).collect::<Vec<_>>().join("\n");
    if out != saved {
        let _ = std::fs::write(&state, out);
    }
    new
}

// ---- commands the window calls ----

/// Reloads after a change so the window, badge and file agree.
fn reply(app: &AppHandle) -> Res<Vec<Task>> {
    let list = store::load()?;
    update_badge(app, &list);
    let _ = app.emit("tasks-changed", ());
    Ok(store::for_ui(&list))
}

#[tauri::command]
fn list() -> Res<Vec<Task>> {
    Ok(store::for_ui(&store::load()?))
}

#[tauri::command]
fn get_desk() -> Res<desk::Snapshot> {
    desk::snapshot(&store::load()?)
}

fn desk_reply(app: &AppHandle) -> Res<desk::Snapshot> {
    let list = store::load()?;
    update_badge(app, &list);
    let _ = app.emit("tasks-changed", ());
    desk::snapshot(&list)
}

#[tauri::command]
fn review_desk(app: AppHandle, date: String, proposal_id: String, accept: bool) -> Res<desk::Snapshot> {
    store::change(|list| desk::review(list, &date, &proposal_id, accept))?;
    desk_reply(&app)
}

#[tauri::command]
fn edit_desk_time(app: AppHandle, date: String, item: desk::Item, proposal_id: Option<String>) -> Res<desk::Snapshot> {
    store::change(|list| desk::edit_time(list, &date, item, proposal_id.as_deref()))?;
    desk_reply(&app)
}

#[tauri::command]
fn add_to_desk(app: AppHandle, date: String, id: i64, proposal_id: Option<String>) -> Res<desk::Snapshot> {
    store::change(|list| desk::add_item(list, &date, id, proposal_id.as_deref()))?;
    desk_reply(&app)
}

#[tauri::command]
fn set_work_hours(app: AppHandle, start: String, end: String) -> Res<desk::Snapshot> {
    store::change(|list| desk::set_hours(list, &start, &end))?;
    desk_reply(&app)
}

/// A note remains readable after completion, including beyond the list's retention window.
#[tauri::command]
fn list_note(id: i64) -> Res<Vec<Task>> {
    Ok(store::load()?.note_tasks(id))
}

#[tauri::command]
fn add_subtask(app: AppHandle, parent_id: i64, title: String) -> Res<Vec<Task>> {
    let title = title.trim();
    if title.is_empty() { return Err("A subtask needs a title.".into()); }
    store::change(|l| l.add_subtask(parent_id, store::NewTask {
        title, details: "", agent: "", chat: "", link: "", priority: None, due: None, mydesk: false,
    }))?;
    reply(&app)
}

#[tauri::command]
fn set_subtask_mode(app: AppHandle, id: i64, ordered: bool) -> Res<Vec<Task>> {
    store::change(|l| l.set_subtask_mode(id, ordered))?;
    reply(&app)
}

#[tauri::command]
fn reorder_subtasks(app: AppHandle, parent_id: i64, ids: Vec<i64>) -> Res<Vec<Task>> {
    store::change(|l| l.reorder_subtasks(parent_id, &ids))?;
    reply(&app)
}

/// User entry keeps the selected list and view's default due date, with no agent notification.
#[tauri::command]
fn add_task(app: AppHandle, title: String, mydesk: bool, chat: Option<String>, due: Option<String>) -> Res<Vec<Task>> {
    let title = title.trim();
    if due.as_deref().is_some_and(|d| !store::valid_due(d)) { return Err("due must be YYYY-MM-DD".into()); }
    if !title.is_empty() {
        store::change(|l| {
            let t = store::NewTask { title, details: "", agent: "", chat: chat.as_deref().unwrap_or(""), link: "", priority: None, due: due.as_deref(), mydesk };
            let id = l.add(t);
            if mydesk { desk::include_created_task(l, id)?; }
            Ok(id)
        })?;
    }
    reply(&app)
}

/// The user rewording a task or its details (any task, agents' included).
#[tauri::command]
fn edit_task(app: AppHandle, id: i64, title: Option<String>, details: Option<String>, chat: Option<String>, agent: Option<String>) -> Res<Vec<Task>> {
    let title = title.as_deref().map(str::trim);
    if title.is_some_and(str::is_empty) {
        return Err("A task needs a title.".into());
    }
    let changes = store::Changes { title, details: details.as_deref(), chat: chat.as_deref(), agent: agent.as_deref(), ..Default::default() };
    store::change(|l| {
        if l.get(id).is_none() { return Err("That task is gone.".into()); }
        if let Some(destination) = chat.as_deref() {
            let source = l.get(id).unwrap().chat.clone();
            l.preserve_chat(&source);
            l.preserve_chat(destination);
        }
        Ok(l.update(id, changes))
    })?;
    reply(&app)
}

#[tauri::command]
fn list_chats() -> Res<Vec<String>> {
    Ok(store::load()?.chats())
}

#[tauri::command]
fn create_list(app: AppHandle, name: String) -> Res<Vec<String>> {
    store::change(|l| l.create_chat(&name))?;
    let _ = app.emit("tasks-changed", ());
    list_chats()
}

#[tauri::command]
fn rename_list(app: AppHandle, name: String, new_name: String) -> Res<Vec<Task>> {
    store::rename_chat(&name, &new_name)?;
    reply(&app)
}

#[tauri::command]
fn archive_list(app: AppHandle, name: String) -> Res<String> {
    let path = store::archive_chat(&name)?;
    reply(&app)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_list(app: AppHandle, name: String) -> Res<Vec<Task>> {
    store::delete_chat(&name)?;
    reply(&app)
}

#[tauri::command]
fn ensure_sidebar_visible(app: AppHandle) -> Res<()> {
    let window = app.get_webview_window("main").ok_or("The task window isn't available.")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let size = inner.to_logical::<f64>(scale);
    if size.width < 720.0 {
        let mut width: f64 = 860.0;
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let area = monitor.work_area();
            let outer = window.outer_size().map_err(|e| e.to_string())?;
            let decoration = outer.width.saturating_sub(inner.width) as f64;
            width = width.min((area.size.width as f64 - decoration) / scale).max(720.0);
            let mut position = window.outer_position().map_err(|e| e.to_string())?;
            let rightmost = area.position.x + area.size.width as i32 - (width * scale + decoration).ceil() as i32;
            position.x = position.x.min(rightmost).max(area.position.x);
            window.set_position(position).map_err(|e| e.to_string())?;
        }
        window.set_size(tauri::LogicalSize::new(width, size.height)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_done(app: AppHandle, id: i64, done: bool) -> Res<Vec<Task>> {
    store::change(|l| Ok(l.set_done(id, done)))?;
    reply(&app)
}

#[tauri::command]
fn set_priority(app: AppHandle, id: i64, priority: Option<i64>) -> Res<Vec<Task>> {
    if priority.is_some_and(|p| !store::valid_priority(p)) {
        return Err("priority must be 0-3".into());
    }
    store::change(|l| Ok(l.update(id, store::Changes { priority: Some(priority), ..Default::default() })))?;
    reply(&app)
}

#[tauri::command]
fn set_due(app: AppHandle, id: i64, due: Option<String>) -> Res<Vec<Task>> {
    if due.as_deref().is_some_and(|d| !store::valid_due(d)) {
        return Err("due must be YYYY-MM-DD".into());
    }
    store::change(|l| Ok(l.update(id, store::Changes { due: Some(due.as_deref()), ..Default::default() })))?;
    reply(&app)
}

#[tauri::command]
fn set_desk(app: AppHandle, id: i64, on: bool) -> Res<Vec<Task>> {
    store::change(|l| Ok(l.update(id, store::Changes { mydesk: Some(on), ..Default::default() })))?;
    reply(&app)
}

#[tauri::command]
fn delete_task(app: AppHandle, id: i64) -> Res<Vec<Task>> {
    store::change(|l| Ok(l.delete(id)))?;
    reply(&app)
}

/// Links come from agents, which may have read untrusted content, so only web links and
/// deep links into chat/editor apps are opened, never arbitrary protocol handlers or files.
const LINK_SCHEMES: &[&str] = &[
    "https", "http", "mailto", "claude", "cursor", "vscode", "vscode-insiders", "windsurf",
    "zed", "slack", "linear", "notion", "figma", "obsidian", "msteams", "discord",
];

#[tauri::command]
fn open_link(id: i64) -> Res<()> {
    let task = store::load()?.get(id).ok_or("That task is gone.")?;
    let link = task.link.trim();
    let scheme = link.split_once(':').map(|(s, _)| s.to_ascii_lowercase()).unwrap_or_default();
    if !LINK_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("Won't open {scheme}: links"));
    }
    open::that_detached(link).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_about_link(destination: &str) -> Res<()> {
    let url = match destination {
        "source" => "https://github.com/SandpiperMediaGroup/tinytasks",
        "timecal" => "https://trytimecal.com",
        "releases" => crate::updates::RELEASES_URL,
        "agent-setup" => "https://github.com/SandpiperMediaGroup/tinytasks/blob/main/docs/agent-setup.md",
        _ => return Err("Unknown About link.".into()),
    };
    open::that_detached(url).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_info() -> Res<serde_json::Value> {
    let executable = std::env::current_exe().map_err(|_| "Could not locate the TinyTasks executable.".to_string())?;
    Ok(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "mcp": { "mcpServers": { "tinytasks": { "command": executable, "args": ["mcp"] } } }
    }))
}

#[tauri::command]
async fn check_for_updates(app: AppHandle, force: bool) -> Res<crate::updates::Status> {
    let status = tauri::async_runtime::spawn_blocking(move || crate::updates::check(force))
        .await.map_err(|_| "The update check could not finish.".to_string())??;
    let _ = app.emit("updates-changed", &status);
    Ok(status)
}

#[derive(serde::Serialize)]
struct Location {
    /// The folder, in full.
    folder: String,
    /// The last couple of folder names, or "This computer" for the default.
    short: String,
}

#[tauri::command]
fn location() -> Location {
    let (file, chosen) = store::location();
    let folder = file.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let short = if chosen {
        let names: Vec<String> = folder
            .components()
            .rev()
            .take(2)
            .map(|c| c.as_os_str().to_string_lossy().trim_end_matches(['\\', '/']).to_string())
            .collect();
        names.into_iter().rev().collect::<Vec<_>>().join(" › ")
    } else {
        "This computer".to_string()
    };
    Location { folder: folder.display().to_string(), short }
}

/// Asks for a folder and keeps the list there. `None` if the user cancelled.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Res<Option<String>> {
    let start = store::path().parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let picked = app.dialog().file().set_title("Where should TinyTasks keep your list?").set_directory(start.clone()).blocking_pick_folder();
    let Some(dir) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    let msg = store::use_folder(&dir)?;
    if store::path().parent() != Some(start.as_path()) {
        // Task IDs belong to a file. Don't let a note accidentally edit the same ID in another list.
        for (label, window) in app.webview_windows() {
            if label.starts_with("note-") { let _ = window.close(); }
        }
    }
    let _ = app.emit("tasks-changed", ());
    Ok(Some(msg))
}

/// Opens tasks.md in the user's markdown editor.
#[tauri::command]
fn open_file() -> Res<()> {
    let p = store::path();
    if !p.exists() {
        return Err("There's no file yet. It's created with your first task.".into());
    }
    open::that_detached(p).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_settings(app: AppHandle) -> Res<()> {
    if let Some(window) = app.get_webview_window("settings") {
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    let builder = tauri::WebviewWindowBuilder::new(&app, "settings", tauri::WebviewUrl::App("settings.html".into()))
        .title("Settings — TinyTasks")
        .inner_size(420.0, 620.0)
        .min_inner_size(320.0, 400.0)
        .center()
        .disable_drag_drop_handler();
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 25.0));
    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_settings(window: tauri::WebviewWindow) -> Res<()> {
    if window.label() != "settings" { return Err("Only Settings can be closed here.".into()); }
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_note(app: AppHandle, id: i64) -> Res<()> {
    let task = store::load()?.get(id).ok_or("That task is gone.")?;
    let label = format!("note-{id}");
    if let Some(window) = app.get_webview_window(&label) {
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::App(format!("index.html?task={id}").into()))
        .title(format!("{} — TinyTasks", task.title))
        .inner_size(340.0, 300.0)
        .min_inner_size(280.0, 180.0)
        .always_on_top(false)
        .decorations(false)
        .shadow(true)
        .disable_drag_drop_handler()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_note(window: tauri::WebviewWindow) -> Res<()> {
    if !window.label().starts_with("note-") { return Err("Only sticky notes can be closed here.".into()); }
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn drag_note(window: tauri::WebviewWindow) -> Res<()> {
    if !window.label().starts_with("note-") { return Err("Only sticky notes can be moved here.".into()); }
    window.start_dragging().map_err(|e| e.to_string())
}
