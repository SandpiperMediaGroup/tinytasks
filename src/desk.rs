//! A day's arrangement is separate from due dates and task/list order. Proposals and
//! accepted times share the task file, so the existing write lock and watcher cover both.
use crate::store::{self, List};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Item {
    pub id: i64,
    #[serde(default)]
    pub start: Option<String>,
    #[serde(default)]
    pub duration: Option<u16>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Proposal {
    pub id: String,
    pub agent: String,
    pub items: Vec<Item>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default)]
struct Saved {
    date: String,
    work_start: String,
    work_end: String,
    items: Vec<Item>,
    proposal: Option<Proposal>,
}

impl Default for Saved {
    fn default() -> Self {
        Self { date: store::today(), work_start: "09:00".into(), work_end: "17:00".into(), items: vec![], proposal: None }
    }
}

#[derive(Serialize)]
pub struct Snapshot {
    pub date: String,
    pub work_start: String,
    pub work_end: String,
    pub items: Vec<Item>,
    pub proposal: Option<Proposal>,
    pub proposal_error: Option<String>,
}

pub fn minutes(time: &str) -> Option<u16> {
    let bytes = time.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' || ![bytes[0], bytes[1], bytes[3], bytes[4]].iter().all(u8::is_ascii_digit) { return None; }
    let hour: u16 = time[..2].parse().ok()?;
    let minute: u16 = time[3..].parse().ok()?;
    (hour < 24 && minute < 60).then_some(hour * 60 + minute)
}

fn hours(start: &str, end: &str) -> Result<(), String> {
    if !matches!((minutes(start), minutes(end)), (Some(a), Some(b)) if a < b) {
        return Err("Work hours need a start and a later end time (HH:MM).".into());
    }
    Ok(())
}

fn saved(list: &List, day: &str) -> Result<Saved, String> {
    let mut saved: Saved = match list.desk_metadata() {
        Some(json) => serde_json::from_str(json).map_err(|_| "The desk data in tasks.md could not be read. Check its tinytasks-desk comment.")?,
        None => Saved::default(),
    };
    hours(&saved.work_start, &saved.work_end)?;
    if saved.date != day {
        saved.date = day.into();
        saved.items.clear();
        saved.proposal = None;
    }
    Ok(saved)
}

fn write(list: &mut List, saved: &Saved) -> Result<(), String> {
    // An agent/client name cannot end the HTML comment or add Markdown task lines.
    let json = serde_json::to_string(saved).map_err(|e| e.to_string())?
        .replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026");
    list.set_desk_metadata(&json);
    Ok(())
}

fn check_day(day: &str) -> Result<(), String> {
    if day != store::today() { return Err("This desk is from another day. Refresh My Desk.".into()); }
    Ok(())
}

fn validate_time(item: &Item) -> Result<(), String> {
    let start = item.start.as_deref().map(|s| minutes(s).ok_or("Start time must be HH:MM.".to_string())).transpose()?;
    if let Some(duration) = item.duration {
        if duration == 0 || duration > 1440 || start.is_none_or(|s| s as u32 + duration as u32 > 1440) {
            return Err("Duration needs a start time, must be positive, and must end within the day.".into());
        }
    }
    Ok(())
}

fn validate(list: &List, items: &[Item]) -> Result<(), String> {
    if items.len() > 200 { return Err("An arrangement can contain at most 200 tasks.".into()); }
    let mut ids = HashSet::new();
    for item in items {
        if !ids.insert(item.id) { return Err("Each task can appear only once in an arrangement.".into()); }
        if !list.get(item.id).is_some_and(|t| t.done_at.is_none()) {
            return Err(format!("Task #{} is no longer available. Decline this suggestion and ask for a new one.", item.id));
        }
        validate_time(item)?;
    }
    Ok(())
}

fn current(list: &List, saved: &Saved) -> Vec<Item> {
    let mut items: Vec<Item> = saved.items.iter().filter(|item| list.get(item.id).is_some_and(|t| t.mydesk && t.done_at.is_none())).cloned().collect();
    for task in list.tasks().filter(|t| t.mydesk && t.done_at.is_none()) {
        if !items.iter().any(|item| item.id == task.id) { items.push(Item { id: task.id, start: None, duration: None }); }
    }
    items
}

/// Deleted task IDs referenced by a pending plan must not be reassigned to a new task.
pub fn reserved_id(list: &List) -> i64 {
    let saved = list.desk_metadata().and_then(|json| serde_json::from_str::<Saved>(json).ok());
    saved.map(|s| s.items.iter().chain(s.proposal.iter().flat_map(|p| &p.items)).map(|item| item.id).max().unwrap_or(0)).unwrap_or(0)
}

