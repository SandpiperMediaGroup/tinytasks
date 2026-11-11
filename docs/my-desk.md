# My Desk

Version 0.3.0 adds daily arrangements and reviewable agent suggestions. Compatibility change:
the MCP `set_desk` shortcut now creates a pending suggestion instead of replacing the accepted
desk immediately. Use `get_desk` and `suggest_desk` for timed plans.

My Desk arranges existing tasks and subtasks for the current local day. Start times and optional
durations appear beneath task titles. Scheduled tasks appear in time order under **Morning**
(before noon), **Midday** (noon to 2 PM), **Afternoon** (2 to 6 PM), and **Evening** (6 PM onward).
Untimed tasks appear under **Unscheduled**. If every task is untimed, My Desk shows a normal list
without section headings. The timeline stays visible above it. Times are
shown only on My Desk and do not change task due dates, priorities, list membership, or subtask
order. Completing a task here is the same completion as in any other view.

Use **+** to create a new task inline, just as in the other lists. To add an existing task,
find it in its list and choose **Put on My desk**. Click a scheduled time, or choose **Desk time**
below **Due date** in the task's context menu. That action is available for tasks on your desk,
including when you open their menu from another list.

The rotary picker shows the start, end, and duration in the center. Drag either endpoint to adjust
that time, or drag the grip in the middle of the arc to move the whole block. The edited time
snaps to the clock's quarter hours. Moving the block snaps its start and keeps its duration.
The timeline previews dial adjustments as you drag. The dial gives light feedback on supported Mac trackpads. Releasing applies the change, and
Escape cancels an active drag. With a handle focused, use the arrow keys to jump to the next
or previous quarter hour or hold Option (Alt) for one-minute steps. For a task without a
duration, move the end handle to add one. Use the **×** in the lower-left corner to clear the
start and duration. A block must end within the same day.

The timeline starts at **Now** and shows the next six hours, or twelve when the timeline is
at least 960 pixels wide. Tasks in progress start at the left edge, overlapping tasks stack
on separate rows, and tasks with just a start time appear as dots. Hover or focus a marker
to highlight its task row, or click it to edit the time.

Drag a My Desk task onto the timeline to schedule it. The drop indicator snaps to 15-minute
increments from now through the end of today's visible timeline. Dropping applies the start time and opens the dial with the end
handle focused. Dismissing the dial keeps the dropped time.
The timeline is always visible, including when every task is untimed. Escape cancels a drag. Proposed arrangements support the same interaction;
changes stay in the proposal until the whole arrangement is accepted.

The desk's membership, times, and any pending suggestion expire after the local day. The tasks
remain in their lists.

## Agent suggestions

Agents use the local stdio MCP connection already configured for TinyTasks. Reload client tools
or start a new chat after updating TinyTasks to discover the new tools.

1. Call `get_desk` for the user's local `date`, accepted `items`, and
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
and the pending proposal are kept in a single `<!-- tinytasks-desk … -->` JSON
comment at the top of `tasks.md`, outside list sections. Existing files need no migration;
desk tasks without timing data start unscheduled. Markdown viewers hide the comment.

The shared task-file lock and atomic write cover a proposal and its acceptance together.
The app's file watcher refreshes proposals from local MCP clients or a synced folder. The
existing cloud-sync limitation still applies: the lock coordinates writers on one computer,
not simultaneous edits on different computers. Keep unknown metadata and task IDs intact when
editing Markdown directly, and prefer the MCP tools for desk suggestions.
