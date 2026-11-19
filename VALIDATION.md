# SearchTrail 0.2.0 validation

19 November 2026

## Verified locally

- All extension JavaScript parses; manifest resources exist.
- 28 automated tests execute the production background logic with simulated WebExtension APIs.
- Tests cover: independent Google/non-Google sources, same-tab and new-tab parent links, identical URLs in concurrent tabs, branching after Back, closed/repurposed sources, safe restored-node selection, source-tab reuse after restart, persisted graphs, legacy history, SPA routes, ambiguous traversals, deletion, private-tab denial, pause/exclusions, validated placement, concurrent writes, retry idempotency, storage failures and in-flight link-intent races.

## Build and browser checks

The GitHub workflow runs these logic checks plus the WebKit interface test, then compiles and packages the unsigned app. The interface test uses production content/UI code with simulated extension transport and a test-only open shadow root. It checks direct tap, long press without accidental navigation, tree branches, RTL isolation, saved placement after reload, smaller viewport containment, search and generic links. It is not an iOS Safari extension integration test.

Build result and packaged-file verification are recorded after the workflow finishes.

## Device status

The user confirmed 0.1 works on their iPhone. Version 0.2 still needs the device checklist in README.md. No certificate was requested or used in cloud builds. Real Safari's native tab animation, software keyboard and touch interactions can differ from browser automation.
