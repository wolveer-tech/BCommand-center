import Foundation
import WebKit

@MainActor enum NativeStorageMaintenance {
    private static let lastCleanupKey = "cc.cache-cleaned-at"
    private static var clearing = false
    private static var completions: [() -> Void] = []
    // These are disposable HTTP/media caches. Never use allWebsiteDataTypes:
    // local storage, IndexedDB, cookies, offline shell and sign-in data are kept.
    private static let cacheTypes: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]

    static func schedule() {
        NativeStateVault.queue.async { NativeStateVault.compressLegacySnapshots() }
        let last = UserDefaults.standard.double(forKey: lastCleanupKey)
        guard Date().timeIntervalSince1970 - last > 7 * 24 * 60 * 60 else { return }
        clearCachedFiles()
    }

    static func clearCachedFiles(completion: @escaping () -> Void = {}) {
        completions.append(completion)
        guard !clearing else { return }
        clearing = true
        URLCache.shared.removeAllCachedResponses()
        WKWebsiteDataStore.default().removeData(ofTypes: cacheTypes, modifiedSince: .distantPast) {
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: lastCleanupKey)
            clearing = false
            let callbacks = completions
            completions.removeAll()
            callbacks.forEach { $0() }
        }
    }
}
