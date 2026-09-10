import Foundation
import UserNotifications
import WebKit

@MainActor
final class NativeNotificationHandler: NSObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    static let shared = NativeNotificationHandler()
    weak var webView: WKWebView?
    private let storedIdentifiersKey = "CommandCentreNativeNotificationIdentifiers"
    private let storedScheduleKey = "CommandCentreNativeNotificationSchedule"
    private let nativeInboxTokenKey = "CommandCentreNativeInboxToken"
    private let lastInboxMessageKey = "CommandCentreNativeLastInboxMessage"
    private let lastTransferReadyKey = "CommandCentreNativeLastTransferReady"

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == (AppConfig.commandCentreURL.host ?? ""),
              message.name == "nativeNotifications",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "requestPermission":
            let items = body["items"] as? [[String: Any]] ?? []
            Task { await requestPermissionAndSchedule(items) }
        case "schedule":
            let items = body["items"] as? [[String: Any]] ?? []
            Task { await scheduleIfAuthorised(items) }
        case "test":
            Task {
                await sendTest(
                    title: body["title"] as? String ?? "Command Centre",
                    body: body["body"] as? String ?? "Native notifications are working.",
                    url: body["url"] as? String ?? "#today"
                )
            }
        case "registerInboxAlerts":
            let token = body["token"] as? String ?? ""
            Task { await registerInboxAlerts(token: token) }
        default:
            break
        }
    }

    private func requestPermissionAndSchedule(_ items: [[String: Any]]) async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            if granted {
                await replaceSchedule(items)
                notifyWeb(permission: "granted", message: "Native iPhone notifications are enabled.")
            } else {
                notifyWeb(permission: "denied", message: "Notifications were not allowed. You can enable them in iPhone Settings.")
            }
        } catch {
            notifyWeb(permission: "denied", message: "Could not enable native notifications: \(error.localizedDescription)")
        }
    }

    private func scheduleIfAuthorised(_ items: [[String: Any]]) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            await replaceSchedule(items)
            notifyWeb(permission: "granted", message: nil)
        case .denied:
            notifyWeb(permission: "denied", message: nil)
        default:
            notifyWeb(permission: "default", message: nil)
        }
    }

    private func replaceSchedule(_ items: [[String: Any]]) async {
        if JSONSerialization.isValidJSONObject(items),
           let data = try? JSONSerialization.data(withJSONObject: items) {
            UserDefaults.standard.set(data, forKey: storedScheduleKey)
        }
        let center = UNUserNotificationCenter.current()
        let oldIdentifiers = UserDefaults.standard.stringArray(forKey: storedIdentifiersKey) ?? []
        if !oldIdentifiers.isEmpty { center.removePendingNotificationRequests(withIdentifiers: oldIdentifiers) }

        let formatter = ISO8601DateFormatter()
        let calendar = Calendar.current
        var identifiers: [String] = []

        for item in items.prefix(60) {
            guard let rawID = item["id"] as? String, !rawID.isEmpty else { continue }
            let identifier = "cc-native-\(rawID)"
            let content = UNMutableNotificationContent()
            content.title = item["title"] as? String ?? "Command Centre"
            content.body = item["body"] as? String ?? "You have an update."
            content.sound = .default
            if let url = item["url"] as? String { content.userInfo["url"] = url }

            let trigger: UNNotificationTrigger?
            if item["repeatingDaily"] as? Bool == true {
                var components = DateComponents()
                components.hour = item["hour"] as? Int ?? 7
                components.minute = item["minute"] as? Int ?? 30
                trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            } else if let dueAt = item["dueAt"] as? String,
                      let date = formatter.date(from: dueAt), date.timeIntervalSinceNow > 0 {
                let components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
                trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            } else {
                continue
            }

            do {
                try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
                identifiers.append(identifier)
            } catch {
                print("Could not schedule \(identifier): \(error.localizedDescription)")
            }
        }
        UserDefaults.standard.set(identifiers, forKey: storedIdentifiersKey)
    }

    func refreshSavedScheduleFromNetwork() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional || settings.authorizationStatus == .ephemeral,
              let data = UserDefaults.standard.data(forKey: storedScheduleKey),
              let stored = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              !stored.isEmpty else { return false }

        do {
            let url = AppConfig.commandCentreURL.appendingPathComponent("api/football/schedule")
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (responseData, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let payload = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
                  let matches = payload["matches"] as? [[String: Any]] else { return false }

            let refreshed = stored.map { original -> [String: Any] in
                guard original["kind"] as? String == "football",
                      let matchID = number(original["matchId"]),
                      let match = matches.first(where: { number($0["id"]) == matchID }),
                      let rawKickoff = match["utcDate"] as? String,
                      let kickoff = isoDate(rawKickoff) else { return original }

                var item = original
                let offsetMinutes = number(original["offsetMinutes"]) ?? 0
                item["dueAt"] = ISO8601DateFormatter().string(from: kickoff.addingTimeInterval(-Double(offsetMinutes) * 60))
                if let home = teamName(match["homeTeam"]), let away = teamName(match["awayTeam"]) {
                    let fixture = "\(home) vs \(away)"
                    item["body"] = offsetMinutes >= 1_440 ? "\(fixture) starts tomorrow." : offsetMinutes >= 60 ? "\(fixture) starts in one hour." : "\(fixture) is kicking off now."
                }
                return item
            }

            await replaceSchedule(refreshed)
            return true
        } catch {
            print("Background fixture schedule refresh failed: \(error.localizedDescription)")
            return false
        }
    }

    func performBackgroundRefresh() async -> Bool {
        let scheduleRefreshed = await refreshSavedScheduleFromNetwork()
        let inboxRefreshed = await refreshNativeInboxAlerts()
        return scheduleRefreshed || inboxRefreshed
    }

    private func registerInboxAlerts(token: String) async {
        guard !token.isEmpty else {
            notifyWeb(permission: "default", message: "Connect this device in Transfers or Messages before enabling its alerts.")
            return
        }
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            guard granted else {
                notifyWeb(permission: "denied", message: "Notifications were not allowed. You can enable them in iPhone Settings.")
                return
            }
            UserDefaults.standard.set(token, forKey: nativeInboxTokenKey)
            _ = await refreshNativeInboxAlerts(primeOnly: true)
            BackgroundRefreshManager.shared.scheduleNext()
            notifyWeb(permission: "granted", message: "Native Messages and Transfers alerts are registered. iOS runs closed-app checks opportunistically.")
        } catch {
            notifyWeb(permission: "default", message: "Could not enable inbox alerts: \(error.localizedDescription)")
        }
    }

    private func refreshNativeInboxAlerts(primeOnly: Bool = false) async -> Bool {
        guard let token = UserDefaults.standard.string(forKey: nativeInboxTokenKey), !token.isEmpty else { return false }
        do {
            let messages = try await authenticatedJSON(path: "api/messages/chats", token: token)
            let chats = messages["chats"] as? [[String: Any]] ?? []
            let unreadChats = chats.filter { (number($0["unread"]) ?? 0) > 0 }
            let latestMessage = unreadChats.compactMap { number($0["last_id"]) }.max() ?? 0
            let previousMessage = UserDefaults.standard.integer(forKey: lastInboxMessageKey)
            if !primeOnly && latestMessage > previousMessage {
                let unreadCount = unreadChats.reduce(0) { $0 + (number($1["unread"]) ?? 0) }
                await scheduleInboxNotification(identifier: "messages-\(latestMessage)", title: "New Command Centre message", body: unreadCount == 1 ? "You have one unread message." : "You have \(unreadCount) unread messages.", url: "#messages")
            }
            UserDefaults.standard.set(max(previousMessage, latestMessage), forKey: lastInboxMessageKey)

            let transfers = try await authenticatedJSON(path: "api/transfers/items?view=inbox", token: token)
            let items = (transfers["items"] as? [[String: Any]] ?? []).filter { $0["read_at"] == nil || $0["read_at"] is NSNull }
            let latestTransfer = items.compactMap { number($0["ready_at"]) }.max() ?? 0
            let previousTransfer = UserDefaults.standard.integer(forKey: lastTransferReadyKey)
            if !primeOnly && latestTransfer > previousTransfer {
                await scheduleInboxNotification(identifier: "transfers-\(latestTransfer)", title: "New Command Centre transfer", body: items.count == 1 ? "A transfer is ready on this iPhone." : "\(items.count) unread transfers are ready on this iPhone.", url: "#transfers")
            }
            UserDefaults.standard.set(max(previousTransfer, latestTransfer), forKey: lastTransferReadyKey)
            return true
        } catch {
            print("Background Messages/Transfers refresh failed: \(error.localizedDescription)")
            return false
        }
    }

    private func authenticatedJSON(path: String, token: String) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: AppConfig.commandCentreURL)?.absoluteURL else { throw URLError(.badURL) }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.userAuthenticationRequired) }
        guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw URLError(.cannotParseResponse) }
        return payload
    }

    private func scheduleInboxNotification(identifier: String, title: String, body: String, url: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo["url"] = url
        do {
            try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "cc-native-\(identifier)", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)))
        } catch {
            print("Could not schedule inbox notification: \(error.localizedDescription)")
        }
    }

    private func number(_ value: Any?) -> Int? {
        if let number = value as? NSNumber { return number.intValue }
        if let number = value as? Int { return number }
        if let text = value as? String { return Int(text) }
        return nil
    }

    private func isoDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func teamName(_ value: Any?) -> String? {
        guard let team = value as? [String: Any] else { return nil }
        return (team["shortName"] as? String) ?? (team["name"] as? String) ?? (team["tla"] as? String)
    }

    private func sendTest(title: String, body: String, url: String) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional || settings.authorizationStatus == .ephemeral else {
            notifyWeb(permission: settings.authorizationStatus == .denied ? "denied" : "default", message: "Enable native notifications first.")
            return
        }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo["url"] = url
        do {
            try await UNUserNotificationCenter.current().add(
                UNNotificationRequest(identifier: "cc-native-test-\(UUID().uuidString)", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false))
            )
            notifyWeb(permission: "granted", message: "Test notification scheduled.")
        } catch {
            notifyWeb(permission: "granted", message: "Could not send the test: \(error.localizedDescription)")
        }
    }

    private func notifyWeb(permission: String, message: String?) {
        var payload: [String: Any] = ["permission": permission]
        if let message { payload["message"] = message }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('cc-native-notification-status',{detail:\(json)}));")
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let url = response.notification.request.content.userInfo["url"] as? String
        Task { @MainActor in
            if let url, let data = try? JSONSerialization.data(withJSONObject: url), let literal = String(data: data, encoding: .utf8) {
                webView?.evaluateJavaScript("location.hash=\(literal);")
            }
            completionHandler()
        }
    }
}
