# Feature Specification: Predictable Task Interactions

**Feature Branch**: `codex/usability-agent-specs`

**Created**: 2026-11-20

**Status**: Implementation plan complete; ready for task generation

**Input**: User feedback: disable sorting; more breathing room for details; one details row open at a time; remove unnecessary tooltips; fix window jumps during subtask and task dragging; always show the ordered/checklist toggle; show a right-side lamp for tasks on My Desk only in other views; distinguish Clear time from closing the picker.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn sorting off (Priority: P1)

I can read tasks in their saved order without an automatic sort rearranging them.

**Why this priority**: This is a missing control over the everyday task list.

**Independent Test**: Use tasks whose saved order differs from their names, dates, priorities, and identifiers; select No sorting and compare the visible sequence with the saved sequence.

**Acceptance Scenarios**:

1. **Given** an ungrouped list sorted by priority, **When** I choose No sorting, **Then** visible tasks follow their saved sequence and the direction control disappears.
2. **Given** grouping is enabled, **When** I choose No sorting, **Then** grouping and group order remain selected while each group's tasks follow their relative saved sequence.
3. **Given** No sorting is saved for a view, **When** I refresh, restart, or an agent changes a task's title, due date, or priority, **Then** the preference persists and those property changes do not reorder that task.
4. **Given** scheduled My Desk tasks and ordered subtasks, **When** I change ordinary-list sorting, **Then** desk chronology and sibling order remain intact.

### User Story 2 - Read one task at a time (Priority: P1)

Opening another task replaces the previous expanded details, keeping the list easy to scan.

**Why this priority**: Multiple persistent expanded rows disrupt the user's reading flow.

**Independent Test**: Open two parent rows, then two child rows, switch views, and repeat with an unsaved details edit and a simulated save failure.

**Acceptance Scenarios**:

1. **Given** one parent is expanded, **When** I open a different parent, **Then** the first parent and its expanded children collapse.
2. **Given** a parent's subtasks are visible, **When** I expand a child, **Then** the parent stays open and at most one sibling child has expanded details.
3. **Given** I am editing details, **When** I open another row, **Then** the edit saves first; if saving fails, the draft and original expansion remain visible with an error.
4. **Given** an expanded row, **When** I switch list or view and later return, **Then** rows start collapsed; a refresh within the same view preserves the active row if it still exists.
5. **Given** a sticky note, **When** I open other tasks in the main window, **Then** its root content remains available.

### User Story 3 - Read comfortable details (Priority: P1)

Task descriptions have sufficient whitespace and readable line lengths at narrow and wide sizes.

**Why this priority**: The provided screenshot shows dense long-form details.

**Independent Test**: Inspect a three-paragraph description, blank lines, and a long unbroken URL in a narrow window and a wide window, before and during editing.

**Acceptance Scenarios**:

1. **Given** an expanded task with a due date, **When** I read its details, **Then** there is visible separation above and below the description and its left edge aligns with the title.
2. **Given** a wide task pane, **When** a long description is shown, **Then** it uses a bounded reading column instead of stretching across the entire pane.
3. **Given** a narrow pane or enlarged text, **When** details or their editor are visible, **Then** text wraps without horizontal overflow, clipping, or a sudden width change on entering edit mode.

### User Story 4 - Drag without jumps (Priority: P1)

I can reorder subtasks and move or schedule tasks without the window or viewport unexpectedly jumping.

**Why this priority**: A reported interaction defect makes direct manipulation unreliable.

**Independent Test**: From the middle of a scrolled list, drag a child upward and downward, move a task to another list, and drag a desk task onto the timeline. Record native window bounds and the scroll anchor on macOS and Windows.

**Acceptance Scenarios**:

1. **Given** a scrolled subtask list, **When** I drag and drop a child within the same visible viewport, **Then** native window bounds remain fixed, the intended sibling order persists, and the viewport does not reset to the top or jump to another task.
2. **Given** a task in a list or My Desk, **When** I drag it to a supported destination, **Then** only the intended move or scheduling change occurs; the window does not move or resize.
3. **Given** an active drag, **When** I press Escape, lose pointer capture, or the window loses focus, **Then** dragging ends without an unintended write, row toggle, or stranded drag preview.
4. **Given** an external update arrives during a drag, **When** it affects the dragged task or destination, **Then** the interaction either finishes against a valid destination or cancels explicitly without overwriting unrelated changes.

