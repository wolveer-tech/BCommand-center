# v10.39.0 — Provider 2 replaced by StreamCorner

Sport's Provider 2 slot now shows StreamCorner. Selecting it offers an explicit
Open StreamCorner action to https://streamcorner.st/ in the site's own website
reader. Existing saved Provider 2 preferences select this replacement. The old
Timst feed, player hosts and resolver configuration are no longer used by slot 2.
Its old public feed settings in wrangler.jsonc are cleared without adding any
new Worker bindings.

This is a website-reader connection. StreamCorner's public SPA uses a custom
protected transport for its listings; ordinary feed requests return HTTP 405,
and its page redirected to Google during automated browser inspection. No
provider transport code is executed or copied into Command Centre, no checks
are bypassed and no match list or working video is claimed. Match browsing and
player selection happen on StreamCorner's site after the user clicks Open.
Playback on that site could not be verified in this browser environment.

The API returns a fixed website URL, zero matches and an empty streams array.
Auto checks the providers that supply match/player feeds and skips this site
action. Switching to StreamCorner clears any previous stream cards and closes
the previous player. Its external link is protected with noopener/noreferrer;
unexpected website URLs are rejected by the client.

TitaniumStream, SportsindX, Matchora, PPV and the manga sources remain available.
No database migration, API key or native iOS rebuild is required.

Validation: the local browser confirms StreamCorner's provider label, website
reader explanation and correct Open StreamCorner link. Automated tests cover
legacy-config isolation, absence of protected/old feed requests, no fake
matches, explicit site opening, URL validation, Auto selection and the actual
Workers API routes. Full-suite and publication results are recorded below.

All 327 automated tests pass. The complete Worker bundle and all 37 linked
local web assets validate successfully.

Published at https://bcommand-center.wolvesgidaree.workers.dev/?release=10.39.0
with Worker version `e3de51da-39cc-4085-b067-f9e7be731d8a`. All 37 linked
deployed assets match the tested release. The live API reports Provider 2 as
StreamCorner in website mode, with its fixed site URL and zero stream entries.
The live browser confirms the selected source and Open StreamCorner link.
Proof: artifacts/streamcorner-v10.39.0-live-full.png and
artifacts/streamcorner-v10.39.0-live.png. In-app playback is not implemented
for StreamCorner; this limitation was explicitly explained to the user.
