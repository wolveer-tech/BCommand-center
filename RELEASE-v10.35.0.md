# v10.35.0 — OpenAI and mixed schoolbook tests

Schoolbook practice now defaults to OpenAI and Mixed test practice, across
subjects: four-option questions, short test-style paragraphs and calculations
with working. Accounting can include multi-step numerical problems and simple
interactive T-accounts, when taught by the selected pages. The supplied examples
guide question style rather than dictating format or providing an answer key.

Multiple choice explains every option after checking. T-accounts let students
type their own particulars and amounts into Debit on the left and Credit on the
right, with running totals and separate entry/side and amount marks. There are no
transaction pickers. A Journal entries format also supports fully typed double
entries in the written answer area. Typed answers use AI marking with equivalent
accounting wording accepted; multiple-choice checking remains local.
Written answers retain marking points, hints, model answers and source-page
links. Difficulty adapts and all answer types save and resume after a reload.

Authenticated Worker routes under `/api/accounts/practice/` use the existing
account cookie. OpenAI credentials stay in the `OPENAI_API_KEY` server secret.
The Responses API uses strict JSON schemas, bounded source/input/output sizes,
`store:false`, sanitized errors and per-account hourly/daily limits. The existing
accounts migration suffices. DeepSeek remains selectable and older sessions keep
their original provider. Book records and sync protocols are unchanged.

See [OPENAI-SETUP.md](OPENAI-SETUP.md). Key creation is pending because OpenAI
Developers was not connected. No real key or paid request was used in validation,
and no deployment is claimed. Web update only; iOS stays at 1.16.1 build 25.

Validation: all 292 automated tests pass. Project parsing/Worker bundling and all
36 local web-asset checks pass. Browser checks with an explicit mocked provider
cover mixed questions, paragraph/calculation feedback, editable T-account details
and amounts, running totals, marking, history and reload recovery. The preview
uses disposable study data and does not validate real model answer quality.
