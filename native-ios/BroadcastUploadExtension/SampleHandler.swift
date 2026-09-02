import ReplayKit
import CoreMedia
import ImageIO
import WebRTC

final class SampleHandler: RPBroadcastSampleHandler {
    private var sender: WebRTCScreenSender?
    private var signalling: SignallingClient?
    private var started = false

    override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
        guard let shared = UserDefaults(suiteName: AppConfig.appGroup),
              let code = shared.string(forKey: "mirrorRoomCode"),
              let baseString = shared.string(forKey: "mirrorBaseURL"),
              let baseURL = URL(string: baseString) else {
            finishBroadcastWithError(NSError(
                domain: "CommandCentreMirror",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Open Command Centre → Mirror and create a mirror code before starting the broadcast."]
            ))
            return
        }

        let signalling = SignallingClient(baseURL: baseURL, code: code)
        let sender = WebRTCScreenSender(signalling: signalling)
        self.signalling = signalling
        self.sender = sender

        Task { [weak self] in
            do {
                try await sender.start()
                self?.started = true
            } catch {
                self?.finishBroadcastWithError(error)
            }
        }
    }

    override func broadcastFinished() {
        let sender = self.sender
        self.sender = nil
        self.signalling = nil
        started = false
        Task { await sender?.stop() }
    }

    override func broadcastPaused() {}
    override func broadcastResumed() {}

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        guard started else { return }

        switch sampleBufferType {
        case .video:
            sender?.push(sampleBuffer: sampleBuffer, rotation: rotation(for: sampleBuffer))
        case .audioApp:
            break
        case .audioMic:
            break
        @unknown default:
            break
        }
    }

    private func rotation(for sampleBuffer: CMSampleBuffer) -> RTCVideoRotation {
        guard let value = CMGetAttachment(
            sampleBuffer,
            key: RPVideoSampleOrientationKey as CFString,
            attachmentModeOut: nil
        ) as? NSNumber,
        let orientation = CGImagePropertyOrientation(rawValue: value.uint32Value) else {
            return ._0
        }

        switch orientation {
        case .right: return ._90
        case .down: return ._180
        case .left: return ._270
        default: return ._0
        }
    }
}
