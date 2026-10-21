# QwenCloud and DeepSeek schoolbook providers

## QwenCloud

Open Settings → Integrations, paste a QwenCloud API key into **QwenCloud API key**,
choose a model and save. Open Schoolbooks → Practise from a book and select
**QwenCloud** under Question AI. Sign in to your existing invited app account
first. Qwen 3.7 Plus is the default; Qwen 3.8 Flash and Qwen 3.8 Max are available
when included in your plan. All three support text and image input.

Create/manage keys at the QwenCloud console, following its
[API key guide](https://docs.qwencloud.com/api-reference/preparation/api-key).
This integration is specifically for QwenCloud. Keys from the separate Alibaba
Model Studio, OpenRouter or the Qwen chat website are not interchangeable.

The Worker selects the official endpoint automatically from the key type:

- Standard API key: `https://maas.qwencloudapi.com/compatible-mode/v1/chat/completions`
- Token Plan key beginning `sk-sp-`: `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1/chat/completions`

No Qwen provider secret or plugin is needed. Save the personal key securely to
an app account for use across devices: see [AI-KEYS-SETUP.md](AI-KEYS-SETUP.md).
It is encrypted in the server vault; browsers receive only status/preferences.
Legacy device-only keys are still supported. Neither mode adds credentials to
portable backups or practice sessions. Endpoints are fixed and redirects are
rejected; paid requests have account rate and input/output limits.

QwenCloud requests use non-thinking mode and strict JSON Schema output, followed
by the same source-evidence and question validation as other providers. There are
no automatic paid retries. Automatic mode explains its provider selection. Credit, model-access,
key-rejection and incomplete-output errors preserve the previous set and answer.

## DeepSeek models and reasoning

Use the same existing DeepSeek API key. Under Settings → Integrations choose
**DeepSeek model** and **DeepSeek reasoning**, then save and generate a new set.

- **Flash** (`deepseek-flash`): the current Flash alias; supports text and photos.
- **V4 Pro** (`deepseek-v4-pro`): another available model; text only. The app blocks
  photo requests before sending them, with instructions to choose Flash or turn
  photos off. A Pro name does not guarantee better results for every exercise.
- **High**: thinking enabled with high effort; the new default.
- **Max**: thinking enabled with maximum effort; can be slower and use more tokens.
- **Instant**: thinking disabled, matching the previous practice request mode.

Thinking requests have larger bounded output budgets and longer timeouts. Only
the final answer is parsed; reasoning content is not displayed or saved. The model
and effort are saved with the practice session, so marking retains that set's
configuration after a settings change. Old sessions use current settings when no
configuration was stored. These settings apply to schoolbook practice.

Provider choice is remembered. Automatic is the initial choice for devices without
a saved provider preference; save an account key to use it. Existing sets retain their provider. All question
formats remain available: multiple choice, short paragraphs, calculations, typed
T-accounts and journal entries, where supported by the selected study pages.

References: [QwenCloud Chat API](https://docs.qwencloud.com/api-reference/chat/openai-chat),
[QwenCloud structured output](https://docs.qwencloud.com/developer-guides/text-generation/structured-output),
[QwenCloud vision models](https://docs.qwencloud.com/developer-guides/getting-started/vision-models),
[DeepSeek model details](https://api-docs.deepseek.com/quick_start/pricing/),
[DeepSeek thinking controls](https://api-docs.deepseek.com/guides/thinking_mode/).
