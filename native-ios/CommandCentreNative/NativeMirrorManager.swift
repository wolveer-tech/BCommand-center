import Foundation
import Combine
import WebKit
import ReplayKit
import UIKit

@MainActor
final class NativeMirrorManager: ObservableObject {
    static let shared = NativeMirrorManager()
    weak var webView: WKWebView?

    private var signalling: SignallingClient?
    private var broadcastPicker: RPSystemBroadcastPickerView?

    private init() {}

    func start(baseURL: URL) async {
        await stop(clearStatus: false)

        do {
            let signalling = SignallingClient(baseURL: baseURL)
            let code = try await signalling.createRoom()
            self.signalling = signalling

            guard let shared = UserDefaults(suiteName: AppConfig.appGroup) else {
                throw NSError(domain: "CommandCentre", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not open the Command Centre app group."])
            }
            shared.set(code, forKey: "mirrorRoomCode")
            shared.set(baseURL.absoluteString, forKey: "mirrorBaseURL")
            shared.set(Date().timeIntervalSince1970, forKey: "mirrorRoomCreatedAt")
            shared.synchronize()

            sendStatus(
                message: "Mirror room created. Enter \(code) on the laptop, then confirm Start Broadcast in Apple's screen-sharing panel.",
                code: code,
                ok: true
            )

            presentBroadcastPicker()
        } catch {
            sendStatus(message: error.localizedDescription, error: true)
        }
    }

    func stop(clearStatus: Bool = true) async {
        if let shared = UserDefaults(suiteName: AppConfig.appGroup) {
            shared.removeObject(forKey: "mirrorRoomCode")
            shared.removeObject(forKey: "mirrorBaseURL")
            shared.synchronize()
        }
        signalling = nil
        if clearStatus { sendStatus(message: "Native mirror stopped") }
    }

    private func presentBroadcastPicker() {
        guard let host = webView?.superview ?? webView else {
            sendStatus(message: "Could not present the iPhone broadcast picker.", error: true)
            return
        }

        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 50, height: 50))
        picker.preferredExtension = AppConfig.broadcastExtensionBundleID
        picker.showsMicrophoneButton = false
        picker.alpha = 0.01
        picker.isUserInteractionEnabled = true
        host.addSubview(picker)
        self.broadcastPicker = picker

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self, weak picker] in
            guard let picker else { return }
            if let button = picker.subviews.compactMap({ $0 as? UIButton }).first {
                button.sendActions(for: .touchUpInside)
            } else {
                self?.sendStatus(message: "Tap the iOS broadcast control to start screen sharing.", error: true)
            }

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                picker.removeFromSuperview()
                self?.broadcastPicker = nil
            }
        }
    }

    private func sendStatus(message: String, code: String? = nil, ok: Bool = false, error: Bool = false) {
        var payload: [String: Any] = ["message": message, "ok": ok, "error": error]
        if let code { payload["code"] = code }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.CommandCentreNativeMirrorStatus && window.CommandCentreNativeMirrorStatus(\(json));")
    }
}
