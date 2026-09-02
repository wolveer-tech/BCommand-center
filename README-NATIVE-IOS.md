# Command Centre native iPhone mirror — iOS 26

This version is for an iPhone running iOS 26.x.

## Why ReplayKit is used

The browser/PWA cannot capture the full iPhone display. On iOS 26, this project
uses a ReplayKit Broadcast Upload Extension to receive full-display video frames
and forwards those frames to the existing Command Centre laptop receiver over
WebRTC.

Apple's current SDK marks the ReplayKit broadcast APIs as deprecated in favour
of ScreenCaptureKit. They are used here as the compatibility path for iOS 26.

## User flow

1. Install and open the native Command Centre app.
2. Open Mirror.
3. Tap Start iPhone screen mirror.
4. Command Centre creates a 6-digit room code.
5. iOS opens Apple's broadcast confirmation UI.
6. On the laptop open Command Centre → Mirror → Watch on this device.
7. Enter the 6-digit code and press Join mirror.
8. On the iPhone confirm Start Broadcast.
9. The iPhone display should appear on the laptop.

## Current scope

- Full-screen video: implemented.
- Pairing/WebRTC: implemented using the existing Worker mirror routes.
- App audio/microphone audio: not forwarded yet.
- DRM-protected video may be blank/blocked by iOS or the content provider.
- A TURN server may still be required on restrictive networks.

## Signing

The app and extension must be signed with the same Apple Developer team.
Enable the App Groups capability for both bundle IDs using:

    group.tech.wolveer.commandcentre
