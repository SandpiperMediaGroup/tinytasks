# Validation

Date: 2026-11-20. Status: implemented for local review, including the user's live UI refinements.

Verified: `cargo test --offline` (41 passed, one network-dependent release check ignored);
`python3 scripts/mcp-smoke.py`; `python3 scripts/agent-workflow-smoke.py`; complete
`scripts/ui-smoke.cjs` browser suite using an installed Playwright runtime. All automated data
is fictional/temporary. Local review bundle has a separate identifier and isolated sample store.

Coverage: saved-order No sorting; one expanded branch; editing/retry; 12px paragraph spacing
from single newlines; combined 16px row-to-details gap; 16px before subtasks; link chips and delayed
URL tooltips; always-visible subtask mode; hover lamps; exact lamp/scribble/subtasks/time/more order;
Clear time and failed-clear retry; drag cancel/source guards; scroll preservation. Resize checks
repeat 1200, 360, 280, 900, 320, 1200 and 360px, asserting details/questions fit and next rows do not
overlap. Open details use normal block flow, replacing fractional-grid height animation. The
fixed inline-row breakpoint is 480px, reduced from 620px.

Narrow-row follow-up: at 280, 360 and 460px, regression assertions check that the checkbox
aligns with the title, the text extends to the row's right padding, and all applicable controls
share one ordered strip beside the agent/list on the second line without overflow. The more button participates in that
strip. Narrow subtask rows use the same arrangement.

Native macOS: verified direct question interaction, details/link rendering and subtask reorder;
ran repeated drag inputs with stable visible content before/after. Native outer-window bounds
were not instrumented, so the full quantitative SC-004 matrix is not claimed. Windows-native
checks remain outstanding. Browser viewport preservation is not evidence of Windows window geometry.

Manual root ordering follow-up: 42 Rust tests passed (one network test ignored), including file round-trip, cross-list membership, children/details preservation, stale orders, invalid root sets and newly added roots. Full browser UI suite passed, including drag before/after, cancellation and failed-save retry, existing sidebar/canvas list moves, desk scheduling and scroll checks. Real MCP smoke passed. The updated native review app was reopened; native drag automation returned noWindowsAvailable, so this specific native drag is left for user review.
