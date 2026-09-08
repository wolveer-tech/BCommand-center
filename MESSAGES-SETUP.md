# Command Centre Messages — v10.8

This update adds a Messages app alongside your working Transfers app. It reuses the devices you have already connected. No new bucket, secret, account or AI service is needed.

## Update your working v10.7 app

Use **Command_Centre_Messages_v10_8_UPDATE.zip**. It contains only the new and changed files, including the compiled browser files. Your existing `wrangler.jsonc`, R2 settings, secrets and native iOS files are not included in the update ZIP.

1. **Extract the update ZIP** into a normal folder.
2. In Cloudflare, open your existing D1 database **command-centre-push**, then its **Console**.
3. Open **migrations/0009_messages.sql** from the extracted folder. Copy the entire SQL file into the Console and run it. It starts with `CREATE TABLE IF NOT EXISTS device_messages`. Copy the SQL file, not this instruction document. This adds the chat tables without replacing existing tables or transfers. Running it again is safe.
4. Open the root of your existing GitHub repository **wolveer-tech/BCommand-center**. Use **Add file → Upload files**. Upload the **contents** of the extracted update folder, keeping the `public`, `client`, `migrations`, `scripts` and `tests` folders intact. Do not upload the ZIP itself or wrap everything in an extra folder. Commit the update to the same branch your Cloudflare build uses.
5. Keep your working build settings: **Build command `npm ci`**, **Deploy command `npx wrangler deploy`**, **Root directory `/`**. The browser bundles are already built and included. Wait for Cloudflare to report a successful deployment.
6. Refresh Command Centre on your PC and laptop. Open **Messages** from the sidebar or the Home dock. If you use the iPhone Home Screen app, close and reopen it after deployment.

You do not need to repeat the R2 bucket, CORS, credentials or Transfers setup. Do not remove your existing repository files. GitHub replaces files at matching paths and adds the new ones.

The full **Command_Centre_Messages_v10_8_FULL.zip** is also supplied as a complete project backup. For this upgrade, use the smaller UPDATE ZIP. If starting from scratch, complete `TRANSFERS-SETUP.md` first and then run migration 0009.

## Use your existing devices

Your other paired devices appear under **Your chats** automatically. Select **My PC** (or the name you gave it), type or paste a message, and send. Replies appear in the same conversation.

- On a computer, **Enter sends** and **Shift + Enter** adds a line. On a touch device, use the **Send** button.
- Web links become clickable. Each message has **Copy**.
- Click **☆ Quick chat** in your PC conversation to make it the Home shortcut. The Home Quick actions card then opens that device directly with **Message My PC** (or its chosen name).
- Drafts and unsent messages are saved in this browser. A failed send has **Retry**; retries use the same message ID to avoid duplicates.
- The open conversation checks for messages every two seconds while the app is visible. The device list refreshes about every eight seconds. Messages sent while a device is offline appear when it returns.
- Conversation history is stored in your existing D1 database and does not use the Transfers expiry setting. **Load older messages** retrieves earlier history.
- **Send a file ⇄** opens the existing Transfers app. Its original-file uploads, checksums, expiry, Windows sender and browser extension remain available.

## Connect a new laptop or phone with nine digits

1. On your already connected PC, open **Messages → Connect another device → Show my 9-digit code**.
2. Open the **same deployed Command Centre site** on your laptop or phone, then **Messages → Enter a code**.
3. Give that device a name, enter all nine digits, and click **Connect**. Leading zeroes count. Spaces are added automatically.
4. The new device opens a chat with your PC and stays paired for next time. The code works once and expires after five minutes. Generating another code invalidates the previous one; **Cancel code** invalidates it immediately.

Pair devices you own and trust: this connects them to the same personal device space used by Transfers. Pairing is protected by one-time codes and attempt limits; daily messaging uses the saved device credential. Messages travel over your site's HTTPS connection and are stored in D1, without end-to-end encryption. Remove an old device under **Transfers → Devices** to revoke its access to both apps.

Already paired on both devices? Just select the chat. There is no need to enter a code again. Different browsers and the iPhone Home Screen app can have separate browser storage, so each may need its own pairing.

## Optional alerts

Existing Transfer push subscriptions also receive message alerts. If needed, use **Enable alerts** in Messages. This uses your existing VAPID secrets. Alert previews say only that a new message arrived; tapping one opens its device chat.

On iPhone, Web Push requires the site added to the Home Screen from Safari. The existing native wrapper refreshes chats while open but does not support Web Push. Real notification delivery and the physical iPhone keyboard need checking on your own device after deployment.

## If something needs attention

- **“Run migrations/0009_messages.sql…”**: run that SQL in the same D1 database bound as `DB` to this Worker, then refresh.
- **Only one device / no chats**: open Messages on the other device and connect it using the nine-digit code.
- **Code rejected**: generate a fresh one on the connected device. A used, expired or cancelled code cannot be reused. After too many attempts, wait a few minutes.
- **Disconnected device**: reconnect that browser with a fresh code. The old chat is retained as disconnected history; the new pairing has its own chat.
- **Send failed**: check the connection and tap Retry. There is no automatic resend of old unsent messages after a reload.
- **Old screen after deployment**: confirm the new build succeeded, then refresh or close/reopen the app.

## Local development

With Node.js installed, in the full project folder:

```powershell
npm ci
npm run build
npm run check
npm test
```

`client/messages-client.js` builds to `public/messages.bundle.js`. After changing the HTML fragment, run `node scripts/integrate-messages.mjs`; this inserts it into the existing app without touching the Transfers section. `node tests/preview-server.mjs` serves a disposable local D1/R2 preview and prints its synthetic setup key. It does not deploy anything.

Terminal alternative for the new production migration:

```powershell
npx wrangler d1 execute command-centre-push --remote --file=migrations/0009_messages.sql
```
