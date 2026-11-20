# Validation Guide: Predictable Task Interactions

This is the implementation validation procedure. The planned behavior has not been implemented
or application-tested during the planning phase. Documentation/contract review is a separate check.

## Prerequisites

Use the repository's existing Rust/Tauri prerequisites and lockfile. For UI checks, supply an
existing Playwright installation via `PLAYWRIGHT_MODULE` and, if necessary,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`; do not update runtime dependencies just to execute this plan.
Tests must use fictional data, not the user's installed task folder.

## Storage and command validation

After implementation:

```sh
cargo test --offline
cargo build --offline
python3 scripts/mcp-smoke.py
```

Expected additions to Rust tests: source-order snapshots with mixed IDs/timestamps, preserved
history filtering, duplicate-group sections, no data rewrite for presentation, exact
`expected_ids` conflict handling, moved/completed/deleted task guards, disappeared destinations,
and accepted/proposal schedule guard failures. Existing MCP smoke proves unchanged agent tools
continue working; optional desktop guards need Rust command/store coverage separately.

## Rendered UI validation

Extend the existing fixtures and run focused suites:

```sh
LIST_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
SCROLL_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
DESK_INTERACTIONS_ONLY=1 node scripts/ui-smoke.cjs
```

Run the full `node scripts/ui-smoke.cjs` once after all interaction slices are integrated.
Do not claim a pass until expected new assertions exist and the commands succeed.

| Fixture/action | Expected outcome |
| --- | --- |
| Saved IDs 9, 2, 7 with conflicting names/priorities/timestamps; select No sorting in All, a named list and Completed | Source-relative order, hidden direction control, grouping retained, restart persistence; selected-list Completed appendix follows source order in this mode |
| Open 20 alternating parents/children; save error and rapid repeated click | One root/optional child only; failed text draft retained; no duplicate save; sticky-note root remains open |
| Open details, enter editor, narrow/wide, 200% text, long URL, blank paragraphs | Shared left/width alignment, specified spacing, no clipping or horizontal overflow |
| Parent with ordered children; pointer leaves header | Mode chip stays visible; toggling does not change saved order or completion |
| Accepted/pending-only/child-only/removed/completed/expired desk selections | Only eligible ordinary-list rows show a persistent lamp, absent in My Desk/notes and not covered by hover actions |
| Clear scheduled time; fail save; retry; close picker or open another task before response | Saved range retained until successful clear; error and retry truthful; no stale-picker update; membership retained |
| Escape during dial drag vs idle picker; outside dismissal | First cancels adjustment, otherwise closes; neither dismissal issues clear |
| Hover sweep plus keyboard/screen-reader names | No repeated labels/row-sized tips; useful timestamp information stays accessible; controls retain names |

Record focused screenshots under `artifacts/` at 360px and 1200px, with both appearance modes and
at least one reduced-motion pass. Use the existing motion-capture opt-in only if expansion
animation changes; avoid regenerating all release screenshots for a local style adjustment.

## Drag regression matrix

Populate a long list with several expanded subtask families and scroll to the middle. Test:

- Subtask reordering up/down, no-op drop, and keyboard Alt+Arrow reordering.
- Top-level movement between named lists, including moving out of the current selected list.
- Desk task and independently selected subtask dragged onto the timeline.
- Escape, blur, pointercancel, and lost capture both before and after threshold activation.
- External snapshot changes during drag; server-side source/order changes after UI validation.
- Save failure, stale proposal, source deletion, destination removal, and a cancelled drag followed
  immediately by a new one.
- Edge scrolling separately from same-viewport dragging; stop edge scrolling on termination.

Record both `scrollTop` and a surviving visible task's viewport offset; a stable numeric scrollTop
alone can still produce a jump after content changes. Same-viewport anchor difference must be at
most 2 logical px, apart from documented content-removal clamping. Ensure finalization cleans all
listeners, pointer capture, previews, and drag classes without a follow-on click action.

## Native macOS and Windows gate

Use a separate OS login/session or stop the installed TinyTasks instance before launching the
isolated test build; single-instance routing must not send tests to the user's real app. Prepare
an independent temporary task file/settings folder and launch with `TINYTASKS_FILE` and
`TINYTASKS_DATA_DIR` pointing to those exact paths. Confirm the displayed folder before any edit.
The existing `scripts/mcp-smoke.py` demonstrates temporary-file setup for protocol tests; native
fixtures must independently confirm their process and data isolation.

On each supported OS, run at least 20 representative drags covering the matrix. Record start/end
native window x/y/width/height using a native window inspector or OS automation tool, and normalize
physical pixels by the display scale factor. Log the content anchor separately. Pass criteria:
window bounds vary by at most 1 logical px; viewport criteria above hold; titlebar dragging still
works intentionally. Include capture of the before-fix reproduction and after-fix result.

If movement reproduces only in a native surface, inspect native drag-region boundaries and event
handling there. Do not infer the cause from a browser mock or resolve it by disabling titlebar
movement. If Windows or a reproducing configuration is unavailable, report that platform as
unverified and keep the native drag gate open; the other independently verified slices can still
be reviewed on their own merits.

## Completion evidence

The implementation report should list command outcomes, fixture screenshots, OS/display-scale
measurements, and any unverified platform. Link changes to FR-001–018 using the mapping in
[plan.md](plan.md). Do not mark this plan complete merely because a document check succeeds.
