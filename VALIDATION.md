# SearchTrail 0.3.0 validation

19 November 2026

## Verified locally

- JavaScript syntax, manifest assets, matching package/manifest versions.
- 45 tests execute production background logic with simulated WebExtension APIs.
- Added regressions: bounded upgrade of 1,500 visits; interrupted deletion across a background restart; repeated URLs after tab-memory truncation; partial 1,101-node trees and complete paged access; bookmark persistence and deduplication; additive backup restore; private-tab denial; chunked history/title updates.

## Browser and build checks

The workflow runs WebKit with a mobile viewport and simulated extension APIs, then compiles the iPhone IPA on macOS. UI coverage includes direct return, optional hold, separate menu button, source action above an open panel, bookmarks, RTL layout, saved placement, smaller viewport containment and ordinary links.

This is not a real iPhone Safari integration test. Device acceptance checks remain in README.md. No signing certificate is used in this build.

## Verified package

- Native iPhone build and WebKit UI checks succeeded in [run 44578659983](https://github.com/aminmigo88/SearchTrail/actions/runs/44578659983), commit `6c5062fa48c353dbf4dfaaeae8b88b8c98985ac9`.
- Latest production source `d8e0a8114b648ff8e31f3ca08703f956b64db03b` passed all 45 logic tests and WebKit checks in run 44578971308. Its Mac job remained queued at packaging time.
- The delivered unsigned IPA reuses the successful native build and replaces only `background.js` with the tested latest version. No compiled native code, native metadata or signing files were changed.
- ZIP integrity, both Mach-O executables and executable bits verified. Both bundle versions are 0.3.0, build 8. Both stable bundle identifiers are retained.
- All 14 embedded extension resources match the latest local source byte-for-byte.
- Delivered IPA: 302643 bytes; SHA-256 `383d5273a8c9b28391d9f35cde43f61628737f5f4ec4f4a2f075b9a7f31a6fef`.
- Rendered narrow-screen, RTL and reduced-height screenshots inspected. WebKit interactions passed at all four placement corners, including clicking the arrow above the open menu.
- Real iPhone installation, Safari transport, keyboard behavior and signing remain device acceptance checks, not claimed as tested.

