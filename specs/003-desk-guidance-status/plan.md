# Implementation Plan: My Desk Guidance and Planning Status

**Branch**: `codex/usability-agent-specs` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: `specs/003-desk-guidance-status/spec.md`

## Summary

Add explicit, expiring agent planning runs alongside the existing reviewable desk proposals.
Persist the run in the shared versioned `tinytasks-agent-state` metadata envelope introduced by
feature 002, not inside the legacy desk comment. Add three MCP tools for beginning, reporting,
and submitting a run. Every transition validates current day, source identity, current run,
expiry, and the observed proposal fingerprint under the existing task-file write lock.

Render small text status in the desk header and sidebar with Review taking precedence while a
replacement builds. Add a separate static Basics window covering the four requested concepts without operating task controls. See [research](research.md), [data model](data-model.md),
[agent contract](contracts/planning.md), [UI contract](contracts/desk-ui.md), and
[validation guide](quickstart.md).

## Technical Context

**Language/Version**: Rust 2021 edition; browser JavaScript/CSS/HTML in the existing Tauri webview.

**Primary Dependencies**: Existing Tauri 2, serde/serde_json 1, chrono 0.4. Reuse feature 002's
shared UUID v4 and canonical SHA-256 helpers; promote only the already-locked `uuid = 1.29.0`
and `sha2 = 0.10.9` when implementing that foundation. No React, tour library, or MCP SDK migration.

**Storage**: Existing `tasks.md` and `store::change` transaction. New `planning` namespace in
`<!-- tinytasks-agent-state {...} -->`, schema version 1. Existing `tinytasks-desk` remains the
source of accepted arrangement/proposal data. Basics has no persisted guide state.

**Testing**: Rust desk/state unit tests; temporary-data `scripts/mcp-smoke.py`; Playwright
`scripts/ui-smoke.cjs` and `scripts/desk-interactions.cjs`; native keyboard/focus checks on macOS
and Windows. No application tests were executed while producing this plan.

**Target Platform**: macOS and Windows desktop; primary app window, including narrow/sidebar-hidden views.

**Project Type**: Desktop app plus local stdio MCP server.

**Performance Goals**: A successful same-machine planning write appears within two seconds under
normal local operation; expiry is reflected no later than 330 seconds after last progress.
Lightweight status reads every 15 seconds while the main window is visible, plus file-change and
focus refresh, must not rerender editing rows or announce every heartbeat.

**Constraints**: Daily local-date scoping; five-minute inactivity expiry; only the human accepts
plans; preserve unknown metadata; no claims of cross-computer serializability or legacy-binary
concurrency guarantees; four static concepts; no Basics writes to task data.

**Scale/Scope**: One active planning run per task store/day; one existing pending proposal; existing
200-item proposal limit. Three user stories and FR-001–013. Guide is independently shippable;
planning requires the shared metadata foundation from feature 002, not its full cleanup UI.

## Constitution Check

| Principle | Before research | After design |
| --- | --- | --- |
| Human action ownership | Pass: planning remains a proposal | Pass: Accept/Decline stay UI-only; guide never invokes task mutations |
| Durable portable data | Pass: reuse task-file transactions | Pass: separate envelope, preservation/version rules, atomic proposal/run updates, legacy downgrade limits documented |
| Quiet accessible interactions | Pass: text-first status and opt-in guide | Pass: status does not replace rows; separate Basics window has keyboard exits and no task-canvas movement |
| Truthful agent state | Pass: require explicit run activity | Pass: current-run, expiry, day and fingerprint checks precede every write; no wake-up/cancel claims |
| Focused changes with evidence | Pass: bounded feature and existing tests | Pass: requirement mapping and runnable validation scenarios cover the planned changes; no runtime success claimed |

No principle exceptions. No extension hooks are registered in this checkout. The shared state
foundation must satisfy its preservation tests before enabling planning writes.

## Project Structure

### Documentation (this feature)

```text
specs/003-desk-guidance-status/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── planning.md
    └── desk-ui.md
```

### Source Code (repository root)

```text
src/agent_state.rs          # shared feature-002 envelope, source, ledger and ID/hash helpers
src/desk.rs                 # planning state machine and proposal observation integration
src/mcp.rs                  # three new tools plus explicit legacy-path supersession
src/app.rs                  # enriched get_desk; atomic observation updates on user mutations
ui/desk.js                 # derived status rendering, expiry refresh, guide integration
ui/basics.html / basics.js # separate static reference window
ui/app.js                  # sidebar status precedence, visible-main polling, view-change exit
ui/index.html              # status and view-menu Basics entry
ui/style.css               # status and responsive guide styles using current theme tokens
scripts/mcp-smoke.py        # run lifecycle and restart/legacy/retry protocol scenarios
scripts/desk-interactions.cjs # status/guide rendering and no-write keyboard tests
scripts/ui-smoke.cjs        # mock bridge support for enriched snapshot
README.md
docs/my-desk.md
docs/agent-setup.md        # explicit run/progress instructions and truthful limitations
```