### User Story 5 - Keep subtask mode discoverable (Priority: P2)

The ordered/checklist toggle remains visible whenever the subtask section is visible.

**Why this priority**: The user should not have to discover this control by hovering.

**Independent Test**: Expand a task with children, move the pointer away, and operate the toggle with keyboard and pointer.

**Acceptance Scenarios**:

1. **Given** visible subtasks, **When** neither pointer nor keyboard focus is on their header, **Then** the 1 / • control remains visible and its selected mode is discernible.
2. **Given** children in a saved order, **When** I switch between ordered steps and checklist, **Then** only their presentation changes; order and completion remain unchanged.

### User Story 6 - Recognize tasks already on My Desk (Priority: P2)

A small lamp at the right of a task row tells me it belongs to today's desk while browsing other lists.

**Why this priority**: This provides the requested high-level view of today's selection.

**Independent Test**: Add and remove a task and an individual child from My Desk, inspect All, Today, Upcoming, and a named list, then check a pending proposal and overnight rollover.

**Acceptance Scenarios**:

1. **Given** an open task is on the accepted current-day desk, **When** it appears outside My Desk, **Then** a right-side lamp stays visible without hover and is announced as On My Desk to assistive technology.
2. **Given** a task is proposed for addition but not yet accepted, **When** I inspect its ordinary-list row, **Then** it has no lamp solely because it appears in the proposal; an already accepted member retains its lamp if a proposal would remove it.
3. **Given** I am inside My Desk, **When** I inspect task rows, **Then** the redundant row lamp is absent.
4. **Given** only a child is on My Desk, **When** I expand its parent elsewhere, **Then** the child has a lamp and the parent and siblings do not inherit one.
5. **Given** a task leaves the desk, completes, or its desk day expires, **When** the view refreshes, **Then** its lamp disappears.

### User Story 7 - Clear a time deliberately (Priority: P1)

I can distinguish removing a schedule from dismissing its time picker.

**Why this priority**: The current cross-shaped Clear time control looks like a close control.

**Independent Test**: Clear a timed task, dismiss a different timed task without clearing, and repeat within a pending suggestion and with a save failure.

**Acceptance Scenarios**:

1. **Given** a timed task's picker is open, **When** I choose the visible text action Clear time, **Then** its start and duration clear, it remains on the desk, and the picker stays open in an unscheduled state.
2. **Given** the picker is open without an active drag, **When** I press Escape, click outside, or use a separate dismiss control if present, **Then** it closes without clearing the saved time. Escape during an active adjustment cancels that adjustment first.
3. **Given** I am editing a proposal, **When** I clear time, **Then** only the proposal changes until acceptance; the accepted arrangement is preserved.
4. **Given** clearing fails to save, **When** the error appears, **Then** the prior time remains and the user can retry.

### User Story 8 - Reduce tooltip noise (Priority: P2)

Hovering ordinary rows and self-explanatory controls does not cover the content with redundant labels.

**Why this priority**: This removes distraction without hiding useful guidance.

**Independent Test**: Sweep the pointer over rows, text, labeled menu actions, and icons, then verify keyboard and screen-reader names.

**Acceptance Scenarios**:

1. **Given** a task row or a control already labeled in text, **When** I hover it, **Then** no tooltip merely repeats the title or label.
2. **Given** an unfamiliar icon-only action, **When** I need its meaning, **Then** concise guidance remains available, with an accessible name even when no tooltip is displayed.
3. **Given** a relative timestamp or truncated title, **When** I hover or focus its relevant target, **Then** useful full-date or full-text information remains available without attaching it to the entire row or unrelated menu button.

### User Story 9 - Open named links in details (Priority: P1)

Details containing one or more links show clickable chips. A chip displays its optional name;
otherwise a readable host label is used. Hover or keyboard focus reveals the full URL after a
short delay. Clicking opens the link directly without a context menu or collapsing/editing the row.

**Acceptance**: Named `[Scout preview](http://localhost:3000)` and plain HTTPS links produce
separate chips; repeated destinations appear once; the tooltip waits 650ms and disappears on
leave, blur, Escape or scrolling. Unsupported protocols and HTML never execute. Original details
remain editable, including link names and destinations. Chips wrap in narrow task and note views.

