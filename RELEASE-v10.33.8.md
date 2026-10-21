# v10.33.8 — Phone database recovery and safer note sync

Recovery storage and the account cache now invalidate connections on close and
version-change events. A closing connection or aborted database transaction is
retried up to three times on a fresh connection. Retries replay whole local
transactions without clearing databases or saved records. Quota, schema and data
errors remain visible. If storage stays interrupted, sync asks the user to reopen
the app and retry while keeping their local data.

Note sync compares normalized content with consistent defaults. Object property
order, save timestamps and generated schoolbook previews no longer produce
conflicts when the actual writing and pages match. Old sync metadata remains
readable and upgrades as each note syncs.

Each downloaded or uploaded note commits its revision baseline in the same
protected state record as the notes before sync advances to the next request.
Interrupted uploads no longer lose the progress of earlier notes. The baseline
also survives full localStorage through IndexedDB and native recovery. Account
switches retain the correct account's baseline. Genuine conflicts use a stable
copy identifier so an interrupted pass can preserve the same version without
creating another copy. Drafts opened during a download are left pending.

Account now offers **Clean up identical copies**. It compares complete note
content or every schoolbook page and photo, ignoring generated IDs, timestamps
and the conflict-copy title suffix. Originals and distinct versions are kept.
Before making changes it commits a recovery snapshot, then moves redundant
conflict copies to Recently Deleted. No writing is merged automatically and
nothing is permanently deleted. Copies with unique content remain available for
the user to review. This release has not inspected or changed the user's phone
data; cleanup runs only when its button is pressed on the updated device.

Validation: all 277 automated tests pass, including regressions for interrupted
sync, lost connections, atomic retry, localStorage quota, schoolbook photos,
editor races and conservative cleanup. All 14 real-browser recovery tests pass,
including reconnects for recovery storage and the account cache. Project and web
asset validation also pass. iPhone suspension itself was simulated; physical
iPhone testing remains necessary after deployment.

Deploy the full web release with `npm run deploy`. Native iOS remains 1.16.1
(build 25); no new Codemagic build or database migration is needed for this fix.

Deployed to https://bcommand-center.wolvesgidaree.workers.dev/ with Worker version
`ff92692d-9cec-42d4-8de0-f1711f314533`. All 33 deployed app assets match the
tested local release, including the HTML, service worker and updated sync/storage
scripts. Reopen or refresh the phone app, then use Account → Sync now. Once sync
finishes, run Clean up identical copies if redundant conflict copies remain.