**Structure Decision**: Extend `desk.rs` rather than introduce a separate scheduling service.
Keep guide behavior in a small controller to avoid adding more unrelated state to `app.js`.
The shared metadata module is owned by feature 002 and must be reused rather than independently
implemented by this feature. `tasks.md` is intentionally not generated by the planning phase.

## Implementation Sequence

1. Integrate the shared envelope/source/request-ledger helpers. Add typed planning data with
   unknown-field preservation. Add an injected clock seam for deterministic lifecycle tests.
   Introduce helpers for canonical proposal observation and effective expiry before adding tools.
2. Ensure immutable refs for legacy `uid:null` tasks through feature 002's revision-guarded
   `ensure_task_identity`; re-read discovery after identity writes. Implement begin/report/submit
   transitions inside `store::change`, including duplicate request replay, stale-run rejection, source mismatch, invalid-arrangement rollback, UTC expiry and local
   day rollover. Preserve accepted items and existing proposal until a valid replacement commits.
3. Route `suggest_desk` and `set_desk` through a single legacy-submit wrapper that invalidates the
   current run atomically with saving a proposal. Integrate observed-proposal updates into user
   review, proposal-time editing, and proposal membership changes. Preserve feature 001's
   `expectedItem` drag guard on timing writes before updating observations. Out-of-band mismatch
   fails safe.
4. Extend `get_desk` and Tauri `get_desk` snapshots with derived public planning state, never an
   authorization claim. Render header/sidebar status separately from task rows; poll visible main
   windows regardless of selected view so sidebar expiry cannot remain stuck outside My Desk.
5. Add a separate Basics native window and static page with four concepts. Launch only from
   the view menu. Done/Escape/native dismissal close it; no task mutation callbacks or stored guide state.
6. Extend existing fixtures/tests and update agent/user guidance. Prove all scenarios in the
   validation guide before advertising activity support. Run an updated desktop with updated MCP
   binaries for concurrency verification; separately exercise legacy *tool calls* through the new server.

## Requirement Coverage

| Requirements | Implementation ownership | Evidence required |
| --- | --- | --- |
| FR-001, FR-003, FR-004 | `desk.rs`, `mcp.rs`, shared state | Explicit start only; atomic valid submission; unchanged accepted desk |
| FR-002, FR-007, FR-013 | `ui/desk.js`, `ui/app.js`, status markup | Sidebar/header precedence, hidden-sidebar rendering, readable nonanimated states |
| FR-005, FR-006 | State machine, clock seam, refresh scheduling | 300s lease/330s visibility; restart, late run, clock regression and midnight rejection |
| FR-008 | Legacy tool wrappers and proposal observer | Legacy submits still reviewable and invalidate older run; out-of-band mutation fails safe |
| FR-009, FR-010, FR-012 | Guide controller and local preference | Five concepts, repeatable help, no tasks created, dismissal survives restart |
| FR-011, FR-013 | Guide DOM/focus/positioning and theme styles | Keyboard, missing targets, viewport resizing, reduced motion, focus restoration |

## Risks and Release Gates

- A v0.3.6 binary cannot enforce run ownership. Its unrelated writes should preserve the separate
  comment, but a concurrent old writer can still change proposals outside the new contract. Detect
  observed proposal mismatch, stop the run, and document that guaranteed stale-run rejection needs
  updated writers. Do not turn this limitation into a claim of full downgrade support.
- Direct Markdown editors can preserve a proposal ID while altering its content; compare the
  canonical proposal content hash as well as its ID. New known app mutations update the observation
  within the same write transaction.
- File events can arrive while a row is being edited. Status must update without wiping that draft.
- Wall-clock time changes can affect persisted leases. Clock regression before the stored last
  activity beyond a five-second tolerance interrupts the run; a new begin starts a fresh lease.
- Native dialog focus/escape order with the rotary picker needs a desktop check; browser automation
  alone is insufficient to claim native behavior verified.

## Review refinement: separate Basics window

Replace the planned inline guided tour with `ui/basics.html` and `ui/basics.js`, opened by native `open_basics` and closed by `close_basics`. One static reference page, four concepts, theme support, no task mutations or persistence needed. Remove the desk help row, invitation, step state, and highlight targets. Tests verify bridge opening, page content, and no task commands.
