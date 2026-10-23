# v10.42.1 — StreamCorner browser playback route

The browser version now opens StreamCorner at its own top-level URL in the
same tab. This removes Command Centre as an iframe ancestor of StreamCorner's
player. Use the browser Back button to return to Command Centre. The Windows
and iPhone native app routes are unchanged.

The extra frame caused StreamCorner's player host to refuse connection in the
online app even when the site worked directly in Chrome. This change fixes the
browser route; it does not change a source's compatibility with iPhone Safari.

Validation: project and web asset checks and all 337 Node tests passed.
