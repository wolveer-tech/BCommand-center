# v10.26.1 — Combined local Live Activities and recovery release

Complete source version. Native iOS 1.11.1, build 18.

## Comparison and choices

Compared the available v10.24 source (native 1.9.0), corrected v10.25 source (native 1.10.0), and v10.26 source (native 1.11.0). These are source comparisons, not measurements of the user's earlier installed IPA.

| Area | Combined behaviour |
| --- | --- |
| Starting Live Activities | Restores the earlier local, non-push request when the server has not confirmed APNs configuration. No server pairing or App Group is required for that local request. |
| Optional server push | Retains v10.26 push support. New activities request push tokens after server configuration is confirmed. A failed push request falls back to local creation. Existing local activities are kept, not ended and recreated to switch modes. |
| Fresh scores while open | Keeps 15-second foreground polling and the short live-detail cache. The earlier version polled every 90 seconds. |
| Unavailable match details | Restores the schedule endpoint as a fallback in both web foreground updates and native background refresh. It fills only missing matches, leaving successful fresh detail results intact. Native fallback parses the actual schedule response format. |
| Stale indicator | Restores the earlier five-minute local stale threshold. This is a freshness indicator, not the polling interval or permission to run in the background. |
| Automatic following | Keeps favourite-team following and individual exclusions. Recent finished games remain followed long enough to deliver the final score instead of disappearing before the final update. |
| Unknown minute | Preserves an unknown minute instead of converting null into 0 minutes. The displayed minute still comes from the provider; this release does not add a continuously ticking match timer. |
| Notifications | Keeps expired-subscription errors, companion connection repair, automatic reconnection and honest push-service acceptance messages. |
| Data and snapshots | Keeps the v10.25 recovery records, blank-write protection, older-snapshot picker, spaced retention and native backup vault. |
| Widgets and build | Keeps verified shared-file writes, widget read receipts, App Group diagnostics and the corrected Swift file-protection option. |

## Install the full version

1. Export a backup from the currently installed app, including its connection if wanted. Keep the existing app installed.
2. Extract the full ZIP as the project source. Keep your existing Cloudflare secrets and deployment-specific configuration; do not replace them with example values.
3. Deploy the Worker and public assets together using the existing Cloudflare workflow. Keep the every-minute cron. Live Activity tables are created lazily; migration `0012_live_activities.sql` is included for managed migrations.
4. Build the native project with the included Codemagic workflow. Expected artifact: `CommandCentre-iOS26-v1.11.1.ipa` (build 18).
5. Sign it with the same identity used by your existing app and install over that app. Do not uninstall to fix widgets. Switching signing teams requires planning a data backup/restore rather than assuming an in-place upgrade will work.
6. Open the app, check your data, follow a game or favourite team, and use Settings → Notifications → Sync now. For Safari notification repair, open the existing Home Screen web app's companion controls and use Refresh connection, then Send companion test.

## What this does not resolve by itself

- Local Live Activities remain usable without configured server push. iOS controls when background refresh runs. The earlier background scheduler requested a refresh no earlier than 15 minutes, and was never a guarantee of continuous locked-phone score updates. This release retains that scheduler plus optional server push; it cannot promise earlier device behaviour has been reproduced.
- Server-driven locked-phone updates need the main app's Push Notifications signing and `APNS_CONFIG` credentials from the same signing team. The server checks about once per minute; upstream delay and Apple's delivery rules still apply. Existing local activities do not gain a push token retroactively; newly created ones can use push after setup is confirmed.
- “App Group missing” still requires a signed app and widget with access to `group.tech.wolveer.commandcentre.native`. The main identifier is `tech.wolveer.commandcentre.native`; the widget is `tech.wolveer.commandcentre.native.widgets`. Source code cannot grant that signing capability. See [the setup details](RELEASE-v10.26.0.md).

## Verification

- 98 automated tests passed, including local D1/APNs transport tests and five new regression tests for successful detail fetches, partial fallback, complete network failure, wrong-match responses and unknown minutes.
- Project syntax, web client bundles and complete Worker bundle validated.
- Existing recovery code is retained; its 11 browser recovery tests passed in the preceding release. They were not rerun for this comparison release.
- The ZIP was checked against the packaged source by file hash.
- No production deployment or actual push delivery was performed. Swift compilation and signed-iPhone behaviour cannot be verified on this Windows workspace. The Codemagic build and device test remain required.

Apple documents local updates and optional push token creation separately: [Activity.request](https://developer.apple.com/documentation/activitykit/activity/request(attributes:content:pushtype:)).
