# Native widgets and followed-match Live Activities v10.24.0

This release pairs web **v10.24.0** with native iOS **v1.9.0 (build 15)**.

## Added

- A WidgetKit extension containing:
  - Command Centre Weather for Home Screen and Lock Screen.
  - Next Event for Home Screen and Lock Screen.
  - Next Reminder for Home Screen and Lock Screen.
- An ActivityKit football presentation for the Lock Screen and every Dynamic
  Island size: compact, minimal and expanded.
- Following a loaded match schedules its Live Activity for five minutes before
  kick-off. Matches already near kick-off or live start immediately.
- Followed scores refresh about every 90 seconds while the IPA is open and when
  iOS grants a background refresh. Full-time activities remain visible for 30
  minutes before dismissal.
- Widget taps deep-link back into Weather, Today or Football Match Centre in the
  IPA.
- Weather, reminders and calendar events stay local. The web view copies only a
  small display snapshot into the native App Group used by the widget extension.

## Deployment

1. Replace the repository files and let Cloudflare deploy the web release. The
   new app-shell cache is `command-centre-shell-v10.24.0`.
2. Build the new IPA using the updated Codemagic workflow. It creates
   `CommandCentre-iOS26-v1.9.0.ipa` and verifies that both the ReplayKit and
   Widget extensions are embedded.
3. In Signulous, the signing/provisioning setup must preserve the WidgetKit
   extension and give both the app and widget extension access to the App Group
   `group.tech.wolveer.commandcentre.native`. If the signer removes that
   entitlement, the personal widgets cannot share the app's local data.
4. Install over the current Command Centre app. Do not delete the old app first;
   an in-place upgrade preserves the Keychain-backed Messages and Transfers
   identity.
5. Open the IPA once and go to **Settings → Notifications → Widgets & Live
   Activities → Sync now**.

No Worker secret, Cloudflare variable or D1 migration is added by this release.

## iPhone setup

- Home Screen: touch and hold the Home Screen, tap **Edit → Add Widget**, search
  for **Command Centre**, and choose Weather, Next Event or Next Reminder.
- Lock Screen: touch and hold the Lock Screen, tap **Customise → Lock Screen**,
  tap the widget area and choose a Command Centre accessory widget.
- In iPhone Settings, allow Live Activities for Command Centre.
- In Command Centre, open Football → Match Centre and tap **Follow match**. Up
  to three followed fixtures are scheduled/active at once, prioritising live and
  nearest fixtures.

## Live-score limitation without an ActivityKit push key

The activity is scheduled locally and can begin while the app is closed. Live
score changes are applied while the IPA is open and when iOS grants an
opportunistic background refresh. Truly continuous server-driven score updates
while the app remains closed require ActivityKit APNs push credentials; the
Safari Web Push companion cannot update Dynamic Island content.
