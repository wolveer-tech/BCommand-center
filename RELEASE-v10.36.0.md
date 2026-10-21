# v10.36.0 — secure account AI keys and accessible Settings

DeepSeek and QwenCloud keys can now be saved encrypted under your app account,
then used from your laptop and phone without downloading or sending the raw key
between devices. Settings → Integrations includes save, status, replace/remove
controls and shared model preferences. Account changes invalidate cached status
and prevent a pending key save from targeting the wrong account.

Automatic schoolbook practice chooses one saved provider per task, preferring
QwenCloud for photos and general question generation and DeepSeek for calculation
and accounting marking. The UI shows the chosen provider/model and reason.
Manual selection remains supported. Errors do not trigger another paid request.
The existing DeepSeek assistant can also use the saved account key.

Settings categories wrap visibly on laptops, with a direct AI-key shortcut in
General, a visible content scrollbar, keyboard scrolling and fixed action buttons.
The mixed question formats, typed T-accounts and written journal entries remain.
SportsindX remains available; only its redundant default name binding is removed
to fit the free Worker's variable limit. All other bindings are preserved.

Deployment requires the additive 0014 migration and AI_VAULT_KEY secret. No new
native iOS build is required; iOS remains 1.16.1 build 25. See AI-KEYS-SETUP.md.
Validation uses disposable credentials and mocked provider calls, not paid AI.

Published at https://bcommand-center.wolvesgidaree.workers.dev/ with Worker version
`89fa6fa1-2036-4229-8253-5dfacd117316` (100% of traffic). The live D1 migration and
encryption secret are configured. All 299 automated tests passed; the updated
client checks passed again after the final save-flow change. Project/Worker
checks and all 38 deployed asset comparisons pass. Anonymous vault, Automatic
and DeepSeek status requests return 401 with no-store headers. Live browser
verification confirms all eight settings categories are visible and keyboard
scrolling reaches the secure key-save control on a laptop.
