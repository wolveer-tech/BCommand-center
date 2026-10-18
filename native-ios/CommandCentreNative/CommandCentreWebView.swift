import SwiftUI
import UIKit
import WebKit

struct CommandCentreWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "nativeMirror")
        configuration.userContentController.add(context.coordinator, name: "nativeIntro")
        configuration.userContentController.add(context.coordinator, name: "nativePlayerFiltering")
        configuration.userContentController.addUserScript(WKUserScript(source: "window.CommandCentreIntroSessionManaged = true; window.CommandCentreIntroPlayed = \(Coordinator.introPlayedThisLaunch ? "true" : "false");", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator.transferHandler, name: "nativeTransfer")
        configuration.userContentController.add(context.coordinator.notificationHandler, name: "nativeNotifications")
        configuration.userContentController.add(context.coordinator.dataHandler, name: "nativeData")
        configuration.userContentController.add(context.coordinator.credentialHandler, name: "nativeCredentials")
        configuration.userContentController.add(context.coordinator.privacyHandler, name: "nativePrivacy")
        configuration.userContentController.add(context.coordinator.dashboardHandler, name: "nativeDashboard")
        configuration.userContentController.add(NativeMusicHandler.shared, name: "nativeMusic")

        configuration.userContentController.addUserScript(WKUserScript(source: NativeStateVault.bootstrapJavaScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))

        let credentialScript = WKUserScript(
            source: context.coordinator.credentialHandler.bootstrapJavaScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(credentialScript)

        let privacyScript = WKUserScript(
            source: context.coordinator.privacyHandler.bootstrapJavaScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(privacyScript)

        let bridgeScript = WKUserScript(
            source: """
            window.CommandCentreNative = { nativeMusic: true, replayKit: true, nativeScreenMirror: true, nativeNotifications: true, backgroundRefresh: true, dataBridge: true, credentialVault: true, privacyLock: true, nativeHaptics: true, nativeWidgets: true, liveActivities: true, stateVault: true, platform: 'ios', minimumRuntime: 'iOS 26' };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = webView
        NativeMusicHandler.shared.webView = webView
        context.coordinator.transferHandler.webView = webView
        context.coordinator.notificationHandler.webView = webView
        context.coordinator.dataHandler.webView = webView
        context.coordinator.privacyHandler.attach(webView: webView)
        context.coordinator.dashboardHandler.webView = webView
        NativeLiveActivityPushManager.shared.webView = webView
        NativeDeepLinkRouter.shared.attach(webView: webView)
        NativeMirrorManager.shared.webView = webView
        context.coordinator.playerProtection.prepare(webView: webView) { [weak webView] in
            webView?.load(URLRequest(url: AppConfig.commandCentreURL, timeoutInterval: 25))
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        coordinator.stopRecoveryObservers()
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeMirror")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeIntro")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativePlayerFiltering")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeTransfer")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotifications")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeData")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeCredentials")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativePrivacy")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeDashboard")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeMusic")
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        // Shared by web views in this app process, reset on the next cold launch.
        static var introPlayedThisLaunch = false
        let transferHandler = NativeTransferHandler()
        let notificationHandler = NativeNotificationHandler.shared
        let dataHandler = NativeDataHandler()
        let credentialHandler = NativeCredentialHandler.shared
        let privacyHandler = NativePrivacyLockManager.shared
        let dashboardHandler = NativeDashboardHandler.shared
        let playerProtection = NativePlayerProtection()
        weak var webView: WKWebView?
        private var processFailures: [Date] = []
        private var memoryObserver: NSObjectProtocol?
        private var recoveryAlertVisible = false

        override init() {
            super.init()
            memoryObserver = NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.webView?.evaluateJavaScript("window.CommandCentrePlaybackSafety?.stopAll();")
                }
            }
        }

        func stopRecoveryObservers() {
            if let memoryObserver { NotificationCenter.default.removeObserver(memoryObserver) }
            memoryObserver = nil
        }

        private func loadRecoveryHome(_ webView: WKWebView) {
            // Load a clean app document, never WebKit's failed player/back stack.
            var components = URLComponents(url: AppConfig.commandCentreURL, resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "playerRecovery", value: "1")]
            webView.stopLoading()
            webView.load(URLRequest(url: components.url!, timeoutInterval: 25))
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            let now = Date()
            processFailures = processFailures.filter { now.timeIntervalSince($0) < 120 }
            processFailures.append(now)
            if processFailures.count <= 2 { loadRecoveryHome(webView) }
            else { showRecovery(webView, message: "The web player stopped responding. Its stream has been closed. Tap Open Home to restart the app without opening the stream.") }
        }

        private func showRecovery(_ webView: WKWebView, message: String) {
            guard !recoveryAlertVisible, let host = presenter(for: webView) else { return }
            recoveryAlertVisible = true
            let alert = UIAlertController(title: "Player stopped", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Open Home", style: .default) { [weak self, weak webView] _ in
                guard let self else { return }
                self.recoveryAlertVisible = false
                self.processFailures.removeAll()
                if let webView { self.loadRecoveryHome(webView) }
            })
            host.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            showRecovery(webView, message: "Command Centre could not finish loading. Check your connection, then tap Open Home to try again.")
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            showRecovery(webView, message: "The page stopped loading. Tap Open Home to restart without reopening the stream.")
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            playerProtection.publish()
            NativeDeepLinkRouter.shared.webViewDidFinishLoading()
            dashboardHandler.webView = webView
            webView.evaluateJavaScript("window.CommandCentreSyncNativeDashboard?.(true);")
            NativeMusicHandler.shared.publish()
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "nativePlayerFiltering" {
                guard trustedMainFrame(message.frameInfo),
                      let body = message.body as? [String: Any],
                      let enabled = body["enabled"] as? Bool else { return }
                playerProtection.setEnabled(enabled)
                return
            }
            if message.name == "nativeIntro" {
                if trustedMainFrame(message.frameInfo),
                   let body = message.body as? [String: Any], body["action"] as? String == "played",
                   !Self.introPlayedThisLaunch {
                    Self.introPlayedThisLaunch = true
                    // The original document-start script is a snapshot. Override it for
                    // reloads of this web view as well as using the process flag for new views.
                    message.webView?.configuration.userContentController.addUserScript(WKUserScript(source: "window.CommandCentreIntroPlayed = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
                }
                return
            }
            guard message.name == "nativeMirror",
                  let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }

            switch action {
            case "start":
                let base = (body["baseURL"] as? String).flatMap(URL.init(string:)) ?? AppConfig.commandCentreURL
                Task { @MainActor in
                    await NativeMirrorManager.shared.start(baseURL: base)
                }
            case "stop":
                Task { @MainActor in
                    await NativeMirrorManager.shared.stop()
                }
            case "picker":
                NativeMirrorManager.shared.presentBroadcastPicker()
            default:
                break
            }
        }

        private func presenter(for webView: WKWebView) -> UIViewController? {
            var controller = webView.window?.rootViewController
            while true {
                if let presented = controller?.presentedViewController { controller = presented }
                else if let navigation = controller as? UINavigationController { controller = navigation.visibleViewController }
                else if let tabs = controller as? UITabBarController { controller = tabs.selectedViewController }
                else { return controller }
            }
        }

        private func trustedMainFrame(_ frame: WKFrameInfo) -> Bool {
            let origin = frame.securityOrigin
            let expected = AppConfig.commandCentreURL
            let defaultPort = expected.scheme == "https" ? 443 : 80
            return frame.isMainFrame && origin.host.lowercased() == expected.host?.lowercased()
                && origin.protocol == expected.scheme
                && (origin.port == 0 ? defaultPort : origin.port) == (expected.port ?? defaultPort)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Embedded players may navigate inside their frame, never replace the app or open another app.
            if navigationAction.targetFrame == nil {
                decisionHandler(trustedMainFrame(navigationAction.sourceFrame) ? .allow : .cancel)
                return
            }
            guard navigationAction.targetFrame?.isMainFrame == true else {
                let scheme = navigationAction.request.url?.scheme?.lowercased() ?? ""
                decisionHandler(["https", "http", "about", "blob", "data"].contains(scheme) ? .allow : .cancel)
                return
            }
            guard navigationAction.sourceFrame.isMainFrame, let url = navigationAction.request.url else {
                decisionHandler(.cancel); return
            }
            if url.scheme == AppConfig.commandCentreURL.scheme && url.host == AppConfig.commandCentreURL.host && url.port == AppConfig.commandCentreURL.port {
                decisionHandler(.allow); return
            }
            if trustedMainFrame(navigationAction.sourceFrame),
               ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url, options: [:])
            }
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            guard trustedMainFrame(frame) else { completionHandler(); return }
            guard let presenter = presenter(for: webView) else { completionHandler(); return }
            let alert = UIAlertController(title: "Command Centre", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            guard trustedMainFrame(frame) else { completionHandler(false); return }
            guard let presenter = presenter(for: webView) else { completionHandler(false); return }
            let alert = UIAlertController(title: "Command Centre", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "Continue", style: .destructive) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
            guard trustedMainFrame(frame) else { completionHandler(nil); return }
            guard let presenter = presenter(for: webView) else { completionHandler(nil); return }
            let alert = UIAlertController(title: "Command Centre", message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            guard navigationAction.targetFrame == nil,
                  trustedMainFrame(navigationAction.sourceFrame),
                  let url = navigationAction.request.url,
                  let scheme = url.scheme?.lowercased(),
                  scheme == "https" || scheme == "http" else { return nil }

            if url.host?.lowercased() == AppConfig.commandCentreURL.host?.lowercased() {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url, options: [:])
            }
            return nil
        }
    }
}
