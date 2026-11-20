# Tasks: 004-agent-questions

Input: spec.md, plan.md, data-model.md and contracts/. User has authorized all stories for local review.

## Phase 1: Setup

- [X] T001 Apply user scope reduction to specs/004-agent-questions/plan.md; no host connectors or hooks.

## Phase 2: Foundation

- [X] T002 Use shared envelope/identity/ledger from src/agent_state.rs; register src/questions.rs in src/main.rs. Implement constraints cited in data-model.md: `QuestionFamily.question_id`, `QuestionFamily.task_uid`, `QuestionFamily.task_id_at_creation`, `QuestionFamily.source`, `QuestionFamily.current_revision_id`, `QuestionFamily.created_at`, `QuestionRevision.revision_id, question_id`, `QuestionRevision.prompt`, `QuestionRevision.mode`, `QuestionRevision.options`, `QuestionRevision.min_selected, max_selected`, `QuestionRevision.allow_custom`, `QuestionRevision.default_option_ids`, `QuestionRevision.recommended_option_id`, `QuestionRevision.default_text`, `QuestionRevision.disposition`, `QuestionRevision.withdrawal_reason`, `QuestionRevision.response_id`, `QuestionRevision.created_at, resolved_at`, `Response.response_id, question_id, revision_id`, `Response.task_uid, source`, `Response.outcome`, `Response.answer`, `Response.submission_id`, `Response.submission_input`, `Response.submitted_at`, `Response.submitted_via`, `Statetransitions.No pending question`, `Statetransitions.Pending`, `Statetransitions.Pending`, `Statetransitions.Pending`, `Statetransitions.Answered/Declined`, `Statetransitions.Answered/Declined/Withdrawn`, `Statetransitions.Any`, `Statetransitions.Any`, `Statetransitions.Pending`.

## Phase 3: Answer in details

Goal and independent check: complete US1 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T003 [US1] Implement question validation, explicit desktop submission, modes/defaults and draft-safe form in src/questions.rs, src/app.rs and ui/questions.js.

## Phase 4: Correct response delivery

Goal and independent check: complete US2 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T004 [US2] Expose optional publish/get/list/ack/withdraw tools in src/mcp.rs and src/questions.rs with stable source and retry semantics.

## Phase 5: Consistent answers

Goal and independent check: complete US3 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T005 [US3] Reject stale submissions and withdraw pending questions on removal while preserving history in src/questions.rs and src/store.rs.

## Phase 6: Validation

- [X] T006 Exercise service/MCP/form scenarios in src/questions.rs, scripts/agent-workflow-smoke.py and scripts/usability-interactions.cjs; document docs/agent-questions.md and specs/004-agent-questions/validation.md.

## Dependencies and execution strategy

Setup → foundation → each user story → integration validation. Feature 002 foundation precedes
003 and 004. Apply edits to shared files serially. Validate incremental stories; the requested
local review build includes every story, not only the first-story MVP.

## Parallel opportunities

Within each story, documentation review and read-only fixture inspection may run alongside
independent build commands. Shared Rust and ui/app.js edits are sequential. No parallel agent
execution is required. Native platform checks remain explicitly distinguished from browser mocks.

Implementation and local-review tasks complete. Platform acceptance limitations are explicitly recorded in validation.md; this is not a claim of Windows-native certification.
