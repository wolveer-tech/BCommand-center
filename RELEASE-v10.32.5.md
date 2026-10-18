# Command Centre v10.32.5

The MangaDex result for Solo Leveling has no hosted English chapters. The Manga Reader now defaults to Asura Scans and offers a source selector so readers can also choose MangaDex. A title with no readable chapters explains that the reader can switch sources. The Asura reader uses public title, chapter and image URLs without loading site scripts into the app. Source links still open the original title or chapter.

On the public Asura site, a search for **solo leveling** returned Solo Leveling; its series listed 201 chapters, and chapter 1 exposed 22 ordered page images. The isolated browser preview loaded the first two images and displayed manga panels at phone width. The 390px layout had no horizontal overflow. Actual availability depends on the source site continuing to serve these public pages and images.

Tests cover source parsing, numeric chapter order, page order, URL validation, same-site redirects and the local Cloudflare Workers runtime. Existing notes, schoolbooks, account data and their storage formats are unchanged.

Run `npm run deploy` from the project directory. Refresh the app, open **Manga**, search for **solo leveling**, choose **Solo Leveling**, then select a chapter. No database migration, account secret, or new iPhone build is needed for this web update.
