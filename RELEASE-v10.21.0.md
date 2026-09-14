# Command Centre v10.21.0 / iOS 1.8.0

> APNs setup was consolidated in v10.21.1. Use the single-secret instructions
> in `RELEASE-v10.21.1.md` instead of the older five-variable steps below.

## Changes

- Notes follows the live caret while typing. When the iPhone keyboard is open,
  nonessential editor chrome collapses and the current line is kept above the
  action row and keyboard.
- FotMob replaces SofaScore as the preferred football website feed. The dated
  schedule covers every competition returned for each day. Match Centre maps
  available lineups, benches, formations, coaches, incidents, scores, venue,
  referee and detailed statistics. Long fixture and result lists use incremental
  **Show more** controls, so all returned matches remain reachable without
  rendering thousands of cards at once. Existing configured providers remain
  as fallbacks.
- YouTube For You uses stronger watch-progress and recency weighting, six
  rotating interest lanes, freshness-filtered searches, a 15-minute cache,
  one-channel-first mixing and a seven-day recent-impression rotation.
- The IPA registers for Apple Push Notification service. Messages and Transfers
  can now receive immediate remote alerts when the APNs setup below is complete;
  the existing iOS background check remains as a fallback.

## Required deployment setup

1. Run `migrations/0010_native_apns.sql` against the existing production D1
   database.
2. In Apple Developer, enable Push Notifications for
   `tech.wolveer.commandcentre.native` and create an APNs `.p8` key.
3. Add these Cloudflare Worker secrets: `APNS_KEY_ID`, `APNS_TEAM_ID` and
   `APNS_PRIVATE_KEY`. Paste the complete `.p8` content as the private key.
4. Keep `APNS_BUNDLE_ID=tech.wolveer.commandcentre.native` and
   `APNS_ENVIRONMENT=production` from `wrangler.jsonc`.
5. Deploy the Worker/web project.
6. Build `CommandCentre-iOS26-v1.8.0.ipa`, ensure the signing service preserves
   the Push Notifications entitlement, and install it over the existing app.
7. Open the IPA once and enable alerts. If the paired Messages/Transfers
   credential is present, Settings → Notifications now registers it
   automatically; either feature's own Enable alerts button also registers it.

The APNs key is never included in the IPA or repository. A test local
notification does not test APNs; confirm immediate delivery by sending a real
message or transfer from another paired device while the IPA is backgrounded.
