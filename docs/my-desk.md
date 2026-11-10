# My Desk

Version 0.3.0 adds daily arrangements and reviewable agent suggestions. Compatibility change:
the MCP `set_desk` shortcut now creates a pending suggestion instead of replacing the accepted
desk immediately. Use `get_desk` and `suggest_desk` for timed plans.

My Desk arranges existing tasks and subtasks for the current local day. It has a compact time
gutter to the left of the checkbox: a start time and an optional duration in minutes. Tasks
follow their start times; untimed tasks appear in a separate **Unscheduled** section. If every
task is untimed, My Desk shows a normal list without a time gutter or timeline. Times are
shown only on My Desk and do not change task due dates, priorities, list membership, or subtask
order. Completing a task here is the same completion as in any other view.

Use **+** to create a new task inline, just as in the other lists. To add an existing task,
find it in its list and choose **Put on My desk**. Click a scheduled time, or choose **Desk time**
below **Due date** in the task's context menu. That action is available for tasks on your desk,
including when you open their menu from another list.

The anchored picker accepts times such as `9:30 AM`, `14:30`, or `930`, with 15-minute suggestions.
The two timing rows use the same compact controls as grouping and ordering. Selecting a time
or duration applies it immediately; typed values apply on Enter or when leaving the field.
Use the **×** inside a field to clear it. Clearing the time also clears its duration.
Choose an optional duration or type one, such as `30 min` or `1h 15m`. Duration requires
a start time and must end within the same day. The timeline uses bars for durations and dots
for start times without a duration, with a labeled pill marking the current time.
Hover or focus a task marker to highlight its row; click to edit its time.
Tasks outside the configured work hours remain in the desk, with only the portion within
work hours shown on the timeline.

Drag a My Desk task onto the timeline to schedule it. The drop indicator snaps to 15-minute
increments within work hours. Dropping applies the start time and opens duration choices;
choosing a duration applies it immediately. Dismissing the choices keeps the dropped time.
If every task is untimed, the timeline appears temporarily while dragging so you can schedule
the first task. Escape cancels a drag. Proposed arrangements support the same interaction;
changes stay in the proposal until the whole arrangement is accepted.

Set **Work starts** and **Work ends** in **Settings → My Desk**. Changing work hours changes the
timeline's range; it does not reschedule tasks. The desk's membership, times, and any pending
suggestion expire after the local day. The tasks and work-hour preference remain.

## Agent suggestions

Agents use the local stdio MCP connection already configured for TinyTasks. Reload client tools
or start a new chat after updating TinyTasks to discover the new tools.

1. Call `get_desk` for the user's local `date`, `work_start`, `work_end`, accepted `items`, and
   any pending `proposal`. Call `list_tasks` to find existing open tasks and their details.
2. Call `suggest_desk` with the date from `get_desk` and the **complete** proposed arrangement.
   Use a small, realistic selection of existing open task or subtask IDs. Each ID appears once.
3. Report that the arrangement is waiting for review. The user sees a **Review** affordance on
   My Desk and one **Accept / Decline** pair for the complete arrangement.

Example tool arguments (use today's actual date and IDs returned by TinyTasks):

```json
{
  "date": "2026-11-10",
  "items": [
    { "id": 12, "start": "09:00", "duration": 30 },
    { "id": 19, "start": "10:15" },
    { "id": 23 }
  ]
}
```

`start` is local 24-hour `HH:MM`; omit it or use `null` for an unscheduled task. `duration` is
optional positive integer minutes, at most 1440, ending within that day. `agent` can provide
a display name; otherwise TinyTasks uses the MCP client's name. An empty `items` array proposes
clearing the desk. New suggestions replace pending suggestions, preserving the accepted desk.

The preview marks additions and time changes. The user can edit its times and create tasks before
accepting. A task the user creates on My Desk also appears in the suggestion, and remains on the
desk if the suggestion is declined. **Decline** removes the proposal and restores the accepted arrangement. **Accept**
applies all proposed desk membership and times together, without changing the underlying task
details or due dates. Review actions check the proposal version and day; accepting also checks
that every task is still open and present. A stale window cannot accept a newer suggestion.

`set_desk` remains as a compatibility shortcut taking `ids`, but now proposes an untimed
arrangement for review. Agents cannot call the app's Accept/Decline command over MCP. Existing
`mydesk` flags on task creation/updates remain direct task edits; use the suggestion tools for
planning a day. TinyTasks does not wake an agent or request schedule adjustments.

## Storage

Tasks keep their existing `@mydesk(YYYY-MM-DD)` membership. Desk times, arrangement order,
work hours, and the pending proposal are kept in a single `<!-- tinytasks-desk … -->` JSON
comment at the top of `tasks.md`, outside list sections. Existing files need no migration;
desk tasks without timing data start unscheduled. Markdown viewers hide the comment.

The shared task-file lock and atomic write cover a proposal and its acceptance together.
The app's file watcher refreshes proposals from local MCP clients or a synced folder. The
existing cloud-sync limitation still applies: the lock coordinates writers on one computer,
not simultaneous edits on different computers. Keep unknown metadata and task IDs intact when
editing Markdown directly, and prefer the MCP tools for desk suggestions.
