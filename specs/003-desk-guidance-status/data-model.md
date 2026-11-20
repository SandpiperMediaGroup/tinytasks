# Data Model: Desk Guidance and Planning

## Storage boundaries

Reuse schema version 1 of feature 002's `tinytasks-agent-state` envelope in `tasks.md`.
The envelope owns store identity, source correlation, idempotency ledger and feature namespaces;
this feature owns only `planning`. New code preserves unknown fields at every object boundary.
Unknown future envelope versions make new planning writes fail without rewriting the envelope.
A missing envelope is initialized through the shared helper on the first explicit begin; merely
reading the desk does not create planning state.

The existing `tinytasks-desk` comment remains authoritative for accepted items, hours and pending
proposal. Do not place question history here: feature 004 owns durable questions outside the daily
planning lifecycle. Guide preferences are local UI state, not shared task data.

## Source identity (shared)

| Field | Type / validation | Meaning |
| --- | --- | --- |
| `client_id` | Nonempty stable string, shared contract limits | Client integration identity, not display label |
| `conversation_id` | Nonempty stable string, shared contract limits | Originating conversation correlation within that client |
| `title` | Optional bounded string | Display context |
| `url` | Optional validated genuine conversation URL | Optional route back to source |

Identity comparisons use the first two fields exactly. MCP `clientInfo.name` or optional `agent`
supplies a separately sanitized display label only. These are trusted local cooperation identifiers,
not authentication credentials.

## Planning namespace

```text
planning: {
  current: PlanningRun | null
}
```

Only the current or most recent terminal run is retained here. The shared request ledger retains
operation receipts needed for retries; older run IDs do not regain ownership when their receipt is
replayed. Stable tool result fields are stored in receipts; the `current` snapshot returned to callers
is computed dynamically and is never part of a receipt. Namespace updates preserve unknown keys.
No unbounded planning-history screen is added.

### PlanningRun

| Field | Type | Rules |
| --- | --- | --- |
| `run_id` | UUID string | Minted by shared helper at successful begin; never reused |
| `source` | Source identity | Immutable identity tuple for this run |
| `agent` | String, at most 80 display characters | Sanitized MCP display name or explicitly supplied display override |
| `date` | Local `YYYY-MM-DD` | Must match store local day at every mutation |
| `status` | `building`, `suggested`, `failed`, `interrupted` | Stored terminal states plus read-time derived interruption |
| `started_at_ms` | UTC integer milliseconds | Assigned by server clock at begin |
| `updated_at_ms` | UTC integer milliseconds | Last accepted begin/progress/failure/submit event |
| `expires_at_ms` | UTC integer milliseconds | For building, exactly last begin/progress time + 300000 |
| `observed_proposal` | ProposalObservation | Last proposal state accounted for by new code |
| `submitted_proposal_id` | Optional string | Set only on successful associated submission |
| `failure_code` | Optional enum | `agent_failed`, `expired`, `proposal_changed`, `clock_changed` |
| `failure_message` | Optional plain string, max 240 characters | Sanitized text; no markup or unverified retry claims |

No plan percentages or automatic retry flags are stored. A successful proposal does not become an
accepted plan until the existing user review command succeeds.

### ProposalObservation

```text
null                       # no pending proposal
{ id, content_sha256 }      # pending proposal exists
```

Hash the canonical JSON of the complete proposal, including ordered items, display name and any
preserved fields, through feature 002's canonical SHA-256 helper. IDs alone are insufficient because
external edits can preserve an ID. Store neither accepted-desk task data nor the whole task-file hash
in this observation: unrelated edits must not invalidate planning.

New user review/time-edit/add-to-proposal paths update the current building run's observation in
the same file transaction, without extending its lease. Updated legacy submit paths terminate the
run as superseded by clearing `planning.current` (its request receipts remain), then save the new
proposal atomically. A new begin replaces `current` with its own run.

### Effective snapshot

