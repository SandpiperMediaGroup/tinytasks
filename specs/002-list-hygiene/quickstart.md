# Validation Guide: List Cleanup and Agent Hygiene

This guide is for implementation validation after the planned changes exist. These commands and
scenarios were not executed as application tests during the planning-only pass.

## Prerequisites

Use the repository's supported Rust/Tauri toolchain and existing Playwright setup. Current source
baseline is v0.3.6; no production task folder is required. Tests must use temporary task/state
folders. `scripts/mcp-smoke.py` already creates these and disables launching the user's app.

From the repository root after implementing this feature:

```sh
cargo test --offline
cargo build --offline
python3 scripts/mcp-smoke.py
SIDEBAR_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
LIST_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
```

If Playwright is installed elsewhere, set the repository's existing PLAYWRIGHT_MODULE and
PLAYWRIGHT_CHROMIUM_EXECUTABLE overrides. Do not install or upgrade unrelated dependencies just
to run a test. Inspect screenshots in artifacts/sidebar-interactions and artifacts/list-interactions.

## Storage and archive checks

Extend Rust tests near existing archive_chat_files/recover_archive tests. Use synthetic fixtures
and injected replacement-failure points rather than the user's folder.

1. Include Personal, two empty named lists, a notes-only list, an open root, a completed root
   older than fourteen days, a child, duplicate headings with a task in one occurrence, a fenced
   checkbox example, unknown comments, and CRLF lines. Preview/apply must select only the three
   truly task-free named lists. Verify every moved byte and every unaffected active section.
2. Add a task after preview, before apply. Apply must reread under lock and skip that list.
3. Stop after journal write, after archive replacement, and after active replacement. Restart
   recovery must produce exactly one archival copy and the expected active file. A third-party
   file edit must retain journal and both files with a conflict error.
4. Fail archive replacement, active replacement, and journal removal. No success count is
   returned before completion; no direct overwrite fallback truncates an existing file.
5. Retry cleanup after completion/recovery: no new archive content, count zero. Confirm a
   notes-only list's unknown content is preserved and old completed tasks protect their list.
6. For ordinary nonempty archiving, verify source metadata is copied appropriately and shared
   question history remains in active metadata; pending questions withdraw under feature 004's
   hook. Empty cleanup must not touch any task-related metadata namespace.

## MCP round trip

Extend the actual stdio smoke script rather than relying solely on a UI mock. Initialize a client,
list modern tool schemas, and use the arguments/results from [contracts/mcp.md](contracts/mcp.md).

1. Enumerate 250 tasks including old completions in pages of 100. Verify exactly 250 unique
   task references and an explicit final next_cursor:null. Enumerate empty lists too. Change the
   file mid-scan and verify stale_cursor requires restart; change filters and verify rejection.
2. For a legacy task with uid:null, call ensure_task_identity using the discovery snapshot and
   a new request identity. Verify its numeric ID/title/list stay the same and it gains a stable
   UID. Retry the same request after the file changed: the receipt replays the original UID.
3. Create one explicit project list with a purpose, then create tasks from ten source conversations
   into that same destination. Verify one sidebar home and ten preserved source attributions.
4. Create a root without a destination: it belongs to Personal. Use a misspelled named destination:
   unknown_list and no new heading. Case-insensitive unique matches reuse the existing name;
   ambiguous hand-edited names return choices without writes.
5. Retry the identical create request three times, including after process restart. Expect the same
   generated IDs/UIDs and exactly one set of tasks. Change payload with the same request_id: conflict.
   Delete/archive the original result, then retry: original historical receipt, no recreated work.
6. Move/update a parent through update_task_v2. Verify child destination follows it while individual
   source identities and UIDs remain unchanged. Reuse an old numeric ID with a different UID:
   stale_task_reference, never an update to the new task.
7. Run existing add_tasks/list_tasks/update_task smoke cases unchanged. Old result shapes and chat
   behavior remain; new server guidance directs upgraded clients to the modern contracts.
8. Add unknown root and record fields to the metadata, mutate source data, and verify they survive.
   Future schema_version, malformed known state, and duplicate UIDs must reject new writes.

## Sidebar interactions

Run the focused sidebar fixture at narrow and wide viewport sizes. Right-click blank sidebar
space, Lists & Chats heading, and an individual list; each must expose the same global archive action
entry separately from single-list archive. Exercise keyboard menu opening and focus return.

- Zero candidates: disabled action; stale enabled invocation: silent no-op.
- Three candidates: one action, no dialog, quiet sidebar update, no success banner or layout shift.
- Active selected list archived: All selected. Unrelated active list: unchanged.
- Icon/order preferences: only removed names pruned; unrelated entries unchanged.
- Task/list draft save failure: draft stays visible and archive command is never invoked.
- Archive error: original navigation/preferences remain and failure is shown.

The browser fixture must not claim a real Windows filesystem transaction was verified. Run the
archive/replacement recovery suite on both macOS and Windows before release; record platform,
command and result. Native file replacement failures are a release gate for durable-write claims.

## Acceptance and handoff

Use the requirement matrix in [plan.md](plan.md) to connect evidence to FR-001–013 and SC-001–006.
Retain failing fixtures and platform limitations explicitly. Product tests pass only after real
implementation; this guide's existence is not an implementation verification result.
