# v10.38.0 — MangaKatana source

Manga → Discover → Manga source now includes MangaKatana. Search titles, open
their English chapter lists, and read ordered chapter images in the existing
reader. Favourites and per-chapter page progress use the same backup, recovery
and signed-in account sync as the other sources. Titles from different sources
retain separate identities.

The Worker reads public MangaKatana HTML through fixed HTTPS site hosts and
validated title/chapter paths. Redirects are checked before each request. Cover
and reader-image hosts are restricted to the source's own image paths. The
literal public page URL array is parsed as data; upstream scripts are never
executed. Access failures, rate limits and missing reader data give explicit
errors, with the existing title/chapter source link available in the reader.

No new API key, Worker variable, database migration or native iOS build is
required. The existing sources remain available. The web release and offline
shell version advance together so installed apps request fresh assets.

Validation: all 323 automated tests pass, including MangaKatana parsing, redirect
and host validation, Workers runtime routes and library backup/sync
normalisation. The local browser preview verifies selecting the source,
searching, reading, moving to the next chapter, favouriting, reloading and
resuming the saved MangaKatana chapter. Live source fixtures verified 373
chapters and 77 ordered page URLs for Blue Lock chapter 1.

Published at https://bcommand-center.wolvesgidaree.workers.dev/?release=10.38.0
with Worker version `9d88a13d-21b9-4d18-ace4-70974a89cdd8`. All 37 linked
deployed app assets match the tested release. Live API checks return 16 search
results, 373 chapters and 77 chapter-one page URLs for Blue Lock. Live browser
verification confirms the MangaKatana selector, title search and chapter reader;
the first image loads directly from i1.mangakatana.com at 1070 × 615 pixels.
Proof: artifacts/mangakatana-v10.38.0-live-full.png (full context) and
artifacts/mangakatana-v10.38.0-live.png (reader controls).
