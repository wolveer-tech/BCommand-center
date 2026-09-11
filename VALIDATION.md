# Home, Privacy Lock, Messages and media v10.18 validation — 11 September 2026

- Home theme, density, ordering, visibility and compact/full card sizes are
  validated in saved-state and static interface coverage. The next-up card is
  driven by live reminder/event data and the match strip uses followed clubs.
- iOS 1.6.0 (build 11) exposes a main-frame-only privacy bridge, persists only
  the on-device lock preference, authenticates with the device-owner policy,
  shields the WKWebView outside the foreground and declares the Face ID usage
  description.
- Messages defaults to active devices while allowing disconnected conversations
  to be revealed, and includes date grouping, reply/copy actions, swipe reply,
  delivery feedback, character count and draft preservation without a schema
  change.
- Media-provider tests verify exact Atlantic movie/episode routes, Boomflix
  title routes and HTTPS host allowlisting. Provider credentials are not added.
- Windows cannot compile or sign Swift, so the final Face ID, app-switcher and
  physical-touch checks must be completed on the iPhone after Codemagic builds
  the IPA.
- Project validation and the serial full automated suite pass: **59/59 tests**.
- No D1 migration, Cloudflare secret or entitlement change is required.

# Persistent paired-device identity v10.17.3 validation — 11 September 2026

- iOS 1.5.3 (build 10) registers a main-frame credential bridge before page
  scripts run, validates the token/device shape and mirrors session changes to a
  device-only generic-password Keychain item.
- A missing WKWebView session is restored from Keychain before Messages and
  Transfers initialise; deliberate removal and server revocation clear it.
- Backups optionally encrypt the paired connection with AES-256-GCM after
  PBKDF2-SHA256 key derivation (210,000 iterations). A wrong password or modified
  ciphertext is rejected before app state is changed.
- Automated crypto coverage round-trips a real test identity, verifies the
  bearer token is absent from the serialized encrypted record and rejects a
  wrong password.
- Messages themselves remain in D1. Reusing the original credential reopens the
  same history and avoids creating another `transfer_devices` row.
- Windows cannot compile/sign Swift, so Keychain continuity must be confirmed on
  the physical iPhone after Codemagic builds the IPA.
- Project validation and the serial full automated suite pass: **53/53 tests**.
- No D1 migration, Cloudflare secret or entitlement change is required.

# One-tap native news links v10.17.2 validation — 11 September 2026

- News cards remain semantic HTTPS links with safe new-window attributes and
  now expose explicit mobile tap/pressed behaviour.
- iOS 1.5.2 (build 9) handles `target="_blank"` navigation: external articles
  open through iOS and same-origin links remain in Command Centre.
- The handler rejects non-HTTP URL schemes and returns no unmanaged web view.
- Windows cannot compile/sign Swift, so the final physical-iPhone tap check is
  required after Codemagic builds the IPA.
- Project validation and the serial full automated suite pass: **50/50 tests**.
- No D1 migration, Cloudflare secret or entitlement change is required.

# Device sync, Bible backup and music control v10.17.1 validation — 10 September 2026

- The Remove button uses an explicit two-tap, five-second confirmation inside
  the page and no longer depends on a WebKit JavaScript dialog.
- Device changes refresh Transfers recipient/device lists, notify Messages in
  the same page and propagate to other same-origin tabs through local storage.
- Real local D1 coverage confirms that removal returns the target identity,
  drops it from the active device list, rejects repeat removal, invalidates its
  credential and invalidates its outstanding pairing code.
- iOS 1.5.1 (build 8) registers a `WKUIDelegate` for native alert, confirm and
  prompt panels. Windows cannot compile/sign Swift, so a physical-device check
  remains required after Codemagic builds the IPA.
- Portable backups export and restore validated Bible chapter progress and the
  current reading recommendations. Existing backup files remain accepted.
- Full and mini YouTube Music play/pause handlers no longer receive a click
  event as a forced Play value; the control layers explicitly accept touches.
- Project validation and the serial full automated suite pass: **49/49 tests**.
- No D1 migration, new Cloudflare secret or entitlement change is required.

# Stability and flow v10.17 validation — 10 September 2026

- Weather uses a 15-minute fresh cache and a 24-hour offline fallback, starts
  after Home's critical render, and is reused by the daily briefing.
- The service worker precaches the app shell but deliberately leaves `/api/`
  requests network-only so live data is never mistaken for a cached response.
- YouTube library state, hidden channels and followed matches are normalised
  during startup and covered by static regression tests.
- Match Centre combines match overview, lineups, timeline and available
  statistics behind one Worker route.
- iOS 1.5.0 registers the permitted background task identifier, saves the
  native notification schedule and recalculates football alert times from a
  refreshed fixture list.
- Messages and Transfers detect the IPA notification bridge, register the
  paired-device credential for privacy-preserving native inbox checks and keep
  Safari/PWA Web Push as the browser fallback.
- Transfers, Messages, data restore, Apple PiP and the mirror extension are not
  replaced or given new entitlements.