`get_desk` keeps its existing fields and adds `server_now_ms` and `planning` (null or the public
current run). Public fields include run ID, source title/link where present, agent, date, effective
status, timestamps, and failure code/message. The observation hash and ledger internals are not
rendered. In order:

1. A run from another local date is omitted.
2. A building run with an unexplained proposal observation mismatch yields
   `interrupted / proposal_changed`. Terminal runs do not become interrupted when their proposal
   is later reviewed or edited.
3. A building run whose clock is more than five seconds before `updated_at_ms` yields
   `interrupted / clock_changed`.
4. A building run with `now >= expires_at_ms` yields `interrupted / expired`.
5. Otherwise expose its stored state. A `suggested` result has no active working label; proposal
   presence determines Review.

Read-time derivation does not write. Mutation paths recompute the same conditions under lock before
accepting progress/submission. They never revive an effectively interrupted run; the agent begins a
new run. Rollover may clear only the expired planning namespace while preserving other envelope data.

## State transitions

| Event | Precondition | Result |
| --- | --- | --- |
| Begin | Current local date, valid source/request key | New `building` run replaces previous ownership; accepted desk/proposal unchanged |
| Duplicate begin | Same ledger key and canonical payload | Replay original receipt; no new run or lease; attach current snapshot |
| Progress | Matching current run + source + day, fresh lease, matching observation | `building`, update timestamps/lease; proposal/accepted desk unchanged |
| Failure report | Same checks as progress | `failed`, store explanation, stop working label |
| Valid associated submit | Same checks plus complete arrangement validation and task identity validation | Save proposal and `suggested` run in one write |
| Invalid arrangement | Run valid but items invalid | Reject entire mutation; proposal and lease unchanged |
| New begin | Valid new logical request | Older run loses ownership; old request replay cannot reactivate it |
| Unassociated legacy submit | Existing legacy tool input valid | Save new proposal and clear current ownership atomically |
| New app edits/reviews proposal | Existing user command valid | Apply user action and update observation atomically; lease unchanged |
| Expiry / out-of-band change | Derived current state invalid | Show interruption; reject later progress/submit; new begin required |
| Local day change | Run date differs | Hide/clear yesterday's run; reject all its writes |

## Task identity before new-path submission

Feature 002's `list_tasks_page` may return `uid:null` for legacy tasks. Before submitting a new-path
plan item, call `ensure_task_identity({task_id,expected_snapshot_revision,source,request_id})`.
Its full-file revision guard prevents assigning identity to a numerically reused task. Re-read the
discovery snapshot after each identity write before ensuring another legacy task; all new submit
references must contain both `id` and non-null `uid`. The run's proposal observation is unchanged
by identity-only writes because it does not hash the full task file.

Native timing edits retain feature 001's optional `expectedItem` compare-under-lock guard.
Observation updates and lease rules apply only after that guard and the existing day/proposal
checks succeed. An observation update is never a reason to bypass stale captured-drag validation.

## Basics window state

Only native open/close state. No guide preferences, step index, target, invitation or persisted dismissal.

## Compatibility and downgrade

The new envelope is separate from `Saved`, which v0.3.6 otherwise rewrites. Test old-format desk
read/write round trips preserve the raw agent-state comment. Feature 002's safe metadata preamble
handling also protects it during Personal/list archive operations.

Unknown envelope versions fail new writes explicitly. Old binaries are not retroactively capable
of interpreting schema versions or honoring planning concurrency; do not advertise mixed-writer
coordination. Updated code detects observed proposal differences and stops the run rather than
silently replacing that proposal. Existing direct `mydesk` edits still affect accepted membership;
this feature neither removes that compatibility path nor treats it as planning activity.

## Final review scope

GuideSession/guide preference data is superseded by a static separate Basics window. No completion, dismissal, replay, or anchor state is stored. The window has only native open/close lifecycle. Planning data above is unchanged.
