# Command Centre v10.32.0

- Adds school exercise books with coloured covers, subject labels, lined or
  squared paper, up to 200 separately titled pages, formatting and local autosave.
- Adds inline photos to ordinary notes and books through file selection, camera,
  paste and drag-and-drop. Images are resized for storage and included in backups
  and account sync.
- Keeps music playing when navigating away from Music or switching browser tabs.
  The native iOS 1.14.0 project adds an independent Audius audio player, background
  audio, queue playback and lock-screen controls.
- Generates Connections from a shared pool of independent categories and excludes
  recent categories and words. A finite curated pool can eventually repeat.
- Replaces generated crossword anagrams with written definition clues.
- Adds invite-only accounts and note/photo/schoolbook sync through your existing
  Cloudflare Worker, D1 and R2. Registration defaults to a maximum of 10 accounts.
- Changes the TimStreams provider URL and allowed data host to `https://timst.top`.
- Adds an Add to watchlist toggle directly to the movie/TV player and a Watchlist
  tab to reopen or remove saved titles. The watchlist is retained in local app
  data and backups, separately from Continue Watching.

## Existing local data

The update retains `commandCenterV3`, its local mirror, and the existing recovery
database. Before new-version migrations, it commits a full pre-upgrade recovery
snapshot, including existing app settings and records. Linking an account also
takes a snapshot; simultaneous edits are kept as separate copies. Photo-heavy
backups and native recovery files now support up to 64 MB. Failed book saves keep
the editor open. Installing the rebuilt IPA requires the same bundle/signing
identity over the existing app; uninstalling or clearing website storage would
remove local data independently of this update.

## Install

Use the complete `Command-Centre-v10.32.0-COPY-THIS` folder, or extract the full ZIP
over the existing source project. Keep the existing Cloudflare database, bucket,
secrets, site origin, native bundle identifiers and signing identity.

Follow [ACCOUNTS-SETUP.md](ACCOUNTS-SETUP.md) to apply migration
`0013_accounts.sql`, configure `ACCOUNT_INVITE_CODE`, and deploy the Worker/assets.
Rebuild the included iOS **1.14.0 (build 22)** project through the existing
Codemagic workflow to enable native background audio and camera permission text.
No IPA was compiled on this Windows machine.

## Validation and limits

- Full automated suite: 137 tests passed, including real local D1/R2 account,
  session, isolation, conflict, image, deletion and capacity checks.
- Browser recovery suite: 12 passed, including exact pre-upgrade snapshots,
  quota fallback, malformed state protection, and image/page recovery.
- Browser QA: created a two-page exercise book, inserted an image, saved,
  reloaded, reopened and verified each page and the image remained.
- Watchlist QA: saved a movie and TV series with the same numeric ID, reloaded,
  verified both persisted, removed only the movie, and reopened the series.
- Browser bundles compiled with `npm run build`. A Messages rate-limit test now
  pins its clock to avoid a false failure when requests span a minute boundary.
- Project syntax, HTML IDs, extension manifest and full Worker bundle validated.

The Cloudflare changes have not been deployed. Native Swift compilation and
physical-device background audio/camera behavior require the Mac build and device
checks. Browsers and operating systems can suspend playback; YouTube still uses
its official visible player and cannot promise locked-screen/background playback
on iOS. Native Audius queues preserve YouTube entries and pause at them until
Music is opened and Next is tapped. TimStreams' homepage was reachable, but its
live-feed response and stream playback could not be verified from this environment.
