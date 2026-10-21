# v10.35.1 — QwenCloud and selectable DeepSeek reasoning

This release includes the previously prepared v10.35.0 mixed schoolbook tests:
multiple choice, short paragraphs, calculations, typed T-accounts and written
journal entries, across subjects and grounded in selected book pages.

QwenCloud is now selectable beside DeepSeek and OpenAI. Settings → Integrations
contains a personal QwenCloud key field and model selector (3.7 Plus, 3.8 Flash,
3.8 Max). Authenticated Worker routes use fixed QwenCloud hosts, choose standard
or Token Plan endpoints from the key prefix, reject redirects, sanitize upstream
errors, use strict JSON schemas and validate the returned questions/evidence.
No plugin or server-side Qwen key is required. Personal keys are excluded from
portable backups, account sync and saved practice sessions.

DeepSeek settings now expose current Flash and text-only V4 Pro, with Instant,
High and Max reasoning. High is the default rather than the previous thinking-off
request. Output budgets and timeouts allow for reasoning. Pro photo requests are
blocked before a provider call, with an actionable message. No model is silently
substituted. Model/effort selections remain attached to each new practice session.

DeepSeek is the initial provider for devices with no preference. Provider choice
is remembered; existing sessions retain their provider. Settings opens directly
to Integrations from the practice panel. The web cache version and all linked
assets are updated together. No database migration or new native iOS build is
required. iOS stays at 1.16.1 build 25.

See [QWEN-SETUP.md](QWEN-SETUP.md) for usage and official API references. Validation
uses disposable keys and mocked provider responses; no real paid AI requests or
personal study pages are used in testing.

Validation completed: all 295 automated tests pass, project/Worker checks pass,
and all 37 deployed web assets match the tested local release. The live browser
settings show the DeepSeek model/effort controls and QwenCloud key/model controls.
Both authenticated practice status endpoints reject anonymous requests with
private, non-cached JSON responses.

Published to https://bcommand-center.wolvesgidaree.workers.dev/ with Worker version
`ba5eff1d-b913-400e-88a6-c0cf7fb0d4bf`. Reopen/refresh the app to load v10.35.1.
No real OpenAI, DeepSeek or QwenCloud request was made in validation. An API key
and account credit/access are still needed for live AI generation.
