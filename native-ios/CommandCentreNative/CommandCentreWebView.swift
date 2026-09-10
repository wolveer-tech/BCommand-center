import SwiftUI
import UIKit
import WebKit

struct CommandCentreWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "nativeMirror")
        configuration.userContentController.add(context.coordinator.transferHandler, name: "nativeTransfer")
        configuration.userContentController.add(context.coordinator.notificationHandler, name: "nativeNotifications")
        configuration.userContentController.add(context.coordinator.dataHandler, name: "nativeData")

        let bridgeScript = WKUserScript(
            source: """
            window.CommandCentreNative = { replayKit: true, nativeScreenMirror: true, nativeNotifications: true, backgroundRefresh: true, dataBridge: true, platform: 'ios', minimumRuntime: 'iOS 26' };
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
        NativeMirrorManager.shared.webView = webView
        webView.load(URLRequest(url: AppConfig.commandCentreURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeMirror")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeTransfer")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotifications")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeData")
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let transferHandler = NativeTransferHandler()
        let notificationHandler = NativeNotificationHandler.shared
        let dataHandler = NativeDataHandler()
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
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

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            guard let presenter = presenter(for: webView) else { completionHandler(); return }
            let alert = UIAlertController(title: "Command Centre", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            guard let presenter = presenter(for: webView) else { completionHandler(false); return }
            let alert = UIAlertController(title: "Command Centre", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "Continue", style: .destructive) { _ in completionHandler(true) })
            presenter.present(alert, animated: true)
        }

        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
            guard let presenter = presenter(for: webView) else { completionHandler(nil); return }
            let alert = UIAlertController(title: "Command Centre", message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
            presenter.present(alert, animated: true)
        }
    }
}
