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
**My Desk**, **Today** (due today or overdue), **Upcoming** (due after today), and **All**,
followed by **Lists & Chats**. These lists are the same chat sections in `tasks.md`.
Empty lists are saved in the file and can sync between computers.

- Double-click empty sidebar space, or use its **+**, to create a list.
- Drag a task to another sidebar list or a list section on the canvas when grouped by
  **Lists & Chats**. Empty and collapsed sections accept drops too. A parent takes its
  subtasks with it, preserving their order.
- Right-click a task and choose **Move to list…**, or click the list name in its row.
  Both open the same picker, with existing lists and **New list…**. For subtasks, the
  picker moves the parent and its steps together.
- Lists use their agent's icon, or a four-pointed star when no agent is available.
  Click the icon in the sidebar to choose from the outline symbol palette. When the list
  has an agent, its original logo is available at the top of the picker to restore it.
  Choosing a symbol changes the list's appearance and keeps task attribution intact.
  Custom icons appear in the sidebar,
  list group headings, and the move picker. Icon preferences are saved on this computer.

The sidebar preference syncs immediately between the main and Settings windows.
Sticky notes keep their existing paper layout.

## Verification

`cargo test --offline` covers file round trips, including new empty lists and moving a
parent with its children. After `cargo build --offline`, `python scripts/mcp-smoke.py`
checks the real MCP binary against temporary task data.

`node scripts/ui-smoke.cjs` checks the UI with fictional tasks and a mocked desktop
bridge. It includes list creation and movement through row, context-menu, canvas, and
sidebar flows, icon selection, direct property editors, draft retry, settings sync,
completed-child filtering, and narrow/wide layout checks.

Set `LIST_INTERACTIONS_ONLY=1` to run the focused list checks. Screenshots are retained in
`artifacts/list-interactions/`. Set `REVIEW_MOTION=1` to also capture video and stepped
expansion/collapse frames, including normal-speed motion, slowed playback, reversal,
and reduced-motion behavior. Recording is opt-in. Inspect these rendered artifacts
before accepting changes to the transitions.
