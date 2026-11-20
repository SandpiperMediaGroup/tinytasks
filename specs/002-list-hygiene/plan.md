# Implementation Plan: Empty-List Cleanup and Agent Hygiene

**Branch**: `codex/usability-agent-specs` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: `specs/002-list-hygiene/spec.md`

**Status**: Phase 0 research and Phase 1 design complete. No application changes or application-test execution in this planning pass.

## Summary

Add the requested global archive-action action to sidebar context menus, using complete-file emptiness checks and one recoverable batch archive transaction. Add a backward-compatible modern agent API that separates list destination from conversation attribution, explicitly creates lists, provides complete paginated discovery, and persists creation receipts for safe retries. Keep existing legacy tool names and payload shapes intact while steering updated clients to the new tools.

Share a versioned `tinytasks-agent-state` Markdown comment and `src/agent_state.rs` with feature 004. Persist new source attribution against immutable task UIDs rather than reusable numeric display IDs. Preserve unknown metadata and refuse unsupported future schema writes. The shared architecture must land once; feature-specific namespaces and contracts are separate.

## Technical Context

**Language/Version**: Rust edition 2021; observed local rustc 1.99.1; browser JavaScript without a frontend build framework.

**Primary Dependencies**: Existing Tauri 2, serde, serde_json and chrono. Promote the already locked `uuid = 1.29.0` (v4 generation) and `sha2 = 0.10.9` to direct dependencies for shared identities and file-revision digests. Preserve the rest of Cargo.lock; this is not a dependency upgrade sweep.

**Storage**: Existing tasks.md and archive.md; same-machine tasks.lock; recoverable archive-pending.json; additive top-level agent-state comment and task `@uid(...)` tags; localStorage remains responsible for sidebar presentation.

**Testing**: Rust storage/agent-state unit and recovery tests, real stdio MCP smoke cases, existing Playwright sidebar/list fixtures, documentation assertions for legacy/new tool guidance.

**Target Platform**: macOS and Windows desktop, existing local stdio MCP clients and cloud-synced Markdown folders.

**Project Type**: Small desktop app with embedded MCP server.

**Performance Goals**: One authoritative parse per cleanup/read request, one section-selection pass per archive batch, pages of 1–200 items; prove complete discovery on a 250-task fixture. No silent cap or repeated per-list archive transactions.

**Constraints**: No destructive cleanup, no review panel, no implicit new lists through modern task writes. No cross-computer locking guarantee. Mixed old/new binaries preserve syntax but old writers cannot enforce new metadata semantics.

**Scale/Scope**: Three stories, FR-001–013; task/list storage, sidebar menu, MCP contracts and usage docs. Metadata growth is bounded by usage, not automatic receipt eviction in v1.

## Constitution Check

| Principle | Before research | After design |
| --- | --- | --- |
| Human action ownership | PASS: cleanup is user-invoked; agents reuse human work | PASS: modern creation requires destination/source, with explicit list creation and no semantic auto-merging |
| Durable portable data | PASS: existing raw-section archive is the foundation | PASS: one journalled batch, fail-closed replacement, unknown-field preservation and explicit compatibility rules |
| Quiet accessible UI | PASS: one context action, no added management screen | PASS: blank-space/heading/list menus share labeled action and keyboard equivalent; drafts save before mutation |
| Truthful agent state | PASS: accurate counts and reported write failures | PASS: receipts committed with mutations; retries return original results, not fictitious new writes |
| Focused evidence | PASS: storage/protocol/UI tests are scoped to change | PASS: all FRs mapped below; migration/retry/race/failure scenarios specified; no implementation claimed tested |

No constitution exception is required. Archive corruption or metadata-schema validation failure must abort writes rather than bypass a gate.

## Project Structure

### Documentation (this feature)

```text
specs/002-list-hygiene/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── mcp.md
    └── cleanup-storage.md
```

`tasks.md` belongs to the later Spec Kit tasks phase and is not generated here.

### Source Code (repository root)

