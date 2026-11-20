# Implementation Plan: Predictable Task Interactions

**Branch**: `codex/usability-agent-specs` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: `specs/001-task-interactions/spec.md`

**Status**: Planning complete; implementation and application validation have not run.

## Summary

Implement the eight interaction improvements in the existing Rust/Tauri and vanilla JavaScript
application. Return desktop task snapshots in source-file order, let the view apply explicit
sorting, centralize expansion and drag lifecycle transitions, improve details layout, and add
small persistent affordances. Keep task storage, daily desk membership, proposal review, and
existing client behavior compatible. Native drag reproduction is an implementation release gate,
not a claimed diagnosis.

## Technical Context

**Language/Version**: Rust edition 2021; inspected local toolchain rustc 1.99.1; vanilla JavaScript,
HTML, CSS; Node v22.15.0 available for existing UI runners.

**Primary Dependencies**: Existing Cargo.lock: Tauri 2.12.5, serde 1.0.229, serde_json 1.0.154,
chrono 0.4.45. Existing Playwright-based scripts. No dependency upgrades or UI framework required.

**Storage**: Existing `tasks.md` and daily desk metadata; existing `listLayouts` localStorage key.
Expansion, drag sessions, and pending clear operations are transient window state.

**Testing**: Rust unit tests for source-order snapshots and mutation guards; existing mocked
Tauri UI runner extended for ordering, accordion, layout, indicators, and drag paths; manual
native macOS/Windows drag measurements using isolated data.

**Target Platform**: macOS and Windows desktop Tauri webviews; narrow 360px and wide 1200px
acceptance sizes, with existing 280px minimum window width checked for graceful layout.

**Project Type**: Small desktop app with local stdio MCP and Markdown storage.

**Performance Goals**: Same-viewport drag operations preserve viewport anchor within 2 logical px
and native bounds within 1 logical px; no whole-file writes for preference or expansion changes;
no per-pointer-move storage writes; details respect reduced motion.

**Constraints**: Preserve historical visibility filters, source-file bytes during presentation
changes, saved sibling order, date/proposal validation, failed drafts, accessible names, and
legacy sorting preferences. Do not interpret task IDs as source order.

**Scale/Scope**: Eight user stories and FR-001–018; changes are confined to current app modules
and focused fixtures. No new theme system or new persistent
ordinal field.

## Constitution Check

| Principle | Before research | After design |
| --- | --- | --- |
| Human action ownership | PASS: presentation changes preserve user task/desk authority | PASS: Clear time retains membership; question drafts are never submitted by expansion changes |
| Durable portable data | PASS: source order comes from existing storage | PASS: no migration; mutation guards run under existing write lock; read-only preferences do not rewrite tasks |
| Quiet accessible interactions | PASS: requirements cover pointer, keyboard, narrow panes | PASS: persistent toggle/lamp, accessible names, restrained tooltips, reduced motion and native-drag checks |
| Truthful agent state | PASS: membership must exclude pending-only proposals | PASS: lamp derives from accepted task membership; failed clear restores saved time |
| Focused evidence | PASS: bounded eight stories | PASS: each requirement maps below; native results remain a release gate rather than inferred from browser mocks |

No constitution exceptions. No planning hooks were registered in `.specify/extensions.yml`.

## Project Structure

### Documentation (this feature)

```text
specs/001-task-interactions/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── interactions.md
└── checklists/requirements.md
```

`tasks.md` belongs to the later Spec Kit task-generation phase and is not generated here.

### Source Code (repository root)

```text
src/store.rs                 # source-order snapshots and guarded sibling mutations
src/app.rs                   # optional desktop drag preconditions on existing commands
src/desk.rs                  # guarded accepted/proposal time writes where drag requires them
ui/app.js                    # ordering, expansion, row state, drag cleanup, tooltip audit
ui/index.html                # persistent lamp and labeled Clear time markup
ui/style.css                 # reading column, status layout, persistent subtask toggle
ui/desk.js                   # drag context and schedule save/refresh coordination
ui/desk-arc.js               # clear-operation pending/failure recovery
scripts/ui-smoke.cjs         # mocked bridge coverage and expanded regression cases
scripts/list-interactions.cjs
scripts/scroll-interactions.cjs
scripts/desk-interactions.cjs
README.md
docs/my-desk.md             # implementation-stage behavior documentation
```

**Structure Decision**: Extend the current modules; avoid adding a framework or splitting the
whole UI as part of this feature. Extract small local helpers for expansion and drag cleanup only
where both task and subtask flows use them.

## Implementation Design and Order

