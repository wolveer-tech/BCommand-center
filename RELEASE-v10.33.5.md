# v10.33.5 — Replace Flystream with ShuttleTV and CineSrc

Flystream is removed from the Movies & TV selector, URL builders, status routes
and local deployment variables. Requests using the retired `flystream` mode now
return HTTP 400 instead of contacting that provider. There are eight sources:
Primary, Alternate (1Shows), Aggregator (Anicine), Flixer, Atlantic, Boomflix,
ShuttleTV and CineSrc. The other six sources retain their routes.

ShuttleTV uses its public watch links:

- Movie: `https://shuttletv.su/watch/{tmdbId}`
- TV: `https://shuttletv.su/watch/{tmdbId}?s={season}&e={episode}`

These formats were checked in the site's public link-building code and browser.
Movie 550 opened as Fight Club; TV 1399 with s=2&e=3 opened as Game of Thrones
S2E3. ShuttleTV's page embeds CineSrc for playback, so the two choices are not
independent streaming backends.

CineSrc uses its [documented embeds](https://cinesrc.st/docs):

- Movie: `https://cinesrc.st/embed/movie/{tmdbId}`
- TV: `https://cinesrc.st/embed/tv/{tmdbId}?s={season}&e={episode}`

Both builders validate numeric TMDB IDs, TV season/episode values, HTTPS and
configured hostnames. Player compatibility, popup protection, saved history,
watchlists, account sync, the dark theme and sports sources are preserved.
The service-worker shell version is refreshed to remove cached Flystream controls.
No new IPA or database migration is needed.

The two new providers use built-in HTTPS addresses and hostname validation, so
this deployment does not add variables to the existing Worker at its free-plan
limit. Optional environment overrides remain supported by the URL builders.

Validation: `npm run check` and all 215 tests passed. Tests cover exact movie/TV
routes, invalid selections, misleading hostnames, retired-mode rejection and the
updated selector. Correct title-page routing does not guarantee playback or
advertising behaviour supplied by the third-party providers.

Deployed on 15 October 2026 to https://bcommand-center.wolvesgidaree.workers.dev/, Worker version 2cd1659a-87d2-45b4-8921-b68967e847c1. Live checks verified all four movie/TV URLs, Flystream HTTP 400 rejection and eight status routes. Both sources were opened inside the app for Fight Club (TMDB 550), showing the matching title and player page. The selector screenshot is artifacts/v10.33.5-live-sources.jpg. Continuous video playback was not verified.
