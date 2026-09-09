# Command Centre setup

**Messages v10.8:** Already using Transfers? Follow [MESSAGES-SETUP.md](MESSAGES-SETUP.md) for the chat update and its single new D1 migration. No new bucket or secrets are required. Validation: [MESSAGES-VALIDATION.md](MESSAGES-VALIDATION.md).

**Transfers v10.7:** Start with [TRANSFERS-SETUP.md](TRANSFERS-SETUP.md) for the new file/message/link service, Cloudflare R2 and D1 setup, device pairing, Windows sender, browser extension and native iPhone download support. Local validation results are in [VALIDATION.md](VALIDATION.md).

# v10.11 — Provider 2 dynamic-feed repair

Provider 2's homepage is now a JavaScript application. HTML/scrape mode only
sees its empty app mount element, so it reports zero streams even when the
provider's JSON feed contains live events.

This update adds support for dynamic event feeds where:

- events contain their own `streams` source arrays;
- a numeric `genre` refers to a separate `genres` metadata array;
- sub-category metadata supplies the league name; and
- event times are ISO date strings rather than Unix timestamps.

The parser keeps the event intact, maps its genre, filters Football,
Basketball and Tennis independently, and preserves every allowed player
source.

## Required Cloudflare Provider 2 settings

In **Cloudflare → Workers & Pages → bcommand-center → Settings → Variables and
Secrets**, update/add these text variables:

    LIVE_PROVIDER_2_MODE=dynamic
    LIVE_PROVIDER_2_DYNAMIC_PATH=/api/live-upcoming
    LIVE_PROVIDER_2_DYNAMIC_ROOT=events
    LIVE_PROVIDER_2_ALLOWED_DATA_HOSTS=timst.cfd

Keep the existing values:

    LIVE_PROVIDER_2_BASE_URL=https://timst.cfd
    LIVE_PROVIDER_2_ALLOWED_EMBED_HOSTS=epiembeds.online

Remove `LIVE_PROVIDER_2_DYNAMIC_CATEGORY_FIELD` if it has an old numeric genre
value. The v10.11 parser now resolves the feed's genre metadata automatically.

After saving the variables, deploy the updated `worker.js`, then test:

    /api/live-content?category=soccer&provider=2&refresh=1

The response should report `mode: "dynamic"`, a non-zero `count` whenever
matching events are live, and `rejectedCount: 0` when the embed allowlist is
correct.

Files changed for this repair:

    worker.js
    tests/dynamic-provider.test.mjs
    README-SETUP.md
    VALIDATION.md

No `public/index.html` replacement, D1 migration, Codemagic build, IPA rebuild,
or Signulous reinstall is required.


# v10.10 — Persistent playback and watch progress

This release adds the playback behaviour used throughout the installed app:

- A playing YouTube or Movies & TV iframe stays mounted when you leave its app
  page and becomes a small in-app Picture in Picture player above the mobile
  dock. **Return** restores the full player and **Close** ends it.
- YouTube watch progress now comes from the official IFrame Player API, saves
  every ten seconds, appears as a progress bar in Continue Watching and resumes
  from the saved point. Items at least 90% complete leave Continue Watching.
- Movies & TV accepts exact progress events from a configured authorised
  provider. When a cross-origin provider does not expose progress, Command
  Centre records a clearly labelled estimate of time watched instead. A
  **Mark watched** button lets you complete the item manually.
- YouTube Music no longer creates a second floating video iframe. One official
  YouTube embed remains the playback source while a compact artwork, title,
  progress, play/pause and skip module follows you while searching or scrolling
  inside Music. Leaving Music pauses YouTube; Audius remains the true audio-only
  and background-capable option.
- Music now publishes Media Session metadata, play/pause, previous/next, seek
  and progress state for supported lock-screen and headset controls.

## Background and closed-app behaviour

The native iOS wrapper is now version **1.3.0 (build 5)**. It enables the
playback audio session, iOS background audio mode and WKWebView Picture in
Picture. Rebuild and reinstall the native IPA for those capabilities.

- Switching to another app or locking the phone can keep compatible Audius
  audio playing while iOS keeps Command Centre alive.
- Compatible video providers can expose Apple's system Picture in Picture;
  the app also has its own mini-player while navigating inside Command Centre.
- YouTube is intentionally paused when Command Centre is backgrounded or when
  you leave Music, because YouTube API policy prohibits an app from providing
  background playback or separating the audio track.
- Swiping Command Centre away from the iOS app switcher is a force quit and
  ends playback. No web or native app can continue executing after iOS has
  terminated it.

## v10.10 deployment

For the website/PWA, replace:

    public/index.html

For background audio and system PiP in the installed native build, rebuild the
IPA from `native-ios/` and install version 1.3.0 (build 5). No Cloudflare
variable or D1 migration is required.

# v10.9 — Mobile playback, notes, dock and YouTube fixes

This release addresses the four mobile issues reported from the iPhone app:

- Movies & TV now has its own **Full screen** button. It first expands the
  complete player to the device viewport and also requests native browser full
  screen where supported, so it does not depend on the provider's small
  embedded control. A persistent **Close** control is included in the fallback.
- The note editor now sits above all app chrome, hides the mobile dock while
  open and keeps **Cancel** / **Save note** inside the visible safe area.
- The five-button mobile dock is kept in a dedicated fixed top layer without
  the transformed/contained layer that could drift while scrolling past live
  sports iframes.
- YouTube **For You** now combines up to two different personal signals with a
  discovery lane, mixes their results round-robin, excludes watched/hidden
  videos and caps repeated channels. Results remain cached for one hour to keep
  YouTube API quota bounded; a manual refresh rotates the personal signals.

## Deployment

Replace:

    public/index.html

No Cloudflare variable, D1 migration or native iOS rebuild is required.

# Command Centre background notifications

This package converts the existing Command Centre reminder notifications to real Web Push notifications delivered by the same Cloudflare Worker.