pub fn snapshot(list: &List) -> Result<Snapshot, String> {
    let saved = saved(list, &store::today())?;
    let proposal_error = saved.proposal.as_ref().and_then(|p| validate(list, &p.items).err());
    Ok(Snapshot { date: saved.date.clone(), work_start: saved.work_start.clone(), work_end: saved.work_end.clone(),
        items: current(list, &saved), proposal: saved.proposal, proposal_error })
}

fn revision() -> String {
    format!("{}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos(), std::process::id())
}

pub fn suggest(list: &mut List, day: &str, agent: &str, items: Vec<Item>) -> Result<Proposal, String> {
    check_day(day)?;
    validate(list, &items)?;
    let mut saved = saved(list, day)?;
    let proposal = Proposal { id: revision(), agent: agent.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(80).collect(), items };
    saved.items = current(list, &saved);
    saved.proposal = Some(proposal.clone());
    write(list, &saved)?;
    Ok(proposal)
}

fn proposal<'a>(saved: &'a mut Saved, id: &str) -> Result<&'a mut Proposal, String> {
    saved.proposal.as_mut().filter(|p| p.id == id).ok_or("The suggestion changed. Refresh My Desk before reviewing it.".into())
}

pub fn review(list: &mut List, day: &str, id: &str, accept: bool) -> Result<(), String> {
    check_day(day)?;
    let mut saved = saved(list, day)?;
    let items = proposal(&mut saved, id)?.items.clone();
    if accept {
        validate(list, &items)?;
        list.set_desk(&items.iter().map(|item| item.id).collect::<Vec<_>>());
        saved.items = items;
    }
    saved.proposal = None;
    write(list, &saved)
}

pub fn edit_time(list: &mut List, day: &str, item: Item, proposal_id: Option<&str>) -> Result<(), String> {
    check_day(day)?;
    validate_time(&item)?;
    let mut saved = saved(list, day)?;
    if let Some(id) = proposal_id {
        let proposal = proposal(&mut saved, id)?;
        let target = proposal.items.iter_mut().find(|entry| entry.id == item.id).ok_or("That task is no longer in the suggestion.")?;
        *target = item;
        proposal.id = revision();
    } else {
        saved.items = current(list, &saved);
        let target = saved.items.iter_mut().find(|entry| entry.id == item.id).ok_or("That task is no longer on your desk.")?;
        *target = item;
    }
    write(list, &saved)
}

pub fn add_item(list: &mut List, day: &str, id: i64, proposal_id: Option<&str>) -> Result<(), String> {
    check_day(day)?;
    let item = Item { id, start: None, duration: None };
    validate(list, std::slice::from_ref(&item))?;
    let mut saved = saved(list, day)?;
    if let Some(id) = proposal_id {
        let proposal = proposal(&mut saved, id)?;
        if proposal.items.iter().any(|entry| entry.id == item.id) { return Err("That task is already in the suggestion.".into()); }
        if proposal.items.len() >= 200 { return Err("An arrangement can contain at most 200 tasks.".into()); }
        proposal.items.push(item);
        proposal.id = revision();
    } else {
        list.update(id, store::Changes { mydesk: Some(true), ..Default::default() });
        saved.items = current(list, &saved);
    }
    write(list, &saved)
}

pub fn set_hours(list: &mut List, start: &str, end: &str) -> Result<(), String> {
    hours(start, end)?;
    let mut saved = saved(list, &store::today())?;
    saved.work_start = start.into();
    saved.work_end = end.into();
    write(list, &saved)
}

