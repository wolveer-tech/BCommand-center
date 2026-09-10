import SwiftUI
import AVFAudio

@main
struct CommandCentreNativeApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        _ = NativeNotificationHandler.shared
        BackgroundRefreshManager.shared.register()
        configureBackgroundPlayback()
    }

    var body: some Scene {
        WindowGroup {
            CommandCentreWebView()
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .onChange(of: scenePhase) { _, newPhase in
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
