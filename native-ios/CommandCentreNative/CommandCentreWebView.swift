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
        configuration.userContentController.addUserScript(WKUserScript(source: "window.CommandCentreIntroPlayed = \(UserDefaults.standard.bool(forKey: "cc.intro.played.v1") ? "true" : "false");", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController.add(context.coordinator.transferHandler, name: "nativeTransfer")
        configuration.userContentController.add(context.coordinator.notificationHandler, name: "nativeNotifications")
        configuration.userContentController.add(context.coordinator.dataHandler, name: "nativeData")
        configuration.userContentController.add(context.coordinator.credentialHandler, name: "nativeCredentials")
        configuration.userContentController.add(context.coordinator.privacyHandler, name: "nativePrivacy")
        configuration.userContentController.add(context.coordinator.dashboardHandler, name: "nativeDashboard")

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
            window.CommandCentreNative = { replayKit: true, nativeScreenMirror: true, nativeNotifications: true, backgroundRefresh: true, dataBridge: true, credentialVault: true, privacyLock: true, nativeHaptics: true, nativeWidgets: true, liveActivities: true, stateVault: true, platform: 'ios', minimumRuntime: 'iOS 26' };
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
        context.coordinator.transferHandler.webView = webView
        context.coordinator.notificationHandler.webView = webView
        context.coordinator.dataHandler.webView = webView
        context.coordinator.privacyHandler.attach(webView: webView)
        context.coordinator.dashboardHandler.webView = webView
        NativeLiveActivityPushManager.shared.webView = webView
        NativeDeepLinkRouter.shared.attach(webView: webView)
        NativeMirrorManager.shared.webView = webView
        webView.load(URLRequest(url: AppConfig.commandCentreURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeMirror")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeIntro")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeTransfer")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotifications")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeData")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeCredentials")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativePrivacy")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeDashboard")
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let transferHandler = NativeTransferHandler()
        let notificationHandler = NativeNotificationHandler.shared
        let dataHandler = NativeDataHandler()
        let credentialHandler = NativeCredentialHandler.shared
        let privacyHandler = NativePrivacyLockManager.shared
        let dashboardHandler = NativeDashboardHandler.shared
        weak var webView: WKWebView?

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            NativeDeepLinkRouter.shared.webViewDidFinishLoading()
            dashboardHandler.webView = webView
            webView.evaluateJavaScript("window.CommandCentreSyncNativeDashboard?.(true);")
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "nativeIntro" {
                if trustedMainFrame(message.frameInfo) { UserDefaults.standard.set(true, forKey: "cc.intro.played.v1") }
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
