# Command Centre v10.28.0

## Sports

- Adds SportsindX as the built-in third live-sports provider without changing Provider 1 or Provider 2.
- Parses the SportsindX schedule into Command Centre's existing event, team, time and multi-source player format.
- Refreshes SportsindX data on a short live cache and keeps its player hosts behind the existing HTTPS allowlist.

## Live Activities and Dynamic Island

- Fixes the startup race that could create a local-only Live Activity before the APNs capability check completed.
- Requests an ActivityKit push token immediately and falls back locally only when the signed build cannot support push.
- Replaces an old local-only activity with a push-enabled activity when server push is available, allowing the one-minute Worker refresh to continue while the app is closed.

Closed-app updates still require the existing `APNS_CONFIG` Cloudflare secret and a correctly signed app/extension with Push Notifications and Live Activities enabled.

## YouTube

- Upgrades For You to recommendation cache v7 with weighted search, watch-progress, saved-video, channel, freshness, negative-feedback and diversity signals.
- Learns topic feedback from Not interested instead of only hiding a single video.
- Ranks fresh, personally relevant videos while limiting channel and topic repetition.
- Displays YouTube-style relative dates such as `4 hours ago` and `2 days ago` across Explore, Search and comments.

## Validation

- The complete automated suite passes: 118 tests.
- The live SportsindX parser was checked against the current public schedule and current per-match sources.