## Cloudflare setup
1. Create a D1 database named `command-centre-push`.
2. Run `migrations/0001_push.sql` against the production database.
3. Put the database ID into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`.
4. Generate VAPID keys: `npx @mmmike/web-push` does not generate them directly; use a tiny Node script importing `generateVapidKeys` from `@mmmike/web-push/vapid`, or use the package docs.
5. Add these Worker secrets in Cloudflare: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example `mailto:your-email@example.com`).
6. Change Cloudflare Builds > Build command to `npm install` (the Deploy command remains `npx wrangler deploy`).
7. Push to `main`. Cloudflare deploys the Worker.

## iPhone setup
Open the deployed site in Safari, use Share > Add to Home Screen, open the Home Screen app, then Settings > Mobile notifications > Enable. Tap Send test.

The app still keeps its existing local scheduler as a fallback. Background push is handled by the Worker and D1.


## Bible + EODHD update

- Added a Bible checklist for all 66 books and 1,189 chapters.
- Today's Reading now recommends unread chapters and lets you tick them off directly.
- Added EODHD as a portfolio provider for broader LSE + US coverage.

## Portfolio fallback update

The portfolio now automatically falls back between configured providers.

- LSE default fallback order: selected provider → EODHD → Twelve Data → Finnhub.
- US default fallback order: selected provider → Finnhub → Twelve Data → EODHD.
- Providers without API keys are skipped.
- Successful rows show the provider used and whether a fallback was necessary.
- Failed rows show the error returned by every attempted provider instead of only `0/x quotes`.

## News + financial news update

This version adds:
- a News tab with World Events and Financial News,
- world and financial headlines inside the Daily Briefing,
- optional background Web Push news alerts,
- `major`, `all`, and `off` notification modes,
- D1 caching and notification de-duplication.

### Required Cloudflare secret

Create a NewsData.io API key, then add it to the Worker as a secret:

`NEWSDATA_API_KEY`

Cloudflare path: Worker → Settings → Variables and Secrets → Add → Secret.

The Worker creates the news D1 tables automatically on first use. `migrations/0002_news.sql` is also included if you prefer to create them manually.

The existing cron can stay at every minute for reminders. News fetching only runs at minute 5 of each hour, so it does not call the news API every minute.

Important: NewsData.io's free plan is delayed (currently advertised as about 12 hours) and is therefore suitable for briefings/testing but not true real-time breaking-news alerts. A paid real-time news source can later be swapped into the same Worker endpoints without changing the app UI.

## Bible search, Alpha Vantage and settings redesign

- Bible search accepts a book name such as `John` or a book + chapter such as `Romans 8` / `Psalm 23`.
- Settings are divided into General, Notifications, Portfolio & Markets, News, and Integrations.
- Desktop/laptop uses horizontal tabs; mobile uses a compact section dropdown.
- Alpha Vantage financial News & Sentiment is available as a news source.
- Hybrid mode tries Alpha Vantage first and falls back to NewsData.io.

### New Cloudflare secret

Add:

`ALPHA_VANTAGE_API_KEY`

to Worker → Settings → Variables and Secrets as a Secret.

The Alpha Vantage key is deliberately not stored in the browser or GitHub.

## Horizontal settings navigation update

Settings now use a single horizontal scrolling tab bar on both mobile and desktop.
Swipe left/right on mobile or use the mouse/trackpad on laptop to move between:
General, Notifications, Portfolio, News, and Integrations.

The old mobile dropdown selector has been removed.

## Smarter market fallback update

- US holdings now prefer Finnhub, then Twelve Data, then EODHD.
- LSE holdings now prefer Twelve Data, then EODHD, then Finnhub.
- Selecting EODHD no longer forces it to be first; it stays a fallback to avoid cascading failures.
- If EODHD returns a connection/load/403 failure, it is temporarily skipped for 10 minutes.
- If Twelve Data returns HTTP 429, it is temporarily skipped for 10 minutes.
- Successful quotes are cached in the browser for 5 minutes.
- Portfolio status shows temporarily unavailable providers and cached/fallback usage.

## Scheduled morning briefing notifications

- Morning Briefing is enabled by default at 07:30.
- Change the time under Settings → Notifications.
- The background Worker checks each device's own timezone.
- The notification contains:
  - current temperature for the configured city,
  - number of reminders/calendar events scheduled for today,
  - the current unread Bible recommendation,
  - cached headline count when available.
- Tapping the notification opens the Daily Briefing page.
- A `Send briefing test` button is included in notification settings.
- The Worker creates the D1 table automatically. `migrations/0004_morning_briefing.sql` is included for reference/manual setup.

## Notification repair update

If the VAPID key pair is changed in Cloudflare, existing browser/iPhone push subscriptions are no longer valid for that key pair.

This update:
- compares the installed push subscription with the current Worker VAPID public key,
- automatically unsubscribes and creates a new subscription when the key changes,
- validates that the decoded VAPID public key is a 65-byte uncompressed P-256 key,
- adds **Repair push subscription** under Settings → Notifications,
- surfaces server registration/schedule errors instead of silently ignoring them.

After deploying this update, open the Home Screen PWA and tap:
Settings → Notifications → Repair push subscription → Send test.

## Clean rebuild

This version was rebuilt from the last known-good notification/settings build
rather than patching the broken Bible iterations.

Verified in this build:
- Settings button is present and bound to `openSettings`.
- Settings section navigation is present.
- Full Bible checklist renderer is present.
- Bible search is present.
- Three meaningful connected Bible reading ranges are present.
- `New 3` is present and bound.
- Notification repair code is retained.
- Morning briefing code is retained.
- News/financial-news integration is retained.
- Market fallback/cache logic is retained.
- Last open page is remembered after refresh.
- Startup widgets are isolated so one loading failure cannot stop all other sections.
- Inline JavaScript passes `node --check`.
- No duplicate HTML element IDs were found.

## Entertainment Hub

Added a new `🎮 Entertainment` tab while keeping the existing stable app structure.

### For You
- Mixed social-style feed using world news, financial news, the daily manga pick,
  daily trivia and authorised Reddit-proxy posts.
- Like and Hide controls are saved locally.
- Feed summaries are readable inside Command Centre.

### Games
- 2048 with persistent best score.
- Snake with keyboard and mobile arrow controls.
- Daily Trivia with current and best streaks.
- Reaction Test with persistent best reaction time.

### Community
- Displays r/trading212 and r/wallstreetbets post cards inside the app when the
  existing authorised Reddit proxy is configured.
- If no Reddit proxy is configured, the app clearly says so rather than showing
  fake live posts.

### Watch
- YouTube videos can be played inside the app by pasting a YouTube URL or video ID.
- Twitch streams can be played by entering a channel name.
- Recent YouTube videos and Twitch channels are stored locally.

This update only changes `public/index.html`. It does not require changes to
the Worker, D1, notifications, VAPID keys or API secrets.

## Entertainment interaction repair

The first Entertainment build contained the game/feed functions, but the
initialization block did not actually attach the Entertainment click handlers.
That is why the page appeared but `Games`, `Community`, `Watch`, and game
controls did nothing.

This repair adds:
- delegated Entertainment click handling,
- direct click fallbacks on the main tabs and game/watch controls,
- early binding during app startup,
- mobile swipe direction support for Snake,
- global fallbacks for the Entertainment control functions.

No Worker/backend changes are needed.

## Entertainment games + YouTube search update

### 2048
- Detects when there are no legal moves left.
- Shows `Game over` with the final score and a Play Again button.
- Detects reaching 2048 and lets you continue playing.

### Snake
- Rebuilt around `requestAnimationFrame`.
- Start / Pause / Resume / Restart states are explicit.
- Arrow buttons work directly on mobile.
- Keyboard arrow keys work while the Games panel is open.
- Swipe gestures on the canvas are retained.
- Game-over status is shown under the board.

### Wordle
- Added a five-letter daily Wordle-style game.
- Six guesses.
- Correct / present / absent letter feedback.
- On-screen keyboard and physical keyboard support.
- Daily win streak and best streak are stored locally.

### YouTube search
- Search YouTube from the Watch panel.
- Results display thumbnail, title and channel.
- Tap a result to play it in the embedded YouTube player.
- Search is proxied through the Cloudflare Worker so the API key is not exposed.
- Identical searches are cached for 15 minutes.

### Required Cloudflare secret for YouTube search

Create a Google Cloud API key with the YouTube Data API v3 enabled and add this
Worker secret:

`YOUTUBE_API_KEY`

Then deploy the updated `worker.js`.

This update requires replacing:
- `public/index.html`
- `worker.js`

## YouTube HTTP 500 diagnostic repair

The previous client only displayed `HTTP 500`, hiding the actual error message
returned by the Worker. This build now:

- displays Google's real YouTube API error message in the app;
- adds `Check YouTube API setup` in Entertainment → Watch;
- adds `/api/youtube/status`, which checks whether the deployed Worker can see
  `YOUTUBE_API_KEY` and whether Google accepts it;
- returns useful 400/403/503 responses instead of turning every problem into 500;
- makes YouTube search caching optional so a Cache API issue cannot break search.

Replace both:
- `public/index.html`
- `worker.js`

No D1, VAPID, notification, or service-worker changes are required.

## YouTube result click + Home launch fix

### YouTube
Search results now use delegated tap/click handling, which is more reliable for
dynamically-created elements in an iPhone Home Screen PWA. Each result also has
an explicit `Watch` button. Selecting a result loads the embedded player and
scrolls it into view.

### Startup
Normal app opens and browser refreshes now always start on Home. Normal tab
navigation is no longer stored in the URL/localStorage.

The existing `#briefing` link used by the scheduled morning briefing
notification is preserved, so tapping that notification can still open the
Briefing page intentionally.

This is a frontend-only update. Replace only `public/index.html`.

## Football Hub + System Status

### Football Hub
A new `⚽ Football` page now includes:
- Premier League, Champions League, La Liga, Bundesliga, Serie A and Ligue 1.
- Upcoming fixtures (roughly the next 14 days).
- Recent results (roughly the previous 7 days).
- Current league/group standings when the API exposes them.
- A favourite-team star. The chosen club is saved locally and its next/last
  match is highlighted in the favourite-team card.
- 15-minute Worker caching to reduce football-data.org API usage.

Football data is requested server-side so the key is not exposed in the browser.

Required Cloudflare Worker secret:

`FOOTBALL_DATA_API_KEY`

Register at football-data.org and use the API token they provide.

### System Status
A new `🩺 Status` page checks:
- Cloudflare Worker
- D1 database
- VAPID/Web Push configuration
- YouTube Data API
- Football Data API
- NewsData configuration
- Alpha Vantage configuration
- Service Worker
- browser notification permission
- current push subscription
- whether Twelve Data, Finnhub and EODHD keys are stored on this device

NewsData and Alpha Vantage are configuration-only checks so pressing Run Checks
does not unnecessarily consume those services' quota.

### Files to deploy
Replace:
- `public/index.html`
- `worker.js`

The included `wrangler.jsonc` is also updated with the working D1 ID and
`"keep_vars": true`, but if your live repo already has that corrected file you
do not need to replace it again.

## Football notifications

The Football Hub can now send real background Web Push notifications for the
selected favourite club.

Available alert types:
- 24 hours before kick-off
- 1 hour before kick-off
- at kick-off
- full-time result

The 24-hour, 1-hour and kick-off alerts are written into the existing D1
notification scheduler. The Worker refreshes favourite-team fixture schedules
every 15 minutes so fixture-time changes are picked up. Full-time results are
also checked on that cycle and deduplicated per device/match.

The Football page contains:
- On/Off control
- separate toggles for every alert type
- Save football alerts
- Send test

Tapping a football push opens `/#football`. Normal app launches still start on
Home.

Important fix included:
`/api/push/sync` now deletes/rebuilds only reminder/event notifications instead
of deleting every unsent notification. This prevents normal reminder syncing
from accidentally deleting football match alerts.

Tables are created automatically by the Worker. Migration
`migrations/0005_football_notifications.sql` is also included for reference.

Deploy:
- `public/index.html`
- `worker.js`

No new API key is required beyond the existing `FOOTBALL_DATA_API_KEY` and
working VAPID keys.

## YouTube Explore + WebRTC Mirror

Entertainment → Watch now has Trending, Gaming, Music, Sports and Live Explore categories, using the existing YouTube Data API key. Results stay inside the existing player.

A new Mirror page adds WebRTC sender/receiver pairing with a 6-digit code. On browsers that support getDisplayMedia, the sender can share a screen and the laptop can receive it. D1 is used only for short-lived signalling; video stays peer-to-peer.

The current iPhone Home Screen/PWA cannot capture the full iPhone display. A true iPhone full-screen sender requires a native iOS build using ScreenCaptureKit. This build provides the laptop receiver and signalling layer that a future native sender can reuse.

A public STUN server is used. Some restrictive networks may need TURN for reliable cross-network connections.

No third-party unlicensed sports-streaming API is connected in this build.

Deploy `public/index.html` and `worker.js`. No new API key is required.


## Native iOS ScreenCaptureKit + authorised live-content provider

### Native iPhone mirroring
`native-ios/` contains a native SwiftUI/WKWebView wrapper for the same Command Centre site. On iOS 27+, it uses ScreenCaptureKit's system content-sharing picker and `SCStream`, then sends captured video through native WebRTC to the existing browser receiver.

This means the native app still looks/behaves like Command Centre instead of becoming a separate unrelated UI.

### Configurable live-content API
The Football Hub now has a Live Football player compatible with the API shape supplied by the user:
- `GET /api/v1/streams?category=soccer`
- response `streams[]` with `name`, `league`, `stream_key`, `match_timestamp`, `embed_url`, and `thumbnail_url`.

No provider hostname is hardcoded. Configure Cloudflare:

`LIVE_CONTENT_API_BASE_URL` — the HTTPS base URL for your authorised provider.

Optional:
- `LIVE_CONTENT_API_KEY` — sent as a Bearer token if the provider requires it.
- `LIVE_CONTENT_ALLOWED_EMBED_HOSTS` — comma-separated allowed iframe hostnames when the provider serves embeds from a different hostname. If omitted, only the API base hostname is allowed.

The Worker proxies discovery metadata and only passes HTTPS embed URLs from allowed hosts. The iframe itself loads the authorised provider directly.

Deploy the web update with:
- `public/index.html`
- `worker.js`

The native iOS source folder does not affect Cloudflare deployment.


## iOS 26.6.1 native mirroring

The native sender now targets iOS 26.0 and uses a ReplayKit Broadcast Upload Extension. See `native-ios/README-NATIVE-IOS.md`.

## iOS 26 compile fix

This revision fixes likely Xcode 26/WebRTC compilation problems in the ReplayKit target:
- unwraps the optional RTCPeerConnection returned by the WebRTC factory
- initializes the WebRTC factory/video source/capturer without referencing partially initialized `self`
- uses explicit continuation types for the Objective-C WebRTC completion handlers
- compiles the project in Swift 5 language mode to avoid strict Swift 6 Sendable errors from the binary WebRTC framework
- adds `@preconcurrency import WebRTC`
- simplifies ReplayKit orientation extraction
- imports Combine for `ObservableObject`
- updates Codemagic to print exact compiler diagnostics if another error remains


