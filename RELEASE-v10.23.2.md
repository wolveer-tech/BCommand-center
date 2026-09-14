# League One recent-score hotfix v10.23.2

This hosted hotfix fixes the final League One result display issue.

- FotMob league-history records store scores in `status.scoreStr`; the daily
  feed stores them on each team. Command Centre now supports both shapes.
- The League One endpoint was live-checked with 552 season matches and 71
  completed matches. The UI now receives the 48 newest results with numerical
  full-time scores, plus the nearest 80 live/upcoming fixtures.
- The Results subtitle reports how many recent results were loaded.
- The football Worker cache is bumped to `football-v5`, and the app shell cache
  is `command-centre-shell-v10.23.2`, preventing older scoreless responses from
  surviving the deployment.

No migration, Worker variable, IPA rebuild, Codemagic build or Signulous step
is required. Static validation and the full local suite pass: **80/80 tests**.
