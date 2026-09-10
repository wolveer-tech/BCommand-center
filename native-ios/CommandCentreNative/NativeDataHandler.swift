import Foundation
import UIKit
import UniformTypeIdentifiers
import WebKit

@MainActor
final class NativeDataHandler: NSObject, WKScriptMessageHandler, UIDocumentPickerDelegate {
    weak var webView: WKWebView?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == (AppConfig.commandCentreURL.host ?? ""),
              message.name == "nativeData",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }
        if action == "export" {
            exportFile(name: body["filename"] as? String ?? "command-centre-backup.json", contents: body["contents"] as? String ?? "")
        } else if action == "import" {
            presentImporter()
        }
    }

    private func exportFile(name: String, contents: String) {
        guard contents.utf8.count <= 10 * 1024 * 1024 else { return }
        let safeName = name.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName.isEmpty ? "command-centre-backup.json" : safeName)
        do {
            try contents.data(using: .utf8)?.write(to: url, options: .atomic)
            let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let popover = controller.popoverPresentationController, let view = topViewController()?.view {
                popover.sourceView = view
                popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            }
            topViewController()?.present(controller, animated: true)
        } catch {
            reportError("Could not create the backup file: \(error.localizedDescription)")
        }
    }

    private func presentImporter() {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true)
        picker.allowsMultipleSelection = false
        picker.delegate = self
        topViewController()?.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey])
            if (values.fileSize ?? 0) > 10 * 1024 * 1024 {
                throw NSError(domain: "CommandCentreBackup", code: 1, userInfo: [NSLocalizedDescriptionKey: "The backup is larger than 10 MB."])
            }
            let contents = try String(contentsOf: url, encoding: .utf8)
            guard let data = try? JSONSerialization.data(withJSONObject: contents),
                  let literal = String(data: data, encoding: .utf8) else { return }
            webView?.evaluateJavaScript("window.CommandCentreReceiveBackup(\(literal));")
        } catch {
            reportError("Could not open that backup: \(error.localizedDescription)")
        }
    }

    private func reportError(_ message: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let literal = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.CommandCentreNativeDataError(\(literal));")
    }

    private func topViewController(base: UIViewController? = nil) -> UIViewController? {
        let root = base ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?.rootViewController
        if let navigation = root as? UINavigationController { return topViewController(base: navigation.visibleViewController) }
        if let tab = root as? UITabBarController { return topViewController(base: tab.selectedViewController) }
        if let presented = root?.presentedViewController { return topViewController(base: presented) }
        return root
    }
}
