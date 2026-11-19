# SearchTrail 0.1.0 — iPhone Safari prototype

Return to the Google search that opened a result, and keep a separate local record of visited pages across tabs.

**This ZIP contains source code and a cloud-Mac build workflow. It is not an installable IPA.** The web-extension logic has automated tests; compilation, signing, Safari behavior and the iPhone interface still need device validation. There is no certificate, provisioning profile or password in this project.

## What the first version does

- Adds a draggable blue button on permitted HTTP/HTTPS webpages. Tap it to open Recent visits or Return to search without opening a new tab.
- By default, intercepts normal taps on external links on Google search-result pages and opens a new tab. This allows SearchTrail to record the exact source search instead of guessing from the most recently used tab.
- The return action activates the existing source tab and leaves result tabs open. If the source has closed or navigated to another search, it offers **Reopen saved search** instead. It never silently navigates an unrelated tab.
- Records titles, full URLs, and timestamps of loaded pages. Visits remain after Back navigation and closed tabs. Repeated visits can appear separately.
- Searches the recorded titles/URLs; lets you pause, exclude a site, delete visits or export JSON.
- Stores records locally in extension storage. No analytics, server, subscription or network backend. Private tabs are rejected even if the extension is enabled there. URLs can contain personal search terms; exported JSON includes those URLs.
- Does not access, clear, repair or replace Safari's own History or bookmarks. It cannot change Safari's native toolbar or Back gesture.

## Build the IPA on a cloud Mac

Use a GitHub repository you control. No signing secret is required for this build.

1. Extract this ZIP on your Windows laptop. The repository root must contain `extension/`, `scripts/`, `tests/`, `package.json`, and `.github/workflows/build-ios.yml` directly. Do not upload the ZIP as a single file or put everything inside an extra `searchtrail` folder. Include the hidden `.github` directory.
2. Commit these files to your repository. A private repository keeps the source private; check your available Actions allowance before running a macOS build. Do not add a certificate or provisioning profile.
3. In GitHub, open **Actions → Build SearchTrail for iPhone → Run workflow**.
4. After a successful run, download **SearchTrail-unsigned-IPA** from that run's Artifacts section. Extract the artifact ZIP to obtain `SearchTrail-unsigned.ipa`.
5. If the workflow fails, retain its build log. It is deliberately configured to stop rather than upload an app with a missing Safari extension.

The workflow uses Apple's installed Safari packager/converter, generates the Xcode host app and extension project, compiles for real iPhones without signing, checks that the `.appex` and extension resources were embedded, and packages `Payload/SearchTrail.app` into the IPA. The generated Xcode project is build output, not an existing project included here.

On a Mac with Xcode you can instead run `bash scripts/build-ios.sh` from this directory. Windows cannot run that script's Xcode build locally.

## Sign and install with Feather

Your screenshot shows imported Distribution and Development entries and remaining time. It does not prove that the certificate is unrevoked or that the provisioning profile permits this app and extension.

1. Transfer the unsigned IPA to your iPhone and import it into Feather.
2. Use a certificate/profile that already installs apps successfully on this iPhone. The Distribution entry is a reasonable first candidate for a regular signed release **if its associated profile is suitable**; the label alone cannot prove that.
3. Preserve the embedded app extension (`PlugIns/*.appex`). If your signer offers a remove-extensions option, leave it disabled. Both the container app and Safari extension must be signed correctly, with provisioning and identifiers that match. Merely signing the outer app is insufficient.
4. Sign and install. Keep the bundle identifiers consistent across updates so the local log is not unintentionally replaced by a different installation.
5. Open SearchTrail once, then enable it under **Settings → Apps → Safari → Extensions → SearchTrail**. Grant access to the websites you want to record; all-sites access is necessary for a broad browsing log. Keep Private Browsing access disabled.
6. Reload existing webpages. Open a Google search and use the blue button.

