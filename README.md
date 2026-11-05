# TinyTasks

A sticky note for the things your AI agents tell **you** to do.

When an agent hands you a to-do ("add the API key in Vercel", "approve the PR"), it drops it on
TinyTasks over MCP. You get a desktop notification, the tray icon shows how many are open, and you
check them off. The agent can see what you finished. Keep related steps together as subtasks.

![TinyTasks in light and dark mode](docs/screenshot.png)

Built with Rust + [Tauri](https://tauri.app). Runs on Windows and macOS. The current subtask
and sticky-note interactions have been checked on macOS; Windows still needs that regression pass.

## Set it up with your agent

Give your Dot, Claude, Codex, or other agent this repository URL and ask:

> Set up TinyTasks for me: https://github.com/SandpiperMediaGroup/tinytasks
> Follow its agent setup guide, ask where I want to keep my task list, connect the agents I use,
> and remember when to use TinyTasks for my action items.

**Agents: start with the [agent setup guide](docs/agent-setup.md).** It covers installation,
choosing the task folder, connecting tools, checking access, and saving a durable usage instruction.
Do not assume the user wants the default folder or that every agent has the same configuration.

For multiple computers, we recommend a dedicated **TinyTasks folder in a cloud-synced drive**
you already use, such as Google Drive, Dropbox, OneDrive, or iCloud Drive. Each computer runs
its own app and selects its local copy of that shared folder. A local-only folder works too.
This folder holds your `tasks.md`; you do not need to keep the source-code checkout there.

Prebuilt downloads belong on the repository's [Releases page](https://github.com/SandpiperMediaGroup/tinytasks/releases).
Until a release for your platform is available, use the [source build instructions](#build).

## Using it

- **Click a task's text** to edit it directly. Click away or press Enter to save a title;
  use Ctrl/Cmd+Enter for details. Escape cancels. Click the rest of the row to open its details.
- **Open a sticky note** using the folded-corner note icon in task details. Notes
  use a plain paper surface with text, checkboxes, and subtasks, without the list toolbar,
  metadata, or action strip. Drag the thin top edge to move a note; its quiet close button
  becomes clearer on hover or keyboard focus. Notes stay above other windows and edits sync with the list.
  Close a note to dismiss it without deleting the task. Notes last for the current app session;
  use the note icon again to reopen one.
- **Display properties** (the sliders at the top right) lets you show or hide ID, agent,
  chat, priority, due date, added/completed time, and a details preview. Choices are remembered.
  Hover the row's time indicator for the full added date; completed tasks also show their completion date.
- **+** adds your own task. Agents see those too.
- **Priority** (P0 to P3) and a **due date** can be set by you (flag and calendar in the details)
  or by the agent.
- **Your desk** is what you're focusing on today. Ask an agent "what should I focus on?" and it
  puts a few tasks there, or use the lamp in a task's details. The desk clears overnight.
- **Click the title** to switch between Tasks, My desk and Completed, or to change where the list
  is kept.
- **Group** by time added, chat, agent, priority or due date. Pick Priority again to flip the order.
  Click a group header to collapse or expand it; each view remembers collapsed groups.
- **Subtasks** live in a task's details. Use the **+** beside the sticky-note icon to add the
  first one; the Subtasks header appears once needed, with its own **+** for more. Click its
  text to edit, or the rest of its row to open its own details, priority, due date, and sticky note.
  Use the small **1 / •** chip to switch between numbered steps and a checklist.
- **Drag subtasks** to reorder them, or focus a subtask row and press Alt+Up/Down. Both modes
  remember the same order. Numbers stay muted; the parent's circle shows completion progress.
  Checking a parent completes its remaining subtasks. Checking a subtask leaves the parent
  open; reopening a child also reopens its parent. Deleting a parent deletes its subtasks.
- **Hover controls**: group chevrons appear over their header; the subtask **+** and mode chip
  appear over the Subtasks header. Keyboard focus reveals them too, and touch devices keep
  them visible. Actions inside expanded details remain visible.

Subtasks support one level of nesting. Completed steps stay under their parent, and list/tray
counts count top-level tasks. A subtask on My desk brings its parent into that view for context.

## Build

Needs [Rust](https://rustup.rs) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for your operating system.

```bash
cargo build --release
```

Run `target/release/tinytasks` and it opens. For an installer (and on macOS, where notifications
need a bundled `.app`), use `cargo install tauri-cli --version "^2"` then `cargo tauri build`.

## Connect your agents

The same binary is the MCP server: `tinytasks mcp`, using local stdio transport. Adding tasks
through MCP starts the app if it isn't running. Use the installed executable's absolute path.
For a macOS app installed in Applications, that is
`/Applications/TinyTasks.app/Contents/MacOS/tinytasks`; on Windows, use the installed `tinytasks.exe`.
The GitHub URL is the setup entry point, not an MCP server endpoint.

Claude Code:

```bash
claude mcp add --scope user tinytasks -- /absolute/path/to/tinytasks mcp
```

Codex:

```bash
codex mcp add tinytasks -- /absolute/path/to/tinytasks mcp
```

Dot, Claude Desktop, and other clients: use the client's local MCP settings and the same command
and `mcp` argument. Discover its supported setup flow; the Claude Code command above does not
configure Claude Desktop. For clients accepting the `mcpServers` JSON format:

```json
{ "mcpServers": { "tinytasks": { "command": "/absolute/path/to/tinytasks", "args": ["mcp"] } } }
```

Agents get `add_tasks`, `list_tasks`, `update_task`, `complete_tasks`, `remove_tasks` and
`set_desk`, plus `reorder_subtasks`. Tool access and remembering to use it are separate steps.
Save the following in each agent's supported persistent memory or instructions (for example,
`CLAUDE.md` or `AGENTS.md`, at the scope where you want it to apply):

> Use TinyTasks for action items I, the human, need to do. Check existing tasks before adding
> one so you don't duplicate it. Use `add_tasks` with a consistent `chat` name and a real
> conversation link when available. Keep related steps together as subtasks, ordered when
> sequence matters. Keep your own agent work plan elsewhere. When resuming work, use
> `list_tasks` to see what I've finished. Only mark tasks complete when I say they're done
> or you have verified the outcome. When I ask what to focus on, use `set_desk` for a few
> relevant tasks; the desk resets each day. Report a failed write rather than claiming success.

After connecting a client, start a new chat or reload its tools, then verify `list_tasks` works.
See the [setup guide](docs/agent-setup.md) for cloud-file-only agents and a complete setup check.

To add steps, call `add_tasks` with an existing `parent_id` and a `tasks` array. Array order
becomes the sibling order, and the parent supplies the chat and default conversation link.
Set `ordered: true` for numbered steps, or change the parent's mode later with `update_task`.
Read `list_tasks` with `parent_id` to get all children in saved order (including older completed
steps), then call `reorder_subtasks` with `parent_id` and every child ID exactly once in `ids`.
Stale, duplicate, missing, or unrelated IDs are rejected without changing the file.

## Your list is a markdown file

Tasks live in `~/.tinytasks/tasks.md`. To keep them somewhere else, like a Google Drive folder,
click the title and choose **Change folder…**. Your list moves there, or, if that folder already
has one (from your other computer, say), TinyTasks uses it. Each computer notifies you once per
new task.

Keep the shared folder available offline on each computer and let sync finish before switching
between them. TinyTasks locks writes on one machine; cloud sync does not coordinate simultaneous
writes from different computers. Conflicted copies need reconciliation. Local settings and locks
stay in `~/.tinytasks`; sync the chosen task-data folder, not that settings directory.

Agents that can read your Drive but can't run the MCP server can then read and update the list
too: the file starts with a short comment explaining the format to them. If the folder goes
missing (the sync app isn't running), TinyTasks says so rather than starting a new list.

```markdown
## Stripe billing setup

- [ ] Add the STRIPE_KEY secret in Vercel @priority(1) @due(2026-11-06) @mydesk(2026-11-04) @from(claude-code) @added(2026-11-04 10:12) @id(7)
  Details go on indented lines under the task.
- [x] Approve the PR @from(codex) @added(2026-11-04 09:49) @done(2026-11-04 10:12) @id(4)
```

| In the file | Means |
|---|---|
| `## Heading` | The chat the tasks under it came from |
| `@priority(0-3)` | 0 is most urgent |
| `@due(YYYY-MM-DD)` | Due date |
| `@mydesk(YYYY-MM-DD)` | On your desk that day only; `@mydesk(today)` gets the date filled in |
| `@from(agent)` | Who added it; none means you did |
| `@link(url)` | Back to the chat |
| `@added`, `@done` | When, as `YYYY-MM-DD HH:MM` |
| `@id(n)` | Unique; filled in for tasks you type yourself |
| `@parent(id)` | The parent task's ID; one level of subtasks |
| `@position(n)` | Zero-based sibling order, used in both checklist and numbered modes |
| `@subtasks(ordered)` | On the parent: display its children as numbered steps |

TinyTasks keeps anything it doesn't use (other `@tags`, notes) exactly as you wrote it, and
grouping and sorting in the window never reorder the file.
Subtasks remain top-level checkbox lines in the file; the parent/position attributes describe
their hierarchy. Indented lines remain task details. A missing, self-referencing, or nested
parent link is recovered as an ordinary task so it cannot disappear from the list.

## Checks

`cargo test --offline` covers markdown round trips and subtask behavior. After `cargo build`,
run `python3 scripts/mcp-smoke.py` for the real agent protocol with temporary task/state folders.
With Playwright installed, `node scripts/ui-smoke.cjs` exercises the UI with a mocked desktop
bridge. `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` may point to an existing install.
`TINYTASKS_DATA_DIR` overrides the local settings/lock folder for isolated development checks.

## Contributing

PRs welcome. Keep it tiny.

## License

[MIT](LICENSE). Agent logos from [Simple Icons](https://simpleicons.org) (CC0) and
[Lobe Icons](https://lobehub.com/icons) (MIT); they're trademarks of their owners.
