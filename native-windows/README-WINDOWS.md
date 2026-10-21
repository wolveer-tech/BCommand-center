# Command Centre for Windows 1.0.1

Extract the entire ZIP to a folder and open CommandCentre.exe. Keep the three
WebView2 DLL files beside it. This portable app targets 64-bit Windows with
.NET Framework 4.8 and Microsoft Edge WebView2 Runtime. It does not install
services or change the browser's security settings.

The dashboard loads the published Command Centre website. Sign in with your
usual Command Centre account to access its synced data and account API keys.
Its browser profile is separate from Edge/Chrome, so browser-only data is not
automatically imported. Use the app's existing export/import tools if needed.

Use Entertainment → Movies & TV → StreamCorner → Browse & watch. The source
loads directly in its own native WebView2, with
no Command Centre iframe above its player. Back to Command Centre closes the
source, stops its media and returns to the dashboard without reloading it.
Ctrl+Home also returns. Back navigates source history; Reload retries its page.

The source has a separate persistent profile and no dashboard bridge, saved
API keys, host objects or access to the dashboard's cookies. Source popups,
downloads, external-app launches and navigation to unrelated sites are blocked.
The exact observed popup-ad loader is blocked so it cannot swallow match clicks.
No CSP headers, certificate checks, DRM or browser security policies are altered.
Source availability and video compatibility still depend on the provider.

Profiles are stored under %LOCALAPPDATA%\CommandCentre\Browser\Dashboard and
\StreamCorner. The app never reads or imports your normal browser profile.

If WebView2 is missing, install Microsoft's official Evergreen WebView2 Runtime:
https://developer.microsoft.com/microsoft-edge/webview2/
This executable is not code-signed; no publisher certificate has been supplied.

Build from the project root with:
  powershell -NoProfile -File native-windows/build.ps1

The build pins Microsoft.Web.WebView2 1.0.4258.31 from the official NuGet feed,
runs native navigation policy checks and creates the portable ZIP in artifacts.
Use -Offline once that SDK is cached. A Windows build does not update the iOS
IPA; iPhone would need its own separate WKWebView implementation and rebuild.
