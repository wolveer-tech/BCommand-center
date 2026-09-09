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
