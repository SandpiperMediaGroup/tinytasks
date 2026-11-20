# Contract: Questions, answers, and receipts

Implemented v1 contract. Reuse feature 002's source identity, canonical
request ledger, task UID, error envelope, snapshot revisions, cursor encoding, and store identity.
See [data model](../data-model.md) for content validation and lifecycle invariants.

## Wire conventions

- MCP tools stay on the existing stdio `tools/call` transport. Success returns JSON serialized in
  `content[0].text` with `isError:false`; tool errors return the common JSON error object with
  `isError:true`. Do not claim host elicitation or notification capabilities merely to expose tools.
- Question public shapes use snake_case. Tauri invoke arguments use the existing camelCase bridge
  convention; returned models use the same snake_case JSON models as MCP.
- Every mutation carries a stable `request_id` (agent) or `submission_id` (human). Retries reuse
  the original ID and payload. Changed payload under the same identity returns `idempotency_conflict`.
- Canonicalization preserves omitted/null distinctions only where semantically different. Defaults
  are materialized; JSON object keys are recursively sorted. Choice selections are canonicalized
  in declared option order. Include expected revision and source tuple in the canonical request.
- `store_uuid` must equal the currently selected store. `task_ref:{id,uid}` must identify the
  current task; stale numeric ID paired with another UID fails rather than targeting a replacement.
- For legacy tasks, use feature 002 `list_tasks_page` to get `uid:null` and `snapshot_revision`,
  then `ensure_task_identity({task_id,expected_snapshot_revision,source,request_id})`; it returns
  the stable reference. Reads do not assign UIDs. Re-discover after a snapshot conflict.

## Agent tools

### `publish_question`

Required: `store_uuid`, `task_ref`, `source`, `request_id`, `question`.
Optional: `question_id` plus `expected_revision_id` when revising an existing family; either both
are supplied or neither. `question` contains prompt, mode, options, selection limits,
allow_custom, defaults, and optional recommendation as defined by the data model.

Returns `{question: QuestionView, replayed: boolean}`. A new family returns its assigned
`question_id` and `revision_id`. Existing-family revisions require the same source tuple, task UID,
and expected current revision. The previous pending revision becomes withdrawn/superseded and
its history remains. Another pending question on that task produces `pending_question_exists`.

On replay, return the original result even if the task has since disappeared; never resurrect
question state. Replays are identified as such, and current lifecycle state can be read separately.

### `get_question`

Required: `store_uuid`, `source`, `question_id`. Read-only.
Returns `{question: QuestionView}` with current revision, task availability, optional response,
and optional receipt. The source tuple must match the owning family. Display-only title changes
are not ownership changes. The desktop has a separate all-source read projection for the user.

### `list_question_responses`

Required: `store_uuid`, `source`. Optional: `acknowledged` (default false), `limit` (1–100,
default 50), `cursor`.

Returns `{responses:[ResponseView], next_cursor:string|null, has_more:boolean, snapshot_revision:string}`.
Results are scoped to the exact source tuple and ordered by `(submitted_at,response_id)`.
Responses include declined outcomes. `acknowledged:false` means missing receipt, `true` means
present receipt; omitting uses false. To read both, issue the two explicit filters.

Use feature 002's common bounded hex-JSON cursor: endpoint, full active-file SHA-256 revision,
canonical source/filter signature, fixed limit, and next offset. A changed file returns
`stale_cursor`; wrong filters/limit return `cursor_mismatch`. Restart from the first page and
use response IDs for deduplication. Fetching does not acknowledge. Collect a consistent page
sequence before acknowledging, because receipts change the file and invalidate prior cursors.
Unrelated writes can also invalidate a scan; this is an explicit v1 consistency tradeoff, not
silent omission. A result is complete only when next_cursor is null and has_more is false.

`ResponseView` is `{response: Response, answered_revision: AnsweredRevision, source: Source,
receipt: Receipt|null, task_available:boolean}`. AnsweredRevision includes its immutable
question/revision IDs, prompt, mode, ordered options with labels/descriptions, constraints,
defaults, and recommendation from the actual answered revision. It is never replaced by a newer
question revision's wording. An agent receiving historical option IDs can therefore interpret
what the user answered after the question has been replaced or its task removed.

### `acknowledge_question_response`

Required: `store_uuid`, `source`, `question_id`, `revision_id`, `response_id`, `request_id`.
Returns `{receipt: Receipt, replayed:boolean}`. All IDs and owning tuple must match. No content
changes are allowed. If a receipt already exists for that response, return its original identity
and timestamp even when retried with a new request ID. Revision may be historical; receipt still
acknowledges that exact saved response, never a newer answer.

