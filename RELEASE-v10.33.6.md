# v10.33.6 — Sports, recovery, image editing and manga sync

Matchora (`matchora.to`) and PPV (`ppv.tj`) are additive sports sources. Existing
sources remain available. Matchora uses its [documented public API](https://matchora.to/developers)
with match and channel embeds. PPV uses the public feed referenced by its own
site, including alternate players. If PPV rejects the Worker server's request,
the app uses its public CORS-enabled feed directly from the device, without
credentials. Requests have bounded timeouts, and player
URLs must match observed HTTPS hosts and paths. No Worker variables are added.

Players offer Stop and Retry. A frame that never finishes loading is unloaded
after 25 seconds; video errors and prolonged stalls stop playback. An iframe
document load cannot prove that its cross-origin video is playing, so loaded
frames also receive a manual recovery hint. Stale source-resolution and listing
responses cannot restart a closed player or overwrite a newer selection.
Playback URLs are never restored automatically on startup.

Native iOS **1.16.0 (build 24)** handles a terminated WebKit content process by
opening a clean Home document. Automatic recovery is bounded; repeated failures
offer an explicit Open Home action. Memory warnings stop active web players,
navigation requests time out, and content-filter preparation cannot hold the
initial launch indefinitely. These changes do not erase website storage or the
paired-device identity.

In Notes and Schoolbooks, select an inserted photo to resize it with a slider or
corner handle. Drag Move to place it between paragraphs, use the arrows to move
it earlier/later, and choose Left, Centre or Right for horizontal placement.
Layout survives saving, page changes, backups and account sync. Editing controls
are excluded from saved HTML. Existing plain images gain controls when opened;
deleted notes stay read-only.

Manga history sync runs independently before note uploads, so a note failure
cannot block reading progress. Legacy notes-only account links upgrade safely,
signing in links device data, and the manga library displays its sync status and
Sync now action. Use the same account on both devices. Account switching retains
separate local copies and the existing snapshot protection.

All selectable football competitions can use verified FotMob competition feeds
without another API key. Knockout competitions load fixtures and results even
without a league table, displaying rounds instead. FA Cup includes qualification
and keeps qualifying rounds separate from the main competition. A newer
qualifying season is never mixed with the previous main-cup season. The Upcoming
filter exposes fixtures beyond the daily schedule. The displayed season comes
from the provider: at verification, the women's FA Cup main feed still supplied
2025/2026; its historical results are labelled with that season.

Women's Super League, Women's Champions League, NWSL, Women's League Cup and
Women's FA Cup are selectable after the men's competitions. Combined schedules
and team searches put men's results first. Team search offers direct Follow
buttons and loads the club's fixtures across competitions. Men's and women's
clubs with the same name keep distinct identities when following and alerting.

Match Centre lineups arrange starters on a pitch using provider coordinates,
with formation/position fallbacks. Shirt numbers, names, a full starting list
and the bench remain available. Phone layouts stack the two teams.

Native Live Activities show an **estimated second-half countdown** during
halftime on the Lock Screen and Dynamic Island. It uses the observed half
duration when available, otherwise a 15-minute estimate from first detection.
The deadline is retained across server updates and cleared when play resumes;
extra-time breaks do not receive a second-half timer. The timer stops at zero
and waits for the feed to confirm the restart. The server adds its optional
deadline column automatically; no manual database migration is required.

Validation: project check and 244 automated tests passed. Six browser image
checks cover controls, resizing/alignment persistence, reordering, schoolbook
layouts, old images and read-only notes. Mouse dragging was exercised for both
moving and resizing. Live public feeds verified FA Cup qualifying fixtures,
women's standings, men-first team search, following without league navigation,
and both teams' graphical lineups. A 390 px phone view displayed 22 starters
without horizontal overflow. Native source and payload contracts are checked;
the IPA cannot be compiled or device-tested on this Windows host. Actual video
playback and physical-device crash recovery are not confirmed by these checks.

Deploy the web update with `npm run deploy`. Build the updated IPA through the
existing Codemagic workflow and install it over the current app to receive the
native crash recovery and halftime Live Activity UI.

Deployed on 18 October 2026 to https://bcommand-center.wolvesgidaree.workers.dev/. Live checks confirmed all five sports sources in the selector, Matchora listings, current FA Cup qualification and WSL tables, and men-first team search. PPV’s server rejection was reproduced and its public browser fallback displayed 36 football listings in the app.

Final Worker version: `448783e5-cd1c-4036-bb40-3c6ce3553f62`.
