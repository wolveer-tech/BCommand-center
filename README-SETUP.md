# Command Centre background notifications

This package converts the existing Command Centre reminder notifications to real Web Push notifications delivered by the same Cloudflare Worker.

## Cloudflare setup
1. Create a D1 database named `command-centre-push`.
2. Run `migrations/0001_push.sql` against the production database.
3. Put the database ID into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`.
4. Generate VAPID keys: `npx @mmmike/web-push` does not generate them directly; use a tiny Node script importing `generateVapidKeys` from `@mmmike/web-push/vapid`, or use the package docs.
5. Add these Worker secrets in Cloudflare: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example `mailto:your-email@example.com`).
6. Change Cloudflare Builds > Build command to `npm install` (the Deploy command remains `npx wrangler deploy`).
7. Push to `main`. Cloudflare deploys the Worker.

## iPhone setup
Open the deployed site in Safari, use Share > Add to Home Screen, open the Home Screen app, then Settings > Mobile notifications > Enable. Tap Send test.

The app still keeps its existing local scheduler as a fallback. Background push is handled by the Worker and D1.
