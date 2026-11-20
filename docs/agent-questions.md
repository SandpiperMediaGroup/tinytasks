# Optional agent questions

An agent chooses to publish a TinyTasks question on an existing task. TinyTasks does not intercept
Claude Code, Codex, OpenCode or other host questions, install hooks, or automatically resume a chat.

1. Discover the task with `list_tasks_page`. For a legacy task without a UID, call
   `ensure_task_identity` with its numeric ID and the current snapshot revision.
2. Call `publish_question` with `store_uuid`, `{id,uid}` task_ref, stable `source`
   (`client_id`, `conversation_id`, optional title/URL), a unique request_id, and a question.
3. The user explicitly sends or declines in task details. Preselection, closing a row, and
   completing a task do not submit an answer.
4. Poll `list_question_responses` using the same source and store UUID. After consuming a response,
   call `acknowledge_question_response` with its exact question, revision and response IDs.

Questions support single choice, multiple choice with min/max limits, or text, with optional
custom answers on choice questions. Choice IDs are stable; prompt/options/descriptions retain
agent-authored text. Exact retries reuse their request/submission identity; stale revisions and
changed payloads are rejected. Saved responses and receipts survive restart and desk rollover.

Answered UI is deliberately small: the question label, then the answer and a muted “(your answer)”.
Source identity remains in storage. Saved/Received remain distinct protocol and accessibility
states without visible status sentences. Failed saves retain the draft and show the error.

`get_question` reads state; `withdraw_question` withdraws a pending revision. Removing a task
withdraws its pending question while preserving response history. None of these tools can answer
on behalf of the user; submission is a desktop command only.

See [the contract](../specs/004-agent-questions/contracts/questions.md) for the complete wire format.
For the isolated review app, `python3 scripts/review-agent.py` polls and acknowledges its sample
answers. `--ask-again` publishes a new sample revision. It never touches the user's default store.
