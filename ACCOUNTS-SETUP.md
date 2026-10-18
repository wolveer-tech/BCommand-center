# Invite-only accounts

Accounts use the existing Cloudflare Worker `bcommand-center`, D1 database
`command-centre-push`, and R2 bucket `command-centre-transfers`. No new service or
Cloudflare account is required. Account notes use their own R2 prefix and D1 tables.

## Enable accounts on the existing deployment

From the project folder, with Wrangler signed in to your existing Cloudflare account:

```powershell
npx wrangler d1 execute command-centre-push --remote --file migrations/0013_accounts.sql
npx wrangler secret put ACCOUNT_INVITE_CODE
npm run deploy
```

Enter a private invitation code of at least 16 characters when Wrangler prompts.
Do not put it in frontend code or commit it. Registration remains disabled until
the secret is configured. Existing users can still sign in if you remove the
invitation secret later. Rotate the secret to change the code for future registrations.

The default account limit is 10. To change it, set the Worker variable
`ACCOUNT_MAX_USERS` to an integer between 1 and 100. The migration only creates
new account tables and indexes; it does not replace existing tables.

## Link devices

1. Open **Account & sync** from the home header, sidebar or Settings and create an invited account using a username, password of at least
   12 characters, and the invitation code.
2. Choose **Enable sync on this device**. Existing notes, schoolbooks and the manga library are merged
   into the account, with a local recovery snapshot taken first.
3. Sign in to that same account on your phone and enable sync there too.

Notes, photos, schoolbook pages, folders attached to notes, pins, manga favourites,
chapter history, saved reading pages/languages, and deletion markers sync.
Comix chapter bookmarks sync; reading on Comix uses its own browser, so page-level
progress on that site is not captured automatically. Other app data stays local. Sync runs when online, after edits and periodically
while the app is visible. Offline changes are retained for the next sync. If both
devices edit the same note, both versions are kept, with one labelled
`(conflicting copy)`. Signing out leaves the local copy on the device. Switching
accounts keeps separate IndexedDB copies and takes a recovery snapshot first.

## Updating an existing account installation to v10.33.0

Run `npm run deploy`. No additional database migration, secret, bucket or IPA is
needed. Manga uses a private collection record in the existing account storage;
it is excluded from note listings. Existing devices that were linked for notes
need to choose **Enable sync on this device** once to include manga. Removals have
timestamps so an older offline copy cannot immediately re-add deleted favourites
or history. Concurrent writes are detected and merged on retry.

Passwords are salted and hashed; sessions use HttpOnly cookies. Notes are private
to the account through the API but are not end-to-end encrypted. This initial
version has no self-service password reset or account deletion screen.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, choose a local test invitation code, run
the migration against the local database, and start `npm run dev`. Never include
`.dev.vars` in a release archive. The isolated browser QA server
`node scripts/preview-notebooks.mjs` uses disposable in-memory D1/R2 storage and
disables other remote services; it is not a production deployment.
