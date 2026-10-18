# v10.33.0 — Shared workspace and account sync

Deployed on 14 October 2026 to https://bcommand-center.wolvesgidaree.workers.dev
(Worker version `6d1d2aa4-b447-4129-8d56-1d3dbaee3936`). The live Home page,
stylesheet, artwork and scripts were verified after deployment. Future web
deployments should run from the main `command app` project directory.

## Home and every section

Widgets sit above the launcher. On desktop, the first three widgets form one row
and the last two each fill half of the second row. On phones, Next up spans the
width, followed by two balanced rows of two widgets. All launcher tiles are square
and equal in size. Original pastel vector artwork replaces the small emoji
circles, and matching illustrations appear in the sidebar and section headings.

All app sections now share the glass canvas, typography, surfaces, navigation
pills, form controls and mobile spacing. Notes, schoolbooks, Watch, games, music,
sport, weather, calendar, news, reading, briefing, Messages, Transfers, Mirror,
portfolio, community, status and Account use this system. Editor and game mechanics
are preserved, including Wordle's crossword-style typing.

## One account on PC and phone

Sign-in lives in **Account & sync**, reached from the home header, sidebar or
Settings. Sign in with the same account on both devices and select **Enable sync
on this device**. Notes, photos, schoolbooks, manga favourites, chapter history,
saved pages and reading languages sync through the existing account backend.
Offline changes are merged after reconnection. Account switches retain separate
local caches and take recovery snapshots. Manga deletions are timestamped so stale
devices do not immediately resurrect them; concurrent cloud writes retry and merge.

Existing account installations need no new migration, secret or bucket. Account
sync and the redesign work with the existing IPA; the new native ad filter below
requires rebuilding it.
First-time account setup is documented in [ACCOUNTS-SETUP.md](ACCOUNTS-SETUP.md).

## Video compatibility

The Movies & TV player defaults to **Compatible** mode, removing the app iframe's
sandbox before loading the selected provider. This addresses provider messages
such as “This player was sandboxed” and “Sandbox Detected”. **Restricted** mode
restores the previous iframe restrictions. In a regular browser, Compatible mode
relies on the browser's popup protection and installed ad blocker. The app cannot
filter requests or override scripts within a cross-origin iframe in that browser.

The native iOS navigation guards block player-created windows, top-level redirects,
external-app links and modal prompts independently of sandboxing. Native iOS
**1.15.0 (build 23)** also installs a narrow WebKit content rule list before the
app loads, filtering common advertising hosts while keeping video resources and
provider domains available. It does not guarantee removal of every in-player ad.
The **Filter common ads** switch appears only when the native filter is installed;
switching it reloads the current player and leaves popup protection on. Filter
compilation failure is reported accurately without preventing app startup.
Open provider remains available, but external browser tabs use that browser's
protections rather than the native app's rules.

Both modes were verified with a local embedded-player fixture. Live provider
playback was not tested, so this confirms the embed configuration rather than
guaranteeing availability of a particular external stream.

## Comix

Comix is selectable alongside Asura and MangaDex, using `comix.to` with `comix.ws`
as fallback. Normal public HTML search is supported when the site allows it.
Both domains returned browser-check HTTP 403 responses during verification;
their protected chapter data is served to their own reader. Automatic in-app
Comix page reading is therefore unavailable in this release.

The working alternative is to open Comix and paste a title/chapter link into the
app's **Save a Comix title or chapter** form. The title becomes a favourite and a
chapter link becomes a synced history entry. Resume opens the saved source-reader
link. Comix bookmarks track chapters; Asura and MangaDex retain automatic page
tracking. No challenge bypass, credential sharing or fake page result is used.

## Validation and deployment

`npm run check` and all **200 tests** passed. Browser checks verified equal desktop
and phone tile dimensions, balanced widget rows, section width containment,
notes saving, manga uploads, a simulated second device's saved-page download,
Comix link saving, and account isolation/restoration. Both player modes were
verified in an actual iframe fixture. Ad-rule tests check host boundaries and
exclusions. Swift compilation, WKWebView filtering and real-device playback must
be verified on the Mac/iPhone build path; they were unavailable on Windows.

Changes are in the existing project folder. Run `npm run deploy` there to publish
this update, then reopen the app on each device. The service worker refreshes the
new artwork and scripts. The web release is deployed and verified. Rebuild
through the existing Codemagic workflow and install
`CommandCentre-iOS26-v1.15.0.ipa` for the native ad filter. No additional full
project-copy folder was created.
