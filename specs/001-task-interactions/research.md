# Research: Predictable Task Interactions

Baseline: TinyTasks v0.3.6, commit `8bf6ba2e9c6f76ad6c89e90968b68eb99611672f`. Research
is based on repository source and existing fixtures. No new external library or API is required.

## Source order needs a backend change

**Evidence**: `src/store.rs::List::tasks` iterates stored blocks, but `for_ui` sorts by completed
state and reverse timestamps. Its callers are desktop `list` and reply. `ui/app.js::orderedTasks`
always sorts again; the named-list Completed appendix has a separate completion-date sort.

**Decision**: Return filtered desktop snapshots in source order; implement No sorting as a copy
without comparator in the UI. The appendix uses the same no-sort exception. Do not change MCP's
`for_agents` ordering or history scope.

**Rationale**: File order already exists, remains stable when fields change, and needs no migration.
Existing explicit UI sorts preserve their behavior.

**Alternatives considered**: A `file_order` property on every Task duplicates an ephemeral index
and touches constructors/serialization. Sorting by IDs does not represent file order. Only removing
the UI comparator would preserve the backend's timestamp order and fail the requirement.

## Expansion must be one coordinated transition

**Evidence**: `expanded` is currently a Set; row clicks, blank details clicks, and new-subtask entry
mutate it independently. `finishEditing` and blur save can race with a new transition; refresh
replaces tasks while render is suppressed during editing.

**Decision**: One root/child expansion state with a serialized async transition, re-resolved after
save. Sticky-note roots remain permanently visible. Separate question drafts from task-text edits.

**Rationale**: Makes the one-branch invariant explicit while keeping children reachable and failed
drafts visible.

**Alternatives considered**: Clearing the Set on every click loses parents and failed drafts.
Clearing it on every refresh unexpectedly closes valid same-view work. Keeping multiple entries
and pruning afterward leaves transient invalid UI and duplicated logic.

## Native drag and viewport scroll are different failures

**Evidence**: Both drag handlers use pointer capture and explicit edge scrolling. Render is
suppressed during drag but snapshots can change. Subtask keyboard reorder calls `.focus()` without
preventScroll. Some cancellation paths rerender. Native dragging is enabled for the compact header,
and the window configuration already has `dragDropEnabled:false`.

**Decision**: Reproduce both metrics before changing native boundaries. Centralize drag finalization,
handle lost capture, restore viewport anchors around rerenders, and add optional backend mutation
preconditions to close stale-drop races.

**Rationale**: A stable `scrollTop` alone does not prove a stable native window or stable visual
anchor. Current exact-ID reorder validation catches added/missing children but not an intervening
reorder of the same children; `expected_ids` addresses that case under the write lock.

**Alternatives considered**: Blanket `preventDefault` on pointerdown can break clicks/editing.
Disabling titlebar dragging sacrifices intended behavior. A dependency update without a reproduced
cause is not justified. CSS anchoring alone cannot handle removed anchors or focus scrolling.

**Validation boundary**: No native reproduction was performed during planning. This is a concrete
implementation experiment and release gate, not an unresolved product decision.

## Details and persistent affordances fit current markup

**Evidence**: Details have zero top padding, 8px bottom padding, 1.45 line-height; mode-chip is in a
hover-hidden CSS selector; the more button is absolutely positioned over the row status area.

**Decision**: Add a bounded description/editor wrapper while leaving subtask width unconstrained.
Keep mode-chip visible; reserve a dedicated lamp slot independent from the more-button overlay.

**Rationale**: Improves reading and discoverability without changing compact row behavior globally.

**Alternatives considered**: Capping the whole details area would unnecessarily compress subtasks.
Making the lamp a button introduces an unrequested duplicate action and extra tab stop.

## Lamp membership is accepted state

**Evidence**: Task `mydesk` reflects current-day membership; `DeskController.entries` prefers pending
proposal items, which are not accepted membership. Completed tasks can retain underlying desk data
but should not display an active lamp.

**Decision**: A row displays the lamp only for `mydesk && done_at == null`, outside desk and notes.
Rollover refresh clears expired membership. Children evaluate their own flags.

**Alternatives considered**: Reading proposal entries would falsely mark unaccepted additions and
hide accepted items proposed for removal. Inheriting parent flags would misrepresent selected children.

## Clear time requires failure recovery, not only a new label

**Evidence**: `.desk-arc-clear` uses an X. Its handler optimistically sets `scheduled=false` before
`commit`; commit errors show a retry but leave the optimistic value displayed. `DeskController`
already checks proposal/day and tracks the saved baseline.

**Decision**: Give clear its own pending operation and preserve the saved range until successful.
Use existing generation guards and retain an explicit retry intent on failure. Keep the picker open.

**Alternatives considered**: A label-only replacement fixes ambiguity but fails the required failed-
write behavior. Closing immediately obscures whether the save succeeded. Undoing desk membership
would conflate schedule clearing with removing the task.

## Tooltip removal must retain accessible information

**Evidence**: More-button titles include timestamps and editing fields repeat instructions. Useful
full dates already exist but are coupled to some unrelated targets.

**Decision**: Remove redundant titles selectively, keep accessible names, and localize full-date or
truncation disclosures to their actual content. Long dial instructions can be accessible help text
rather than a tooltip on every pointer movement.

**Alternatives considered**: Removing every title indiscriminately loses useful metadata; adding
custom popovers to all controls recreates the noise and increases focus complexity.
