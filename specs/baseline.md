# Baseline and investigation notes

Checked 2026-11-20 in America/Los_Angeles. These implementation observations support the feature
specifications; they do not prescribe a final technical design or claim a reproduced native bug.

## Version evidence

| Item | Evidence |
| --- | --- |
| Upstream main | GitHub branches/main and refreshed local origin/main both resolve to `8bf6ba2e9c6f76ad6c89e90968b68eb99611672f` |
| Local baseline | `git rev-list --left-right --count HEAD...origin/main` returned `0 0` before creating the spec branch |
| Latest TinyTasks release | GitHub releases/latest returned `v0.3.6`, published 2026-11-11 |
| Installed TinyTasks | `/Applications/TinyTasks.app/Contents/Info.plist` reports `CFBundleShortVersionString = 0.3.6` |
| Pending upstream work | GitHub open-pull-request collection returned an empty array; historical local branches were not merged into the baseline |
| Latest Spec Kit | GitHub releases/latest returned `v1.4.3`, published 2026-11-19; installation resolved source commit `980b3d027f4bd7958c35f97f618d854b41320e3f` |
| CLI update | `specify self upgrade --tag v1.4.3` completed; installed `specify --version` subsequently returned `specify 1.4.3` |
| Project workflow | `specify init --here --force --integration codex --integration-options='--skills' --script sh` ran using 1.4.3; `.specify/init-options.json` records that version |

Sources: [TinyTasks main](https://github.com/SandpiperMediaGroup/tinytasks/tree/main),
[TinyTasks release](https://github.com/SandpiperMediaGroup/tinytasks/releases/tag/v0.3.6),
[Spec Kit release](https://github.com/github/spec-kit/releases/tag/v1.4.3).

The installed app version was checked, not reinstalled. Application dependencies were not
upgraded: this task creates specifications against the current release, not a dependency migration.
The global Spec Kit CLI was explicitly upgraded at the user's request. Other repositories'
Spec Kit scaffolds were not modified.

## Current implementation and implications

| Area | Observed source | Implication for planning |
| --- | --- | --- |
| Sorting | `ui/app.js` has no `none` ordering option; `orderedTasks` always sorts. `src/store.rs::for_ui` also sorts newest first. | No sorting must recover authoritative saved order; a UI comparator bypass alone is insufficient. Keep existing per-view preferences compatible. |
| Expansion | `ui/app.js` uses an `expanded` Set and row-specific toggles. `selectView` does not clear it. | Centralize expansion transitions, retaining parent/child reachability and edit-failure behavior. Question drafts must not become implicit submissions. |
| Details | `ui/style.css` uses `padding: 0 14px 8px 44px`, 12.5px type, 1.45 line-height, no reading-width cap. | Add space/readability while preserving alignment and responsive metadata. |
| Tooltips | Task row controls set many `title` attributes; the more button includes dates unrelated to its action. | Audit `title` separately from `aria-label`; retain useful full-date information on its timestamp. |
| Dragging | `beginSubtaskDrag` and `beginTaskDrag` capture pointers, scroll near boundaries, and rerender after completion/cancel. Some focus calls do not prevent scrolling. Header has a deep native drag region. | Inspect pointer cancellation, stale DOM targets, focus restoration, scroll anchoring, rerenders, and drag-region boundaries. These are candidates, not a confirmed cause. Verify native bounds separately from viewport scroll on both OSes. |
| Subtask toggle | `.subtasks-head > .mode-chip` is hidden by the fine-pointer hover rule in `ui/style.css`. | Remove only the mode toggle from hover-only visibility; do not unintentionally reveal every hover control. |
| Desk lamp | Tasks already expose `mydesk`; `src/desk.rs` separately stores accepted arrangements and proposals. | Derive the lamp from current accepted membership, not `DeskController.entries`, which prefers proposal items during review. |
| Clear time | `ui/index.html` uses an X-shaped SVG for `.desk-arc-clear`; `ui/desk-arc.js` clears start/duration and preserves the picker. | Change the affordance while preserving save/failure/proposal boundaries; label it visibly. |
| Cleanup | `src/store.rs::archive_chat` preserves original sections with a recovery journal. UI only archives one named list at a time. | Reuse safe archive semantics and re-evaluate batch eligibility under the write boundary. Exclude task-containing lists using complete storage, not UI history. |
| Hidden completed history | `for_ui` filters old completed roots after seven days; agent discovery filters completed tasks after fourteen days and caps ordinary results at 200. | Zero visible rows does not mean empty. Complete list discovery and explicit continuation are needed for agent hygiene. |
| List identity | `Task.chat` is both the Markdown heading and source conversation. `List::insert` creates missing sections. MCP instructions favor actual conversation titles. | Specify independent destination/source fields and an explicit new-list path with a documented legacy transition; do not silently move existing tasks. |
| Planning | `src/desk.rs::Saved` has date, hours, items, proposal; no planning run. Sidebar Review depends only on a proposal. File changes already refresh the app. | Add explicit durable activity/run state with expiry and stale-run rejection; a read call or running process is not proof of planning. |
| Guidance | Documentation and keyboard shortcuts exist, but no first-use desk walkthrough. UI uses vanilla JavaScript. | A small guided-callout implementation can fit the current architecture; a React migration is not required by the request. |
| Questions | `src/mcp.rs` processes synchronous tool requests and exposes no structured question, answer, receipt, or conversation-resumption contract. | Persist questions/responses with explicit retrieval and acknowledgment. Do not promise to capture native host questions or resume a conversation without a client integration. |

## Planning boundaries

- Specs describe product outcomes. Tool names, serialized schemas, compatibility migrations,
  cancellation mechanics, and storage placement remain for the technical planning phase.
- Question history cannot live solely in expiring daily desk metadata. Stable identities must
  survive retries and avoid confusion with task ID reuse after deletion/archive.
- Planning session freshness must be checked during writes as well as rendering. UI text alone
  cannot prevent a stale agent result from overwriting a newer run.
- A task marked directly for today's desk already counts as accepted membership. A pending
  proposal alone must not add or remove lamps in ordinary lists.
- Same-machine locking does not resolve concurrent cloud edits from separate computers.
  Existing limitations must remain explicit in new answer and cleanup contracts.
- Source conversation display names and source links are context, not reliable unique routing
  keys. The question contract needs a separate stable correlation identity.
- The existing MCP implementation does not prove any named client's native question-UI support.
  Verify a client's supported extension path before committing to a native adapter. Structured
  elicitation is not a universal mirror of arbitrary host-created questions.

## Verification performed in this task

- Compared refreshed Git state with upstream main and latest published release.
- Checked installed app and installed Spec Kit versions.
- Initialized and read the Spec Kit 1.4.3 constitution/specification skills and templates.
- Resolved the active spec template separately for each of four specification passes.
- Reviewed coverage, independent scenarios, failure states, and cross-spec interactions.
- Validated local document links, requirement identifiers/references, feature-path resolution,
  absence of unfinished placeholders, and whitespace in added artifacts.

Application tests and native UI reproduction are not part of this documentation-only change.
The implementation plans must include Rust storage/protocol tests, rendered UI checks, and native
macOS/Windows drag checks appropriate to their changes. Existing examples include
`scripts/ui-smoke.cjs`, `scripts/list-interactions.cjs`, `scripts/sidebar-interactions.cjs`,
`scripts/desk-interactions.cjs`, `scripts/scroll-interactions.cjs`, and `scripts/mcp-smoke.py`.
