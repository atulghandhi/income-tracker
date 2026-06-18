// Colors.swift
// Income Tracker design-system — colour tokens and semantic helpers.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - Hex & adaptive initialisers

public extension Color {
    /// Initialise from a CSS-style hex string: "#RRGGBB" or "#RRGGBBAA".
    init(hex: String) {
        var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") { raw.removeFirst() }

        let scanner = Scanner(string: raw)
        var value: UInt64 = 0
        scanner.scanHexInt64(&value)

        let r, g, b, a: Double
        switch raw.count {
        case 6:
            r = Double((value & 0xFF0000) >> 16) / 255
            g = Double((value & 0x00FF00) >> 8)  / 255
            b = Double(value  & 0x0000FF)         / 255
            a = 1.0
        case 8:
            r = Double((value & 0xFF000000) >> 24) / 255
            g = Double((value & 0x00FF0000) >> 16) / 255
            b = Double((value & 0x0000FF00) >> 8)  / 255
            a = Double(value  & 0x000000FF)         / 255
        default:
            r = 0; g = 0; b = 0; a = 1
        }
        self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
    }

    /// Adaptive colour that resolves the correct value per colour scheme.
    init(light: Color, dark: Color) {
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(dark)
                : UIColor(light)
        })
    }

    /// Convenience: adaptive colour from hex strings.
    init(lightHex: String, darkHex: String) {
        self.init(light: Color(hex: lightHex), dark: Color(hex: darkHex))
    }
}

// MARK: - Named design-system tokens

public extension Color {

    // ── Backgrounds ──────────────────────────────────────────────────────────

    /// Page / sheet background (outermost layer).
    static var bg: Color {
        Color(light: Color(hex: "#F4F7FB"), dark: Color(hex: "#051424"))
    }

    /// A step deeper than `bg` — used for grouped list backgrounds.
    static var bgDeep: Color {
        Color(light: Color(hex: "#E8EDF5"), dark: Color(hex: "#020D18"))
    }

    // ── Surfaces ─────────────────────────────────────────────────────────────

    /// Default card / surface.
    static var surface: Color {
        Color(light: Color(hex: "#FFFFFF"), dark: Color(hex: "#122131"))
    }

    /// Elevated card — one step above `surface`.
    static var surfaceHigh: Color {
        Color(light: Color(hex: "#F0F4F9"), dark: Color(hex: "#1C2B3C"))
    }

    /// Highest elevation — e.g. popovers and action sheets.
    static var surfaceHigher: Color {
        Color(light: Color(hex: "#E4EBF3"), dark: Color(hex: "#273647"))
    }

    // ── Text / foreground ─────────────────────────────────────────────────────

    /// Primary label — full-contrast body text.
    static var ink: Color {
        Color(light: Color(hex: "#0B1C2E"), dark: Color(hex: "#D4E4FA"))
    }

    /// Secondary label — subdued body text.
    static var muted: Color {
        Color(light: Color(hex: "#5A6B7E"), dark: Color(hex: "#9EA8B7"))
    }

    /// Tertiary label — very faint hints, placeholders.
    static var faint: Color {
        Color(light: Color(hex: "#8A98A8"), dark: Color(hex: "#6F7B8C"))
    }

    // ── Dividers ──────────────────────────────────────────────────────────────

    /// Standard hairline divider.
    static var line: Color {
        Color(light: Color(hex: "#0B1C2E").opacity(0.10), dark: Color(hex: "#C6C6CB").opacity(0.12))
    }

    /// Stronger rule — used under sticky headers.
    static var lineStrong: Color {
        Color(light: Color(hex: "#0B1C2E").opacity(0.20), dark: Color(hex: "#C6C6CB").opacity(0.28))
    }

    // ── Brand palette ─────────────────────────────────────────────────────────

    /// Primary accent — blue.
    static var brandBlue: Color {
        Color(light: Color(hex: "#0A6CEC"), dark: Color(hex: "#3291FF"))
    }

    /// Positive / savings — mint green.
    static var brandMint: Color {
        Color(light: Color(hex: "#00B89E"), dark: Color(hex: "#00DFC1"))
    }

    /// Negative / danger — red.
    static var brandRed: Color {
        Color(light: Color(hex: "#D6453B"), dark: Color(hex: "#FFB4AB"))
    }

    /// Caution / warning — amber.
    static var brandAmber: Color {
        Color(light: Color(hex: "#C8941F"), dark: Color(hex: "#F4C36A"))
    }

    // ── Soft tints ────────────────────────────────────────────────────────────

    /// Mint soft tint for backgrounds behind positive values.
    static var mintSoft: Color {
        Color.brandMint.opacity(0.14)
    }

    /// Blue soft tint for informational backgrounds.
    static var blueSoft: Color {
        Color.brandBlue.opacity(0.15)
    }

    /// Red soft tint for negative / alert backgrounds.
    static var redSoft: Color {
        Color.brandRed.opacity(0.12)
    }

    /// Amber soft tint for warning backgrounds.
    static var amberSoft: Color {
        Color.brandAmber.opacity(0.13)
    }

    // ── Semantic helpers ──────────────────────────────────────────────────────

    /// Returns the brand colour that corresponds to a `FinancialSignalTone`.
    static func tone(_ t: FinancialSignalTone) -> Color {
        switch t {
        case .good:    return .brandMint
        case .info:    return .brandBlue
        case .warning: return .brandAmber
        case .danger:  return .brandRed
        }
    }

    /// Soft (low-saturation fill) version of a `FinancialSignalTone` colour.
    static func toneSoft(_ t: FinancialSignalTone) -> Color {
        switch t {
        case .good:    return .mintSoft
        case .info:    return .blueSoft
        case .warning: return .amberSoft
        case .danger:  return .redSoft
        }
    }

    /// Returns the semantic colour for a savings `GoalStatus`.
    static func goalStatusColor(_ s: GoalStatus) -> Color {
        switch s {
        case .complete:   return .brandMint
        case .onTrack:    return .brandMint
        case .tight:      return .brandAmber
        case .atRisk:     return .brandRed
        case .noDeadline: return .brandBlue
        }
    }
}