### 1. Establish ordering and interaction regression fixtures

Create source-order fixtures with deliberately conflicting task IDs, timestamps, names, and
priorities. Extend `scripts/scroll-interactions.cjs` with a long parent/child list and record
`#main.scrollTop` plus a visible row's viewport offset. Capture the reported native defect before
changing drag code; distinguish native window movement from internal viewport movement. Record
OS, display scale, start/drop positions, active view, and whether edge scrolling occurred.

### 2. Source-order desktop snapshots and No sorting

Remove the timestamp sort from `store::for_ui`; preserve its existing open/history/root-child
filtering and return `List::tasks()` iteration order. Only desktop `list`/reply consume this
function; leave `for_agents` urgency ordering unchanged. Existing explicit UI sorting continues
because `orderedTasks` already copies and sorts the returned data.

Add `none: 'No sorting'` to `orderLabels` and saved-layout validation. `orderedTasks(items)`
returns a copy unchanged when `orderBy === 'none'`. Hide `#order-direction` instead of merely
disabling it in this mode; avoid the current direction tooltip's mistaken No grouping wording.
Preserve grouping behavior. For a selected list's separate Completed appendix, use source order
when No sorting is selected; retain its existing newest-completion order for other modes. Desk
entries and `childrenOf` keep their independent schedule/sibling order.

### 3. Centralized expansion with draft safety

Replace arbitrary multi-row Set mutation with `expandedBranch = {rootId, childId}` and a serialized
`requestExpansion` transition. Root means the visible outer row: a child rendered on My Desk is
its own root. Retain sticky-note root rendering as a separate permanent-open rule.

Capture the requested target identity, finish active task-text editing once, await success, then
re-resolve the target against current tasks/DOM before changing expansion. Coalesce/sequence rapid
requests to the most recent target; do not let a blur-triggered save race a second save. Save
failure keeps the current row/draft open. Opening a new subtask entry opens the required parent
through the same helper. Scope cleanup to row/list transitions, not every render. Refresh removes
invalid identities while retaining valid same-view expansion. View/list changes clear expansion
only after successful edit resolution. Question draft handling in spec 004 is a separate map and
must never be registered as a save-on-collapse text editor.

### 4. Readable details and persistent row controls

Set `.details-pad` top/bottom separation to 10px/16px (subtask overrides at least 8px/14px);
retain the existing title-aligned left inset. Apply a `max-width:70ch; width:100%` reading wrapper
to the description/editor, not the whole subtask list. Start with 13px type and 1.6 line-height;
verify 200% enlarged text and long tokens. Preserve blank paragraphs via pre-wrap. Remove only
`.mode-chip` from the hover-hidden selector; keep its accessible selected-state semantics.

Render `.desk-membership` within `.row-status` when `task.mydesk && !task.done_at`, outside My Desk
and outside sticky notes. Reuse the lamp path, give the noninteractive span role `img` and
`aria-label='On My Desk'`, and omit a redundant hover tooltip. Reserve a dedicated right-side slot
so the hover-revealed more button cannot cover it. Do not inspect proposal-preferred desk entries
for membership. A completed parent row can contain an independently visible child; each row uses
its own status only.

### 5. Stabilize the complete drag lifecycle

Use one cleanup pattern for both drag types: idempotent finalization, pointer identity check,
`lostpointercapture`/pointercancel/Escape/blur handling, listener removal, preview removal, and
post-drag click suppression. Mark the session finalized before releasing pointer capture so its
lost-capture event cannot double-finalize. Keep the current 5px drag threshold.

Capture the viewport anchor at activation and update its baseline during intentional edge
scrolling. Before a post-drag render, preserve the anchor task plus its offset; if it disappears,
use the nearest surviving visible neighbor, then clamp to scroll limits. Restore keyboard focus
with `preventScroll:true`; do not call expansion `scrollIntoView` as a consequence of dragging.
Limit restoration to mutations/rerenders, not pointer moves. Explicitly manage scroll anchoring
for this operation rather than relying simultaneously on browser anchoring and manual restoration.

Store the source context, initial sibling order or desk item, and destination identity in the
session. Fresh snapshots can be retained while render is suppressed; cancel the gesture if its
source/destination or relevant sibling set changes. At drop, revalidate IDs against the latest
snapshot and send optional preconditions described in the contract. Under `store::change`, reject
stale sibling/source/membership preconditions without writing. Backend guards cover the final
race between UI revalidation and mutation. Existing non-drag callers remain compatible because
new preconditions are optional.

