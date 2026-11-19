# SearchTrail 0.2.0 validation

19 November 2026

## Verified locally

- All extension JavaScript parses; manifest resources exist.
- 29 automated tests execute the production background logic with simulated WebExtension APIs.
- Tests cover: independent Google/non-Google sources, same-tab and new-tab parent links, identical URLs in concurrent tabs, branching after Back, closed/repurposed sources, safe restored-node selection, source-tab reuse after restart, persisted graphs, legacy history, SPA routes, ambiguous traversals, deletion, private-tab denial, pause/exclusions, validated placement, concurrent writes, retry idempotency, storage failures and in-flight link-intent races.

## Build and browser checks

The GitHub workflow runs these logic checks plus the WebKit interface test, then compiles and packages the unsigned app. The interface test uses production content/UI code with simulated extension transport and a test-only open shadow root. It checks direct tap, long press without accidental navigation, tree branches, RTL isolation, saved placement after reload, smaller viewport containment, search and generic links. It is not an iOS Safari extension integration test.

The completed build and package checks are recorded below.

## Verified release build

- [GitHub Actions run 44519210747](https://github.com/aminmigo88/SearchTrail/actions/runs/44519210747) succeeded: all 29 logic tests, WebKit UI checks and Xcode iPhone compilation.
- Source commit: `39cbb52807b2967d44f55944cc95e40918edade0`.
- Rendered tree and small-viewport screenshots inspected. Controls remain at the bottom of the panel; RTL host-page layout does not reverse them.
- Downloaded artifact matches GitHub's digest. IPA ZIP integrity, both Mach-O executables and their executable bits, both bundle identifiers, version `0.2.0` and build `2` verified. Every extension resource matches the source bytes.
- IPA: 295878 bytes. SHA-256: `26d6007035ce79e4dfbac1c498843ede1601e572b9fd05347e95c75d9c7532b8`.
- Version 0.2 iPhone installation and real Safari behavior remain untested by the author; follow the device checklist.


## Device status

The user confirmed 0.1 works on their iPhone. Version 0.2 still needs the device checklist in README.md. No certificate was requested or used in cloud builds. Real Safari's native tab animation, software keyboard and touch interactions can differ from browser automation.
