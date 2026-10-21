# OpenAI schoolbook practice

Schoolbooks → Practise from a book offers OpenAI and Mixed test practice.
As of v10.35.1, DeepSeek is the initial provider and QwenCloud is also available;
see [QWEN-SETUP.md](QWEN-SETUP.md). Choose OpenAI explicitly to use this setup.
Any subject can have multiple choice, short test-style paragraphs and worked
calculations. Accounting can also include more complex numerical problems and
simple interactive T-accounts when supported by the selected lesson pages.
The supplied accounting screenshots guide question style; they are not an answer
key or model training data. Highlighted selections are checked against lesson
evidence rather than copied as correct.

## Create and configure the key

Install and connect **OpenAI Developers** in Codex, then ask it to create a
project key for Command Centre schoolbook practice. The plugin was not connected
during implementation, so key creation is still pending. Alternatively create a
project key in the OpenAI Platform API keys dashboard. Keep the actual key out of
chat, public files, browser settings, app state and backups.

For local development, copy `.dev.vars.example` to the ignored `.dev.vars`,
preserve any existing local secrets, and set `OPENAI_API_KEY` to the actual key.
Run `npm run dev`. Optional `OPENAI_SCHOOLBOOK_MODEL` defaults to `gpt-6-luna`.
It must identify a Responses model supporting images and structured output.

For the existing Cloudflare Worker, run these from the project root, entering
the key only in Wrangler's hidden prompt:

```powershell
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

Use an OpenAI API project with credit and access to the chosen model. Configure
its budget and usage controls in the Platform. No key has been generated or
uploaded, no live paid request made and no deployment performed in this change.

## Using practice

Sign in to an existing invited app account before choosing OpenAI. The new
`/api/accounts/practice/` routes use the current HttpOnly cookie and its existing
path. Sync need not be enabled. Migration `0013_accounts.sql` must already exist;
no new migration is needed. The panel shows signed-out, missing-key and provider
errors. DeepSeek remains an explicit alternative with its existing Settings key;
failures do not switch providers or automatically retry paid requests.

- **Mixed test practice**: multiple choice and written questions, with T-accounts
  too when the accounting sources teach the necessary rules.
- **Multiple choice**: four options and feedback explaining every option.
- **Paragraphs & calculations**: a short paragraph, explanation or calculation
  with working. Marking points credit equivalent reasoning and valid methods.
- **T-accounts**: type entry descriptions and amounts yourself under Debit on the
  left or Credit on the right. No transaction choices are supplied. One mark checks
  the described entry and side, and one checks its amount. Equivalent accounting
  wording is accepted; duplicate transactions do not receive repeated credit.
  Running totals reflect the student's entered amounts.
- **Journal entries**: type complete double entries with account names, debit and
  credit amounts, dates and narration where relevant, using the written answer area.

MCQ checking is local, without a second API charge. Paragraphs, calculations,
journal entries and typed T-accounts use the provider saved with their session
for marking, allowing equivalent wording. AI-generated keys, figures and photo
transcriptions can still be wrong; source-page links and model answers allow
review. These are practice marks, not official exam grades.

Only selected page text and inline photos are sent for generation: 48,000 text
characters, 12 photos and 12 MB of inline image data maximum, in a request bounded
to 13 MB. Re-add linked remote photos or turn photos off for OpenAI. Written
marking sends the question, scheme, quoted evidence and student answer. The server
builds its own prompt and strict JSON schema, fixes output limits, uses
`store:false` and sanitizes provider errors. API project data policies still apply.
Separate scopes in the existing account-attempts table enforce 60 paid requests
per rolling hour and 150 per rolling day per account; this is not a monetary cap.

Draft paragraphs, choices and T-account entries resume in the existing separate
account-partitioned practice store. Older written sessions keep their original
provider. Schoolbooks and account sync records are not rewritten.

Official guidance: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
