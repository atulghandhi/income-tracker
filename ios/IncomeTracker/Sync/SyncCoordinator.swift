// SyncCoordinator.swift
// @MainActor @Observable class that owns all Supabase communication.
// Mirrors the responsibilities of src/supabase.ts using URLSession REST calls
// so the Sync layer does not pull in the full supabase-swift SDK on its own —
// the SDK is available as a package dependency for future migration (see TODOs).
//
// Supabase project: hgzacqveqrccnvjwumkz
// URL + anon key are read from Info.plist at runtime (SUPABASE_URL / SUPABASE_ANON_KEY).
// Set these via an .xcconfig file that is excluded from source control.

import Foundation
import AuthenticationServices

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

    // MARK: - Private Supabase config

    private let supabaseURL: URL
    private let supabaseAnonKey: String

    // MARK: - Keychain constants

    private enum KeychainKey {
        static let service = "com.incometracker.app"
        static let accessToken = "supabase_access_token"
        static let refreshToken = "supabase_refresh_token"
        static let userJSON = "supabase_user"
    }

    // MARK: - ASWebAuthenticationSession (Google OAuth)

    /// Held strongly so the session is not deallocated mid-flow.
    private var webAuthSession: ASWebAuthenticationSession?

    // MARK: - Init

    init() {
        // Read Supabase config from Info.plist.
        // Keys are injected by the xcconfig; they must never be hardcoded here.
        let bundle = Bundle.main
        guard
            let urlString = bundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: urlString),
            let key = bundle.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String
        else {
            // Fallback to the known project URL so the app doesn't crash in
            // development when the xcconfig is not yet set up.
            // TODO: remove this fallback before shipping to production.
            supabaseURL = URL(string: "https://hgzacqveqrccnvjwumkz.supabase.co")!
            supabaseAnonKey = ""
            return
        }
        supabaseURL = url
        supabaseAnonKey = key
    }

    // MARK: - Session management

    /// Restores a previously saved session from the Keychain and verifies it
    /// with Supabase's /auth/v1/user endpoint.  Sets isSignedIn / currentUser
    /// if the token is still valid.
    func restoreSession() async {
        guard
            let token = loadSessionFromKeychain(),
            !token.isEmpty
        else { return }

        do {
            // Verify the stored token by fetching the user record.
            let data = try await supabaseRequest(
                path: "/auth/v1/user",
                method: "GET",
                token: token,
                body: nil
            )
            let decoded = try JSONDecoder.supabase.decode(SupabaseUser.self, from: data)
            currentUser = decoded
            isSignedIn = true
        } catch {
            // Token is expired or invalid — clear it.
            clearKeychain()
        }
    }

    /// Sign in with Apple using the PKCE id_token flow.
    /// The caller (AppleSignInCoordinator) provides the raw id_token and the
    /// hex-encoded SHA-256 nonce used when creating the request.
    func signInWithApple(idToken: String, nonce: String) async throws {
        // POST to Supabase's Apple OIDC endpoint.
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

    /// Opens an ASWebAuthenticationSession pointed at Supabase's Google OAuth
    /// endpoint.  The session redirects to incometracker://auth-callback which
    /// is caught by handleAuthCallback(url:).
    func signInWithGoogle() async throws {
        // Build the OAuth URL.
        var components = URLComponents(
            url: supabaseURL.appendingPathComponent("/auth/v1/authorize"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: "incometracker://auth-callback"),
            URLQueryItem(name: "response_type", value: "code"),
        ]
        guard let authURL = components.url else {
            throw SyncError.badURL
        }

        // Present the web authentication session.
        // TODO: full PKCE code-verifier / code-challenge generation for production.
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
        Task {
            do {
                try await exchangeOAuthCode(from: url)
            } catch {
                // TODO: surface error to UI via a published error state.
                print("[SyncCoordinator] OAuth callback error: \(error)")
            }
        }
    }

    func signOut() async throws {
        if let token = loadSessionFromKeychain() {
            // Best-effort POST to revoke the token server-side.
            _ = try? await supabaseRequest(
                path: "/auth/v1/logout",
                method: "POST",
                token: token,
                body: nil
            )
        }
        clearKeychain()
        currentUser = nil
        isSignedIn = false
        lastSyncedAt = nil
    }

    // MARK: - Data sync (mirrors src/supabase.ts)

    /// Fetches the stored `LedgerState` JSON blob for the current user.
    /// Returns nil when no row exists yet (first-time user).
    func loadCloudState() async throws -> LedgerState? {
        guard let token = loadSessionFromKeychain() else {
            throw SyncError.notSignedIn
        }

        let data = try await supabaseRequest(
            path: "/rest/v1/ledgerlite_states?select=state&limit=1",
            method: "GET",
            token: token,
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
        guard let token = loadSessionFromKeychain() else {
            throw SyncError.notSignedIn
        }

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
            updated_at: ISO8601DateFormatter().string(from: .now)
        )
        let body = try JSONEncoder.supabase.encode(payload)

        var request = try buildRequest(
            path: "/rest/v1/ledgerlite_states",
            method: "POST",
            token: token,
            body: body
        )
        // Supabase upsert header.
        request.setValue(
            "resolution=merge-duplicates,return=minimal",
            forHTTPHeaderField: "Prefer"
        )
        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
        lastSyncedAt = .now
    }

    /// Upserts the user's profile row in ledgerlite_profiles.
    func upsertUserProfile(user: SupabaseUser) async throws {
        guard let token = loadSessionFromKeychain() else {
            throw SyncError.notSignedIn
        }

        struct ProfilePayload: Encodable {
            let id: String
            let email: String?
            let updated_at: String
        }
        let payload = ProfilePayload(
            id: user.id,
            email: user.email,
            updated_at: ISO8601DateFormatter().string(from: .now)
        )
        let body = try JSONEncoder.supabase.encode(payload)

        var request = try buildRequest(
            path: "/rest/v1/ledgerlite_profiles",
            method: "POST",
            token: token,
            body: body
        )
        request.setValue(
            "resolution=merge-duplicates,return=minimal",
            forHTTPHeaderField: "Prefer"
        )
        let (_, response) = try await URLSession.shared.data(for: request)
        try validateHTTPResponse(response)
    }

    // MARK: - Internal REST helper (used by extensions in other files)

    /// Builds and fires a Supabase REST/Auth request from any file in the module.
    /// Identical contract to the private `supabaseRequest` but with internal visibility.
    @discardableResult
    func restRequest(
        path: String,
        method: String,
        token: String?,
        body: Data?,
        extraHeaders: [String: String] = [:]
    ) async throws -> Data {
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
        for (key, value) in extraHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { return data }
        guard (200...299).contains(http.statusCode) else {
            throw SyncError.httpError(statusCode: http.statusCode)
        }
        return data
    }

    // MARK: - Keychain helpers (private)

    private func saveSessionToKeychain(_ token: String) {
        guard let data = token.data(using: .utf8) else { return }
        try? KeychainHelper.save(
            data,
            service: KeychainKey.service,
            account: KeychainKey.accessToken
        )
    }

    private func loadSessionFromKeychain() -> String? {
        try? KeychainHelper.loadString(
            service: KeychainKey.service,
            account: KeychainKey.accessToken
        )
    }

    private func clearKeychain() {
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.accessToken)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.refreshToken)
        try? KeychainHelper.delete(service: KeychainKey.service, account: KeychainKey.userJSON)
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
        try validateHTTPResponse(response)
        return data
    }

    /// Validates that the HTTP response carries a 2xx status code.
    private func validateHTTPResponse(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200...299).contains(http.statusCode) else {
            throw SyncError.httpError(statusCode: http.statusCode)
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
            // TODO: send the stored PKCE code_verifier with this request for full PKCE.
            let body: [String: String] = [
                "auth_code": code,
                "redirect_uri": "incometracker://auth-callback",
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
                saveSessionToKeychain(token)
                if let refreshToken = pairs["refresh_token"] {
                    try? KeychainHelper.save(
                        refreshToken,
                        service: KeychainKey.service,
                        account: KeychainKey.refreshToken
                    )
                }
                // Fetch the user profile with the new token.
                let userData = try await supabaseRequest(
                    path: "/auth/v1/user",
                    method: "GET",
                    token: token,
                    body: nil
                )
                let user = try JSONDecoder.supabase.decode(SupabaseUser.self, from: userData)
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
            let user: SupabaseUser?
        }
        let response = try JSONDecoder.supabase.decode(AuthResponse.self, from: data)
        saveSessionToKeychain(response.access_token)
        if let refresh = response.refresh_token {
            try? KeychainHelper.save(
                refresh,
                service: KeychainKey.service,
                account: KeychainKey.refreshToken
            )
        }
        if let user = response.user {
            currentUser = user
            isSignedIn = true
            // Persist user JSON for offline reads.
            if let userJSON = try? JSONEncoder.supabase.encode(user) {
                try? KeychainHelper.save(
                    userJSON,
                    service: KeychainKey.service,
                    account: KeychainKey.userJSON
                )
            }
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
    case httpError(statusCode: Int)
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .notSignedIn:           return "Not signed in."
        case .badURL:                return "Invalid Supabase URL."
        case .missingCallbackURL:    return "OAuth callback did not return a URL."
        case .httpError(let code):   return "Server returned HTTP \(code)."
        case .decodingFailed:        return "Could not decode server response."
        }
    }
}

// MARK: - JSON encoder/decoder presets

private extension JSONDecoder {
    static let supabase: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}

private extension JSONEncoder {
    static let supabase: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

// MARK: - ASWebAuthenticationSession presentation context

/// Minimal presentationContextProvider that returns the key window.
private final class PresentationContextProvider: NSObject,
    ASWebAuthenticationPresentationContextProviding
{
    static let shared = PresentationContextProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // Returns the first connected window scene's key window.
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?
            .keyWindow
            ?? ASPresentationAnchor()
    }
}
