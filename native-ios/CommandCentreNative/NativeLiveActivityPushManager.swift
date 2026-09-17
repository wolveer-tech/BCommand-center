import ActivityKit
import Foundation
import WebKit

@MainActor
final class NativeLiveActivityPushManager {
    static let shared = NativeLiveActivityPushManager()
    weak var webView: WKWebView?
    // Local activities remain the default until the server confirms APNs setup.
    private(set) var serverConfigured = false
    private var started = false
    private var observers: [String: Task<Void, Never>] = [:]
    private var preferences: [String: Any] = [:]
    private var lastSync = Date.distantPast
    private var syncing = false
    private var lastPreferences: Data?
    private let preferencesKey = "CommandCentreLivePushPreferences.v1"
    private let startKey = "CommandCentreLivePushStartToken.v1"

    func start() {
        guard !started else { return }
        started = true
        if let data = UserDefaults.standard.data(forKey: preferencesKey),
           let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { preferences = value }
        for activity in Activity<FootballMatchAttributes>.activities { observe(activity) }
        Task {
            for await activity in Activity<FootballMatchAttributes>.activityUpdates { observe(activity) }
        }
        Task {
            for await data in Activity<FootballMatchAttributes>.pushToStartTokenUpdates {
                let token = data.map { String(format: "%02x", $0) }.joined()
                UserDefaults.standard.set(token, forKey: startKey)
                await sync(force: true)
            }
        }
        Task { await sync(force: true) }
    }

    func configure(_ value: [String: Any]) {
        preferences = value
        if let data = try? JSONSerialization.data(withJSONObject: value, options: .sortedKeys) {
            UserDefaults.standard.set(data, forKey: preferencesKey)
        }
        start()
        Task { await sync(force: false) }
    }

    func observe(_ activity: Activity<FootballMatchAttributes>) {
        guard observers[activity.id] == nil else { return }
        // Reserve immediately so the server won't start a duplicate of a local activity.
        Task { await register(activity, token: activity.pushToken) }
        observers[activity.id] = Task {
            for await data in activity.pushTokenUpdates { await register(activity, token: data) }
        }
        Task {
            for await state in activity.activityStateUpdates {
                if state == .ended || state == .dismissed {
                    _ = try? await request("end", body: ["matchId": activity.attributes.matchID, "activityId": activity.id])
                    observers.removeValue(forKey: activity.id)?.cancel()
                    break
                }
            }
        }
    }

    @discardableResult
    private func register(_ activity: Activity<FootballMatchAttributes>, token: Data?) async -> Bool {
        let hex = token?.map { String(format: "%02x", $0) }.joined() ?? ""
        do {
            _ = try await request("register", body: ["matchId": activity.attributes.matchID, "activityId": activity.id, "token": hex, "pending": hex.isEmpty])
            return true
        } catch { report(error.localizedDescription); return false }
    }

    func sync(force: Bool) async {
        guard !syncing else { return }
        let encoded = try? JSONSerialization.data(withJSONObject: preferences, options: .sortedKeys)
        guard force || encoded != lastPreferences || Date().timeIntervalSince(lastSync) > 60 else { return }
        guard NativeCredentialHandler.shared.bearerToken() != nil else {
            serverConfigured = false
            report("Pair this IPA in Messages or Transfers to enable server Live Activity updates.")
            return
        }
        syncing = true
        defer { syncing = false }
        do {
            let result = try await request("status", body: nil)
            serverConfigured = result["configured"] as? Bool == true
            // Don't overwrite saved team preferences before the webpage has provided them.
            if !preferences.isEmpty { _ = try await request("preferences", body: preferences) }
            if let token = UserDefaults.standard.string(forKey: startKey) {
                _ = try await request("start-token", body: ["token": token])
            }
            var registrationSucceeded = true
            var waitingForUpdateToken = false
            for activity in Activity<FootballMatchAttributes>.activities {
                observe(activity)
                if !(await register(activity, token: activity.pushToken)) { registrationSucceeded = false }
                if activity.pushToken == nil { waitingForUpdateToken = true }
            }
            guard registrationSucceeded else { return }
            if !serverConfigured {
                report("Local Live Activities enabled. Guaranteed periodic closed-app refresh is unavailable; server push needs APNS_CONFIG for this signing team.")
            } else if let error = result["error"] as? String, !error.isEmpty {
                report(error)
            } else if waitingForUpdateToken {
                report("An existing Live Activity is local or awaiting its push token. It keeps local updates; new activities can use server push when signing permits.")
            } else if result["startReady"] as? Bool != true {
                report("Push server configured; waiting for Apple to issue the Live Activity token. Check Push Notifications signing.")
            } else {
                report("Server Live Activity updates enabled. Scores are checked about once a minute while the app is closed.")
            }
            lastPreferences = encoded
            lastSync = .now
        } catch {
            serverConfigured = false
            report("Local Live Activities remain available. Push connection: \(error.localizedDescription)")
        }
    }

    private func request(_ path: String, body: [String: Any]?) async throws -> [String: Any] {
        guard let token = NativeCredentialHandler.shared.bearerToken(),
              let url = URL(string: "api/live-activities/\(path)", relativeTo: AppConfig.commandCentreURL)?.absoluteURL else {
            throw NSError(domain: "LivePush", code: 1, userInfo: [NSLocalizedDescriptionKey: "Pair the IPA first to connect Live Activity updates."])
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        let result = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NSError(domain: "LivePush", code: 2, userInfo: [NSLocalizedDescriptionKey: result["error"] as? String ?? "Could not reach the Live Activity server. Deploy the web update and retry."])
        }
        return result
    }

    private func report(_ message: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: message, options: .fragmentsAllowed),
              let literal = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('cc-native-live-push-status',{detail:\(literal)}));")
    }
}
