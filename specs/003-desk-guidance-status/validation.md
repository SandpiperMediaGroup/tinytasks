# Validation

Date: 2026-11-20. Status: implemented for local review, including the user's live UI refinements.

Verified: `cargo test --offline` (41 passed, one network-dependent release check ignored);
`python3 scripts/mcp-smoke.py`; `python3 scripts/agent-workflow-smoke.py`; complete
`scripts/ui-smoke.cjs` browser suite using an installed Playwright runtime. All automated data
is fictional/temporary. Local review bundle has a separate identifier and isolated sample store.

Coverage: explicit begin/progress/submit; five-minute expiry; backwards-clock guard; newer-run
and wrong-source rejection; proposal-observation conflicts; legacy invalidation; preserved accepted
desk and pending proposals; Review precedence and status refresh without row replacement.

Basics is a separate static native window with four concepts. Verified real macOS creation and
Escape dismissal; browser tests verify its content, bridge open/close, and absence of task writes.
No inline invitation, Help row, tour steps, highlight target or guide persistence remains.
Windows-native window focus/resize checks remain outstanding.
