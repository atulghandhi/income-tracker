// Typography.swift
// Income Tracker design-system — font tokens.
// Swift 6 / iOS 17+

import SwiftUI

public extension Font {

    // ── Hero metric display ───────────────────────────────────────────────────

    /// Large numeric value shown in a dashboard metric card (e.g. "£12,450").
    /// Rounded design + monospacedDigit so digits don't shift width.
    static var metricValue: Font {
        Font.system(.title, design: .rounded).monospacedDigit()
    }

    /// Small label beneath a metric value (e.g. "Total income").
    static var metricLabel: Font {
        .subheadline
    }

    // ── Card typography ───────────────────────────────────────────────────────

    /// Title displayed at the top of a card component.
    static var cardTitle: Font {
        .headline
    }

    // ── Money amounts ─────────────────────────────────────────────────────────

    /// Largest monetary figure — hero totals, net-worth headline.
    static var moneyLarge: Font {
        Font.system(.largeTitle, design: .rounded, weight: .bold).monospacedDigit()
    }

    /// Mid-size monetary amount — row values, secondary metrics.
    static var moneyMedium: Font {
        Font.system(.title2, design: .rounded, weight: .semibold).monospacedDigit()
    }

    /// Small monetary amount — list row subtitles, mini badges.
    static var moneySmall: Font {
        Font.system(.body, design: .rounded, weight: .medium).monospacedDigit()
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    /// Captions and footnotes.
    static var caption: Font {
        .caption
    }

    /// Eyebrow / all-caps section label with monospaced digits.
    static var eyebrow: Font {
        Font.caption2.monospacedDigit()
    }
}

// MARK: - View modifier convenience

public extension View {
    /// Applies `metricValue` font with the given foreground colour.
    func metricValueStyle(color: Color = .ink) -> some View {
        self.font(.metricValue).foregroundStyle(color)
    }

    /// Applies `metricLabel` font with `muted` foreground colour.
    func metricLabelStyle() -> some View {
        self.font(.metricLabel).foregroundStyle(Color.muted)
    }

    /// Applies `eyebrow` font in all-caps with `muted` foreground.
    func eyebrowStyle() -> some View {
        self.font(.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(Color.muted)
            .kerning(0.5)
    }
}
