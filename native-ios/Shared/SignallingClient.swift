import Foundation

struct MirrorSignal: Decodable {
    let id: Int
    let type: String
    let data: JSONValue
}

enum JSONValue: Codable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }

    var object: [String: JSONValue]? { if case .object(let v) = self { return v }; return nil }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var int: Int? { if case .number(let v) = self { return Int(v) }; return nil }
}

actor SignallingClient {
    private let baseURL: URL
    private let session = URLSession(configuration: .ephemeral)
    private(set) var code: String?
    private var lastSignalID = 0

    init(baseURL: URL, code: String? = nil) {
        self.baseURL = baseURL
        self.code = code
    }

    func createRoom() async throws -> String {
        let code = String(Int.random(in: 100000...999999))
        let url = baseURL.appending(path: "/api/mirror/room")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["code": code])
        let (_, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        self.code = code
        self.lastSignalID = 0
        return code
    }

    func publishNativeRoom(channel: String, code: String) async throws {
        let url = baseURL.appending(path: "/api/mirror/native-session")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "channel": channel,
            "code": code
        ])

        let (_, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    func fetchNativeRoom(channel: String) async throws -> String {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/mirror/native-session"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "channel", value: channel)
        ]

        let (data, response) = try await session.data(from: components.url!)
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        struct NativeRoomResponse: Decodable {
            let code: String
        }

        return try JSONDecoder().decode(
            NativeRoomResponse.self,
            from: data
        ).code
    }

    func clearNativeRoom(channel: String) async {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/mirror/native-session"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "channel", value: channel)
        ]

        var req = URLRequest(url: components.url!)
        req.httpMethod = "DELETE"
        _ = try? await session.data(for: req)
    }

    func send(type: String, payload: [String: Any]) async throws {
        guard let code else { throw URLError(.badURL) }
        let url = baseURL.appending(path: "/api/mirror/signal")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "code": code,
            "from": "sender",
            "to": "receiver",
            "type": type,
            "data": payload
        ])
        let (_, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }

    func poll() async throws -> [MirrorSignal] {
        guard let code else { return [] }
        var components = URLComponents(url: baseURL.appending(path: "/api/mirror/signals"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "for", value: "sender"),
            URLQueryItem(name: "after", value: String(lastSignalID))
        ]
        let (data, response) = try await session.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        struct Envelope: Decodable { let signals: [MirrorSignal] }
        let signals = try JSONDecoder().decode(Envelope.self, from: data).signals
        if let maxID = signals.map(\.id).max() { lastSignalID = max(lastSignalID, maxID) }
        return signals
    }
}
