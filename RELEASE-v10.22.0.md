# Football focus and Notes writing dock v10.22.0

This is a web/Worker release. It does **not** require a new IPA when iOS 1.8.0
build 14 is already installed, because the native wrapper loads the deployed
Command Centre site.

## What changed

- Football now opens on the saved selected league, with Premier League as the
  default for a fresh install. Fixtures and results are filtered to that league.
- The new **All — worldwide** option shows every available competition only
  when selected. It groups matches by competition and places followed/favourite
  teams first, then major international competitions, Premier League, Champions
  League, the other major European leagues and cups, and then the remaining
  worldwide competitions.
- Standings remain tied to a specific league. In All mode the app asks you to
  choose a league instead of pretending a worldwide table exists.
- When the iPhone keyboard is open in the body of a note, the title, folder/pin
  row and save/cancel footer are hidden so the writing area can use the screen.
- A compact floating dock keeps Bold and List immediately available. **Aa**
  expands font family, font size, italic, underline, strike, text colours and
  clear-format controls. The down arrow dismisses the keyboard and restores the
  full editor controls.
- Formatting actions preserve the current text selection and the caret is kept
  above the floating dock.

## Deploy

Upload/commit the update package contents over the matching repository files
and let the existing Cloudflare Git deployment complete. There is no migration,
new Worker variable, secret, entitlement or native build for this release.

Static validation and the complete local suite pass: **75/75 tests**.
