import AVFoundation
import MediaPlayer
import WebKit

/// Owns Audius audio independently of the web view's foreground lifecycle.
@MainActor final class NativeMusicHandler: NSObject, WKScriptMessageHandler {
    static let shared = NativeMusicHandler()
    weak var webView: WKWebView?
    private var player: AVPlayer?
    private var track: [String: Any]?
    private var queue: [[String: Any]] = []
    private var history: [[String: Any]] = []
    private var tick: Any?
    private var ended: NSObjectProtocol?
    private var status: NSKeyValueObservation?
    private var playback: NSKeyValueObservation?

    private override init() {
        super.init()
        let commands = MPRemoteCommandCenter.shared()
        commands.playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.resume() }; return .success }
        commands.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.pause() }; return .success }
        commands.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.next() }; return .success }
        commands.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.previous() }; return .success }
        commands.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in self?.seek(event.positionTime) }; return .success
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        let expected = AppConfig.commandCentreURL
        let expectedPort = expected.port ?? (expected.scheme == "https" ? 443 : 80)
        guard message.frameInfo.isMainFrame,
              origin.host.lowercased() == expected.host?.lowercased(), origin.protocol == expected.scheme,
              (origin.port == 0 ? expectedPort : origin.port) == expectedPort,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "start":
            guard let value = body["track"] as? [String: Any], valid(value) else { return }
            queue = (body["queue"] as? [[String: Any]] ?? []).filter(validQueued).prefix(100).map { $0 }
            history = []; start(value)
        case "queue": queue = (body["queue"] as? [[String: Any]] ?? []).filter(validQueued).prefix(100).map { $0 }
        case "play": resume()
        case "pause": pause()
        case "seek": seek(body["seconds"] as? Double ?? 0)
        case "next": next()
        case "previous": previous()
        case "stop": stop(); track = nil; queue = []; MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        case "state": publish()
        default: break
        }
    }

    private func valid(_ value: [String: Any]) -> Bool {
        guard value["source"] as? String == "audius", let id = value["id"] as? String else { return false }
        return id.range(of: "^[a-zA-Z0-9_-]{1,80}$", options: .regularExpression) != nil
    }

    private func validQueued(_ value: [String: Any]) -> Bool {
        if valid(value) { return true }
        guard value["source"] as? String == "youtube", let id = value["id"] as? String else { return false }
        return id.range(of: "^[a-zA-Z0-9_-]{11}$", options: .regularExpression) != nil
    }

    private func stop() {
        player?.pause()
        if let tick { player?.removeTimeObserver(tick) }; tick = nil
        if let ended { NotificationCenter.default.removeObserver(ended) }; ended = nil
        status = nil; playback = nil; player = nil
    }

    private func start(_ value: [String: Any]) {
        guard valid(value), let id = value["id"] as? String else { return }
        stop(); track = value
        var components = URLComponents(url: AppConfig.commandCentreURL, resolvingAgainstBaseURL: false)!
        components.path = "/api/music/audius/stream"
        components.queryItems = [URLQueryItem(name: "id", value: id)]
        guard let url = components.url else { return }
        let item = AVPlayerItem(url: url), audio = AVPlayer(playerItem: item)
        player = audio
        tick = audio.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 600), queue: .main) { [weak self] _ in
            Task { @MainActor in self?.publish() }
        }
        ended = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.next() }
        }
        status = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            if item.status == .failed { Task { @MainActor in self?.publish(error: "This Audius track could not be played.") } }
        }
        playback = audio.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in Task { @MainActor in self?.publish() } }
        resume()
    }

    private func resume() {
        guard player != nil else { return }
        do { let session = AVAudioSession.sharedInstance(); try session.setCategory(.playback, mode: .default); try session.setActive(true) }
        catch { publish(error: "Could not activate audio playback."); return }
        player?.play(); publish()
    }
    private func pause() { player?.pause(); publish() }
    private func seek(_ seconds: Double) { guard seconds.isFinite else { return }; player?.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600)); publish() }
    private func next() {
        guard !queue.isEmpty else { pause(); return }
        // YouTube's official player needs the web view. Keep its place in the queue.
        guard valid(queue[0]) else { pause(); publish(error: "Open Music and tap Next to play the queued YouTube video."); return }
        if let track { history.append(track) }; start(queue.removeFirst())
    }
    private func previous() {
        if (player?.currentTime().seconds ?? 0) > 3 || history.isEmpty { seek(0); return }
        if let track { queue.insert(track, at: 0) }; start(history.removeLast())
    }

    func publish(error: String? = nil) {
        guard let track, let player else { return }
        let current = player.currentTime().seconds, duration = player.currentItem?.duration.seconds ?? 0
        let playing = player.timeControlStatus == .playing
        let elapsed = current.isFinite ? max(0, current) : 0, total = duration.isFinite ? max(0, duration) : 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: track["title"] as? String ?? "Audius",
            MPMediaItemPropertyArtist: track["artist"] as? String ?? "",
            MPMediaItemPropertyPlaybackDuration: total,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0
        ]
        var payload: [String: Any] = ["track": track, "queue": queue, "current": elapsed, "duration": total, "playing": playing]
        if let error { payload["error"] = error }
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('cc-native-music',{detail:\(json)}));")
    }
}
