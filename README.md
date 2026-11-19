# SearchTrail 0.2.0 — Safari browsing trails

Tap the floating arrow to return directly to the page that led here. Hold it for a branching trail, saved history and settings. Sources can be any permitted HTTP/HTTPS website.

## Changes from 0.1

- **Tap:** return to the immediate source without opening the panel. An existing source tab is activated directly. If that page is no longer open, its saved URL loads in the current tab. Result tabs are not closed automatically.
- **Hold for half a second:** open the trail tree. The current path is highlighted; sibling branches remain visible. Tap any saved node to revisit it. To jump farther back than the immediate source, select an ancestor in the tree.
- **Any website:** ordinary same-tab links retain normal website behavior. SearchTrail observes their source. Normal `_blank` links are opened with explicit source tracking. Google result links still open in a new tab by default; this is optional in Settings.
- **Bottom sheet:** the smaller panel and its Trail / History / Settings controls sit near the button. Default button location is bottom-right, with 16 px clearance inside the webpage viewport.
- **Saved placement:** hold the button → Settings → choose one of four corners and an edge distance. Dragging the button also saves the nearest corner and distance. Settings apply across websites. These settings are in the Safari extension panel/popup, not the native container app.
- **Arabic and other RTL pages:** the controls keep their own layout direction; page titles can display in their own writing direction. URLs are displayed readably without exposing a long encoded query in each row.
- Existing 0.1 visit records remain available in History. Their missing navigation relationships are not reconstructed.

## Install or update

1. Download the unsigned IPA from a successful [GitHub Actions build](https://github.com/aminmigo88/SearchTrail/actions). Extract the artifact ZIP if downloading from GitHub.
2. Import the IPA into Feather. Sign with your working certificate/profile and **retain embedded app extensions**. Both the host and `.appex` need suitable signing/provisioning.
3. To preserve data, install over the old version using the same signing identity and bundle identifiers; do not uninstall first. Signer behavior can affect data retention. Export valuable history before upgrading. JSON import is not implemented yet.
4. Open SearchTrail once; enable it and website access in **Settings → Apps → Safari → Extensions**. Keep Private Browsing access off.
5. Reload existing Safari webpages so they use the new content script. Test with fresh links; older pages cannot supply missing parent relationships retroactively.

No certificate, provisioning profile or private key belongs in this repository. Builds are unsigned.

## Device acceptance checks

- From any ordinary website, open a link in the same tab. Tap the arrow: it should load the source in this tab. If the source still exists in another tracked tab, that tab should activate instead.
- On Google, open several results. A tap on each should return directly to its search. Open a second search and verify each result returns to the correct source.
- Navigate A → B → C, return to A, then open D. Hold the arrow: the tree should contain A → B → C and A → D, with your current branch highlighted. Native Back/Forward should restore known nodes where identifiable.
- Open a new-tab link from a non-Google page and follow another link within the result. The immediate source should now be that result page; the original source should remain an ancestor in the tree.
- Close a source tab, or navigate it to an unrelated page. Returning should load the saved source in the current result tab and leave the unrelated tab untouched.
- Hold → Settings → Bottom left. Reload and visit another website: placement should remain. Check all corners, dragging, screen rotation and keyboard visibility.
- Verify private pages are absent; pause and exclude a site, then verify new pages there are not recorded. Test history search, deletion and JSON export.

## What is recorded

Page nodes contain a title, full URL, timestamp and (when established) a parent node ID. The graph and history are stored locally in extension storage. Tab identities and document mappings are temporary session data. No backend, analytics or remote scripts.

Relationships come from observed link taps, validated same-tab referrers, known document restoration and Safari's opener metadata. A navigation with no reliable parent starts a new tree. Reloads/restores reuse a known node instead of adding a loop. Separate newly loaded visits to the same URL can still be distinct nodes. Version 0.2 is a graph of observed pages, not a timestamped log of every back-button action.

Private tabs cannot record, read normal history or change settings. Pausing/excluding prevents recording and clears the current source relationship for that page. Deleting history affects SearchTrail only, not Safari History.

## Limits

- SearchTrail cannot alter Safari's native Back button, swipe gesture, toolbar or tab-switch animation. It uses its own floating button.
- Returning to a source that is no longer open loads its saved address; this may reload the page and does not restore form state or scroll position. It does not replay POST requests.
- Sources are supported on any **permitted** HTTP/HTTPS site, but perfect capture is not guaranteed. Browser-internal pages, Private Browsing, in-app browsers, restricted documents and pages without permission are outside its view.
- Native context-menu/modifier new tabs depend on Safari supplying opener information. Site-script popups, rapidly followed redirects, canceled link clicks, and rapid SPA changes may produce incomplete paths. Ambiguous back/forward restorations are left unlinked rather than guessed.
- Website same-tab behavior is preserved; links explicitly requesting a new tab are managed to retain their source. Site-specific handlers on such links may behave differently. Google interception can be disabled in Settings.
- Visible-page route changes are checked every 750 ms. Same-URL history-state changes are not distinguished. The extension does not modify website `history.state` or intercept POST form submissions.
- Old visit records lack parent IDs. Updating cannot reconstruct their trees. Session source matching resets after a browser restart; persisted graphs remain and their saved URLs can be reopened.
- Tree view displays at most 300 nodes including the current ancestry. History shows up to 20,000 matches in batches. Large-history performance is not yet measured. No automatic deletion; export backups. Removing extension data/uninstalling can remove it.
- UI checks use desktop WebKit with a mobile viewport and simulated extension APIs. Safari/iPhone signing, real touch behavior, viewport/keyboard handling and extension transport require device testing.

## Build and verify

```sh
npm run check
npm test
# Optional WebKit interface checks (requires dependencies/browser binaries):
npm install
npx playwright install webkit
npm run test:ui
# macOS with Xcode:
bash scripts/build-ios.sh
```

The workflow runs logic and WebKit interface checks, compiles for real iPhones and validates the embedded Safari extension before publishing an unsigned IPA. It runs on source/build changes on `main` and supports manual dispatch. Standard GitHub macOS Actions allowance applies.

The stable bundle IDs are `app.searchtrail.SearchTrail` and `app.searchtrail.SearchTrail.Extension` before re-signing.

## References

- [Apple: Safari extension compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility)
- [Apple: Packaging a web extension](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Apple: Running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)

Prepared 19 November 2026.
