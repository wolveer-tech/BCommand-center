import Foundation
import Security
import WebKit

@MainActor
final class NativeCredentialHandler: NSObject, WKScriptMessageHandler {
    static let shared = NativeCredentialHandler()
    static let storageKey = "cc_transfer_device_v1"

    private let service = "tech.wolveer.commandcentre.native.paired-device"
    private let account = "messages-and-transfers"

    private override init() {}

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        if action == "store", let value = body["value"] as? String, let data = validatedData(value) {
            store(data)
        } else if action == "clear" {
            clear()
        }
    }

    func bootstrapJavaScript() -> String {
        let saved = load().flatMap { String(data: $0, encoding: .utf8) }.map(Self.javaScriptLiteral) ?? "null"
        return """
        (() => {
          const key = '\(Self.storageKey)';
          const saved = \(saved);
          const send = value => {
            try {
              window.webkit?.messageHandlers?.nativeCredentials?.postMessage({action: value ? 'store' : 'clear', value: value || ''});
            } catch (_) {}
          };
          try {
            if (!window.localStorage.getItem(key) && saved) window.localStorage.setItem(key, saved);
            const originalSet = Storage.prototype.setItem;
            const originalRemove = Storage.prototype.removeItem;
            Storage.prototype.setItem = function(name, value) {
              originalSet.call(this, name, value);
              if (this === window.localStorage && name === key) send(String(value));
            };
            Storage.prototype.removeItem = function(name) {
              originalRemove.call(this, name);
              if (this === window.localStorage && name === key) send('');
            };
            const current = window.localStorage.getItem(key);
            if (current) send(current);
          } catch (_) {}
        })();
        """
    }

    private static func javaScriptLiteral(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed),
              let encoded = String(data: data, encoding: .utf8) else { return "null" }
        return encoded
    }

    private func validatedData(_ value: String) -> Data? {
        guard let data = value.data(using: .utf8), data.count > 0, data.count <= 4_096,
              let decoded = try? JSONSerialization.jsonObject(with: data),
              let object = decoded as? [String: Any],
              let token = object["token"] as? String,
              token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              let device = object["device"] as? [String: Any],
              let deviceID = device["id"] as? String, UUID(uuidString: deviceID) != nil,
              let name = device["name"] as? String, !name.isEmpty, name.count <= 60 else { return nil }
        return data
    }

    private func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    private func load() -> Data? {
        var request = query()
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8),
              validatedData(value) != nil else { return nil }
        return data
    }

    private func store(_ data: Data) {
        let attributes = [kSecValueData as String: data]
        let status = SecItemUpdate(query() as CFDictionary, attributes as CFDictionary)
        guard status == errSecItemNotFound else { return }
        var item = query()
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    private func clear() {
        SecItemDelete(query() as CFDictionary)
    }
}
