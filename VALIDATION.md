# SearchTrail 0.3.0 validation

19 November 2026

## Verified locally

- JavaScript syntax, manifest assets, matching package/manifest versions.
- 43 tests execute production background logic with simulated WebExtension APIs.
- Added regressions: bounded upgrade of 1,500 visits; interrupted deletion across a background restart; repeated URLs after tab-memory truncation; partial 1,101-node trees and complete paged access; bookmark persistence and deduplication; additive backup restore; private-tab denial; chunked history/title updates.

## Browser and build checks

The workflow runs WebKit with a mobile viewport and simulated extension APIs, then compiles the iPhone IPA on macOS. UI coverage includes direct return, optional hold, separate menu button, source action above an open panel, bookmarks, RTL layout, saved placement, smaller viewport containment and ordinary links.

This is not a real iPhone Safari integration test. Device acceptance checks remain in README.md. No signing certificate is used in this build.

Build result and artifact integrity will be recorded after the workflow completes.
