# Command Centre iOS 26 Mirror — Signulous-friendly build

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
