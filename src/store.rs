//! The task list is a markdown file: `~/.tinytasks/tasks.md` unless the user picks another
//! (one in a Google Drive folder, say, so agents anywhere can read it). The app and every
//! agent's MCP server read it, change it and write it back whole, under a lock. Lines
//! TinyTasks doesn't understand, and tasks nobody touched, are written back exactly as they were.
//!
//! ```markdown
//! - [ ] Renew the domain @added(2026-11-04 09:12) @id(15)
//!
//! ## Stripe billing setup
//!
//! - [ ] Add the STRIPE_KEY secret in Vercel @priority(1) @due(2026-11-06) @mydesk(2026-11-04) @from(claude-code) @added(2026-11-04 10:12) @id(7)
//!   Details go on indented lines under the task.
//! ```

use chrono::{Local, NaiveDate, NaiveDateTime, TimeZone};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub details: String,
    /// The agent harness, as its MCP client reports itself (e.g. "claude-code"). Empty: the user.
    pub agent: String,
    /// The conversation the task came from: the `## heading` it sits under.
    pub chat: String,
    pub link: String,
    pub created_at: i64,
    pub done_at: Option<i64>,
    /// 0 (most urgent) to 3, or none.
    pub priority: Option<i64>,
    /// `YYYY-MM-DD`.
    pub due: Option<String>,
    /// On the user's desk: what they're focusing on today. The desk clears overnight.
    pub mydesk: bool,
}

pub fn valid_priority(p: i64) -> bool {
    (0..=3).contains(&p)
}

pub fn valid_due(d: &str) -> bool {
    NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok()
}

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// `~/.tinytasks`: settings, the lock and per-machine state. Deliberately not AppData: on
/// Windows, Store apps (Claude, Codex, ...) and everything they launch get a private,
/// redirected AppData, so each agent would see a different one. The home folder isn't redirected.
pub fn data_dir() -> PathBuf {
    let dir = dirs::home_dir().unwrap_or_else(std::env::temp_dir).join(".tinytasks");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn setting_file() -> PathBuf {
    data_dir().join("file")
}

/// Where the list lives, and whether the user chose that folder (rather than the default).
pub fn location() -> (PathBuf, bool) {
    if let Ok(p) = std::env::var("TINYTASKS_FILE") {
        return (PathBuf::from(p), false);
    }
    match fs::read_to_string(setting_file()) {
        Ok(s) if !s.trim().is_empty() => (PathBuf::from(s.trim()), true),
        _ => (data_dir().join("tasks.md"), false),
    }
}

pub fn path() -> PathBuf {
    location().0
}

fn same_file(a: &Path, b: &Path) -> bool {
    a == b || matches!((fs::canonicalize(a), fs::canonicalize(b)), (Ok(x), Ok(y)) if x == y)
}

fn open_count_in(text: &str) -> usize {
    parse(text).open_count()
}

/// Keep the list in `tasks.md` in another folder (say, one Google Drive syncs). If that folder
/// has no list yet, yours moves there (the old file stays put, as a backup). If it already has
/// one, from another computer say, TinyTasks switches to it; lists are never merged.
/// Returns a sentence saying which happened.
pub fn use_folder(dir: &Path) -> Result<String, String> {
    let _lock = lock()?;
    let new = dir.join("tasks.md");
    let old = path();
    if same_file(&old, &new) {
        return Ok("Your tasks are already kept there.".into());
    }
    let existing = read(&new)?;
    let msg = if parse(&existing).tasks().next().is_some() {
        let theirs = open_count_in(&existing);
        let ours = fs::read_to_string(&old).map(|t| open_count_in(&t)).unwrap_or(0);
        let mut m = format!("Using the list already in that folder ({theirs} open).");
        if ours > 0 {
            m += &format!(" The {ours} open tasks you had stay in the old file.");
        }
        m
    } else {
        let current = fs::read_to_string(&old).unwrap_or_default();
        let mut text = match (existing.trim().is_empty(), current.trim().is_empty()) {
            (true, _) => current,
            (false, true) => existing,
            (false, false) => format!("{}\n\n{}", existing.trim_end(), current),
        };
        if text.trim().is_empty() {
            // Create the file now, so a missing file later means something's wrong.
            text = format!("{HEADER}\n");
        }
        write(&new, &text)?;
        match parse(&text).tasks().count() {
            0 => "Your tasks will be kept there.".to_string(),
            n => format!("Moved your {n} tasks there. The old file stays where it was, as a backup."),
        }
    };
    fs::write(setting_file(), new.to_string_lossy().as_bytes()).map_err(|e| write_error(e, &setting_file()))?;
    Ok(msg)
}

// ---- reading and writing ----

/// The list file's text. The default file may not exist yet (it's created on the first task),
/// but one in a folder the user chose always does: if it's gone, the drive or sync app is
/// probably offline, and starting a fresh file would fork the list.
fn read_list(p: &Path, chosen: bool) -> Result<String, String> {
    if chosen && !p.exists() {
        return Err(format!(
            "Can't find the task list at {}. If that folder is synced (Google Drive, Dropbox, ...), \
             check that the sync app is running, or choose another folder in TinyTasks.",
            p.display()
        ));
    }
    read(p)
}

/// The list as it is now (no lock: writes replace the file in one step).
pub fn load() -> Result<List, String> {
    let (p, chosen) = location();
    Ok(parse(&read_list(&p, chosen)?))
}

/// Read, change and write back the list, holding the lock so two writers can't interleave.
/// Writes only if something changed (including ids and dates stamped onto hand-typed tasks).
pub fn change<R>(f: impl FnOnce(&mut List) -> Result<R, String>) -> Result<R, String> {
    let _lock = lock()?;
    let (p, chosen) = location();
    let text = read_list(&p, chosen)?;
    let mut list = parse(&text);
    let r = f(&mut list)?;
    let out = list.render();
    if out != text {
        write(&p, &out)?;
    }
    Ok(r)
}

/// Writers on this machine take turns through a lock file next to the settings (not next to
/// the list, so it never syncs). Released when the returned file is dropped.
fn lock() -> Result<fs::File, String> {
    let p = data_dir().join("tasks.lock");
    let f = OpenOptions::new().create(true).truncate(false).write(true).open(&p).map_err(|e| write_error(e, &p))?;
    f.lock().map_err(|e| write_error(e, &p))?;
    Ok(f)
}

fn read(p: &Path) -> Result<String, String> {
    match fs::read_to_string(p) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Can't read {}: {e}", p.display())),
    }
}

