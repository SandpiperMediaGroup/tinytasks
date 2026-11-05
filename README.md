# TinyTasks

A sticky note for the things your AI agents tell **you** to do.

When an agent hands you a to-do ("add the API key in Vercel", "approve the PR"), it drops it on
TinyTasks over MCP. You get a desktop notification, the tray icon shows how many are open, and you
check them off. The agent can see what you finished. No projects, no subtasks, no snoozing.

![TinyTasks in light and dark mode](docs/screenshot.png)

Built with Rust + [Tauri](https://tauri.app). Tested on Windows; macOS builds from the same code
but hasn't been tried yet.

## Using it

- **Click a task's text** to edit it directly. Click away or press Enter to save a title;
  use Ctrl/Cmd+Enter for details. Escape cancels. Click the rest of the row to open its details.
- **Pin a task** from its details to open an individual sticky note on your desktop. Notes
  stay above other windows and edits sync with the list. Close a note to dismiss it without
  deleting the task. Notes last for the current app session; pin again to reopen one.
- **Display properties** (the sliders at the top right) lets you show or hide ID, agent,
  chat, priority, due date, added/completed time, and a details preview. Choices are remembered.
- **+** adds your own task. Agents see those too.
- **Priority** (P0 to P3) and a **due date** can be set by you (flag and calendar in the details)
  or by the agent.
- **Your desk** is what you're focusing on today. Ask an agent "what should I focus on?" and it
  puts a few tasks there, or use the lamp in a task's details. The desk clears overnight.
- **Click the title** to switch between Tasks, My desk and Completed, or to change where the list
  is kept.
- **Group** by time added, chat, agent, priority or due date. Pick Priority again to flip the order.
  Click a group header to collapse or expand it; each view remembers collapsed groups.

The [subtask design mock](docs/mockups/subtasks.html) previews checklists and ordered steps.
Subtasks are a proposal awaiting design review, not yet a live feature.

## Build

Needs [Rust](https://rustup.rs).

```bash
cargo build --release
```

Run `target/release/tinytasks` and it opens. For an installer (and on macOS, where notifications
need a bundled `.app`), use `cargo install tauri-cli --version "^2"` then `cargo tauri build`.

## Connect your agents

The same binary is the MCP server: `tinytasks mcp`. Agents start the app for you if it isn't running.

Claude Code:

```bash
claude mcp add tinytasks -s user -- /path/to/tinytasks mcp
```

Codex:

```bash
codex mcp add tinytasks -- /path/to/tinytasks mcp
```

Anything else that takes an MCP config:

```json
{ "mcpServers": { "tinytasks": { "command": "/path/to/tinytasks", "args": ["mcp"] } } }
```

Agents get `add_tasks`, `list_tasks`, `update_task`, `complete_tasks`, `remove_tasks` and
`set_desk`. Then tell your agent to use them, e.g. in `CLAUDE.md` or `AGENTS.md`:

> When you give me something I have to do myself, add it to TinyTasks with `add_tasks` (name
> this chat in `chat`, add a link back if you have one). When resuming, check `list_tasks` for
> what I've finished. When I ask what to focus on, put a few tasks on my desk with `set_desk`.

A chat that was already open when you added TinyTasks won't see the tools; start a new one.

## Your list is a markdown file

Tasks live in `~/.tinytasks/tasks.md`. To keep them somewhere else, like a Google Drive folder,
click the title and choose **Change folder…**. Your list moves there, or, if that folder already
has one (from your other computer, say), TinyTasks uses it. Each computer notifies you once per
new task.

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

TinyTasks keeps anything it doesn't use (other `@tags`, notes) exactly as you wrote it, and
grouping and sorting in the window never reorder the file.

## Contributing

PRs welcome. Keep it tiny.

## License

[MIT](LICENSE). Agent logos from [Simple Icons](https://simpleicons.org) (CC0) and
[Lobe Icons](https://lobehub.com/icons) (MIT); they're trademarks of their owners.
