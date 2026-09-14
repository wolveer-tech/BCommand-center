import ActivityKit
import Foundation

enum CommandCentreSharedStore {
    static let appGroup = "group.tech.wolveer.commandcentre.native"
    static let widgetSnapshotKey = "CommandCentreWidgetSnapshot.v1"
    static let followedMatchIDsKey = "CommandCentreFollowedMatchIDs.v1"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    static func loadSnapshot() -> CommandCentreWidgetSnapshot {
        guard let data = defaults.data(forKey: widgetSnapshotKey),
              let snapshot = try? JSONDecoder().decode(CommandCentreWidgetSnapshot.self, from: data) else {
            return .empty
        }
        return snapshot
    }

    static func saveSnapshot(_ snapshot: CommandCentreWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: widgetSnapshotKey)
    }
}

struct CommandCentreWeatherSnapshot: Codable, Hashable, Sendable {
    var city: String
    var temperature: Int
    var apparentTemperature: Int
    var condition: String
    var symbolName: String
    var high: Int?
    var low: Int?
    var precipitationChance: Int?
    var latitude: Double?
    var longitude: Double?
}

struct CommandCentreScheduleItem: Codable, Hashable, Sendable {
    var id: String
    var title: String
    var detail: String
    var date: Date
    var isAllDay: Bool
}

struct CommandCentreWidgetSnapshot: Codable, Hashable, Sendable {
    var updatedAt: Date
    var weather: CommandCentreWeatherSnapshot?
    var nextEvent: CommandCentreScheduleItem?
    var reminders: [CommandCentreScheduleItem]

    static let empty = CommandCentreWidgetSnapshot(
        updatedAt: .distantPast,
        weather: nil,
        nextEvent: nil,
        reminders: []
    )

    static let placeholder = CommandCentreWidgetSnapshot(
        updatedAt: .now,
        weather: CommandCentreWeatherSnapshot(
            city: "London",
            temperature: 19,
            apparentTemperature: 18,
            condition: "Partly cloudy",
            symbolName: "cloud.sun.fill",
            high: 22,
            low: 14,
            precipitationChance: 20,
            latitude: nil,
            longitude: nil
        ),
        nextEvent: CommandCentreScheduleItem(
            id: "preview-event",
            title: "Next event",
            detail: "Open Command Centre to sync",
            date: .now.addingTimeInterval(3_600),
            isAllDay: false
        ),
        reminders: [
            CommandCentreScheduleItem(
                id: "preview-reminder",
                title: "Your next reminder",
                detail: "Open Command Centre to sync",
                date: .now.addingTimeInterval(1_800),
                isAllDay: false
            )
        ]
    )
}

struct FootballMatchAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable, Sendable {
        var homeScore: Int?
        var awayScore: Int?
        var phase: String
        var minute: Int?
        var updatedAt: Date

        var isLive: Bool {
            ["IN_PLAY", "LIVE", "PAUSED", "EXTRA_TIME", "PENALTY_SHOOTOUT"].contains(phase)
        }

        var isFinished: Bool {
            ["FINISHED", "CANCELLED", "POSTPONED"].contains(phase)
        }
    }

    var matchID: Int64
    var competition: String
    var homeTeam: String
    var awayTeam: String
    var kickoff: Date
}

struct CommandCentreFootballMatch: Codable, Hashable, Sendable {
    var id: Int64
    var competition: String
    var homeTeam: String
    var awayTeam: String
    var kickoff: Date
    var homeScore: Int?
    var awayScore: Int?
    var status: String
    var minute: Int?

    var contentState: FootballMatchAttributes.ContentState {
        FootballMatchAttributes.ContentState(
            homeScore: homeScore,
            awayScore: awayScore,
            phase: status,
            minute: minute,
            updatedAt: .now
        )
    }
}
