# v10.27.1 — Restore the IPA intro on fresh launches

Full source release. Native iOS 1.12.1, build 20.

## Corrected behaviour

v10.27.0 incorrectly remembered the intro permanently. After it had played once, later app launches skipped it. This release replaces that permanent native preference with an in-memory flag for the current app process.

- A fresh IPA launch plays the intro once, provided the motion setting is Cinematic or Gentle.
- Returning from the background or reloading the webpage does not replay it in the same app process.
- The document-start script is updated after playback so reloads of the existing web view also see the correct flag. Newly created web views read the shared process flag.
- Old permanent browser and native flags are ignored. No app data deletion or manual storage reset is needed.
- In a browser, playback is once per tab session, using a new session-only key.
- A confirmed native privacy lock defers the first intro until unlock without leaving an intro overlay in the way. Subsequent unlocks do not replay it.
- The lighter animation, elapsed-time timing, automatic cleanup and stall watchdog from v10.27.0 remain in place. If native lock status never arrives, the safety timeout still releases the overlay instead of trapping the app.

All Sport performance, player popup protection, YouTube recommendation, recovery and Live Activity changes from v10.27.0 remain included.

## Install

1. Back up your existing app data and keep the app installed.
2. Deploy the Worker/public assets from this full source package through your existing workflow. Preserve deployment settings and secrets.
3. Build the included Codemagic workflow. Expected artifact: `CommandCentre-iOS26-v1.12.1.ipa`, build 20.
4. Sign with the same identity as your existing app and install over it. The native rebuild is required for correct per-launch behaviour.
5. Fully close the app and reopen it to test a fresh launch. Let the intro finish, then switch away and return: it should not replay. If motion is set to Off, choose Cinematic or Gentle to enable it.

## Verification

The automated intro tests now cover fresh native launches with old stored flags, same-launch reloads with empty browser storage, delayed Face ID unlock, dropped frames, failed transition animation, missing frames, explicit replay and legacy browser flags. All 111 automated tests passed, along with project syntax and bundle validation.

Swift compilation and actual IPA behaviour still need Codemagic and iPhone verification; this Windows workspace cannot run the iOS app. This is a source package, not a built or deployed IPA.