## Signulous-friendly native IPA

This revision removes the iOS App Group requirement from native mirroring.

Native rendezvous channel:

    ccaed79701bb4d8d73ba508bd8005269

New Worker endpoint:

    /api/mirror/native-session

The native Command Centre publishes the active six-digit mirror code there for
10 minutes. The ReplayKit extension retrieves it when the broadcast starts.

Codemagic now has:

    iOS 26 Mirror - Unsigned IPA for Signulous

which performs an unsigned `iphoneos` Release build, verifies that the ReplayKit
`.appex` is embedded in the app bundle, and packages:

    build/CommandCentre-iOS26-UNSIGNED.ipa

The Worker creates the D1 table automatically. Migration
`migrations/0007_native_mirror_sessions.sql` is included as well.

Deployment:
- Replace `worker.js` in the Cloudflare/GitHub project.
- Replace the `native-ios/` folder.
- Replace root `codemagic.yaml`.
- `public/index.html` does not need another change for this revision.


## Signulous IPA v2 packaging fix

The previous Codemagic workflow produced a completely unsigned app bundle.
Some re-signing services are happier when the IPA already has a valid nested
code-signing structure, even if that signature is only ad-hoc.

The new workflow:

    iOS 26 Mirror - Signulous IPA v2

does the following:

1. builds the real `iphoneos` Release product with Apple signing disabled;
2. confirms the ReplayKit `.appex` is embedded in `Payload/<app>.app/PlugIns/`;
3. removes stale `_CodeSignature` folders and provisioning profiles;
4. ad-hoc signs nested frameworks/dylibs;
5. ad-hoc signs the ReplayKit `.appex`;
6. ad-hoc signs the containing `.app` last;
7. verifies the whole code tree with `codesign --verify --deep --strict`;
8. packages the IPA with `ditto` to preserve executable permissions/metadata;
9. runs `unzip -t` to verify the ZIP/IPA is not corrupt;
10. publishes `ipa-structure-report.txt` alongside the IPA.

The output file is:

    build/CommandCentre-iOS26-SIGNULOUS.ipa

When uploading to Signulous, do not intentionally change the bundle identifier
or strip extensions on the first attempt. The Broadcast Upload Extension needs
to remain embedded for full iPhone screen mirroring.


## Signulous v3 IPA structure fix

Inspection of the actual Codemagic IPA found a concrete bundle metadata problem:

- the containing app had no `CFBundleVersion`;
- the containing app had no `CFBundleShortVersionString`;
- the ReplayKit extension used build `1` / version `1.0`;
- Xcode explicitly warned that the extension build version must match its containing app;
- the extension Info.plist also lacked `CFBundleExecutable`.

This revision sets both app and extension to version `1.0.0` build `1`, adds the extension executable key, and makes Codemagic fail before packaging if the versions do not match.


## Mirror v4 — rotation, audio, fullscreen and desktop-app reconnect

This revision adds four mirror improvements:

- Landscape orientation mapping is corrected for ReplayKit → WebRTC.
- iPhone app/system audio is forwarded alongside the screen using a low-latency
  WebRTC data channel. The laptop receiver plays it through Web Audio.
- The laptop receiver has a `Full screen` button and also supports double-click
  on the remote video.
- The receiver now sends an explicit `ready` handshake, retries while waiting,
  queues ICE candidates until a remote description exists, and requests a new
  handshake after disconnect/failure. This is intended to fix the installed
  desktop PWA sitting indefinitely on "connecting".

The Worker signal endpoint now accepts one additional signalling message type:

    ready

No new D1 migration or Cloudflare secret is required.

Native version:

    1.1.0 (build 2)

Codemagic workflow:

    iOS 26 Mirror - Audio Fullscreen v4

Codemagic artifact:

    CommandCentre-iOS26-MIRROR-v4.ipa

After Codemagic succeeds, sign that IPA with the same Signulous route used for
the working v3 build.

Audio note:
- This build forwards ReplayKit `.audioApp` (the mirrored app/system sound).
- Microphone audio is intentionally not mixed in yet.
- Audio uses mono Float32 PCM over an unreliable WebRTC data channel. This is
  chosen so ReplayKit's CMSampleBuffer audio can be forwarded without requiring
  a custom WebRTC audio-device build.


## v5 — News notifications open the publisher

A notification destination bug was fixed.

The push sender stored the destination as:

    data.url

but the service worker previously read:

    url

That caused the service worker to fall back to `/`, so tapping a news
notification opened Command Centre instead of the article.

v5:
- reads both `payload.url` and `payload.data.url`;
- writes both forms from the Worker for compatibility;
- opens cross-origin news links directly instead of focusing an existing
  Command Centre window;
- keeps same-origin notification links such as `/#briefing` and `/#football`
  opening inside Command Centre;
- calls `skipWaiting()` and `clients.claim()` so the updated notification
  service worker can take over sooner.

Only these runtime files need deploying:

    public/sw.js
    worker.js

No D1 migration, new secret, native iOS rebuild, Codemagic build or Signulous
re-sign is required for this particular fix.


## v4.1 Codemagic packaging fix

The uploaded Codemagic log showed:

    BUILD SUCCEEDED

but Xcode also warned:

    The CFBundleVersion of an app extension ('1') must match that of its
    containing parent app ('2').

That mismatch causes the later IPA preparation/version-consistency check to
stop before the IPA artifact is produced.

v4.1 fixes the source extension Info.plist so it always inherits:

    CFBundleShortVersionString = $(MARKETING_VERSION)
    CFBundleVersion = $(CURRENT_PROJECT_VERSION)

Both app and extension are currently:

    Version 1.1.0
    Build 2

The Codemagic workflow now also repairs those two placeholders before XcodeGen,
so a stale extension plist cannot silently recreate this mismatch.

Run:

    iOS 26 Mirror - Audio Fullscreen v4.1

The expected IPA artifact remains:

    CommandCentre-iOS26-MIRROR-v4.ipa


## v4.2 Codemagic startup fix

The v4.1 workflow failed before XcodeGen because the Python helper used a
single-quoted heredoc. That meant `$CM_BUILD_DIR` was passed to Python literally
instead of being expanded to Codemagic's checkout directory.

The helper was unnecessary because the source `Info.plist` already correctly
uses:

    $(MARKETING_VERSION)
    $(CURRENT_PROJECT_VERSION)

and `project.yml` already sets both the app and ReplayKit extension to:

    Version 1.1.0
    Build 2

v4.2 removes the broken helper step completely.

Run:

    iOS 26 Mirror - Audio Fullscreen v4.2

The expected artifact remains:

    CommandCentre-iOS26-MIRROR-v4.ipa


## v4.3 — ReplayKit audio fix

The laptop screenshot showed:

    Audio channel connected — waiting for sound.

That confirms the WebRTC data channel itself was working. The missing part was
PCM extraction inside the ReplayKit extension.

The earlier implementation copied the sample buffer into an AVAudioPCMBuffer
and then asked for typed channel pointers. ReplayKit commonly supplies
interleaved signed 16-bit stereo PCM. With an interleaved AVAudioPCMBuffer,
that typed-channel route can fail or expose no usable per-channel pointer, so
the code silently returned without sending any audio packets.

v4.3 reads ReplayKit's original AudioBufferList directly using
`CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer`, supports the common
interleaved Int16 stereo format plus Float32/Int32 linear PCM, downmixes it to
mono, and sends it over the already-working WebRTC data channel.

The browser receiver now also shows native audio diagnostics:
- iPhone audio source detected
- iPhone audio packets are flowing
- or a concrete capture/format error

A manual `Enable audio` button was also added in case a browser/PWA blocks Web
Audio until a user gesture.

Native version:

    1.1.1
    Build 3

Codemagic workflow:

    iOS 26 Mirror - Audio Fix v4.3

Expected IPA:

    CommandCentre-iOS26-MIRROR-v4.3.ipa


# Movies & TV authorised-provider integration

A new **Entertainment → Watch → Movies & TV** card has been added.

It follows the route framework shown in the supplied reference screenshots but
does **not** hard-code the reference site's hostname. The provider is entirely
configuration-driven, like the existing Live Football integration.

Supported route shapes by default:

    Movie, primary:
    {MEDIA_EMBED_BASE_URL}/embed?type=movie&id={tmdbId}

    TV, primary:
    {MEDIA_EMBED_BASE_URL}/embed?type=tv&id={tmdbId}&season={season}&episode={episode}

    Movie, alternate:
    {MEDIA_EMBED_BASE_URL}/embed/torrent?type=movie&id={tmdbId}

    TV, alternate:
    {MEDIA_EMBED_BASE_URL}/embed/torrent?type=tv&id={tmdbId}&season={season}&episode={episode}

    Movie, aggregator:
    {MEDIA_EMBED_BASE_URL}/embed/agg?type=movie&id={tmdbId}

    TV, aggregator:
    {MEDIA_EMBED_BASE_URL}/embed/agg?type=tv&id={tmdbId}&season={season}&episode={episode}

The route paths can be overridden if the authorised provider uses the same
parameter framework but slightly different paths.

## Cloudflare variables

Add these in:

    Cloudflare
    → Workers & Pages
    → bcommand-center
    → Settings
    → Variables and Secrets

Required:

    TMDB_API_KEY
        Type: Secret
        Value: your TMDB v3 API key

    MEDIA_EMBED_BASE_URL
        Type: Text
        Example placeholder:
        https://media-provider.example

Recommended:

    MEDIA_EMBED_ALLOWED_HOSTS
        Type: Text
        Example placeholder:
        media-provider.example

Optional route overrides:

    MEDIA_EMBED_PATH_STANDARD
        Type: Text
        Default: /embed

    MEDIA_EMBED_PATH_TORRENT
        Type: Text
        Default: /embed/torrent

    MEDIA_EMBED_PATH_AGG
        Type: Text
        Default: /embed/agg

Only put a provider in these variables if you are authorised to use and embed
its streams.

## What the implementation does

1. The browser sends movie/TV searches to `/api/media/search`.
2. The Worker calls TMDB using the secret `TMDB_API_KEY`, so the key never goes
   into public/index.html.
3. Search results return TMDB IDs, posters, year and media type.
4. Selecting a TV show loads its seasons and episodes from TMDB.
5. When Play is pressed, `/api/media/embed-url` validates the TMDB ID,
   media type, season/episode and chosen provider route.
6. The Worker constructs the provider URL using `MEDIA_EMBED_BASE_URL`.
7. The hostname is checked against `MEDIA_EMBED_ALLOWED_HOSTS`.
8. The authorised provider is loaded inside the Command Centre iframe.

