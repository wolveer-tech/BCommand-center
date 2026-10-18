# v10.33.1 — Smoother scrolling, protected playback and clay icons

## Scrolling

The back-to-top handler previously walked every descendant of the active page,
read computed styles, and repeated the walk to determine scroll position. Both
window and document listeners could run it for the same scroll. It now batches
events once per animation frame and remembers actual scrolling containers.
Home exits before measuring layout. Nested scrolling and Back to top remain
supported. The clock also avoids writing unchanged text every second.

Home, widgets, sidebar, topbar and fixed docks use painted surfaces instead of
nested live backdrop blurs. The fixed background attachment and icon drop-shadow
filters are removed. Touch devices avoid sticky hover transforms. Page entrances
and button feedback remain available, including reduced-motion support.

The Home swipe-down shortcut is removed entirely. Search and customisation use
their buttons; scrolling cannot invoke the removed gesture.

## Playback stays in the app

**Play** no longer automatically opens sources that only support an external
reader/player. It offers a choice of another source or the explicit **Open provider**
button. Automatic source launches no longer leave the app.

Compatible mode removes the iframe sandbox only when the native app advertises
its independent popup/navigation protection (iOS 1.15.0). In regular browsers and
older wrappers, it retains popup and top-navigation restrictions. Sites rejecting
those restrictions may require the current native iPhone app. Browser sandboxing
cannot simultaneously guarantee popup blocking and satisfy providers requiring
an unsandboxed environment; see the [iframe reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox).
Native common-ad filtering remains available; in-player ads may remain.

## Icons

Twenty original rounded 3D-style vector illustrations replace the pastel geometric
artwork. They use highlights, gradients and shallow extrusion on dark equal-sized
tiles, matching the supplied references. The shared SVG sprite uses no blur
filters, animation, large bitmap downloads or third-party icon library. Section
headers and the sidebar share the new artwork.

## Validation

`npm run check` and all 203 regression tests passed. Focused checks also passed
after removing the Home gesture. Tests cover batching 100 scroll events into one
frame, nested scroll support without tree/style scans, browser/native player
policies, and preventing automatic external launches.

The local browser test player attempted both a popup and a top-level redirect;
both were blocked in Compatible mode and the app stayed on the original page.
Desktop tiles measured 213 × 213 pixels, phone tiles 157 × 157 pixels, with no
horizontal page overflow. All seven Home/widget/dock surfaces reported no backdrop
blur. Scrolling the phone-sized preview left Home sheets closed. These are layout
and code-path checks, not a physical-iPhone frame-rate measurement.

This is a web update. Existing iOS 1.15.0 installations need no new IPA, migration,
secret or account reset. Deployed on 14 October 2026 to
https://bcommand-center.wolvesgidaree.workers.dev, Worker version
`b4846de3-7d82-44a6-a701-f8b36e3b2006`. The live page was verified to load
10.33.1 scripts and artwork, report no Home backdrop blur, show the updated Home
caption and retain the equal tile layout without horizontal overflow.
