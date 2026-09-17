# v10.26.0 — Favourite teams, Live Activity push and notification repair

Native iOS: 1.11.0, build 17. Source update; a signed IPA still needs to be built.

## What changed

- Favourite teams automatically follow upcoming and live matches. This is enabled by default in Settings → Notifications. Unfollowing an individual match excludes it from automatic following.
- Added authenticated ActivityKit registration, push-to-start and server updates using the existing one-minute Cloudflare cron. Foreground scores continue to refresh every 15 seconds. Closed-app delivery depends on the upstream score feed and Apple's push delivery/budgets; one minute is the server polling interval, not a guaranteed delivery time.
- Expired Safari Web Push subscriptions now produce an error instead of a false success. The companion refreshes its subscription when opened, renews it explicitly through Refresh connection, and rediscovers the existing IPA link. Push-service acceptance is distinguished from confirmed device delivery.
- Existing data recovery, older-snapshot selection, widget write/read acknowledgements and the Swift file-protection compiler fix are included.

## Install

1. Export a backup from the installed app. Keep the app installed to preserve local data.
2. Apply the update ZIP over the corrected v10.25.0 repository, preserving paths. The full ZIP is an alternative complete source copy. Keep your existing deployment secrets and configuration.
3. Deploy the Worker and public assets together through your normal Cloudflare deployment. The new D1 tables are also created lazily by the API/cron; migration `0012_live_activities.sql` is included for managed migration workflows. Keep the existing every-minute cron enabled.
4. Commit the native changes and rebuild with the included Codemagic workflow. Expected artifact: `CommandCentre-iOS26-v1.11.0.ipa`, build 17. Sign and install over the existing app using the same identity.
5. Open the IPA once and confirm its Messages/Transfers pairing. Open Settings → Notifications and use Sync now. Its Live Activity status explains missing server configuration or tokens.

## Widgets: “App Group missing” requires signing support

The source already requests `group.tech.wolveer.commandcentre.native`. This error means the installed app or widget cannot access that shared container. The signing provider must provision and retain that exact App Group for both identifiers under the same Apple developer team:

- App: `tech.wolveer.commandcentre.native`
- Widget: `tech.wolveer.commandcentre.native.widgets`

Ask Signulous whether it can preserve/provision this group for both targets and retain the embedded widget extension. A successful unsigned Codemagic build does not establish these entitlements. If the provider cannot supply them, these shared-data widgets cannot work with that signing setup. Adding the group string to source again cannot grant access.

After a correctly signed update, open the app, use Sync now, then remove and add the widget if it retains its previous error. Do not uninstall the app to repair this.

## Closed-app Live Activities: Apple push setup

The main app needs a valid Push Notifications entitlement in its signing profile. Cloudflare needs the `APNS_CONFIG` secret containing credentials from that same Apple developer team:

```json
{"keyId":"YOUR_KEY_ID","teamId":"YOUR_TEAM_ID","privateKey":"-----BEGIN PRIVATE KEY-----\nYOUR_P8_KEY\n-----END PRIVATE KEY-----","bundleId":"tech.wolveer.commandcentre.native","environment":"production"}
```

Enter the real value as a Cloudflare secret, never in source control. The existing APNs configuration is reused if already valid. A third-party signer may not provide provider credentials; if Signulous cannot support them, you need a signing arrangement that does. Safari Web Push does not update native ActivityKit activities. Without native push, foreground Live Activities still work where iOS permits them, but closed-app updates are not ready.

## Repair the Safari notification companion

After deployment, open the existing Safari-installed Home Screen app → Settings → Notifications → Safari notification companion. Open its connection controls, tap Refresh connection, then Send companion test. This explicitly replaces the stale subscription while retaining the paired IPA device. If it says the link expired, create a fresh link code in the IPA and enter it in the Home Screen app. Reopen the IPA to sync current notification preferences.

If the push service accepts the test but nothing appears, check notification permission for that Home Screen app and iPhone Focus settings. The app cannot confirm display solely from push-service acceptance.

## Validation and limits

- 93 automated Node tests pass, including real local D1 tests with mocked APNs transport for authentication, start/update/end, token registration, duplicate suppression and revoked-device rejection.
- 11 browser recovery tests pass. App startup, older-snapshot selection UI and saving the auto-follow setting across reload were checked in the browser.
- Project syntax, public bundles and complete Worker dependency bundle pass validation.
- No real Apple/Safari push was sent during testing. No production deployment was performed. This Windows workspace cannot compile Swift or verify an installed IPA's signing. Codemagic compilation and signed iPhone testing remain required.

References: [Apple ActivityKit push](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications), [WebKit Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
