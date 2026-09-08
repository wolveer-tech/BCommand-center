# Command Centre Transfers — v10.7

This is the complete v10.6.2 app with Transfers added. It includes original-file transfer in both directions, messages, links, a Transfers launcher icon, Inbox/Sent/type folders, device pairing, expiry, push alerts, a Windows sender, a Node/VS Code CLI and a Chrome/Edge extension. No Ollama or other new AI integration is included. The app's pre-existing features remain in the project.

**Do the Cloudflare setup before deploying this version.** Uploading only `public/index.html` is not enough: this feature has a Worker module, browser bundle, D1 tables and R2 storage.

## 1. Extract and keep the full project

Extract this ZIP to a normal folder. The root contains `worker.js`, `transfers.js`, `wrangler.jsonc`, `public/`, `migrations/`, `tools/` and `native-ios/`.

Make a backup of your current GitHub repository before replacing its files. Keep your existing Cloudflare secrets and D1 database; the new migration does not replace your reminder/news tables. The supplied configuration retains your existing Worker name and D1 ID.

## 2. Create private file storage

In your existing Cloudflare account:

1. Open **R2 object storage** and create a bucket named **`command-centre-transfers`**. R2 may require you to enable billing; review Cloudflare's displayed charges before doing so.
2. Keep the bucket private. Leave public `r2.dev` access and public custom-domain access disabled.
3. Under the bucket's settings, find **CORS policy** and paste the contents of `r2-cors.json`. It already contains your existing app origin, `https://bcommand-center.wolvesgidaree.workers.dev`. Add your other app origins if you use a custom domain. Include the scheme and hostname, without a trailing slash or path.
4. Copy the bucket's **S3 API endpoint**. It looks like `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com`; use the exact endpoint displayed, including a jurisdiction suffix if present.
5. In R2 API token management, create credentials with **Object Read & Write** permission limited to **this bucket**. Save the resulting **Access Key ID** and **Secret Access Key**. These are the R2 S3 credentials, not the general Cloudflare API token used to deploy Workers.
6. Keep R2's lifecycle rule for aborting incomplete multipart uploads. As a fallback, an abort-incomplete rule after one day is appropriate. Do not set a rule deleting all completed objects, because that would override the **Never** expiry choice.

The ZIP already adds the `TRANSFER_FILES` R2 binding to `wrangler.jsonc`. The binding and `TRANSFER_R2_BUCKET` must point to this same bucket.

## 3. Add Worker secrets

Open **Workers & Pages → bcommand-center → Settings → Variables and Secrets**. Add these values to your production Worker:

| Name | Value |
| --- | --- |
| `TRANSFER_R2_ENDPOINT` | The S3 API endpoint from step 2 |
| `TRANSFER_R2_ACCESS_KEY_ID` | The R2 Access Key ID |
| `TRANSFER_R2_SECRET_ACCESS_KEY` | The R2 Secret Access Key |
| `TRANSFER_SETUP_KEY` | A new, random secret of at least 32 characters |

Store them as secrets. `TRANSFER_R2_BUCKET=command-centre-transfers` is already a non-secret variable in the configuration.

To generate a setup key on your computer with Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save that key in your password manager. It lets you connect the first device or recover access later. Do not paste it into source files or GitHub. Paired devices use their own revocable credentials instead of this key.

