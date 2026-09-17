import ActivityKit
import Foundation
import WebKit
import WidgetKit

@MainActor
final class NativeDashboardHandler: NSObject, WKScriptMessageHandler {
    static let shared = NativeDashboardHandler()

    weak var webView: WKWebView?
    private var receiptTask: Task<Void, Never>?

    private override init() {}

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == (AppConfig.commandCentreURL.host ?? ""),
              message.name == "nativeDashboard",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "sync":
            if let preferences = body["livePreferences"] as? [String: Any] { NativeLiveActivityPushManager.shared.configure(preferences) }
            if let rawSnapshot = body["snapshot"] as? [String: Any],
               let snapshot = widgetSnapshot(rawSnapshot) {
                do {
                    try CommandCentreSharedStore.saveSnapshot(snapshot)
                    WidgetCenter.shared.reloadAllTimelines()
                    publishStatus(message: "Widget data saved and verified. Waiting for iOS to reload the widget.")
                    receiptTask?.cancel()
                    receiptTask = Task {
                        for _ in 0..<10 {
                            try? await Task.sleep(for: .seconds(2))
                            guard !Task.isCancelled else { return }
                            if CommandCentreSharedStore.hasRead(snapshot.updatedAt) {
                                publishStatus(message: "Widget extension received the latest data. iOS controls when it appears on screen.")
                                return
                            }
                        }
                        publishStatus(message: "Data saved, but no widget receipt yet. Add a widget or check that its signed extension has the same App Group.")
                    }
                } catch {
                    publishStatus(message: error.localizedDescription, error: true)
                }
            }
            let followed = matchIDs(body["followedMatchIDs"])
            CommandCentreSharedStore.defaults.set(followed.map { String($0) }, forKey: CommandCentreSharedStore.followedMatchIDsKey)
            let matches = footballMatches(body["matches"])
            Task { await updateLiveActivities(matches: matches, followedMatchIDs: Set(followed), allowStarting: true) }
        case "matches":
            let followed = matchIDs(body["followedMatchIDs"])
            CommandCentreSharedStore.defaults.set(followed.map { String($0) }, forKey: CommandCentreSharedStore.followedMatchIDsKey)
            let matches = footballMatches(body["matches"])
            Task { await updateLiveActivities(matches: matches, followedMatchIDs: Set(followed), allowStarting: true) }
        case "status":
            publishStatus(message: CommandCentreSharedStore.container == nil ? "Widget App Group is unavailable in this signed IPA." : "Widget storage is available. Tap Sync now to verify delivery.", error: CommandCentreSharedStore.container == nil)
        default:
            break
        }
    }

    func performBackgroundRefresh() async -> Bool {
        async let weather = refreshWeatherFromNetwork()
        async let football = refreshLiveActivitiesFromNetwork()
        let refreshed = await (weather, football)
        if refreshed.0 { WidgetCenter.shared.reloadTimelines(ofKind: "CommandCentreWeatherWidget") }
        return refreshed.0 || refreshed.1
    }

    private func widgetSnapshot(_ payload: [String: Any]) -> CommandCentreWidgetSnapshot? {
        let weather: CommandCentreWeatherSnapshot?
        if let raw = payload["weather"] as? [String: Any],
           let temperature = integer(raw["temperature"]) {
            weather = CommandCentreWeatherSnapshot(
                city: clean(raw["city"], fallback: "Weather", max: 80),
                temperature: temperature,
                apparentTemperature: integer(raw["apparentTemperature"]) ?? temperature,
                condition: clean(raw["condition"], fallback: "Current conditions", max: 80),
                symbolName: clean(raw["symbolName"], fallback: "cloud.fill", max: 60),
                high: integer(raw["high"]),
                low: integer(raw["low"]),
                precipitationChance: integer(raw["precipitationChance"]),
                latitude: double(raw["latitude"]),
                longitude: double(raw["longitude"])
            )
        } else {
            weather = CommandCentreSharedStore.loadSnapshot().weather
        }

        let nextEvent = scheduleItem(payload["nextEvent"])
        let reminders = (payload["reminders"] as? [[String: Any]] ?? [])
            .compactMap(scheduleItem)
            .sorted { $0.date < $1.date }
            .prefix(12)

        return CommandCentreWidgetSnapshot(
            updatedAt: .now,
            weather: weather,
            nextEvent: nextEvent,
            reminders: Array(reminders)
        )
    }

    private func scheduleItem(_ value: Any?) -> CommandCentreScheduleItem? {
        guard let raw = value as? [String: Any],
              let timestamp = double(raw["timestamp"]),
              timestamp > 0 else { return nil }
        return CommandCentreScheduleItem(
            id: clean(raw["id"], fallback: UUID().uuidString, max: 120),
            title: clean(raw["title"], fallback: "Command Centre", max: 180),
            detail: clean(raw["detail"], fallback: "", max: 240),
            date: Date(timeIntervalSince1970: timestamp / 1_000),
            isAllDay: raw["isAllDay"] as? Bool ?? false
        )
    }

    private func footballMatches(_ value: Any?) -> [CommandCentreFootballMatch] {
        (value as? [[String: Any]] ?? []).compactMap { raw in
            guard let id = int64(raw["id"]), id != 0,
                  let timestamp = double(raw["kickoff"]), timestamp > 0 else { return nil }
            return CommandCentreFootballMatch(
                id: id,
                competition: clean(raw["competition"], fallback: "Football", max: 120),
                homeTeam: clean(raw["homeTeam"], fallback: "Home", max: 100),
                awayTeam: clean(raw["awayTeam"], fallback: "Away", max: 100),
                kickoff: Date(timeIntervalSince1970: timestamp / 1_000),
                homeScore: integer(raw["homeScore"]),
                awayScore: integer(raw["awayScore"]),
                status: clean(raw["status"], fallback: "SCHEDULED", max: 40).uppercased(),
                minute: integer(raw["minute"])
            )
        }
    }

    private func matchIDs(_ value: Any?) -> [Int64] {
        (value as? [Any] ?? []).compactMap(int64).filter { $0 != 0 }
    }

    private func updateLiveActivities(matches: [CommandCentreFootballMatch], followedMatchIDs: Set<Int64>, allowStarting: Bool) async {
        guard !followedMatchIDs.isEmpty || !Activity<FootballMatchAttributes>.activities.isEmpty else { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            publishStatus(message: "Allow Live Activities for Command Centre in iPhone Settings.", error: true)
            return
        }

        let existing = Dictionary(Activity<FootballMatchAttributes>.activities.map { ($0.attributes.matchID, $0) }, uniquingKeysWith: { current, _ in current })
        for activity in existing.values where !followedMatchIDs.contains(activity.attributes.matchID) {
            await activity.end(nil, dismissalPolicy: .immediate)
        }

        let ordered = matches
            .filter { followedMatchIDs.contains($0.id) }
            .sorted {
                if $0.contentState.isLive != $1.contentState.isLive { return $0.contentState.isLive }
                return $0.kickoff < $1.kickoff
            }

        var activeCount = Activity<FootballMatchAttributes>.activities.count
        for match in ordered {
            let content = ActivityContent(
                state: match.contentState,
                staleDate: match.contentState.isLive ? .now.addingTimeInterval(5 * 60) : match.kickoff.addingTimeInterval(15 * 60),
                relevanceScore: match.contentState.isLive ? 100 : 50
            )

            if let activity = existing[match.id] {
                if match.contentState.isFinished {
                    await activity.end(content, dismissalPolicy: .after(.now.addingTimeInterval(30 * 60)))
                    activeCount = max(0, activeCount - 1)
                } else {
                    await activity.update(content)
                }
                continue
            }

            guard allowStarting, !match.contentState.isFinished, activeCount < 3 else { continue }
            let secondsUntilKickoff = match.kickoff.timeIntervalSinceNow
            let attributes = FootballMatchAttributes(
                matchID: match.id,
                competition: match.competition,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                kickoff: match.kickoff
            )
            do {
                let pushType: PushType? = NativeLiveActivityPushManager.shared.serverConfigured ? .token : nil
                let scheduledStart = match.kickoff.addingTimeInterval(-5 * 60)
                if !match.contentState.isLive && secondsUntilKickoff > 90 * 60 && scheduledStart > .now {
                    let alert = AlertConfiguration(
                        title: "Football Live Activity",
                        body: "\(match.homeTeam) vs \(match.awayTeam) is about to start.",
                        sound: .default
                    )
                    let activity = try Activity.request(
                        attributes: attributes,
                        content: content,
                        pushType: pushType,
                        style: .standard,
                        alertConfiguration: alert,
                        start: scheduledStart
                    )
                    NativeLiveActivityPushManager.shared.observe(activity)
                } else {
                    guard match.contentState.isLive || secondsUntilKickoff >= -4 * 60 * 60 else { continue }
                    let activity = try Activity.request(attributes: attributes, content: content, pushType: pushType)
                    NativeLiveActivityPushManager.shared.observe(activity)
                }
                activeCount += 1
            } catch {
                // A signer without push entitlements can still provide foreground updates.
                let fallback: Activity<FootballMatchAttributes>?
                if !match.contentState.isLive && secondsUntilKickoff > 90 * 60 {
                    fallback = try? Activity.request(
                        attributes: attributes, content: content, pushType: nil, style: .standard,
                        alertConfiguration: AlertConfiguration(title: "Football Live Activity", body: "\(match.homeTeam) vs \(match.awayTeam) is about to start.", sound: .default),
                        start: match.kickoff.addingTimeInterval(-5 * 60)
                    )
                } else {
                    fallback = try? Activity.request(attributes: attributes, content: content, pushType: nil)
                }
                if let activity = fallback {
                    NativeLiveActivityPushManager.shared.observe(activity)
                    activeCount += 1
                    publishStatus(message: "Live Activity created, but closed-app updates need Push Notifications signing.", error: true)
                } else {
                    publishStatus(message: "A followed match could not start its Live Activity: \(error.localizedDescription)", error: true)
                }
                print("Could not start football Live Activity: \(error.localizedDescription)")
            }
        }
    }

    private func refreshWeatherFromNetwork() async -> Bool {
        var snapshot = CommandCentreSharedStore.loadSnapshot()
        guard let current = snapshot.weather,
              let latitude = current.latitude,
              let longitude = current.longitude,
              var components = URLComponents(string: "https://api.open-meteo.com/v1/forecast") else { return false }
        components.queryItems = [
            URLQueryItem(name: "latitude", value: String(latitude)),
            URLQueryItem(name: "longitude", value: String(longitude)),
            URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,weather_code"),
            URLQueryItem(name: "daily", value: "temperature_2m_max,temperature_2m_min,precipitation_probability_max"),
            URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "forecast_days", value: "1")
        ]
        guard let url = components.url else { return false }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let latest = payload["current"] as? [String: Any],
                  let temperature = double(latest["temperature_2m"]) else { return false }
            let daily = payload["daily"] as? [String: Any]
            let code = integer(latest["weather_code"]) ?? 0
            snapshot.weather = CommandCentreWeatherSnapshot(
                city: current.city,
                temperature: Int(temperature.rounded()),
                apparentTemperature: Int((double(latest["apparent_temperature"]) ?? temperature).rounded()),
                condition: weatherDescription(code),
                symbolName: weatherSymbol(code),
                high: firstInteger(daily?["temperature_2m_max"]),
                low: firstInteger(daily?["temperature_2m_min"]),
                precipitationChance: firstInteger(daily?["precipitation_probability_max"]),
                latitude: latitude,
                longitude: longitude
            )
            // Re-read after the network await so a new calendar/reminder sync isn't overwritten.
            var latestSnapshot = CommandCentreSharedStore.loadSnapshot()
            guard latestSnapshot.weather?.latitude == latitude, latestSnapshot.weather?.longitude == longitude else { return false }
            latestSnapshot.weather = snapshot.weather
            latestSnapshot.updatedAt = .now
            try CommandCentreSharedStore.saveSnapshot(latestSnapshot)
            return true
        } catch {
            print("Widget weather refresh failed: \(error.localizedDescription)")
            return false
        }
    }

    private func refreshLiveActivitiesFromNetwork() async -> Bool {
        let ids = Set((CommandCentreSharedStore.defaults.stringArray(forKey: CommandCentreSharedStore.followedMatchIDsKey) ?? []).compactMap { Int64($0) })
        let activeIDs = Activity<FootballMatchAttributes>.activities.map { $0.attributes.matchID }.filter { ids.contains($0) }
        guard !activeIDs.isEmpty else { return false }
        var matches: [CommandCentreFootballMatch] = []
        for id in activeIDs.prefix(3) {
            guard let url = URL(string: "api/football/match?matchId=\(id)&live=1", relativeTo: AppConfig.commandCentreURL)?.absoluteURL else { continue }
            do {
                var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                      let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let raw = payload["match"] as? [String: Any], let match = networkMatch(raw), match.id == id else { continue }
                matches.append(match)
            } catch { print("Live Activity refresh failed: \(error.localizedDescription)") }
        }
        // Preserve the earlier schedule path as a fallback for unavailable match details.
        let missing = Set(activeIDs).subtracting(matches.map { $0.id })
        if !missing.isEmpty, let url = URL(string: "api/football/schedule", relativeTo: AppConfig.commandCentreURL)?.absoluteURL {
            do {
                let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
                let (data, response) = try await URLSession.shared.data(for: request)
                if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                   let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let rows = payload["matches"] as? [[String: Any]] {
                    matches.append(contentsOf: rows.compactMap(networkMatch).filter { missing.contains($0.id) })
                }
            } catch { print("Live Activity schedule fallback failed: \(error.localizedDescription)") }
        }
        // Re-read follow state after network awaits; an unfollow must not be undone.
        let latestIDs = Set((CommandCentreSharedStore.defaults.stringArray(forKey: CommandCentreSharedStore.followedMatchIDsKey) ?? []).compactMap { Int64($0) })
        await updateLiveActivities(matches: matches, followedMatchIDs: latestIDs, allowStarting: false)
        return !matches.isEmpty
    }

    private func networkMatch(_ raw: [String: Any]) -> CommandCentreFootballMatch? {
        guard let id = int64(raw["id"]), let utc = raw["utcDate"] as? String else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var kickoff = formatter.date(from: utc)
        if kickoff == nil { formatter.formatOptions = [.withInternetDateTime]; kickoff = formatter.date(from: utc) }
        guard let kickoff else { return nil }
        let score = (raw["score"] as? [String: Any])?["fullTime"] as? [String: Any] ?? [:]
        let home = raw["homeTeam"] as? [String: Any] ?? [:], away = raw["awayTeam"] as? [String: Any] ?? [:]
        return CommandCentreFootballMatch(id: id,
            competition: clean((raw["competition"] as? [String: Any])?["name"], fallback: "Football", max: 120),
            homeTeam: clean(home["name"], fallback: "Home", max: 100), awayTeam: clean(away["name"], fallback: "Away", max: 100),
            kickoff: kickoff, homeScore: integer(score["home"]), awayScore: integer(score["away"]),
            status: clean(raw["status"], fallback: "SCHEDULED", max: 40), minute: integer(raw["minute"]))
    }

    private func firstInteger(_ value: Any?) -> Int? {
        guard let values = value as? [Any], let first = values.first else { return nil }
        return integer(first)
    }

    private func integer(_ value: Any?) -> Int? {
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? Int { return value }
        if let value = value as? String { return Int(value) }
        return nil
    }

    private func int64(_ value: Any?) -> Int64? {
        if let value = value as? NSNumber { return value.int64Value }
        if let value = value as? Int64 { return value }
        if let value = value as? Int { return Int64(value) }
        if let value = value as? String { return Int64(value) }
        return nil
    }

    private func double(_ value: Any?) -> Double? {
        if let value = value as? NSNumber { return value.doubleValue }
        if let value = value as? Double { return value }
        if let value = value as? String { return Double(value) }
        return nil
    }

    private func clean(_ value: Any?, fallback: String, max: Int) -> String {
        let text = (value as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? fallback : String(text.prefix(max))
    }

    private func weatherDescription(_ code: Int) -> String {
        switch code {
        case 0: return "Clear"
        case 1, 2: return "Partly cloudy"
        case 3: return "Overcast"
        case 45, 48: return "Fog"
        case 51, 53, 55, 56, 57: return "Drizzle"
        case 61, 63, 65, 66, 67, 80, 81, 82: return "Rain"
        case 71, 73, 75, 77, 85, 86: return "Snow"
        case 95, 96, 99: return "Thunderstorm"
        default: return "Current conditions"
        }
    }

    private func weatherSymbol(_ code: Int) -> String {
        switch code {
        case 0: return "sun.max.fill"
        case 1, 2: return "cloud.sun.fill"
        case 3: return "cloud.fill"
        case 45, 48: return "cloud.fog.fill"
        case 51, 53, 55, 56, 57: return "cloud.drizzle.fill"
        case 61, 63, 65, 66, 67, 80, 81, 82: return "cloud.rain.fill"
        case 71, 73, 75, 77, 85, 86: return "cloud.snow.fill"
        case 95, 96, 99: return "cloud.bolt.rain.fill"
        default: return "cloud.fill"
        }
    }

    private func publishStatus(message: String, error: Bool = false) {
        let payload: [String: Any] = [
            "available": true,
            "liveActivitiesEnabled": ActivityAuthorizationInfo().areActivitiesEnabled,
            "message": message,
            "error": error
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('cc-native-dashboard-status',{detail:\(json)}));")
    }
}

