import Foundation

// Independent of WKWebView's website storage; survives website-data eviction and app updates.
// App deletion still deletes this container. Use Export backup before changing installations.
enum NativeStateVault {
    private static func directory() throws -> URL {
        let url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("CommandCentreRecovery", isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func count(_ state: [String: Any]) -> Int {
        ["notes", "events", "reminders"].reduce(0) { $0 + (state[$1] as? [Any] ?? []).count }
            + (state["bibleRead"] as? [String: Bool] ?? [:]).values.filter { $0 }.count
    }

    private static func valid(_ state: [String: Any]) -> Bool {
        ["notes", "events", "reminders"].allSatisfy { state[$0] is [[String: Any]] }
    }

    static func rows() -> [[String: Any]] {
        guard let dir = try? directory(), let urls = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return urls.filter { $0.pathExtension == "json" }.compactMap { url -> [String: Any]? in
            guard let data = try? Data(contentsOf: url),
                  let row = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let state = row["state"] as? [String: Any], valid(state) else { return nil }
            return row
        }.sorted { ($0["savedAt"] as? Double ?? 0) > ($1["savedAt"] as? Double ?? 0) }
    }

    static func save(_ state: [String: Any], reason: String) throws {
        guard valid(state) else { throw failure("Invalid state was rejected; native recovery data was preserved.") }
        let dir = try directory(), existing = rows(), now = Date().timeIntervalSince1970 * 1000
        if let previous = existing.first?["state"] as? [String: Any], count(previous) > 0, count(state) == 0,
           state["_ccAllowEmpty"] as? Bool != true {
            throw failure("An empty native backup was blocked; your previous data is safe.")
        }
        let current: [String: Any] = ["id": "native-current", "savedAt": now, "reason": "native recovery", "state": state]
        let data = try JSONSerialization.data(withJSONObject: current, options: [.sortedKeys])
        guard data.count <= 10 * 1024 * 1024 else { throw failure("Native recovery exceeds 10 MB. Export a backup.") }
        let history = existing.filter { ($0["id"] as? String) != "native-current" }
        let due = now - (history.first?["savedAt"] as? Double ?? 0) >= 30 * 60 * 1000
        if due || reason == "manual" || reason == "restored" {
            // Preserve the outgoing current record before a restore, never the newly blank state.
            var row = reason == "restored" ? (existing.first ?? current) : current
            let id = "native-" + UUID().uuidString
            row["id"] = id
            row["reason"] = reason == "restored" ? "native before restore" : "native snapshot"
            let snapshot = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
            try snapshot.write(to: dir.appendingPathComponent(id + ".json"), options: [.atomic, .completeUntilFirstUserAuthentication])
        }
        try data.write(to: dir.appendingPathComponent("current.json"), options: [.atomic, .completeUntilFirstUserAuthentication])
        for row in rows().filter({ ($0["id"] as? String) != "native-current" }).dropFirst(20) {
            if let id = row["id"] as? String, id.hasPrefix("native-"), !id.contains("/") {
                try? FileManager.default.removeItem(at: dir.appendingPathComponent(id + ".json"))
            }
        }
    }

    static func bootstrapJavaScript() -> String {
        // Inject just the current recovery record at startup; fetch history only on request.
        let candidates = Array(rows().prefix(1))
        guard let data = try? JSONSerialization.data(withJSONObject: candidates),
              let json = String(data: data, encoding: .utf8),
              let hostData = try? JSONSerialization.data(withJSONObject: AppConfig.commandCentreURL.host ?? "", options: .fragmentsAllowed),
              let host = String(data: hostData, encoding: .utf8) else { return "" }
        return "if(location.hostname===\(host)){window.CommandCentreNativeRecovery=\(json); }"
    }

    private static func failure(_ text: String) -> NSError {
        NSError(domain: "CommandCentreRecovery", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
    }
}
