# v10.42.0 — StreamCorner in Entertainment and iPhone

Entertainment → Movies & TV now has a StreamCorner entry. In the native Windows
and iPhone apps, Browse & watch opens the source as a separate top-level browser
view in the same app window. Back returns to the preserved Command Centre page.
The Windows app no longer shows a persistent StreamCorner toolbar button.
Sport's Provider 2 selection still offers the same source.

The new iPhone view uses its own nonpersistent WKWebView data store. The native
bridge accepts only the fixed open command from Command Centre's exact HTTPS
main frame. Source popups, external-app links and unrelated top-level
navigations are blocked. Its player remains under StreamCorner's HTTPS origin;
no CSP, certificate, DRM or web security policy is weakened. A narrowly matched
popup advertising script is filtered so it cannot intercept source selection.

The iOS project and its extensions are version 1.17.0 (build 26). Codemagic's
`ios-26-signulous-ipa` workflow packages `CommandCentre-iOS26-v1.17.0.ipa`
as an unsigned/ad-hoc IPA for the existing signing workflow. A completed
Codemagic build is required before the IPA can be downloaded; it needs signing
before installation on an iPhone. Video compatibility depends on the selected
provider source and must be verified on a device. Select an Apple-marked
StreamCorner source on iPhone.

Windows portable package: `artifacts/Command-Centre-Windows-1.0.1.zip`.

Validation: `node scripts/check-project.mjs`, `node scripts/check-web-assets.mjs`,
all 336 Node tests, and the Windows 1.0.1 package build passed. The iPhone
Swift source requires Codemagic compilation and on-device playback validation.
The Codemagic workflow now watches pushes to `main`; automatic builds require
the repository's Codemagic webhook to be connected.
