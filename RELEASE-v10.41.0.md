# v10.41.0 — Windows native StreamCorner view

Command Centre for Windows 1.0.0 opens the published dashboard and StreamCorner
in separate native WebView2 controls within the same window. The source is a
top-level browser document, so its players do not inherit the Command Centre
iframe ancestor that their CSP rejects. No CSP headers, certificate validation,
DRM checks or browser security settings are changed.

Use Sport → StreamCorner → Browse & watch in app in the desktop app, or its
native StreamCorner button. Back to Command Centre disposes the source view,
stops its media and restores the existing dashboard. The native toolbar also
provides source history, home and reload. No player URL is restored on launch.

The main profile and source profile are separate. The source has no dashboard
cookies, account API keys, host objects, web-message bridge or injected app
bootstrap. The only desktop command opens a fixed StreamCorner URL and validates
the sender's exact HTTPS app origin. Unexpected source navigation, popup
windows, downloads and external-app launches are blocked. A narrowly matched
aclib PopUnder advertising loader is blocked after it was observed repeatedly
intercepting match-link clicks. Other provider and player scripts remain intact.

The Windows app is portable, targets x64 .NET Framework 4.8 and uses Microsoft's
Evergreen WebView2 Runtime. Its pinned official NuGet SDK is 1.0.4258.31.
The build script runs native origin/navigation policy tests and packages the
executable, required DLLs, Microsoft notices and instructions together.
No signing certificate was supplied, so the executable is not code-signed.

Sign into the same Command Centre account in the desktop app for synced data.
It does not import browser-only storage or the user's Edge/Chrome profile.

Browsers and existing iOS IPAs retain the contained web view. The same native
design is possible with a separate WKWebView on iOS, but requires native source
changes, a rebuilt IPA and on-device testing with an Apple-compatible stream.
No iOS version or native iOS source is changed by this release.

Validation: all 334 web tests pass, including native delegation, browser/older-IPA
fallback, source isolation, view lifecycle and real Worker route checks. Native
origin, fixed-command, source URL and narrowly matched popup-script policies
pass their compiled C# checks. Runtime verification and publication are recorded
below once complete.
