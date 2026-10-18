import Foundation
import WebKit

/// Network filtering is independent of iframe sandboxing, so compatible players
/// keep their normal environment. Navigation delegates still block frame popups.
@MainActor final class NativePlayerProtection {
    private static let preferenceKey = "CommandCentreFilterPlayerAds"
    private var ruleList: WKContentRuleList?
    private weak var webView: WKWebView?
    private(set) var enabled: Bool
    private var pendingCompletion: (() -> Void)?
    private var prepareTimeout: DispatchWorkItem?

    init() {
        enabled = UserDefaults.standard.object(forKey: Self.preferenceKey) as? Bool ?? true
    }

    // Deliberately narrow: known advertising hosts, not video/CDN hosts or words
    // such as "ad" in a URL. This cannot remove every provider-served video ad.
    static let encodedRules = #"""
    [
      {"trigger":{"url-filter":"^https?://([a-z0-9-]+\\.)*(doubleclick\\.net|googlesyndication\\.com|popads\\.net|popcash\\.net|exoclick\\.com|juicyads\\.com|trafficjunky\\.net|adsterra\\.com|adnxs\\.com|adsrvr\\.org|propellerads\\.com|monetag\\.com)([/:?]|$)","resource-type":["script","image","raw","document","popup"]},"action":{"type":"block"}}
    ]
    """#

    /// Install before the initial page request; a failed compilation leaves
    /// playback available and reports filtering unavailable to the web UI.
    func prepare(webView: WKWebView, completion: @escaping () -> Void) {
        self.webView = webView
        pendingCompletion = completion
        let timeout = DispatchWorkItem { [weak self] in self?.completePreparation() }
        prepareTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: timeout)
        let identifier = "command-centre-player-ads-v1"
        WKContentRuleListStore.default().lookUpContentRuleList(forIdentifier: identifier) { [weak self] cached, _ in
            guard let self else { return }
            if let cached { self.finishPreparing(cached); return }
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: identifier, encodedContentRuleList: Self.encodedRules) { [weak self] compiled, _ in
                self?.finishPreparing(compiled)
            }
        }
    }

    private func finishPreparing(_ list: WKContentRuleList?) {
        ruleList = list
        apply()
        webView?.configuration.userContentController.addUserScript(WKUserScript(
            source: statusJavaScript, injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        completePreparation()
        publish()
    }

    private func completePreparation() {
        prepareTimeout?.cancel()
        prepareTimeout = nil
        let completion = pendingCompletion
        pendingCompletion = nil
        completion?()
    }

    func setEnabled(_ value: Bool) {
        enabled = value
        UserDefaults.standard.set(value, forKey: Self.preferenceKey)
        apply()
        publish()
    }

    private func apply() {
        guard let controller = webView?.configuration.userContentController, let ruleList else { return }
        controller.remove(ruleList)
        if enabled { controller.add(ruleList) }
    }

    private var statusJavaScript: String {
        "window.CommandCentrePlayerProtection = {popupProtection:true,adFilterAvailable:\(ruleList != nil),adFilterEnabled:\(ruleList != nil && enabled)};"
    }

    func publish() {
        webView?.evaluateJavaScript(statusJavaScript + "window.dispatchEvent(new Event('cc-player-protection-change'));")
    }
}
