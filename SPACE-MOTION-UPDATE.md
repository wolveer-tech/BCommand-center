# Command Centre v10.19.0 — Space launch

Based on the complete v10.18.1 app, including its Face ID hotfix.

## What changed

- A live starfield with 700 stars on phones and 1,200 on larger screens. A gentle drift accelerates into a warp, then fades into the launcher after approximately 3.1 seconds.
- App screens reveal from the tapped icon, with animated navigation back to Home and entrances for modal panels.
- Settings → Home → Space & motion offers Cinematic, Gentle fades, Off and Replay space intro. This preference is saved immediately on the current device, separately from other settings.
- Skip intro, Escape, Enter and Space immediately dismiss the intro. Reduce Motion uses a brief static starfield and fade instead of zooming.
- Native startup waits for the existing Face ID unlock event. This is a visual layer; native authentication remains responsible for unlocking the app.
- Rendering stops when the intro finishes or the page is hidden. Failed canvas initialization and startup timeouts release the interface. No video download or audio autoplay is required.
- The new animation assets are included in the v10.19.0 offline shell cache.

## Install

For an existing v10.18.1 project, extract the space-update ZIP over that project, retaining its existing configuration and secrets. It replaces `public/index.html` and `public/sw.js`, adds `public/space-motion.css` and `public/space-motion.js`, and includes updated tests and this note.

Alternatively use the full project ZIP with your normal environment configuration. Follow the existing README-SETUP.md deployment instructions for your current Command Centre Worker. No database migration or native Swift change is required for this update. The existing IPA loads the hosted web app, so the new experience becomes available after deploying these web assets and reopening/reloading it.

The delivered ZIP is source code, not a signed IPA. This update has not been deployed to the live app. The local preview serves the interface only; live APIs are disabled there.

## Validation

The existing browser bundles were rebuilt and the project check validated inline JavaScript, the Messages/Transfers bundles, feature IDs, manifests and the complete Worker dependency bundle. The existing 59-test suite initially had one failure because its shell-version assertion expected v10.18.1; that assertion was updated for v10.19.0 and its test file passed on rerun. All seven new motion tests pass, including completion, skipping, canvas failure, reduced motion, delayed native unlock, replay cleanup and rapid navigation.

Browser checks covered desktop and 390 × 844 phone layouts, the visible starfield, automatic completion, Replay, Escape-to-skip, Notes opening, return to Home and no horizontal overflow at phone size. Native Face ID sequencing was exercised through its event contract in automated tests; a physical iPhone/Xcode build was not available in this Windows workspace.