The player also has **Open provider** in case a provider intentionally blocks
iframe embedding.

## Files changed

    public/index.html
    worker.js

No D1 migration is needed.
No native iOS rebuild is needed for the Movies & TV feature itself because the
native Command Centre wrapper displays the same hosted web interface.


## v6.1 — One-tap Watch navigation

The Watch area is now much easier to reach on mobile.

Added:
- A dedicated `🎬 Watch` item in the main sidebar.
- A `🎬` Watch shortcut in the sticky top bar.
- A floating `🎬 Watch` button at the bottom-right on phones.
- All three shortcuts go directly to `Entertainment → Watch`; they do not stop
  on the Entertainment "For You" page first.
- Sidebar highlighting follows the current Entertainment/Watch section.

Only:

    public/index.html

needs to be replaced for this update.

No Worker change, Cloudflare variable, D1 migration, Codemagic build, IPA rebuild
or Signulous signing is required.


## v6.2 — Split Watch into separate sections

The Watch screen no longer places YouTube, Movies & TV, and Twitch in one long
vertical page.

Watch now has its own sub-navigation:

    ▶️ YouTube
    🎬 Movies & TV
    🟣 Twitch

Only one Watch section is displayed at a time.

On mobile this means:
- tapping `🎬 Watch` still opens Watch directly;
- Movies & TV opens as the default the first time;
- after that, Command Centre remembers the last Watch section you used;
- switching between YouTube and Movies & TV is one tap instead of a long scroll;
- YouTube Explore is only loaded when the YouTube Watch tab is selected.

Only:

    public/index.html

needs replacing for this update.

No Worker change, D1 migration, Cloudflare variable, Codemagic build, IPA rebuild,
or Signulous re-sign is required.


## v6.3 — Twitch removed

Twitch has been removed from Watch completely.

Watch now contains only:

    ▶️ YouTube
    🎬 Movies & TV

Only:

    public/index.html

needs replacing.

No Worker change, D1 migration, Cloudflare variable, Codemagic build, IPA rebuild,
or Signulous re-sign is required.


## v6.4 — Scrollable menu

The main menu/sidebar is now vertically scrollable.

This fixes the problem where the growing number of menu items could extend
beyond the visible phone screen.

Changes:
- The menu list scrolls independently.
- The menu is capped to the visible device height with `100dvh`.
- Momentum scrolling is enabled on iPhone.
- Safe-area spacing is added at the bottom on mobile.
- The menu header remains available while the menu items scroll.
- A small scrollbar is shown where supported.

Only:

    public/index.html

needs replacing.

No Worker change, D1 migration, Cloudflare variable, Codemagic build, IPA rebuild,
or Signulous re-sign is required.


# v7 — iOS-inspired navigation + Movies & TV Explore

This update is based on the supplied mobile-dashboard references: cleaner
spacing, softer glass cards, prominent content shortcuts and a persistent
mobile bottom dock.

## Main navigation changes

On mobile there is now a bottom dock with:

    Home
    Calendar
    Watch
    Notes
    More

`More` opens the existing scrollable full menu, so none of the existing pages
are removed.

The old floating Watch pill is hidden on mobile because Watch now has a
permanent place in the bottom dock.

## Entertainment changes

The Entertainment navigation order is now:

    For You
    Watch
    Games
    Community

At the very top of For You, before recommendations, there are two large content
shortcuts:

    YouTube
    Movies & TV

They go directly to the selected Watch service.

## Movies & TV Explore

Movies & TV is no longer primarily a search form. It now has three internal
views:

    Explore
    Search
    Player

Explore is the default and contains:

    Trending
    Movies
    TV
    New
    Top rated

The Explore data comes from TMDB through the Cloudflare Worker. Selecting any
title automatically opens the Player view.

The existing authorised provider integration is unchanged. The actual provider
hostname still comes from:

    MEDIA_EMBED_BASE_URL

and is still checked against:

    MEDIA_EMBED_ALLOWED_HOSTS

## Files to replace

    public/index.html
    worker.js

`README-SETUP.md` is optional.

No D1 migration is required.
No Codemagic build is required.
No IPA rebuild is required.
No Signulous re-sign is required.

Because `worker.js` changes, wait for the Cloudflare deployment to finish before
testing Movies & TV Explore.


# v7.1 — Seamless mobile YouTube and Movies/TV layout

This update removes the sideways page movement in the Watch area.

On phones:

- YouTube Explore videos are full-width cards.
- YouTube search results put the full 16:9 thumbnail above the title instead of
  squeezing it beside text.
- Movies & TV poster rows become a responsive two-column grid rather than a
  horizontally scrolling rail.
- Very narrow phones switch Movies & TV to one poster per row.
- Watch tabs, YouTube categories, Movies/TV categories, and Movies/TV
  Explore/Search/Player controls wrap or fit inside the screen.
- The overall page is prevented from overflowing horizontally.
- Iframes and thumbnails are capped to the viewport width.

Only:

    public/index.html

needs replacing.

No worker.js change is required.
No Cloudflare variable changes are required.
No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v7.2 — YouTube search moved to the top

The YouTube Watch page now starts with the search bar.

Order on the page:

    YouTube heading
    Search bar
    Search results
    Explore categories
    Recommended / trending videos
    Player
    Recent videos

This means on mobile the user can search immediately without scrolling through
recommended videos first.

Only:

    public/index.html

needs replacing.

No worker.js change is needed.
No Cloudflare variables, Codemagic build, IPA rebuild, or Signulous re-sign is
required.


# v8 — Productivity Suite

This update adds the requested productivity/navigation features.

## Universal Search
Use the new top-bar search icon or press `/` on a keyboard. Search covers:
- Command Centre pages
- Notes
- Reminders
- Calendar events
- Movies & TV through TMDB
- YouTube

## Customisable Home Dashboard
Home is split into modules that can be shown/hidden and reordered:
- Today
- Continue Watching
- My Words
- Reading & Manga
- Portfolio & Weather
- Reminders
- Assistant

Open `Home → Customize` or `Settings → Home`.

## Continue Watching
Recent YouTube videos, movies and TV shows are saved locally and shown on:
- Home
- Today
- Movies & TV Explore

For TV, the selected season and episode are remembered.

## Better Movies & TV Explore
Explore now includes:
- Continue Watching
- "Because you watched…" recommendations from TMDB

The recommendation endpoint is:
`/api/media/recommendations`

It uses the existing `TMDB_API_KEY`; no new key is needed.

## Global Quick Add
A persistent `+` button lets you create:
- Reminder
- Calendar event
- Note
- or jump to Today

## Apple-like Notes
Notes now support:
- Folders
- Pinned notes
- Recently Deleted
- Restore
- Permanent delete
- Folder navigation
- A list/checklist toolbar button
- Search across title/body/folder

## Unified Today Page
Today is now a first-class page in the sidebar and mobile bottom dock. It shows:
- Events and reminders due today
- Next timed item
- Continue Watching
- Recent Notes
- Quick Add

The mobile dock is now:
`Home · Today · Watch · Notes · More`

## Settings Cleanup
Settings are grouped into:
- General
- Home
- Notifications
- Content
- Markets
- News
- Integrations

Content settings include a default Watch service and a Continue Watching reset.

## Files to replace
Required:
- `public/index.html`
- `worker.js`

Optional:
- `README-SETUP.md`

No D1 migration is required.
No Codemagic build is required.
No IPA rebuild or Signulous re-sign is required.

Wait for Cloudflare to finish deploying both the frontend and Worker before
testing Universal Search media results or Movies & TV recommendations.


# v8.1 — Expanded Football Hub

## More competitions

The Football Hub now includes:

Top European leagues:
- Premier League
- La Liga
- Bundesliga
- Serie A
- Ligue 1
- Eredivisie
- Primeira Liga

England:
- Premier League
- Championship
- League One
- League Two
- National League

Cups:
- Champions League
- Europa League
- Conference League
- FA Cup
- League Cup

This means the UI has a National League option so clubs such as Boreham Wood
can be selected when the connected football-data.org API subscription provides
access to that competition.

## Multiple favourite teams

The star beside a club is now a toggle rather than a single-choice favourite.

You can favourite multiple clubs from different competitions. The Favourite
Teams card shows all selected clubs, and each can be removed individually.

The old single-favourite state is migrated automatically to the new favourites
array, so an existing favourite is not lost.

## Notifications for every favourite

The same notification switches now apply to all favourites:
- 24 hours before
- 1 hour before
- kick-off
- full-time

Cloudflare/D1 now stores the selected teams in a new automatically-created
table:

    football_notification_teams

No manual D1 migration is required. The Worker creates the table and migrates
the previous single favourite automatically.

If two favourite clubs play each other, match notification IDs are de-duplicated
by device + match + alert type so you do not get two copies of the same alert.

## Lower-league access

The app code supports Championship, League One, League Two and National League,
but football-data.org controls which competitions are available to a particular
API subscription. If a lower league returns HTTP 403, the app now explains that
the competition may require a different football-data.org access tier.

## Files to replace

    public/index.html
    worker.js

No native IPA / Codemagic / Signulous rebuild is required.


# v8.2 — iPhone-style App Launcher

This update keeps the existing Home dashboard as page 1, then adds a second
swipeable Home page styled like an iPhone home screen.

## What changed

- Home now has two horizontal panels:
  - Dashboard (your existing Home)
  - Launcher (a new iPhone-style app page)
- Swipe sideways on Home, or use the small arrows/dots, to move between them.
- The new Launcher page includes:
  - a Today widget
  - a Weather widget
  - Entertainment shortcuts for YouTube and Movies & TV
  - a Briefing widget
  - a Quick Actions widget
  - app-style icons for Today, Entertainment, Mirror, Sport, Weather,
    Calendar, Notes, News, Bible, Briefing and Status Check
  - a small bottom dock for the fastest shortcuts
- Tapping one of those launcher icons opens the normal tab/page that already
  exists in the app.
- Football is relabelled in the UI as **Sport** so the section can grow later.
- Status is relabelled as **Status Check**.
- Universal Search now also shows Entertainment, Mirror, Sport and Status Check.

## Files to replace

    public/index.html

worker.js does not need changing for this visual/navigation update.


# v8.3 — Full-screen tethered Home

Home now behaves much more like a real iPhone home screen.

- Home is locked to the visible phone viewport (`100dvh`).
- The normal Command Centre top bar is hidden while Home is open.
- The normal mobile dock and floating Quick Add button are hidden on Home.
- The Launcher page is anchored to one screen and does not vertically scroll.
- Widgets, app icons and the launcher dock automatically compress to fit shorter
  iPhones.
