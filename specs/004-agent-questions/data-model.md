# Data model: Agent questions

Use feature 002's `agent_state` serializer, request ledger, source identity, store identity, task UID allocator, and atomic writes. This document owns only the `questions` namespace. Unknown keys are retained when known keys are patched; unsupported schema versions reject new state writes.

## Shared identifiers

- `store_uuid`: identity of the selected task store. A folder switch invalidates UI state from another store.
- `task_uid`: immutable UUID stored as `@uid(...)` on the task; a numeric `id` is a current lookup/display handle only.
- `source`: `{client_id, conversation_id, title?, url?}` with identity validation from feature 002. Display strings and links never determine ownership.
- TinyTasks-generated IDs below are UUID strings, not JavaScript numeric counters. Native host session/tool IDs are opaque strings preserved verbatim. UTC epoch seconds are used for timestamps, independent of the local desk day.

## Questions namespace

`questions = { families: {question_id: QuestionFamily}, revisions: {revision_id: QuestionRevision}, responses: {response_id: Response}, receipts: {response_id: Receipt} }`.

### QuestionFamily

| Field | Type | Invariant |
| --- | --- | --- |
| question_id | UUID | Map key and value agree |
| task_uid | UUID | Stable association even after task removal |
| task_id_at_creation | positive integer | Historical display aid only |
| source | Source | Stable source tuple; optional title/link snapshot |
| current_revision_id | UUID | Must reference this family's revision |
| created_at | timestamp | Immutable |

### QuestionRevision

| Field | Type | Invariant |
| --- | --- | --- |
| revision_id, question_id | UUIDs | Immutable and linked |
| prompt | string | Nonblank, at most 4,000 Unicode scalar values |
| mode | `single`, `multiple`, `text` | Determines control and validation rules |
| options | Option array | Choice modes: 2–12; text: empty |
| min_selected, max_selected | integers | Multiple only: 0 <= min <= max <= option count; max >= 1 |
| allow_custom | boolean | Choice modes only; custom text is exclusive of selected options |
| default_option_ids | string array | Unique members of options; max one for single; multiple respects selection limits |
| recommended_option_id | optional string | Existing option; recommendation does not force selection |
| default_text | optional string | Text mode only; never submitted automatically |
| disposition | `pending`, `answered`, `declined`, `withdrawn` | See transitions |
| withdrawal_reason | optional enum | `superseded`, `source_withdrew`, `task_unavailable` |
| response_id | optional UUID | Exactly one on answered/declined; absent otherwise |
| created_at, resolved_at | timestamps | resolved_at absent while pending |

Option: `{id, label, description?}`. IDs are 1–64 ASCII alphanumeric/underscore/hyphen characters,
unique within a revision; labels are nonblank and at most 120 Unicode scalar values; descriptions
at most 500. Display all content as text. Blank optional strings are normalized to absence before
canonical request hashing; user-entered answer text is preserved except all-whitespace rejection.

### Response

| Field | Type | Invariant |
| --- | --- | --- |
| response_id, question_id, revision_id | UUIDs | Immutable; matches the submitted revision |
| task_uid, source | identity snapshots | Resolve to the originating family |
| outcome | `answered` or `declined` | Declined has no selected choices/custom/text |
| answer | tagged value or absent | `{kind:"choices", option_ids:[...]}` or `{kind:"custom", text}` or `{kind:"text", text}` |
| submission_id | UUID | UI/adapter retry identity, stable for a single send attempt |
| submission_input | canonical JSON | Original normalized store/question/revision/outcome/answer input, excluding submission_id; response itself is the human retry receipt |
| submitted_at | timestamp | Set only on successful commit |
| submitted_via | `desktop` or verified adapter ID | Never inferred from agent display name |

Human response retry identity is `(store_uuid,question_id,revision_id,submission_id)`. Build an
index over saved responses; reject duplicate index keys in malformed metadata. This is separate
from the agent request ledger, with no reserved synthetic client/conversation names. Replay checks
precede mutable task availability/current-revision validation, while always validating current
store/schema and the request's structural shape. Exact input replays the original Response;
changed input conflicts. The current QuestionView is generated after lookup, never stored as a
receipt snapshot that could falsely claim a question is still pending.

Choice selections are deduplicated and ordered by the revision's option order before hashing and
storage. Single requires exactly one option; multiple requires its min/max. Text/custom requires
1–8,000 non-whitespace-containing Unicode scalar values, while preserving original whitespace.
Custom is only valid when `allow_custom`; it cannot accompany option IDs. Text mode does not
accept choice IDs. Defaults undergo equivalent validation at publication, except absent defaults
are always allowed. An empty default_text means no default. If multiple has min_selected=0,
explicit Send with zero selected choices is valid; it is never sent implicitly.

### Receipt

`{receipt_id, response_id, source:{client_id,conversation_id}, acknowledged_at}`.
The tuple must match the family owner. A read does not create a receipt. One receipt per response;
repeated acknowledgment returns the original receipt. Receipt does not imply the agent completed
work or that a host conversation resumed.

### AnswerDraft (window-local, not persisted)

Key `{store_uuid,question_id,revision_id}`; value contains selected choices or text, field errors,
submission-in-flight flag and stable `submission_id` for retry. Clear after confirmed success,
explicit local reset, changed revision, task disappearance, or store switch. Keep across row collapse,
view changes, and DOM replacement in the current window. A failed send retains the exact draft.

## State transitions

| From | Event | To / effect |
| --- | --- | --- |
| No pending question | Publish | Pending revision; one active pending question per task UID |
| Pending | Explicit human Send | Answered + immutable response, no receipt |
| Pending | Explicit human Decline | Declined + immutable response, no receipt |
| Pending | Withdraw, supersede, or task removal | Withdrawn with reason |
| Answered/Declined | Matching source acknowledgment | Same disposition plus receipt |
| Answered/Declined/Withdrawn | Explicit publish next revision with current expected revision | New pending revision; old history retained |
| Any | Stale request / changed retry content | Conflict; no write |
| Any | Desk rollover | No question-state change |
| Pending | Task completion | No question-state change |

Replacing a pending revision requires the same source tuple and expected current revision.
Another source cannot silently take over; it receives `pending_question_exists`. Publishing a
new family on a task with no pending question is allowed, preserving previous families' history.

## Invariants and reconciliation

- Validate references and state uniqueness before every question write, with the shared lock held.
- A missing task UID makes pending revisions unavailable immediately; persist withdrawal through
  watcher normalization or the next mutation. Restoring an archived task never reactivates a
  withdrawn revision automatically.
- Duplicate task UIDs in hand-edited data block metadata-aware writes with `ambiguous_identity`.
- Any response or receipt referencing the wrong family/revision is invalid data; show a scoped
  question error rather than silently dropping records.
- History has no automatic TTL or garbage collection in v1. The shared ledger is retained as well;
  large-file retention/compaction is a documented follow-up, not an implicit destructive migration.
- A legacy writer may ignore lifecycle rules; all supported writers must be upgraded for these
  invariants. Cross-computer cloud conflict detection is not a transaction coordinator.

