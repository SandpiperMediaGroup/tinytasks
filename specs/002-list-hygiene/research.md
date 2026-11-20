# Research: Empty-List Cleanup and Agent Hygiene

Date: 2026-11-20. Source baseline: TinyTasks v0.3.6, commit `8bf6ba2e9c6f76ad6c89e90968b68eb99611672f`.

## 1. Complete-storage emptiness

**Decision**: Count every parsed task belonging to each named list across every duplicate section; select raw spans only after locking and rereading.

**Evidence**: src/store.rs::sections and split_chat preserve original section bytes. `for_ui` removes older completed roots after seven days; `for_agents` removes older completions after fourteen days and truncates to 200. UI counts only top-level open tasks.

**Rationale**: A visually empty or fully completed list is not empty by the agreed specification. Children and old completions must protect a list.

**Alternatives considered**: UI counts are incorrect; per-list calls could race and yield partial batch success. Use one selection pass against the authoritative file. Notes-only lists qualify, with notes archived unchanged.

## 2. Batch archive and failure boundary

**Decision**: Generalize existing ArchiveMove computation to one batch while retaining raw-content preservation and journal replay. Require fail-closed atomic replacement on the durable paths.

**Evidence**: `archive_chat_files` stores complete active/archive before/after images, and `recover_archive` detects external changes, writes archive first, then active. Existing tests exercise interruption, unwritable archives, and conflicting edits. `store::write` currently falls back to direct overwrite when swap fails.

**Rationale**: One journal can recover the whole cleanup without duplicate appends. Direct overwrite can leave partial content, so the existing fallback must not support a new atomicity claim.

**Alternatives considered**: Per-list journaling complicates exact results; deletion loses notes; moving to a new database violates the product's portable file model. A new database is unnecessary.

## 3. Separate origin from destination

**Decision**: Keep Markdown headings and Task.chat as existing list membership. Add `source` metadata keyed by immutable task UID, with client/conversation identity separate from display title/link.

**Evidence**: src/mcp.rs currently instructs agents to use the conversation title as chat. src/store.rs::insert creates a missing heading. Existing Task.link can point to a chat, PR, or other resource; it is not a reliable conversation ID.

**Rationale**: Legacy data cannot be safely reclassified automatically. New attribution must survive task movement and not create sidebar lists. Shared UIDs also prevent question history in feature 004 from rebinding to reused numeric IDs.

**Alternatives considered**: Renaming chat globally breaks old clients and fixtures. Guessing conversation identity from display name or arbitrary link is unreliable. A migration that merges old lists is unauthorized.

## 4. Shared metadata and retry semantics

**Decision**: `src/agent_state.rs` manages a top-level `<!-- tinytasks-agent-state ... -->` envelope with schema_version 1, task_sources and request_ledger namespaces shared with feature 004. Preserve unknown fields at every level by patching JSON values. Serialize one HTML-comment-safe line. Assign @uid on touched tasks under the write lock. Retain receipts indefinitely in v1.

**Evidence**: The existing desk metadata comment demonstrates same-file storage; parser/renderer retain unknown comments and task attributes. Numeric max_id reserves desk references but is not a globally permanent task identity. Cargo.lock already contains uuid 1.29.0 and sha2 0.10.9.

**Rationale**: Data and receipts committed together prevent a retry from duplicating a successful write. Unknown-field preservation prevents features from erasing each other's state. A distinct envelope avoids daily desk expiry. Stable task UIDs support shared attribution/question lifetime.

**Alternatives considered**: Local-only sidecar receipts fail across synced computers; hash-only request comparison obscures exact conflict diagnostics; expiring receipts silently weaken retry guarantees. Old binaries preserve the syntax but cannot enforce new semantics, so no universal downgrade-safety claim is made.

## 5. Modern tools without breaking old ones

**Decision**: Add named modern tools and leave legacy signatures/result shapes intact. Modern task writers reject unknown destinations and support explicit creation receipts. New discovery uses snapshot-bound cursors and complete history.

**Evidence**: Existing smoke tests parse list_tasks as an array and exercise add_tasks chat-based section creation. Changing those responses in place would break configured clients.

**Rationale**: A compatibility layer lets old clients continue while modern instructions offer safer behavior. Strict guarantees are enforceable at new tool boundaries; guidance alone is not enforcement.

**Alternatives considered**: Silently changing list_tasks to an envelope is a breaking response change. Adding optional ambiguous fields to add_tasks makes legacy-vs-modern semantics hard to distinguish. Separate tools have a clear contract.

## 6. Cursor and destination resolution

**Decision**: Pages carry a digest of exact active-file bytes plus filters, endpoint, and offset. Any change returns stale_cursor and requires restart; ordering is deterministic saved-file order for tasks and first-section order for lists. Resolve existing destinations by trimmed exact match first, then a unique case-insensitive match; reject ambiguous collisions.

**Rationale**: Offset-only pagination can skip or duplicate records after edits. The conservative digest avoids claiming a stable snapshot that no longer exists. Matching normalizes minor input variation without silently merging hand-edited distinct lists.

**Alternatives considered**: In-memory cursor sessions would not survive process restarts; persistent full snapshots add storage/expiry complexity; fuzzy name matching risks the wrong list.

## Open Implementation Risks, Not Unresolved Design Decisions

Windows atomic replacement must be exercised on Windows. Old/direct writers can bypass application invariants. Metadata grows without automatic receipt compaction. All of these have explicit release gates in [plan.md](plan.md); none requires an unanswered product choice before task generation.
