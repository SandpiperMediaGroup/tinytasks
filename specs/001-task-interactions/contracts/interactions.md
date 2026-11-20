# Contracts: Task Interactions

These contracts describe implementation targets, not commands already available in v0.3.6.
All existing command names remain. No new MCP tool is added by this feature.

## Desktop snapshots and sorting

`list`, `edit_task`, `reorder_subtasks`, and other commands returning `Vec<Task>` through the normal
reply path return their existing filtered task set in relative source-file order. `list_note`
retains its note-family semantics; children are rendered in sibling position order.

No sorting is `orderBy:'none'` in `listLayouts`. It copies the input list without a comparator.
Group order is controlled independently. Selected-list Completed appendices also preserve source
order when this setting is selected. Hidden old completions remain hidden; this feature does not
extend history retention. No sorting disables neither the chronological desk nor subtask order.

## Expansion controller

Route every row click, details icon, subtask-count click, keyboard toggle, and new-subtask entry
through a common transition. A successful transition:

1. Resolves/saves only an active task-text edit, once.
2. Validates the latest target ID and parent/visible-root relationship.
3. Replaces the expanded branch and updates `aria-expanded` consistently.
4. Preserves focus without viewport jumps; a deliberate user expansion may scroll minimally into
   view, but post-drag rerender must not trigger that expansion scroll.

If saving fails, retain the editor and old branch. View/list changes clear expansion after save.
Blank details gutter toggles only its own branch, never a nested interactive target. Interactive
question controls consume their own events and preserve unsent input without triggering submission.

## Optional desktop mutation preconditions

JSON uses Tauri's existing camelCase argument naming. Existing Rust argument names remain snake_case.
Every supplied guard is checked inside the same `store::change` lock as the mutation.

### `reorder_subtasks`

Existing input: `{parentId, ids}`. Add optional `expectedIds` containing the ordered full sibling
ID list captured at drag activation. If present, it must exactly equal current children in saved
order, including completed children, before validating/applying `ids`. A concurrent reorder of the
same IDs is stale, not silently overwritten. Keep current exact membership/duplicate validation.

Success: existing fresh `Task[]`. Failure: no write, descriptive stale-order error; UI refreshes
and retains the nearest viewport anchor. Keyboard reordering may also supply the guard.

### `edit_task` for moving a dragged parent

Existing input remains `{id, title?, details?, chat?}`. Add optional `expectedSource`:
`{chat:string, parentId:number|null, doneAt:number|null}`. When supplied, compare all three with the
current task and verify the requested destination is still an existing list (Personal allowed).
A removed or changed source/destination yields no write and an actionable refresh message.
Other edits omit the guard and retain current behavior. The guard does not authorize modifying
other fields; an unrelated concurrent title/details edit remains preserved by the targeted chat edit.

### `edit_desk_time` for timeline drop

Existing input remains `{date, item:{id,start,duration}, proposalId?}`. Add optional
`expectedItem:{id,start,duration}` for accepted-desk drag writes. Compare with the current accepted
item and require current membership/open task under the same write lock. Proposal writes already
carry a revision-bearing `proposalId`; check it before changing the proposal. If `expectedItem` is
provided for a proposal, compare against that proposal's item after validating its ID.

Success: existing fresh desk snapshot. Failure: no timing change, refresh the timeline and display
the failure. Clear time and direct dial editing may continue their existing revision/day flow;
this new guard is specifically required when using a captured drag context.

## Drag invariants

- The native window does not move or resize when a task/subtask is dragged.
- One pointer controls the session; preview elements never intercept pointer events.
- Escape, blur, pointercancel, and lostpointercapture all finalize once with no write.
- Pointerup revalidates the destination and context; a no-op drop writes nothing.
- Drag completion suppresses the associated click so it cannot toggle expansion or edit a title.
- Edge autoscroll is intentional only inside the corresponding scroller's edge band; its amount
  is not counted as a jump. Its updated anchor becomes the post-drop restoration baseline.
- Scope manual restoration to an operation and avoid competing browser anchoring behavior.
- A cancelled gesture refreshes current data without reverting an agent's concurrent change.

## Visual and accessibility contract

| Element | Contract |
| --- | --- |
| Description/editor | Shared title-aligned reading column, max 70ch; 10px top/16px bottom initial padding; nested override no less than 8px/14px; initial 13px type at 1.6 line-height; wrap long tokens |
| Subtask mode chip | Visible when the header is visible; existing toggle role and selected-state accessibility retained; mode change never reorders |
| Lamp | Noninteractive right-side status, persistent without hover, `role=img`, accessible name On My Desk; dedicated slot unaffected by more-button overlay |
| Clear time | Visible text action, not an X; below dial and separate from dismissal; unavailable without schedule; duplicate requests disabled while busy |
| Details toggle | All paths reflect one consistent `aria-expanded` state and task-details target |
| Tooltips | No redundant text on full titles, labels, or whole rows; unfamiliar icon explanations allowed; exact dates belong to timestamps; all controls keep accessible names |

Clear time keeps saved scheduling visible while awaiting its write. Success shows unscheduled state
and retains membership/picker. Failure shows the saved schedule and retry for the same clear intent.
Escape cancels an active dial gesture first; otherwise dismissal closes without issuing a clear.
Old picker generations cannot change the newly opened picker after an asynchronous response.

## Verification contract

Backend guards must be exercised against changes occurring after the last UI read, not only
mocked pre-drop cancellations. UI tests cover 360px/1200px widths, 200% enlarged text, reduced
motion, keyboard control, accepted/pending desk membership, and all drag termination paths.
Native macOS and Windows runs separately record physical window geometry normalized by display
scale and content anchor offset. Browser mocks cannot claim native-window stability.

### `reorder_tasks`

Arguments: ids (new complete desktop root sequence), expectedIds (sequence at drag start). The backend rejects stale ordering, missing/new roots, duplicates, and child IDs. Success returns the desktop snapshot in saved order. Only No sorting in ordinary views offers the action; grouped lists restrict drop targets to the current group. Task list membership and child ordering do not change.
