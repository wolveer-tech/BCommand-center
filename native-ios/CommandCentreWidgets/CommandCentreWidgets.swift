import ActivityKit
import SwiftUI
import WidgetKit

private let commandCentreBlue = Color(red: 0.31, green: 0.48, blue: 0.98)
private let commandCentrePurple = Color(red: 0.48, green: 0.34, blue: 0.91)

struct CommandCentreWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: CommandCentreWidgetSnapshot
}

struct CommandCentreTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> CommandCentreWidgetEntry {
        CommandCentreWidgetEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (CommandCentreWidgetEntry) -> Void) {
        completion(CommandCentreWidgetEntry(date: .now, snapshot: CommandCentreSharedStore.loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CommandCentreWidgetEntry>) -> Void) {
        let snapshot = CommandCentreSharedStore.loadSnapshot()
        let entry = CommandCentreWidgetEntry(date: .now, snapshot: snapshot)
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
    }
}

private struct CommandCentreWidgetBackground: ViewModifier {
    func body(content: Content) -> some View {
        content.containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(red: 0.035, green: 0.065, blue: 0.13), Color(red: 0.11, green: 0.08, blue: 0.24)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

private extension View {
    func commandCentreWidgetBackground() -> some View {
        modifier(CommandCentreWidgetBackground())
    }
}

struct CommandCentreWeatherWidget: Widget {
    let kind = "CommandCentreWeatherWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CommandCentreTimelineProvider()) { entry in
            CommandCentreWeatherWidgetView(entry: entry)
                .widgetURL(URL(string: "commandcentre://weather"))
                .commandCentreWidgetBackground()
        }
        .configurationDisplayName("Command Centre Weather")
        .description("Current conditions and today's high and low.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private struct CommandCentreWeatherWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CommandCentreWidgetEntry

    var body: some View {
        let weather = entry.snapshot.weather
        switch family {
        case .accessoryCircular:
            VStack(spacing: 0) {
                Image(systemName: weather?.symbolName ?? "cloud.fill")
                Text(weather.map { "\($0.temperature)°" } ?? "—°")
                    .font(.headline)
            }
        case .accessoryInline:
            Label(weather.map { "\($0.city) \($0.temperature)° • \($0.condition)" } ?? "Open Command Centre for weather", systemImage: weather?.symbolName ?? "cloud.fill")
        case .accessoryRectangular:
            HStack(spacing: 9) {
                Image(systemName: weather?.symbolName ?? "cloud.fill")
                    .font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(weather?.city ?? "Weather").font(.caption.bold())
                    Text(weather.map { "\($0.temperature)° • \($0.condition)" } ?? "Open app to sync")
                        .font(.caption2)
                        .lineLimit(1)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Label(weather?.city ?? "Weather", systemImage: "location.fill")
                        .font(.caption.bold())
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: weather?.symbolName ?? "cloud.fill")
                        .font(.title3)
                        .symbolRenderingMode(.multicolor)
                }
                Text(weather.map { "\($0.temperature)°" } ?? "—°")
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.75)
                Text(weather?.condition ?? "Open Command Centre to sync")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if let high = weather?.high, let low = weather?.low {
                    Text("H:\(high)°  L:\(low)°")
                        .font(.caption2.weight(.semibold))
                }
            }
            .foregroundStyle(.white)
        }
    }
}

struct CommandCentreNextEventWidget: Widget {
    let kind = "CommandCentreNextEventWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CommandCentreTimelineProvider()) { entry in
            CommandCentreScheduleWidgetView(
                item: entry.snapshot.nextEvent,
                emptyTitle: "No upcoming events",
                eyebrow: "NEXT EVENT",
                symbol: "calendar.badge.clock"
            )
            .widgetURL(URL(string: "commandcentre://calendar"))
            .commandCentreWidgetBackground()
        }
        .configurationDisplayName("Next Event")
        .description("The next event saved in Command Centre.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct CommandCentreReminderWidget: Widget {
    let kind = "CommandCentreReminderWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CommandCentreTimelineProvider()) { entry in
            CommandCentreScheduleWidgetView(
                item: entry.snapshot.reminders.first,
                emptyTitle: "No upcoming reminders",
                eyebrow: "NEXT REMINDER",
                symbol: "checklist"
            )
            .widgetURL(URL(string: "commandcentre://reminders"))
            .commandCentreWidgetBackground()
        }
        .configurationDisplayName("Next Reminder")
        .description("Your next reminder on the Home or Lock Screen.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

private struct CommandCentreScheduleWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let item: CommandCentreScheduleItem?
    let emptyTitle: String
    let eyebrow: String
    let symbol: String

    private var dateText: String {
        guard let item else { return "Open Command Centre to add one" }
        if item.isAllDay { return item.date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) }
        return item.date.formatted(.dateTime.weekday(.abbreviated).hour().minute())
    }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(item.map { "\($0.title) • \(dateText)" } ?? emptyTitle, systemImage: symbol)
        case .accessoryRectangular:
            HStack(spacing: 9) {
                Image(systemName: symbol).font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item?.title ?? emptyTitle).font(.caption.bold()).lineLimit(1)
                    Text(dateText).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(eyebrow)
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(commandCentreBlue)
                    Spacer()
                    Image(systemName: symbol).foregroundStyle(commandCentrePurple)
                }
                Spacer(minLength: 0)
                Text(item?.title ?? emptyTitle)
                    .font(.headline)
                    .lineLimit(family == .systemMedium ? 2 : 3)
                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if let detail = item?.detail, !detail.isEmpty, family == .systemMedium {
                    Text(detail).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                }
            }
            .foregroundStyle(.white)
        }
    }
}

