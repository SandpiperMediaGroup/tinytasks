# Research: Agent questions

Date: 2026-11-20. Baseline: TinyTasks 0.3.6 at `8bf6ba2`; Spec Kit 1.4.3.

## 1. Keep optional, portable tools

**Decision:** Add question publication, response listing, withdrawal, and receipt tools to the existing stdio server. User answer submission is a desktop bridge command. Only explicit portable tools ship. No blocking waits or host connectors. Retrieval is immediate and paginated; do not add a blocking wait tool initially.

**Rationale/evidence:** `src/mcp.rs::run` handles each JSON-RPC input synchronously. There is no host-chat bridge or event delivery back to an agent. Existing `list_tasks` already provides a pull model. A long blocking answer wait would occupy this process and introduce timeout assumptions without a proven client contract.

**Alternatives:** Native question interception (deferred by user); assume MCP elicitation mirrors arbitrary host questions (different ownership); hold the synchronous MCP server open indefinitely (poor concurrency/recovery).

## 2. Reuse the feature 002 durable envelope and identity foundation

**Decision:** Add a `questions` namespace inside the shared `<!-- tinytasks-agent-state ... -->` envelope with `schema_version: 1`, `store_uuid`, immutable task `@uid(...)`, source tuple `{client_id, conversation_id}`, and the common request ledger. Use opaque UUID strings for question, revision, response, and receipt identities. Depend on feature 002's storage foundation, not on the cleanup UI.

**Rationale/evidence:** `src/store.rs::max_id` can reuse numeric task IDs after removal, so historical answers must bind to task UID, never numeric ID alone. Daily `tinytasks-desk` metadata expires and is typed/deserialized by old binaries; question history cannot live there. The parser already retains unknown attributes and comments, giving a compatible envelope transport.

**Alternatives:** A separate answers database would require another transaction and synchronization system. Reusing numeric IDs risks binding old answers to new tasks. Inserting answer text into ordinary details would make it editable without response/revision rules.

## 3. Commit response and retry record together

**Decision:** Within the existing same-computer file lock, load fresh state and validate request structure, schema and store identity. Check the agent request ledger or human response retry index before validating mutable task/current-question/revision state. Only a new request then compares the expected current revision and commits its state and retry result in the same atomic replacement. The immutable Response itself is the human retry record; agent publication/withdrawal/acknowledgment use the shared agent ledger. Same identity plus same canonical request replays its result; changed content conflicts. First valid final response wins per revision.

**Rationale/evidence:** `store::change` already provides the critical section. However, `store::write` currently falls back to truncating `fs::write` if rename fails. Feature 002 must remove that fallback for durable state and journal writes; otherwise an answer can be reported as durable with weakened atomicity. Filesystem replacement failures must preserve the previous active file and return an error.

**Alternatives:** UI-only button disabling cannot prevent duplicate clients. Recording receipts on read conflates seeing a result with explicit acknowledgment. Separate response/ledger writes can duplicate a submission after a crash.

## 4. Keep immutable revision history

**Decision:** A question family has one active revision reference. Each revision stores immutable prompt/options/constraints plus lifecycle disposition and optional immutable response. Replacement explicitly supersedes the former pending revision; after an answer, a new question revision is required for a changed answer. One pending question per task UID across all sources. A different source receives `pending_question_exists`, not an automatic takeover.

**Rationale:** This satisfies one final answer per revision while retaining what the user actually answered. A mutable question body paired with an old response could misrepresent that answer.

**Alternatives:** In-place prompt edits lose historical meaning; silently editing submitted answers makes receipts unreliable; multiple simultaneous questions complicate the small details UI.

## 5. Reconcile deletion and archival explicitly

**Decision:** New desktop and MCP task deletion paths withdraw unanswered questions in the same commit. Ordinary list archive/delete must compute removed UIDs and update active question metadata within feature 002's journalled transaction; retain question/response history in the active file. Direct file edits are reconciled by UID in the watcher transaction and before question mutations; query projections show missing-task pending questions as unavailable immediately. Completion does not withdraw.

**Rationale/evidence:** `delete_chat` and `archive_chat_files` currently edit raw text independently of `store::change`; merely adding a hook inside `List::delete` would miss list-level operations. `app.rs::watch` already notices file changes and normalizes state. History must survive deletion/archival while refusing stale new answers.

**Alternatives:** Deleting history when the task disappears loses unread responses; moving the only receipt copy into archive prevents requesting agents from retrieving it.

## 6. Preserve drafts separately from task text edits

**Decision:** Add a `QuestionController` in `ui/questions.js`. Keep drafts in a Map keyed by `{store_uuid, question_id, revision_id}` for the current window session. Render controls with text nodes, radio/checkbox groups, labels, a textarea where permitted, and explicit Send answer / Decline. Rerenders and accordion collapse recover drafts. Revision replacement invalidates the old draft without auto-submitting it.

**Rationale/evidence:** `ui/app.js::render` replaces row DOM, and existing `finishEditing` handles task text saves on navigation. Question choices must not join that auto-save-to-submission path. Active question inputs must be excluded from row dragging/toggling. Status refreshes must not erase typed text.

**Alternatives:** DOM-only drafts disappear during watcher refresh; persisting a selected default as a response violates explicit submission; putting controls into the existing editable paragraph conflates descriptions and decisions.

## 7. Compatibility and trust limits

**Decision:** Require the updated desktop and MCP server for guaranteed question semantics. Preserve unknown envelope namespaces/record fields, reject unsupported future schema writes, and surface malformed/duplicate metadata without silently resetting it. Source tuple and opaque IDs are correlation values, not authentication. No new model-driven answer tool is advertised to ordinary agents.

**Rationale:** Old clients can preserve bytes but cannot enforce revision/receipt semantics. A local Markdown file remains editable by the user; concurrent cross-computer cloud writes remain subject to the documented conflict limitation. An adapter must demonstrate human submission in the originating client before its submission route is enabled.

**Alternatives:** Claim universal mixed-version safety or automatic cross-app resumption without a demonstrated integration.

## Final scope decision

User superseded native-connector scope on 2026-11-20. Implement only the portable explicit MCP
publication, human answer, retrieval and receipt path. No hook helper, native batch or local route
registry. Reuse the shared metadata/service and small vanilla details controller.
