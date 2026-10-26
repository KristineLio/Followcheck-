# FollowCheck Personal

A **mobile-first, privacy-first Instagram follower comparison app** built with React and TypeScript. Upload the original Instagram ZIP export and see non-mutual follows; compare snapshots to see list changes over time.

## Privacy and accuracy

- No Instagram password, scraping, login automation, or access tokens.
- Data is parsed **locally in the browser** using JSZip. This app does not send your ZIP or follower lists to a backend.
- Snapshots are saved only on your device in IndexedDB. Deleting browser/site data deletes them.
- The initial import shows **not following back**, **you don't follow back**, and **mutual**. At least two imports from the *same account* are needed for history.
- A follower missing from a later export is **not proof of an unfollow**: name changes, suspension, blocking, or deactivation may affect lists.
- Imports show the list state from the export, not live Instagram activity.
- Both Instagram **HTML ZIP (default)** and **JSON ZIP** exports are supported. HTML is parsed as data and never rendered.

## Local development

Requires Node.js 20.19+.

```bash
npm install
npm run dev
npm test
npm run build
```

Open the Vite local URL in a browser. For mobile testing, run Vite with `--host` on your trusted local network or deploy to static hosting with HTTPS.

## Import instructions

In Instagram Accounts Center, choose **Your information and permissions → Export your information** (wording may change). Request **Followers and following**, **All time**, and **Download to device**. Leave **HTML** selected (Instagram's default) or select **JSON**; both work. Once the ZIP is ready, open FollowCheck and select the original ZIP from Files/Downloads. Do not unpack it manually.

## Scope

V1: instructions-first mobile onboarding, HTML/JSON ZIP parser, follower comparison, local snapshot storage/history, username search, direct Instagram profile links, clear-history control, basic tests.

Next: test multiple real-world export variants, dedicated account separation, raster app icons, exportable reports, and accessibility/device QA.

**Not affiliated with Instagram or Meta.**

## Mobile installation and preview hosting

The app includes a web manifest and service worker. On iPhone open the HTTPS site in Safari, tap **Share → Add to Home Screen**. On Android Chrome open the menu and choose **Add to Home screen** / **Install app** if available.

The UI and follower analysis work without a backend. A static host can deploy the Vite build:
- Build: `npm install --no-audit --no-fund && npm run build`
- Publish directory: `dist`
- Node.js: 22

**Note:** Initial offline use is best-effort; please validate the actual iPhone and Android installation workflows before treating the PWA as production-ready.


## Checking import accuracy

**Do not rely on the mutual/non-follower count until the ZIP follower total agrees with Instagram.** FollowCheck now shows a follower-total verification form and a local-only list of source files and extracted record counts. If the entered live follower count differs from the export count, derived comparisons are hidden. Small differences can reflect the time between export and verification, but large differences usually require checking the export account, date range, and missing files. No external Instagram requests are made.

Re-importing an *identical original ZIP* does not create a new growth snapshot. Growth comparisons require two different exports whose follower totals have been checked. Older snapshots do not contain file-level diagnostics and should be re-imported to inspect their source files.

## Don't follow me back section

A dedicated, searchable mobile and desktop tab. Follower lists only appear when **both** followers and following counts extracted from the ZIP match the manually entered Instagram totals; otherwise it prompts re-import rather than displaying misleading usernames. Even matched counts are not proof of freshness or completeness.

## Automatic follower comparison UX

After a ZIP upload, the Overview immediately shows two preview cards: **Don't follow me back** and **Mutual followers**. Both account lists are accessible without typing Instagram account totals or completing a verification gate. All entries are computed locally by comparing the exported follower/following usernames.

**Data accuracy warning:** An Instagram ZIP can be incomplete, outdated, from the wrong account, or parsed incorrectly. A previous test import showed a major mismatch (105 extracted followers versus 1,323 displayed on Instagram). Therefore all displayed account-comparison results are explicitly labeled **export-based/unverified**, including the full account lists. If a previous manually entered count mismatch exists in local storage, the UI shows an elevated warning. Never market such counts as confirmed, and do not encourage mass unfollowing.

The ZIP diagnostics remain available in expandable sections, so parser issues can be investigated without requiring users to enter counts. A future release must resolve export completeness and real-file parser validation.