- Native WidgetKit/Lock Screen widgets and ActivityKit were deferred to keep
  this build compatible with the entitlement-light Signulous flow.
- This Windows environment can parse and test the web/Worker code but cannot
  compile or sign Swift; the physical-device check remains required.
- Project validation and the serial full automated suite pass: **47/47 tests**.

# IPA restore crash hotfix v10.16.2 validation — 10 September 2026

- Restore uses WKWebView's standard file input rather than sending the complete
  selected JSON through a Swift-to-JavaScript bridge.
- The restored state refreshes Home plus only the active heavy data page.
- Notes, reminders and calendar data retain the existing merge and validation
  rules.
- Full automated suite: **42/42 passed**.
- No IPA rebuild or database migration is required for this hotfix.


# Home weather auto-load v10.16.1 validation — 10 September 2026

- Home schedules weather after its critical render rather than inside the
  startup job list.
- Safari/iOS receives the 250 ms fallback when `requestIdleCallback` is absent.
- A shared in-flight promise prevents an automatic request and a user tap from
  loading weather twice.
- The launcher reports that weather is loading until the result is rendered.
- Full automated suite: **41/41 passed**.
- No native build or database migration is required for this follow-up.


# Requested mobile improvements v10.16 validation — 10 September 2026

## Automated checks

- `node --check worker.js`: passed.
- Inline JavaScript in `public/index.html`: parsed successfully.
- `node --test tests/*.test.mjs`: **40/40 passed**.
- Static coverage checks the all-competition football schedule and lineup
  routes, YouTube comments, non-Trending personalised feed, exact timestamp
  resume/Continue Watching, removal of the custom video mini-player, native IPA
  notification bridge and backup/restore bridge.

## Mobile visual check

The local app was exercised at a 390 × 844 viewport. Home, YouTube, Sport,
Settings → General and Settings → Notifications remained usable without
horizontal overflow. A video could be opened from its ID, the comments card and
recent-video entry appeared, and no custom floating-video controls or mini mode
were present. The Sport schedule, backup card and notification settings fit the
phone layout.

## Remaining device checks

This Windows environment cannot compile or sign the Swift project. Build native
iOS **1.4.0 (build 6)** with Codemagic/Xcode and verify notification permission,
a scheduled test alert, JSON export/import, notification deep links and Apple's
system PiP on a physical iPhone. Provider availability also depends on the
configured API keys and subscription coverage.

No database migration is required for v10.16.


# Shared-link freeze v10.14 validation — 9 September 2026

## Server concurrency

- Eight simultaneous home-page requests returned HTTP 200.
- Eight simultaneous media-status requests returned HTTP 200.
- Eight simultaneous live-provider requests returned HTTP 200.
- The observed Worker response times did not indicate a multi-user server lock.

## Client repair checks

- Cold startup no longer renders the full Bible checklist or year calendar.
- Cold startup no longer starts Words, Manga, Portfolio, Weather, Reddit,
  Entertainment, Briefing, or live-provider network work.
- Those features continue to initialise through their existing page-navigation
  hooks when opened.
- Cross-tab storage events ignore keys other than the main app-state document.
- Main-state events are debounced by 150 ms.
- Cross-tab refresh no longer starts portfolio or weather requests.
- Dynamic-provider, media-provider, UI, playback, cold-start, and cross-tab
  tests: 15/15 passed.

## Deployment

Deploy the cumulative v10.14 update and restart each installed PWA. No native
iOS rebuild or database migration is required.


# Flixer source v10.13 validation — 9 September 2026

## Provider behaviour

- The Flixer movie route with `embed=1` returned HTTP 200.
- The Flixer TV episode route with `embed=1` returned HTTP 200.
- Neither route returned `X-Frame-Options`.
- Neither route declared a CSP `frame-ancestors` restriction.
- The application bundle recognises `/watch/movie/:tmdbId` and
  `/watch/tv/:tmdbId/:seasonId/:episodeId`.

## Application checks

- Movy is replaced by Flixer in the Movies & TV provider row.
- Movie and TV selections generate the matching Flixer watch route.
- Flixer is loaded into the existing in-app iframe rather than an external tab.
- Season and episode numbers, HTTPS, and the host allowlist are validated.
- Existing in-app fullscreen, floating player and progress tracking remain
  connected to the media iframe.
- Worker syntax and `wrangler.jsonc` validation passed.
- Dynamic-provider, media-provider and UI/playback tests: 13/13 passed.

## Deployment

Replace `worker.js`, `public/index.html`, and `wrangler.jsonc`, then deploy the
Worker. No native iOS rebuild or database migration is required.


# Movy source v10.12 validation — 9 September 2026

## Provider behaviour

- `https://www.movy.sx/movie/{tmdbId}` returned the matching movie page.
- `https://www.movy.sx/tv/{tmdbId}/{season}/{episode}` returned the matching
  episode page.
- The provider returned `X-Frame-Options: DENY`; v10.12 therefore treats Movy
  as external-only instead of displaying a broken iframe.

## Application checks

