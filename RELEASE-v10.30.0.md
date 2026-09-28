# Command Centre v10.30.0

## Notification delivery

- Makes the linked Safari Home Screen PWA the primary delivery route for reminders, calendar events, morning briefings, news, Messages and Transfers.
- Keeps football fixture alerts and Live Activities native in the IPA, avoiding duplicate sports notifications from the PWA.
- Uses APNs as a fallback for Messages and Transfers when no working Web Push companion is available.
- Adds a clear hybrid-delivery status and sends notification tests through the route that will actually be used.
- Native iOS 1.13.0 (build 21) suppresses opportunistic Messages and Transfers background alerts while the PWA companion is active, preventing late duplicates.

## Games launcher

- Adds a dedicated eight-game selection screen for 2048, Trivia, Wordle, Connections, Mini Crossword, Crossword, Strands and Sudoku.
- Shows per-game progress or best-score information on each launcher tile.
- Opens one focused game at a time with a clear **All games** button.
- Keeps Easy, Medium and Hard selection plus the full puzzle refresh action.

## Installation note

Copy the full v10.30.0 folder to replace the previous project. Deploy the Worker/PWA files for notification routing to take effect. Rebuild the IPA from the included native project to also disable its older duplicate background inbox checks; the PWA-first server routing still works with the existing IPA.
