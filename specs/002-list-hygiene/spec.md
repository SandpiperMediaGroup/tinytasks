# Feature Specification: Empty-List Cleanup and Agent Hygiene

**Feature Branch**: `codex/usability-agent-specs`

**Created**: 2026-11-20

**Status**: Implementation plan complete; ready for task generation

**Input**: User requests a small archive-action action in the sidebar right-click menu that archives empty lists, plus better agent behavior that avoids unnecessary lists. This replaces the earlier proposed bulk cleanup panel.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Erase empty sidebar lists (Priority: P1)

I can right-click the sidebar and archive every named list with no unfinished tasks in one action.

**Why this priority**: Removes existing clutter through the exact lightweight interaction requested.

**Independent Test**: Prepare empty lists, a notes-only list, an open-task list, a completed-only list with old completions, and a list containing a child; run cleanup and compare active and archived content.

**Acceptance Scenarios**:

1. **Given** empty named lists, **When** I right-click blank sidebar space or its Lists & Chats heading, **Then** the menu offers Archive empty lists with a small broom icon.
2. **Given** I right-click an individual list, **When** its context menu opens, **Then** the same global Archive empty lists action appears separately from Archive list so its scope is clear.
3. **Given** eligible empty lists, **When** I choose Archive empty lists, **Then** all eligible named lists are archived immediately and navigation updates quietly without a success banner or layout shift; no selection panel or confirmation dialog intervenes.
4. **Given** a list contains completed tasks older than the normal completed-history window, **When** I run cleanup, **Then** it is archived if all its tasks and subtasks are completed, preserving their history.
5. **Given** there are no eligible lists, **When** I open the menu, **Then** Archive empty lists is disabled; a stale enabled menu invocation silently does nothing without modifying data.
6. **Given** the selected list is archived, **When** cleanup finishes, **Then** All becomes the active view; unrelated list ordering, icons, and selection remain unchanged.

### User Story 2 - Preserve content when cleanup races or fails (Priority: P1)

Cleanup never hides active work or discards the notes in a list that has no tasks.

**Why this priority**: A one-click operation must be safe without requiring a review panel.

**Independent Test**: Add a task after the menu opens, interrupt archive writing, and simulate an unavailable archive folder.

**Acceptance Scenarios**:

1. **Given** an eligible list gains an unfinished task before cleanup executes, **When** eligibility is checked, **Then** that list is skipped and the task remains active.
2. **Given** a task-free list contains notes or unfamiliar metadata, **When** it is archived, **Then** that content is preserved in the archive.
3. **Given** archive writing is interrupted or fails, **When** cleanup reports the result or the app restarts, **Then** every affected section remains recoverable without duplicated archive sections or silent loss; errors report uncompleted moves without a false success notice.

### User Story 3 - Reuse useful lists and existing tasks (Priority: P1)

Agents add human action items to existing homes and retain their source conversation without turning each conversation into a sidebar list.

**Why this priority**: Prevents clutter from immediately returning after cleanup.

**Independent Test**: Ask an agent to add related actions from two conversations to an existing project list, retry the same addition, and add an unrelated one-off action with no suitable named home.

**Acceptance Scenarios**:

1. **Given** an appropriate list already exists, **When** an agent adds an action from a differently titled conversation, **Then** it uses that list and retains the conversation title/link as separate attribution.
2. **Given** no suitable list and no request for a new one, **When** an agent adds a one-off task, **Then** it uses Personal rather than inventing a conversation-named list.
3. **Given** an ongoing project genuinely needs its own list or the user requests one, **When** the agent explicitly creates it with a stated purpose, **Then** it creates one reusable list; a misspelled existing destination does not silently create another.
4. **Given** an action already exists, **When** the agent discovers it, **Then** it updates that action or adds related subtasks instead of creating a duplicate; similar titles alone never authorize merging unrelated tasks.
5. **Given** a client retries an already successful addition after losing its response, **When** it repeats the same logical request identity, **Then** it receives the prior result rather than creating another task or list.
6. **Given** more than 200 tasks or intentionally empty lists, **When** an agent discovers available work and destinations, **Then** it can traverse the complete applicable set and distinguish completion of discovery from a partial result.
7. **Given** an existing task file and an older configured agent, **When** the app is upgraded, **Then** existing task/list associations remain intact and legacy behavior is explicitly documented; old chat metadata is not silently reinterpreted or mass-moved.

### Edge Cases