/// Write to a temporary file and swap it in, so nobody (Drive sync included) sees half a file.
/// Some editors hold the file open in a way that blocks the swap; then write it in place.
fn write(p: &Path, text: &str) -> Result<(), String> {
    if let Some(dir) = p.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = p.with_file_name(format!(".{name}.tinytasks-tmp"));
    let swapped = fs::write(&tmp, text).and_then(|_| fs::rename(&tmp, p));
    if swapped.is_err() {
        let _ = fs::remove_file(&tmp);
        fs::write(p, text).map_err(|e| write_error(e, p))?;
    }
    Ok(())
}

fn write_error(e: std::io::Error, p: &Path) -> String {
    if matches!(e.kind(), ErrorKind::PermissionDenied | ErrorKind::ReadOnlyFilesystem) {
        format!(
            "TinyTasks can read but not save here: this process isn't allowed to write {}. That usually \
             means it was started from a sandboxed shell instead of as an MCP server. Use the tinytasks \
             MCP tools (if this chat started before TinyTasks was set up, the user needs to start a new \
             chat), or ask the user to add the task themselves.",
            p.display()
        )
    } else {
        format!("Can't save {}: {e}", p.display())
    }
}

// ---- the file format ----

/// Shown to anyone (any agent) who opens the raw file; markdown viewers hide it.
const HEADER: &str = "<!-- TinyTasks: the user's to-do list. You may edit this file directly.
- [ ] is an open task, - [x] a done one. A \"## Heading\" is the chat the tasks under it came from.
@priority(0-3): 0 is most urgent. @due(YYYY-MM-DD). @mydesk(YYYY-MM-DD): on the user's desk (their focus) that day only;
write @mydesk(today) and TinyTasks fills in the date.
@from(agent): who added it. @link(url): back to that chat. @added/@done(YYYY-MM-DD HH:MM).
@id(n): unique, never change it. TinyTasks fills in @id and @added when you leave them out.
Details go on lines indented two spaces under the task. Leave everything else as it is. -->";

