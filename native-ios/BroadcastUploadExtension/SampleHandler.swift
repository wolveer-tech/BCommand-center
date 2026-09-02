import Foundation
import ReplayKit
import CoreMedia
import ImageIO
@preconcurrency import WebRTC

final class SampleHandler: RPBroadcastSampleHandler {
    private var sender: WebRTCScreenSender?
    private var signalling: SignallingClient?
    private var started = false

    override func broadcastStarted(
        withSetupInfo setupInfo: [String : NSObject]?
    ) {
        Task { [weak self] in
            guard let self else { return }

            do {
                let bootstrap = SignallingClient(
                    baseURL: AppConfig.commandCentreURL
                )
                let code = try await bootstrap.fetchNativeRoom(
                    channel: AppConfig.nativeMirrorChannel
                )

                let signalling = SignallingClient(
                    baseURL: AppConfig.commandCentreURL,
                    code: code
                )
                let sender = WebRTCScreenSender(
                    signalling: signalling
                )

                self.signalling = signalling
                self.sender = sender

                try await sender.start()
                self.started = true
            } catch {
                self.finishBroadcastWithError(
                    NSError(
                        domain: "CommandCentreMirror",
                        code: 2,
                        userInfo: [
                            NSLocalizedDescriptionKey:
                                "No active Command Centre mirror room was found. Open Command Centre → Mirror → Start iPhone screen mirror first, then start the broadcast again. (\(error.localizedDescription))"
                        ]
                    )
                )
            }
        }
    }

    override func broadcastFinished() {
        let sender = self.sender
        let signalling = self.signalling

        self.sender = nil
        self.signalling = nil
        self.started = false

        Task {
            await sender?.stop()
            await signalling?.clearNativeRoom(
                channel: AppConfig.nativeMirrorChannel
            )
        }
    }

    override func broadcastPaused() {}
    override func broadcastResumed() {}

    override func processSampleBuffer(
        _ sampleBuffer: CMSampleBuffer,
        with sampleBufferType: RPSampleBufferType
    ) {
        guard started else { return }

        switch sampleBufferType {
        case .video:
            sender?.push(
                sampleBuffer: sampleBuffer,
                rotation: videoRotation(for: sampleBuffer)
            )

        case .audioApp, .audioMic:
            // Video-only in this first Signulous-friendly build.
            break

        @unknown default:
            break
        }
    }

    private func videoRotation(
        for sampleBuffer: CMSampleBuffer
    ) -> RTCVideoRotation {
        guard let rawAttachment = CMGetAttachment(
            sampleBuffer,
            key: RPVideoSampleOrientationKey as CFString,
            attachmentModeOut: nil
        ) else {
            return ._0
        }

        guard let number = rawAttachment as? NSNumber,
              let orientation = CGImagePropertyOrientation(
                rawValue: number.uint32Value
              ) else {
            return ._0
        }

        switch orientation {
        case .right:
            return ._90
        case .down:
            return ._180
        case .left:
            return ._270
        default:
            return ._0
        }
    }
}
