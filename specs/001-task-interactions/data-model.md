# Data Model: Predictable Task Interactions

Optional @order metadata is backward compatible; no migration is required. `tasks.md` remains authoritative for file order,
completion, sibling position, and current-day desk membership.

## Desktop task snapshot

The existing `Task` shape remains unchanged. `store::for_ui` returns filtered tasks in the same
relative order as `List::tasks()`. Visibility rules remain unchanged: all open roots, recently
completed roots, and children belonging to included roots. Physical file order and sibling
`position` are separate concepts; `childrenOf` continues to sort children by position then ID.
An explicit UI sort operates on copies, never mutates `tasks`, and never writes the file.

## ViewLayout (localStorage)

Key: existing `listLayouts`; scope: existing view names `all`, `today`, `upcoming`, `done`, `desk`.

| Field | Type | Rules |
| --- | --- | --- |
| groupBy | existing enum | Unchanged |
| orderBy | existing enum plus `none` | `none` displays saved source order |
| groupDescending | boolean | Unchanged |
| orderDescending | boolean | Ignored while `none`, retained without visible control |

Missing/invalid preferences retain existing defaults. Choosing No sorting saves `none`; existing
users are not switched automatically. Named lists continue using All's layout. Desk uses its own
chronology irrespective of this preference. No preferences are synchronized through `tasks.md`.

## ExpandedBranch (transient, per window)

| Field | Type | Rules |
| --- | --- | --- |
| rootId | task ID or null | Visible outer row; can be a child presented as a desk root |
| childId | task ID or null | Must belong to rootId and be rendered nested below it |
| transitionSequence | increasing integer | Guards awaited text saves and late clicks |
| pendingTarget | root/child identity or null | Last requested expansion transition while saving |

Transitions: closed → root; root → same root closed; root A → root B; root → root+child;
root+child A → root+child B; view/list change → closed. Never close a parent to open its nested child.
A text save failure leaves the preceding branch and editor intact. Same-view refresh prunes only
invalid identities. Sticky-note root content bypasses collapse and is not coupled to main-window
state. Question drafts are owned by spec 004 and never submitted by this state machine.

## DragSession (transient)

| Field | Type | Purpose |
| --- | --- | --- |
| kind | `subtask`, `task`, or desk timeline context | Select mutation path |
| pointerId | number | Ignore other pointers |
| taskId / parentId | IDs | Re-resolve current source without retaining stale DOM |
| startPoint | x/y | 5px activation threshold |
| finalized | boolean | Exactly one cleanup path, set before releasing capture |
| sourceGuard | chat, parentId, doneAt | Detect task moved/completed during drag |
| initialSiblingIds | ordered ID array for subtask reorder | Compare under lock before mutation |
| initialDeskItem | day, item, optional proposal ID | Detect changed schedule/proposal |
| destination | list identity, sibling target ID, or local start time | Resolve again before write |
| viewportAnchor | scroller, visible task ID, offset, scrollTop, fallback neighbor | Restore after render; update during intentional edge scrolling |

A fresh snapshot affecting source, relevant siblings, or destination cancels the active gesture;
unrelated changes can be retained for the final render. Backend preconditions cover races after
last frontend revalidation. Cancellation performs no write. Successful/failed writes always
clean up and re-render fresh state with anchored scroll. Task data is never stored in the floating
preview as the authoritative state.

## DeskMembership (derived)

`showLamp = noteId == null && view != 'desk' && task.mydesk && task.done_at == null`.
The selected-list state may use All internally, so use the actual desk-view predicate shared by
rendering, not a proposal's item set. Parent/child flags are independent. Existing local-day parsing
and rollover refresh are the authority for expiry. There is no new persisted lamp property.

## PendingClear (transient picker state)

| Field | Type | Rules |
| --- | --- | --- |
| operation | `clear` or null | Distinguishes clear retry from ordinary dial adjustment |
| target | `{start:null,duration:null}` | Intended write |
| baseline | last successful schedule | Remains displayed during a pending clear or failed clear |
| generation | picker generation | Ignore response for a previously opened task |
| busy / error | existing picker state | Disable duplicate send; show retry on failure |

States: idle/scheduled → clearing → idle/unscheduled on success; clearing → failed/scheduled on
failure; failed → clearing on retry; switching task/closing invalidates the generation. A completed
backend write still persists if the picker closes while awaiting it; dismissal itself never sends
clear. A proposal edit uses its current proposal ID and changes only proposal times.

## Compatibility

- No Markdown rewrite or new `@tag` is required for these presentation changes.
- Desktop snapshots change array ordering, not fields; explicit sort defaults preserve current UI behavior.
- New drag preconditions are optional on existing desktop commands; legacy callers behave as before.
- MCP task tools and agent-facing urgency ordering are unchanged by this feature.
- Existing task ID reuse is not broadened into durable identity promises; transient state is pruned
  on task disappearance. Spec 004 owns its durable question identities separately.

## DetailLink (derived, not persisted)

`{label, url}` parsed from original task details or legacy task link. Named Markdown supplies label; plain URLs use host. Dedupe exact URL, preserve encounter order of named links then plain links. Only native supported schemes open. Details remain the editable source of truth. Tooltip delay 650ms, cancelled on leave/blur/Escape/scroll.

Root manual order: Task.manual_order is an optional nonnegative integer serialized as @order. Missing values follow ranked roots in source-file order. Subtask position remains independent. reorder_tasks takes ids and expected_ids for the complete current desktop root snapshot; it rejects stale sequence/set mismatches under lock.
