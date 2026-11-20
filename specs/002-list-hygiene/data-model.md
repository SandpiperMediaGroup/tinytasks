# Data Model: Lists, Sources, Identities, and Creation Receipts

## Compatibility foundation

Existing Markdown headings remain the destination list and `Task.chat` remains its legacy projection. No list is renamed, merged, or moved during upgrade. Existing numeric task IDs remain display/legacy handles; metadata-aware references additionally require an immutable UID.

The new `src/agent_state.rs` module is shared by features 002, 003 and 004. It parses a single top-level HTML-comment-safe JSON envelope outside list sections:

```json
{
  "schema_version": 1,
  "store_uuid": "6c21e123-29fd-4374-b809-71cc59469b96",
  "task_sources": {},
  "request_ledger": [],
  "planning": null,
  "questions": {}
}
```

`planning` is owned by 003; `questions` and response history by 004. These examples show namespace slots, not permission for 002 to reset them. Missing envelope means legacy data; read-only calls do not create it. A first metadata-aware write generates store_uuid and preserves all unrelated bytes/records. Do not nest this envelope inside expiring `tinytasks-desk` state.

Unknown root namespaces and fields within known records survive writes through JSON object patching. Validate required known fields without round-tripping through structs that discard extensions. Multiple agent-state comments, malformed known data, or a future schema_version are errors for metadata-aware writes; never silently replace them with defaults. Escape `<`, `>` and `&` in the serialized line so user data cannot terminate the comment. Daily desk expiry leaves this envelope intact.

## Entities

### List destination

| Field | Type | Rule |
| --- | --- | --- |
| name | string | Existing exact heading text; empty string means Personal |
| section_count | nonnegative integer | Count all exact-name occurrences |
| task_count | nonnegative integer | All parsed root/child tasks, open or complete, no age cutoff |
| open_count / completed_count | nonnegative integer | Full-storage counts, not sidebar top-level counts |
| empty | boolean | task_count is zero; Personal still ineligible for global cleanup |

A new named list uses existing 1–200 character, one-line name rules, trimmed at the input boundary. Match exact trimmed name first; otherwise accept only one case-insensitive existing match. Distinct hand-edited casing collisions are not merged. A new list's purpose is retained in its creation request receipt; it is not a new task or note.

### Task identity and source

| Field | Type | Rule |
| --- | --- | --- |
| id | positive integer | Existing numeric handle; may be reused after removals by legacy code |
| uid | UUID string or absent | Stored as `@uid(uuid)` on the task; immutable once allocated |
| store_uuid | UUID string | Scope for UID references and request ledger; generated once per data set |
| source.client_id | nonempty string, max 200 chars | Stable caller namespace; never derive from display name alone |
| source.conversation_id | nonempty string, max 500 chars | Stable conversation correlation within client_id |
| source.title | optional string, max 500 chars | Display context; not destination membership |
| source.url | optional string, max 2048 chars | Genuine conversation URL; validate using existing supported-link policy |

`task_sources[uid]` holds the source object plus unknown extension fields. No source is inferred for a legacy task merely from its heading or arbitrary `@link`. Existing `Task.link` remains intact for task-specific links. Source URL and task link may differ.

Allocation is lazy and transactional. `create_tasks` assigns every new task a UID. `ensure_task_identity` attaches one to an existing legacy task after checking a full-file snapshot_revision under lock. Its result includes store_uuid and task_ref `{id,uid}`. Read-only discovery exposes uid:null and store_uuid:null where absent rather than mutating storage. Modern updates require both handles to match the same task; absent task, reused id, or mismatched UID returns stale_task_reference. Duplicate UIDs copied manually are ambiguous_identity and block affected metadata-aware writes; do not silently rebind history. Parent/subtask movement preserves individual UIDs and sources.

### Request receipt

| Field | Type | Rule |
| --- | --- | --- |
| client_id, conversation_id | strings | Request actor identity; part of unique key |
| operation | enum/string | Exact tool operation, e.g. create_tasks |
| request_id | nonempty string, max 200 chars | Caller-generated identity retained for retries |
| canonical_input | JSON value | Validated request, excluding request_id only; includes source and expected revision |
| result | JSON value | Original successful result snapshot, including IDs/Uids |
| committed_at | integer epoch seconds | Durable commit time |

Key: `(client_id, conversation_id, operation, request_id)` within store_uuid. Object key ordering is normalized recursively; arrays retain order. No title similarity or fuzzy payload matching. Final shared canonicalization rules are centralized in agent_state.rs and used by all three features.

Request lifecycle: absent → validate/resolve under lock → mutate list+metadata → persist receipt in same active-file commit → return result. A matching receipt returns its original result before current-state CAS checks; changed canonical input returns idempotency_conflict with no writes. Failed validation/write stores no receipt. A retry after task/list deletion returns the original historical result, marked replayed, without restoring anything. No automatic receipt eviction in v1.

### Discovery cursor

The externally opaque cursor contains endpoint, SHA-256 snapshot_revision of exact active-file bytes, canonical filter signature, fixed limit, and next offset. Encode as bounded hex JSON (maximum 4096 characters); it is a consistency token, not an authentication credential. Reject malformed/oversized values. On continuation, reread the file and require the same digest and filters/limit; otherwise return stale_cursor or cursor_mismatch. Page results include next_cursor:null and has_more:false only when complete.

### Cleanup result and recovery journal

`CleanupPreview`: eligible_names, eligible_count. This is advisory and never authorizes deleting cached selections.

`CleanupResult`: archived_names, archived_count, archive_path. A result is returned only after durable success; a no-op returns empty names/count zero without writing either file.

The existing ArchiveMove before/after-image structure covers the entire batch. Persist the journal before either destination changes. Write archive_after, then active_after, then remove the journal. Recovery accepts only before/after images; unexpected external changes retain files+journal and report conflict. Notes, whitespace, line endings and duplicate sections remain byte-preserved in moved spans. Exact archived names, not preview count, drive UI preference cleanup.

## Mutation and migration boundaries

- Normal cleanup contains no tasks and does not modify task_sources, planning, or questions.
- Ordinary nonempty archive uses the same transaction preparation hook: copy source records for archived UIDs into archive metadata, retain active request receipts and question/answer history, and withdraw pending questions through feature 004 before writing active_after. Never replace the active envelope wholesale when splitting raw sections.
- Task/list deletion similarly calls metadata lifecycle preparation before dropping task records. Previously answered questions remain historical; source records are retained while referenced by history/receipts.
- Source and response updates must preserve other namespaces including planning. Existing known-header upgrade is exact-match only; custom user instructions remain untouched.
- Old binaries preserve unknown @uid tags and comments, but their writes cannot uphold new question, receipt, or lifecycle invariants. Mixed-version semantic safety is not promised. Upgrade all writers before relying on the new contracts.
- Future schema versions fail closed for new metadata-aware writes. Direct external file editing remains possible and is not described as transaction-safe.
