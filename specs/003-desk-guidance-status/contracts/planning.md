# Contract: Agent Planning Runs and Desk Snapshot

Proposed additions to the existing local stdio MCP server; implementation has not been written.
All writes use `store::change`, shared envelope validation, and shared request-ledger semantics.
Fields below are JSON tool arguments; unknown top-level arguments are rejected for the new tools.
The legacy tools retain their existing input contract.

## Shared rules

Each new mutation requires `source` with `client_id`, `conversation_id`, optional `title`/`url`,
and a caller-generated `request_id` under the feature-002 shared limits. The ledger key is
`(client_id, conversation_id, operation, request_id)`. Same normalized payload replays the receipt;
changed payload under the same key returns `idempotency_conflict`. Replayed timestamps/run/proposal
identities do not change, and no heartbeat is performed on replay. Include a separately generated
current desk/planning snapshot so replaying an old receipt does not falsely claim the old run is
still active. Source and run IDs provide correlation/ownership checks, not an authentication layer.

New tools return JSON in MCP text content using the current server response convention.
Success returns tool-specific stable result fields directly, plus `replayed` and `current`.
For example, begin returns `{run_id,date,started_at_ms,expires_at_ms,replayed,current}`. Store only
the stable result in the receipt; compute `current` dynamically after receipt lookup and never
store it in the receipt. Receipt lookup precedes current-run/expiry/CAS validation, so a retry
after a successful terminal transition can replay safely without reactivating the run. Errors
return `{code,message}` plus safe recovery context where applicable, with MCP `isError:true`.
Do not claim success if writing or durable ledger recording fails.

## `begin_desk_planning`

Arguments:

```json
{
  "date": "2026-11-20",
  "source": {"client_id": "codex-desktop", "conversation_id": "conversation-123"},
  "request_id": "begin-unique-logical-request",
  "agent": "Codex"
}
```

`date` and source/request fields are required. `agent` is optional display text (max 80 characters)
and defaults to the MCP client name. A nonempty stable source identity is required even if the
client's display name is available. Source title/url use the shared validators.

Result: `{run_id,date,started_at_ms,expires_at_ms}`. Begin stores the current proposal observation
and a fresh 300-second lease without changing accepted items or the pending proposal. A distinct
new begin supersedes any previous run; reusing an already successful begin request does not.

Errors: `invalid_source`, `invalid_request`, `wrong_day`, `idempotency_conflict`,
`unsupported_schema`, `invalid_metadata`, `write_failed`.

## `report_desk_planning`

Arguments:

```json
{
  "date": "2026-11-20",
  "run_id": "server-issued-uuid",
  "source": {"client_id": "codex-desktop", "conversation_id": "conversation-123"},
  "request_id": "progress-unique-logical-request",
  "status": "working"
}
```

`status` is `working` or `failed`. A failed report may include `message` (plain text, max 240
characters); working reports do not accept arbitrary free-form user-facing progress prose.
Every logical heartbeat uses a new request ID; agents should report at meaningful stages and at
least once within each five-minute working interval. Do not heartbeat for an idle connection.

Require matching current run ID, source tuple and date, unexpired effective state, and matching
proposal observation. Working extends `updated_at_ms` and `expires_at_ms`; failure stores a
terminal failure and no active lease. Result gives `{run_id,status,updated_at_ms,expires_at_ms}`.

Additional errors: `run_not_current`, `source_mismatch`, `run_expired`, `proposal_changed`,
`clock_changed`, `run_terminal`. A failed validation has no file mutation and cannot extend expiry.

## `submit_desk_plan`

Arguments:

```json
{
  "date": "2026-11-20",
  "run_id": "server-issued-uuid",
  "source": {"client_id": "codex-desktop", "conversation_id": "conversation-123"},
  "request_id": "submit-unique-logical-request",
  "items": [{"id": 12, "uid": "stable-task-uuid", "start": "09:30", "duration": 30}]
}
```

Run/source/date checks match report. `items` is the complete proposed arrangement, 0–200 unique
open task/subtask references. New-path references contain existing numeric `id` plus immutable
`uid` from feature 002's complete discovery; both must resolve to the same task to prevent ID reuse
from redirecting a long-running plan. When `list_tasks_page` returns `uid:null`, call
`ensure_task_identity({task_id,expected_snapshot_revision,source,request_id})` with that page
snapshot before submitting references. The guarded identity write returns the stable task ref.
Re-read discovery after the write before assigning another uninitialized task against a fresh
snapshot; `stale_snapshot` means reread and re-identify the target, never guess from its numeric ID.

`start` is null/omitted or valid local HH:MM; `duration` is
null/omitted or 1–1440 minutes requiring start and an end within the same day. Keep array order for
untimed items. Transform validated references to existing desk items; no due dates/list moves.

On success, create the pending proposal through existing validation, set the run to `suggested`,
record submitted proposal ID and new observation, and save the receipt in the same atomic file
write. Result: `{run_id,proposal_id,status:"suggested"}`. No acceptance command is exposed.
Invalid items, missing/mismatched task UID, or a write failure leave the prior proposal and run
lease unchanged. Duplicate successful submission replays its original receipt rather than creating
a newer proposal revision or replacing an intervening suggestion.

Additional errors: `invalid_arrangement`, `task_unavailable`, `task_identity_mismatch`.

## Existing tools and native commands

- `suggest_desk` and MCP `set_desk` keep their current arguments and result text. Through the updated
  binary, a valid legacy submission atomically saves its proposal and clears `planning.current`.
  Invalid submissions do neither. A stale run cannot subsequently overwrite the legacy result.
- `get_desk` remains read-only and returns its existing fields plus `server_now_ms` and `planning`.
  Reading it never starts a run or records a heartbeat.
- Native `get_desk` returns the same enriched snapshot. UI `review_desk`, proposal `edit_desk_time`,
  and `add_to_desk` update the observation when they change a pending proposal, without extending
  the planning lease. Preserve feature 001's optional `expectedItem:{id,start,duration}` guard on
  `edit_desk_time` for captured drag writes: compare under the same lock against the accepted item,
  or the proposal item after validating `proposalId`. Failed guards leave timing, observation and
  lease unchanged. Normal accepted-desk edits do not become planning progress.
- Known user Accept/Decline remains authoritative and updates observation to null. If replacement
  planning is still fresh, it may later submit a new proposal for a separate review.
- An out-of-band proposal ID/content change produces derived interruption and rejection of
  run-associated writes. This is detection, not a cross-computer lock or a retrofit of old binaries.

## Public snapshot example

```json
{
  "date": "2026-11-20",
  "work_start": "09:00",
  "work_end": "17:00",
  "items": [],
  "proposal": null,
  "proposal_error": null,
  "server_now_ms": 1795194000000,
  "planning": {
    "run_id": "server-issued-uuid",
    "agent": "Codex",
    "date": "2026-11-20",
    "status": "building",
    "started_at_ms": 1795194000000,
    "updated_at_ms": 1795194000000,
    "expires_at_ms": 1795194300000,
    "failure_code": null,
    "failure_message": null
  }
}
```

Timestamp values are illustrative. Server timestamps determine the lease; the local `date` is
returned by the store's current-day calculation rather than inferred from an agent's timezone.
No run observation hash or request ledger is exposed in ordinary UI text.
