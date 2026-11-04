//! The desktop window + tray icon. Watches the database for tasks added by agents,
//! pops a notification, and keeps the tray badge current.

use crate::{db, launch, notify, trayicon};
use rusqlite::Connection;
use std::sync::Mutex;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

struct Db(Mutex<Connection>);

type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

pub fn run(background: bool) {
    let conn = db::open().expect("could not open the TinyTasks database");
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
        }));
    #[cfg(not(windows))]
    let builder = builder.plugin(tauri_plugin_notification::init());

    builder
        .manage(Db(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![list, add_task, set_done, delete_task, open_link, set_pinned])
        .setup(move |app| {
            launch::clear_quiet_request();
            launch::heartbeat();
            let identity_just_registered = notify::init(app.handle());
            let show_item = MenuItem::with_id(app, "show", "Show TinyTasks", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit TinyTasks", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
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
                api.prevent_close();
                let _ = window.hide();
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

fn badge(count: i64) -> Image<'static> {
    let (rgba, w, h) = trayicon::render(count);
    Image::new_owned(rgba, w, h)
}

/// Refresh the tray icon, tooltip and window title with the open count.
fn update_badge(app: &AppHandle, conn: &Connection) {
    let n = db::open_count(conn).unwrap_or(0);
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

/// Background thread: notices writes from agents (via the MCP server) and reacts.
/// Uses the window's connection: PRAGMA data_version only moves for *other* connections'
/// commits, so the window's own changes (already handled by the commands) don't echo here.
fn watch(app: AppHandle, identity_just_registered: bool) {
    std::thread::spawn(move || {
        if identity_just_registered {
            std::thread::sleep(Duration::from_secs(4)); // let Windows index the new shortcut
        }
        let mut last = -1;
        let mut ticks = 0u32;
        loop {
            ticks += 1;
            if ticks % 7 == 0 {
                launch::heartbeat(); // ~every 5s; lets agents know we're running
            }
            let state = app.state::<Db>();
            if let Ok(conn) = state.0.lock() {
                let v = db::data_version(&conn).unwrap_or(0);
                if v != last {
                    last = v;
                    if let Ok(new) = db::take_unnotified(&conn) {
                        notify::new_tasks(&app, &new);
                    }
                    update_badge(&app, &conn);
                    let _ = app.emit("tasks-changed", ());
                }
            }
            std::thread::sleep(Duration::from_millis(700));
        }
    });
}

// ---- commands the window calls ----

#[tauri::command]
fn list(db: tauri::State<Db>) -> Res<Vec<db::Task>> {
    let conn = db.0.lock().map_err(err)?;
    db::for_ui(&conn).map_err(err)
}

/// The user typing in their own task: no agent, no chat, no notification.
#[tauri::command]
fn add_task(app: AppHandle, db: tauri::State<Db>, title: String) -> Res<Vec<db::Task>> {
    let title = title.trim();
    let conn = db.0.lock().map_err(err)?;
    if !title.is_empty() {
        let t = db::NewTask { title, details: "", agent: "", chat: "", link: "", notify: false };
        db::add(&conn, t).map_err(err)?;
        update_badge(&app, &conn);
    }
    db::for_ui(&conn).map_err(err)
}

#[tauri::command]
fn set_done(app: AppHandle, db: tauri::State<Db>, id: i64, done: bool) -> Res<Vec<db::Task>> {
    let conn = db.0.lock().map_err(err)?;
    db::set_done(&conn, id, done).map_err(err)?;
    update_badge(&app, &conn);
    db::for_ui(&conn).map_err(err)
}

#[tauri::command]
fn delete_task(app: AppHandle, db: tauri::State<Db>, id: i64) -> Res<Vec<db::Task>> {
    let conn = db.0.lock().map_err(err)?;
    db::delete(&conn, id).map_err(err)?;
    update_badge(&app, &conn);
    db::for_ui(&conn).map_err(err)
}

/// Links come from agents, which may have read untrusted content, so only web links and
/// deep links into chat/editor apps are opened, never arbitrary protocol handlers or files.
const LINK_SCHEMES: &[&str] = &[
    "https", "http", "mailto", "claude", "cursor", "vscode", "vscode-insiders", "windsurf",
    "zed", "slack", "linear", "notion", "figma", "obsidian", "msteams", "discord",
];

#[tauri::command]
fn open_link(db: tauri::State<Db>, id: i64) -> Res<()> {
    let task = db::get(&*db.0.lock().map_err(err)?, id).map_err(err)?;
    let link = task.link.trim();
    let scheme = link.split_once(':').map(|(s, _)| s.to_ascii_lowercase()).unwrap_or_default();
    if !LINK_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("Won't open {scheme}: links"));
    }
    open::that_detached(link).map_err(err)
}

#[tauri::command]
fn set_pinned(window: tauri::WebviewWindow, pinned: bool) -> Res<()> {
    window.set_always_on_top(pinned).map_err(err)
}