- Horizontal swiping between Dashboard and Launcher remains enabled.
- When an app icon is tapped, the existing normal Command Centre page opens with
  the usual navigation again.
- Returning to Home restores the full-screen home experience.

The existing Dashboard panel is preserved. Because it contains substantially
more information than one phone screen, it has its own internal vertical scroll
area; the actual Launcher panel does not require vertical scrolling.

Only:

    public/index.html

needs replacing.

No Worker, D1, Cloudflare variable, Codemagic, IPA, or Signulous change is needed.


# v8.4 — Live sports `sources[]` compatibility

The live-content Worker now supports both of these authorised-provider response
formats:

    {
      "embed_url": "https://player.example/..."
    }

and:

    {
      "sources": [
        "https://player.example/...",
        "https://backup-player.example/..."
      ]
    }

It also tolerates source objects such as:

    {
      "sources": [
        {"url":"https://player.example/..."}
      ]
    }

For security, the Worker still accepts only HTTPS player URLs whose hostname is
listed in:

    LIVE_CONTENT_ALLOWED_EMBED_HOSTS

Multiple allowed hosts are comma-separated:

    player.example.com,backup-player.example.com

The Worker selects the first allowed source as `embed_url`, which means the
existing Sport / Football player UI does not need to change.

The diagnostic response now also includes:

    providerCount
    rejectedCount

Example:

    {
      "count": 5,
      "providerCount": 6,
      "rejectedCount": 1
    }

`rejectedCount` normally means that a returned stream had no player source, or
none of its player hostnames were in the allowed-host list.

Only:

    worker.js

needs replacing for this update.

No D1 migration, Codemagic build, IPA rebuild, or Signulous re-sign is required.


# v8.5 — Live stream allowlist diagnostics

The live-content endpoint now explains *why* provider streams are rejected.

A response can now include:

    configuredAllowedHosts
    rejectedHosts
    diagnostic

Example with a fictional authorised provider:

    {
      "count": 0,
      "providerCount": 6,
      "rejectedCount": 6,
      "configuredAllowedHosts": [
        "api.example-provider.com"
      ],
      "rejectedHosts": [
        "player.example-provider.com"
      ],
      "diagnostic":
        "The provider returned streams, but none of their HTTPS player hosts matched LIVE_CONTENT_ALLOWED_EMBED_HOSTS."
    }

That would mean:

    LIVE_CONTENT_API_BASE_URL
    = https://api.example-provider.com

but the actual embedded player is hosted at:

    player.example-provider.com

so the legal provider's player hostname would need to be explicitly included in
`LIVE_CONTENT_ALLOWED_EMBED_HOSTS`.

The endpoint reports hostnames only, not rejected player URLs.

Only:

    worker.js

needs replacing.

No D1 migration, Codemagic build, IPA rebuild, or Signulous re-sign is required.


# v8.6 — Authorised provider scraping + source switching

This release adds a generic authorised-content integration. It is designed for
providers you are permitted to access and embed.

## Existing API mode

The old setup still works. If you do nothing, the default mode is:

    LIVE_CONTENT_PROVIDER_MODE = api

You may keep:

    LIVE_CONTENT_API_BASE_URL = https://api.provider.example

or use the new generic name:

    LIVE_CONTENT_BASE_URL = https://api.provider.example

Optional:

    LIVE_CONTENT_API_PATH = /api/v1/streams

The API may return either `embed_url` or `sources[]`.

## Authorised HTML/page mode

For a provider where the event pages contain iframe/video/source links, set:

    LIVE_CONTENT_PROVIDER_MODE = scrape
    LIVE_CONTENT_BASE_URL = https://authorised-provider.example
    LIVE_CONTENT_SCRAPE_PATH = /sports/{category}
    LIVE_CONTENT_ALLOWED_PAGE_HOSTS = authorised-provider.example
    LIVE_CONTENT_ALLOWED_EMBED_HOSTS = player.authorised-provider.example

`{category}` becomes `soccer` when the Sport page loads football.

If the provider's events are all linked from the home page, use:

    LIVE_CONTENT_SCRAPE_PATH = /

The Worker looks for event-page links whose URL contains common words such as:

    soccer
    football
    match
    game
    event
    watch
    stream
    live
    sport

If the authorised provider uses different URL wording, override it with:

    LIVE_CONTENT_LINK_HINTS = fixture,channel,programme

Comma-separated values are supported.

Optional safety/performance setting:

    LIVE_CONTENT_MAX_SCRAPE_PAGES = 12

The maximum accepted value is 24.

## Allowed page hosts vs allowed player hosts

These are deliberately separate.

Example:

    LIVE_CONTENT_BASE_URL
    = https://www.provider.example

    LIVE_CONTENT_ALLOWED_PAGE_HOSTS
    = www.provider.example

    LIVE_CONTENT_ALLOWED_EMBED_HOSTS
    = player1.provider.example,player2.provider.example

The Worker only fetches event pages from `LIVE_CONTENT_ALLOWED_PAGE_HOSTS`.
It only returns player URLs from `LIVE_CONTENT_ALLOWED_EMBED_HOSTS`.

## Multiple sources in Sport

When one event returns multiple authorised player URLs, the Worker now returns
all of them:

    "sources": [
      {"label":"Source 1","url":"https://player1.provider.example/..."},
      {"label":"Source 2","url":"https://player2.provider.example/..."}
    ]

The Sport player automatically shows:

    Source 1   Source 2   Source 3

Tapping a source changes the iframe without leaving the Sport page.

## Files to replace

For v8.6 replace:

    worker.js
    public/index.html

No D1 migration is required.
No Codemagic build is required.
No IPA rebuild or Signulous re-sign is required for the hosted web app changes.


# v8.7 — Two live Sport providers + in-app provider switch

The Sport page can now keep two providers configured at the same time.

A provider selector appears above the live-match cards:

    Provider 1   Provider 2

Tapping a provider reloads live matches from that provider. The selected
provider is remembered on that device.

Inside an individual match, the existing source switch still works:

    Source 1   Source 2   Source 3

So there are now two levels:

    Provider switch
        ↓
    Match
        ↓
    Source switch

## Recommended new Cloudflare variables

### Provider 1 — API provider

    LIVE_PROVIDER_1_NAME=Original Provider
    LIVE_PROVIDER_1_MODE=api
    LIVE_PROVIDER_1_BASE_URL=https://api.authorised-provider.example
    LIVE_PROVIDER_1_API_PATH=/api/v1/streams
    LIVE_PROVIDER_1_ALLOWED_EMBED_HOSTS=player.authorised-provider.example

Optional secret:

    LIVE_PROVIDER_1_API_KEY=...

Provider 1 also falls back to the old `LIVE_CONTENT_API_BASE_URL`, so an
existing original API provider can remain available during migration.

### Provider 2 — authorised page/scrape provider

    LIVE_PROVIDER_2_NAME=Second Provider
    LIVE_PROVIDER_2_MODE=scrape
    LIVE_PROVIDER_2_BASE_URL=https://www.authorised-provider.example
    LIVE_PROVIDER_2_SCRAPE_PATH=/streams
    LIVE_PROVIDER_2_ALLOWED_PAGE_HOSTS=authorised-provider.example,www.authorised-provider.example
    LIVE_PROVIDER_2_ALLOWED_EMBED_HOSTS=player.authorised-provider.example
    LIVE_PROVIDER_2_LINK_HINTS=football,soccer,match,stream,live
    LIVE_PROVIDER_2_MAX_SCRAPE_PAGES=12

Optional secret:

    LIVE_PROVIDER_2_API_KEY=...

Provider 2 also falls back to the v8.6 variables:
`LIVE_CONTENT_BASE_URL`, `LIVE_CONTENT_PROVIDER_MODE`,
`LIVE_CONTENT_SCRAPE_PATH`, `LIVE_CONTENT_ALLOWED_PAGE_HOSTS`,
`LIVE_CONTENT_ALLOWED_EMBED_HOSTS`, `LIVE_CONTENT_LINK_HINTS`, and
`LIVE_CONTENT_MAX_SCRAPE_PAGES`.

## API endpoints

List configured providers:

    /api/live-content/providers

Load Provider 1:

    /api/live-content?category=soccer&provider=1&refresh=1

Load Provider 2:

    /api/live-content?category=soccer&provider=2&refresh=1

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.
No Codemagic build is required.
No IPA rebuild or Signulous re-sign is required.


# v8.8 — Settings icon on Home launcher

The iPhone-style Home launcher now includes a twelfth app icon:

    ⚙️ Settings

It fills the final slot in the existing 4 × 3 app grid, so the launcher stays
balanced and full-screen.

Tapping Settings opens the existing Command Centre Settings modal directly.
Nothing about the existing Settings screen or saved settings has been changed.

Only:

    public/index.html

needs replacing.

No Worker, D1, Cloudflare variable, Codemagic, IPA, or Signulous change is
required.


# v8.9 — Notes mobile width fix

The Notes screen has been tightened to fit the iPhone viewport in the same way
the YouTube mobile layout was previously corrected.

Changes:
- Notes can no longer force the page wider than the phone screen.
- Note cards are locked to 100% of the available width.
- Long note titles and previews truncate instead of stretching the layout.
- Folder names truncate safely when very long.
- The folder/navigation row scrolls inside its own strip rather than widening
  the whole page.
- Recent Notes on Today are also width-contained.
- Extra compression is applied on narrow iPhones.

Only:

    public/index.html

needs replacing.

No Worker, Cloudflare variable, D1, Codemagic, IPA, or Signulous change is
required.


# v9.0 — Mobile Customize / Settings repair

The Home "Customize" screen and Settings modal have been rebuilt for the phone
viewport.

Fixes:
- Settings uses the full iPhone screen instead of appearing cut in half.
- The settings content gets its own proper vertical scroll area.
- Save / Cancel stay below the content and no longer cover module controls.
- Home module rows cannot stretch wider than the phone.
- On mobile, each Home module's ↑ / ↓ controls move onto a second row so they
  remain fully visible and tappable.
- Long module names wrap instead of pushing controls off-screen.
- Settings category tabs remain horizontally scrollable without widening the
  page.
- Home floating controls are hidden while Settings is open so they cannot sit
  on top of the Customize screen.
- Safe-area padding is respected on iPhone.

Only:

    public/index.html

needs replacing.

No Worker, Cloudflare variable, D1, Codemagic, IPA, or Signulous change is
required.


# v9.1 — Settings Home overlap fix

The Settings layout has been separated into two fixed areas:

    Settings tabs
    ----------------
    Active settings panel

