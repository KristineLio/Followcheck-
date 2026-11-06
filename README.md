# FollowCheck — Your circle. Clearly.

Privacy-first, browser-only Instagram export comparison, built on the approved FollowCheck HTML/CSS visual design with lightweight vanilla JavaScript for real functionality. **No React, no backend, no Instagram login, no paid API.** Intended for VibeFlow hosting.

## What works

- Import original `.zip` Instagram exports containing a matching pair of `followers*.json` + `following*.json` or `followers*.html` + `following*.html` in nested paths. Prefer JSON if both formats are complete. Supports split follower files.
- Verify ZIP integrity (CRC), enforce entry-size and archive limits, reject unsupported/encrypted formats.
- Calculate followers, following, mutuals, nonmutuals, gained/missing followers, and net changes from actual sets.
- Explore a **real calculated** fictional demo: 1,250 followers, 840 following, 654 mutuals, 186 not following back, 596 followers not followed back, 34 gained, 12 missing, net +22.
- Search and export the selected filtered/full list as formula-safe, UTF-8 CSV.
- Keep import history in **browser IndexedDB**, segmented by the local account label you provide. Switch accounts, delete individual snapshots, or delete all saved data.
- Warn on suspected date-limited JSON exports and explain HTML date coverage limitations. No claim of live tracking or confirmed unfollow actions.

## Run locally

Only a static HTTP server is needed. `crypto.subtle` requires a secure origin (HTTPS or localhost).

```bash
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

No `npm install` is needed to run the app. The ZIP reader uses modern browser `DecompressionStream('deflate-raw')`. If a device lacks that support, the app shows an explanatory error. Test actual iPhone Safari before submitting.

## Automated checks

```bash
node --test tests/*.test.mjs
```

The seven core tests use the **synthetic** (never real Instagram) fixtures in `tests/fixtures/`. To test the UI end to end with Playwright (requires locally installed Playwright and a browser):

```bash
python3 -m http.server 8765
python3 tests/qa_browser.py
```

The browser test expects a locally running server. Production-device Safari and Android Chrome testing, and importing an authentic Instagram export, are separate release gates.

## Privacy and accuracy

- ZIP contents, usernames and snapshots are processed only in your browser. They are not uploaded to FollowCheck servers.
- The application never asks for or stores Instagram credentials, and does not scrape Instagram.
- Account labels are confirmed by the user, not verified by Instagram. Only snapshots with the **same** label are compared.
- Reimporting an identical ZIP under the same label is skipped using its SHA-256 content hash.
- Missing names could result from deactivated/blocked/renamed accounts, incomplete exports, or genuine follower changes. Do not call them confirmed unfollows.
- Instagram HTML exports do not allow reliable timestamp-coverage checks. Request **All time** and verify your account totals.
- Browser storage can be deleted by browser cleanup or private-browsing rules. No cloud synchronization is provided.
- The homepage illustrative preview is intentionally static. The **FollowCheck workspace** is the actual calculated and interactive application.

## GitHub and VibeFlow

`vibeflow-grand-prize` is the standalone HTML/CSS + vanilla JavaScript edition. The original React/TypeScript work in `feat/mobile-personal-v1` and `main` are intentionally untouched. Import or refresh the `vibeflow-grand-prize` branch in VibeFlow. Publish using VibeFlow's live URL after validating ZIP upload, persistence, CSV and mobile behavior.

Independent app; not affiliated with Instagram or Meta.