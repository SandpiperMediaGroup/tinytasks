# Validation Guide: Desk Guidance and Planning Status

This guide is for implementation verification. It does not claim the planned tools/UI already
exist or that these checks ran during planning. Use fictional tasks and a disposable data folder.

## Prerequisites

- Implement feature 002's shared envelope/source/ledger/UID helpers first; do not require its
  cleanup UI to validate this feature.
- Use the repository's existing Rust/Tauri prerequisites and locked dependencies, Python 3, Node,
  Playwright and its Chromium. `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point to
  existing installations as documented in the README.
- Check that both the test desktop and MCP server are the updated binary. Legacy tool compatibility
  is tested by calling the old tools through the updated server. Mixed old binaries are a separate
  limitation test.

## Automated commands

Run from the repository root after implementing the planned checks:

```sh
cargo test --offline
cargo build --offline
python3 scripts/mcp-smoke.py
DESK_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
```

The MCP smoke script already sets isolated `TINYTASKS_DATA_DIR`, `TINYTASKS_FILE`, and
`TINYTASKS_NO_LAUNCH=1`; extend that harness with the scenarios below. The focused UI run uses
fictional task data and a mocked desktop bridge. Once focused checks pass, run the broader
`node scripts/ui-smoke.cjs` if the changes to shared refresh/sidebar/dialog paths warrant it.

## Protocol and storage scenarios

Use the contract in [planning.md](contracts/planning.md); generate fresh request IDs for distinct
logical operations. Inject clock values in Rust unit tests instead of sleeping five minutes.

| Scenario | Action | Required result |
| --- | --- | --- |
| Idle reads | Initialize MCP; call get_desk and list tasks | No envelope mutation or Building status |
| Explicit begin | Begin run A for returned local date/source | Building with 300s lease; existing accepted desk/proposal unchanged |
| Progress | Report working with a fresh request ID | Same run; extended server timestamps; no task/due-date change |
| Duplicate begin/progress | Retry identical logical requests | Same receipt; no new run and no extra lease extension |
| Request conflict | Reuse a request ID with different body | `idempotency_conflict`; no write |
| Legacy task identity | Discover `uid:null`; call ensure_task_identity with that snapshot; re-read discovery | Stable id+uid reference; stale_snapshot rejects numeric-ID ambiguity |
| Successful submit | Submit valid id+uid references and timing | One proposal and suggested state saved together; user acceptance still required |
| Invalid submit | Duplicate IDs, missing task, mismatched UID, completed task, invalid end time | Error; prior proposal and lease unchanged |
| Captured drag conflict | Send edit_desk_time with a stale expectedItem while a run builds | Timing write rejected; observation and lease unchanged |
| User review during replacement | Begin B with pending P; edit P then accept/decline P | P remains reviewable; observation updates atomically; B can still submit if fresh |
| Superseded run | Begin A then B; send A progress/submit | A rejected, B unchanged |
| Expiry | Advance injected time to 300s without progress | Snapshot interrupted; progress/submit rejected; fresh begin allowed |
| Explicit failure | Report failed with bounded reason | Failed status; no active working indication or desk mutation |
| Restart | Reload state before and after expiry | Current lease remains current; expired run is interrupted |
| Local midnight | Change store day after begin | Old run omitted; old writes rejected; unrelated agent-state data preserved |
| Legacy submit | While A builds call suggest_desk or set_desk | Legacy proposal preserved; A loses ownership and cannot later overwrite it |
| External proposal mutation | Alter proposal ID, then repeat with same ID but changed content | Observation mismatch interrupts; new run required |
| Clock regression | Move clock more than 5s before last accepted activity | Interrupted/clock_changed; no lease extension |
| Failed disk write | Make save fail at commit boundary | No success claim or orphan receipt; accepted desk and old proposal remain recoverable |
| Envelope compatibility | Round-trip old-format desk, unknown fields, future envelope version | Preserve unknown fields; future-version new writes reject without destructive rewrite |

Keep stable UID validation specific to the new submit path. Legacy tools retain existing numeric
IDs and their established input behavior.

## Rendered UI scenarios

At 360px and 1200px widths (also smoke-check the configured 280px minimum), use fixture time rather
than real waiting. Exercise light/dark themes and reduced motion.

1. Emit a successful local begin and measure arrival to visible header/sidebar text under two seconds.
2. Hide the sidebar: the desk header still attributes the active agent.
3. Leave My Desk for a named list, advance time through expiry, and verify the sidebar updates within
   the specified 330s upper bound. Keep a title/details editor focused: its DOM, value and scroll
   position must survive lightweight status updates.
4. Keep a proposal pending and begin a replacement: sidebar remains Review; header shows the
   replacement activity; Accept/Decline remain usable for the existing proposal.
5. Simulate out-of-order get_desk responses, failed reads, failure dismissal, and a new run. Old reads
   cannot revive old status; a new run is not hidden by dismissal of the previous run's message.
6. Verify polite live announcements occur on state changes, not every heartbeat/poll.
7. Start the guide on an empty desk with no proposal. Traverse all five steps, including missing
   anchors, and verify no task/desk mutation calls occur.
8. Repeat with timed tasks and a pending proposal. Underlying Accept/Decline and task controls must
   be inert while the guide is open; illustrations must not route to real handlers.
9. Exercise Back, Next, Finish, Skip, Escape, view change, viewport resize and refresh during a step.
   No clipped buttons, lost focus or resets to step 1 on ordinary refresh.
10. Reload the page: no automatic invitation after dismissal/completion; the Help entry still replays.
11. Try starting with an active text/time draft: show the finish-editing hint, preserve the draft,
    and invoke no save solely for guide startup.

## Native desktop check

For a manual bundled-app check, launch a development build against a temporary folder. Use a
separate process with environment overrides; do not launch the installed personal-task instance.
If the single-instance plugin routes to an existing app, stop and use an isolated test instance
rather than interacting with personal data.

```sh
TINYTASKS_DESK_CHECK=$(mktemp -d)
mkdir -p "$TINYTASKS_DESK_CHECK/state"
printf '%s\n' '# Planning validation' > "$TINYTASKS_DESK_CHECK/tasks.md"
TINYTASKS_DATA_DIR="$TINYTASKS_DESK_CHECK/state" \
TINYTASKS_FILE="$TINYTASKS_DESK_CHECK/tasks.md" \
  target/debug/tinytasks
```

On macOS and Windows, verify modal focus/Tab/Escape behavior, visibility-return expiry, narrow
window placement, VoiceOver/Narrator status naming, and focus restoration after the guide. Record
OS, app version/build commit, window width, and observed outcome. A browser-only pass is not proof
of native focus behavior or successful packaged-app checks.

## Completion evidence

Record command outputs, fixture names, screenshots of Building/Review/interrupted and missing-target
guide states, native platform results, and any unsupported mixed-binary cases. All FR-001–013 and
SC-001–006 must be covered before describing the feature as complete. Keep unresolved native
verification visible in release notes rather than treating it as passed.

## Updated Basics acceptance

The user replaced the guided tour with a static separate Basics window. Open TinyTasks basics from the view menu; verify four concepts, native/Done/Escape close, no task writes and no main-canvas displacement. Earlier invitation/target/replay scenarios no longer apply.
