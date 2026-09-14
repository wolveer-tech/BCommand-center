# League One results and Notes focus hotfix v10.23.1

This hosted hotfix does not require a new IPA.

- League One results now read FotMob's actual `fixtures.allMatches` collection.
  The earlier release read the wrong response property, so its table could load
  while its completed matches remained empty.
- The selected-league cache key is bumped so Cloudflare cannot serve the old,
  empty League One response after deployment.
- On an iPhone-width screen, focusing the note body now immediately enters
  writing mode even when WKWebView does not report a reduced visual viewport.
- Writing mode directly hides the heading, title, folder, pin row and action
  footer through JavaScript in addition to the CSS rule. The down-arrow button
  restores the full editor controls.
- The service-worker shell cache is `command-centre-shell-v10.23.1`.

Deploy through the normal GitHub-to-Cloudflare workflow. No migration, secret,
Codemagic build, IPA rebuild or Signulous step is required for this hotfix.

Static project validation and the complete local suite pass: **80/80 tests**.
