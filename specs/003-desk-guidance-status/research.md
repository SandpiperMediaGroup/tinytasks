# Research: My Desk Guidance and Planning Status

Baseline: TinyTasks v0.3.6, commit `8bf6ba2e9c6f76ad6c89e90968b68eb99611672f`.
Research was source inspection and cross-plan coordination, not application execution.

## 1. Preserve planning metadata independently from legacy desk serialization

**Evidence**: `src/desk.rs::Saved` contains date/hours/items/proposal, and `rollover` rewrites it.
Serde's current deserialize/serialize cycle does not preserve unmodeled fields. `src/store.rs`
preserves unrelated raw text blocks and wraps mutations in one file lock and atomic write.

**Decision**: Put `planning` in the shared versioned `tinytasks-agent-state` top-level comment,
using feature 002's `src/agent_state.rs`. Keep legacy desk JSON unchanged. Mutate both comments
within one `store::change` call when submitting or reviewing a proposal.

**Rationale**: The normal v0.3.6 desk rewrite cannot erase fields stored in a different comment.
The new parser validates a schema version and patches owned fields without discarding unknowns.
This avoids separate-file transaction complexity and keeps synced task data together.

**Alternatives considered**: Extending `Saved` directly risks downgrade erasure. A machine-local
sidecar cannot show another computer's planning state. A shared sidecar requires multi-file recovery.
The shared envelope is a dependency, not permission to change feature 002's contract independently.

## 2. Make run ownership and idempotency explicit

**Evidence**: `src/mcp.rs` retains only the MCP client's reported display name, and both desk-write
tools call `desk::suggest` without a run. Multiple conversations can have the same display name.

**Decision**: New begin/report/submit tools require source `{client_id, conversation_id}` plus
optional title/url. They use server-issued UUID `run_id` and the shared request-ledger tuple
`(client_id, conversation_id, operation, request_id)`. Return the prior result for the same request
and payload; reject a different payload under the same key. UUIDs are correlation, not security
capabilities. Source values are supplied by the local cooperating client, not authenticated identity.

**Rationale**: Reconnects and response-loss retries retain semantics without conflating conversations.
A duplicated begin cannot accidentally supersede a newer run; a repeated heartbeat cannot extend a
lease again. The stable result is the receipt; a separately computed `current` snapshot is never
stored in it. Receipt lookup precedes current-state validation. Ownership is checked from the stored
current run, not from display text. New submit refs require the immutable task UID; legacy tasks
with `uid:null` first use feature 002's revision-guarded `ensure_task_identity`, then discovery is
reread after each identity write.

**Alternatives considered**: Process ID or client display name breaks restarts/concurrent chats.
A secret token would imply authorization guarantees that the local shared-file model does not supply.

## 3. Bind active runs to observed proposal state

**Evidence**: `desk::suggest` replaces the proposal; proposal time edits change its ID;
review clears it. Old/direct-file writers can change this data without reporting to the new run.

**Decision**: Store observation `{id, content_sha256}` of the current pending proposal, canonicalized
through the shared hash helper. Validate on every new planning mutation and effective snapshot.
New user proposal edits/reviews update this observation atomically; legacy tool submissions through
the new server invalidate the run atomically. An unexplained mismatch derives interruption and
rejects further mutation, even if a direct editor retained the same proposal ID.

**Rationale**: New clients have a precise current-run boundary, while supported user edits and review
remain usable. The fallback catches old/direct writes on next observation without claiming it can
make arbitrary old binaries participate in the protocol.

**Alternatives considered**: A changed-ID-only check misses same-ID edits. Removing existing proposals
at begin hides useful review work. A hash of the entire task file falsely interrupts every unrelated
edit. Mixed old-writer races remain a documented limit, not an unresolved implementation choice.

## 4. Derive expiry on reads and enforce it on writes

**Evidence**: The app watches file stamps about every 700ms. `ui/app.js` currently refreshes on a
30-second timer only when My Desk is selected. A run can expire without changing the file.

**Decision**: Store server UTC milliseconds with a 300-second lease and local date scope. Derive
interrupted state at snapshot time without a write, and reject expired writes under lock. Refresh
lightweight desk status every 15 seconds for any visible main view, on focus/visibility return,
and existing `tasks-changed`. `get_desk` returns server time and expiry for rendering, not a fake
percentage. Backward clock movement beyond five seconds interrupts, requiring a new run.

**Rationale**: Reads remain side-effect-free and restart uses persisted timing. The timer covers the
sidebar outside My Desk; separate status rendering avoids full task-list replacement while editing.

**Alternatives considered**: File notifications alone miss time passage. A desktop-only countdown
cannot reject late agent writes. Heartbeat on mere connection incorrectly reports agent work.

## 5. Separate static Basics window

User review replaced the guided tour with a native reference window. Reuse Tauri window creation
and existing theme CSS. Four short concepts, no task data writes, no inline invitation, no steps,
no highlight target, and no saved guide preference. This removes permanent task-canvas displacement.

## Research Outcome

All architecture decisions for this phase are resolved. Remaining work is implementation and
verification, especially simultaneous writers, time-boundary fixtures, and native focus behavior.
Native question mirroring and agent launch/resumption are outside this feature.
