//! The whole data model: one SQLite table shared by the app and the MCP server.

use rusqlite::{params, Connection, Row};
use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub details: String,
    /// The agent harness, as its MCP client reports itself (e.g. "claude-code", "cursor-vscode").
    pub agent: String,
    /// The conversation the task came from, as the agent names it.
    pub chat: String,
    pub link: String,
    pub created_at: i64,
    pub done_at: Option<i64>,
}

/// `~/.tinytasks`. Deliberately not AppData: on Windows, apps from the Microsoft Store
/// (Claude, Codex, ...) and everything they launch get a private, redirected copy of
/// AppData, so each agent would see its own separate list. The home folder isn't redirected.
pub fn data_dir() -> PathBuf {
    let dir = dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".tinytasks");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn path() -> PathBuf {
    match std::env::var("TINYTASKS_DB") {
        Ok(p) => PathBuf::from(p),
        Err(_) => data_dir().join("tasks.db"),
    }
}

pub fn open() -> rusqlite::Result<Connection> {
    let conn = Connection::open(path())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS tasks (
             id         INTEGER PRIMARY KEY AUTOINCREMENT,
             title      TEXT    NOT NULL,
             details    TEXT    NOT NULL DEFAULT '',
             agent      TEXT    NOT NULL DEFAULT '',
             chat       TEXT    NOT NULL DEFAULT '',
             link       TEXT    NOT NULL DEFAULT '',
             created_at INTEGER NOT NULL,
             done_at    INTEGER,
             notified   INTEGER NOT NULL DEFAULT 0
         );",
    )?;
    // Databases from v0.1 lack `chat`. Another process may add it at the same moment,
    // so a "duplicate column" error just means it's already there.
    if let Err(e) = conn.execute_batch("ALTER TABLE tasks ADD COLUMN chat TEXT NOT NULL DEFAULT ''") {
        if !e.to_string().contains("duplicate column") {
            return Err(e);
        }
    }
    Ok(conn)
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

const COLS: &str = "id, title, details, agent, chat, link, created_at, done_at";

fn row(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        title: r.get(1)?,
        details: r.get(2)?,
        agent: r.get(3)?,
        chat: r.get(4)?,
        link: r.get(5)?,
        created_at: r.get(6)?,
        done_at: r.get(7)?,
    })
}

pub struct NewTask<'a> {
    pub title: &'a str,
    pub details: &'a str,
    pub agent: &'a str,
    pub chat: &'a str,
    pub link: &'a str,
    /// Pop a desktop notification for it (agents' tasks yes, the user's own no).
    pub notify: bool,
}

pub fn add(conn: &Connection, t: NewTask) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO tasks (title, details, agent, chat, link, created_at, notified)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![t.title, t.details, t.agent, t.chat, t.link, now(), !t.notify],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Change any of a task's text fields; `None` leaves a field as it is.
pub fn update(
    conn: &Connection,
    id: i64,
    title: Option<&str>,
    details: Option<&str>,
    link: Option<&str>,
    chat: Option<&str>,
) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE tasks SET title = COALESCE(?2, title), details = COALESCE(?3, details),
             link = COALESCE(?4, link), chat = COALESCE(?5, chat) WHERE id = ?1",
        params![id, title, details, link, chat],
    )
}

/// For agents. `status`: "open", "done" or anything else for both; finished tasks only
/// from the last two weeks. `chat`: optional case-insensitive substring filter.
pub fn list(conn: &Connection, status: &str, chat: Option<&str>) -> rusqlite::Result<Vec<Task>> {
    let where_status = match status {
        "open" => "done_at IS NULL",
        "done" => "done_at IS NOT NULL",
        _ => "1",
    };
    let sql = format!(
        "SELECT {COLS} FROM tasks WHERE {where_status} AND (done_at IS NULL OR done_at > ?2)
           AND (?1 IS NULL OR chat LIKE '%' || ?1 || '%')
         ORDER BY done_at IS NOT NULL, COALESCE(done_at, created_at) DESC LIMIT 200"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![chat, now() - 14 * 24 * 3600], row)?;
    rows.collect()
}

/// What the window shows: every open task plus things finished in the last week.
pub fn for_ui(conn: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM tasks WHERE done_at IS NULL OR done_at > ?1
         ORDER BY done_at IS NOT NULL, COALESCE(done_at, created_at) DESC"
    ))?;
    let rows = stmt.query_map(params![now() - 7 * 24 * 3600], row)?;
    rows.collect()
}

pub fn get(conn: &Connection, id: i64) -> rusqlite::Result<Task> {
    conn.query_row(&format!("SELECT {COLS} FROM tasks WHERE id = ?1"), params![id], row)
}

pub fn set_done(conn: &Connection, id: i64, done: bool) -> rusqlite::Result<usize> {
    let done_at = if done { Some(now()) } else { None };
    conn.execute("UPDATE tasks SET done_at = ?2, notified = 1 WHERE id = ?1", params![id, done_at])
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])
}

pub fn open_count(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM tasks WHERE done_at IS NULL", [], |r| r.get(0))
}

/// Tasks the user hasn't been notified about yet, claimed in one statement so a task
/// arriving mid-way can't be marked notified without being shown.
pub fn take_unnotified(conn: &Connection) -> rusqlite::Result<Vec<Task>> {
    let mut stmt = conn.prepare(&format!(
        "UPDATE tasks SET notified = 1 WHERE notified = 0 AND done_at IS NULL RETURNING {COLS}"
    ))?;
    let mut tasks: Vec<Task> = stmt.query_map([], row)?.collect::<Result<_, _>>()?;
    tasks.sort_by_key(|t| t.id);
    Ok(tasks)
}

/// Changes whenever *another* connection commits — a cheap way to watch for agent writes.
pub fn data_version(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("PRAGMA data_version", [], |r| r.get(0))
}
