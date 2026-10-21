# Use AI keys on your laptop and phone

1. Sign in to your Command Centre account.
2. Open Settings → AI keys & models (or Integrations).
3. Paste a DeepSeek and/or QwenCloud API key, choose model settings, and press
   **Save AI keys to account**. Keep account storage enabled.
4. Sign in to the same account on your phone. You do not need to send or retype
   the keys. Schoolbook practice uses the saved keys through the server.

The fields clear after a successful save. A configured status replaces the key;
the app never downloads the saved credential. You can replace or remove each key
from Integrations. API credit and access to the chosen models are still required.

Choose **Automatic** in Schoolbooks → Practise from a book to use the saved
providers according to the task. Photos prefer QwenCloud; T-account/journal
generation and numerical/accounting marking prefer DeepSeek; other generation
and written explanations prefer QwenCloud. Only configured providers are used.
With only DeepSeek saved, photo tasks use Flash because Pro is text-only.
The screen shows the actual provider, model and selection reason. These are
practical routing rules, not measured claims that one model is always better.
There is one provider call per task and no paid fallback retry after an error.
Manual choices remain available. Multiple-choice checking remains local.

The vault stores model/reasoning preferences with each key. Automatic uses the
current saved preferences per task. Manual sessions keep their model settings.
Saving keys can switch this device to Automatic using the checked option.
Existing provider preferences otherwise stay in place; new installations default
to Automatic. Saved keys also work in the existing DeepSeek assistant chat.

## Protection and compatibility

Credentials are encrypted at rest with AES-256-GCM, fresh random IVs, and an
authenticated account/provider binding. The encryption master is a Worker
secret, separate from the database and public code. Signed-in account sessions,
same-origin checks, bounded bodies, model/endpoint allowlists and request limits
protect access. Responses contain status/preferences only and use `no-store`.
The server decrypts keys to call the providers; this is not end-to-end encryption
against the server operator. Never put a real key in project files or chat.

Legacy device-only keys remain supported. Turning off account storage makes the
main Settings Save button keep a key on this device. Saving to the account clears
the current device key fields/state. Historical recovery snapshots may still
contain earlier device keys. Portable exports, book/account sync and practice
sessions exclude credentials. Errors preserve the previous set and typed answer.

Settings categories now wrap into visible rows on laptops and phones. Settings
content has a visible vertical scrollbar and keyboard scrolling, with Save and
Cancel outside the scrolling content.

## Deployment

Run the additive `migrations/0014_ai_vault.sql` against the existing accounts D1
database, then `node scripts/configure-ai-vault-key.mjs`. The helper creates
`AI_VAULT_KEY` only if absent, never prints its value, and preserves an existing
key. Never rotate/delete this secret while encrypted credentials exist without
first implementing a migration. Deploy normally with `npm run deploy`.

The live free Worker was at its 64-variable limit. The redundant public
`LIVE_PROVIDER_3_NAME=SportsindX` binding was removed to make room. The identical
code default, provider routes, streams and other settings are retained. The
deployment config omits that duplicate binding. `scripts/make-ai-vault-room.mjs`
provides the narrowly checked one-time repair; it verifies the exact value and
preserves all other bindings without printing credentials.

No plugin or new iOS build is required. OpenAI remains a separate optional server
integration described in OPENAI-SETUP.md.
