// LedgerRealtime.swift
// Listens on the signed-in user's private Supabase Realtime topic (`ledger:<user id>`)
// for the poke the database sends after every ledger write (see the Sync v2 migration).
// The poke carries only the new revision; SyncEngine fetches the row itself.
//
// Speaks the Phoenix channel protocol (vsn 1.0.0) over URLSessionWebSocketTask rather
// than pulling in the full supabase-swift Realtime client, matching how SyncCoordinator
// talks to REST. Only connected while the app is in the foreground.
// Foundation only.

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

@MainActor
final class LedgerRealtime {

    typealias TokenProvider = @MainActor () async throws -> String

    private let baseURL: URL
    private let apiKey: String
    private let tokenProvider: TokenProvider
    private let onPoke: @MainActor (_ revision: Int?, _ schemaVersion: Int?) -> Void
    private let onJoined: @MainActor (Bool) -> Void

    private var socket: URLSessionWebSocketTask?
    private var topic = ""
    private var ref = 0
    private var joinRef = ""
    private var heartbeatTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var reconnectAttempt = 0
    private var userId: String?
    private var lastTokenSent = Date.distantPast

    private static let heartbeatSeconds: UInt64 = 25
    private static let tokenRefreshInterval: TimeInterval = 10 * 60

    init(
        baseURL: URL,
        apiKey: String,
        tokenProvider: @escaping TokenProvider,
        onPoke: @escaping @MainActor (Int?, Int?) -> Void,
        onJoined: @escaping @MainActor (Bool) -> Void
    ) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.tokenProvider = tokenProvider
        self.onPoke = onPoke
        self.onJoined = onJoined
    }

    func connect(userId: String) {
        if self.userId == userId, socket != nil { return }
        disconnect()
        self.userId = userId
        topic = "realtime:ledger:\(userId)"
        open()
    }

    func disconnect() {
        userId = nil
        reconnectTask?.cancel()
        reconnectTask = nil
        tearDown()
    }

    // MARK: - Connection

    private func open() {
        guard userId != nil else { return }
        var components = URLComponents(url: baseURL.appendingPathComponent("realtime/v1/websocket"), resolvingAgainstBaseURL: false)
        components?.scheme = baseURL.scheme == "http" ? "ws" : "wss"
        components?.queryItems = [URLQueryItem(name: "apikey", value: apiKey), URLQueryItem(name: "vsn", value: "1.0.0")]
        guard let url = components?.url else { return }

        let task = URLSession.shared.webSocketTask(with: url)
        socket = task
        task.resume()
        receiveTask = Task { [weak self] in await self?.receiveLoop(task) }
        Task { [weak self] in await self?.join() }
    }

    private func join() async {
        guard let token = try? await tokenProvider() else {
            scheduleReconnect()
            return
        }
        ref += 1
        joinRef = String(ref)
        lastTokenSent = Date()
        send([
            "topic": .string(topic),
            "event": .string("phx_join"),
            "payload": .object([
                "config": .object([
                    "broadcast": .object(["ack": .bool(false), "self": .bool(false)]),
                    "presence": .object(["key": .string("")]),
                    "postgres_changes": .array([]),
                    "private": .bool(true),
                ]),
                "access_token": .string(token),
            ]),
            "ref": .string(joinRef),
            "join_ref": .string(joinRef),
        ])
        startHeartbeat()
    }

    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: Self.heartbeatSeconds * 1_000_000_000)
                guard !Task.isCancelled, let self else { return }
                await self.heartbeat()
            }
        }
    }

    private func heartbeat() async {
        ref += 1
        send(["topic": .string("phoenix"), "event": .string("heartbeat"), "payload": .object([:]), "ref": .string(String(ref))])
        // Private channels re-check the JWT; hand over a fresh one before it expires.
        if Date().timeIntervalSince(lastTokenSent) > Self.tokenRefreshInterval, let token = try? await tokenProvider() {
            ref += 1
            lastTokenSent = Date()
            send([
                "topic": .string(topic),
                "event": .string("access_token"),
                "payload": .object(["access_token": .string(token)]),
                "ref": .string(String(ref)),
                "join_ref": .string(joinRef),
            ])
        }
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            let message: URLSessionWebSocketTask.Message
            do {
                message = try await task.receive()
            } catch {
                guard task === socket else { return }
                onJoined(false)
                scheduleReconnect()
                return
            }
            let data: Data?
            switch message {
            case .string(let text): data = Data(text.utf8)
            case .data(let bytes): data = bytes
            @unknown default: data = nil
            }
            guard let data, let frame = try? JSONDecoder().decode(JSONValue.self, from: data) else { continue }
            handle(frame)
        }
    }

    private func handle(_ frame: JSONValue) {
        guard frame["topic"]?.stringValue == topic, let event = frame["event"]?.stringValue else { return }
        switch event {
        case "phx_reply" where frame["ref"]?.stringValue == joinRef:
            let ok = frame["payload"]?["status"]?.stringValue == "ok"
            if ok { reconnectAttempt = 0 }
            onJoined(ok)
            if !ok { scheduleReconnect() }
        case "broadcast":
            let inner = frame["payload"]
            guard inner?["event"]?.stringValue == "state_changed", let body = inner?["payload"] else { return }
            onPoke(body["revision"]?.numberValue.map { Int($0) }, body["schema_version"]?.numberValue.map { Int($0) })
        case "phx_error", "phx_close":
            onJoined(false)
            scheduleReconnect()
        default:
            break
        }
    }

    private func send(_ frame: [String: JSONValue]) {
        guard let socket, let data = try? JSONValue.object(frame).data(), let text = String(data: data, encoding: .utf8) else { return }
        socket.send(.string(text)) { _ in }
    }

    private func scheduleReconnect() {
        tearDown()
        guard userId != nil, reconnectTask == nil else { return }
        let delay = min(30.0, pow(2.0, Double(reconnectAttempt)))
        reconnectAttempt += 1
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.reconnectTask = nil
            self.open()
        }
    }

    private func tearDown() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
    }
}
