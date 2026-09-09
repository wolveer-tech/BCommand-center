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
