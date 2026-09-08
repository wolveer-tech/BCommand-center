# Messages v10.8 validation — 8 September 2026

## Passed

- All 19 Node test results: ten Messages scenarios, seven existing Transfers scenarios, and two parent tests. Tests use actual local Cloudflare D1/R2 bindings.
- Existing device credentials and automatic chat list; nine-digit one-use codes (including a leading zero in the browser test), five-minute expiry, replacement, cancellation, concurrent claims, and claims by already paired devices without creating duplicates.
- Atomic per-IP and global pairing attempt limits, hashed stored codes and IP identifiers, and revocation shared with Transfers.
- Bidirectional messages and links; conversations scoped to their participants; literal HTML stored as text; concurrent send retries yielding one stored message; conflicting message-ID reuse rejected.
- Unread counts, read positions clamped to real received messages, and stable older/incremental pagination across 125 messages.
- Notification recipient selection, generic payloads, chat deep links, skipping already read messages and outbox deduplication, using a stub push sender.
- Cleanup preserves conversation history while removing expired pairing and notification state.
- Original Transfers regression suite, including binary multipart R2 round-trip, checksum metadata, retry-safe completion, expiry, device revocation, recipient privacy and cleanup.
- Browser tests using two separate local origins as PC and laptop: short-code pairing, link send with Enter, reply in the other direction, persistent conversation history, saved draft after reload, quick-chat favourite and Home shortcut.
- Desktop and 390px phone layouts visually inspected. Fixed the existing mobile dock overlapping the new composer; the composer and connection button fit within the phone viewport. Message links are created as DOM anchors from text, without interpreting message HTML.
- Browser bundles rebuilt; original inline JavaScript and both bundles parsed; unique Messages/Transfers IDs checked; complete Worker dependencies bundled successfully.

## Limits of this validation

This work used disposable local data. It has not been deployed to the user's GitHub repository or Cloudflare Worker. Apply migration 0009 and upload the update to test the production connection.

Push delivery was tested with a stub sender, not a real notification service. Physical iPhone keyboard behavior, Safari Home Screen push and the existing native wrapper need device testing after deployment. No native Swift files changed in this update. The original Transfers package's native build and companion-tool limitations remain documented in `VALIDATION.md`.

Messages uses polling while visible, saved browser credentials and D1 history; it does not implement WebSocket presence or end-to-end encryption. No new dependencies or AI integration were added.
