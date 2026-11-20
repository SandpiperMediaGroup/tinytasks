# Feature Specification: Answer Agent Questions in TinyTasks

**Feature Branch**: `codex/usability-agent-specs`

**Created**: 2026-11-20

**Status**: Implementation plan complete; ready for task generation

**Input**: User requests a teeny optional MCP question feature: agents choose to publish TinyTasks questions, users answer in task details, and agents retrieve responses. No Claude, Codex, OpenCode, or other native hook handling. This scope supersedes the prior connector requirement (2026-11-20).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Answer a question in task details (Priority: P1)

I can read an agent's question with its suggested answers and submit my choice from the associated task.

**Why this priority**: This is the core requested communication flow.

**Independent Test**: Publish a question tied to an existing task, with three described choices and one preselected recommendation; open details, change the choice, and send it. Repeat with free text and cancellation.

**Acceptance Scenarios**:

1. **Given** an agent publishes a structured question for a task, **When** I open its details, **Then** I see the prompt, ordered answer choices and descriptions, and any recommended/default choice.
2. **Given** a choice is preselected, **When** I merely open, close, or leave the details, **Then** no answer is submitted.
3. **Given** I choose an answer or enter a supported custom response, **When** I click Send answer, **Then** that explicit response is saved and the card shows the question as a small label with the answer below it.
4. **Given** the question supports multiple selections, **When** I select within its stated limits and submit, **Then** the complete selected set is saved; invalid selections show a clear validation message before sending.
5. **Given** I do not want to answer, **When** I choose Decline, **Then** the agent can read an explicit declined result, distinct from no response; simply dismissing the details leaves the question pending.
6. **Given** saving fails, **When** I attempt submission, **Then** the draft remains editable with an error and the card does not claim the answer was saved or sent.

### User Story 2 - Deliver the answer to the correct agent conversation (Priority: P1)

My answer becomes available to the requesting agent, and TinyTasks tells me whether it has actually been received.

**Why this priority**: A saved selection has little value unless the agent can consume it reliably.

**Independent Test**: Have two agent conversations ask different questions, answer one, retrieve and acknowledge it from its originating conversation, then repeat after an agent restart.

**Acceptance Scenarios**:

1. **Given** an answer has been saved, **When** the originating agent checks for answers, **Then** it receives the question identity, its revision, the submitted response, and its originating-conversation association.
2. **Given** the agent explicitly acknowledges the current answer, **When** the acknowledgment is saved, **Then** the accessible status changes to Received; merely fetching the question or saving the answer does not show acknowledgment.
3. **Given** the agent is disconnected, **When** I answer and restart TinyTasks, **Then** the response remains available and pending acknowledgment; it is not lost at midnight.
4. **Given** two conversations use the same agent display name, **When** either checks for answers, **Then** results are correlated by the requesting conversation identity rather than the display name alone.
5. **Given** the client has no automatic continuation integration, **When** an answer is saved, **Then** TinyTasks retains the answer for agent polling without claiming to have resumed the conversation.
6. **Given** the agent retrieves or acknowledges the same response more than once, **When** a retry occurs, **Then** TinyTasks returns the same response identity without generating a second answer event.

### User Story 3 - Keep answers consistent across surfaces and updates (Priority: P1)

An agent-published question has one recorded answer and an outdated form cannot overwrite it.

**Why this priority**: The user's same-arrangement request requires a shared question identity, not two unrelated copies.

**Independent Test**: Publish a question, answer in two TinyTasks windows, and verify duplicate/stale submissions do not overwrite the recorded response.

**Acceptance Scenarios**:

1. **Given** an integration publishes the same question to both surfaces, **When** I inspect them, **Then** prompt, choice order, descriptions, recommendation, defaults, and allowed answer form agree.
2. **Given** I answer on one surface, **When** the other refreshes, **Then** it shows the same recorded answer and no longer offers an independent second submission.
3. **Given** a pending question is revised or replaced, **When** an old form submits, **Then** the stale response is rejected and the current question is shown without silently sending the old answer.
4. **Given** two surfaces submit different answers against the same revision at nearly the same time on one computer, **When** they are processed, **Then** only the first valid response is accepted and the second displays the already recorded answer.
5. **Given** a question is withdrawn or its task is deleted/archived, **When** a stale card submits, **Then** the question is unavailable for new answers, and any earlier saved response remains available for acknowledgment/history.
6. **Given** an agent asks through its own native widget, **When** no TinyTasks publication occurs, **Then** TinyTasks does not display or intercept it. Agents must opt in by calling the MCP question tool.

### Edge Cases

