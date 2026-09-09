// AppleSignInCoordinator.swift
// Drives the Sign in with Apple sheet and hands the resulting
// (idToken, nonce) pair back to SyncCoordinator.
// Nonce is SHA-256 hashed (per Apple's requirement) before being
// sent with the request, while the raw nonce is passed to Supabase.

import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

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
    /// Called when the user dismisses the Apple sheet without signing in.
    var onCancel: (() -> Void)?

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

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Delegate callbacks arrive on the main thread; hop back onto the actor explicitly
        // because the protocol requirement itself is not isolated.
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes
                .filter { $0.activationState == .foregroundActive }
                .flatMap { $0.windows }
                .first(where: { $0.isKeyWindow })
                ?? scenes.flatMap { $0.windows }.first
                ?? ASPresentationAnchor()
        }
    }

    // MARK: - ASAuthorizationControllerDelegate

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        MainActor.assumeIsolated {
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
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        MainActor.assumeIsolated {
            // ASAuthorizationError.canceled is raised when the user taps "Cancel"
            // — a dismissal, not a failure, but the caller still needs to reset its
            // "signing in" spinner.
            if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                onCancel?()
                return
            }
            onFailure?(error)
        }
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
