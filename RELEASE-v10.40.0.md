# v10.40.0 — StreamCorner inside Command Centre

Sport → StreamCorner → Browse & watch in app opens the source in a full-window
modal within Command Centre. The external website button from v10.39.0 is
replaced. The app's own Back to Sport and Restart controls remain visible while
the user browses StreamCorner, selects a match and chooses a player source.
No native rebuild is required for this web change.

The source keeps its own HTTPS origin and browser protocol. No provider code is
copied or executed by the Worker and no security headers are stripped. The
iframe supports autoplay, fullscreen, encrypted media and picture-in-picture,
while its sandbox excludes popups and top-window navigation. Its matches are
not fabricated into the app's match API. Auto continues to select providers
that supply individual match/player feeds.

The full-window layout avoids the small-frame environment that redirected the
source during earlier inspection. The current browser test confirms the real
StreamCorner catalogue loads, match navigation and source selection remain in
the modal, and the top-level app URL does not change. The 390 × 844 phone layout
reflows correctly. Back unloads the source and restores focus; Escape, app
navigation and pagehide also release it. A memory/failure event supplies an
in-app restart state. Source URLs are not saved or reopened after a cold start.
Document load is never described as successful video playback.

Playback limitation: the live source hosts tried for Liverpool–Villarreal and
NFL Network returned blank frames, connection refusals or a timeout in this
browser environment. The app now contains the source browser and player
selection, but successful live video playback could not be confirmed. No DRM,
browser security check or provider access control was bypassed. On iPhone,
choose a source that StreamCorner labels with the Apple icon; many of its other
sources are explicitly desktop/Android-only.

Validation: all 332 automated tests pass, including the contained-view lifecycle,
navigation containment, unchanged media sandbox, fixed source URL, Auto routing
and actual Worker routes. The complete Worker bundle and all 39 linked local
assets validate. Publication and live UI verification are recorded below.

Published at https://bcommand-center.wolvesgidaree.workers.dev/?release=10.40.0
with Worker version `6cdfe02e-7406-46ff-863a-32cf3ff2f0fa`. All 39 linked
deployed assets match the tested release. Live API returns embedded mode and
the fixed browser URL. The live browser verifies the contained catalogue and
match/player-source navigation under the persistent Back to Sport toolbar,
without changing the top-level app URL or opening another tab. Preview:
artifacts/streamcorner-in-app-v10.40.0-live.png. Successful live video playback
remains unverified because the tested player hosts failed; device feedback
has been requested from the user.