Investigate native drag-region propagation only after reproducing native movement. Keep native
start-dragging permission for the actual titlebar. If a task region reaches a native drag handler,
fix the boundary/event target rather than disabling all native window movement. No speculative
Tauri upgrade is part of this plan.

### 6. Clear time and tooltip cleanup

Replace the X-only clear button with a visible Clear time action beneath the dial, separated from
any dismiss control. Keep dismissal behavior and Escape precedence. Use an explicit pending clear
value `{start:null,duration:null}` while keeping the last successfully saved range visible during
its request. On success show No time and focus the start handle without scrolling; keep the picker
open. On failure keep the saved range, show error/Retry, and retain the pending clear intent for
retry. Guard completion with the existing picker generation and proposal ID checks so a response
cannot update a newly opened task's picker.

Audit explicit `title` attributes and dynamically assigned values. Remove redundant task titles,
row instructions, labeled-action repeats, and dates on the more button. Keep concise explanations
for unfamiliar icon actions. Put full timestamp information on timestamp elements, with a
keyboard-accessible explanation or accessible full-date label; do not add a tab stop for every
ordinary static label. Retain truncated-text disclosure only when actual clipping occurs. Preserve
all `aria-label`, selected/expanded state, and keyboard handlers.

## Requirement-to-Validation Map

| Requirements | Implementation area | Validation |
| --- | --- | --- |
| FR-001–003 | `for_ui`, layouts, `orderedTasks`, Completed appendix | Rust fixture source order; grouped/ungrouped/restart UI checks; unchanged bytes; desk/sibling controls |
| FR-004–005 | centralized expansion and edit transition | alternating roots/children, rapid clicks, save failure, view switch, sticky notes, future question drafts |
| FR-006–007 | reading wrapper and CSS | 360/1200px, 200% text, due metadata, paragraphs, long tokens, display/editor alignment |
| FR-008–009 | drag sessions, viewport restore, optional mutation guards | pointer cancel/lost capture/blur, no-op drop, concurrent refresh, failed write, edge-scroll exceptions; native OS runs |
| FR-010 | mode-chip visibility | fine/coarse pointer and keyboard, mode persistence and unchanged ordering |
| FR-011–013 | row membership lamp | accepted/pending-only/removed/expired/completed/child-only, sidebar sizes and hover overlap |
| FR-014–016 | picker clear state and label | success, failure/retry, stale proposal, current-task change, Escape/outside dismiss |
| FR-017–018 | targeted tooltip/accessible-name audit | pointer sweep plus keyboard/screen-reader names, reduced motion |

## Cross-Feature Integration

Spec 002 may add fields to desktop task snapshots; their ordering contract remains source order.
Spec 003 adds proposal/planning UI but must not redefine lamp membership. Spec 004 mounts question
cards inside details and owns unsent question drafts separately. Integrate shared `row()` and
`render()` changes serially; all plans must use the same expansion entry point and avoid independent
scroll restorers. See [data-model.md](data-model.md) and [contracts/interactions.md](contracts/interactions.md).

## Release and Validation Gates

Run focused storage/UI checks after implementing the corresponding slice, then the full UI smoke
suite once after integration. Native drag stability must be measured in 20 representative drags
per supported OS; browser tests cannot close that gate. Record unavailable Windows hardware as
unverified rather than reporting a complete cross-platform drag fix. See [quickstart.md](quickstart.md).
All planning decisions are resolved; actual native defect cause and release measurements are
implementation validation work. No application tests were run during this planning pass.

## Added scope: details link chips

Implement `ui/details-links.js`: parse named Markdown links and plain URLs without HTML injection, deduplicate by destination, preserve details source, show compact wrapping buttons, and use a 650ms hover/focus URL tooltip. Activation uses `open_detail_link` with the same native protocol allowlist as existing task links. Add parser/keyboard/tooltip/propagation coverage in `scripts/usability-interactions.cjs`.

Review refinement: desk lamps appear with row hover/focus like the details control. They share the timestamp area without adding idle spacing or changing row dimensions. They remain absent in My Desk and sticky notes.

### Review amendment: manual ordering

No sorting now accepts root-task reordering. Add optional Task.manual_order persisted as @order, stable-sort desktop snapshots by it with source order as fallback, and expose guarded reorder_tasks. Capture the complete desktop root ID sequence at drag start; under the file lock reject changed sequences or incomplete/duplicate root sets. Apply only order attributes, preserving list sections and children. Keep sidebar moves/timeline drops and explicit sorting behavior. Add round-trip, stale-set, cancellation, failed-save and pointer-order regressions.