```text
src/
├── agent_state.rs       # new shared envelope, task identity, source and request receipt helpers
├── store.rs             # section eligibility, batch journal, safe replacement and metadata integration
├── mcp.rs               # modern discovery/create/update tools; legacy adapters remain
├── app.rs               # cleanup preview/apply bridge commands and mutation hooks
└── main.rs              # register shared agent_state module
ui/
├── app.js               # sidebar global action, draft guard, navigation/preferences refresh
├── index.html           # menu entry and keyboard-focusable list-section trigger
├── icons.js             # small archive icon
└── style.css            # context action alignment only
scripts/
├── mcp-smoke.py
├── ui-smoke.cjs         # extend mocked bridge for cleanup and source fields
├── sidebar-interactions.cjs
└── list-interactions.cjs
README.md
docs/agent-setup.md
docs/lists-and-navigation.md
Cargo.toml
Cargo.lock
```

**Structure Decision**: Keep raw Markdown section manipulation in store.rs and protocol adaptation in mcp.rs. The shared agent-state module owns durable metadata, not filesystem writes; store transactions remain the only commit boundary. No database or new service.

## Implementation Approach

### 1. Shared identity and metadata foundation

Implement the [data model](data-model.md) and shared schema agreed with feature 004. `store::change` loads a list and its metadata together under the existing lock; a successful new mutation patches its namespace, allocates touched-task UIDs if needed, and records its request receipt before a single atomic active-file replacement. Validation errors write nothing. Use exact canonical request data in receipts rather than hash-only comparisons.

Add a fail-closed replacement primitive for metadata-bearing active writes and archive/journal writes. The current `write` fallback truncates the destination if rename fails; it cannot underpin the new durability claim. Replacement failure must retain the previous destination and return an error; keep recoverable temporary/journal material. Exercise Windows replacement behavior on Windows rather than silently restoring the old fallback.

Legacy task records need no bulk rewrite. Missing source attribution remains absent; legacy `chat` stays the list. Assign UIDs only under a write lock when first touched by metadata-aware operations. Existing UIDs survive edits and moves. Ambiguous duplicate UIDs from manual copying reject dependent writes until resolved; never silently bind old history to another task.

### 2. One cleanup transaction

Compute eligibility from all stored tasks plus raw section names, without `for_ui` or `for_agents` filtering. A named list is eligible only when every exact-name section contains zero unfinished parsed tasks. Keep Personal (empty underlying list key) and built-in navigation views outside selection. Preserve notes-only sections and original section ordering in archive output.

Recheck once under lock on apply, select all eligible spans, then compute complete `active_after` and `archive_after`. Journal both before/after images using the existing ArchiveMove shape; commit archive before removing active sections, and clear the journal only after both replacements succeed. Do not call archive_chat repeatedly: a single batch gives one recoverable result and avoids partial-success UI ambiguity. No eligible spans means no write and count zero.

Expose `get_empty_list_cleanup` for menu availability and `archive_empty_lists` for apply. Return archived names/count only after commit/recovery succeeds. A failure returns no successful count; after recovery a repeated apply may correctly report zero because the previous move completed. Emit tasks-changed and refresh authoritative names. Remove only archived names from local icon/order maps; switch to All only if the selected name was archived.

### 3. Sidebar affordance

Use one global command path from blank sidebar space, Lists & Chats heading, and each list's context menu. Global action is separated from single-list Archive list and Delete list. Do not make right-clicking a child action bubble into a second menu. Keyboard users can focus the list-section trigger and open the menu with Shift+F10/ContextMenu.

Before apply, reuse active task/list draft guards. A failed save aborts cleanup and keeps the draft. Disable the entry while preview/apply is pending; zero count disables it. Always recheck in the backend. Keep success and no-op results silent; show actionable errors only.

### 4. Modern MCP contract and legacy compatibility

Implement [contracts/mcp.md](contracts/mcp.md): `list_lists`, `list_tasks_page`, `create_list`, `create_tasks`, and `update_task_v2`. New creation requires a source correlation object and request_id; list creation additionally requires a purpose. Destination matching trims input and resolves a unique case-insensitive existing name, returning an ambiguity error when hand-edited collisions exist. Missing destination uses Personal. Never create a named heading as a side effect of modern task creation/update.

