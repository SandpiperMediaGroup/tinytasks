# Implementation overview and cross-feature contracts

Created 2026-11-20 using Spec Kit 1.4.3. This document coordinates the four implementation plans;
it does not generate implementation tasks or claim runtime validation.

## Plans

| Feature | Plan | Design artifacts |
| --- | --- | --- |
| 001 — Task interactions | [plan](001-task-interactions/plan.md) | research, data model, interaction contract, validation guide |
| 002 — List hygiene | [plan](002-list-hygiene/plan.md) | research, data model, modern MCP and cleanup/storage contracts, validation guide |
| 003 — Desk guidance/status | [plan](003-desk-guidance-status/plan.md) | research, data model, planning and guide/UI contracts, validation guide |
| 004 — Agent questions | [plan](004-agent-questions/plan.md) | research, data model, question and portable question contracts, validation guide |

## Delivery order

1. Implement 001's task interaction improvements. This can ship independently.
2. Implement 002's shared storage/identity foundation, then its cleanup and modern agent tools.
   The storage foundation is a dependency of the durable agent features, not a requirement that
   every cleanup UI detail ship before other work can begin.
3. Implement 003's planning state against that foundation. The guide can be built independently
   but must describe the final labeled Clear time and review behavior.
4. Implement 004's optional MCP questions and explicit user answers against the same foundation.
   Integrate drafts with 001 expansion; no host hook/connector work is in scope.

The next Spec Kit step is task generation for each plan. Do not split all four into independent
implementation branches without coordinating their shared source files and the foundation below.

## Shared foundation owned by 002

`src/agent_state.rs` is a proposed new shared module, not four independent serializers. It owns:

- A top-level `<!-- tinytasks-agent-state ... -->` JSON envelope in the existing task file,
  `schema_version:1`, store_uuid, unknown-field-safe patching, and opaque UUID helpers.
- Immutable task `@uid(...)` identities, separate from potentially reused numeric IDs.
- Source identity `{client_id,conversation_id,title?,url?}`; only the first two fields identify
  a source. Display names and links are not routing or authentication keys.
- An agent request ledger keyed by source tuple, operation and request_id. Store normalized
  canonical input and the original stable result in the same transaction as the mutation.
- Exact-byte full-file SHA-256 revisions and a bounded opaque hex-JSON cursor containing endpoint,
  revision, filters, fixed limit and offset. Every collection returns has_more/next_cursor.
- Fail-closed atomic active-file replacements and journalled archive recovery. The current
  in-place fallback on rename failure cannot support the promised durable state semantics.

Promote only already-locked uuid 1.29.0 and sha2 0.10.9 as direct dependencies during implementation
of this foundation. A broad runtime/toolchain upgrade is not part of the plans.

Reads leave legacy files unchanged. list_tasks_page can return uid:null and store_uuid:null.
ensure_task_identity uses a full-file expected_snapshot_revision to allocate identity safely.
Its stored result contains stable identities, not a hash of the file containing its own receipt.
Callers reread discovery after identity assignment when a new snapshot is needed.

Canonicalization validates and normalizes operation-specific semantics first (including default
values and response choice order), then recursively sorts object keys while retaining normalized
array order. Source display fields supplied as input remain part of that request's canonical
payload. Retrying with changed input under the same key returns idempotency_conflict. Receipt
lookup follows structural/store/schema validation and precedes mutable target/CAS checks, so a
successful request can replay after later deletion or supersession without resurrecting data.

## Namespace ownership

| Namespace or data | Owner | Rules for other features |
| --- | --- | --- |
| Existing Markdown headings and Task.chat | 002 compatibility contract | Continue representing destination list; do not repurpose as source title |
| task_sources and agent request_ledger | 002 | Use common APIs; no duplicate per-feature serialization/eviction |
| planning.current | 003 | Preserve on unrelated writes; only daily planning lifecycle may expire it |
| questions families/revisions/responses/receipts | 004 | Preserve across midnight, task removal and archives; withdrawal is explicit lifecycle work |
| Existing tinytasks-desk items/proposal | Existing desk plus 003 | Update proposal observation on known mutations; do not move durable question history here |
| Question answer drafts | 004 UI controller | Preserve through 001 row collapse and normal refresh; never auto-submit |

Human response idempotency is intentionally separate from the agent ledger. An immutable Response
contains submission_id and normalized submission_input and serves as its own retry receipt under
(store_uuid,question_id,revision_id,submission_id). This avoids inventing client/conversation names
that could collide with agent callers. Only the human submission service creates these records.

## Source-file coordination

| Surface | Changes that must be composed |
| --- | --- |
| src/store.rs | 001 source-order desktop projection; 002 identity/atomic archive foundation; 004 removal lifecycle preparation |
| src/mcp.rs | 002 new discovery/creation tools; 003 explicit planning tools; 004 question tools; keep legacy contracts compatible |
| src/app.rs | 001 optional drag guards; 002 cleanup commands; 003 proposal observation/status; 004 question reads/user submission |
| src/desk.rs | 001 expectedItem timing guard; 003 planning state and proposal observation; 004 rollover preservation checks |
| ui/app.js | 001 central expansion/drag/viewport logic; 002 sidebar menu; 003 lightweight status; 004 visible-question loads/draft hooks |
| ui/index.html and style.css | Dedicated lamp/action slots, clear-time label, menu, status, guide and question containers with independent selectors |
| scripts/ui-smoke.cjs and mcp-smoke.py | Shared fixture/schema updates; keep old scenarios while adding each feature's focused cases |

Question input events must be excluded from row dragging and toggling. The save-before-collapse
rule only commits task text; it must never submit a selected question default or draft. Planning
status and receipts refresh without replacing focused question/task input nodes.

001's optional expectedIds/expectedSource/expectedItem desktop guards remain supported as 003
extends desk snapshots. A captured drag context cannot overwrite a concurrent accepted time edit.
003's known proposal edits advance observation but never extend a planning heartbeat.

## Storage and compatibility gates

- Unknown namespaces and fields survive writes; malformed known metadata, duplicate envelopes,
  ambiguous UIDs, and unsupported future schema versions reject new metadata-aware writes.
- Raw list archive/delete paths must call lifecycle preparation; hooking only task deletion would
  miss them. Keep historical question responses in active metadata after a task is archived.
- Same-machine lock/recovery semantics do not imply cloud transactions across computers.
- Old binaries may preserve unknown bytes but cannot honor new run/answer/receipt invariants.
  Update all writers before relying on the new agent contracts; observed mismatches fail safely.
- Array/file ordering for No sorting does not imply reordering the physical file or modern agent
  discovery responses by UI preference.

## Validation and review result

Each plan includes pre-research and post-design constitution checks and maps every functional
requirement to implementation surfaces and validation. The cross-feature review corrected:

1. Inconsistent retry/schema error names and result wrappers.
2. Conflicting pagination schemes; all new discovery uses the shared cursor policy.
3. Retry ordering that could reject a previously successful request after task deletion.
4. Historical responses lacking the immutable prompt/options needed to interpret them.
5. Human submission retry keys that did not fit the agent ledger; responses now carry their own
   distinct retry identity.
6. Legacy tasks needing explicit UID allocation before planning/question references are used.

Native drag reproduction, Windows/macOS atomic replacement behavior, and native dialog/focus
checks remain implementation validation gates. Questions use explicit MCP publication, user
answer, agent polling and acknowledgment. Native connectors/hooks are deferred by user direction.
