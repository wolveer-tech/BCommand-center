# v10.37.0 — lesson transcript and picture quizzes

Superseded by v10.37.1, which also fixes the transition from older offline caches.

Schoolbooks practice now accepts a pasted video transcript and selected lesson
pictures directly, without creating a schoolbook first. The source selector
switches between schoolbook pages and Lesson transcript & pictures. Users can
paste screenshots, upload/drop image files, add captions/timestamps and choose
which pictures to include. Text-only, picture-only and combined lesson sets use
the existing question formats, adaptive difficulty and provider options.

Source evidence opens the original lesson text or picture, including in a resumed
saved set. Transcript quotations are validated, and model instructions explicitly
treat transcripts, image text and captions as untrusted study material. Picture
requests retain image-model checks and existing Automatic provider routing.

Drafts and sources are isolated by the local note-account owner. Picture bytes
are stored separately once; repeatedly saved answers/history use references.
References are committed after their media, and obsolete media is pruned only
after the session save succeeds. A tab-local draft checkpoint preserves quick
text and picture-selection edits across reloads. All material remains local until
Generate. Authenticated AI requests also reject a changed account identifier.

All 308 automated tests pass, including transcript bounds/evidence, selected-image
exclusion, image-only sources, media reference ownership and the authenticated
lesson route. Browser checks cover actual clipboard paste, file upload, captions,
selection, immediate reload, source-picture recovery, written-answer marking and
a 390px phone layout. AI responses were mocked; no paid provider calls were made.

No new database migration, Worker secret or native iOS build is required. iOS stays
at 1.16.1 build 25. Existing schoolbooks, provider keys and SportsindX remain.
See LESSON-PRACTICE.md for usage and limits.
