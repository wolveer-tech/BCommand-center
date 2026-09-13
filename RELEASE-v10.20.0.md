# Command Centre v10.20.0 / iOS 1.7.0

This release implements the requested white-list foundation improvements on top
of the newest v10.19.0 deployment.

## Install

1. Copy the contents of the full package into the root of the GitHub repository
   and allow matching files to replace their older versions.
2. Commit and push. The existing Cloudflare workflow can deploy the Worker and
   web files normally.
3. Let Codemagic build `CommandCentre-iOS26-v1.7.0.ipa`.
4. Install the IPA over the current app. Do not delete the old app first, so its
   Keychain-backed Messages and Transfers device identity can be retained.

The new IPA is required for the Face ID lifecycle and native Mirror picker
repairs. The intro, Notes, Sport and Refresh Feed work arrives in the web/Worker
deployment. No D1 migration, new secret or entitlement is required.

## Validation

- Static project validation passes.
- Automated suite: 65/65 tests pass.
- Mobile browser QA confirms the Athletics switch and the Notes toolbar/action
  layout at a 463 × 550 viewport.
- Final Face ID, ReplayKit and real software-keyboard checks require the built
  IPA on an iPhone because Swift cannot be compiled or signed on Windows.
