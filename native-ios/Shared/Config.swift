import Foundation

enum AppConfig {
    static let commandCentreURL = URL(string: "https://bcommand-center.wolvesgidaree.workers.dev")!
    static let stunServers = ["stun:stun.l.google.com:19302"]

    // This is a rendezvous channel, not an authentication secret.
    // It lets the containing app and ReplayKit extension find the same
    // short-lived mirror room without requiring an App Group entitlement.
    static let nativeMirrorChannel = "ccaed79701bb4d8d73ba508bd8005269"
}