### `withdraw_question`

Required: `store_uuid`, `source`, `question_id`, `expected_revision_id`, `request_id`.
Returns `{question: QuestionView, replayed:boolean}`. A pending current revision becomes
withdrawn/source_withdrew. An already withdrawn current revision is a no-op; an answered or
declined revision cannot be rewritten as withdrawn (`question_resolved`). Stale revisions fail.

No `submit_question_response` agent tool is advertised. Agents may publish, retrieve, withdraw,
and acknowledge; the ordinary MCP tool inventory must not permit answering on the user's behalf.

## Desktop bridge

### `get_task_questions({storeUuid, taskRefs})`

Read-only. At most 200 current task references per call; caller requests visible rows in batches
rather than truncating silently. Returns `{store_uuid,questions:[QuestionView],question_revision}`.
For an entirely legacy store, storeUuid may be null and task references may have uid:null;
return store_uuid:null and no questions without assigning identities. If a previously null
store identity has since been initialized, return store_changed so the UI refreshes its snapshot.
For an existing legacy task with no UID in an initialized store, return no question without assigning one. Missing task
references return an unavailable projection, not another task's questions. This projection is for
the local user and can show all source families associated with the task, current and historical.

### `submit_question_response(...)`

Arguments: `{storeUuid,questionId,expectedRevisionId,submissionId,outcome,answer?}`.
`outcome` is `answered` or `declined`; answer shape must satisfy the revision. Validate with the
lock held, require task availability and pending current revision, save Response and the human
submission receipt atomically, then return `{question: QuestionView,response: Response,replayed}`.

Human submissions use the immutable Response record itself as their retry receipt, not the
agent request ledger. Index responses by `(store_uuid,question_id,revision_id,submission_id)`;
store the normalized `submission_input` alongside the response. After structural/store/schema
validation, check that index before mutable task/current-revision checks. An exact match replays
the original Response and current QuestionView; different input under the same key returns
`idempotency_conflict`. Only this user-response service writes the submission index, so it has
no synthetic client/conversation tuple that an agent request could collide with. A second
distinct submission against a resolved revision returns `question_resolved` plus its result. No implicit completion,
due-date, membership, or receipt change occurs.

`get_task_questions`/submission commands must be explicitly registered in `src/app.rs` and
accessible to task windows only through the project's existing Tauri boundary. There is no native connector or host hook. Agents opt in through publish_question and retrieve
responses when ready; only the desktop user-response command submits answers.

## QuestionView projection

Includes `store_uuid`, task UID/current numeric ID if present, family/source, current revision,
content/constraints, disposition, `task_available`, optional response, optional receipt, and
`delivery_mode:"agent_poll"`. Use existing link validation before opening a source URL.

| Disposition | Receipt | Visible state |
| --- | --- | --- |
| pending, task available | absent | Prompt and controls, no status sentence |
| answered | absent | Saved (accessible status only) |
| answered | present | Received (accessible status only) |
| declined | absent | Declined |
| declined | present | Declined — received by agent |
| withdrawn or pending with missing task | absent | Withdrawn, with a short reason |

A stale old card shows the current state after conflict; it does not replace or resubmit the
current answer. Multiple historical responses may remain available for receipts, but only the
current pending revision is editable. Receipt is not a promise of host execution or work completion.

## Error behavior

Use common `{code,message,retryable,...context}` shape. Specific codes: `store_changed`,
`task_unavailable`, `ambiguous_identity`, `source_mismatch`, `pending_question_exists`,
`stale_revision`, `question_resolved`, `invalid_question`, `invalid_answer`, `idempotency_conflict`,
`stale_cursor`, `unsupported_schema`, `invalid_metadata`, and `write_failed`.
Conflict errors provide current revision/state where safe and appropriate for the local client.
No failed validation changes disk. Do not blindly retry `write_failed` with a new request ID.
Source matching is a local correlation check, not authentication or a security boundary.

## Scope boundary

No native agent hooks, connectors, question interception, or automatic continuation. Source IDs
correlate published requests and responses; they do not attach to another application's session.

Review refinement: answered UI is a small prompt label followed by the answer, without source heading or Answer prefix. Source identity and receipts remain in the protocol/storage.

Answered values include a small muted ‘(your answer)’ suffix per final user refinement. Declined and Withdrawn do not receive that suffix.