Keep your existing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` secrets for background notifications. File/message transfer itself does not require push to be enabled.

Optional: set `TRANSFER_MAX_FILE_BYTES` to a smaller maximum file size. The default and hard maximum are 10 GiB (`10737418240` bytes) per file.

## 4. Add the D1 tables

Use your existing **command-centre-push** D1 database.

Either open its Cloudflare Console and run the SQL in `migrations/0008_transfers.sql`, or use a terminal in the extracted project folder:

```powershell
npm ci
npx wrangler login
npx wrangler d1 execute command-centre-push --remote --file=migrations/0008_transfers.sql
```

Only run `0008_transfers.sql` for this update. Its `CREATE TABLE IF NOT EXISTS` statements are safe to repeat. This release does not require resetting or deleting your existing database.

## 5. Update GitHub and deploy

1. Replace the matching files in your existing repository with the contents of this ZIP. Include new folders and files. Do not upload `node_modules`, `.dev.vars`, personal credentials or the ZIP itself as the app code.
2. Keep **`package-lock.json`**. The browser bundle is already built and included in `public/transfers.bundle.js`.
3. For Cloudflare's Git build, use **`npm ci`** as the build command and **`npx wrangler deploy`** as the deploy command. If you later edit `client/transfers-client.js`, use `npm ci && npm run build` as the build command, or rebuild locally and commit the new bundle.
4. Commit the files and let your existing Cloudflare build deploy. Alternatively, from the project folder, run `npm run deploy` after signing in.
5. Keep the existing every-minute cron trigger. It now also handles transfer expiry and notification retries.
6. Refresh the app. Transfers is in the launcher and sidebar and is searchable. The launcher keeps its 12-icon layout; Settings remains available in the top bar and launcher quick actions.

## 6. Connect the first device and pair the second

1. Open **Transfers** on your computer or phone.
2. Enter a device name such as **Home PC**.
3. Expand **First device or account recovery**, enter your `TRANSFER_SETUP_KEY`, and select **Connect with setup key**.
4. Open **Devices → Pair a device**, then copy the displayed code.
5. On your other device, open Transfers, enter a name such as **My iPhone**, paste the pairing code and select **Connect device**.

The code works once and expires after 10 minutes. Creating another code on the same device invalidates its previous code. Treat pairing codes as private. All paired devices belong to your personal space and can pair or revoke devices; this is not a multi-user/team permissions system.

Try a message first, then a small file. Send to a specific device or **All my other devices**. You can send from either direction.

## 7. Notifications on iPhone

For background Web Push, open your site in **Safari → Share → Add to Home Screen**. Open the installed Home Screen app, pair it if needed, then select **Transfers → Devices → Enable transfer notifications**. Each browser/installation has its own device pairing and notification permission.

Alerts say a new transfer is ready without exposing its filename, message or link on the lock screen. Tapping an alert opens Transfers. If alerts fail, the transfer still appears in the inbox; pending notifications are retried up to five times when push is configured.

**The native WKWebView iPhone wrapper does not provide Web Push.** Use the Home Screen PWA for background alerts. In the native wrapper, Transfers refreshes while visible and when you return to the app. Native APNs support is not included.

## 8. Save, open, share and verify files

- **Save original:** creates a short-lived private R2 download link. Tap the displayed download button, then use Downloads/Files as normal.
- **Open / Share:** files up to 128 MiB are downloaded and checked against the sender's SHA-256 before displaying Save/Open/Share controls. Availability of Open and Share depends on the browser and file type. Larger files download directly; open or share them from Files/Downloads.
- **Verify saved file:** select your downloaded file. The app hashes it in chunks and compares both byte count and SHA-256 to the original. Verification runs locally and does not upload the file again.
- In the updated **native iPhone wrapper**, Save/Open/Share uses a download-to-disk bridge, verifies SHA-256, then opens the iOS share sheet. Choose **Save to Files** or another app. This requires rebuilding the native project included here.

Transfers does not resize, recompress, convert or automatically ZIP anything. The exact bytes selected by the sender are uploaded. To preserve an iPhone photo/video already stored as a file, choose it through **Files**; the iOS Photos picker or a source app can export a different representation before Transfers receives it.

Keep the sending app open until it says **sent**. Parts automatically retry on transient failures. Cancelled/failed uploads are aborted when possible; abandoned uploads are cleaned up later. Closing a tab or the app interrupts its upload; this version does not resume an upload across a restart. A file that changes while the CLI is reading it is rejected.

## 9. Windows sender and VS Code / CLI

Install Node.js 22 or newer from [nodejs.org](https://nodejs.org/). Run commands from the extracted app folder. The CLI has no separate npm dependencies.

First, generate a pairing code in the app, then:

```powershell
node tools/cc-transfer.mjs connect --url https://bcommand-center.wolvesgidaree.workers.dev --name "Home PC sender"
```

Paste the one-use pairing code when prompted. On Windows, the CLI stores its token encrypted with Windows DPAPI for your signed-in user. On other operating systems it uses a file with mode `0600`. Keep the same OS account to use that connection.

Examples:

```powershell
node tools/cc-transfer.mjs send --expires 7d -- "C:\Users\YOU\Downloads\coursework.pdf"
node tools/cc-transfer.mjs message --text "Restart the server before deploying" --expires 1h
node tools/cc-transfer.mjs link --url https://github.com/ --title "GitHub"
node tools/cc-transfer.mjs devices
node tools/cc-transfer.mjs list --view inbox
node tools/cc-transfer.mjs download TRANSFER_ID --out "C:\Users\YOU\Downloads\received.pdf"
```

Use `--to DEVICE_ID` to target one device. Without it, sending goes to all your other devices. Expiry values are `1h`, `1d`, `7d`, and `never`. Downloads are streamed to disk and verified before they are saved under the final filename. Existing destination files are not overwritten. These same commands work in VS Code's terminal.

**Desktop window:** run `tools/windows/Send-To-Command-Centre.ps1` in PowerShell. Drop files into it or send a message/link. The desktop window uses the paired CLI connection; its default expiry is one day.

**Right-click Send to:** after pairing the CLI, run `tools/windows/Install-SendTo.ps1` once. This creates a shortcut for your Windows user. Right-click files → **Show more options → Send to → Command Centre**. It also supports multiple selected files. Keep the extracted app folder in place because the shortcut points to it.

These PowerShell helpers require your existing Windows policy to allow their execution. If Windows blocks them, the browser and Node CLI remain usable. No system policy changes or automatic installs are made by this package. To uninstall the shortcut, open `shell:sendto` and remove **Command Centre**. Revoke the CLI device from the app or run `node tools/cc-transfer.mjs disconnect` to remove its access.

## 10. Chrome or Edge extension

1. Open `chrome://extensions` or `edge://extensions` in that browser and enable **Developer mode**.
2. Choose **Load unpacked**, then select `tools/browser-extension` from this project.
3. Open its **Settings / Pair browser** page.
4. Enter your Command Centre HTTPS URL, a browser name and a fresh pairing code from the app.
5. Allow the extension to access **your own Command Centre site** when prompted. It requests no persistent access to every website.
6. Choose a default recipient and expiry, then save the preferences.

