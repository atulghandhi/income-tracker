// LenientDecoding.swift
// Tolerant JSON decoding helpers so ledger JSON written by any client version
// (web, an older iOS build, a hand-edited backup) loads without throwing.
// Mirrors the intent of normalizeState() in src/App.tsx: a missing or malformed
// field falls back to a sensible default instead of failing the whole decode.

import Foundation

/// Decodes and discards any JSON value — used to step past an unreadable array element.
struct AnyJSONSkip: Decodable {
    init(from decoder: Decoder) throws {}
}

/// String-keyed coding key for dictionaries with arbitrary keys (month keys).
struct DynamicCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }

    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

extension KeyedDecodingContainer {
    /// A finite Double, also accepting integers and numeric strings; `fallback` otherwise.
    func lenientDouble(_ key: Key, default fallback: Double) -> Double {
        lenientOptionalDouble(key) ?? fallback
    }

    func lenientOptionalDouble(_ key: Key) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key), value.isFinite { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return Double(value) }
        if let text = try? decodeIfPresent(String.self, forKey: key),
           let value = Double(text.trimmingCharacters(in: .whitespaces)), value.isFinite { return value }
        return nil
    }

    func lenientInt(_ key: Key, default fallback: Int) -> Int {
        lenientOptionalInt(key) ?? fallback
    }

    func lenientOptionalInt(_ key: Key) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Double.self, forKey: key), value.isFinite,
           abs(value) < 1e15 { return Int(value.rounded()) }
        if let text = try? decodeIfPresent(String.self, forKey: key),
           let value = Int(text.trimmingCharacters(in: .whitespaces)) { return value }
        return nil
    }

    func lenientBool(_ key: Key, default fallback: Bool) -> Bool {
        lenientOptionalBool(key) ?? fallback
    }

    func lenientOptionalBool(_ key: Key) -> Bool? {
        if let value = try? decodeIfPresent(Bool.self, forKey: key) { return value }
        if let value = try? decodeIfPresent(Int.self, forKey: key) { return value != 0 }
        if let text = try? decodeIfPresent(String.self, forKey: key) {
            switch text.lowercased() {
            case "true", "1", "yes": return true
            case "false", "0", "no": return false
            default: return nil
            }
        }
        return nil
    }

    /// A string value, or nil when the key is missing, null, or not a string.
    func lenientString(_ key: Key) -> String? {
        (try? decodeIfPresent(String.self, forKey: key)) ?? nil
    }

    func lenientString(_ key: Key, default fallback: String) -> String {
        lenientString(key) ?? fallback
    }

    /// A non-empty string, or nil.
    func lenientNonEmptyString(_ key: Key) -> String? {
        guard let value = lenientString(key), !value.isEmpty else { return nil }
        return value
    }

    /// Decodes a single nested value; nil if missing or unreadable.
    func lenientValue<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(T.self, forKey: key)) ?? nil
    }

    /// Decodes an array element by element, dropping elements that fail rather than
    /// the whole array. A missing key or a non-array value yields [].
    func lenientArray<T: Decodable>(_ type: T.Type, _ key: Key) -> [T] {
        guard var container = try? nestedUnkeyedContainer(forKey: key) else { return [] }
        var result: [T] = []
        while !container.isAtEnd {
            let index = container.currentIndex
            if (try? container.decodeNil()) == true { continue }
            if let value = try? container.decode(T.self) {
                result.append(value)
            } else {
                _ = try? container.decode(AnyJSONSkip.self)
            }
            // Never spin: if nothing advanced the cursor, stop reading this array.
            if container.currentIndex == index { break }
        }
        return result
    }

    /// Decodes a string-keyed object value by value, dropping unreadable entries.
    func lenientDictionary<T: Decodable>(_ type: T.Type, _ key: Key) -> [String: T] {
        guard let container = try? nestedContainer(keyedBy: DynamicCodingKey.self, forKey: key) else { return [:] }
        var result: [String: T] = [:]
        for nestedKey in container.allKeys {
            if let value = try? container.decode(T.self, forKey: nestedKey) {
                result[nestedKey.stringValue] = value
            }
        }
        return result
    }
}