### Edge Cases

- A filtered-out or deleted expanded task clears expansion; selection of another row is not forced.
- Group collapse hides an expanded row without opening a different row; changing views clears it.
- Empty details retain an Add details action; long descriptions preserve paragraph breaks.
- A very narrow status area must fit hover lamp, completion count, and actions without covering the title; the lamp appears alongside the other hover actions without changing row dimensions.
- Pending proposals, midnight expiry, manual desk additions, and independently selected children use actual accepted membership.
- Reordering near an edge may use intentional autoscroll, but releasing or canceling must stop it; viewport clamping after content removal is allowed.
- A drag or toggle must not accidentally initiate inline editing or native titlebar dragging.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Ordinary task views MUST offer No sorting independently from grouping, preserving relative saved order among visible tasks (US1).
- **FR-002**: No sorting MUST hide its direction control and persist using the existing per-view preference scope, including Completed; existing sort selections remain unchanged until the user chooses otherwise (US1).
- **FR-003**: Sorting preferences MUST NOT rewrite task data, sibling order, or My Desk chronology (US1).
- **FR-004**: The main view MUST allow one expanded parent branch and at most one expanded child within it; a child shown as a desk root counts as a root row (US2).
- **FR-005**: Switching branches MUST save active task-text edits first, retain failed drafts, clear expansion on view/list changes, and preserve sticky-note root content. Unsent question choices from spec 004 remain drafts and MUST NOT be submitted by collapsing a row (US2).
- **FR-006**: Details MUST use 16 logical pixels of combined row-to-details separation, 16 below, and 16 before the subtask header, line spacing at least 1.55 times the text size, and a reading width capped at approximately 70 characters on wide panes; the editor MUST share the reading column (US3).
- **FR-007**: Descriptions MUST preserve paragraph breaks, wrap long text, and remain usable at 200% text enlargement without horizontal scrolling (US3).
- **FR-008**: Subtask reordering, task movement, and task scheduling MUST preserve native window position and size and the user's viewport anchor, except intentional edge scrolling or necessary clamping after content removal (US4).
- **FR-009**: Drag completion, cancellation, external refresh, and save failure MUST clean up drag state, preserve valid task data, and prevent accidental click actions (US4).
- **FR-010**: The ordered/checklist toggle MUST stay visible whenever its subtask header is visible, expose the selected mode, and preserve child ordering and completion (US5).
- **FR-011**: Each open task or child on the current accepted desk MUST show a right-side lamp on row hover or keyboard focus in ordinary lists; pending-only membership MUST NOT qualify (US6).
- **FR-012**: My Desk and sticky-note windows MUST omit the row lamp; other views MUST remove it when membership expires, ends, or the task completes (US6).
- **FR-013**: The lamp MUST be a status indicator with the accessible meaning On My Desk, not a second desk-membership toggle (US6).
- **FR-014**: The time picker MUST offer a visibly labeled Clear time action, visually separated from dismissal and never represented solely by a cross (US7).
- **FR-015**: Clearing MUST remove both start and duration, retain desk membership, keep the picker open, honor proposal boundaries, and report failures without displaying a false successful clear (US7).
- **FR-016**: Dismissing the picker MUST NOT clear a schedule; Clear time MUST be unavailable when no schedule exists (US7).
- **FR-017**: Tooltips MUST NOT repeat full task titles, visible action labels, or obvious row behavior; useful supplementary information MUST attach to its specific target (US8).
- **FR-018**: All controls MUST retain accessible names and keyboard operation; essential state and actions MUST remain understandable without hover or animation (US2–US8).

- **FR-019**: Details MUST show keyboard-accessible chips for one or multiple supported links, using a provided name or a readable destination label (US9).
- **FR-020**: Chip hover/focus MUST show the full destination only after a short delay; click/keyboard activation opens the supported link directly (US9).
- **FR-021**: Link chips MUST preserve source details, avoid duplicate destinations, wrap on narrow panes, and never initiate row editing, dragging or collapse (US9).

### Key Entities