The Home customise panel can no longer sit on top of, cover, or block the other
Settings category buttons.

Changes:
- Settings tabs are now in their own fixed row.
- Only the active settings panel is rendered.
- General / Home / Notifications / Content / Markets / News / Integrations
  cannot overlap one another.
- The active panel gets its own vertical scrolling area.
- Opening Home no longer covers the remaining Settings options.
- Switching categories resets the content area to the top.
- The Home module list still keeps the mobile width/reorder fixes from v9.0.

Only:

    public/index.html

needs replacing.

No Worker, Cloudflare variable, D1, Codemagic, IPA, or Signulous change is
required.


# v9.2 — Focused finance news + Tennis/Basketball + football 429 protection

## Financial news
Financial News is now deliberately strict. It prioritises:
- stocks / shares / major indices
- bonds and yields
- interest rates and central banks
- inflation, GDP, recession and employment data
- earnings, revenue, profit warnings and dividends
- IPOs, mergers and takeovers
- currencies, commodities and major crypto market moves

Broad entertainment, celebrity, sport and unrelated general stories are filtered
out rather than being used as filler.

The old financial cache key was versioned so previously cached broad stories are
not reused.

## Sport Hub
Sport now has three tabs:

    Football
    Tennis
    Basketball

Tennis and Basketball use TheSportsDB through the Cloudflare Worker.

The public/free TheSportsDB key is used by default. If you have your own key,
optionally add:

    SPORTSDB_API_KEY=YOUR_KEY

You can star tennis players or basketball teams. They are stored locally on the
device and their events are prioritised in the lists.

## Football HTTP 429
football-data.org's free plan is request limited, so v9.2 reduces unnecessary
requests:

- changing competition no longer forces a fresh upstream API request
- competition data is cached for 15 minutes
- repeated manual Refresh taps inside 60 seconds reuse the recent response
- if football-data.org returns 429 and a cached response exists, the app shows
  the cached response instead of breaking
- the app now displays the actual Worker error message instead of only "HTTP 429"

League One remains available as EL1. A 403 is still possible when a competition
is outside the access tier of the configured football-data.org key.

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.

No native IPA / Codemagic / Signulous change is required for these hosted app
changes.


# v9.3 — Automatic football provider fallback

Football now uses two data providers automatically while keeping one Competition
selector in the app.

Primary provider:

    football-data.org

Fallback provider:

    API-Football / API-SPORTS

The user never needs to switch football providers manually. For example:

    League One selected
        ↓
    Command Centre recognises it is outside the normal football-data.org key coverage
        ↓
    API-Football is used automatically
        ↓
    Standings + fixtures + results render in the existing Football UI

If football-data.org unexpectedly returns HTTP 403 for another mapped competition,
Command Centre also tries API-Football automatically.

## Cloudflare secret required

Create an API-Football / API-SPORTS key and add it to the Production Worker as:

    API_FOOTBALL_KEY=YOUR_API_FOOTBALL_KEY

Make this a Secret, not ordinary public text.

The existing variable stays in place:

    FOOTBALL_DATA_API_KEY=YOUR_EXISTING_KEY

Do not remove it. The app uses it for competitions already covered by your
football-data.org account.

## Competitions supported by the fallback mapping

- Premier League
- La Liga
- Bundesliga
- Serie A
- Ligue 1
- Eredivisie
- Primeira Liga
- Championship
- League One
- League Two
- National League
- Champions League
- Europa League
- Conference League
- FA Cup
- League Cup

## Request protection

- Football responses remain cached for 15 minutes.
- Repeated manual refreshes inside 60 seconds reuse the recent response.
- Known restricted competitions go directly to API-Football when the fallback key
  exists, avoiding a wasted football-data.org 403 request.
- If a provider rate-limits and cached data exists, the cached result is shown.

## Favourite-team notifications

API-Football team IDs are namespaced internally, so clubs selected from fallback
competitions can continue to use the existing football favourite/notification
system without a D1 schema change.

## Files to replace

    worker.js

No change to public/index.html is required from v9.2.
No D1 migration is required.
No Codemagic, IPA, or Signulous rebuild is required.


# v9.4 — Real live Tennis + Basketball data

The Tennis and Basketball tabs no longer depend primarily on the limited
TheSportsDB free daily-event feed.

## Basketball

Primary provider:

    API-Basketball (API-SPORTS)

The Worker requests:
- yesterday's games for recent results
- today's games for scheduled/live/final scores
- tomorrow's games for upcoming fixtures

The app shows a dedicated "Live now" section and the current score/status.

The Worker first looks for:

    API_BASKETBALL_KEY

If that is not set, it reuses:

    API_FOOTBALL_KEY

because both are API-SPORTS dashboard keys. Basketball access still needs to
be enabled for the key/account in API-SPORTS.

## Tennis

Primary provider:

    API-Tennis

Add this Cloudflare secret:

    API_TENNIS_KEY=YOUR_API_TENNIS_KEY

The Worker requests:
- get_fixtures for yesterday through the next two days
- get_livescore for matches currently in play

The Sport page shows:
- live tennis matches
- player names
- tournament/event type
- live/final score when returned by the provider
- upcoming fixtures
- recent results

## Quota protection

Tennis and Basketball results are cached for 10 minutes.
Manual Refresh is protected by a 60-second cooldown.

TheSportsDB remains as a limited fallback when a dedicated key is missing, but
the dedicated providers are the intended live-data source.

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.
No native IPA / Codemagic / Signulous rebuild is required.


# v9.5 — One shared API-SPORTS key

Your API-SPORTS dashboard uses one account API key across the sports APIs that
are active on the account.

Command Centre now mirrors that model.

## New preferred Cloudflare secret

Add one secret:

    API_SPORTS_KEY=YOUR_API_SPORTS_DASHBOARD_KEY

That same value is used for:
- API-Football fallback
- API-Basketball

You do NOT need a separate:

    API_BASKETBALL_KEY

and v9.5 no longer lets an old API_BASKETBALL_KEY override the shared key.

## Backwards compatibility

If you already have:

    API_FOOTBALL_KEY

v9.5 will continue to use it as the shared API-SPORTS key until you decide to
rename it to API_SPORTS_KEY.

So you can deploy v9.5 first without breaking Football.

## Basketball 403 diagnostics

The old message assumed that a Basketball 403 meant the Basketball subscription
was not enabled. That was too broad.

v9.5 keeps the exact API error and explains that a 403 can also mean:
- Cloudflare is using a different/old API key
- API-SPORTS whitelist restrictions are blocking the Worker
- the subscription/account state has not propagated yet

If Basketball is Active in the dashboard, the app no longer tells you to create
a second Basketball key.

## Tennis

Tennis still uses:

    API_TENNIS_KEY

because the Tennis provider used by Command Centre is API-Tennis, not the
API-SPORTS Football/Basketball service.

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v9.6 — Bottom bar tether fix

The bottom navigation has been re-anchored.

## Home launcher dock
The four-icon dock on the full-screen Home launcher is now absolutely pinned to
the bottom of the launcher screen. App icons and content cannot push it up or
down.

Space is reserved above it so the app grid cannot overlap the dock.

## Normal mobile bottom navigation
The five-button Home / Today / Watch / Notes / More bar is explicitly fixed to
the iPhone viewport with safe-area support and a higher stacking layer.

This also adds iOS/PWA compositing protection so page scrolling should not make
the bar drift with the content.

## Files to replace

    public/index.html

No Worker, Cloudflare variable, D1, Codemagic, IPA or Signulous change is
required.


# v9.7 — Provider 3 + Football / Tennis / Basketball streams

Command Centre now supports three separately configured live-stream providers.

The Sport tab automatically asks the selected provider for the correct category:

    Football   -> soccer
    Tennis     -> tennis
    Basketball -> basketball

When you change the Sport tab, the stream section changes with it. Tennis
streams appear on Tennis; Basketball streams appear on Basketball.

Each sport remembers its own selected provider on the device, so you can use
Provider 1 for Football and Provider 3 for Tennis without repeatedly switching.

## Provider 3 variables

For an authorised API provider:

    LIVE_PROVIDER_3_NAME=Provider 3
    LIVE_PROVIDER_3_MODE=api
    LIVE_PROVIDER_3_BASE_URL=https://your-authorised-provider.example
    LIVE_PROVIDER_3_API_PATH=/api/v1/streams
    LIVE_PROVIDER_3_ALLOWED_EMBED_HOSTS=player.provider.example

Optional:

    LIVE_PROVIDER_3_API_KEY=...
    LIVE_PROVIDER_3_CATEGORY_SOCCER=soccer
    LIVE_PROVIDER_3_CATEGORY_TENNIS=tennis
    LIVE_PROVIDER_3_CATEGORY_BASKETBALL=basketball

For an authorised HTML/page provider:

    LIVE_PROVIDER_3_NAME=Provider 3
    LIVE_PROVIDER_3_MODE=scrape
    LIVE_PROVIDER_3_BASE_URL=https://your-authorised-provider.example
    LIVE_PROVIDER_3_SCRAPE_PATH=/sports/{category}
    LIVE_PROVIDER_3_ALLOWED_PAGE_HOSTS=your-authorised-provider.example,www.your-authorised-provider.example
    LIVE_PROVIDER_3_ALLOWED_EMBED_HOSTS=player.provider.example
    LIVE_PROVIDER_3_LINK_HINTS=football,soccer,tennis,basketball,match,game,stream,live
    LIVE_PROVIDER_3_MAX_SCRAPE_PAGES=12

## Category aliases

If a provider calls football `football` rather than `soccer`, set:

    LIVE_PROVIDER_3_CATEGORY_SOCCER=football

Likewise, if its own category names differ, use the Tennis/Basketball alias
variables.

The same optional category-alias variables now work for Provider 1 and Provider
2 as well:

    LIVE_PROVIDER_1_CATEGORY_SOCCER
    LIVE_PROVIDER_1_CATEGORY_TENNIS
    LIVE_PROVIDER_1_CATEGORY_BASKETBALL

    LIVE_PROVIDER_2_CATEGORY_SOCCER
    LIVE_PROVIDER_2_CATEGORY_TENNIS
    LIVE_PROVIDER_2_CATEGORY_BASKETBALL

## In-app behaviour

Sport
  Football
    Live football streams
      Provider 1 / Provider 2 / Provider 3

  Tennis
    Live tennis scores
    Live tennis streams
      Provider 1 / Provider 2 / Provider 3

  Basketball
    Live basketball scores
    Live basketball streams
      Provider 1 / Provider 2 / Provider 3

Inside any stream, Source 1 / Source 2 / Source 3 switching still works.

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.

