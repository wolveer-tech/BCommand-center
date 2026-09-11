import SwiftUI
import AVFAudio

@main
struct CommandCentreNativeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var privacyLock = NativePrivacyLockManager.shared

    init() {
        _ = NativeNotificationHandler.shared
        BackgroundRefreshManager.shared.register()
        configureBackgroundPlayback()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                CommandCentreWebView()
                    .privacySensitive()
                    .opacity(privacyLock.isLocked || privacyLock.isShielded ? 0 : 1)
                    .allowsHitTesting(!privacyLock.isLocked && !privacyLock.isShielded)

                if privacyLock.isLocked || privacyLock.isShielded {
                    NativePrivacyLockView(manager: privacyLock)
                }
            }
            .background(Color(red: 0.02, green: 0.04, blue: 0.09))
            .ignoresSafeArea(.container, edges: .bottom)
            .onAppear { privacyLock.handleScenePhase(.active) }
        }
        .onChange(of: scenePhase) { _, newPhase in
            privacyLock.handleScenePhase(newPhase)
            if newPhase == .background {
                BackgroundRefreshManager.shared.scheduleNext()
            }
        }
    }

    private func configureBackgroundPlayback() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {
            print("Background media audio session could not be activated: \(error.localizedDescription)")
        }
    }
}
