# StreamCorner popup guard for the installed Chrome app

This Chrome extension blocks the one popunder script observed in StreamCorner
and suppresses new windows opened by StreamCorner and its listed player pages.
A user-initiated link to a listed source is sent to the current window. It is
an optional, local guard for the Chrome-installed Command Centre app, not part
of the website or the iPhone app.

Chrome will show permission to read and change data on the listed sites because
the guard runs a content script there. The script only checks clicked links and
`window.open` URLs; it does not collect page content, browsing history,
passwords, or Command Centre account data, and it makes no network requests.
An extension still adds a small security and compatibility risk. Its source is
in this folder, it has no automatic updates, and it can be removed at any time.

To try it, extract the ZIP and load this folder in the same Chrome profile used
by the **Command Centre** shortcut: open `chrome://extensions`, turn on Developer
mode, choose **Load unpacked**, and select the extracted
`streamcorner-guard` folder. Reload the installed Command Centre app before
trying StreamCorner again. Keep the extracted folder while the extension is in
use; Chrome loads the code from there.

This has not been verified against your live Chrome session. Chrome controls
navigation outside Command Centre's installed-app scope, so the guard cannot
guarantee that StreamCorner stays in the same app window. It cannot make an
incompatible iPhone stream play or guarantee that an upstream source remains
available. To remove it, use Chrome's Extensions page and turn Developer mode
off again if you no longer need it.
