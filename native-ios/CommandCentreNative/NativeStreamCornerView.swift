import SwiftUI
import UIKit
import WebKit

/// The provider is a top-level WKWebView, never a frame below the app origin.
enum StreamCornerPolicy {
    static let home = URL(string: "https://streamcorner.st/")!
    private static let selectedSites: [String: URL] = [
        "streamcorner.st": URL(string: "https://streamcorner.st/")!,
        "streamcorner.foo": URL(string: "https://streamcorner.foo/")!,
        "streamcorner.cloud": URL(string: "https://streamcorner.cloud/")!,
        "streamcorner.fun": URL(string: "https://streamcorner.fun/")!,
        "streamninja.cloud": URL(string: "https://streamninja.cloud/")!,
        "streamninja.fun": URL(string: "https://streamninja.fun/")!
    ]

    static func sourceURL(for command: String?) -> URL? {
        guard let command else { return nil }
        if command == "cc-open-streamcorner" { return home }
        let prefix = "cc-open-streamcorner-"
        guard command.hasPrefix(prefix) else { return nil }
        return selectedSites[String(command.dropFirst(prefix.count))]
    }
    private static let hosts: Set<String> = [
        "streamcorner.st", "www.streamcorner.st", "cornerstream.tech", "www.cornerstream.tech",
        "streamcorner.foo", "www.streamcorner.foo", "streamcorner.cloud", "www.streamcorner.cloud",
        "streamcorner.fun", "www.streamcorner.fun", "streamcorner.info", "www.streamcorner.info",
        "streamninja.cloud", "www.streamninja.cloud", "streamninja.fun", "www.streamninja.fun",
        "amazon.com.pandecocogaming.sbs", "embedindia.st", "taifood-blog.asia"
    ]

    static func allowsMainNavigation(_ url: URL?) -> Bool {
        guard let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https",
              let host = components.host?.lowercased(), hosts.contains(host),
              components.port == nil || components.port == 443,
              components.user == nil, components.password == nil else { return false }
        return true
    }
}

@MainActor private final class StreamCornerSession: ObservableObject {
    @Published var canGoBack = false
    @Published var status: String
    let initialURL: URL
    weak var webView: WKWebView?

    init(initialURL: URL) {
        self.initialURL = initialURL
        self.status = "Loading StreamCorner…"
    }

    func back() { webView?.goBack() }
    func reload() { webView?.reload() }
    func home() { webView?.load(URLRequest(url: initialURL)) }
    func close() {
        webView?.stopLoading()
        webView?.loadHTMLString("", baseURL: nil)
        webView = nil
        canGoBack = false
    }
}

struct NativeStreamCornerView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var session: StreamCornerSession

    init(initialURL: URL = StreamCornerPolicy.home) {
        _session = StateObject(wrappedValue: StreamCornerSession(initialURL: initialURL))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button("← Command Centre") { session.close(); dismiss() }
                Spacer(minLength: 4)
                Button("Back") { session.back() }.disabled(!session.canGoBack)
                Button("Home") { session.home() }
                Button("Reload") { session.reload() }
            }
            .font(.subheadline.weight(.semibold))
            .tint(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(Color(red: 0.06, green: 0.11, blue: 0.20))

            StreamCornerBrowser(session: session)
            Text(session.status)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(Color(red: 0.06, green: 0.11, blue: 0.20))
        }
        .background(Color(red: 0.02, green: 0.04, blue: 0.09))
        .onDisappear { session.close() }
    }
}

private struct StreamCornerBrowser: UIViewRepresentable {
    @ObservedObject var session: StreamCornerSession

    func makeCoordinator() -> Coordinator { Coordinator(session: session) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // No Command Centre cookies, credentials, bridge or user scripts enter this view.
        configuration.websiteDataStore = .nonPersistent()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let browser = WKWebView(frame: .zero, configuration: configuration)
        browser.isOpaque = false
        browser.backgroundColor = UIColor(red: 0.02, green: 0.04, blue: 0.09, alpha: 1)
        browser.navigationDelegate = context.coordinator
        browser.uiDelegate = context.coordinator
        session.webView = browser
        browser.load(URLRequest(url: session.initialURL))
        return browser
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.stopLoading()
        uiView.loadHTMLString("", baseURL: nil)
        uiView.navigationDelegate = nil
        uiView.uiDelegate = nil
        coordinator.session.webView = nil
    }

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let session: StreamCornerSession
        init(session: StreamCornerSession) { self.session = session }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.targetFrame == nil {
                decisionHandler(action.navigationType == .linkActivated && StreamCornerPolicy.allowsMainNavigation(action.request.url) ? .allow : .cancel)
                return
            }
            if action.targetFrame?.isMainFrame == true {
                decisionHandler(StreamCornerPolicy.allowsMainNavigation(action.request.url) ? .allow : .cancel)
                return
            }
            let scheme = action.request.url?.scheme?.lowercased() ?? ""
            decisionHandler(["https", "http", "about", "blob", "data"].contains(scheme) ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if action.navigationType == .linkActivated && StreamCornerPolicy.allowsMainNavigation(action.request.url) {
                webView.load(action.request)
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            session.canGoBack = webView.canGoBack
            session.status = "StreamCorner · choose a compatible source"
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { session.status = "StreamCorner could not load. Tap Reload to retry." }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { session.status = "The source could not load. Tap Reload to retry." }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.stopLoading()
            session.status = "The source stopped. Tap Home to start again."
        }
    }
}
