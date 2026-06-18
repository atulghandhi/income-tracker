// AppleSignInCoordinator.swift
// Drives the Sign in with Apple sheet and hands the resulting
// (idToken, nonce) pair back to SyncCoordinator.
// Nonce is SHA-256 hashed (per Apple's requirement) before being
// sent with the request, while the raw nonce is passed to Supabase.

import AuthenticationServices
import CryptoKit
import Foundation

// MARK: - AppleSignInCoordinator

@MainActor
final class AppleSignInCoordinator: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{

    // MARK: - Callbacks

    /// Called on success with (idToken, rawNonce).
    var onSuccess: ((String, String) -> Void)?
    /// Called on failure with the underlying error.
    var onFailure: ((Error) -> Void)?

    // MARK: - Private state

    private var currentNonce: String = ""

    // MARK: - Public API

    /// Generates a fresh nonce, hashes it, and presents the Apple ID sheet.
    func startSignIn() {
        let nonce = generateNonce()
        currentNonce = nonce

        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    // MARK: - ASAuthorizationControllerPresentationContextProviding

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?
            .keyWindow
            ?? ASPresentationAnchor()
    }

    // MARK: - ASAuthorizationControllerDelegate

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let idToken = String(data: tokenData, encoding: .utf8)
        else {
            onFailure?(AppleSignInError.missingIdentityToken)
            return
        }
        onSuccess?(idToken, currentNonce)
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        // ASAuthorizationError.canceled is raised when the user taps "Cancel"
        // — treat that as a silent dismissal rather than a true error.
        if let authError = error as? ASAuthorizationError,
           authError.code == .canceled
        {
            return
        }
        onFailure?(error)
    }

    // MARK: - Nonce helpers

    /// Generates a cryptographically random 32-byte hex nonce.
    private func generateNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let result = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard result == errSecSuccess else {
            // Fallback to UUID-derived nonce if SecRandom is unavailable.
            return UUID().uuidString.replacingOccurrences(of: "-", with: "")
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// Returns the SHA-256 hash of `input` as a lowercase hex string.
    /// Apple requires the *hashed* nonce in the authorization request while
    /// Supabase needs the *raw* nonce to verify the id_token.
    private func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        let hashed = SHA256.hash(data: data)
        return hashed.compactMap { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - AppleSignInError

enum AppleSignInError: LocalizedError {
    case missingIdentityToken

    var errorDescription: String? {
        switch self {
        case .missingIdentityToken:
            return "Apple did not return an identity token."
        }
    }
}
