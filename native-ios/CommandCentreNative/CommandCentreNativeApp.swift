import SwiftUI

@main
struct CommandCentreNativeApp: App {
    var body: some Scene {
        WindowGroup {
            CommandCentreWebView()
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}