- **View preference**: Grouping, sorting choice, and direction retained for an existing view scope.
- **Expanded branch**: One visible root and optionally its one expanded child, local to the main window.
- **Desk membership indicator**: A derived current-day status for one task, distinct from a pending suggestion.
- **Schedule**: A task's desk start and optional duration, separate from deadline and completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In fixtures with conflicting title/date/priority order, 100% of visible sequences match saved order with No sorting, before and after refresh/restart (FR-001–003).
- **SC-002**: Opening 20 alternating parent/child rows never leaves more than one expanded branch and loses zero drafts, including failed saves (FR-004–005).
- **SC-003**: Details pass the stated spacing and wrapping criteria at 360px and 1200px window widths and 200% text enlargement (FR-006–007).
- **SC-004**: In 20 drags per supported desktop OS, native bounds vary by no more than one logical pixel; without edge scrolling or content clamping, the viewport anchor varies by no more than two (FR-008–009).
- **SC-005**: All accepted, pending-only, child-only, completed, and expired membership cases show the correct lamp state; mode controls remain visible without hover (FR-010–013).
- **SC-006**: All clear, dismiss, proposal, and failed-save scenarios preserve the specified schedule state; no destructive clear is represented solely as a close icon (FR-014–016).
- **SC-007**: A hover audit finds zero redundant tooltips in the targeted rows and controls, with zero missing accessible control names (FR-017–018).

## Assumptions

- No sorting uses saved manual order when present, otherwise source-file order. Top-level dragging now updates this saved order.
- Named lists continue sharing the existing All-view layout preference; per-list preferences are outside this scope.
- The parent-plus-one-child exception is necessary to reach nested details while honoring one open branch.
- Exact typography can be tuned within the measurable bounds above; this is not a new theme system.
- Task drag jumping is reported as suspected as well as observed for subtasks; its cause must be reproduced during implementation, not assumed from source inspection.
- Existing picker dismissal behavior can remain; adding a new close button is not required.
- Specs 002–004 cover list cleanup, agent hygiene, desk guidance/status, and questions separately.

Review refinement: each newline starts a displayed paragraph with 12px spacing between paragraphs, so users need not insert empty lines. Extra blank lines do not compound spacing. The editor retains the original text. Parent and child details share a combined 16px row-content-to-details gap, accounting for existing row padding (6px details padding for parent rows, 9px for child rows), and 16px below; text-to-subtask spacing is also 16px.

Resize regression: expanded details use intrinsic normal-flow height. Repeated wide/narrow resizing must retain all paragraphs, link chips, questions and subtasks without clipping or overlapping the next task. Stability takes precedence over expand/collapse height animation.

Final row-affordance order: lamp, details scribble, subtask count, relative time, more actions. Lamp/scribble reveal in their fixed slots on hover/focus; count/time do not move or disappear. Inapplicable affordances are omitted. Priority remains a separate preceding badge. This supersedes the interim timestamp-replacement design.

Row layout keeps a fixed container breakpoint, reduced from 620px to 480px per user direction. Below 480px, metadata stays below the title. At/above 480px, the existing inline row layout applies. Do not replace this with an always-adaptive layout.

Narrow-row refinement: below 480px, the title uses all space after the checkbox, with no reserved right-hand actions column. The checkbox aligns with the first title line. All row controls form one right-aligned strip on the same second line as the agent and list, preserving lamp, scribble, subtasks, time, more order. The more button stays in that strip rather than floating beside the title. Hover/focus reveals controls without moving the strip or its persistent values.

Manual-order refinement: with No sorting selected, root tasks can be dragged before or after another task in the same visible group. Persist the result across refresh/restart and sort-mode changes using @order on root task records. Preserve list membership, source attribution, details and child order. Other sort modes and the chronological My Desk view do not accept manual root reordering. Cancel and failed/stale writes retain the saved sequence; drop markers show the exact insertion edge.

Hover-control review amendment (supersedes the earlier compact-property experiment): preserve all display-property values and interactions. ID, agent, list and due-date metadata retain their second line below 480px and their existing inline layout above it. Priority, age and subtask count remain readable values. Only the hover-only lamp and details controls float left beside the dots over the title, without reserving another line or changing title wrapping. Hover and keyboard focus reveal them. With no selected/applicable metadata, the empty second line collapses.
