# v10.34.0 — Adaptive schoolbook practice

Open Schoolbooks → Practise from a book. Select one book, choose its lesson
pages, optionally include photos/diagrams, enter a course or exam board, and
generate five or eight questions. A-level / Higher is the default. GCSE /
National 5 and university levels are also available.

The tutor uses the selected pages to build a question bank, mainly asking for
explanation, application, analysis and justified evaluation. Each question has
two to six independent marking points, a hint, a model answer and evidence tied
to the real selected page. Question sets with invalid citations, unsupported
text quotations, duplicate questions or malformed marking schemes are rejected.
Photo quotations need human checking against the original image; unreadable
photos should result in a request for clearer material, not invented content.

Students answer in their own words. DeepSeek marks each answer against the
provided marking points, credits equivalent reasoning, and returns specific
feedback. Marks are calculated from validated binary awards against the local
scheme, not from an arbitrary AI total. Two strong independent answers raise
the target difficulty; a score below half lowers it. Hints and revealed answers
are recorded as assisted practice. Easier/Harder controls adjust the target;
they preserve a partly written answer. Question selection avoids repeating an
already answered question in the current set.

Feedback includes the credited/missed points, a worked answer and source-page
links. The end-of-set view highlights weaker questions and supports review.
The next set retains the challenge target for the same book. These are revision
marks, not official exam grades or a guarantee of syllabus coverage.

The integration uses the existing Settings → DeepSeek API key, calling the
official Chat Completions API directly with `deepseek-flash`, image content
parts and JSON output. Only selected page text/photos are sent for generation;
answer marking sends the question, marking scheme, evidence and student answer.
Other schoolbooks, previous unselected questions and API credentials are never
included in the study payload. The key is used only in the authorization header.
Nothing is generated or charged automatically: a student initiates generation
or answer checking. A DeepSeek API balance is required.

Official API contracts were checked against:
- https://api-docs.deepseek.com/guides/vision/
- https://api-docs.deepseek.com/api/create-chat-completion/

Source selections are bounded to 48,000 text characters, 12 photos and 12 MB of
inline image data per set. Oversized selections produce an actionable message;
source information is not silently truncated. Photos may be excluded explicitly.
Photo text remains subject to AI reading errors, so original-page review stays
available.

Active sessions, draft answers and eight recent sessions are saved in a separate
IndexedDB database, partitioned by the schoolbook account owner. Practice is
local to this device and is not yet account-synced or included in portable book
backups. It does not modify schoolbook records, the notes sync protocol or the
existing sync-recovery fix. Drafts are saved after a short typing pause. A failed,
cancelled or timed-out provider request retains the answer and previous set.
API errors distinguish rejected keys, missing credit and rate limits. There are
no automatic paid retries. On phones, setup collapses for an active session and
the question appears before practice history.

Validation: all 287 automated tests pass; project and complete-asset checks pass.
Browser checks with an explicitly mocked provider cover source selection,
question generation, answer feedback, page links, reload/resume, failed requests,
cancellation, changing difficulty without losing drafts, assisted answers,
completion, another set and local history. The full app was checked at a 390 px
phone width without horizontal overflow. No real DeepSeek key, paid request or
personal schoolbook was used in testing; real provider quality and latency still
depend on the student's source material, key and account access.

Web release only: native iOS remains 1.16.1 build 25. No new IPA, migration,
Worker secret or server-side AI subscription is needed.

Deployed to https://bcommand-center.wolvesgidaree.workers.dev/ with Worker version
`5dd55999-60ef-4bca-8805-d37c1f314e36`. All 36 deployed app assets match the tested
local files. Refresh/reopen the app to load the new schoolbook practice entry.