@MainActor
final class NativeDeepLinkRouter {
    static let shared = NativeDeepLinkRouter()

    private weak var webView: WKWebView?
    private var pendingURL: URL?

    private init() {}

    func attach(webView: WKWebView) {
        self.webView = webView
        flush()
    }

    func open(_ url: URL) {
        pendingURL = url
        flush()
    }

    func webViewDidFinishLoading() {
        flush()
    }

    private func flush() {
        guard let webView, !webView.isLoading, let url = pendingURL else { return }
        pendingURL = nil
        let destination = (url.host ?? url.pathComponents.dropFirst().first ?? "home").lowercased()
        let hash: String
        switch destination {
        case "weather": hash = "#weather"
        case "calendar", "reminders": hash = "#today"
        case "football": hash = "#football"
        default: hash = "#home"
        }
        let literal = Self.javaScriptLiteral(hash)
        var script = "if(location.hash===\(literal)){window.dispatchEvent(new HashChangeEvent('hashchange'));}else{location.hash=\(literal);}" 
        if destination == "football",
           let matchID = url.pathComponents.compactMap({ Int64($0) }).first {
            script += "setTimeout(()=>window.openFootballMatchCentre?.(\(matchID)),350);"
        }
        webView.evaluateJavaScript(script)
    }

    private static func javaScriptLiteral(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed),
              let encoded = String(data: data, encoding: .utf8) else { return "\"#home\"" }
        return encoded
    }
}
