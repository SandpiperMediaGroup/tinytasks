# Validation

Date: 2026-11-20. Status: implemented for local review, including the user's live UI refinements.

Verified: `cargo test --offline` (41 passed, one network-dependent release check ignored);
`python3 scripts/mcp-smoke.py`; `python3 scripts/agent-workflow-smoke.py`; complete
`scripts/ui-smoke.cjs` browser suite using an installed Playwright runtime. All automated data
is fictional/temporary. Local review bundle has a separate identifier and isolated sample store.

Coverage: validation/defaults; explicit submission; source-scoped retrieval; exact acknowledgment;
retry receipts; stale revisions; removal/withdrawal; durable history; malformed metadata; drafts
across collapse, failed saves and refresh; compact answer label with “(your answer)” suffix.

Real native macOS round trip completed in isolated review data: MCP publication, desktop choice,
Send answer, MCP polling returning the exact selected ID/source/revision, explicit acknowledgment,
and native receipt observation. A second sample revision was published and answered in the
refined UI. No native host hooks, connectors, automatic mirroring, or automatic chat continuation.

The scripted protocol check exercises the real MCP binary; human submission durability is also
covered through the actual Rust service, not only a mocked browser bridge. Exhaustive cross-machine
cloud-conflict and Windows-native interaction matrices are not claimed.