If the app installs but SearchTrail does not appear in Safari Extensions, do not assume the JavaScript is at fault: check that the signer retained and signed the `.appex`. If signing fails, share only the error message, not your certificate password or private key. Some profiles may not be suitable; this project cannot make them suitable.

## Device acceptance test — required before relying on it

1. Search Google for `air purifier`. Open three different external results. On each, Return to search must activate the same original results tab, without creating another Google tab or closing the results.
2. Open a separate Google search for `3D printer`. Open results from both searches alternately. Each return button must go to its own search.
3. In a result, follow several links. Return to search should remain tied to its original search. A new tab opened through Safari's context menu can only inherit this connection if Safari supplies its opener information.
4. Close the original Google tab. The button must become Reopen saved search. Then change an original Google tab to a different query and verify the same fallback. Try two identical searches in different tabs too.
5. Visit 20 ordinary pages across multiple tabs; go Back, open other links and close tabs. SearchTrail should retain the records of pages on which it ran. Compare titles and URLs, not just the displayed number.
6. Quit/reopen Safari and revisit a permitted page. Recent visits should remain. Source-tab connections may be reset across a browser restart; a saved search URL can still be reopened from a recorded visit.
7. Verify a private page does not appear. Pause recording, load a fresh page, and verify it is not saved. Exclude a site and repeat. An exclusion covers its subdomains; remove it on the same hostname where it was added.
8. Export JSON and confirm the iPhone can save/open the file. Test deleting one visit without affecting other records. Test Delete visit log only after exporting any records you want to retain.
9. Move the floating button, open the panel with the keyboard visible, rotate the phone and test a long list. The floating button's position is currently per page, not synchronized across websites.

## Honest limits of this prototype

- It cannot recover visits from before installation or pages that Safari never allowed the extension to see. Browser-internal pages, most built-in PDF views, in-app browsers and private tabs are not captured.
- Fast redirects that never reach a loaded document may not be recorded. The extension polls visible-page URL changes every second to notice single-page-app navigation; very rapid changes between polls may be missed. It is a page-visit log, not a complete network-request recorder or a full-text archive.
- Normal taps on Google external links are controlled by default. Long-press/context-menu and other site-created tabs depend on Safari providing opener information. It intentionally does not guess when that information is missing.
- A suspended search tab may reload when Safari activates it; preserving its scroll position is controlled by Safari and the website.
- There is no automatic deletion policy in this prototype. Safari/iOS quotas and storage failures still apply; failures are surfaced and visit writes are retried while the page remains available. Uninstalling/removing extension data can remove the log. Export backups.
- History search currently reads the stored log and displays up to 20,000 matching records in batches. It is designed first for tens/hundreds of pages; performance with a large long-term history has not been measured. Export includes all saved records.
- Restoring a JSON backup and importing existing Safari bookmarks are not implemented in v0.1.0.
- Real iOS compilation, Feather signing, navigation and UI tests have **not** been run in the supplied environment.

## Local verification

Node.js 20 or newer; no npm dependencies:

```sh
npm run check
npm test
```

Automated tests exercise real background code with simulated browser APIs. They test search/source isolation, wrong-tab prevention, tab-ID reuse, parallel visit writes, private-tab denial, persistence across background recreation, pause/exclusions, input validation and retry idempotency. They do not establish Safari compatibility.

## Files

- `extension/`: the HTML/CSS/JavaScript Safari Web Extension.
- `scripts/build-ios.sh`: generates and compiles the iOS container using Apple's tool.
- `scripts/package-ipa.py`: checks the embedded Safari extension before packaging.
- `.github/workflows/build-ios.yml`: manual cloud-Mac build; no signing secrets.
- `tests/`: automated behavior tests.

## References

- [Apple: Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
- [Apple: Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [Apple: Browser-based packaging](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)
- [Mozilla: tabs API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs)

Prepared 19 November 2026. Prototype 0.1.0.
