# Command Centre v10.25.0 — recovery, faster followed matches, verified widgets

Web: **10.25.0**. Native iOS: **1.10.0, build 16**.

## Install

1. Export any currently accessible personal data from Settings → General → Export backup.
2. Copy the update package into the existing repository, replacing matching files and adding the new files. Keep the existing Cloudflare secrets and database bindings.
3. Commit and deploy the web app/Worker using the existing GitHub and Cloudflare process.
4. Run Codemagic and build `CommandCentre-iOS26-v1.10.0.ipa`.
5. Sign with Signulous and install **over the existing app** using its existing bundle identity. Do not uninstall or change the bundle identifier to troubleshoot: deleting the app removes its local data and recovery files.
6. Open the app. Check Settings → General → Local safety snapshots. Select by date and content counts, then choose Restore selected if needed. Export a separate JSON backup after recovery.
7. Open Settings → Notifications → Widgets & Live Activities → Sync now and read the result.

The packages contain source code, not a built or signed IPA. Xcode compilation and on-device verification are still required.

## Faster followed matches

- Poll up to three followed matches near kick-off every **15 seconds while the app is visible**, previously 90 seconds.
- Use an isolated **10-second live cache**, avoiding the ordinary match cache and the 10-minute schedule cache.
- Refresh when returning to the foreground or reconnecting. Keep the latest detailed scores in memory so unrelated widget syncs cannot replace them with older schedule scores.
- Background refresh now fetches each active match and decodes the actual nested match response; the old code incorrectly passed schedule records into a parser expecting a different structure.
- Live Activities become stale after 45 seconds without another app update and prompt the user to reopen the app.

These intervals are polling targets, not a guaranteed score delay: the upstream provider can be delayed or unavailable. iOS suspends ordinary app timers in the background. This release does **not** add an ActivityKit APNs server connection, so continuous updates with the app closed remain unavailable. See [Apple's ActivityKit push documentation](https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications).

## Data protection and recovery

- Validate saved data before accepting it. Recover at startup before normal app initialization and saving.
- Keep a local mirror and a transactional IndexedDB current record separate from historical snapshots.
- Block an automatic overwrite that would replace populated notes/calendar/reminders/Bible data with a completely empty state.
- When the primary state is missing, corrupt, or unexpectedly empty, recover a populated copy from the local mirror, database, or native recovery vault.
- Native recovery files live in Application Support, independently of WKWebView website storage, use atomic writes and iOS file protection, and retain 20 native snapshots. Website-storage eviction can therefore be recovered after the new IPA has saved at least one copy.
- Local-storage quota errors do not prevent the independent IndexedDB/native save. If recovery storage cannot be checked and no valid copy is available, writes remain locked rather than silently saving defaults.
- Fixed an early-startup date helper that could throw while normalizing older notes without timestamps and make the loader fall back to an empty default state.

This prevents the identified failure paths; it does not establish exactly what happened on your phone. Previously lost data can only be recovered if a snapshot, native copy, or exported backup still contains it. A new native vault cannot recover data deleted before it existed.

## Snapshot history

- Display every retained browser/native snapshot in a picker, with its time, reason and counts of notes, events, reminders and read Bible chapters.
- Preserve all five existing legacy snapshots during migration.
- Retain up to 20 automatic snapshots spaced at least 30 minutes apart, plus 10 manual/restore snapshots in a separate quota. Repeated ordinary saves still update the current recovery record immediately.
- Prefer a populated snapshot in the picker, while leaving empty snapshots visible for inspection.
- Save an undo snapshot before replacing current data. A failed undo write stops the restore.

## Widget delivery

- Use an atomically written JSON file inside the App Group instead of relying on cross-process UserDefaults propagation.
- Verify the file by reading it back before requesting WidgetKit timeline reloads.
- The widget extension writes a read receipt. UI messages distinguish waiting, verified storage, extension receipt, timeout and signing errors; sending a bridge message alone no longer reports success.
- Keep cached weather while a new weather request is pending, and avoid overwriting a newer event/reminder snapshot when background weather finishes.

Both signed targets need the same provisioned App Group:

`group.tech.wolveer.commandcentre.native`

App: `tech.wolveer.commandcentre.native`

Widget: `tech.wolveer.commandcentre.native.widgets`

If Signulous does not grant that shared container, source code cannot grant it. The app now reports this and the widget can show a signing message. A read receipt confirms the extension read the data; iOS still controls rendering and reload scheduling. See [Apple's widget refresh documentation](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date/).

## Validation

- 89 Node tests passed, including real local D1/R2 Messages and Transfers tests, live-cache expiry/isolation, and no premature widget success message.
- 11 browser recovery tests passed using actual IndexedDB: missing/corrupt state, legacy history, empty newest snapshot, blocked blank overwrites, rapid saves, manual retention, storage quota failure, unavailable storage and native recovery.
- Full-app browser check: recovered populated data from behind an empty snapshot; all five snapshots appeared; restoring the oldest displayed “Recovered test note 4” correctly.
- JavaScript syntax, service-worker inclusion, feature IDs and Worker bundling checks passed.
- Native Swift code, WidgetKit rendering, signed entitlements and iPhone recovery still need the Codemagic build and an installed-device test. No signed IPA was available to test here.

Developer commands: `npm run check`, `npm test`. The browser harness is `tests/state-recovery.browser.html`, served with `/state-safety.js` mapped to `public/state-safety.js` on a disposable local origin. Test fixtures contain synthetic data only.
