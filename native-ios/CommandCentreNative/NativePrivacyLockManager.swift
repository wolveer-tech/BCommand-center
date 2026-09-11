import Foundation
import LocalAuthentication
import SwiftUI
import UIKit
import WebKit

@MainActor
final class NativePrivacyLockManager: NSObject, ObservableObject, WKScriptMessageHandler {
    static let shared = NativePrivacyLockManager()

    @Published private(set) var isLocked: Bool
    @Published private(set) var isShielded = false
    @Published private(set) var isAuthenticating = false

    private let enabledKey = "cc.privacy-lock.enabled"
    private let graceKey = "cc.privacy-lock.grace-seconds"
    private weak var webView: WKWebView?
    private var backgroundedAt: Date?

    private(set) var isEnabled: Bool
    private(set) var graceSeconds: Int

    private override init() {
        let defaults = UserDefaults.standard
        isEnabled = defaults.bool(forKey: enabledKey)
        let savedGrace = defaults.object(forKey: graceKey) as? Int
        graceSeconds = Self.validGrace(savedGrace ?? 0)
        isLocked = isEnabled
        super.init()
    }

    func attach(webView: WKWebView) {
        self.webView = webView
        publishStatus()
    }

    func bootstrapJavaScript() -> String {
        """
        (() => {
          const sendStatus = () => {
            try { window.webkit?.messageHandlers?.nativePrivacy?.postMessage({action: 'status'}); } catch (_) {}
          };
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sendStatus, {once: true});
          else sendStatus();
        })();
        """
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "status":
            publishStatus()
        case "configure":
            guard let requested = body["enabled"] as? Bool else {
                publishStatus(error: "Choose whether Privacy Lock is on or off.")
                return
            }
            let grace = Self.validGrace((body["graceSeconds"] as? NSNumber)?.intValue ?? graceSeconds)
            configure(enabled: requested, graceSeconds: grace)
        case "lock":
            guard isEnabled else {
                publishStatus(error: "Turn on Privacy Lock in Settings first.")
                return
            }
            lockNow()
        case "unlock":
            authenticate(reason: "Unlock your private Command Centre data")
        case "haptic":
            playHaptic(style: body["style"] as? String ?? "light")
        default:
            break
        }
    }

    func handleScenePhase(_ phase: ScenePhase) {
        switch phase {
        case .inactive, .background:
            guard isEnabled else { return }
            isShielded = true
            if backgroundedAt == nil { backgroundedAt = Date() }
        case .active:
            guard isEnabled else {
                isLocked = false
                isShielded = false
                backgroundedAt = nil
                return
            }
            let elapsed = backgroundedAt.map { Date().timeIntervalSince($0) } ?? .infinity
            backgroundedAt = nil
            if isLocked || graceSeconds == 0 || elapsed >= Double(graceSeconds) {
                isLocked = true
                isShielded = true
                authenticate(reason: "Unlock your private Command Centre data")
            } else {
                isShielded = false
            }
        @unknown default:
            break
        }
    }

    func lockNow() {
        guard isEnabled else { return }
        isLocked = true
        isShielded = true
        playHaptic(style: "medium")
        publishStatus()
    }

    func authenticate(reason: String, completion: ((Bool, String?) -> Void)? = nil) {
        guard !isAuthenticating else { return }
        guard isEnabled || completion != nil else {
            isLocked = false
            isShielded = false
            return
        }

        let context = LAContext()
        context.localizedCancelTitle = "Keep Locked"
        var availabilityError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &availabilityError) else {
            let message = availabilityError?.localizedDescription ?? "Set an iPhone passcode to use Privacy Lock."
            publishStatus(error: message)
            completion?(false, message)
            return
        }

        isAuthenticating = true
        publishStatus()
        Task { @MainActor in
            do {
                let success = try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
                isAuthenticating = false
                if success {
                    isLocked = false
                    isShielded = false
                    playHaptic(style: "success")
                }
                publishStatus()
                completion?(success, success ? nil : "Authentication was not completed.")
            } catch {
                isAuthenticating = false
                let message = error.localizedDescription
                publishStatus(error: message)
                completion?(false, message)
            }
        }
    }

    private func configure(enabled requested: Bool, graceSeconds grace: Int) {
        if requested == isEnabled {
            graceSeconds = grace
            UserDefaults.standard.set(grace, forKey: graceKey)
            publishStatus()
            return
        }

        let reason = requested ? "Turn on Privacy Lock for your private app data" : "Turn off Privacy Lock"
        authenticate(reason: reason) { [weak self] success, error in
            guard let self = self else { return }
            guard success else {
                self.publishStatus(error: error ?? "Privacy Lock was not changed.")
                return
            }
            self.isEnabled = requested
            self.graceSeconds = grace
            self.isLocked = false
            self.isShielded = false
            UserDefaults.standard.set(requested, forKey: self.enabledKey)
            UserDefaults.standard.set(grace, forKey: self.graceKey)
            self.publishStatus()
        }
    }

    private static func validGrace(_ value: Int) -> Int {
        [0, 60, 300, 900].contains(value) ? value : 0
    }

    private func playHaptic(style: String) {
        switch style {
        case "success":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning":
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "medium":
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        default:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func publishStatus(error: String? = nil) {
        let payload: [String: Any] = [
            "available": true,
            "enabled": isEnabled,
            "locked": isLocked,
            "authenticating": isAuthenticating,
            "graceSeconds": graceSeconds,
            "error": error ?? ""
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('cc-native-privacy-status',{detail:\(json)}));")
    }
}

struct NativePrivacyLockView: View {
    @ObservedObject var manager: NativePrivacyLockManager

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.02, green: 0.04, blue: 0.09), Color(red: 0.08, green: 0.08, blue: 0.18)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 48, weight: .semibold))
                    .foregroundStyle(.white, .blue)
                Text("Command Centre Locked")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                Text("Your messages, notes and personal information are hidden.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.68))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)
                Button(manager.isAuthenticating ? "Authenticating…" : "Unlock") {
                    manager.authenticate(reason: "Unlock your private Command Centre data")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(manager.isAuthenticating)
            }
        }
        .accessibilityElement(children: .contain)
    }
}
