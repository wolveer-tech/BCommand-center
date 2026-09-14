# Command Centre v10.21.1 / iOS 1.8.0

This patch reduces the APNs configuration from five Worker variables to one
encrypted secret so it fits accounts already at Cloudflare's binding limit.
The old three-secret form remains compatible, but new setups should use only
`APNS_CONFIG`. The production APNs environment and
`tech.wolveer.commandcentre.native` bundle identifier are built-in defaults.

## One-secret APNs setup

1. If they were already added, record the values and delete `APNS_KEY_ID` and
   `APNS_TEAM_ID` from the Worker's Variables and Secrets page. Also delete
   `APNS_BUNDLE_ID` and `APNS_ENVIRONMENT` if present; they are no longer needed.
2. Add one encrypted secret named `APNS_CONFIG`.
3. Its value is three parts: the APNs Key ID, the Team ID, and the entire `.p8`
   private key. Paste it in this multiline form:

   ```text
   YOUR_KEY_ID
   YOUR_TEAM_ID
   -----BEGIN PRIVATE KEY-----
   PASTE_THE_KEY_BODY_HERE
   -----END PRIVATE KEY-----
   ```

   A one-line `KEY_ID|TEAM_ID|PRIVATE_KEY_WITH_\\n_LINE_BREAKS` value is also
   accepted.
4. Deploy the Worker. Run `migrations/0010_native_apns.sql` once if it has not
   already been applied.

This is a Worker-only configuration patch. It does not require another IPA if
iOS 1.8.0 build 14 has already been built with the push entitlement.
