# Feature Specification: My Desk Guidance and Planning Status

**Feature Branch**: `codex/usability-agent-specs`

**Created**: 2026-11-20

**Status**: Implementation plan complete; ready for task generation

**Input**: User requests Joyride-like guidance for My Desk and a Building or Working affordance in My Desk and in the sidebar position that currently shows Review while an agent prepares the day's plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know when my day is being planned (Priority: P1)

I can distinguish an agent actively preparing today's arrangement from a finished suggestion awaiting review.

**Why this priority**: Current silence leaves the user unable to tell whether planning is underway.

**Independent Test**: Start a planning session, report progress, deliver a suggestion, accept/decline it, and repeat with an explicit failure and a missing agent.

**Acceptance Scenarios**:

1. **Given** an agent explicitly begins planning for the current local day, **When** TinyTasks receives that signal, **Then** the sidebar's desk status shows Building… and the desk header states which agent is building the day.
2. **Given** planning is active, **When** I browse or edit my accepted desk, **Then** it stays usable and no proposed schedule is accepted automatically.
3. **Given** a current planning session submits a valid suggestion, **When** it is saved, **Then** Building… ends, the sidebar shows Review, and the desk offers the existing whole-plan Accept / Decline flow.
4. **Given** an agent reads tasks or connects without explicitly beginning planning, **When** the app refreshes, **Then** it does not show Building….
5. **Given** an older agent directly submits a suggestion, **When** it is saved, **Then** Review still appears even though no prior Building… state existed.

### User Story 2 - Recognize interrupted or superseded work (Priority: P1)

A stalled agent does not leave my desk looking busy forever, and an old run cannot replace a newer plan.

**Why this priority**: A working indicator is only useful when it remains truthful after failures.

**Independent Test**: Start overlapping planning runs, stop updates, cross midnight, restart the app, and submit a late result from an obsolete run.

**Acceptance Scenarios**:

1. **Given** active planning has not reported progress for five minutes, **When** its activity expires, **Then** Building… becomes Planning interrupted within the next 30 seconds; the accepted desk remains intact.
2. **Given** the agent explicitly reports failure, **When** the app receives it, **Then** working status stops and a short failure message identifies that planning did not finish.
3. **Given** a newer planning run replaces an older one, **When** the older run sends progress or its result, **Then** it cannot revive the old status or overwrite the newer suggestion.
4. **Given** the local day changes, **When** the desk resets, **Then** yesterday's activity and proposals cannot appear as today's active work or be submitted as today's result.
5. **Given** a reviewable suggestion already exists while another run begins, **When** I inspect the desk, **Then** the existing suggestion remains reviewable with Review retained in the sidebar, while the desk header separately shows the new work; only a valid replacement supersedes it.
6. **Given** the app restarts during a session, **When** state reloads, **Then** current unexpired activity can be shown, while expired activity appears interrupted rather than indefinitely building.

### User Story 3 - Understand TinyTasks basics (Priority: P2)

Open a separate, simple reference window from the view menu. It explains My Desk, desk times
versus due dates, what to ask an agent, lists/subtasks and creating lists, and task-row controls.

**Independent Test**: Open TinyTasks basics from any ordinary view. The task window does not
shift or change. Read four short sections and close with Done, Escape, or the native close button.
No multi-step tour, targets, inline invitation, help row, or automatic popup is shown.

### Edge Cases

- Planning status is for preparing My Desk, not all work an agent may be doing.
- Two clients may plan simultaneously; the active run identity determines which new result may replace the current suggestion.
- A display name is not a routing identity; two clients named Codex must not share run ownership accidentally.
- A suggestion rejected as invalid does not transition to Review; the agent can retry while its session is current or report failure.
- Accepting the existing proposal while another run is active does not implicitly accept its later result.
- If a legacy unassociated proposal arrives, it supersedes the pending proposal using existing behavior and invalidates active run ownership so a stale run cannot overwrite it afterward.
- Quiet interruption messages can be dismissed; dismissal does not cancel an agent or claim that it has stopped computing.
- Basics opens only on request and never automatically reopens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Planning status MUST begin only from an explicit agent report scoped to the current local desk day and one identifiable planning run (US1).
- **FR-002**: With no pending proposal, the sidebar MUST show Building… in the current Review/count position during active planning; the desk MUST show an agent-attributed working message even when the sidebar is hidden (US1).
- **FR-003**: A valid submitted suggestion MUST end its planning state and expose the existing Review and Accept / Decline workflow; the user retains sole acceptance authority (US1).
- **FR-004**: Accepted tasks and schedule MUST remain usable during planning; reading data or connecting alone MUST NOT cause a working indication (US1).
- **FR-005**: Active planning MUST expire after five minutes without a successful progress report, display interruption within 30 additional seconds, and also end on explicit failure or supersession (US2).
- **FR-006**: Older or previous-day runs MUST NOT change newer planning state or submit a stale replacement; app restart MUST preserve the distinction between current and expired activity (US2).
- **FR-007**: A pending reviewable suggestion MUST stay accessible while a replacement is built. Review takes sidebar precedence, and separate desk text reports replacement activity (US2).
- **FR-008**: Agents that submit suggestions without planning-status support MUST continue to work; an unassociated legacy submission supersedes active run ownership, preventing that run's later result from replacing it (US1–US2).
- **FR-009**: The view menu MUST offer TinyTasks basics in a separate native window (US3).
- **FR-010**: Basics MUST explain My Desk and its daily reset, desk timing versus deadlines, agent requests, lists and list creation, and task-row actions (US3).
- **FR-011**: Basics MUST be a short static reference, without tour steps, highlighted targets, inline banners, or automatically opening windows (US3).
- **FR-012**: Opening/closing Basics MUST NOT move task content or mutate tasks, desk state, or answers (US3).
- **FR-013**: Basics MUST support native dismissal, Done, Escape, keyboard access, narrow windows, and existing themes (US3).

### Key Entities

- **Planning run**: Identity, owning agent/client, desk day, activity timestamps, current status, and optional failure explanation.
- **Suggestion**: Existing reviewable arrangement, optionally associated with the run that produced it.
- **Walkthrough preference**: Local dismissal/completion state and current transient step.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A successfully received local planning signal becomes visible within two seconds under normal local operation, both with and without the sidebar (FR-001–004).
- **SC-002**: Zero expired, superseded, or previous-day runs can overwrite a newer run's result in the lifecycle scenarios; interrupted runs stop appearing active within five minutes and 30 seconds after their last progress report (FR-005–008).
- **SC-003**: Every tested pending proposal remains reviewable during replacement planning, and accepted arrangements change only through permitted user actions (FR-003–008).
- **SC-004**: Four concise concept sections explain desk purpose/times, agents, lists, and task-row controls in a separate window; content is readable using keyboard and scrolling at narrow widths (FR-009–011).
- **SC-005**: Opening, reading, closing, and reopening Basics create zero task/schedule mutations and zero task-canvas layout movement (FR-010–012).
- **SC-006**: Planning status and Basics remain understandable without motion or color cues (FR-013).

## Assumptions

- Five-minute expiry is a proposed operational default, not a claim that an agent has stopped working; agents doing longer work must report progress.
- Basics is a static native reference window using the existing app theme.
- This feature does not launch agents, cancel their execution, or automatically request a new plan.
- Proposal review semantics and daily desk expiry already exist and must be preserved.
- Same-machine refresh timing is measurable; cloud synchronization delays between computers are outside the two-second visibility target.

User review refinement (2026-11-20) supersedes earlier onboarding invitation, replay preference, and tour-step requirements. No guide UI occupies the task canvas.