pub fn rollover(list: &mut List) -> Result<(), String> {
    if list.desk_metadata().is_some() {
        let saved = saved(list, &store::today())?;
        write(list, &saved)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn list() -> List { store::parse(&format!("A note.\n\n## Work\n\n- [ ] First @due(2030-01-01) @mydesk({}) @added(2026-11-01 09:00) @id(1)\n- [ ] Second @parent(1) @position(0) @added(2026-11-01 09:00) @id(2)\n", store::today())) }
    fn item(id: i64, start: &str) -> Item { Item { id, start: Some(start.into()), duration: Some(30) } }

    #[test]
    fn suggestions_review_atomically_without_changing_tasks_or_due_dates() {
        let mut list = list();
        let before = list.tasks().cloned().collect::<Vec<_>>();
        let suggestion = suggest(&mut list, &store::today(), "Dot -->\n- [ ] forged", vec![item(2, "10:00")]).unwrap();
        assert_eq!(serde_json::to_value(&before).unwrap(), serde_json::to_value(list.tasks().collect::<Vec<_>>()).unwrap());
        let mut list = store::parse(&list.render());
        assert_eq!(list.tasks().count(), 2);
        assert_eq!(snapshot(&list).unwrap().items[0].id, 1);
        review(&mut list, &store::today(), &suggestion.id, true).unwrap();
        let desk = snapshot(&store::parse(&list.render())).unwrap();
        assert_eq!(desk.items, vec![item(2, "10:00")]);
        assert!(desk.proposal.is_none());
        assert!(!list.get(1).unwrap().mydesk);
        assert_eq!(list.get(1).unwrap().due.as_deref(), Some("2030-01-01"));
        assert_eq!(list.get(2).unwrap().parent_id, Some(1));
        assert!(list.render().contains("A note."));
    }

    #[test]
    fn decline_and_stale_reviews_preserve_the_accepted_desk() {
        let mut list = list();
        let first = suggest(&mut list, &store::today(), "Dot", vec![item(2, "10:00")]).unwrap();
        let second = suggest(&mut list, &store::today(), "Codex", vec![]).unwrap();
        let before = list.render();
        assert!(review(&mut list, &store::today(), &first.id, true).is_err());
        assert_eq!(list.render(), before);
        review(&mut list, &store::today(), &second.id, false).unwrap();
        assert_eq!(snapshot(&list).unwrap().items[0].id, 1);
    }

    #[test]
    fn validates_whole_arrangements_and_rechecks_tasks_when_accepting() {
        let mut list = list();
        for items in [vec![item(99, "10:00")], vec![item(1, "25:00")], vec![item(1, "10:00"), item(1, "11:00")], vec![item(1, "23:50")]] {
            let before = list.render();
            assert!(suggest(&mut list, &store::today(), "Dot", items).is_err());
            assert_eq!(list.render(), before);
        }
        let p = suggest(&mut list, &store::today(), "Dot", vec![item(2, "10:00")]).unwrap();
        list.set_done(2, true);
        let before = list.render();
        assert!(review(&mut list, &store::today(), &p.id, true).is_err());
        assert_eq!(list.render(), before);
    }

    #[test]
    fn edits_proposals_without_changing_accepted_times_and_expires_daily() {
        let mut list = list();
        set_hours(&mut list, "08:30", "16:30").unwrap();
        edit_time(&mut list, &store::today(), item(1, "09:00"), None).unwrap();
        let p = suggest(&mut list, &store::today(), "Dot", vec![item(1, "10:00")]).unwrap();
        edit_time(&mut list, &store::today(), Item { id: 1, start: Some("11:00".into()), duration: None }, Some(&p.id)).unwrap();
        assert!(review(&mut list, &store::today(), &p.id, true).is_err());
        assert_eq!(snapshot(&list).unwrap().items, vec![item(1, "09:00")]);
        let tomorrow = saved(&list, "2099-01-01").unwrap();
        assert!(tomorrow.items.is_empty() && tomorrow.proposal.is_none());
        assert_eq!(tomorrow.work_start, "08:30");
        let before = list.render();
        assert!(edit_time(&mut list, "2000-01-01", item(1, "12:00"), None).is_err());
        assert!(set_hours(&mut list, "17:00", "09:00").is_err());
        assert_eq!(list.render(), before);
    }

    #[test]
    fn manual_additions_pending_edits_and_real_day_rollover_are_separate() {
        let mut list = list();
        let p = suggest(&mut list, &store::today(), "Dot", vec![item(1, "09:00")]).unwrap();
        add_item(&mut list, &store::today(), 2, Some(&p.id)).unwrap();
        let snapshot = snapshot(&list).unwrap();
        assert_eq!(snapshot.items.iter().map(|i| i.id).collect::<Vec<_>>(), vec![1]);
        assert_eq!(snapshot.proposal.unwrap().items.len(), 2);
        assert!(!list.get(2).unwrap().mydesk);
        add_item(&mut list, &store::today(), 2, None).unwrap();
        assert!(list.get(2).unwrap().mydesk);
        set_hours(&mut list, "08:00", "16:00").unwrap();
        let mut old = saved(&list, &store::today()).unwrap();
        old.date = "2000-01-01".into();
        write(&mut list, &old).unwrap();
        let mut list = store::parse(&list.render().replace(&format!("@mydesk({})", store::today()), "@mydesk(2000-01-01)"));
        rollover(&mut list).unwrap();
        let snapshot = super::snapshot(&list).unwrap();
        assert!(snapshot.items.is_empty() && snapshot.proposal.is_none());
        assert_eq!(snapshot.work_start, "08:00");
        assert_eq!(list.tasks().count(), 2);
        assert_eq!(saved(&list, &store::today()).unwrap().date, store::today());
    }

    #[test]
    fn deleting_and_recreating_tasks_cannot_retarget_a_suggestion() {
        let mut list = list();
        let proposal = suggest(&mut list, &store::today(), "Dot", vec![item(2, "10:00")]).unwrap();
        list.delete(2);
        let id = list.add(store::NewTask { title: "Unrelated", details: "", agent: "", chat: "Work", link: "", priority: None, due: None, mydesk: false });
        assert_ne!(id, 2);
        assert!(review(&mut list, &store::today(), &proposal.id, true).is_err());
    }
}
