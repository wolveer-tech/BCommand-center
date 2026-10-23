# StreamCorner popunder-loader guard for Chrome

This optional Chrome extension blocks one script URL previously observed loading
a StreamCorner popunder. It acts only when a listed StreamCorner or player domain
is the top-level page. It does not run JavaScript on websites, inspect page
content, read browser history or account data, change browser security settings,
or send data anywhere. There are no external libraries or automatic updates.

Chrome 145 or newer is required. The manifest requests only the
`declarativeNetRequest` permission; Chrome may show a warning that the extension
can block page content. The single packaged rule blocks a script request for
`https://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js` (with
an optional query string) on the listed top-level domains. It does not block
other ad scripts or prevent every new window. Chrome controls navigation outside
the installed Command Centre app's scope, so the extension cannot guarantee
that StreamCorner stays in that app window. It does not affect iPhone playback.

To try it, extract the ZIP. In the Chrome profile used by the **Command Centre**
shortcut, open `chrome://extensions`, turn on Developer mode, choose **Load
unpacked**, and select the extracted `streamcorner-guard` folder. Keep that
folder while the extension is in use. Reload the installed Command Centre app
before trying StreamCorner again.

This has not been verified against your live Chrome session. To remove it, use
Chrome's Extensions page and turn Developer mode off if you no longer need it.
