import SwiftUI
import AVFAudio

@main
struct CommandCentreNativeApp: App {
    init() {
        configureBackgroundPlayback()
    }

    var body: some Scene {
        WindowGroup {
            CommandCentreWebView()
                .ignoresSafeArea(.container, edges: .bottom)
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