struct CommandCentreFootballLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FootballMatchAttributes.self) { context in
            FootballLockScreenActivityView(context: context)
                .activityBackgroundTint(Color(red: 0.035, green: 0.065, blue: 0.13))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(URL(string: "commandcentre://football/match/\(context.attributes.matchID)"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.homeTeam).font(.caption.bold()).lineLimit(1)
                        Text(context.attributes.awayTeam).font(.caption.bold()).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(score(context.state.homeScore)).font(.caption.bold())
                        Text(score(context.state.awayScore)).font(.caption.bold())
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(activityStatus(context))
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(context.state.isLive ? .green : commandCentreBlue)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.attributes.competition).lineLimit(1)
                        Spacer()
                        Text("Updated \(context.state.updatedAt, style: .relative)")
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "sportscourt.fill")
                    .foregroundStyle(context.state.isLive ? .green : commandCentreBlue)
            } compactTrailing: {
                Text(compactScore(context.state))
                    .font(.caption2.bold())
                    .monospacedDigit()
            } minimal: {
                Image(systemName: "soccerball")
                    .foregroundStyle(context.state.isLive ? .green : commandCentreBlue)
            }
            .widgetURL(URL(string: "commandcentre://football/match/\(context.attributes.matchID)"))
            .keylineTint(context.state.isLive ? .green : commandCentreBlue)
        }
    }

    private func score(_ value: Int?) -> String { value.map(String.init) ?? "–" }

    private func compactScore(_ state: FootballMatchAttributes.ContentState) -> String {
        if let home = state.homeScore, let away = state.awayScore { return "\(home)-\(away)" }
        return state.isLive ? "LIVE" : "⚽"
    }

    private func activityStatus(_ context: ActivityViewContext<FootballMatchAttributes>) -> String {
        if context.state.isFinished { return context.state.phase == "FINISHED" ? "FULL TIME" : context.state.phase.replacingOccurrences(of: "_", with: " ") }
        if context.state.isLive { return context.state.minute.map { "\($0)′" } ?? "LIVE" }
        return context.attributes.kickoff.formatted(date: .omitted, time: .shortened)
    }
}

private struct FootballLockScreenActivityView: View {
    let context: ActivityViewContext<FootballMatchAttributes>

    private var scoreText: String {
        if let home = context.state.homeScore, let away = context.state.awayScore { return "\(home)  –  \(away)" }
        return "vs"
    }

    private var statusText: String {
        if context.state.isFinished { return context.state.phase == "FINISHED" ? "Full time" : context.state.phase.replacingOccurrences(of: "_", with: " ").capitalized }
        if context.state.isLive { return context.state.minute.map { "LIVE • \($0)′" } ?? "LIVE" }
        return "Kick-off \(context.attributes.kickoff.formatted(date: .omitted, time: .shortened))"
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(context.attributes.competition.uppercased())
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(commandCentreBlue)
                    .lineLimit(1)
                Spacer()
                Text(statusText)
                    .font(.caption2.bold())
                    .foregroundStyle(context.state.isLive ? Color.green : Color.white.opacity(0.65))
            }
            HStack(alignment: .center, spacing: 12) {
                Text(context.attributes.homeTeam)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(2)
                Text(scoreText)
                    .font(.title2.bold())
                    .monospacedDigit()
                    .fixedSize()
                Text(context.attributes.awayTeam)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .lineLimit(2)
            }
            .font(.subheadline.bold())
        }
        .padding(15)
        .foregroundStyle(.white)
    }
}

@main
struct CommandCentreWidgetBundle: WidgetBundle {
    var body: some Widget {
        CommandCentreWeatherWidget()
        CommandCentreNextEventWidget()
        CommandCentreReminderWidget()
        CommandCentreFootballLiveActivityWidget()
    }
}