- Empty prompts, duplicate choice identities, defaults that do not belong to the choices, or invalid selection limits cannot create answerable questions.
- Free-text-only questions have no required choice; optional custom answers are an explicit alternative to predefined choices.
- Opening a task, checking its completion circle, accepting a desk proposal, and selecting a default are never implicit answers.
- Completing a task leaves its pending question answerable; a question answer does not automatically complete the task. The agent must explicitly withdraw an obsolete question.
- Unanswered questions can survive daily desk expiry; they belong to the task, not its daily placement.
- A task has at most one pending question. Explicit same-source replacement preserves previous history; another source cannot take over.
- No genuine conversation link means no invented link or claimed direct resumption; a stable conversation correlation value may still associate the response.
- Closing the app or disconnecting does not delete a persisted response. Agents retrieve and acknowledge it when they next check; no wake-up or host resumption is implied.
- Cross-computer cloud conflict resolution is not implied by same-computer first-response behavior; conflicts must be surfaced instead of silently replacing a response.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Agents MUST be able to publish a structured question associated with an existing task, preserving source identity, prompt, choice identities/order/descriptions, recommendation/default, and answer constraints (US1).
- **FR-002**: Task details MUST support single choice, multiple choice with explicit minimum/maximum, and free text as requested by the question; optional custom responses MUST be available when allowed (US1).
- **FR-003**: Defaults and recommendations MUST NOT count as submitted consent; only Send answer or explicit Decline records a response (US1).
- **FR-004**: Submission MUST validate the current question, preserve failed drafts, and show accurate saved/failed feedback without marking the task complete (US1).
- **FR-005**: Questions and responses MUST retain stable identities, revision, requesting conversation association, and timestamps sufficient to identify the current answer and reject stale submissions (US2–US3).
- **FR-006**: The requesting agent MUST be able to retrieve pending responses after reconnection and explicitly acknowledge a specific response; repeated retrieval/acknowledgment MUST be safe (US2).
- **FR-007**: A saved answer MUST display only a small question label with the user's answer underneath followed by a muted ‘(your answer)’; omit the source/helper heading, Answer prefix, visible waiting/status sentences, and surrounding card border. Saved/Received remain distinct in durable data and accessible status. Declined/Withdrawn remain explicit outcomes. No em dashes in app-authored question copy (US1–US2).
- **FR-008**: Persisted questions, responses, and acknowledgment status MUST survive app restart and daily desk rollover; unrelated task details and list membership MUST be preserved (US2).
- **FR-009**: An agent's display name alone MUST NOT route a response; source links MUST be genuine and automatic continuation MUST only be claimed for a verified supporting integration (US2).
- **FR-010**: A supported dual-surface integration MUST use a shared question/response identity and revision so both surfaces present the same choices and recorded result (US3).
- **FR-011**: Stale, withdrawn, superseded, and already-answered submissions MUST be rejected with recoverable feedback; only one final response per question revision may be accepted on one computer (US3).
- **FR-012**: Deleting or archiving a task MUST withdraw its unanswered question while retaining earlier response history; completing a task MUST neither answer nor withdraw its question automatically (US3).
- **FR-013**: The feature MUST expose an explicit publish/read/acknowledge path usable without a native agent-widget integration. Unsupported native widgets MUST NOT be advertised as automatically mirrored (US2–US3).
- **FR-014**: Question controls MUST have accessible labels, keyboard operation, visible focus, and usable wrapping in narrow windows; collapsing a row MUST preserve an unsent answer draft during the current app session (US1).


### Key Entities

- **Question**: Stable identity, task association, source conversation, prompt, choices/constraints, default/recommendation, revision, and pending/withdrawn state.
- **Response**: Stable identity, question revision, selected choices or custom text, submitted/declined outcome, and submission timestamp.
- **Receipt**: Explicit acknowledgment of one response by its requesting agent/conversation, with timestamp.
- **Answer draft**: User-selected but unsubmitted input, distinct from a persisted final response.
## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all open, dismiss, selection-only, and default-choice scenarios, zero responses are recorded until an explicit Send answer or Decline action (FR-001–004).
- **SC-002**: Single-choice, multi-choice, custom-text, and declined responses round-trip exactly from user submission to agent retrieval with correct question/conversation association (FR-002, FR-005–006).
- **SC-003**: Restart, disconnect, and midnight scenarios lose zero saved responses; the Received accessible status appears only after explicit acknowledgment of that response (FR-006–009).
- **SC-004**: In 20 duplicate, stale, and conflicting same-computer submissions, each question revision has at most one accepted final response and zero silent overwrites (FR-010–012).
- **SC-005**: The explicit agent workflow demonstrates publish → user answer → agent retrieval → acknowledgment in an integration test. No native host integration or automatic continuation is part of this feature (FR-009–013).
- **SC-006**: All question types can be answered or declined using only a keyboard at 360px and 1200px window widths, and drafts survive switching expanded rows during the session (FR-014).


## Assumptions

- Initial delivery is optional explicit MCP publication, a small details form, response polling,
  and acknowledgment. Agents choose when to use it. No hooks, native question mirroring, session
  binding, native batches, or host resumption are implemented.
- One pending question per task; single choice, multiple choice, or text with optional defaults.
- The agent supplies its source/conversation correlation and uses the same identity to retrieve.
- Reuse existing tasks and lists. Do not create a task/list merely to hold a question automatically.
- The shared storage foundation from 002 provides stable task identities and safe response writes.
