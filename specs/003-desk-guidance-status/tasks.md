# Tasks: 003-desk-guidance-status

Input: spec.md, plan.md, data-model.md and contracts/. User has authorized all stories for local review.

## Phase 1: Setup

- [X] T001 Inspect desk state and UI integration in src/desk.rs and ui/desk.js.

## Phase 2: Foundation

- [X] T002 Reuse shared source, ledger, UID and metadata helpers from src/agent_state.rs. Implement constraints cited in data-model.md: `Sourceidentity.client_id`, `Sourceidentity.conversation_id`, `Sourceidentity.title`, `Sourceidentity.url`, `PlanningRun.run_id`, `PlanningRun.source`, `PlanningRun.agent`, `PlanningRun.date`, `PlanningRun.status`, `PlanningRun.started_at_ms`, `PlanningRun.updated_at_ms`, `PlanningRun.expires_at_ms`, `PlanningRun.observed_proposal`, `PlanningRun.submitted_proposal_id`, `PlanningRun.failure_code`, `PlanningRun.failure_message`, `Statetransitions.Begin`, `Statetransitions.Duplicate begin`, `Statetransitions.Progress`, `Statetransitions.Failure report`, `Statetransitions.Valid associated submit`, `Statetransitions.Invalid arrangement`, `Statetransitions.New begin`, `Statetransitions.Unassociated legacy submit`, `Statetransitions.New app edits/reviews proposal`, `Statetransitions.Expiry / out-of-band change`, `Statetransitions.Local day change`.

## Phase 3: Planning activity

Goal and independent check: complete US1 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T003 [US1] Implement begin/report/submit with observed proposal, atomic receipt and snapshot in src/desk.rs and src/mcp.rs.

## Phase 4: Planning activity

Goal and independent check: complete US1 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T004 [US1] Render header/sidebar status without disturbing editors in ui/desk.js and ui/app.js.

## Phase 5: Interrupted work

Goal and independent check: complete US2 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T005 [US2] Implement lease/day/clock/source guards and legacy invalidation in src/desk.rs; add deterministic state tests.

## Phase 6: My Desk basics reference

Goal and independent check: complete US3 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T006 [US3] Add a separate read-only Basics window in ui/basics.html, ui/basics.js and src/app.rs; no inline invitation, tour steps, or persistence.

## Phase 7: Validation

- [X] T007 Run protocol/UI coverage in scripts/agent-workflow-smoke.py and scripts/usability-interactions.cjs; update docs/my-desk.md and specs/003-desk-guidance-status/validation.md.

## Dependencies and execution strategy

Setup → foundation → each user story → integration validation. Feature 002 foundation precedes
003 and 004. Apply edits to shared files serially. Validate incremental stories; the requested
local review build includes every story, not only the first-story MVP.

## Parallel opportunities

Within each story, documentation review and read-only fixture inspection may run alongside
independent build commands. Shared Rust and ui/app.js edits are sequential. No parallel agent
execution is required. Native platform checks remain explicitly distinguished from browser mocks.

Implementation and local-review tasks complete. Platform acceptance limitations are explicitly recorded in validation.md; this is not a claim of Windows-native certification.
