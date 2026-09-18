# v10.27.0 — Sport performance, reliable intro and player popup protection

Complete source release. Native iOS 1.12.0, build 19.

## Changes

### Sport

- The full schedule and automatic-follow list are cached between repeated rendering lookups. Previously every fixture card and worldwide ranking comparison could rebuild the complete schedule and scan it again. This multiplied CPU work on large schedules.
- League data and the wider schedule now render independently as each request completes. Saved fixtures remain visible during refresh and on failure.
- Repeated requests for the same league share the in-flight load. Older responses cannot overwrite a newer league selection. Opening Sport no longer saves unchanged preferences unnecessarily.
- Existing live-score refresh, local Live Activities, fallback schedule and automatic following remain included.

### Intro

- The intro remembers that it has already played using persistent browser storage and native iPhone preferences, rather than relying only on a web session. An existing session flag is migrated when available. The Replay control remains available.
- Timing uses elapsed time, so dropped frames do not stretch playback indefinitely. The canvas uses 120 particles on narrow screens instead of 360, and 320 on larger screens instead of 1,000.
- Exit cleanup is scheduled before transition animations. An animation failure cannot prevent the app being released. Playback has a 4.2-second watchdog; waiting for the native privacy status has a 4.5-second watchdog. These run when the JavaScript event loop can execute, not during an OS suspension.
- Leaving the app finishes an active intro. A slow privacy-unlock response no longer restarts an expired intro. Native privacy protection remains controlled by the existing lock screen.

### Embedded movie and sport players

- Movie and sport iframes are sandboxed with scripts, same-origin access, forms and presentation permitted, but without popup or top-navigation permission.
- The native wrapper independently rejects new windows and app-screen navigation initiated by embedded frames. It also declines embedded-frame JavaScript dialogs and external app URL schemes.
- Normal links and app-initiated web navigation from the trusted main Command Centre page remain allowed, including news sources. The iframe rules do not apply to these main-page news links.
- This is popup/redirect protection, not removal of every banner or video advertisement. Some providers refuse sandboxed embedding; such a provider may need to be replaced with another source. External provider playback and native news opening need signed-iPhone validation.

### YouTube For You

- Saved videos contribute recommendation interests. Very brief accidental views and hidden channels no longer train the personal feed. Existing channel balance and recent-impression rotation are retained.
- Duplicate titles, saved videos, watched IDs and hidden recommendations are filtered from the new mix. Recommendation cards show the reason for a suggestion and load thumbnails lazily.
- Cache validity also depends on the recommendation signals, so new interests are not held back solely by the 15-minute timer.
- Cached recommendations remain visible while updating; a useful first set can appear before every search finishes. Duplicate loads share a request, and late results cannot replace a different Explore tab or newer refresh.

## Installation

1. Export a backup from the current app, and keep it installed.
2. Use this ZIP as the complete project source. Preserve your existing deployment secrets and customised Cloudflare settings.
3. Deploy the Worker and public assets through your normal Cloudflare workflow. The shell cache version is v10.27.0. No new secret or database migration is required for this release's changes.
4. Rebuild using the included Codemagic workflow. Expected artifact: `CommandCentre-iOS26-v1.12.0.ipa`, build 19.
5. Sign with the same identity as the installed app and install over it. Open the app and check Sport, intro playback, news opening and your preferred embedded players.

The earlier recovery/snapshot and Live Activity work is included. App Group provisioning for widgets and Apple push setup for regular closed-app score delivery remain separate requirements; this release does not grant missing signing entitlements. See [v10.26.1](RELEASE-v10.26.1.md) for that setup.

## Verification

- 107 automated tests passed. New tests exercise 5,000-fixture cache reuse, partial and overlapping Sport requests, four intro failure/replay cases, and recommendation signal/filter behaviour.
- Project syntax, intro JavaScript and full Worker dependency bundle validated.
- Browser smoke test: a synthetic 3,000-fixture schedule displayed 60 rows, switched to worldwide view and rendered in approximately 100 ms on this desktop. This is rendering time with local synthetic data, not an iPhone or upstream-network speed guarantee.
- Browser intro completed without Skip and stayed skipped after reload.
- Both synthetic embedded-player tests blocked popup windows and attempts to replace the main page. The normal news-link path is retained in source; native behaviour still requires an iPhone test.
- Existing browser recovery suite: 11 tests passed.
- No production deployment or Swift compilation was performed here. This Windows workspace cannot validate Xcode compilation, signing, or real provider playback on the iPhone.

References: [WebKit navigation source frames](https://developer.apple.com/documentation/webkit/wknavigationaction/sourceframe), [iframe sandbox permissions](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).
