# Lists & Chats

Double-click the empty canvas below the final task section to start a new task there.
Enter saves and keeps the field ready for another thought; Escape closes it. The **+**
in the toolbar still starts entry at the top. New tasks stay in the selected list;
Today assigns today's due date and Upcoming assigns tomorrow's.

In wide task panes, metadata fits beside the task title. Narrow panes wrap properties
to keep the title readable. Click a due date, priority, or agent to open its editor.
IDs and timestamps remain identifiers and history. The completed/total subtask count
appears beside priority and the added time; **Display properties → Subtask count** hides it.
Turning off **Completed** also hides completed subtasks, while retaining their contribution
to the progress count and the saved numbering of open steps.

Enable **Show sidebar** from the top-left navigation menu or Settings. It contains
**My Desk**, **Today** (due today or overdue), **Upcoming** (due after today), **All**, and **Completed**,
followed by **Lists & Chats**. These lists are the same chat sections in `tasks.md`.
Empty lists are saved in the file and can sync between computers.
They remain available in the sidebar but do not create empty groups in All. Personal tasks
without a named chat also appear as **Personal** in the sidebar.
Opening a list shows its name and icon in the toolbar, without a redundant list group heading.
An enabled sidebar collapses below 720 pixels and returns when the window widens;
your saved preference stays enabled. Enabling it in a narrow window expands the task window.
Drag the divider to resize the sidebar, or focus it and use Left/Right; double-click resets
its width. Task controls stay centered within the row,
independently of the expanded details below it. The symbol picker has 80 icons in
ten complete rows.

- Double-click empty sidebar space, or use its **+**, to create a list. Leaving an untouched
  entry field dismisses it.
- Right-click a sidebar list (or press Shift+F10) to rename it, change its icon, archive it,
  or delete it. Deletion asks for confirmation and removes the entire list and its subtasks.
- Drag lists to reorder them, use Alt+Up/Down on a focused list, or choose Move up/down from
  its context menu. The five main views stay fixed. Width, ordering, and icons save locally.
- Drag a task to another sidebar list or a list section on the canvas when grouped by
  **Lists & Chats**. Collapsed sections and empty sidebar lists accept drops too. A parent takes its
  subtasks with it, preserving their order.
- Right-click a task and choose **Move to list…**, or click the list name in its row.
  Both open the same picker, with existing lists and **New list…**. For subtasks, the
  picker moves the parent and its steps together.
- Lists use their agent's icon, or a four-pointed star when no agent is available.
  Click the icon in the sidebar to choose from the outline symbol palette. When the list
  has an agent, its original logo is available at the top of the picker to restore it.
  Choosing a symbol changes the list's appearance and keeps task attribution intact.
  Custom icons appear in the sidebar,
  list group headings, the toolbar for an open list, and the move picker. Icon preferences are saved on this computer.

The sidebar preference syncs immediately between the main and Settings windows.
Sticky notes keep their existing paper layout.

In Completed, choose **Grouping → Date completed** for Today, Yesterday, This week, and Earlier
groups based on completion time. Group direction and task ordering remain independent.

## Archiving lists

**Archive list** moves the list's Markdown section from `tasks.md` to `archive.md` in the same
folder. It includes open and completed tasks, subtask relationships and order, notes, unknown
attributes, and the original line endings. Existing archive contents stay intact; each archive
operation appends the moved sections. Archived lists disappear from the active views and sidebar.
Personal tasks receive a `## Personal` heading in the archive; the active file's introductory
comments stay in place. Both files can be read with an ordinary Markdown editor.

Archive moves use the task writer lock and a local recovery journal. An interrupted move resumes
without adding another copy. If either file was edited before recovery, TinyTasks preserves both
files and the journal and reports the conflict instead of overwriting the edits.

## Updates and MCP settings

Settings shows the installed version and **Check for updates**. TinyTasks quietly
checks the latest published stable GitHub release once a day; failed background
checks stay quiet. An available update adds a download link in Settings and the main
window. The link opens the release page for manual installation. Version comparisons
follow semantic version precedence, and no automatic installer is involved.

The **MCP server** section shows a copyable stdio configuration using this installation's
executable path and the `mcp` argument. The setup guide explains how to connect your
agent. Each agent launches its own MCP server process; there is no separate service
to enable or port to configure.

## Verification

`cargo test --offline` covers file round trips, including new empty lists and moving a
parent with its children. After `cargo build --offline`, `python scripts/mcp-smoke.py`
checks the real MCP binary against temporary task data.
Storage tests also cover raw archive preservation, duplicate sections, Personal lists, interrupted
moves, write failures, and conflicting edits.

`node scripts/ui-smoke.cjs` checks the UI with fictional tasks and a mocked desktop
bridge. It includes list creation and movement through row, context-menu, canvas, and
sidebar flows, icon selection, direct property editors, draft retry, settings sync,
completed-child filtering, and narrow/wide layout checks. Sidebar checks cover management actions,
confirmation and error states, width/order persistence, pointer cancellation, toolbar icons,
blank-entry blur, plus-icon centering, and relative completion-date groups.

Set `SIDEBAR_INTERACTIONS_ONLY=1` to run those focused checks; screenshots are retained in
`artifacts/sidebar-interactions/`.

Set `LIST_INTERACTIONS_ONLY=1` to run the focused list checks. Screenshots are retained in
`artifacts/list-interactions/`. Set `REVIEW_MOTION=1` to also capture video and stepped
expansion/collapse frames, including normal-speed motion, slowed playback, reversal,
and reduced-motion behavior. Recording is opt-in. Inspect these rendered artifacts
before accepting changes to the transitions.
