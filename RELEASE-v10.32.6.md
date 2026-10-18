# v10.32.6 — Glass workspace, manga library and Wordle typing

- Movies & TV: Alternate now uses **1Shows**, and Aggregator now uses **Anicine**. Both receive the selected TMDB title and TV season/episode. Primary, Flixer, Atlantic and Boomflix retain their existing routes. The two replacements work without new Worker variables.
- Manga: Discover, Favourites and History tabs, hearts on search results and titles, a Continue Reading card, and saved chapter/page/language progress. Resume works for a saved chapter even when it is outside the first chapter-feed page. History retains the latest 200 chapters; favourites stay separate for Asura and MangaDex.
- Storage: manga favourites/history share the existing local state and recovery snapshots, and merge into JSON backup imports/exports. They persist on this device; the existing account sync still covers notes and schoolbooks only.
- Appearance: translucent panels, pastel gallery tiles, rounded cards, floating navigation docks, pill tabs and lighter fade/slide motion. The gallery scrolls on smaller screens. Reduced-motion preferences and Motion settings remain supported.
- Wordle: tap a square to use the device keyboard; typing advances automatically, Backspace clears/moves back, arrows select squares, and paste fills the row. Enter submits a complete guess and focuses the next row. Submitted rows remain locked, and the on-screen keyboard still works.

## Validation

`npm run check` passed. All **188 tests** passed, including source routing, manga backup/history merging, Wordle typing, and the existing crossword tests. Browser checks used disposable local manga fixtures to verify favourites, saved-page tracking, persistence after reload and page-accurate resume. Wordle typing and next-row focus were verified in the browser; desktop and 390px mobile layouts were reviewed.

Source title routes were checked against the public 1Shows and Anicine pages/scripts. Live video playback was not tested. External source availability and framing policies can change; the existing Open provider action remains available.

## Use this release

Deploy the project through the existing Cloudflare workflow. No database migration, additional secret or new IPA is required. The updated service worker refreshes the app shell and keeps the new assets available offline. This release was prepared locally and has not been deployed.
