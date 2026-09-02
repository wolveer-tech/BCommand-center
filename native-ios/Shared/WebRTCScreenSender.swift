import Foundation
import CoreMedia
@preconcurrency import WebRTC

final class WebRTCScreenSender: NSObject, RTCPeerConnectionDelegate {
    private let factory: RTCPeerConnectionFactory
    private let videoSource: RTCVideoSource
    private let capturer: RTCVideoCapturer
    private let signalling: SignallingClient

    private var peer: RTCPeerConnection?
    private var pollTask: Task<Void, Never>?

    var onState: ((String) -> Void)?

    init(signalling: SignallingClient) {
        RTCInitializeSSL()

        let encoder = RTCDefaultVideoEncoderFactory()
        let decoder = RTCDefaultVideoDecoderFactory()
        let factory = RTCPeerConnectionFactory(
            encoderFactory: encoder,
            decoderFactory: decoder
        )
        let videoSource = factory.videoSource()
        let capturer = RTCVideoCapturer(delegate: videoSource)

        self.factory = factory
        self.videoSource = videoSource
        self.capturer = capturer
        self.signalling = signalling

        super.init()
    }

    func start() async throws {
        let config = RTCConfiguration()
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually
        config.iceServers = [RTCIceServer(urlStrings: AppConfig.stunServers)]

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": kRTCMediaConstraintsValueTrue]
        )

        guard let peer = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: nil
        ) else {
            throw NSError(
                domain: "CommandCentreWebRTC",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Could not create the WebRTC peer connection."]
            )
        }

        self.peer = peer
        peer.delegate = self

        let track = factory.videoTrack(
            with: videoSource,
            trackId: "command-centre-screen"
        )
        peer.add(track, streamIds: ["command-centre"])

        let offer = try await makeOffer(peer: peer, constraints: constraints)
        try await setLocal(peer: peer, sdp: offer)

        try await signalling.send(
            type: "offer",
            payload: [
                "type": "offer",
                "sdp": offer.sdp
            ]
        )

        startPolling()
        onState?("Offer sent — waiting for laptop")
    }

    func push(
        sampleBuffer: CMSampleBuffer,
        rotation: RTCVideoRotation = ._0
    ) {
        guard CMSampleBufferIsValid(sampleBuffer),
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }

        let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let seconds = CMTimeGetSeconds(pts)
        let timestampNs: Int64

        if seconds.isFinite && seconds > 0 {
            timestampNs = Int64(seconds * 1_000_000_000)
        } else {
            timestampNs = Int64(ProcessInfo.processInfo.systemUptime * 1_000_000_000)
        }

        let frame = RTCVideoFrame(
            buffer: rtcBuffer,
            rotation: rotation,
            timeStampNs: timestampNs
        )
        videoSource.capturer(capturer, didCapture: frame)
    }

    func stop() async {
        pollTask?.cancel()
        pollTask = nil

        peer?.close()
        peer = nil

        try? await signalling.send(type: "bye", payload: [:])
        onState?("Stopped")
    }

    private func startPolling() {
        pollTask?.cancel()

        pollTask = Task { [weak self] in
            guard let self = self else { return }

            while !Task.isCancelled {
                do {
                    let signals = try await self.signalling.poll()
                    for signal in signals {
                        try await self.handle(signal)
                    }
                } catch {
                    self.onState?("Signalling: \(error.localizedDescription)")
                }

                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }
    }

    private func handle(_ signal: MirrorSignal) async throws {
        guard let peer = peer else { return }

        switch signal.type {
        case "answer":
            guard let object = signal.data.object,
                  let sdp = object["sdp"]?.string else {
                return
            }

            let answer = RTCSessionDescription(type: .answer, sdp: sdp)
            try await setRemote(peer: peer, sdp: answer)
            onState?("Laptop connected")

        case "ice":
            guard let object = signal.data.object,
                  let candidate = object["candidate"]?.string,
                  let lineIndex = object["sdpMLineIndex"]?.int else {
                return
            }

            let ice = RTCIceCandidate(
                sdp: candidate,
                sdpMLineIndex: Int32(lineIndex),
                sdpMid: object["sdpMid"]?.string
            )
            try await addIce(peer: peer, candidate: ice)

        case "bye":
            peer.close()
            self.peer = nil
            pollTask?.cancel()
            pollTask = nil
            onState?("Laptop disconnected")

        default:
            break
        }
    }

    private func makeOffer(
        peer: RTCPeerConnection,
        constraints: RTCMediaConstraints
    ) async throws -> RTCSessionDescription {
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<RTCSessionDescription, Error>) in

            peer.offer(for: constraints) { sdp, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let sdp = sdp else {
                    continuation.resume(throwing: URLError(.unknown))
                    return
                }

                continuation.resume(returning: sdp)
            }
        }
    }

    private func setLocal(
        peer: RTCPeerConnection,
        sdp: RTCSessionDescription
    ) async throws {
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in

            peer.setLocalDescription(sdp) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    private func setRemote(
        peer: RTCPeerConnection,
        sdp: RTCSessionDescription
    ) async throws {
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in

            peer.setRemoteDescription(sdp) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    private func addIce(
        peer: RTCPeerConnection,
        candidate: RTCIceCandidate
    ) async throws {
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in

            peer.add(candidate) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: ())
                }
            }
        }
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didGenerate candidate: RTCIceCandidate
    ) {
        Task {
            try? await signalling.send(
                type: "ice",
                payload: [
                    "candidate": candidate.sdp,
                    "sdpMLineIndex": Int(candidate.sdpMLineIndex),
                    "sdpMid": candidate.sdpMid ?? "0"
                ]
            )
        }
    }

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCPeerConnectionState
    ) {
        onState?("WebRTC: \(newState.rawValue)")
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