- Movie and TV TMDB selections generate their exact Movy routes.
- Season and episode numbers are validated before generating a TV route.
- HTTPS and hostname allowlist enforcement remain active.
- Pressing Play with Movy selected opens a window immediately, then navigates it
  after the Worker validates the URL. This avoids common mobile popup blocking.
- Existing embedded providers keep their in-app player and mini-player flow.
- Worker syntax check passed.
- Dynamic-provider, media-provider and UI/playback tests: 13/13 passed.

## Deployment

Replace `worker.js`, `public/index.html`, and `wrangler.jsonc`, then deploy the
Worker. No native iOS rebuild or database migration is required.


# Provider 2 v10.11 validation — 9 September 2026

## Confirmed cause

- The deployed Provider 2 configuration reported `mode: "scrape"` and hostname
  `timst.cfd`.
- Its homepage returned only a JavaScript app shell with an empty `#root` node,
  so the scrape adapter correctly found zero server-rendered events.
- Its current `/api/live-upcoming` JSON response returned 21 total live/upcoming
  events during diagnosis, including four Soccer events with 20 player sources.
- The configured player allowlist already included the current player hostname.

## Repair verification

- Dynamic event rows are no longer mistaken for category groups merely because
  they contain a `streams` array.
- Numeric genre IDs are resolved from the response's `genres` metadata.
- Soccer, Basketball and Tennis are filtered independently.
- Sub-category names are preserved as leagues.
- ISO event times are converted to Unix seconds for the existing UI.
- Live response sample produced four Soccer events and 20 source choices.
- New deterministic dynamic-provider tests: 2/2 passed.
- Existing UI/playback tests: 8/8 passed.

## Deployment requirement

Deploy `worker.js` and change Provider 2 from scrape mode to the dynamic settings
listed at the top of `README-SETUP.md`. No web UI or native iOS rebuild is
required.


# Playback v10.10 validation — 9 September 2026

## Passed locally

- Project validation compiled the complete inline app script, Messages and
  Transfers bundles, extension manifest and bundled Cloudflare Worker.
- All 27 automated tests passed, including the new in-app mini-player,
  controls-only YouTube Music module, progress/resume storage and native iOS
  background-media configuration checks.
- In a 655 × 552 mobile browser viewport, a real YouTube embed stayed mounted
  after navigating from Watch to Today and became a 360 × 203 floating player.
  Its lower edge was 12 px above the mobile dock, and the overlapping global
  quick-add control was hidden while the mini-player was open.
- The floating player's Return control restored the normal YouTube Watch view
  without reloading the iframe; Close reset the iframe and removed the hidden
  playback page.
- No browser console errors appeared during the playback navigation check.

## Device/provider checks still required

- Build and sign native iOS 1.3.0 (build 5) on macOS/Codemagic; this Windows
  environment cannot compile an IPA or inspect the generated Info.plist.
- Confirm Audius lock-screen/background playback and Media Session controls on
  a physical iPhone.
- Confirm system PiP and exact progress messages with the configured authorised
  Movies & TV provider. Providers that do not expose progress intentionally use
  an estimated time-watched fallback.
- YouTube is intentionally paused when the app is backgrounded; only the
  visible in-app Watch mini-player continues during Command Centre navigation.

# Transfers validation — 8 September 2026

## Passed locally

- All seven scenario groups in the local D1/R2 integration suite (eight Node test results including the parent suite).
- Authentication, hashed device credentials, one-use pairing under simultaneous requests, and revocation of devices/invitations.
- PC-to-phone and phone-to-PC messages/links, targeted-recipient privacy, sent/inbox/type filters and read receipts.
- Multipart binary-file round trip through local R2 bindings, SHA-256 metadata, retry-safe completion, empty files, size limits, and rejection/removal of a stored-size mismatch.
- Notification recipient selection, content-free notification payloads and outbox deduplication using a stub push sender.
- Expired-item access denial, R2/D1 cleanup and abandoned-upload cleanup.
- Browser interaction at desktop and 390px phone width: connect, send a message, view Sent, select/upload a binary file and prepare a download that reports a matching SHA-256.
- CLI sender/receiver: a file over 16 MiB crossed the multipart boundary, downloaded identically, and an existing destination file was protected from overwrite.
- Browser bundle rebuild, original inline-app JavaScript syntax, full Worker dependency bundling, extension JavaScript/manifest syntax and PowerShell helper syntax.

The preview used disposable local data and a local R2 upload bridge. Backend tests used Cloudflare's local D1 and R2 bindings. No production Worker, repository or Cloudflare account was changed.

## Still needs your configured environment

- A real R2 S3 upload/download smoke test after adding your bucket, CORS and credentials.
- Actual Web Push delivery to your Home Screen iPhone PWA after pairing and granting notifications.
- An Xcode/Codemagic build and real iPhone test of the new native download/share handler. This Windows environment cannot compile or sign the iOS app.
- Installing the unpacked Chrome/Edge extension and Windows Send to shortcut on your own machine. Their packages are included; they were not installed or connected to your real account here.

See `TRANSFERS-SETUP.md` for the ordered setup and smoke-test steps.