Only configure providers that you are authorised to access and embed.


# v9.8 — Same-page dynamic stream provider mode

This adds a third provider mode:

    api
    scrape
    dynamic

`dynamic` is for sites where Football, Tennis and Basketball all appear on one
page, but the page itself initially shows a loading state and JavaScript later
requests the stream/event data.

The Worker does NOT execute the website's JavaScript. Instead, you point it at
the authorised JSON/data request used by your provider.

## Example structure: streamportal.pages.dev

The public page structure that can be safely confirmed is:

    LIVE_PROVIDER_3_BASE_URL=https://streamportal.pages.dev
    LIVE_PROVIDER_3_ALLOWED_PAGE_HOSTS=streamportal.pages.dev

Its sports page is the root page:

    /

So if your authorised provider is built the same way, the equivalent page-side
setup is:

    LIVE_PROVIDER_3_MODE=dynamic
    LIVE_PROVIDER_3_BASE_URL=https://your-authorised-provider.example
    LIVE_PROVIDER_3_ALLOWED_PAGE_HOSTS=your-authorised-provider.example
    LIVE_PROVIDER_3_DYNAMIC_PATH=/the-authorised-json-request

For visual comparison with the example site's public structure:

    LIVE_PROVIDER_3_NAME=StreamPortal-style Example
    LIVE_PROVIDER_3_MODE=dynamic
    LIVE_PROVIDER_3_BASE_URL=https://streamportal.pages.dev
    LIVE_PROVIDER_3_ALLOWED_PAGE_HOSTS=streamportal.pages.dev

Do NOT set `LIVE_PROVIDER_3_DYNAMIC_PATH=/` for this example. The root page is
HTML, not JSON. The dynamic path must be the authorised site's documented or
owner-supplied data request.

## Dynamic feed variables

Required:

    LIVE_PROVIDER_3_DYNAMIC_PATH=/api/streams

Optional:

    LIVE_PROVIDER_3_DYNAMIC_ROOT=streams
    LIVE_PROVIDER_3_DYNAMIC_CATEGORY_FIELD=category
    LIVE_PROVIDER_3_DYNAMIC_CATEGORY_PARAM=category

`DYNAMIC_PATH` may include a category placeholder:

    LIVE_PROVIDER_3_DYNAMIC_PATH=/api/streams/{category}

or can point to one JSON feed containing every sport:

    LIVE_PROVIDER_3_DYNAMIC_PATH=/api/streams.json
    LIVE_PROVIDER_3_DYNAMIC_CATEGORY_FIELD=sport

The parser recognises common JSON shapes automatically:

    [ ... ]
    {"streams":[ ... ]}
    {"data":[ ... ]}
    {"events":[ ... ]}
    {"results":[ ... ]}
    {"items":[ ... ]}
    {"matches":[ ... ]}

It also recognises common stream fields such as:

    name / title / event / match
    category / sport / type
    league / competition / tournament
    embed_url / embedUrl / player_url / iframe / url
    sources / streams / players / links / mirrors
    thumbnail / image / poster

## Sport filtering

The same Provider 3 configuration now feeds the correct Sport tab:

    Football   -> soccer
    Tennis     -> tennis
    Basketball -> basketball

Aliases still work:

    LIVE_PROVIDER_3_CATEGORY_SOCCER=football
    LIVE_PROVIDER_3_CATEGORY_TENNIS=tennis
    LIVE_PROVIDER_3_CATEGORY_BASKETBALL=basketball

## Important

Only use `DYNAMIC_PATH` values supplied by, documented by, or otherwise
authorised by your provider. The example public page is useful for visualising
the one-page loading structure, but this project does not reverse-engineer a
third-party site's hidden stream/data endpoints.

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v9.9 — Nested dynamic stream groups

This version adds support for the exact grouped JSON pattern discovered during
testing:

    {
      "streams": [
        {
          "category": "Football",
          "streams": [
            {
              "name": "...",
              "poster": "...",
              "starts_at": 1234567890,
              "tag": "LIVE",
              "iframe": "https://player.example/embed/...",
              "sources": [...]
            }
          ]
        },
        {
          "category": "Tennis",
          "streams": [...]
        }
      ]
    }

## Provider 3 configuration for this structure

    LIVE_PROVIDER_3_MODE=dynamic
    LIVE_PROVIDER_3_DYNAMIC_PATH=/streams
    LIVE_PROVIDER_3_DYNAMIC_ROOT=streams
    LIVE_PROVIDER_3_DYNAMIC_CATEGORY_FIELD=category
    LIVE_PROVIDER_3_DYNAMIC_ITEMS_FIELD=streams

Category aliases:

    LIVE_PROVIDER_3_CATEGORY_SOCCER=football
    LIVE_PROVIDER_3_CATEGORY_TENNIS=tennis
    LIVE_PROVIDER_3_CATEGORY_BASKETBALL=basketball

The parser now:

1. Opens the top-level `streams` array.
2. Finds the category object matching Football / Tennis / Basketball.
3. Opens that object's nested `streams` array.
4. Converts each nested stream into a Command Centre stream card.

It understands these discovered field names:

    name      -> stream title
    poster    -> image
    starts_at -> Unix start time
    tag       -> LIVE / UPCOMING metadata
    iframe    -> primary embed URL
    sources   -> alternate source metadata

`iframe` is used as the playable source.

Objects inside `sources` that contain only provider IDs such as:

    {"source":"admin","id":"..."}

are NOT treated as URLs. Only actual HTTPS player URLs are sent to the iframe.

## Files to replace

    worker.js

`public/index.html` is included in the package for version consistency but no
front-end layout change is required for this parser upgrade.

No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v10.0 — Dynamic JSON on a separate host

The latest network trace showed the important architecture:

    visible website host
        ↓ JavaScript fetch
    separate JSON/data host
        ↓
    /streams?t=<changing timestamp>

That explains why earlier versions returned HTML: `/streams` was being resolved
against the visible website instead of the separate JSON service.

v10.0 adds three new variables:

    LIVE_PROVIDER_3_DYNAMIC_BASE_URL
    LIVE_PROVIDER_3_ALLOWED_DATA_HOSTS
    LIVE_PROVIDER_3_DYNAMIC_CACHEBUST_PARAM

For an authorised provider with the same architecture, use this pattern:

    LIVE_PROVIDER_3_MODE=dynamic

    LIVE_PROVIDER_3_BASE_URL=https://your-visible-site.example
    LIVE_PROVIDER_3_ALLOWED_PAGE_HOSTS=your-visible-site.example

    LIVE_PROVIDER_3_DYNAMIC_BASE_URL=https://data.your-provider.example
    LIVE_PROVIDER_3_ALLOWED_DATA_HOSTS=data.your-provider.example
    LIVE_PROVIDER_3_DYNAMIC_PATH=/streams
    LIVE_PROVIDER_3_DYNAMIC_CACHEBUST_PARAM=t

    LIVE_PROVIDER_3_DYNAMIC_ROOT=streams
    LIVE_PROVIDER_3_DYNAMIC_CATEGORY_FIELD=category
    LIVE_PROVIDER_3_DYNAMIC_ITEMS_FIELD=streams

    LIVE_PROVIDER_3_CATEGORY_SOCCER=football
    LIVE_PROVIDER_3_CATEGORY_TENNIS=tennis
    LIVE_PROVIDER_3_CATEGORY_BASKETBALL=basketball

The Worker will automatically request:

    https://data.your-provider.example/streams?t=<current-milliseconds>

You should NOT manually enter the timestamp because it changes on every
request.

## Why this fixes the previous error

Before:

    LIVE_PROVIDER_3_BASE_URL=https://visible-site.example
    LIVE_PROVIDER_3_DYNAMIC_PATH=/streams

resolved to:

    https://visible-site.example/streams

If the site's JavaScript actually fetches JSON from another host, that URL may
return HTML and the app reports "did not return JSON".

Now:

    LIVE_PROVIDER_3_DYNAMIC_BASE_URL=https://data.your-provider.example
    LIVE_PROVIDER_3_DYNAMIC_PATH=/streams
    LIVE_PROVIDER_3_DYNAMIC_CACHEBUST_PARAM=t

resolves to the actual data service pattern.

## Files to replace

    worker.js

No front-end file change is required for this fix.
No D1 migration is required.
No native rebuild is required.

Only configure data/player hosts that you are authorised to access and embed.


# v10.1 — Lazy source resolver

This adds support for authorised providers whose stream catalogue contains
source references rather than current player URLs.

Typical catalogue shape:

    {
      "name": "Match",
      "iframe": "https://old-or-fallback-player.example/embed/...",
      "sources": [
        {"source":"primary","id":"match-id-1"},
        {"source":"backup","id":"match-id-2"}
      ]
    }

Command Centre now preserves those source references and resolves them only
when the user opens a match or taps a Source button.

This avoids resolving every source on every refresh.

## Provider variables

For Provider 3:

    LIVE_PROVIDER_3_RESOLVE_PATH=/resolve-stream
    LIVE_PROVIDER_3_RESOLVE_SOURCE_PARAM=source
    LIVE_PROVIDER_3_RESOLVE_ID_PARAM=id

If the resolver is on a different host from the JSON feed:

    LIVE_PROVIDER_3_RESOLVE_BASE_URL=https://resolver.your-provider.example
    LIVE_PROVIDER_3_ALLOWED_RESOLVE_HOSTS=resolver.your-provider.example

If it uses the same host as `LIVE_PROVIDER_3_DYNAMIC_BASE_URL`, you may omit
`LIVE_PROVIDER_3_RESOLVE_BASE_URL`.

Optional cache buster:

    LIVE_PROVIDER_3_RESOLVE_CACHEBUST_PARAM=t

If the resolver JSON stores the final player URL in an unusual field:

    LIVE_PROVIDER_3_RESOLVE_URL_FIELD=data.player.url

The resolver automatically recognises common fields such as:

    url
    embed_url
    iframe
    player_url
    stream_url
    data.url
    data.iframe
    result.url
    result.iframe

## URL allowlist

The final resolved player/media URL must still match:

    LIVE_PROVIDER_3_ALLOWED_EMBED_HOSTS

This safety check is intentional.

## Playback

If the resolver returns:

    https://player.example/embed/123

Command Centre uses the iframe player.

If it returns a direct:

    .m3u8
    .mp4
    .webm
    .mov
    .m4v

Command Centre switches to the native `<video>` player. This is particularly
useful on iPhone, where HLS `.m3u8` playback is supported natively.

## Files to replace

    worker.js
    public/index.html

No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.

Use only resolver/data/player endpoints that your provider authorises you to
access and embed.


