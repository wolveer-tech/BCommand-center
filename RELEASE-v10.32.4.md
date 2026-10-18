# Command Centre v10.32.4

Fix the manga reader failing in Cloudflare Workers with “Invalid redirect value”. The previous Node preview accepted `redirect: error`, which Workers rejects. MangaDex requests now use `redirect: manual`; non-success responses, including redirects, are rejected explicitly without following another host.

Added a regression test that runs the actual reader module and real fetch implementation inside workerd/Miniflare. It verifies search, chapter feeds, page URLs and redirect rejection. The source responses are fixtures, so this test requires no external manga service.

Validation: all 14 manga test cases passed, including the Workers runtime cases; project validation passed. This fix only changes server-side request handling. No note storage, account data, database schema or frontend cache needs to change.

Run `npm run deploy` from the project directory, then retry the manga search. No new secret, migration or iPhone build is needed.
