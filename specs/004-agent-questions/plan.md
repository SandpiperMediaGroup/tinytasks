# Implementation Plan: Optional MCP Questions

Branch: `codex/usability-agent-specs` | Updated: 2026-11-20

## Summary

Implement a small optional question card in task details. Agents explicitly publish structured
questions through MCP, humans explicitly send/decline, agents poll and acknowledge. No native
hooks/connectors for any host; no native batching, session binding, or automatic resumption.

## Technical context

Existing Rust/Tauri, serde JSON, vanilla JavaScript/CSS. Depend on 002 agent_state envelope,
immutable task UID, source identity, canonical retry ledger and fail-closed atomic storage.
Use src/questions.rs for validation/lifecycle, src/mcp.rs for five tools, src/app.rs for user-only
answer/read commands, ui/questions.js for form/drafts, ui/app.js for row integration.

## Constitution check

All five principles pass: explicit human submit, durable portable responses, quiet accessible
form, saved distinct from acknowledged, and focused protocol/UI tests. No host wake-up claims.

## Implementation order

1. Use the shared storage/identity foundation; preserve unknown data and other namespaces.
2. Implement publish/get/list responses/withdraw/acknowledge per contracts/questions.md and
   data-model.md. Keep one active question/task and immutable answered revision history.
3. Add desktop-only explicit submission. Validate revision and persist response/retry together.
4. Reconcile question withdrawal on task/list deletion and archival, retaining answered history.
5. Render a small card after details and before children; preserve per-question drafts through
   row collapse/refresh, keep input events separate from dragging and task text auto-save.
6. Verify source separation, retry/stale behavior, durable restart and accessible rendered forms.

## Coverage

| Requirements | Implementation | Validation |
| --- | --- | --- |
| FR-001–004 | questions.rs, desktop submit, questions.js | modes, defaults, send/decline, failed draft |
| FR-005–009 | identity/source/revision/receipt service | wrong source, restart, no false receipt |
| FR-010–012 | immutable revisions, removal reconciliation | two windows, stale sends, retained history |
| FR-013–014 | MCP tools and form controls | explicit publication only, keyboard and draft safety |

## Validation

Rust tests, real temporary-store MCP smoke, existing Playwright desktop mocks and isolated local
app review. No native-host integration tests are needed or claimed. See quickstart.md.