- Personal is the fallback destination and is not removed by global empty-list cleanup; built-in views never qualify.
- Emptiness means zero unfinished task records, including roots and children; hidden groups and history cutoffs do not establish emptiness.
- Multiple sections with the same list name are treated as one list; an unfinished task in any matching section makes it ineligible.
- Task-free sections with notes are eligible, but archive content must remain intact.
- Whitespace and capitalization differences in requested existing destinations do not create duplicate lists; ambiguous matches return choices instead of guessing.
- Completing all tasks and subtasks makes a list eligible. Cleanup has no age cutoff.
- A stale cleanup menu, an in-progress task draft, or a selected list disappearing must not discard typed text; finish saving first, and stop cleanup if that save fails.
- Archived names may later be reused only through explicit new-list creation; cleanup does not create permanent name bans.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sidebar blank space, the list section heading, and list context menus MUST expose Archive empty lists with a broom icon and a keyboard-accessible equivalent (US1).
- **FR-002**: Cleanup MUST target all named lists with zero unfinished task records in the complete current data, including all duplicate sections, and MUST exclude Personal and built-in views (US1–US2).
- **FR-003**: Eligible sections MUST be archived with all original notes and unknown metadata preserved; completed tasks and their source metadata MUST be preserved; no list containing unfinished work may be archived by this action (US1–US2).
- **FR-004**: Eligibility MUST be rechecked against current data when the action executes; repeated invocations MUST be safe and show accurate counts (US1–US2).
- **FR-005**: Cleanup MUST be one action without a bulk selection panel or confirmation dialog; successful and no-op archives MUST remain silent without adding a banner or shifting layout, while failures MUST report actionable errors and preserve unsaved drafts (US1–US2).
- **FR-006**: Interrupted archive moves MUST remain recoverable without duplicate archival or silent data loss; unaffected lists and their display preferences MUST be preserved (US2).
- **FR-007**: Destination list and originating conversation attribution MUST be independently expressible for new agent writes, while preserving existing associations (US3).
- **FR-008**: Updated agent guidance MUST require checking existing tasks and lists, updating matching actions, using subtasks for related steps, and keeping agent-owned execution work outside TinyTasks (US3).
- **FR-009**: Updated agent writes MUST reuse a valid existing destination or Personal unless creation of a new named list is explicitly requested for a continuing purpose; unknown destination names MUST NOT implicitly create lists in the new contract (US3).
- **FR-010**: Agent discovery MUST support all existing lists, including empty ones, and all matching tasks without silent truncation; partial results MUST indicate how to continue (US3).
- **FR-011**: Retrying a successful creation with the same logical request identity MUST NOT create duplicate tasks or lists; changed input under that identity MUST be rejected rather than silently reused (US3).
- **FR-012**: Compatibility behavior for existing agents and task files MUST be documented; migration MUST preserve task identifiers, parent relationships, source links, notes, and existing list names (US3).
- **FR-013**: Cleanup MUST move an archived active-list selection to All and otherwise preserve navigation; duplicate-task detection MUST NOT automatically merge merely similar titles (US1, US3).

### Key Entities

- **List**: A user-visible destination containing zero or more tasks and optional notes.
- **Conversation attribution**: Originating conversation title and optional genuine link, distinct from list membership.
- **Cleanup result**: Actual archived list identities/count and any error or recoverable interruption.
- **Logical creation identity**: A stable identity for one agent request, enabling safe retry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the complete cleanup fixture, 100% of eligible named lists disappear from active navigation and zero lists containing any tasks are archived (FR-001–004).
- **SC-002**: Users can invoke cleanup with one context-menu action; success and no-op remain quiet, failures remain visible, and all preserve drafts and stable layout (FR-005, FR-013).
- **SC-003**: Interrupted and failed archive scenarios retain 100% of original content with zero duplicated sections after recovery (FR-003, FR-006).
- **SC-004**: Related actions from ten conversations use one existing project list while retaining all ten source attributions; a one-off action creates zero new named lists (FR-007–009).
- **SC-005**: Discovery of a 250-task fixture with empty lists exposes every applicable task and destination; three identical creation retries produce exactly one result (FR-010–011).
- **SC-006**: Legacy fixtures retain all existing list memberships, identifiers, source links, and subtask relationships after upgrade (FR-012).

## Assumptions

- The user's archive-action refinement supersedes a cleanup management panel, automatic age-based archiving, but includes cleanup of lists containing only completed tasks.
- No general archive browser, restore manager, or permanent deletion is added in this feature. Existing archive storage remains available; any future restore UI is separate scope.
- List guidance improves agent behavior but cannot retroactively force unmodified older clients or direct file editors to follow the new contract; compatibility must be explicit.
- Introducing separate attribution does not authorize reorganizing the user's current lists.
- Global agent memories/configuration are not edited by this feature; setup documentation gives users the updated usage instruction.

Final sidebar menu: blank-space/heading context contains New list and Archive empty lists with a broom icon and no empty separators. Named-list context retains Rename, Change icon, Move up/down, Archive list and Delete list. All successful archives remain silent.
