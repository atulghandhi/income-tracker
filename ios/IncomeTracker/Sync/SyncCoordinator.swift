// SyncCoordinator.swift
// @MainActor @Observable class that owns all Supabase communication.
// Mirrors the responsibilities of src/supabase.ts using URLSession REST calls
// so the Sync layer does not pull in the full supabase-swift SDK on its own —
// the SDK is available as a package dependency for future migration.
//
// Supabase project: hgzacqveqrccnvjwumkz
// URL + anon key can be overridden via Info.plist (SUPABASE_URL / SUPABASE_ANON_KEY);
// otherwise the built-in defaults below are used. The anon (publishable) key is
// safe to embed — all data access is enforced by row-level security.

import Foundation
import AuthenticationServices
import UIKit
import CryptoKit

// MARK: - SyncCoordinator

@MainActor
@Observable
final class SyncCoordinator {

    // MARK: - Public state

    var isSignedIn: Bool = false
    var currentUser: SupabaseUser? = nil
    var mergeConflict: MergeConflict? = nil
    var lastSyncedAt: Date? = nil
    var isSyncing: Bool = false
    /// Human-readable description of the last sync/auth failure, surfaced in the UI.
    var lastSyncError: String? = nil

    // MARK: - Supporting types

    struct SupabaseUser: Codable, Sendable {
        let id: String
        let email: String?
    }

    /// Identifiable so it can be used as a `.sheet(item:)` binding.
    struct MergeConflict: Identifiable, Sendable {
        let id = UUID()
        let local: LedgerState
        let cloud: LedgerState
    }

    /// Result of an email/password sign-up.
    enum SignUpResult: Sendable {
        case signedIn
        /// Account created but the project requires email confirmation before sign-in.
        case confirmationRequired
    }

    /// Full session persisted to the Keychain so it can be refreshed across launches.
    private struct StoredSession: Codable {
        var accessToken: String
        var refreshToken: String?
        var expiresAt: Date?
        var user: SupabaseUser?
    }

    // MARK: - Private Supabase config

    private static let defaultURL = "https://hgzacqveqrccnvjwumkz.supabase.co"
    private static let defaultAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnemFjcXZlcXJjY252and1bWt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDAzNDUsImV4cCI6MjA4ODU3NjM0NX0.ymfxr4YzbspKit3BoVTWICgDiz-DMnCvJb6CZWBQ0wE"

    private let supabaseURL: URL
    private let supabaseAnonKey: String

    // MARK: - Keychain constants

    private enum KeychainKey {
        static let service = "com.incometracking.app"
        static let session = "supabase_session"
        // Legacy pre-refresh-support entries; cleared on sign-out.
        static let legacyAccessToken = "supabase_access_token"
        static let legacyRefreshToken = "supabase_refresh_token"
        static let legacyUserJSON = "supabase_user"
    }

    // MARK: - ASWebAuthenticationSession (Google OAuth)

    /// Held strongly so the session is not deallocated mid-flow.
    private var webAuthSession: ASWebAuthenticationSession?
    /// PKCE code verifier generated at sign-in start; used in the token exchange.
    private var pkceCodeVerifier: String?
    /// Serialises concurrent refresh attempts.
    private var refreshTask: Task<String, Error>?

    // MARK: - Init

