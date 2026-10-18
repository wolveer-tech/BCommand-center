import Foundation

// Independent of WKWebView's website storage; survives website-data eviction and app updates.
// App deletion still deletes this container. Use Export backup before changing installations.
enum NativeStateVault {
    // Keep compression and file reads in order and off the UI thread.
    static let queue = DispatchQueue(label: "tech.wolveer.commandcentre.recovery", qos: .utility)

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

    private static func recordURLs() -> [URL] {
        guard let dir = try? directory(), let urls = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return urls.filter { $0.pathExtension == "json" || $0.lastPathComponent.hasSuffix(".json.lzfse") }
    }

    private static func read(_ url: URL) -> [String: Any]? {
        guard let stored = try? Data(contentsOf: url) else { return nil }
        let data: Data
        if url.pathExtension == "lzfse" {
            guard let expanded = try? (stored as NSData).decompressed(using: .lzfse) else { return nil }
            data = expanded as Data
        } else { data = stored }
        guard let row = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let state = row["state"] as? [String: Any], valid(state) else { return nil }
        return row
    }

    static func rows() -> [[String: Any]] {
        let records = recordURLs().compactMap { read($0) }.sorted { ($0["savedAt"] as? Double ?? 0) > ($1["savedAt"] as? Double ?? 0) }
        var seen = Set<String>()
        return records.filter { seen.insert($0["id"] as? String ?? "").inserted }
    }

    static func latest() -> [[String: Any]] {
        guard let dir = try? directory() else { return [] }
        // Normal launches read a single record, never all twenty full snapshots.
        for name in ["current.json.lzfse", "current.json"] {
            if let row = read(dir.appendingPathComponent(name)) { return [row] }
        }
        // Only a missing/damaged current record needs the recovery history.
        return Array(rows().prefix(1))
    }

    private static func writeCompressed(_ data: Data, to legacyURL: URL) throws {
        let compressed = try (data as NSData).compressed(using: .lzfse) as Data
        let destination = legacyURL.appendingPathExtension("lzfse")
        try compressed.write(to: destination, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        // Remove the old JSON only after the on-disk replacement round-trips.
        let stored = try Data(contentsOf: destination)
        guard try (stored as NSData).decompressed(using: .lzfse) as Data == data else {
            throw failure("Could not verify the compressed backup; the previous backup was kept.")
        }
        if FileManager.default.fileExists(atPath: legacyURL.path) { try? FileManager.default.removeItem(at: legacyURL) }
    }

    static func compressLegacySnapshots() {
        for url in recordURLs() where url.pathExtension == "json" {
            // Migrate one file at a time; retain every snapshot and its timestamp.
            guard read(url) != nil, let data = try? Data(contentsOf: url) else { continue }
            let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
            do {
                try writeCompressed(data, to: url)
                if let date = attributes?[.modificationDate] {
                    try? FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: url.appendingPathExtension("lzfse").path)
                }
            } catch { continue }
        }
    }

    static func save(_ state: [String: Any], reason: String) throws {
        guard valid(state) else { throw failure("Invalid state was rejected; native recovery data was preserved.") }
        let dir = try directory(), existing = latest(), now = Date().timeIntervalSince1970 * 1000
        if let previous = existing.first?["state"] as? [String: Any], count(previous) > 0, count(state) == 0,
           state["_ccAllowEmpty"] as? Bool != true {
            throw failure("An empty native backup was blocked; your previous data is safe.")
        }
        let current: [String: Any] = ["id": "native-current", "savedAt": now, "reason": "native recovery", "state": state]
        let data = try JSONSerialization.data(withJSONObject: current, options: [.sortedKeys])
        guard data.count <= 64 * 1024 * 1024 else { throw failure("Native recovery exceeds 64 MB. Export a backup.") }
        let history = recordURLs().filter { !$0.lastPathComponent.hasPrefix("current.") }.sorted {
            ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) >
            ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        }
        let lastSnapshot = history.first.flatMap { try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate } ?? .distantPast
        let due = Date().timeIntervalSince(lastSnapshot) >= 30 * 60
        let saveSnapshot = due || reason == "manual" || reason == "restored" || reason.hasPrefix("before ")
        if saveSnapshot {
            // Preserve the outgoing current record before a restore, never the newly blank state.
            var row = reason == "restored" ? (existing.first ?? current) : current
            let id = "native-" + UUID().uuidString
            row["id"] = id
            row["reason"] = reason == "restored" ? "native before restore" : "native snapshot"
            let snapshot = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
            try writeCompressed(snapshot, to: dir.appendingPathComponent(id + ".json"))
        }
        try writeCompressed(data, to: dir.appendingPathComponent("current.json"))
        // Keep the previous retention policy without expanding every saved state.
        for url in history.dropFirst(saveSnapshot ? 19 : 20) where url.lastPathComponent.hasPrefix("native-") {
            try? FileManager.default.removeItem(at: url)
        }
    }

    static func bootstrapJavaScript() -> String {
        // Recovery is requested asynchronously by state-safety.js before app init.
        // Embedding photo-heavy JSON here blocked WebKit's first paint and splash.
        return "window.CommandCentreNativeRecovery=[];"
    }

    private static func failure(_ text: String) -> NSError {
        NSError(domain: "CommandCentreRecovery", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
    }
}
