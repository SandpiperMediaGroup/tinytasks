# MCP Contract: Modern List and Task Hygiene

These are new tools implemented in the existing local stdio server. Keep legacy add_tasks,
list_tasks and update_task names, input meanings and text/result shapes compatible. Modern tools
return a JSON object serialized in the existing text content block; set isError for failures.
Expose structuredContent only if implemented consistently; this plan does not require changing
protocol negotiation or native client UI support.

## Common rules

Read tools are readOnlyHint. Modern write tools use the shared envelope and transaction rules in
[data-model.md](../data-model.md). Client identity is explicit correlation, not authentication.
A supplied source object is `{client_id, conversation_id, title?, url?}`. Request identity is
`request_id`; retries match `(client_id, conversation_id, operation, request_id)` and canonical
input. Mutations return their original result on exact replay, with `replayed:true`; timestamps
and generated IDs must not change. A changed payload under the same key returns
`idempotency_conflict`. Receipt lookup precedes CAS/state validation so post-success retries work.

Task references are `{id,uid}`. Legacy IDs without UIDs can first use ensure_task_identity.
Modern operations never infer a target from a task title, conversation title, or display name.
Errors carry `{code,message}` plus safe recovery context when applicable. No mutation occurs on
validation, stale-reference, ambiguous-destination, or conflict errors.

## list_lists

Input: `{limit?: integer, cursor?: string}`; limit defaults to 100 and must be 1–200.

Result:

```json
{
  "store_uuid": null,
  "snapshot_revision": "sha256-of-current-file",
  "items": [{"name":"Launch","section_count":1,"task_count":4,"open_count":2,"completed_count":2,"empty":false}],
  "next_cursor": null,
  "has_more": false
}
```

Personal is returned as name:"" even with zero tasks; built-in views are not lists. Empty named
lists are included. Duplicate exact-name sections are aggregated. Order by first section
appearance, with Personal first. Counts include children and all completed history. A legacy
file has store_uuid:null until a metadata-aware write initializes it.

## list_tasks_page

Input: `{status?: "all"|"open"|"done", list_name?: string, parent_id?: integer,
desk?: boolean, limit?: integer, cursor?: string}`. Defaults status all, limit 100. list_name
means exact resolved destination, not legacy substring chat filtering. Missing list_name means
all lists; empty string means Personal. parent_id filters direct children only.

Result: `{store_uuid, snapshot_revision, items, next_cursor, has_more}`. Every task includes
legacy display fields plus `list_name`, `uid` (null if legacy), and `source` (null if absent).
Do not discard older completions or silently cap the whole collection. Use saved file sequence
except parent-filtered results, which use saved sibling position then numeric ID. Sorting is
part of the cursor's endpoint/filter signature and cannot change mid-scan.

Every continuation checks the exact file snapshot and original filters/limit. `stale_cursor`
means discard partial scan and restart, not continue against changed offsets. `cursor_mismatch`
means wrong endpoint/query/limit. Returned pages are at most limit items; next_cursor:null is
an explicit completion marker.

## ensure_task_identity

Input: `{task_id: integer, expected_snapshot_revision: string, source: Source, request_id: string}`.

After receipt lookup, require the current full-file digest to match expected_snapshot_revision,
then resolve the numeric ID. Generate store_uuid if absent and task UID if absent. Preserve an
existing unambiguous UID. Commit identity and receipt together.

Result: `{store_uuid, task_ref:{id,uid}, replayed:false}`. Read list_tasks_page again when a fresh
snapshot_revision is needed; a write receipt cannot contain a digest of the file that contains
that same receipt. `stale_snapshot` requires rereading the target; do not guess
that a reused numeric ID refers to the originally observed task. This operation assigns identity,
not source attribution; the source argument scopes the request receipt only.

## create_list

Input: `{name: string, purpose: string, source: Source, request_id: string}`. Name follows existing
list validation. Purpose is nonempty, one line, 1–500 characters and explains a continuing home
or an explicit user request. This tool is distinct from the similarly named internal Tauri command.

Resolve existing exact/unique case-insensitive matches before creating. An existing match returns
`{name,created:false,...}`; it does not duplicate, rename, or merge. Ambiguous case collisions
return `ambiguous_list` with existing candidate names. A missing valid name explicitly creates a
preserved empty section. Purpose/source remain in the request receipt, not as an actionable task.

Result: `{store_uuid,name,created,request_id,replayed}`. Missing source or request_id is invalid.
An archived name is available for explicit new creation; prior creation receipts still replay
historically if reused. Use a new request identity for an intentionally new list lifecycle.

## create_tasks

Input:

```json
{
  "destination_list": "Launch",
  "source": {"client_id":"codex-client-1","conversation_id":"thread-42","title":"Shipping checks"},
  "request_id": "add-human-actions-1",
  "parent_ref": null,
  "ordered": false,
  "tasks": [{"title":"Review the draft","details":"Check the opening paragraph.","link":"https://example.com/draft"}]
}
```

Tasks array contains 1–200 items. Retain existing title/details/link/priority/due/mydesk validation.
A missing destination_list defaults to Personal for roots. A supplied named destination must
already resolve; otherwise return unknown_list with instructions to use list_lists/create_list.
A typo is never list creation. Reject legacy `chat` in this new tool rather than guess its meaning.

For parent_ref, require a current matching UID and a top-level parent. Children inherit the
parent's destination; omit destination_list or require it to match the parent's resolved name.
Source attribution comes from the explicit current source; it need not equal the parent's
origin. Related steps are added in array order. Validate the entire batch and UID references
before modifying tasks, parent ordering mode, source records, or receipts.

Result: `{store_uuid,request_id,tasks:[{id,uid,title,list_name}],replayed}`. Each new task receives
an immutable UID and source record in the same commit. No automatic duplicate detection based
on title; agents discover/update first and request receipts prevent transport retries duplicating.
A replay after removal returns these original handles without recreating tasks.

## update_task_v2

Input: `{task_ref, expected_snapshot_revision, source: Source, request_id, changes}`.
changes accepts existing editable task properties, `destination_list` and optional
`origin_source` (Source or null). Caller source scopes the request; origin_source explicitly edits
attribution. Omitting origin_source preserves it. Reject `chat` in changes. Destination resolution
is existing-only; parent movement includes children while retaining each child's source/UID.
Subtask destination movement continues the current UI family rule: require updating its parent
rather than independently reparenting the child.

Perform receipt lookup, full-file revision check, task UID check, then validate all changes.
Changes to source attribution do not alter list membership, and destination changes do not
rewrite source. Result: `{store_uuid,task_ref,updated:true,replayed}`. Null fields clear only where
existing semantics allow them. Failure leaves all task/source/receipt fields unchanged.

## Compatibility and agent guidance

- Existing add_tasks remains capable of chat-based list creation for old configured clients;
  mark it as legacy in tool descriptions and prefer create_tasks in server instructions.
- Existing list_tasks remains its array with recent-history/cap behavior; direct clients needing
  complete discovery must use list_tasks_page. Do not silently change old response shape.
- New clients must enumerate existing destinations and applicable tasks, update matching actions,
  group related steps as subtasks, and keep their own execution plans outside TinyTasks.
- Similar task titles are never automatically merged. Keep genuine conversation links when known;
  unknown links remain absent. No global configuration or agent-memory edits are automatic.
- New tools share the same receipt format with planning and question tools; centralize serialization,
  bounds, source identity, and unknown-field preservation instead of reimplementing them per tool.