    init() {
        let bundle = Bundle.main
        if
            let urlString = bundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: urlString), !urlString.isEmpty,
            let key = bundle.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            !key.isEmpty
        {
            supabaseURL = url
            supabaseAnonKey = key
        } else {
            supabaseURL = URL(string: Self.defaultURL)!
            supabaseAnonKey = Self.defaultAnonKey
        }
    }

    // MARK: - Session management

    /// Restores a previously saved session from the Keychain, refreshing the
    /// access token when it is expired. Network failures keep the cached user
    /// signed in (offline mode) — only a definitive auth rejection signs out.
    func restoreSession() async {
        guard var session = loadStoredSession() ?? migrateLegacySession() else { return }

        // Optimistically restore the cached user so the app works offline.
        if let user = session.user {
            currentUser = user
            isSignedIn = true
        }

        // Refresh when the token is expired or close to expiring.
        let needsRefresh: Bool
        if let expiresAt = session.expiresAt {
            needsRefresh = expiresAt.timeIntervalSinceNow < 120
        } else {
            needsRefresh = true
        }

        if needsRefresh {
            do {
                _ = try await refreshAccessToken()
            } catch SyncError.httpError(let code, _) where (400...403).contains(code) {
                // Refresh token was revoked/invalid — a real sign-out.
                await signOutLocally()
                return
            } catch SyncError.notSignedIn {
                // No refresh token to work with: the cached identity can never make an
                // authenticated request again, so don't pretend to be signed in.
                await signOutLocally()
                return
            } catch {
                // Network failure — stay signed in with cached identity.
                return
            }
            session = loadStoredSession() ?? session
        }

        // Confirm the user record if we don't have one cached.
        if session.user == nil, let token = session.accessToken.isEmpty ? nil : session.accessToken {
            if let data = try? await supabaseRequest(path: "/auth/v1/user", method: "GET", token: token, body: nil),
               let user = try? JSONDecoder.supabase.decode(SupabaseUser.self, from: data)
            {
                currentUser = user
                isSignedIn = true
                var updated = session
                updated.user = user
                saveStoredSession(updated)
            }
        }
    }

    /// Sign in with Apple using the native id_token flow.
    /// The caller (AppleSignInCoordinator) provides the raw id_token and the
    /// raw nonce whose SHA-256 hash was attached to the Apple request.
    func signInWithApple(idToken: String, nonce: String) async throws {
        let body: [String: String] = [
            "provider": "apple",
            "id_token": idToken,
            "nonce": nonce,
        ]
        let payload = try JSONEncoder().encode(body)
        let data = try await supabaseRequest(
            path: "/auth/v1/token?grant_type=id_token",
            method: "POST",
            token: nil,
            body: payload
        )
        try handleAuthResponse(data: data)
    }

    // MARK: - Email / password auth

    /// Signs in with email + password (grant_type=password).
    func signInWithEmail(_ email: String, password: String) async throws {
        let body = ["email": email, "password": password]
        let payload = try JSONEncoder().encode(body)
        let data = try await supabaseRequest(
            path: "/auth/v1/token?grant_type=password",
            method: "POST",
            token: nil,
            body: payload
        )
        try handleAuthResponse(data: data)
    }

    /// Creates a new account. When the project requires email confirmation the
    /// response has a user but no access token — surfaced as `.confirmationRequired`.
    func signUpWithEmail(_ email: String, password: String) async throws -> SignUpResult {
        let body = ["email": email, "password": password]
        let payload = try JSONEncoder().encode(body)
        let data = try await supabaseRequest(
            path: "/auth/v1/signup",
            method: "POST",
            token: nil,
            body: payload
        )

        struct SignUpResponse: Decodable {
            let access_token: String?
        }
        let probe = try? JSONDecoder().decode(SignUpResponse.self, from: data)
        if probe?.access_token != nil {
            try handleAuthResponse(data: data)
            return .signedIn
        }
        return .confirmationRequired
    }

    /// Sends a password-reset email.
    func sendPasswordReset(email: String) async throws {
        let payload = try JSONEncoder().encode(["email": email])
        _ = try await supabaseRequest(
            path: "/auth/v1/recover",
            method: "POST",
            token: nil,
            body: payload
        )
    }

    /// Opens an ASWebAuthenticationSession pointed at Supabase's Google OAuth
    /// endpoint.  The session redirects to incometracker://auth-callback which
    /// is caught by handleAuthCallback(url:).
    func signInWithGoogle() async throws {
        // Generate PKCE verifier + challenge.
        let verifier = Self.generateCodeVerifier()
        let challenge = Self.generateCodeChallenge(from: verifier)
        pkceCodeVerifier = verifier

        // Build the OAuth URL.
        var components = URLComponents(
            url: supabaseURL.appendingPathComponent("/auth/v1/authorize"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: "incometracker://auth-callback"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        guard let authURL = components.url else {
            throw SyncError.badURL
        }

        // Present the web authentication session.
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "incometracker"
            ) { [weak self] callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: SyncError.missingCallbackURL)
                    return
                }
                Task { @MainActor [weak self] in
                    do {
                        try await self?.exchangeOAuthCode(from: callbackURL)
                        continuation.resume()
                    } catch {
                        continuation.resume(throwing: error)
                    }
                }
            }
            // presentationContextProvider must be set before calling start().
            session.presentationContextProvider = PresentationContextProvider.shared
            session.prefersEphemeralWebBrowserSession = false
            self.webAuthSession = session
            session.start()
        }
    }

    /// Called from IncomeTrackerApp.onOpenURL when the OAuth redirect arrives.
    /// If the URL carries a PKCE `code` query parameter, it exchanges it for a
    /// token; otherwise it parses fragment-style tokens (implicit flow fallback).
    func handleAuthCallback(url: URL) {
        // Only the OAuth redirect (incometracker://auth-callback...) belongs here;
        // widget deep links such as incometracker://dashboard use the same scheme.
        guard url.host?.lowercased() == "auth-callback" else { return }
        Task {
            do {
                try await exchangeOAuthCode(from: url)
            } catch {
                lastSyncError = "Sign-in failed: \(error.localizedDescription)"
            }
        }
    }

    func signOut() async {
        if let session = loadStoredSession() {
            // Best-effort POST to revoke the token server-side.
            _ = try? await supabaseRequest(
                path: "/auth/v1/logout",
                method: "POST",
                token: session.accessToken,
                body: nil
            )
        }
        await signOutLocally()
    }

    private func signOutLocally() async {
        clearKeychain()
        currentUser = nil
        isSignedIn = false
        lastSyncedAt = nil
    }

    // MARK: - Data sync (mirrors src/supabase.ts)

    /// Fetches the stored `LedgerState` JSON blob for the current user.
    /// Returns nil when no row exists yet (first-time user).
    func loadCloudState() async throws -> LedgerState? {
        let data = try await authorizedRequest(
            path: "/rest/v1/ledgerlite_states?select=state&limit=1",
            method: "GET",
            body: nil
        )

        // The response is a JSON array: [{ "state": { ... } }]
        struct Row: Decodable {
            let state: LedgerState
        }
        let rows = try JSONDecoder.supabase.decode([Row].self, from: data)
        return rows.first?.state
    }

    /// Upserts the full `LedgerState` for `userId` into ledgerlite_states.
    /// Uses `Prefer: resolution=merge-duplicates` to update if a row exists.
    func saveCloudState(_ state: LedgerState, userId: String) async throws {
        struct UpsertPayload: Encodable {
            let user_id: String          // snake_case to match Postgres column
            let state: LedgerState
            let schema_version: Int
            let updated_at: String
        }
        let payload = UpsertPayload(
            user_id: userId,
            state: state,
            schema_version: state.schemaVersion,
            updated_at: isoTimestampNow()
        )
        let body = try JSONEncoder.ledgerState.encode(payload)

        _ = try await authorizedRequest(
            path: "/rest/v1/ledgerlite_states",
            method: "POST",
            body: body,
            extraHeaders: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
        lastSyncedAt = .now
        lastSyncError = nil
    }

    /// Upserts the user's profile row in ledgerlite_profiles.
    func upsertUserProfile(user: SupabaseUser) async throws {
        struct ProfilePayload: Encodable {
            let id: String
            let email: String?
            let updated_at: String
        }
        let payload = ProfilePayload(
            id: user.id,
            email: user.email,
            updated_at: isoTimestampNow()
        )
        let body = try JSONEncoder().encode(payload)

        _ = try await authorizedRequest(
            path: "/rest/v1/ledgerlite_profiles",
            method: "POST",
            body: body,
            extraHeaders: ["Prefer": "resolution=merge-duplicates,return=minimal"]
        )
    }

    // MARK: - Authorized request with automatic token refresh

    /// Fires an authenticated request, transparently refreshing the access
    /// token when it has expired (proactively and on a 401 response).
    @discardableResult
    func authorizedRequest(
        path: String,
        method: String,
        body: Data?,
        extraHeaders: [String: String] = [:]
    ) async throws -> Data {
        guard let session = loadStoredSession() else {
            throw SyncError.notSignedIn
        }

        var token = session.accessToken
        if let expiresAt = session.expiresAt, expiresAt.timeIntervalSinceNow < 60 {
            token = try await refreshAccessToken()
        }

        do {
            return try await restRequest(
                path: path, method: method, token: token, body: body, extraHeaders: extraHeaders
            )
        } catch SyncError.httpError(401, _) {
            // Token was rejected — refresh once and retry.
            token = try await refreshAccessToken()
            return try await restRequest(
                path: path, method: method, token: token, body: body, extraHeaders: extraHeaders
            )
        }
    }

    /// Exchanges the stored refresh token for a fresh access token.
    /// Concurrent callers share a single in-flight refresh.
    private func refreshAccessToken() async throws -> String {
        if let task = refreshTask {
            return try await task.value
        }
        let task = Task<String, Error> { [weak self] in
            guard let self else { throw SyncError.notSignedIn }
            guard
                let session = self.loadStoredSession(),
                let refreshToken = session.refreshToken
            else {
                throw SyncError.notSignedIn
            }
            let payload = try JSONEncoder().encode(["refresh_token": refreshToken])
            let data = try await self.supabaseRequest(
                path: "/auth/v1/token?grant_type=refresh_token",
                method: "POST",
                token: nil,
                body: payload
            )
            try self.handleAuthResponse(data: data)
            guard let refreshed = self.loadStoredSession() else {
                throw SyncError.decodingFailed
            }
            return refreshed.accessToken
        }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    // MARK: - Internal REST helper (used by extensions in other files)

    /// Builds and fires a Supabase REST/Auth request from any file in the module.
    @discardableResult
    func restRequest(
        path: String,
        method: String,
        token: String?,
        body: Data?,
        extraHeaders: [String: String] = [:]
    ) async throws -> Data {
        var request = try buildRequest(path: path, method: method, token: token, body: body)
        for (key, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response, data: data)
        return data
    }

    // MARK: - Keychain helpers (private)

    private func saveStoredSession(_ session: StoredSession) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        try? KeychainHelper.save(data, service: KeychainKey.service, account: KeychainKey.session)
    }

    private func loadStoredSession() -> StoredSession? {
        guard let data = try? KeychainHelper.load(service: KeychainKey.service, account: KeychainKey.session) else {
            return nil
        }
        return try? JSONDecoder().decode(StoredSession.self, from: data)
    }

    /// Upgrades a session persisted by the previous app version (separate
    /// access/refresh token entries) to the consolidated StoredSession format.
    private func migrateLegacySession() -> StoredSession? {
        guard
            let access = try? KeychainHelper.loadString(service: KeychainKey.service, account: KeychainKey.legacyAccessToken),
            !access.isEmpty
        else { return nil }
        let refresh = try? KeychainHelper.loadString(service: KeychainKey.service, account: KeychainKey.legacyRefreshToken)
        var user: SupabaseUser?
        if let userData = try? KeychainHelper.load(service: KeychainKey.service, account: KeychainKey.legacyUserJSON) {
            user = try? JSONDecoder.supabase.decode(SupabaseUser.self, from: userData)
        }
        // Force an immediate refresh by treating the legacy token as expired.
        let session = StoredSession(accessToken: access, refreshToken: refresh, expiresAt: .distantPast, user: user)
        saveStoredSession(session)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.legacyAccessToken)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.legacyRefreshToken)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.legacyUserJSON)
        return session
    }

    private func clearKeychain() {
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.session)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.legacyAccessToken)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.legacyRefreshToken)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.legacyUserJSON)
    }

    // MARK: - HTTP helpers

    /// Builds a URLRequest targeting the Supabase REST/Auth API.
    private func buildRequest(
        path: String,
        method: String,
        token: String?,
        body: Data?
    ) throws -> URLRequest {
        guard let url = URL(string: supabaseURL.absoluteString + path) else {
            throw SyncError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body
        return request
    }

    /// Fires a request and returns the raw response body.
    /// Throws SyncError.httpError for non-2xx status codes.
    @discardableResult
    private func supabaseRequest(
        path: String,
        method: String,
        token: String?,
        body: Data?
    ) async throws -> Data {
        let request = try buildRequest(path: path, method: method, token: token, body: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response, data: data)
        return data
    }

    /// Validates that the HTTP response carries a 2xx status code.
    /// Extracts the server's error message when available.
    private func validateHTTPResponse(_ response: URLResponse, data: Data? = nil) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200...299).contains(http.statusCode) else {
            var message: String?
            if let data {
                struct ErrorBody: Decodable {
                    let msg: String?
                    let message: String?
                    let error_description: String?
                }
                if let parsed = try? JSONDecoder().decode(ErrorBody.self, from: data) {
                    message = parsed.msg ?? parsed.message ?? parsed.error_description
                }
            }
            throw SyncError.httpError(statusCode: http.statusCode, message: message)
        }
    }

    // MARK: - OAuth code exchange (private)

    /// Exchanges a PKCE `code` query parameter (or implicit fragment tokens)
    /// for a Supabase session and persists it to the Keychain.
    private func exchangeOAuthCode(from url: URL) async throws {
        // Try PKCE code exchange first.
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let code = components.queryItems?.first(where: { $0.name == "code" })?.value
        {
            guard let verifier = pkceCodeVerifier else {
                throw SyncError.missingCodeVerifier
            }
            pkceCodeVerifier = nil
            let body: [String: String] = [
                "auth_code": code,
                "code_verifier": verifier,
            ]
            let payload = try JSONEncoder().encode(body)
            let data = try await supabaseRequest(
                path: "/auth/v1/token?grant_type=pkce",
                method: "POST",
                token: nil,
                body: payload
            )
            try handleAuthResponse(data: data)
            return
        }

        // Implicit flow fallback: parse access_token from URL fragment.
        if let fragment = url.fragment {
            let pairs = fragment.split(separator: "&").reduce(into: [String: String]()) { dict, pair in
                let kv = pair.split(separator: "=", maxSplits: 1)
                if kv.count == 2 { dict[String(kv[0])] = String(kv[1]) }
            }
            if let token = pairs["access_token"] {
                let expiresIn = pairs["expires_in"].flatMap(Double.init) ?? 3600
                var session = StoredSession(
                    accessToken: token,
                    refreshToken: pairs["refresh_token"],
                    expiresAt: Date.now.addingTimeInterval(expiresIn),
                    user: nil
                )
                saveStoredSession(session)
                // Fetch the user profile with the new token.
                let userData = try await supabaseRequest(
                    path: "/auth/v1/user",
                    method: "GET",
                    token: token,
                    body: nil
                )
                let user = try JSONDecoder.supabase.decode(SupabaseUser.self, from: userData)
                session.user = user
                saveStoredSession(session)
                currentUser = user
                isSignedIn = true
                try await upsertUserProfile(user: user)
                return
            }
        }

        throw SyncError.missingCallbackURL
    }

    /// Decodes a Supabase auth token response, saves to Keychain, and sets state.
    private func handleAuthResponse(data: Data) throws {
        struct AuthResponse: Decodable {
            let access_token: String
            let refresh_token: String?
            let expires_in: Double?
            let user: SupabaseUser?
        }
        // Plain decoder: property names above already match the snake_case wire
        // keys. JSONDecoder.supabase's convertFromSnakeCase would rename
        // "access_token" → "accessToken" and fail with keyNotFound.
        let response = try JSONDecoder().decode(AuthResponse.self, from: data)
        let previous = loadStoredSession()
        let session = StoredSession(
            accessToken: response.access_token,
            refreshToken: response.refresh_token ?? previous?.refreshToken,
            expiresAt: Date.now.addingTimeInterval(response.expires_in ?? 3600),
            user: response.user ?? previous?.user
        )
        saveStoredSession(session)

        if let user = session.user {
            currentUser = user
            isSignedIn = true
            // Best-effort profile upsert — don't throw on failure.
            Task { try? await upsertUserProfile(user: user) }
        }
    }
}