Leave `add_tasks`, `list_tasks`, and `update_task` behavior and result shapes compatible for old clients. Their limitations remain explicitly documented. Server instructions and usage documentation prefer modern tools, full discovery, task updates, and related subtasks. Agents cannot be forced to follow prose, so strict destination and retry invariants live in new tool implementations.

### 5. Integration and documentation

Maintain `Task.chat` as a compatibility list field; add a separate optional `source` projection for new read results and UI context. Keep `Task.link` for legacy links; explicit source URL is not inferred from arbitrary task links. Moving a parent preserves its descendants' source data. Archive/delete paths that operate on raw strings must run metadata lifecycle preparation before computing journalled after-images, including feature 004 question withdrawal. Ordinary nonempty archives copy relevant source records into the archive envelope while retaining request receipts in active data; cleanup of completed-only lists uses the same source-copy and question-reconciliation hooks; task-free sections leave task namespaces unchanged.

Update built-in task-file guidance only when it exactly matches the known prior header; preserve user-customized guidance. Document new and legacy tools, source/list distinction, pagination restarts, receipt lifetime, and mixed-version limitations. Do not modify global agent configuration or memories.

## Requirement Coverage and Validation

| Requirements | Planned change | Acceptance evidence |
| --- | --- | --- |
| FR-001, FR-005 | Shared sidebar global action and draft guard | Blank/heading/list context-menu invocation, keyboard equivalent, no panel/confirmation, save failure |
| FR-002–004 | Complete-file eligibility and locked batch selection | Old completed tasks, children, duplicate sections, notes-only sections, stale preview, empty no-op |
| FR-006 | Whole-batch journal plus fail-closed replacement | Crash at each stage, blocked destination, exact-once recovery, concurrent edit conflict |
| FR-007, FR-012 | Independent source metadata, UIDs, compatible legacy paths | Legacy round trips; two conversations/one list; parent move; archive source retention |
| FR-008–009 | Updated guidance and strict modern destination resolution | Personal fallback, typo rejection, explicit purpose, case collision, no automatic duplicate merge |
| FR-010 | Snapshot-bound pages without age filtering | 250 tasks, older completions, empty lists, stale cursor, changed filter rejection |
| FR-011 | Same-transaction persisted creation receipts | Lost-response retry, restart retry, changed-input conflict, retry after archive/delete |
| FR-013 | Name-scoped preference pruning and navigation fallback | Active selected list archived vs unrelated selected list; duplicate-title task preservation |

## Delivery Order and Dependencies

1. Shared agent-state/identity/atomic-write foundation; coordinate once with 004.
2. Pure cleanup eligibility and batch journal with storage tests.
3. Tauri commands and sidebar menu interactions.
4. Modern MCP list discovery, strict destination/source writes, and idempotent creation.
5. Compatibility fixtures, docs, and platform-specific replacement checks.

Cleanup can ship before modern agent tooling because it does not require new task metadata. Feature 004 depends on the shared envelope/UID/receipt infrastructure, not on the cleanup UI. Features 001/003 may independently alter ui/app.js; integrate their changes without replacing whole-file snapshots.

## Risks and Release Gates

- Existing in-place-write fallback is insufficient: failure-atomic replacement and recovery tests must pass before claiming durable receipts.
- Old binaries preserve unknown tags/comments but can bypass new semantics. Do not promise mixed-writer integrity; recommend upgrading all writers sharing a task file. Future schemas are rejected by modern mutation paths.
- No receipt eviction in v1 means metadata grows; report this limitation and measure fixture growth without introducing silent expiration or a new compaction policy.
- Snapshot cursors deliberately invalidate on unrelated edits, favoring correctness over uninterrupted long scans; clients must restart discovery when told.
- Source metadata copied into archive files must preserve unknown envelope namespaces and prevent history rebinding through reused numeric task IDs.

## Workflow Completion

The parent ran the official setup-plan script for this feature and supplied its resolved template. Research, data model, contracts and quickstart are complete. No extensions.yml exists, so pre/post planning hooks are absent. Pre-research and post-design constitution checks pass. Next workflow phase is `$speckit-tasks`, not implementation automatically.

User refinement (2026-11-20): regular and empty-list archive success/no-op must be silent; update sidebar only. Retain actionable failure feedback. No success notification in document flow.
