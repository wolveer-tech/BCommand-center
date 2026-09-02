import SwiftUI
import WebKit

struct CommandCentreWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "nativeMirror")

        let bridgeScript = WKUserScript(
            source: """
            window.CommandCentreNative = { replayKit: true, nativeScreenMirror: true, platform: 'ios', minimumRuntime: 'iOS 26' };
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        configuration.userContentController.addUserScript(bridgeScript)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = webView
        NativeMirrorManager.shared.webView = webView
        webView.load(URLRequest(url: AppConfig.commandCentreURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "nativeMirror")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
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