// MARK: - SyncError

enum SyncError: LocalizedError {
    case notSignedIn
    case badURL
    case missingCallbackURL
    case missingCodeVerifier
    case httpError(statusCode: Int, message: String? = nil)
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .notSignedIn:           return "Not signed in."
        case .badURL:                return "Invalid Supabase URL."
        case .missingCallbackURL:    return "Sign-in did not complete. Please try again."
        case .missingCodeVerifier:   return "Sign-in session expired. Please try again."
        case .httpError(let code, let message):
            if let message, !message.isEmpty { return message }
            return "Server returned HTTP \(code)."
        case .decodingFailed:        return "Could not decode server response."
        }
    }
}

// MARK: - JSON encoder/decoder presets

extension JSONDecoder {
    /// For Supabase auth/REST envelopes (snake_case wire format).
    /// LedgerState itself uses camelCase keys, which pass through unchanged.
    static let supabase: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

extension JSONEncoder {
    /// Encodes upsert payloads without renaming LedgerState's camelCase keys —
    /// the payload structs already use snake_case property names where needed.
    static let ledgerState: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .useDefaultKeys
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

// MARK: - PKCE helpers

private extension SyncCoordinator {
    static func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    static func generateCodeChallenge(from verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncoded()
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

// MARK: - ASWebAuthenticationSession presentation context

/// Minimal presentationContextProvider that returns the key window.
/// The system calls `presentationAnchor` on the main thread; the class itself is
/// nonisolated so it can satisfy the non-isolated protocol requirement.
private final class PresentationContextProvider: NSObject,
    ASWebAuthenticationPresentationContextProviding, @unchecked Sendable
{
    static let shared = PresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            // keyWindow is deprecated on iOS 15+; search windows directly so we don't
            // fall back to a detached UIWindow() that causes ASWebAuthenticationSession
            // to immediately fire error 1 (canceledLogin) without showing the browser.
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes
                .filter { $0.activationState == .foregroundActive }
                .flatMap { $0.windows }
                .first(where: { $0.isKeyWindow })
                ?? scenes.flatMap { $0.windows }.first
                ?? ASPresentationAnchor()
        }
    }
}
