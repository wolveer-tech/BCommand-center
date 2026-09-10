import SwiftUI
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
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeMirror")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeTransfer")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeNotifications")
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeData")
    }

    @MainActor final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
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
    }
}
