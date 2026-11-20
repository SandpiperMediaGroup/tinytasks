# Tasks: 001-task-interactions

Input: spec.md, plan.md, data-model.md and contracts/. User has authorized all stories for local review.

## Phase 1: Setup

- [X] T001 Inspect existing interaction fixtures and build tools in scripts/ui-smoke.cjs and Cargo.toml.

## Phase 2: Foundation

- [X] T002 Add source-order and guarded mutation checks in src/store.rs and src/app.rs. Implement constraints cited in data-model.md: `ViewLayout.groupBy`, `ViewLayout.orderBy`, `ViewLayout.groupDescending`, `ViewLayout.orderDescending`, `ExpandedBranch.rootId`, `ExpandedBranch.childId`, `ExpandedBranch.transitionSequence`, `ExpandedBranch.pendingTarget`, `DragSession.kind`, `DragSession.pointerId`, `DragSession.taskId / parentId`, `DragSession.startPoint`, `DragSession.finalized`, `DragSession.sourceGuard`, `DragSession.initialSiblingIds`, `DragSession.initialDeskItem`, `DragSession.destination`, `DragSession.viewportAnchor`, `PendingClear.operation`, `PendingClear.target`, `PendingClear.baseline`, `PendingClear.generation`, `PendingClear.busy / error`.

## Phase 3: Turn sorting off

Goal and independent check: complete US1 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T003 [US1] Implement No sorting and preference persistence in ui/app.js; test source ordering in src/store.rs.

## Phase 4: Read one task at a time

Goal and independent check: complete US2 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T004 [US2] Centralize expansion with saved-draft safety in ui/app.js.

## Phase 5: Readable details

Goal and independent check: complete US3 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T005 [US3] Adjust reading column and spacing in ui/style.css.

## Phase 6: Stable dragging

Goal and independent check: complete US4 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T006 [US4] Fence drag lifecycle, prevent native selection/scroll jumps, preserve viewport, and guard writes in ui/app.js, ui/desk.js and src/app.rs.

## Phase 7: Discoverable mode

Goal and independent check: complete US5 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T007 [US5] Always display subtask mode in ui/style.css and preserve labels in ui/app.js.

## Phase 8: Desk membership

Goal and independent check: complete US6 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T008 [US6] Render accepted membership lamp in ui/app.js, ui/index.html and ui/style.css.

## Phase 9: Clear time

Goal and independent check: complete US7 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T009 [US7] Label clear and preserve saved range on failed clear in ui/index.html and ui/desk-arc.js.

## Phase 10: Quiet tooltips

Goal and independent check: complete US8 acceptance scenarios in spec.md; validate the corresponding focused fixture before proceeding.

- [X] T010 [US8] Remove redundant tooltip text and preserve accessible names in ui/app.js.

## Phase 11: Named links

- [X] T012 [US9] Implement derived named/plain link chips, supported native opening, delayed destination tooltips and regression coverage in ui/details-links.js, src/app.rs and scripts/usability-interactions.cjs.

## Phase 12: Validation

- [X] T011 Exercise updated UI regressions in scripts/usability-interactions.cjs, update docs/my-desk.md, and record local native review limitations in specs/001-task-interactions/validation.md.

## Dependencies and execution strategy

Setup → foundation → each user story → integration validation. Feature 002 foundation precedes
003 and 004. Apply edits to shared files serially. Validate incremental stories; the requested
local review build includes every story, not only the first-story MVP.

## Parallel opportunities

Within each story, documentation review and read-only fixture inspection may run alongside
independent build commands. Shared Rust and ui/app.js edits are sequential. No parallel agent
execution is required. Native platform checks remain explicitly distinguished from browser mocks.

Implementation and local-review tasks complete. Platform acceptance limitations are explicitly recorded in validation.md; this is not a claim of Windows-native certification.

- [X] T013 Implement and verify persistent manual root ordering under No sorting, including drop markers, stale/cancel/failure handling and refreshed local app.
