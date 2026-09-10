import Foundation
import UserNotifications
import WebKit

@MainActor
final class NativeNotificationHandler: NSObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    static let shared = NativeNotificationHandler()
    weak var webView: WKWebView?
    private let storedIdentifiersKey = "CommandCentreNativeNotificationIdentifiers"

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
