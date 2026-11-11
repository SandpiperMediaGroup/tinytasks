# Set up TinyTasks for a user

Use this guide when the user asks you to set up TinyTasks from
https://github.com/SandpiperMediaGroup/tinytasks. Adapt it to the tools and permissions available
in your agent client. A repository URL gives you instructions; it does not automatically install
an app, connect tools, or save a memory.

## 1. Establish the user's setup

Inspect the operating system and any existing TinyTasks installation or MCP connection first.
Reuse a working installation and preserve existing tasks and unrelated agent settings.

Ask the user:

> Where would you like your TinyTasks task list to live? For access from multiple computers,
> I recommend a dedicated TinyTasks folder in a cloud-synced drive you already use. A local
> folder works too. Which folder, and which agents should I connect?

Wait for the user's choice before selecting or moving the task file. Reuse an exact location
already specified by the user; do not ask again if it is clear. Use an exact local folder path
after the user chooses. Do not guess a cloud provider or path.
The task-data folder holds `tasks.md`; the app and optional source checkout are separate.
If the user already has a list, establish which list is authoritative before changing its location.

## 2. Install the app

Check the repository's [latest release](https://github.com/SandpiperMediaGroup/tinytasks/releases/latest) for
an installer matching the OS and processor. Use the release's installation instructions and
verify its published checksum when provided. Do not confuse GitHub's source archives with an
app installer or describe an unnotarized build as notarized.

The latest Windows release provides an x64 setup executable and portable ZIP. Run the installer,
or extract the ZIP to a permanent local folder. Settings shows the actual executable path and a
copyable MCP configuration. Locate the installed `tinytasks.exe` before connecting agents.

The latest packaged Mac version is [v0.2.1](https://github.com/SandpiperMediaGroup/tinytasks/releases/tag/v0.2.1),
with a universal DMG and ZIP for Apple silicon and Intel. Both the
app and DMG are Developer ID signed and separately notarized with stapled tickets. On macOS,
prefer the DMG: open it, copy `TinyTasks.app` to `/Applications`, eject the image, and launch
`/Applications/TinyTasks.app`. The ZIP contains the same app. Check `SHA256SUMS.txt` against the
artifact you downloaded. Do not run the MCP server from a mounted DMG or a temporary download folder.

If no suitable release exists, explain that a source build is currently required and follow
the [README build instructions](../README.md#build), including the platform prerequisites.
For macOS source builds, `cargo tauri build --bundles app` produces
`target/release/bundle/macos/TinyTasks.app`.

Record the actual executable path. An agent needs the executable inside the macOS bundle
(`TinyTasks.app/Contents/MacOS/tinytasks`), not the `.app` directory or a disk-image path.
Keep the app installed locally on each computer.

## 3. Select the task folder

Create the chosen folder if it does not exist. In TinyTasks, click the **Tasks** title, choose
**Change folder…**, and select that folder.
Use the app's folder picker to configure it; if you cannot operate it, guide the user through
this step. The app records the location locally for its MCP servers too.

- If the selected folder contains task entries, TinyTasks uses that list; it does not merge
  it with the previous one. The old list stays in its original file.
- Otherwise, TinyTasks copies the current list into the selected folder, preserving any existing
  non-task text and leaving the old file as a backup, or creates an empty list if necessary.
- On another computer, wait for the same cloud folder to sync, install TinyTasks locally, and
  select that computer's local path to the existing list. The paths need not match across computers.

For cloud folders, keep `tasks.md` available offline. Let sync complete before switching machines.
The app's write lock covers one computer only: simultaneous edits on different computers or
through a cloud connector can conflict. Reconcile conflicted copies rather than overwriting them.
Do not sync `~/.tinytasks`, which contains machine-local settings and locks.

Normal setup does not require `TINYTASKS_FILE` or `TINYTASKS_DATA_DIR`. If an existing agent
configuration sets them, check that it points to the intended list: these overrides can make an
agent use a different file from the app.

## 4. Connect each requested agent

TinyTasks is a **local stdio MCP server**. Configure the actual executable as the command and
`mcp` as its argument. The repository URL is not an HTTP MCP endpoint.

The [README](../README.md#connect-your-agents) includes Claude Code and Codex CLI commands and
a generic JSON example. Quote paths containing spaces in shell commands; in JSON, put the path
in the `command` string without adding literal shell quotes. Escape Windows backslashes in JSON.

For Dot, Claude Desktop, or another client, inspect its existing MCP setup or current supported
settings. Merge the TinyTasks entry without replacing other servers. Do not assume a universal
configuration-file path, and do not assume configuring one client configures the others.
If your client cannot launch local processes, do not claim it has local MCP access.

Start a new chat or reload the client's tools after configuration. Verify that TinyTasks tools
are available and call `list_tasks`. Confirm it sees the intended existing list; a successful
empty result alone does not establish that an existing shared list was found.

For day planning, verify `get_desk` and `suggest_desk` are available too. Read the local date and
current arrangement with `get_desk`, then submit existing open tasks with desk-only start times and
optional durations. Suggestions wait for the user's whole-plan Accept/Decline in My Desk;
never report a proposed arrangement as accepted. `set_desk` now creates an untimed suggestion
for review. See [My Desk](my-desk.md) for the tool contract and an example.

## 5. Save the usage instruction

Save the [README's TinyTasks usage instruction](../README.md#connect-your-agents) in each
requested agent's supported persistent memory or instruction file. Use the user's preferred
scope; a project-only instruction will not necessarily apply in other projects. Add to existing
instructions rather than replacing them, and report where you saved it. Do not claim memory
was saved when the client only has this conversation's context.

Alongside the usage instruction, record:

- The task file's exact local path, or the cloud connector's stable file reference.
- How this agent accesses it: TinyTasks MCP or direct cloud-file access.
- The repo URL for setup and tool documentation.

An agent that has only cloud-file access can use the same `tasks.md` if its connector supports
reading and writing that file. Read the latest content and the file-format comment before edits;
preserve IDs, unknown attributes, unrelated tasks, and task details. Use revision checks if the
connector supports them, then read back to verify the change. Do not invent tool availability
or convert the Markdown file into a provider-native document. Prefer MCP when available.

## 6. Verify and hand back

Verify `list_tasks` in each connected client. Offer one clearly named setup-check task to verify
the full path: agent adds it, the user sees and checks it off in the app, then the agent reads
the completed status. Avoid creating separate sample lists or deleting existing tasks as a test.

Report the app location, task-file location, agents verified, and where the usage instructions
were saved. Identify any client that still needs a restart, user interaction, or write access.
Setup is complete when the app and the requested agents agree on the same task list and the
usage instruction is available in future chats.
