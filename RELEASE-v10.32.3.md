# Command Centre v10.32.3

Schoolbooks has its own main navigation tab and home launcher app. Books appear as covers with independent search, folder, pinned and Recently Deleted filters. Ordinary Notes shows regular notes. Existing books keep their original records, IDs, pages, photos, recovery history and account sync; no data is moved or rewritten to create the tab. Account & sync remains accessible from the bookshelf.

Mini Crossword and Crossword now advance through the selected answer as you type. Given squares are skipped. Click a clue to choose Across or Down, use Space/Enter to switch direction at a crossing, arrows to move, Tab/Shift+Tab to change clues, and Backspace to erase or move back from an empty square. The selected word, square and clue are highlighted. Pasting a word distributes its letters into the selected answer. Existing puzzle progress remains saved.

Manga includes an in-app MangaDex reader with title search, language selection, paginated chapter lists, ordered scrolling page images, previous/next chapter controls, retry and source attribution. Recommendation cards can search the reader by title. Images load lazily and fall back to the original image when a data-saver page fails. Source availability and available translations vary by title. This release implements MangaDex; it does not scrape Asura or Comix.

The reader uses MangaDex's public API, fixed request paths, validated IDs, host validation for returned image servers, metadata caching and actionable rate-limit errors. No API key, database migration or new secret is required. Source references: https://api.mangadex.org/docs/ and https://api.mangadex.org/docs/static/api.yaml.

Validation: 41 relevant Node tests passed and `npm run check` validated the full 321013-byte Worker dependency bundle and client scripts. Browser QA verified the separate bookshelf, exclusion from regular Notes, saving a book, typing a complete Across answer without clicking each square, direction changes and Backspace. Live MangaDex title search returned chapters, and three consecutive page images loaded inside the app, including the original-image fallback. Schoolbooks and the reader fit a 390px phone viewport; the reader also fit an 800px compact laptop viewport without horizontal overflow.

Deploy with `npm run deploy` from the project folder and refresh/reopen the app. These web features do not require a new native iOS build. Native version remains 1.14.0 build 22. QA used disposable localhost note data, and the preview server was stopped after verification.
