# v10.33.2 — Restore player compatibility and phone content width

Compatible mode again removes the iframe sandbox in both browsers and native
wrappers. Version 10.33.1 incorrectly retained it in browsers unless a native
capability flag was present, causing sandbox rejection and blank providers.
Restricted mode remains an explicit separate option. Native navigation guards
remain independent. Regular browsers cannot guarantee popup blocking in genuinely
unsandboxed mode; the UI states that distinction. Play still does not automatically
open external-only sources in a new browser tab.

A **Reload player** control and a nonblocking provider reachability check are
available. Server-side HEAD requests use only validated provider URLs, follow no
redirects, and time out after 4.5 seconds. A reported 5xx response displays a
provider warning instead of silently leaving a black frame unexplained. A network
error, timeout, or browser challenge remains inconclusive; an HTTP 200 does not
claim that a video stream plays.

Anicine's `/watch/movie/550` page and server controls loaded directly and inside
the corrected unsandboxed app frame without reproducing the reported client
exception. The Atlantic `/watch/550` check returned HTTP 522. Provider availability,
particular titles and physical-iPhone playback cannot be guaranteed by these checks.
Provider addresses and the other sources are preserved.

On phones, the extra main-frame padding and inner Watch card frame are removed.
Text and controls are larger. YouTube selectors use one horizontal scrolling row
with 44 px buttons rather than wrapping into a large pill. Library actions use two
columns beneath the title and thumbnail. Comments and video titles have readable
phone typography, and Quick Add no longer overlaps Watch content.

Validation: all 205 tests and `npm run check` passed. In the 390 px phone preview,
the player measured approximately 339 px wide, compared with roughly 252 px in the
reported screenshot. All six category selectors had the same vertical position,
and the page stayed within the viewport. Layout changes preserve the prior scroll
optimisations, Home gesture removal and clay icon set.

This is a web update for the current iOS wrapper; no new IPA or account reset is
required. Deployed on 14 October 2026 to
https://bcommand-center.wolvesgidaree.workers.dev, Worker version
`156fc2e3-4cf7-4e89-9f73-cfa5b9163ee8`. The live 390 px phone view was verified
to load 10.33.2 assets, retain one selector row, and provide a 339 px player without
horizontal overflow. The deployed provider check reported Anicine HTTP 200 and
Atlantic inconclusive within the bounded timeout.