# v10.2 — Direct Home Screen button

The mobile bottom navigation no longer sends you to the Dashboard first.

Before:

    App / section
        ↓
    Home (Dashboard)
        ↓
    swipe / tap Apps
        ↓
    Launcher

Now:

    App / section
        ↓
    Home Screen
        ↓
    Launcher immediately

The launcher is the iPhone-style Home panel containing the app icons and dock.

The Dashboard is still available from the launcher by:
- swiping to the Dashboard panel, or
- tapping the "← Dashboard" button.

Normal app startup is unchanged and can still begin on the Dashboard. This
change only affects the explicit Home button while navigating around the app.

## File to replace

    public/index.html

No Worker or Cloudflare variable changes are required.
No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v10.3 — Command Centre flow upgrade

## Home / Today
- Home is now the iPhone-style launcher.
- Today is now the main personal dashboard.
- The old Home dashboard slide is hidden from normal navigation.
- Swipe down on Home to open universal search.

## Back navigation
- Every normal app section has a consistent top-left Back button.
- Command Centre remembers the route you took through sections.
- With no useful history, Back returns to Home.
- Home Screen clears the history and returns directly to the launcher.

## Sport Auto provider
- Live Sport now shows: Auto / Provider 1 / Provider 2 / Provider 3.
- Auto tries configured providers and selects the first one with usable streams.
- It remembers the last successful provider separately for Football, Tennis and Basketball.
- Source resolver requests use the actual provider Auto selected.

## Better Today
Today now contains:
- at-a-glance counts
- Next up
- complete daily schedule
- Reminder / Event / Note / Search quick actions
- followed Sport
- focused financial headlines
- Continue Watching
- Recent Notes

## Better global search
Search now covers:
- sections
- notes
- reminders / calendar
- followed sports and loaded fixtures
- financial / world news
- Movies & TV
- YouTube

## File to replace

    public/index.html

No Worker changes are required.
No Cloudflare variables need changing.
No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v10.4 — Free Music Player

Command Centre now has a built-in free Music app.

## What it does

- Spotify-style Music page
- Search songs and artists
- Audius free on-demand playback inside Command Centre
- YouTube official embedded-player fallback for wider catalogue coverage
- For You
- Trending
- Recently Played
- Liked Songs
- Local playlists
- Queue
- Persistent mini-player while moving around Command Centre
- Music icon on the Home launcher and launcher dock

## Provider behaviour

### Audius

Audius is the first choice. Command Centre uses its read-only REST API to:
- search tracks
- load trending tracks
- stream public tracks

Audius read-only access currently works without requiring a secret. The Worker
adds `app_name=CommandCentre` to its requests.

Optional:
- `AUDIUS_BEARER_TOKEN` may be added as a Cloudflare secret later if you use an
  Audius developer plan / higher-limit backend access.

### YouTube

The existing `YOUTUBE_API_KEY` is reused for fallback search.

Playback is through the official YouTube embedded player. Command Centre does
not extract or proxy YouTube audio.

## Files to replace

This update changes both:

    public/index.html
    worker.js

Deploy the Worker after replacing them.

## Cloudflare variables

No new variable is required for the basic player.

Existing:
- `YOUTUBE_API_KEY` — enables YouTube fallback

Optional:
- `AUDIUS_BEARER_TOKEN` — optional Audius backend bearer token

## No database change

No D1 migration is required.

## Native app

The iOS wrapper loads the hosted Command Centre, so the normal web update does
not require a new Codemagic / IPA / Signulous build.


# v10.4.1 — Freeze hotfix

This fixes the v10.4 startup freeze.

Cause:
- v10.4 replaced the old Spotify music interface.
- The old startup code still tried to register `loadSpotifyEmbed`.
- That function no longer existed.
- The resulting JavaScript ReferenceError stopped the rest of `init()`.
- Because the normal startup/render jobs never completed, the app appeared
  frozen / non-interactive.

Fix:
- removed the stale `loadSpotifyEmbed` startup references
- made the remaining Spotify settings binding null-safe
- isolated Music player initialisation so a Music-only failure cannot stop the
  rest of Command Centre from starting

## File to replace

    public/index.html

`worker.js` from v10.4 does not need changing for this hotfix.

No Cloudflare variable changes.
No D1 migration.
No Codemagic / IPA / Signulous rebuild.


# v10.5 — MusicBrainz discovery fallback

Music now uses three complementary sources:

    Audius      = direct free audio playback
    YouTube     = broad-catalogue official embedded playback
    MusicBrainz = free recording / artist / release metadata discovery

MusicBrainz does not provide song audio. It is used to identify the exact
recording when Audius / YouTube searches are incomplete.

## Search behaviour

A normal Music search now checks:
- Audius
- YouTube
- MusicBrainz

Playable Audius / YouTube results appear first.

MusicBrainz matches appear beneath them with:
- track title
- artist
- album / release
- year
- duration where available
- ISRC where available
- "Find playable" action

"Find playable" runs an exact title + artist search back through Audius and
YouTube. This is useful when a broad query did not find the right version.

## Rate-limit protection

MusicBrainz public API requests:
- are made server-side through the Cloudflare Worker
- use a meaningful User-Agent
- are throttled to approximately one request per second per Worker isolate
- cache matching searches for 6 hours

No MusicBrainz API key is required.

The Worker uses this contact value in priority order:
1. MUSICBRAINZ_CONTACT (optional)
2. existing VAPID_SUBJECT
3. Command Centre origin

So no new Cloudflare variable is required for the existing deployment.

## Files to replace

    public/index.html
    worker.js

No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v10.5.1 — Compact persistent Music player

The persistent player has been reduced so it does not block normal browsing.

## Audius / direct audio
On mobile the player is now a narrow floating bar above the bottom navigation:
- smaller artwork
- smaller text
- play/pause
- open Music
- close
- thin progress bar

Previous/Next are hidden from the tiny mobile bar to save space. They remain
available in the full Music page.

## YouTube fallback
YouTube playback remains visibly embedded rather than becoming a hidden
audio-only player. Its surrounding Command Centre controls have been reduced
and the player floats in the bottom-right corner.

## File to replace

    public/index.html

No worker.js changes are required.
No Cloudflare variables need changing.
No D1 migration is required.
No native rebuild is required.


# v10.5.2 — Independent Music search / Fetch Abort fix

This changes Music search so Audius, YouTube and MusicBrainz no longer share
one request that waits for all providers.

## Before

    Audius -------\
    YouTube -------- wait for all three ---> show results
    MusicBrainz ---/

If one provider was slow, the frontend's single timeout could abort the entire
search and show "Fetch aborted".

## Now

    Search
      |
      +--> Audius --------> render as soon as ready
      |
      +--> YouTube -------> render as soon as ready
      |
      +--> MusicBrainz ---> render metadata independently

One provider can time out or fail without removing results from the others.

Provider-specific timeouts are:
- Audius: 10 seconds
- YouTube: 12 seconds
- MusicBrainz: 18 seconds

The Music search screen now shows an individual status for each provider, for
example:

    Audius: 8 results
    YouTube: searching...
    MusicBrainz: unavailable
      MusicBrainz took too long — playable results are still available.

The raw "Fetch aborted" message is replaced with a useful provider-specific
explanation.

"Find playable" on a MusicBrainz result now searches only Audius + YouTube and
does not wait for MusicBrainz again.

## New Worker endpoints

    /api/music/search/audius
    /api/music/search/youtube
    /api/music/search/musicbrainz

The old /api/music/search route remains for compatibility.

## Files to replace

    public/index.html
    worker.js

No Cloudflare variables need changing.
No D1 migration is required.
No Codemagic / IPA / Signulous rebuild is required.


# v10.5.3 — Bible module restored to Today

The important Bible module is now prominently available on the Today screen.

It includes:
- today's three Bible reading recommendations
- per-range chapter completion count
- one-tap "Mark range read"
- overall chapters-read progress
- completed-books count
- overall Bible percentage
- "New 3" recommendations button
- direct "Full Checklist" button

Marking a recommended range read updates the same existing 66-book / 1,189
chapter checklist, so no Bible progress data is duplicated or reset.

The existing Bible launcher app and full checklist remain unchanged.

## File to replace

    public/index.html

worker.js does not need changing.
No Cloudflare variables need changing.
No D1 migration is required.
No native rebuild is required.


# v10.6 — Personalised YouTube "For You"

YouTube no longer opens on the generic Trending feed.

The main YouTube browse tab is now:

    ✨ For You

with Trending retained as a separate tab.

## How For You learns

Command Centre builds recommendations from YouTube activity inside the app:

- recent YouTube searches
- recently watched video titles
- channels watched repeatedly
- recent topic keywords
- "Not interested" feedback

The recommendation profile stays in the existing local Command Centre state.

## Recommendation behaviour

For You chooses one strong personal signal and runs one YouTube search for it.
This deliberately avoids making several automatic YouTube search calls at once,
which would consume API quota quickly.

The resulting videos:
- exclude recently watched video IDs
- exclude videos marked "Not interested"
- are cached locally for 30 minutes
- refresh when viewing history changes
- use a different recommendation seed when the user manually refreshes /
  taps the For You tab again

The status text explains why a recommendation set was selected, for example:

    Because you often watch [channel]
    Because you searched for "[query]"
    Based on "[recent video]"

## New users / no history

If Command Centre does not yet have enough YouTube history, For You temporarily
uses Trending and explains that watching/searching a few videos will train the
personalised feed.

## Privacy

This is Command Centre's own local recommendation layer. It does not claim to
be YouTube's private account Home feed and does not require Google account
access.

## File to replace

    public/index.html

worker.js does not need changing.
No new Cloudflare variables are required.
No D1 migration is required.
No native rebuild is required.


# v10.6.2 — Back to Top click fix

This fixes the v10.6.1 Back to Top button.

## Cause

In v10.6.1 the button was inserted after the main script.

The app runs `init()` at the end of that script, so:

    bind('backToTopBtn', ...)

ran before the browser had parsed the button.

That meant:
- the scroll listener could still make the arrow visible
- but the arrow itself did not have its click handler yet

## Fix

- the Back to Top button is now created before the main script
- it has both a normal event binding and an inline fallback
- the scroll code handles normal document scrolling
- it also detects/resets internal page scroll containers
- an iOS / WKWebView fallback forces the final scroll position to 0

The button remains:
- bottom-left on iPhone/mobile
- hidden on Home
- hidden near the top
- hidden while a modal is open

## File to replace

    public/index.html

worker.js does not need changing.
No Cloudflare variables need changing.
No D1 migration.
No native rebuild.
