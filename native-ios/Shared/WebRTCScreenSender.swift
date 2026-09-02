import Foundation
import CoreMedia
import AVFoundation
@preconcurrency import WebRTC

final class WebRTCScreenSender: NSObject, RTCPeerConnectionDelegate {
    private let factory: RTCPeerConnectionFactory
    private let videoSource: RTCVideoSource
    private let capturer: RTCVideoCapturer
    private let signalling: SignallingClient

    private var peer: RTCPeerConnection?
    private var pollTask: Task<Void, Never>?
    private var audioDataChannel: RTCDataChannel?

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
        config.iceServers = [
            RTCIceServer(urlStrings: AppConfig.stunServers)
        ]

        let constraints = mediaConstraints()

        guard let peer = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: nil
        ) else {
            throw NSError(
                domain: "CommandCentreWebRTC",
                code: 1,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "Could not create the WebRTC peer connection."
                ]
            )
        }

        self.peer = peer
        peer.delegate = self

        let track = factory.videoTrack(
            with: videoSource,
            trackId: "command-centre-screen"
        )
        peer.add(track, streamIds: ["command-centre"])

        // ReplayKit gives the broadcast extension app/system audio as
        // CMSampleBuffers. The stock WebRTC iOS binary does not expose a simple
        // public API for injecting those PCM samples into RTCAudioSource, so we
        // carry low-latency PCM over an unreliable WebRTC data channel instead.
        let audioConfig = RTCDataChannelConfiguration()
        audioConfig.isOrdered = false
        audioConfig.maxRetransmits = 0
        self.audioDataChannel = peer.dataChannel(
            forLabel: "command-centre-audio",
            configuration: audioConfig
        )

        try await sendOffer(iceRestart: false)
        startPolling()
        onState?("Offer sent — waiting for laptop")
    }

    func pushVideo(
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
            timestampNs = Int64(
                ProcessInfo.processInfo.systemUptime * 1_000_000_000
            )
        }

        let frame = RTCVideoFrame(
            buffer: rtcBuffer,
            rotation: rotation,
            timeStampNs: timestampNs
        )
        videoSource.capturer(capturer, didCapture: frame)
    }

    func pushAppAudio(sampleBuffer: CMSampleBuffer) {
        guard CMSampleBufferIsValid(sampleBuffer),
              let channel = audioDataChannel,
              channel.readyState == .open,
              channel.bufferedAmount < 512_000,
              let formatDescription = CMSampleBufferGetFormatDescription(
                sampleBuffer
              ) else {
            return
        }

        let format = AVAudioFormat(
            cmAudioFormatDescription: formatDescription
        )
        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)

        guard frameCount > 0,
              format.channelCount > 0,
              format.sampleRate > 0,
              let pcm = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(frameCount)
              ) else {
            return
        }

        pcm.frameLength = AVAudioFrameCount(frameCount)

        let copyStatus = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(frameCount),
            into: pcm.mutableAudioBufferList
        )

        guard copyStatus == noErr else { return }

        let count = Int(frameCount)
        let channelCount = Int(format.channelCount)
        let stride = pcm.stride
        var mono = [Float](repeating: 0, count: count)

        switch format.commonFormat {
        case .pcmFormatFloat32:
            guard let data = pcm.floatChannelData else { return }

            if format.isInterleaved {
                let base = data[0]
                for frame in 0..<count {
                    var sum: Float = 0
                    let start = frame * stride
                    for c in 0..<channelCount {
                        sum += base[start + c]
                    }
                    mono[frame] = sum / Float(channelCount)
                }
            } else {
                for frame in 0..<count {
                    var sum: Float = 0
                    for c in 0..<channelCount {
                        sum += data[c][frame]
                    }
                    mono[frame] = sum / Float(channelCount)
                }
            }

        case .pcmFormatInt16:
            guard let data = pcm.int16ChannelData else { return }

            if format.isInterleaved {
                let base = data[0]
                for frame in 0..<count {
                    var sum: Float = 0
                    let start = frame * stride
                    for c in 0..<channelCount {
                        sum += Float(base[start + c]) / 32768.0
                    }
                    mono[frame] = sum / Float(channelCount)
                }
            } else {
                for frame in 0..<count {
                    var sum: Float = 0
                    for c in 0..<channelCount {
                        sum += Float(data[c][frame]) / 32768.0
                    }
                    mono[frame] = sum / Float(channelCount)
                }
            }

        case .pcmFormatInt32:
            guard let data = pcm.int32ChannelData else { return }

            if format.isInterleaved {
                let base = data[0]
                for frame in 0..<count {
                    var sum: Float = 0
                    let start = frame * stride
                    for c in 0..<channelCount {
                        sum += Float(base[start + c]) / 2_147_483_648.0
                    }
                    mono[frame] = sum / Float(channelCount)
                }
            } else {
                for frame in 0..<count {
                    var sum: Float = 0
                    for c in 0..<channelCount {
                        sum += Float(data[c][frame]) / 2_147_483_648.0
                    }
                    mono[frame] = sum / Float(channelCount)
                }
            }

        default:
            // ReplayKit normally supplies linear PCM. If Apple changes the
            // source format, video continues even if this packet is skipped.
            return
        }

        var packet = Data()
        packet.reserveCapacity(16 + mono.count * MemoryLayout<Float>.size)

        // CCA1
        packet.append(contentsOf: [0x43, 0x43, 0x41, 0x31])

        var sampleRate = UInt32(
            min(max(Int(format.sampleRate.rounded()), 8_000), 192_000)
        ).littleEndian
        var frames = UInt32(mono.count).littleEndian
        var channels = UInt32(1).littleEndian

        withUnsafeBytes(of: &sampleRate) { packet.append(contentsOf: $0) }
        withUnsafeBytes(of: &frames) { packet.append(contentsOf: $0) }
        withUnsafeBytes(of: &channels) { packet.append(contentsOf: $0) }

        mono.withUnsafeBytes { raw in
            packet.append(contentsOf: raw)
        }

        _ = channel.sendData(
            RTCDataBuffer(data: packet, isBinary: true)
        )
    }

    func stop() async {
        pollTask?.cancel()
        pollTask = nil

        audioDataChannel?.close()
        audioDataChannel = nil

        peer?.close()
        peer = nil

        try? await signalling.send(type: "bye", payload: [:])
        onState?("Stopped")
    }

    private func mediaConstraints() -> RTCMediaConstraints {
        RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: [
                "DtlsSrtpKeyAgreement": kRTCMediaConstraintsValueTrue
            ]
        )
    }

    private func sendOffer(iceRestart: Bool) async throws {
        guard let peer else { return }

        if iceRestart {
            peer.restartIce()
        }

        // If a receiver joined after the initial offer was posted, simply
        // re-post the same outstanding offer. This is especially helpful for
        // installed desktop PWAs, where startup timing differs from a tab.
        if !iceRestart,
           peer.remoteDescription == nil,
           let local = peer.localDescription,
           local.type == .offer {
            try await signalling.send(
                type: "offer",
                payload: [
                    "type": "offer",
                    "sdp": local.sdp
                ]
            )
            return
        }

        guard peer.signalingState == .stable else { return }

        let offer = try await makeOffer(
            peer: peer,
            constraints: mediaConstraints()
        )
        try await setLocal(peer: peer, sdp: offer)

        try await signalling.send(
            type: "offer",
            payload: [
                "type": "offer",
                "sdp": offer.sdp
            ]
        )
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
                    self.onState?(
                        "Signalling: \(error.localizedDescription)"
                    )
                }

                try? await Task.sleep(
                    nanoseconds: 850_000_000
                )
            }
        }
    }

    private func handle(_ signal: MirrorSignal) async throws {
        guard let peer = peer else { return }

        switch signal.type {
        case "ready":
            let shouldRestart =
                peer.remoteDescription != nil &&
                peer.connectionState != .connected

            try await sendOffer(
                iceRestart: shouldRestart
            )

        case "answer":
            guard let object = signal.data.object,
                  let sdp = object["sdp"]?.string else {
                return
            }

            let answer = RTCSessionDescription(
                type: .answer,
                sdp: sdp
            )
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
            try await addIce(
                peer: peer,
                candidate: ice
            )

        case "bye":
            peer.close()
            self.peer = nil
            audioDataChannel?.close()
            audioDataChannel = nil
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
            (continuation:
                CheckedContinuation<RTCSessionDescription, Error>) in

            peer.offer(for: constraints) { sdp, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let sdp = sdp else {
                    continuation.resume(
                        throwing: URLError(.unknown)
                    )
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
            (continuation:
                CheckedContinuation<Void, Error>) in

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
            (continuation:
                CheckedContinuation<Void, Error>) in

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
            (continuation:
                CheckedContinuation<Void, Error>) in

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
                    "sdpMLineIndex":
                        Int(candidate.sdpMLineIndex),
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

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange stateChanged: RTCSignalingState
    ) {}
    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didAdd stream: RTCMediaStream
    ) {}
    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didRemove stream: RTCMediaStream
    ) {}
    func peerConnectionShouldNegotiate(
        _ peerConnection: RTCPeerConnection
    ) {}
    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCIceConnectionState
    ) {}
    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didChange newState: RTCIceGatheringState
    ) {}
    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didRemove candidates: [RTCIceCandidate]
    ) {}
    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didOpen dataChannel: RTCDataChannel
    ) {}
}
