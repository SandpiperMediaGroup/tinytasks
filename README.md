# TinyTasks

A sticky note for the things your AI agents tell **you** to do.

When an agent hands you a to-do ("add the API key in Vercel", "approve the PR"), it drops it on
TinyTasks over MCP. You get a desktop notification, the tray icon shows how many are open, and you
check them off. The agent can see what you finished. That's it: no due dates, no projects.

You can add your own with **+** too, and agents see those as well.

![TinyTasks in light and dark mode](docs/screenshot.png)

Windows and macOS. Built with Rust + [Tauri](https://tauri.app).

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

Then tell your agent to use it, e.g. in `CLAUDE.md` or `AGENTS.md`:

> When you give me something I have to do myself, add it to TinyTasks with `add_tasks` (name
> this chat in `chat`, add a link back if you have one). When resuming, check `list_tasks` for
> what I've finished.

Tasks are stored in `~/.tinytasks/tasks.db`.

## Contributing

PRs welcome. Keep it tiny.

## License

[MIT](LICENSE). Agent logos from [Simple Icons](https://simpleicons.org) (CC0) and
[Lobe Icons](https://lobehub.com/icons) (MIT); they're trademarks of their owners.
