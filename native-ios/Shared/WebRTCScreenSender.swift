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
    private var audioSourceReported = false
    private var audioFailureReported = false
    private var audioPacketsSent = 0

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
              channel.bufferedAmount < 512_000 else {
            return
        }

        if !audioSourceReported {
            audioSourceReported = true
            sendAudioStatus("source-received")
        }

        guard let formatDescription =
                CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer =
                CMAudioFormatDescriptionGetStreamBasicDescription(
                    formatDescription
                ) else {
            reportAudioFailureOnce("missing-format")
            return
        }

        let asbd = asbdPointer.pointee

        guard asbd.mFormatID == kAudioFormatLinearPCM else {
            reportAudioFailureOnce(
                "unsupported-format-\(asbd.mFormatID)"
            )
            return
        }

        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard frameCount > 0,
              asbd.mChannelsPerFrame > 0,
              asbd.mSampleRate > 0 else {
            reportAudioFailureOnce("empty-audio-buffer")
            return
        }

        var requiredSize = 0
        let flags = UInt32(
            kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment
        )

        let sizeStatus =
            CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
                sampleBuffer,
                bufferListSizeNeededOut: &requiredSize,
                bufferListOut: nil,
                bufferListSize: 0,
                blockBufferAllocator: kCFAllocatorDefault,
                blockBufferMemoryAllocator: kCFAllocatorDefault,
                flags: flags,
                blockBufferOut: nil
            )

        guard requiredSize >= MemoryLayout<AudioBufferList>.size,
              sizeStatus == noErr ||
                sizeStatus == kCMSampleBufferError_ArrayTooSmall else {
            reportAudioFailureOnce(
                "audio-list-size-\(sizeStatus)"
            )
            return
        }

        let rawList = UnsafeMutableRawPointer.allocate(
            byteCount: requiredSize,
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { rawList.deallocate() }

        let audioBufferList = rawList.bindMemory(
            to: AudioBufferList.self,
            capacity: 1
        )

        var retainedBlockBuffer: CMBlockBuffer?
        let listStatus =
            CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
                sampleBuffer,
                bufferListSizeNeededOut: nil,
                bufferListOut: audioBufferList,
                bufferListSize: requiredSize,
                blockBufferAllocator: kCFAllocatorDefault,
                blockBufferMemoryAllocator: kCFAllocatorDefault,
                flags: flags,
                blockBufferOut: &retainedBlockBuffer
            )

        guard listStatus == noErr else {
            reportAudioFailureOnce(
                "audio-list-\(listStatus)"
            )
            return
        }

        let buffers = UnsafeMutableAudioBufferListPointer(
            audioBufferList
        )

        let bitsPerChannel = Int(asbd.mBitsPerChannel)
        let bytesPerSample = max(1, bitsPerChannel / 8)
        let bytesPerFrame = max(
            bytesPerSample,
            Int(asbd.mBytesPerFrame)
        )
        let formatFlags = asbd.mFormatFlags
        let isFloat =
            (formatFlags & kAudioFormatFlagIsFloat) != 0
        let isSignedInteger =
            (formatFlags & kAudioFormatFlagIsSignedInteger) != 0
        let isBigEndian =
            (formatFlags & kAudioFormatFlagIsBigEndian) != 0

        // ReplayKit commonly supplies 44.1/48 kHz interleaved signed Int16
        // stereo. The previous AVAudioPCMBuffer approach could expose no
        // typed channel pointer for interleaved buffers, so every packet was
        // silently dropped. Read the original AudioBufferList directly.
        guard !isBigEndian else {
            reportAudioFailureOnce("big-endian-pcm")
            return
        }

        guard (isFloat && bitsPerChannel == 32) ||
              (isSignedInteger &&
                (bitsPerChannel == 16 ||
                 bitsPerChannel == 32)) else {
            reportAudioFailureOnce(
                "pcm-\(bitsPerChannel)-flags-\(formatFlags)"
            )
            return
        }

        var mono = [Float](
            repeating: 0,
            count: Int(frameCount)
        )
        var contributors = [Int](
            repeating: 0,
            count: Int(frameCount)
        )

        for audioBuffer in buffers {
            guard let data = audioBuffer.mData else { continue }

            let channelsInBuffer = max(
                1,
                Int(audioBuffer.mNumberChannels)
            )

            // In an interleaved ABL, mBytesPerFrame contains all channels.
            // In a planar ABL, each buffer usually contains one channel and
            // mBytesPerFrame is one sample wide.
            let frameStride =
                buffers.count == 1
                    ? bytesPerFrame
                    : max(
                        bytesPerSample,
                        bytesPerFrame /
                            max(
                                1,
                                Int(asbd.mChannelsPerFrame) /
                                    channelsInBuffer
                            )
                      )

            for frame in 0..<Int(frameCount) {
                let frameBase = data.advanced(
                    by: frame * frameStride
                )

                for channelIndex in 0..<channelsInBuffer {
                    let samplePointer = frameBase.advanced(
                        by: channelIndex * bytesPerSample
                    )

                    let sample: Float

                    if isFloat {
                        sample =
                            samplePointer
                                .assumingMemoryBound(to: Float.self)
                                .pointee
                    } else if bitsPerChannel == 16 {
                        sample =
                            Float(
                                samplePointer
                                    .assumingMemoryBound(to: Int16.self)
                                    .pointee
                            ) / 32768.0
                    } else {
                        sample =
                            Float(
                                samplePointer
                                    .assumingMemoryBound(to: Int32.self)
                                    .pointee
                            ) / 2_147_483_648.0
                    }

                    mono[frame] += max(-1.0, min(1.0, sample))
                    contributors[frame] += 1
                }
            }
        }

        var peak: Float = 0
        for frame in 0..<mono.count {
            let count = contributors[frame]
            if count > 0 {
                mono[frame] /= Float(count)
                peak = max(peak, abs(mono[frame]))
            }
        }

        guard contributors.contains(where: { $0 > 0 }) else {
            reportAudioFailureOnce("no-pcm-data")
            return
        }

        var packet = Data()
        packet.reserveCapacity(
            16 + mono.count * MemoryLayout<Float>.size
        )

        // CCA1 packet:
        // magic(4) + sampleRate(4) + frames(4) + channels(4) + Float32 PCM.
        packet.append(
            contentsOf: [0x43, 0x43, 0x41, 0x31]
        )

        var sampleRate = UInt32(
            min(
                max(Int(asbd.mSampleRate.rounded()), 8_000),
                192_000
            )
        ).littleEndian
        var frames = UInt32(mono.count).littleEndian
        var channels = UInt32(1).littleEndian

        withUnsafeBytes(of: &sampleRate) {
            packet.append(contentsOf: $0)
        }
        withUnsafeBytes(of: &frames) {
            packet.append(contentsOf: $0)
        }
        withUnsafeBytes(of: &channels) {
            packet.append(contentsOf: $0)
        }
        mono.withUnsafeBytes { raw in
            packet.append(contentsOf: raw)
        }

        let didSend = channel.sendData(
            RTCDataBuffer(
                data: packet,
                isBinary: true
            )
        )

        if didSend {
            audioPacketsSent += 1
            if audioPacketsSent == 1 {
                sendAudioStatus(
                    "pcm-flowing-\(Int(asbd.mSampleRate.rounded()))hz-\(bitsPerChannel)bit-peak-\(String(format: "%.3f", peak))"
                )
            }
        } else {
            reportAudioFailureOnce("data-channel-send-failed")
        }
    }

    private func sendAudioStatus(_ message: String) {
        guard let channel = audioDataChannel,
              channel.readyState == .open else {
            return
        }

        let text = "cc-audio:\(message)"
        guard let data = text.data(using: .utf8) else {
            return
        }

        _ = channel.sendData(
            RTCDataBuffer(
                data: data,
                isBinary: false
            )
        )
    }

    private func reportAudioFailureOnce(_ reason: String) {
        guard !audioFailureReported else { return }
        audioFailureReported = true
        sendAudioStatus("error-\(reason)")
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
