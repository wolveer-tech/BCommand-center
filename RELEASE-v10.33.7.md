# v10.33.7 — Launch animation, restored UI and iPhone storage

The deployed site had reverted to an older asset set: the shared glass and
workspace design files were missing, and Cloudflare's SPA fallback returned HTML
for their URLs. This release includes the complete current public directory.
`npm run deploy` now checks all linked local assets first. After deployment,
`node scripts/check-web-assets.mjs --url=https://bcommand-center.wolvesgidaree.workers.dev/`
checks exact file hashes and CSS/JavaScript response types.

Every shell script and stylesheet uses the new release URL. The service worker
caches one entry per file instead of duplicates for every historical release or
query string. It refuses HTML masquerading as a script or stylesheet and retains
the previous active shell if installation of the new shell is incomplete. Old
Command Centre shell caches are removed after successful activation; other
caches and durable website data are left alone.

Native iOS uses three lightweight composited star layers instead of a canvas
animation during launch. Browser/PWA launches retain the existing canvas stars.
Completion has its own timer independent of animation frames. A synchronous
native privacy snapshot avoids waiting for a missed initial status event, and
locking part-way through the animation dismisses its overlay. Skip, replay,
reduced-motion and once-per-native-launch behaviour remain available.

The former startup path requested all recovery snapshots repeatedly and native
file writes ran on the UI thread. Snapshot history now loads when Settings is
open. Native reads, writes and compression run on a serial background queue;
startup recovery requests only the current record. Large recovery JSON is no
longer embedded in the document-start script. App initialization still waits for
the normal asynchronous recovery request before applying saved state.

Native recovery files use lossless LZFSE compression. Existing JSON files migrate
one at a time and are removed only after the compressed file on disk round-trips
to identical bytes. Existing recovery history remains available, with the same
twenty-snapshot retention policy. This does not compress or reduce the quality of
the user's actual photos, notes or downloads.

In the updated IPA, Settings → General → Storage offers **Clear cached files**.
The native operation removes only WebKit's HTTP disk/memory caches and URLSession
cached responses. It preserves localStorage, IndexedDB, cookies, account links,
offline shell, user downloads and recovery snapshots. The same disposable-cache
cleanup runs weekly, after launch. Storage reduction depends on the data present;
the reported 308 MB cannot be measured or guaranteed to reach a particular size
from this Windows workspace.

Native release: **1.16.1 (build 25)**. Update root `codemagic.yaml` and the complete
`native-ios` directory from this release, commit to the branch Codemagic builds,
and build **Command Centre iOS 1.16.1 Smooth Launch and Storage**. Install over the
existing app with the same signing identity and bundle ID. For web deployment,
use the full release directory, including `public`; updating only native files
does not deploy web design assets.

Validation: 255 automated tests and the project/asset checks pass. Browser checks
cover the native compositor path with canvas and animation frames disabled,
automatic exit, replay, normal PWA rendering and the restored interface. Native
Swift cannot be compiled or run on an iPhone on this Windows host; Codemagic must
compile the IPA, and physical-device storage savings remain unmeasured.

Deployed web release: https://bcommand-center.wolvesgidaree.workers.dev/
Worker version: `9d27187f-f89c-478f-80e4-9b967ff0beca`. All 33 deployed app assets matched the local
release byte-for-byte. A 390 px live view showed the restored design with no
horizontal overflow. The local native-bridge preview confirmed the Storage
control and its completion feedback; this simulates the bridge, not an iPhone.

The shared GitHub repository was later identified as wolveer-tech/BCommand-center.
Its 12:33 BST iOS upload retained web 10.31.0, followed by the old-web deployment
at 12:33:39. Updating the full repository prevents later native uploads from
reintroducing that obsolete web asset set.