pub struct List {
    blocks: Vec<Block>,
    crlf: bool,
}

enum Block {
    Text(String),
    Task(Entry),
}

struct Entry {
    task: Task,
    /// Attributes and #tags TinyTasks doesn't use, kept in the order they were written.
    extras: Vec<String>,
    /// The task's lines as read; `None` once changed, so it's written out fresh.
    raw: Option<Vec<String>>,
    /// The day it was put on the desk (`today` until filled in). Only today's count.
    desk: Option<String>,
}

/// Today's date, `YYYY-MM-DD`, local time.
pub fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub struct NewTask<'a> {
    pub title: &'a str,
    pub details: &'a str,
    pub agent: &'a str,
    pub chat: &'a str,
    pub link: &'a str,
    pub priority: Option<i64>,
    pub due: Option<&'a str>,
    pub mydesk: bool,
}

/// What to change on a task; `None` leaves a field as it is.
#[derive(Default)]
pub struct Changes<'a> {
    pub title: Option<&'a str>,
    pub details: Option<&'a str>,
    pub link: Option<&'a str>,
    pub chat: Option<&'a str>,
    /// `Some(None)` clears it.
    pub priority: Option<Option<i64>>,
    pub due: Option<Option<&'a str>>,
    pub mydesk: Option<bool>,
}

fn heading(line: &str) -> Option<String> {
    line.strip_prefix("## ").map(|h| h.trim().trim_end_matches('#').trim().to_string())
}

fn is_blank(b: &Block) -> bool {
    matches!(b, Block::Text(t) if t.trim().is_empty())
}

fn is_heading(b: &Block) -> bool {
    matches!(b, Block::Text(t) if heading(t).is_some())
}

fn checkbox(line: &str) -> Option<(bool, &str)> {
    for (prefix, done) in [("- [ ] ", false), ("- [x] ", true), ("- [X] ", true), ("* [ ] ", false), ("* [x] ", true), ("* [X] ", true)] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return Some((done, rest));
        }
    }
    None
}

