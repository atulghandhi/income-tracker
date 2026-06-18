// KeychainHelper.swift
// Thin wrapper around the Security framework for storing/retrieving
// small blobs (tokens, serialized user JSON) in the iOS Keychain.
// Uses kSecClassGenericPassword with service + account as the primary key.

import Foundation
import Security

// MARK: - KeychainError

enum KeychainError: LocalizedError {
    case itemNotFound
    case unexpectedData
    case unhandledError(status: OSStatus)
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .itemNotFound:              return "Keychain item not found."
        case .unexpectedData:            return "Keychain returned unexpected data."
        case .unhandledError(let s):     return "Keychain OSStatus \(s)."
        case .encodingFailed:            return "String/Data encoding failed."
        }
    }
}

// MARK: - KeychainHelper

enum KeychainHelper {

    // MARK: - Data API

    /// Saves `data` to the Keychain for the given service + account pair.
    /// If an entry already exists it is updated; otherwise a new item is created.
    static func save(_ data: Data, service: String, account: String) throws {
        let query: [CFString: Any] = [
            kSecClass:            kSecClassGenericPassword,
            kSecAttrService:      service,
            kSecAttrAccount:      account,
        ]
        // Try to update an existing item first.
        let attributes: [CFString: Any] = [kSecValueData: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

        switch updateStatus {
        case errSecSuccess:
            return
        case errSecItemNotFound:
            // Item doesn't exist yet — add it.
            var addQuery = query
            addQuery[kSecValueData]             = data
            addQuery[kSecAttrAccessible]        = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw KeychainError.unhandledError(status: addStatus)
            }
        default:
            throw KeychainError.unhandledError(status: updateStatus)
        }
    }

    /// Loads raw `Data` from the Keychain for the given service + account pair.
    static func load(service: String, account: String) throws -> Data {
        let query: [CFString: Any] = [
            kSecClass:            kSecClassGenericPassword,
            kSecAttrService:      service,
            kSecAttrAccount:      account,
            kSecReturnData:       true,
            kSecMatchLimit:       kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data else {
                throw KeychainError.unexpectedData
            }
            return data
        case errSecItemNotFound:
            throw KeychainError.itemNotFound
        default:
            throw KeychainError.unhandledError(status: status)
        }
    }

    /// Deletes the Keychain item for the given service + account pair.
    /// Silently succeeds if the item does not exist.
    static func delete(service: String, account: String) throws {
        let query: [CFString: Any] = [
            kSecClass:        kSecClassGenericPassword,
            kSecAttrService:  service,
            kSecAttrAccount:  account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unhandledError(status: status)
        }
    }

    // MARK: - String convenience API

    /// Encodes `string` as UTF-8 and saves it to the Keychain.
    static func save(_ string: String, service: String, account: String) throws {
        guard let data = string.data(using: .utf8) else {
            throw KeychainError.encodingFailed
        }
        try save(data, service: service, account: account)
    }

    /// Loads a Keychain item and decodes it as a UTF-8 string.
    static func loadString(service: String, account: String) throws -> String {
        let data = try load(service: service, account: account)
        guard let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.unexpectedData
        }
        return string
    }
}
