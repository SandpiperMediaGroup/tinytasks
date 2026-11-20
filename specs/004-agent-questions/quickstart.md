# Validation guide: Agent questions

These commands and scenarios are for the implementation phase. The new question tools, UI flag,
and test suite described below are planned additions, not features present in v0.3.6. Do not
interpret a test filter matching zero tests as a pass.

## Prerequisites

Implement feature 002's shared storage/identity foundation and this feature's service, bridge,
MCP tools and small details UI. Install the repository's documented Rust/Tauri prerequisites and use the
existing lockfile. Use an available Playwright installation with `PLAYWRIGHT_MODULE` and optional
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`, following README conventions. No dependency upgrades are
required by this validation guide.

## Automated validation after implementation

From the repository root:

```sh
cargo test --offline
cargo build --offline
python3 scripts/mcp-smoke.py
USABILITY_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
```

The implementation adds `questions` domain tests, extends the real MCP smoke script, and adds the
focused UI flag/suite. Record the nonzero question-test count and specific scenario results. The
MCP smoke script already uses temporary task/settings directories and `TINYTASKS_NO_LAUNCH=1`.
The mocked UI suite must use fictional data only and retain screenshots under
`artifacts/questions-interactions/`. Never point tests at the user's live task file.

### Required automated cases

| Layer | Cases and expected results |
| --- | --- |
| Rust question schema | Reject duplicate options, invalid defaults/recommendations, malformed limits, wrong answer modes, blank/oversized text; no disk mutations on errors |
| Rust service round trip | Publish → desktop response service → source-scoped retrieval → explicit receipt; exact answer and source preserved; task not completed |
| Transaction/retry | Same request ID/content returns the original result; changed content conflicts; simultaneous different sends accept one; atomic replacement failure retains prior file |
| Identity/removal | Old numeric task ID reused with a new UID cannot inherit question; parent deletion/list archive withdraw pending state; previous responses remain retrievable |
| Revision/history | Stale form cannot answer newer revision; superseded prompt/options remain historically accurate; receipt targets an exact response even after a new revision |
| Persistence | Restart and local midnight preserve questions/answers/receipts; malformed/future metadata cannot be silently reset |
| MCP inventory | Publish/read/list/withdraw/ack tools appear; no ordinary MCP answer tool appears; legacy tools still work |
| Pagination | More than 100 responses page completely; a receipt during paging causes explicit stale-cursor restart, not silent omission |
| UI explicitness | Opening, selecting a default, closing, switching rows/views, completing task, and desk acceptance create no answer |
| UI controls | Single, multiple, free-text and custom paths; Decline distinct from dismissal; invalid input and failed saves preserve drafts |
| UI refresh | External revision/receipt, store switch, and asynchronous load ordering do not submit old drafts or attach another store's question |
| Accessibility | Keyboard-only flow, accessible names, visible focus, 360/1200px widths, 200% text, reduced motion; controls do not initiate drag or row collapse |

The service round-trip test uses the real Rust domain/store functions for the desktop submission
step; the real MCP smoke test separately verifies wire schemas and the absence of a model answer
tool. A mocked bridge alone is not sufficient evidence for durable delivery.

## Isolated live desktop round trip

Use a separate temporary store and settings directory. Stop an existing TinyTasks desktop instance
first if its single-instance plugin would forward the launch to the existing process; this action
is part of a deliberate test session, not an instruction to close the user's app during planning.

```sh
fixture_dir=$(mktemp -d /tmp/tinytasks-question-check.XXXXXX)
TINYTASKS_DATA_DIR="$fixture_dir/state" \
TINYTASKS_FILE="$fixture_dir/tasks.md" \
  target/debug/tinytasks
```

In a separate terminal or agent test client use the same exact `fixture_dir` path, set
`TINYTASKS_NO_LAUNCH=1`, and launch `target/debug/tinytasks mcp`. The values are scoped to this test,
not global environment settings. Initialize the normal protocol before calling tools.

1. Create a fictional Personal task with feature 002 `create_tasks`. Keep its returned store UUID
   and task UID; for a legacy task use discovery and `ensure_task_identity` first.
2. Publish the following question through `publish_question`, using a unique source tuple and
   request ID plus the returned task reference: “Which review should happen first?” with “Video”,
   “Website”, and “Neither yet”, the first preselected/recommended.
3. In the desktop open details. Close and reopen without sending. Confirm `get_question` remains
   pending, then choose Website and click Send answer.
4. Confirm the card says Answer saved — waiting for agent, not Received. Call
   `list_question_responses` with the original source; verify Website and all correlation IDs.
5. Call `acknowledge_question_response`; confirm Received by agent appears without focus/scroll
   movement. Retry retrieval/acknowledgment and verify no duplicate response/receipt.
6. Publish a fresh revision, disconnect the agent, submit a custom response, and restart the
   isolated app. Reconnect and retrieve/acknowledge that response.
7. Repeat with two conversation IDs sharing the same displayed agent name and confirm separation.
   Delete/archive a task with a pending question and confirm the pending form is no longer answerable.

Expected result: an actual response round trip through the app and real agent protocol, without
changing real user data or claiming that a native host widget was mirrored.

## Acceptance and release evidence

Record: app build, OS, source commit, fixture identity, tool inventory, response/receipt IDs,
nonzero automated test counts, screenshots for each input/state, and any failed scenarios.
No native connector is in scope. Verify agent opt-in publication and retrieval without host hooks.
Cloud folder tests must distinguish eventual file propagation from same-machine transaction safety.


