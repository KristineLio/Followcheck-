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

