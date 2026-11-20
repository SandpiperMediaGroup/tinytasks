# Tasks: 002-list-hygiene

Input: spec.md, plan.md, data-model.md and contracts/. User has authorized all stories for local review.

## Phase 1: Setup

- [X] T001 Inspect storage and protocol fixtures in src/store.rs and scripts/mcp-smoke.py.

## Phase 2: Foundation

- [X] T002 Implement shared JSON envelope, identities, retry ledger, cursors and strict atomic writer in src/agent_state.rs, src/store.rs and Cargo.toml. Implement constraints cited in data-model.md: `Listdestination.name`, `Listdestination.section_count`, `Listdestination.task_count`, `Listdestination.open_count / completed_count`, `Listdestination.empty`, `Taskidentityandsource.id`, `Taskidentityandsource.uid`, `Taskidentityandsource.store_uuid`, `Taskidentityandsource.source.client_id`, `Taskidentityandsource.source.conversation_id`, `Taskidentityandsource.source.title`, `Taskidentityandsource.source.url`, `Requestreceipt.client_id, conversation_id`, `Requestreceipt.operation`, `Requestreceipt.request_id`, `Requestreceipt.canonical_input`, `Requestreceipt.result`, `Requestreceipt.committed_at`.

## Phase 3: Erase empty lists

Goal and independent check: complete US1 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T003 [US1] Implement zero-task raw-section archive preview/apply in src/store.rs and src/app.rs.

## Phase 4: Erase empty lists

Goal and independent check: complete US1 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T004 [US1] Add sidebar archive context action, keyboard access and state refresh in ui/app.js and ui/index.html.

## Phase 5: Preserve cleanup

Goal and independent check: complete US2 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T005 [US2] Use archive recovery journal and conservative eligibility checks in src/store.rs; add preservation and recovery tests.

## Phase 6: Agent hygiene

Goal and independent check: complete US3 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T006 [US3] Implement list_lists/list_tasks_page/ensure_task_identity/create_list/create_tasks/update_task_v2 in src/agent_state.rs and src/mcp.rs.

## Phase 7: Agent hygiene

Goal and independent check: complete US3 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T007 [US3] Update server guidance and exact-header migration in src/mcp.rs and src/store.rs; document reuse in docs/agent-setup.md.

## Phase 8: Validation

- [X] T008 Run temporary-file MCP scenarios and storage tests in scripts/agent-workflow-smoke.py and src/agent_state.rs; record in specs/002-list-hygiene/validation.md.

## Dependencies and execution strategy

Setup → foundation → each user story → integration validation. Feature 002 foundation precedes
003 and 004. Apply edits to shared files serially. Validate incremental stories; the requested
local review build includes every story, not only the first-story MVP.

## Parallel opportunities

Within each story, documentation review and read-only fixture inspection may run alongside
independent build commands. Shared Rust and ui/app.js edits are sequential. No parallel agent
execution is required. Native platform checks remain explicitly distinguished from browser mocks.

Implementation and local-review tasks complete. Platform acceptance limitations are explicitly recorded in validation.md; this is not a claim of Windows-native certification.