pub fn parse(text: &str) -> List {
    let crlf = text.contains("\r\n");
    let mut lines: Vec<&str> = text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    if lines.last() == Some(&"") {
        lines.pop(); // the file's final newline
    }
    let mut blocks = Vec::new();
    let mut chat = String::new();
    let mut in_comment = false;
    let mut in_fence = false;
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        // Nothing inside <!-- comments --> or ``` fences is a task (the header shows examples).
        let was_hidden = in_comment || in_fence;
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        if let Some(open) = line.rfind("<!--") {
            in_comment = !line[open..].contains("-->");
        } else if line.contains("-->") {
            in_comment = false;
        }
        if was_hidden || in_comment || in_fence || line.contains("<!--") {
            blocks.push(Block::Text(line.to_string()));
            i += 1;
            continue;
        }
        if let Some(h) = heading(line) {
            chat = h;
        }
        let Some((done, rest)) = checkbox(line) else {
            blocks.push(Block::Text(line.to_string()));
            i += 1;
            continue;
        };
        // The body: indented lines below, blank lines included when more indented ones follow.
        let mut end = i + 1;
        let mut j = i + 1;
        while j < lines.len() {
            let l = lines[j];
            if l.trim().is_empty() {
                j += 1;
            } else if l.starts_with(' ') || l.starts_with('\t') {
                j += 1;
                end = j;
            } else {
                break;
            }
        }
        let details = lines[i + 1..end]
            .iter()
            .map(|l| {
                if l.trim().is_empty() {
                    ""
                } else {
                    l.strip_prefix("  ").or_else(|| l.strip_prefix('\t')).or_else(|| l.strip_prefix(' ')).unwrap_or(l)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        let mut entry = parse_task(rest, done, &chat);
        entry.task.details = details;
        entry.raw = Some(lines[i..end].iter().map(|l| l.to_string()).collect());
        blocks.push(Block::Task(entry));
        i = end;
    }
    let mut list = List { blocks, crlf };
    list.fill_in();
    list
}

/// Splits a task line into its title and its `@name(value)` attributes and `#tags`.
fn parse_task(rest: &str, done: bool, chat: &str) -> Entry {
    let mut task = Task {
        id: 0,
        title: String::new(),
        details: String::new(),
        agent: String::new(),
        chat: chat.to_string(),
        link: String::new(),
        created_at: 0,
        done_at: None,
        priority: None,
        due: None,
        mydesk: false,
    };
    let mut extras = Vec::new();
    let mut title = String::new();
    let mut done_stamp = None;
    let mut desk = None;
    let chars: Vec<(usize, char)> = rest.char_indices().collect();
    let mut k = 0;
    while k < chars.len() {
        let (pos, c) = chars[k];
        let at_word_start = k == 0 || chars[k - 1].1.is_whitespace();
        if at_word_start && c == '@' {
            let mut n = k + 1;
            while n < chars.len() && (chars[n].1.is_ascii_alphanumeric() || chars[n].1 == '-' || chars[n].1 == '_') {
                n += 1;
            }
            let name = &rest[chars[k].0 + 1..chars.get(n).map_or(rest.len(), |c| c.0)];
            if !name.is_empty() && n < chars.len() && chars[n].1 == '(' {
                // Find the matching ")" so values like links can contain parentheses.
                let mut depth = 0;
                let mut close = None;
                for (m, &(_, ch)) in chars.iter().enumerate().skip(n) {
                    match ch {
                        '(' => depth += 1,
                        ')' => {
                            depth -= 1;
                            if depth == 0 {
                                close = Some(m);
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                if let Some(close) = close {
                    let value = rest[chars[n].0 + 1..chars[close].0].trim();
                    let raw = &rest[pos..chars[close].0 + 1];
                    match name {
                        "id" => task.id = value.parse().unwrap_or(0),
                        "priority" => task.priority = value.parse().ok().filter(|p| valid_priority(*p)),
                        "due" if valid_due(value) => task.due = Some(value.to_string()),
                        "mydesk" => desk = Some(if valid_due(value) { value.to_string() } else { "today".to_string() }),
                        "from" => task.agent = value.to_string(),
                        "link" => task.link = value.replace("%28", "(").replace("%29", ")"),
                        "added" => task.created_at = parse_time(value).unwrap_or(0),
                        "done" => done_stamp = parse_time(value),
                        _ => extras.push(raw.to_string()),
                    }
                    k = close + 1;
                    continue;
                }
            } else if name == "mydesk" {
                desk = Some("today".to_string());
                k = n;
                continue;
            }
        } else if at_word_start && c == '#' && chars.get(k + 1).is_some_and(|c| c.1.is_alphabetic()) {
            let mut n = k + 1;
            while n < chars.len() && !chars[n].1.is_whitespace() {
                n += 1;
            }
            extras.push(rest[pos..chars.get(n).map_or(rest.len(), |c| c.0)].to_string());
            k = n;
            continue;
        }
        title.push(c);
        k += 1;
    }
    task.title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    // The checkbox is the truth; a stamp just says when.
    task.done_at = if done { Some(done_stamp.unwrap_or(0)) } else { None };
    if !done && done_stamp.is_some() {
        task.done_at = None;
    }
    Entry { task, extras, raw: None, desk }
}

fn parse_time(s: &str) -> Option<i64> {
    let s = s.trim();
    let dt = ["%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]
        .iter()
        .find_map(|f| NaiveDateTime::parse_from_str(s, f).ok())
        .or_else(|| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok().and_then(|d| d.and_hms_opt(0, 0, 0)))?;
    Local.from_local_datetime(&dt).earliest().map(|d| d.timestamp())
}

fn format_time(t: i64) -> String {
    Local.timestamp_opt(t, 0).single().map(|d| d.format("%Y-%m-%d %H:%M").to_string()).unwrap_or_default()
}

fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl Entry {
    fn lines(&self) -> Vec<String> {
        if let Some(raw) = &self.raw {
            return raw.clone();
        }
        let t = &self.task;
        let mut line = format!("- [{}] {}", if t.done_at.is_some() { "x" } else { " " }, one_line(&t.title));
        if let Some(p) = t.priority {
            line += &format!(" @priority({p})");
        }
        if let Some(d) = &t.due {
            line += &format!(" @due({d})");
        }
        if let Some(d) = &self.desk {
            line += &format!(" @mydesk({d})");
        }
        for x in &self.extras {
            line += &format!(" {x}");
        }
        if !t.agent.is_empty() {
            line += &format!(" @from({})", one_line(&t.agent).replace(['(', ')'], ""));
        }
        if !t.link.is_empty() {
            line += &format!(" @link({})", t.link.trim().replace('(', "%28").replace(')', "%29"));
        }
        line += &format!(" @added({})", format_time(t.created_at));
        if let Some(d) = t.done_at {
            line += &format!(" @done({})", format_time(d));
        }
        line += &format!(" @id({})", t.id);
        let mut out = vec![line];
        for l in t.details.trim_end().lines() {
            out.push(if l.trim().is_empty() { String::new() } else { format!("  {l}") });
        }
        if out.len() > 1 && t.details.trim().is_empty() {
            out.truncate(1);
        }
        out
    }
}

impl List {
    pub fn tasks(&self) -> impl Iterator<Item = &Task> {
        self.blocks.iter().filter_map(|b| match b {
            Block::Task(e) => Some(&e.task),
            _ => None,
        })
    }

    fn entries_mut(&mut self) -> impl Iterator<Item = &mut Entry> {
        self.blocks.iter_mut().filter_map(|b| match b {
            Block::Task(e) => Some(e),
            _ => None,
        })
    }

    fn position(&self, id: i64) -> Option<usize> {
        self.blocks.iter().position(|b| matches!(b, Block::Task(e) if e.task.id == id))
    }

    fn entry_mut(&mut self, id: i64) -> Option<&mut Entry> {
        self.entries_mut().find(|e| e.task.id == id)
    }

    pub fn get(&self, id: i64) -> Option<Task> {
        self.tasks().find(|t| t.id == id).cloned()
    }

    pub fn open_count(&self) -> usize {
        self.tasks().filter(|t| t.done_at.is_none()).count()
    }

    fn max_id(&self) -> i64 {
        self.tasks().map(|t| t.id).max().unwrap_or(0)
    }

    /// Ids and dates for tasks typed by hand (or by an agent editing the file), and fresh ids
    /// for copy-pasted duplicates. Deterministic for ids, so readers agree before it's saved.
    fn fill_in(&mut self) {
        let mut seen = HashSet::new();
        for e in self.entries_mut() {
            if e.task.id <= 0 || !seen.insert(e.task.id) {
                e.task.id = 0;
                e.raw = None;
            }
        }
        let mut next = self.max_id();
        let t = now();
        for e in self.entries_mut() {
            if e.task.id == 0 {
                next += 1;
                e.task.id = next;
            }
            if e.task.created_at == 0 {
                e.task.created_at = t;
                e.raw = None;
            }
            if e.task.done_at == Some(0) {
                e.task.done_at = Some(t);
                e.raw = None;
            }
        }
        // The desk is for one day: "today" gets the date; an earlier day's desk is cleared
        // (in memory now, in the file on the next write).
        let day = today();
        for e in self.entries_mut() {
            match e.desk.as_deref() {
                Some("today") => {
                    e.desk = Some(day.clone());
                    e.raw = None;
                }
                Some(d) if d != day => {
                    e.desk = None;
                    e.raw = None;
                }
                _ => {}
            }
            e.task.mydesk = e.desk.is_some();
        }
        // A done stamp on an unchecked task: drop it.
        for e in self.entries_mut() {
            if e.task.done_at.is_none() && e.raw.as_ref().is_some_and(|r| r[0].contains("@done(")) {
                e.raw = None;
            }
        }
    }

    pub fn render(&self) -> String {
        let mut lines: Vec<String> = Vec::new();
        let has_tasks = self.tasks().next().is_some();
        let has_header = self.blocks.iter().any(|b| matches!(b, Block::Text(t) if t.starts_with("<!-- TinyTasks")));
        if has_tasks && !has_header {
            lines.extend(HEADER.lines().map(String::from));
            if !self.blocks.first().is_some_and(is_blank) {
                lines.push(String::new());
            }
        }
        for b in &self.blocks {
            match b {
                Block::Text(t) => lines.push(t.clone()),
                Block::Task(e) => lines.extend(e.lines()),
            }
        }
        if lines.is_empty() {
            return String::new();
        }
        let nl = if self.crlf { "\r\n" } else { "\n" };
        lines.join(nl) + nl
    }

    /// Puts a task at the end of its chat's section (tasks without a chat go above the first
    /// heading), starting a new `## chat` section if there isn't one.
    fn insert(&mut self, e: Entry) {
        let chat = e.task.chat.clone();
        let first_heading = self.blocks.iter().position(is_heading).unwrap_or(self.blocks.len());
        let (start, end) = if chat.is_empty() {
            (0, first_heading)
        } else if let Some(h) = self.blocks.iter().position(|b| matches!(b, Block::Text(t) if heading(t).as_deref() == Some(&chat))) {
            let next = self.blocks[h + 1..].iter().position(is_heading).map_or(self.blocks.len(), |n| h + 1 + n);
            (h + 1, next)
        } else {
            while self.blocks.last().is_some_and(is_blank) {
                self.blocks.pop();
            }
            if !self.blocks.is_empty() {
                self.blocks.push(Block::Text(String::new()));
            }
            self.blocks.push(Block::Text(format!("## {chat}")));
            self.blocks.push(Block::Text(String::new()));
            self.blocks.push(Block::Task(e));
            return;
        };
        let mut pos = end;
        while pos > start && is_blank(&self.blocks[pos - 1]) {
            pos -= 1;
        }
        let mut new = vec![];
        if pos > 0 && (is_heading(&self.blocks[pos - 1]) || matches!(&self.blocks[pos - 1], Block::Text(t) if t.starts_with("<!--") || t.ends_with("-->"))) {
            new.push(Block::Text(String::new()));
        }
        new.push(Block::Task(e));
        if pos < self.blocks.len() && !is_blank(&self.blocks[pos]) {
            new.push(Block::Text(String::new()));
        }
        self.blocks.splice(pos..pos, new);
    }

    /// Drops `## chat` headings left with nothing under them.
    fn tidy(&mut self) {
        let mut i = 0;
        while i < self.blocks.len() {
            if is_heading(&self.blocks[i]) {
                let next = self.blocks[i + 1..].iter().position(is_heading).map_or(self.blocks.len(), |n| i + 1 + n);
                if self.blocks[i + 1..next].iter().all(is_blank) {
                    let from = if next == self.blocks.len() {
                        // Last section: also drop the blank lines before it.
                        let mut f = i;
                        while f > 0 && is_blank(&self.blocks[f - 1]) {
                            f -= 1;
                        }
                        f
                    } else {
                        i
                    };
                    self.blocks.drain(from..next);
                    i = from;
                    continue;
                }
            }
            i += 1;
        }
    }

    pub fn add(&mut self, t: NewTask) -> i64 {
        let id = self.max_id() + 1;
        let task = Task {
            id,
            title: one_line(t.title),
            details: t.details.trim_end().to_string(),
            agent: one_line(t.agent),
            chat: one_line(t.chat),
            link: t.link.trim().to_string(),
            created_at: now(),
            done_at: None,
            priority: t.priority,
            due: t.due.map(String::from),
            mydesk: t.mydesk,
        };
        let desk = t.mydesk.then(today);
        self.insert(Entry { task, extras: vec![], raw: None, desk });
        id
    }

    pub fn update(&mut self, id: i64, c: Changes) -> bool {
        let Some(pos) = self.position(id) else { return false };
        let Block::Task(e) = &mut self.blocks[pos] else { return false };
        e.raw = None;
        let t = &mut e.task;
        if let Some(v) = c.title {
            t.title = one_line(v);
        }
        if let Some(v) = c.details {
            t.details = v.trim_end().to_string();
        }
        if let Some(v) = c.link {
            t.link = v.trim().to_string();
        }
        if let Some(v) = c.priority {
            t.priority = v;
        }
        if let Some(v) = c.due {
            t.due = v.map(String::from);
        }
        if let Some(v) = c.mydesk {
            t.mydesk = v;
            e.desk = v.then(today);
        }
        if let Some(chat) = c.chat.map(one_line).filter(|c| *c != t.chat) {
            let Block::Task(mut e) = self.blocks.remove(pos) else { unreachable!() };
            if pos < self.blocks.len() && pos > 0 && is_blank(&self.blocks[pos - 1]) && is_blank(&self.blocks[pos]) {
                self.blocks.remove(pos);
            }
            e.task.chat = chat;
            self.insert(e);
            self.tidy();
        }
        true
    }

    pub fn set_done(&mut self, id: i64, done: bool) -> bool {
        let Some(e) = self.entry_mut(id) else { return false };
        if e.task.done_at.is_some() != done {
            e.task.done_at = done.then(now);
            e.raw = None;
        }
        true
    }

    pub fn delete(&mut self, id: i64) -> bool {
        let Some(pos) = self.position(id) else { return false };
        self.blocks.remove(pos);
        // Don't leave a double blank line behind.
        if pos < self.blocks.len() && pos > 0 && is_blank(&self.blocks[pos - 1]) && is_blank(&self.blocks[pos]) {
            self.blocks.remove(pos);
        }
        self.tidy();
        true
    }

    /// Exactly these tasks on the desk; everything else off it.
    pub fn set_desk(&mut self, ids: &[i64]) {
        for e in self.entries_mut() {
            let on = ids.contains(&e.task.id);
            if e.task.mydesk != on {
                e.task.mydesk = on;
                e.desk = on.then(today);
                e.raw = None;
            }
        }
    }
}

const DAY: i64 = 86400;

/// What the window shows: every open task plus things finished in the last week, newest first.
pub fn for_ui(list: &List) -> Vec<Task> {
    let cutoff = now() - 7 * DAY;
    let mut v: Vec<Task> = list.tasks().filter(|t| t.done_at.is_none_or(|d| d > cutoff)).cloned().collect();
    v.sort_by_key(|t| (t.done_at.is_some(), std::cmp::Reverse(t.done_at.unwrap_or(t.created_at))));
    v
}

/// For agents. `status`: "open", "done" or anything else for both; finished tasks only from
/// the last two weeks. `chat`: case-insensitive substring. Most urgent first.
pub fn for_agents(list: &List, status: &str, chat: Option<&str>, desk_only: bool) -> Vec<Task> {
    let cutoff = now() - 14 * DAY;
    let chat = chat.map(str::to_lowercase);
    let mut v: Vec<Task> = list
        .tasks()
        .filter(|t| match status {
            "open" => t.done_at.is_none(),
            "done" => t.done_at.is_some(),
            _ => true,
        })
        .filter(|t| t.done_at.is_none_or(|d| d > cutoff))
        .filter(|t| chat.as_deref().is_none_or(|c| t.chat.to_lowercase().contains(c)))
        .filter(|t| !desk_only || t.mydesk)
        .cloned()
        .collect();
    v.sort_by_key(|t| {
        (t.done_at.is_some(), t.priority.is_none(), t.priority, std::cmp::Reverse(t.done_at.unwrap_or(t.created_at)))
    });
    v.truncate(200);
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "# My list\n\nSome notes I keep here.\n\n- [ ] Mine @added(2026-11-04 09:00) @id(3)\n\n## Billing\n\n- [ ] Add key @priority(1) @repeat(weekly) #ops @from(claude-code) @link(https://x.com/a_(b)) @added(2026-11-04 10:12) @id(7)\n  Line one (with parens)\n\n  Line three\n- [x] Approve PR @from(codex) @added(2026-11-04 09:49) @done(2026-11-04 10:12) @id(4)\n\n## Other\n\nfree text\n";

    #[test]
    fn untouched_files_round_trip() {
        let list = parse(SAMPLE);
        // Has tasks but no header yet, so only the header is added.
        let out = list.render();
        assert!(out.starts_with("<!-- TinyTasks"));
        assert!(out.ends_with(SAMPLE));
        let again = parse(&out).render();
        assert_eq!(again, out);
    }

    #[test]
    fn reads_attributes() {
        let list = parse(SAMPLE);
        let t = list.get(7).unwrap();
        assert_eq!(t.title, "Add key");
        assert_eq!(t.chat, "Billing");
        assert_eq!(t.priority, Some(1));
        assert_eq!(t.agent, "claude-code");
        assert_eq!(t.link, "https://x.com/a_(b)");
        assert_eq!(t.details, "Line one (with parens)\n\nLine three");
        assert!(list.get(4).unwrap().done_at.is_some());
        assert_eq!(list.get(3).unwrap().chat, "");
    }

    #[test]
    fn edits_keep_unknown_bits_and_fill_ids() {
        let mut list = parse(SAMPLE);
        assert!(list.update(7, Changes { due: Some(Some("2026-11-06")), mydesk: Some(true), ..Default::default() }));
        let out = list.render();
        assert!(out.contains("@repeat(weekly) #ops"), "{out}");
        assert!(out.contains(&format!("@due(2026-11-06) @mydesk({})", today())), "{out}");
        assert!(out.contains("@link(https://x.com/a_%28b%29)"), "{out}");
        assert!(out.contains("free text"));

        let mut list = parse("- [ ] typed by hand\n- [ ] another\n");
        assert_eq!(list.tasks().map(|t| t.id).collect::<Vec<_>>(), vec![1, 2]);
        let id = list.add(NewTask { title: "new", details: "", agent: "x", chat: "Chat A", link: "", priority: None, due: None, mydesk: false });
        assert_eq!(id, 3);
        let out = list.render();
        assert!(out.contains("## Chat A\n\n- [ ] new"), "{out}");
        assert!(out.contains("typed by hand @added("), "{out}");
    }

    #[test]
    fn the_desk_lasts_a_day() {
        let text = format!(
            "- [ ] old @mydesk(2020-01-01) @added(2026-11-04 09:00) @id(1)\n\
             - [ ] typed @mydesk(today) @added(2026-11-04 09:00) @id(2)\n\
             - [ ] bare @mydesk @added(2026-11-04 09:00) @id(3)\n\
             - [ ] current @mydesk({}) @added(2026-11-04 09:00) @id(4)\n",
            today()
        );
        let list = parse(&text);
        let desk: Vec<i64> = list.tasks().filter(|t| t.mydesk).map(|t| t.id).collect();
        assert_eq!(desk, vec![2, 3, 4]);
        let out = list.render();
        assert!(!out.contains("2020-01-01"), "{out}");
        assert_eq!(out.matches(&format!("@mydesk({})", today())).count(), 3, "{out}");
        assert!(!out.contains("@mydesk(today)") || out.contains("write @mydesk(today)"), "{out}");
    }

    #[test]
    fn moving_and_deleting_tidy_up() {
        let mut list = parse(SAMPLE);
        list.update(7, Changes { chat: Some("Other"), ..Default::default() });
        list.delete(4);
        let out = list.render();
        assert!(!out.contains("## Billing"), "{out}");
        assert!(out.contains("## Other\n\nfree text\n\n- [ ] Add key") || out.contains("## Other\n\nfree text\n- [ ] Add key"), "{out}");
        let mut list = parse(&out);
        list.add(NewTask { title: "top", details: "", agent: "", chat: "", link: "", priority: None, due: None, mydesk: true });
        let out = list.render();
        assert!(out.contains("- [ ] Mine"), "{out}");
        assert!(out.find("- [ ] top").unwrap() < out.find("## Other").unwrap(), "{out}");
    }
}
