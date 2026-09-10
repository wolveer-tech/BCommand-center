import BackgroundTasks
import Foundation

@MainActor
final class BackgroundRefreshManager {
    static let shared = BackgroundRefreshManager()
    static let identifier = "tech.wolveer.commandcentre.native.refresh"

    private init() {}

    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.identifier, using: nil) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }

            Task { @MainActor in
                self.scheduleNext()
                var expired = false
                refreshTask.expirationHandler = { expired = true }
                let refreshed = await NativeNotificationHandler.shared.performBackgroundRefresh()
                refreshTask.setTaskCompleted(success: refreshed && !expired)
            }
        }
        scheduleNext()
    }

    func scheduleNext() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.identifier)
        let request = BGAppRefreshTaskRequest(identifier: Self.identifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("Background fixture refresh could not be scheduled: \(error.localizedDescription)")
        }
    }
}
