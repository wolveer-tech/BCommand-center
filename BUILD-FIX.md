# IPA build fix for v10.25.0 / native 1.10.0 build 16

The build-17 log reports two compiler errors in CommandCentreSharedData.swift. The same incorrect option also appears twice in NativeStateVault.swift, which the failed widget build prevented Xcode from fully checking.

All four uses of .completeUntilFirstUserAuthentication are corrected to .completeFileProtectionUntilFirstUserAuthentication. Atomic writes and the intended file-protection class are retained.

## Apply the small fix ZIP

1. Extract this ZIP into your existing repository root, keeping the native-ios folder structure and replacing the two matching Swift files. Do not replace the entire native-ios directory with only these two files.
2. Commit the changes to the branch Codemagic builds.
3. Start the same Codemagic iOS workflow again. The expected artifact remains CommandCentre-iOS26-v1.10.0.ipa (build 16).

No web-code changes or new signing settings are required for this compiler fix. The corrected full ZIP includes all prior v10.25.0 features if you prefer a complete source copy. Once built and signed, install over the existing app to retain local data.

## Verification

- Both corrected files differ from the previous release only in these four option names.
- No invalid option remains in the native source.
- All seven existing native-project source checks pass. These do not compile Swift.
- A successful iOS build has not been verified locally: this workspace is Windows and has no Xcode SDK. Rerun Codemagic for compilation and signing verification.

Apple API reference: https://developer.apple.com/documentation/foundation/nsdata/writingoptions/completefileprotectionuntilfirstuserauthentication