Right-click a page/link or selected text → **Send to Command Centre**. The extension popup also sends the current page or a typed message. A checkmark badge indicates success; an exclamation badge means an error—open the popup to read it. The extension stores its own revocable device token locally in that browser profile. Remove its device from Transfers to revoke access.

## 11. Native iPhone build

The ZIP includes the updated `native-ios/` sources, version **1.2.0 / build 4**, with `NativeTransferHandler.swift`. Your existing Codemagic/Xcode workflow must rebuild the native app to include that handler. A website-only update cannot install new native Swift code.

Follow your existing `native-ios/README-NATIVE-IOS.md` build/signing workflow. Reinstall the rebuilt app through your normal method. Keep `AppConfig.commandCentreURL` pointing at your actual site. The web Transfers screen works with a web deploy; the verified native share sheet requires the new build.

The native code was reviewed here, but an iOS build and real-device share-sheet test require macOS/Xcode and your signing setup. Those were not run on this Windows computer.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| “Run migrations/0008_transfers.sql” | Apply that migration to the DB bound to this Worker. |
| “File storage needs setup” | Add the listed bindings/secrets; messages/links can work before R2 is configured. |
| R2 upload failure / missing ETag | Confirm endpoint, bucket, bucket-scoped credentials, and CORS allowing the exact site origin, `Content-MD5`, `PUT`, and exposing `ETag`. |
| A code is invalid | Generate a new one; codes expire after 10 minutes and work only once. |
| No inbox entry | Check Sent on the sending device, the selected recipient, and whether the item expired. Inbox excludes this device's own sends. |
| No push on iPhone | Use the Home Screen PWA, enable notifications on that installation and check the VAPID secrets. |
| Download button stopped working | Press Save original again. Download URLs last at most five minutes and no longer than the transfer's remaining expiry. |
| Older native app cannot save/share | Rebuild/install the native app, or download through the Safari/PWA version. |

## How storage and expiry work

The Worker authenticates a device and issues a URL for each upload part. File bytes go directly to private R2. Each part uses a signed length and Content-MD5 header for transport integrity. The client computes a SHA-256 over the full original file; D1 stores that checksum and the file/message metadata. After R2 completes the multipart upload, the Worker checks the stored size and publishes the item. Sender-provided SHA-256 is verified when downloading/sharing or when you choose Verify saved file; the Worker does not read an entire large object to re-hash it.

Expiry begins when sending completes. Expired transfers immediately stop appearing in the API and cannot get new download links. The every-minute job deletes expired objects and metadata in batches, and retries failed cleanup. A download already in progress can finish, and a saved copy on a device remains there. Deleting a transfer does not delete the copy someone already saved.

This is private cloud storage with transport encryption, not end-to-end encryption. The Worker/R2 account owner can access stored content. Device tokens are stored as hashes in D1 and sent only in Authorization headers; setup credentials remain Worker secrets. A removed device cannot request new items or links; an already-issued download URL remains usable until its short expiry unless the object is deleted.

## Validation and references

Run `npm ci`, `npm run build`, and `npm test` to rebuild and run the included local D1/R2 integration tests. `node tests/preview-server.mjs` starts a disposable local preview; it has local test credentials and storage only. It is not a production server and must not be deployed. The browser test server substitutes a local upload endpoint for real R2 URLs so it can run without your cloud credentials.

Implementation references: [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 multipart Workers API](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/), [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/), [aws4fetch](https://developers.cloudflare.com/r2/examples/aws/aws4fetch/).
