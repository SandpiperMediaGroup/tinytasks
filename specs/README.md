# TinyTasks feedback specifications

Created 2026-11-20 from the complete feedback conversation. These are requirements and
acceptance criteria, not implemented features. Start with the feature specs below; technical
observations and version evidence are in [baseline.md](baseline.md).

## Verified baseline

- TinyTasks source: `origin/main` and the initial local `main` both at
  `8bf6ba2e9c6f76ad6c89e90968b68eb99611672f`, matching the latest published release
  [v0.3.6](https://github.com/SandpiperMediaGroup/tinytasks/releases/tag/v0.3.6).
- Fetch of all remote branches/tags completed; zero commits ahead/behind at the starting point.
  GitHub reported zero open pull requests when checked.
- Installed `/Applications/TinyTasks.app` reports `0.3.6`.
- [Spec Kit v1.4.3](https://github.com/github/spec-kit/releases/tag/v1.4.3), published
  2026-11-19, used to initialize this repository. Its pinned source commit is
  `980b3d027f4bd7958c35f97f618d854b41320e3f`.
- The computer's installed `specify` CLI was updated from `0.16.1.dev0` to `1.4.3` and verified
  at `/Users/evanolson/.local/bin/specify`.
- Initial [project constitution](../.specify/memory/constitution.md): version 1.0.0, derived
  from existing product/storage behavior and the user's feedback.
- Working branch: `codex/usability-agent-specs`. Runtime dependencies and application code
  are unchanged by this specification work.

## Specifications, implementation plans, and sequence

| Order | Specification | Implementation plan | Scope |
| --- | --- | --- | --- |
| 1 | [001 — Task interactions](001-task-interactions/spec.md) | [Plan](001-task-interactions/plan.md) | Sorting, details, dragging, subtask mode, lamps, time clearing, tooltip noise |
| 2 | [002 — List hygiene](002-list-hygiene/spec.md) | [Plan](002-list-hygiene/plan.md) | Magic-eraser cleanup, agent reuse, shared storage foundation |
| 3 | [003 — Desk guidance and status](003-desk-guidance-status/spec.md) | [Plan](003-desk-guidance-status/plan.md) | Guided walkthrough and truthful planning activity |
| 4 | [004 — Agent questions](004-agent-questions/spec.md) | [Plan](004-agent-questions/plan.md) | Questions, explicit answers, receipts, optional agent-invoked MCP questions |

Each spec follows the active Spec Kit template with independently testable user stories,
functional requirements, measurable success criteria, edge cases, assumptions, and its own
`checklists/requirements.md`. Four separate Spec Kit planning passes have now produced plan.md,
research.md, data-model.md, contracts, and quickstart.md for each feature. See the
[implementation overview](implementation-overview.md) for dependencies and cross-feature contracts.
The plans are ready for task generation; no implementation or task-generation phase has run.
The [Spec Kit upgrade comparison](spec-kit-upgrade.md) explains the installed tooling changes.

## Complete feedback coverage

| Feedback | Owner | Requirements |
| --- | --- | --- |
| Ability to turn sorting off independently of grouping | 001, story 1 | FR-001–003 |
| Joyride-like introduction to My Desk | 003, story 3 | FR-009–013 |
| Quickly clean up old lists, refined to sidebar archive for lists with no unfinished tasks | 002, stories 1–2 | FR-001–006, FR-013 |
| Better agent hygiene; avoid unnecessary lists | 002, story 3 | FR-007–013 |
| Building/Working indicator while an agent prepares the day | 003, stories 1–2 | FR-001–008, FR-013 |
| Answer optional agent-published questions in task details, with MCP polling and acknowledgment | 004, stories 1–3 | FR-001–014 |
| Named direct-click link chips with delayed URL tooltip | 001, story 9 | FR-019–021 |
| More breathing room for details | 001, story 3 | FR-006–007 |
| One details row open at a time | 001, story 2 | FR-004–005 |
| Remove unnecessary/noisy tooltips | 001, story 8 | FR-017–018 |
| Window jumps during subtask dragging; investigate task dragging too | 001, story 4 | FR-008–009 |
| Always show ordered/unordered subtask toggle | 001, story 5 | FR-010 |
| Right-side lamp for desk members in other lists, absent in My Desk | 001, story 6 | FR-011–013 |
| Clear time looks like closing the picker | 001, story 7 | FR-014–016 |

## Decisions carried forward

- Empty means zero tasks, including older completed tasks and children. Notes-only list content
  is preserved in the archive. Personal is retained. The action does not archive completed lists.
- The user's sidebar magic-eraser refinement replaces the earlier cleanup-panel proposal.
  No bulk-selection screen, age-based cleanup, or general archive manager is required.
- No sorting preserves saved file order; manual top-level reordering is separate scope.
- One expanded parent may retain one expanded child so nested details remain reachable.
- Desk lamps reflect accepted current-day membership, including direct user additions, not
  pending-only additions in a proposal.
- Clear time is a labeled action that leaves the picker open and retains desk membership.
- Planning needs explicit activity reports; five minutes without one becomes interrupted.
- A default answer is not a submission. Saved and received are distinct states.
- Agent questions are optional MCP publication and polling. All native agent connectors/hooks
  are explicitly backburnered; no automatic mirroring or continuation.
- Implementation evidence and platform limitations are recorded in each feature’s validation.md.

## Continue with Spec Kit

The active local feature pointer is set to `specs/001-task-interactions`. Its plan and supporting
design artifacts are complete. Invoke `$speckit-tasks` for that feature to generate implementation
tasks. For another feature, supply its exact `SPECIFY_FEATURE_DIRECTORY`; feature paths are
independent of the shared Git branch in Spec Kit 1.4.3.

For example, validate another completed plan's prerequisites:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/002-list-hygiene \
  .specify/scripts/bash/check-prerequisites.sh --json
```

Follow the [shared implementation order](implementation-overview.md#delivery-order). The guide and
many UI improvements can ship independently; durable planning/questions require the shared
storage foundation in 002. Use `$speckit-plan` again to revise a design before generating tasks
if product requirements change.
