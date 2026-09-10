# Command Centre iOS 26 Mirror — Signulous-friendly build

## v1.5.1 WebKit interaction repair

Version **1.5.1 (build 8)** registers the web view's `WKUIDelegate` and presents
JavaScript alert, confirmation and text-input requests as native iOS dialogs.
This repairs controls that use confirmation or prompts, while v10.17.1's device
removal also uses a dialog-independent two-tap confirmation. Rebuild the IPA
after deploying the matching Worker/web release. Entitlements are unchanged.

## v1.5.0 stability and fixture refresh

Version **1.5.0 (build 7)** adds an iOS `BGAppRefreshTask` for the native
notification schedule. When iOS grants background time, the app fetches the
latest fixture calendar and recalculates the saved 24-hour, 1-hour and kickoff
alerts. Background execution is opportunistic, so iOS—not the app—chooses the
exact run time. Local notifications already scheduled with iOS continue to work
when Command Centre is closed.

The same task can check the already-paired Messages and Transfers inboxes. Tap
**Enable alerts** in either screen once; the web view passes the existing device
credential to the native bridge, which primes its read markers and then posts a
generic local alert only for newer unread items. Content is not placed in the
notification body. Messages and Transfers still refresh immediately while the
app is open; closed-app delivery follows iOS's opportunistic background timing
and is not equivalent to instant APNs delivery.

The task uses the existing public fixture endpoint and stores no API key. It
does not change the native Transfer download handler, Messages web flow,
ReplayKit mirror extension, backup bridge, notification permission or bundle
entitlements. `audio` remains enabled and `fetch` is added to the app background
modes.

Home/Lock widgets and Live Activities are deferred because this portable build
does not use an App Group or APNs ActivityKit update service. Build this version
after deploying the v10.17 Worker so the refreshed schedule has the matching
endpoint and fields.

## v1.4.0 native notifications, backup and Apple PiP

Version **1.4.0 (build 6)** adds two main-frame, same-origin JavaScript bridges:

- `nativeNotifications` requests iPhone notification permission, replaces the
  app's pending local schedule, sends a test alert and returns notification taps
  to the requested Command Centre section.
- `nativeData` exports the web app's JSON backup through the iOS share sheet and
  imports a selected JSON backup through the document picker.

The web app schedules up to 60 future native alerts to stay below iOS pending
notification limits. Beginning with web v10.17.1, the backup contains notes,
reminders, calendar events, folders, categories, Bible progress and the current
Bible recommendations; it excludes API keys and notification identifiers.

Command Centre's own bottom floating-video overlay has been removed. WKWebView
still enables compatible media Picture in Picture, so Apple's system PiP remains
the video overlay used outside the app.

After deploying the v10.16 Worker, rebuild this native target before creating the
Signulous IPA. No new Apple entitlement, APNs key or Cloudflare database
migration is required for local reminder/calendar notifications and backup file
transfer.

## v1.3.0 background media

The containing app now configures `AVAudioSession` with the playback category,
declares the iOS `audio` background mode, and enables WKWebView Picture in
Picture. These settings allow compatible HTML audio to continue when the phone
locks or the app moves to the background, and allow compatible provider video
players to offer Apple's system PiP.

Provider restrictions still apply. Embedded YouTube is intentionally paused
when the app is backgrounded; YouTube API policy does not permit this app to
offer background playback or isolate a video's audio. Force-quitting the app
ends every kind of playback. The web app's in-app mini-player is separate from
system PiP and works only while Command Centre itself is open.

This native build targets iOS 26 and uses ReplayKit to capture the iPhone display.

## Why this revision is easier to re-sign

The previous build used an Apple App Group so the containing app could pass the
mirror code to the ReplayKit extension. That entitlement has been removed.

The containing app now:
1. creates the normal six-digit mirror room;
2. publishes that room for 10 minutes to the existing Cloudflare Worker.

The ReplayKit extension:
1. starts after you approve Apple's broadcast sheet;
2. retrieves the current mirror room from the Worker;
3. sends the iPhone screen frames over WebRTC to the laptop receiver.

No App Group entitlement is required.

The build uses this random rendezvous channel:

    ccaed79701bb4d8d73ba508bd8005269

It is an opaque namespace, not a strong authentication secret. This project is
still intended as a single-user/private Command Centre. Add proper authenticated
accounts before treating the mirror signalling endpoints as a public multi-user
service.

## Signulous flow

Codemagic workflow:

    iOS 26 Mirror - Unsigned IPA for Signulous

creates:

    CommandCentre-iOS26-UNSIGNED.ipa

Upload that IPA to Signulous and let Signulous re-sign it for the registered
iPhone.

Because third-party signers may rewrite bundle IDs, the app no longer pins
`RPSystemBroadcastPickerView.preferredExtension` to a specific extension bundle
identifier. In Apple's broadcast panel select:

    Command Centre Mirror

then tap Start Broadcast.

## Expected flow

On iPhone:
- Open the native Command Centre.
- Mirror → Start iPhone screen mirror.
- Note the six-digit code.
- Apple's broadcast chooser opens.
- Select Command Centre Mirror.
- Tap Start Broadcast.

On laptop:
- Command Centre → Mirror.
- Enter the six-digit code.
- Join mirror.

The iPhone screen should then be delivered over WebRTC.

## Limitations

- Video mirroring is implemented; app/microphone audio is not forwarded yet.
- DRM-protected video may intentionally appear black.
- Some networks need TURN; the current build has STUN only.
- Whether a third-party signing service supports every embedded extension type
  depends on that service's current signing/provisioning behaviour. If Signulous
  rejects or strips the Broadcast Upload Extension, Apple Developer signing will
  still be required.


## Mirror v4 media changes

- Corrects ReplayKit orientation mapping: `.right → 270°`, `.left → 90°`.
- Sends ReplayKit `.audioApp` as mono Float32 PCM on the WebRTC data channel
  `command-centre-audio`.
- Responds to the receiver `ready` signal by re-posting or ICE-restarting the
  offer so installed desktop PWAs can recover from startup races.


## v4.3 audio extraction

ReplayKit audio is now read directly from the CMSampleBuffer's AudioBufferList
instead of being copied through AVAudioPCMBuffer. This handles the common
interleaved signed Int16 stereo layout used by ReplayKit and adds one-shot
diagnostic messages over the audio data channel.
