# Contract: Desk Status and Basics

Planning status is derived from the persisted run, current local day, proposal observation and
five-minute lease. The sidebar shows Building, Review, or Interrupted. Review takes precedence
when a proposal exists. The desk header shows a compact live status without a permanent help row.
Status updates do not replace task rows or steal editor focus. Visible main windows refresh every
15 seconds and on task changes/focus; heartbeat timestamps do not force row rendering.

The view menu opens TinyTasks basics through `open_basics`. Reuse/focus an existing basics window;
otherwise create a themed native window with `basics.html`, width 440 and height 600, minimum
320 by 300. `close_basics` accepts only the basics window. Done, Escape, native close and Cmd/Ctrl+W
close it. The page explains desk purpose and times, agent requests, lists/subtasks/list creation,
and task-row actions. It invokes no task/desk/question mutations.

There is no inline invitation/help row, automatic popup, tour step, highlight target, guide
preference, or completion tracking. These replace the originally proposed five-step walkthrough
per user review on 2026-11-20. Opening or closing Basics must not move the main task canvas.
