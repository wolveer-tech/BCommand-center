# v10.37.1 — reliable lesson-practice updates

Includes v10.37.0 lesson transcript and picture quizzes. The practice core, lesson
editor and controller now ship together as one browser bundle, with companion
styles. These new asset paths bypass older offline workers that could serve the
previous practice code alongside a fresh page. Future versioned asset requests
newer than the active offline shell fetch fresh code before using the cache.
Canonical cache entries and offline fallbacks remain; bad stylesheet responses
cannot overwrite saved styles with SPA HTML.

`npm run build:practice` builds the practice bundle. Predeploy rebuilds it before
asset validation, preventing stale generated files from being published. The
unbundled sources remain the editing and server-contract sources.

The complete feature and usage guide is in LESSON-PRACTICE.md. No new database
migration, Worker secret or native iOS build is required. All 311 automated tests
pass, including cache/bundle transitions. Provider responses are mocked and no
paid AI requests are used.

Published at https://bcommand-center.wolvesgidaree.workers.dev/ with Worker version
`32dca6fe-9b9b-4ef4-b147-c89048341fb0`. All 37 linked deployed app assets match
the tested release. Live browser verification confirms the lesson selector and
transcript/picture editor appear on the first navigation from the older cached
app, including when no schoolbooks exist. The live preview is saved in
artifacts/lesson-practice-v10.37.1-live-full.png (full context) and
artifacts/lesson-practice-v10.37.1-live.png (input controls).
