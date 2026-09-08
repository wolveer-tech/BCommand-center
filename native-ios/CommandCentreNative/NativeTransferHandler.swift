import Foundation
import WebKit
import UIKit
import CryptoKit

/// Downloads to disk without converting media or loading entire files into memory.
@MainActor
final class NativeTransferHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private var running = false

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "nativeTransfer", message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == AppConfig.commandCentreURL.scheme,
              message.frameInfo.securityOrigin.host == AppConfig.commandCentreURL.host,
              let body = message.body as? [String: Any], body["action"] as? String == "download",
              let rawURL = body["url"] as? String, let url = URL(string: rawURL),
              url.scheme == "https", let host = url.host, host.hasSuffix(".r2.cloudflarestorage.com"),
              let digest = body["sha256"] as? String, digest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let size = body["size"] as? NSNumber, size.int64Value >= 0, size.int64Value <= 10_737_418_240 else { return }
        guard !running else { notify("A file is already downloading. Please wait.", error: true); return }
        let suppliedName = (body["filename"] as? String) ?? "file"
        let name = suppliedName.replacingOccurrences(of: "\\", with: "/").components(separatedBy: "/").last ?? "file"
        let safeName = (name.isEmpty || name == "." || name == "..") ? "file" : name
        running = true
        Task {
            var directory: URL?
            defer { running = false }
            do {
                let (temporary, response) = try await URLSession.shared.download(from: url)
                guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode) else {
                    throw TransferError.failed("Download failed. Try Save original again.")
                }
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("CCTransfer-" + UUID().uuidString, isDirectory: true)
                directory = folder
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let destination = folder.appendingPathComponent(safeName)
                try FileManager.default.moveItem(at: temporary, to: destination)
                let expectedSize = size.int64Value
                let matches = try await Task.detached(priority: .utility) {
                    let file = try FileHandle(forReadingFrom: destination)
                    defer { try? file.close() }
                    var checksum = SHA256(), total: Int64 = 0
                    while let data = try file.read(upToCount: 1_048_576), !data.isEmpty {
                        total += Int64(data.count)
                        if total > expectedSize { return false }
                        checksum.update(data: data)
                    }
                    let actual = checksum.finalize().map { String(format: "%02x", $0) }.joined()
                    return total == expectedSize && actual == digest
                }.value
                guard matches else { throw TransferError.failed("Checksum mismatch. The file was not shared. Try downloading again.") }
                guard var presenter = webView?.window?.rootViewController else { throw TransferError.failed("Open the app and try downloading again.") }
                while let presented = presenter.presentedViewController { presenter = presented }
                let sheet = UIActivityViewController(activityItems: [destination], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = webView
                sheet.popoverPresentationController?.sourceRect = webView?.bounds ?? .zero
                sheet.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: folder) }
                presenter.present(sheet, animated: true)
                directory = nil // Share sheet owns the temporary file until dismissal.
                notify("SHA-256 matches. Use Save to Files or choose an app to open the original.")
            } catch {
                if let directory { try? FileManager.default.removeItem(at: directory) }
                notify((error as? TransferError)?.message ?? "Download could not finish. Keep the app open and try again.", error: true)
            }
        }
    }

    private func notify(_ message: String, error: Bool = false) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["message": message, "error": error]),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('cc-transfer-native',{detail:\(json)}));")
    }

    private enum TransferError: Error {
        case failed(String)
        var message: String { switch self { case .failed(let value): return value } }
    }
}
