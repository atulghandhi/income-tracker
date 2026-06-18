// Components.swift
// Income Tracker design-system — reusable SwiftUI components.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - Card

/// Generic padded rounded container — the iOS equivalent of the web `Panel`.
public struct Card<Content: View>: View {

    public var padding: CGFloat
    public var cornerRadius: CGFloat
    private let content: Content

    public init(
        padding: CGFloat = 16,
        cornerRadius: CGFloat = 16,
        @ViewBuilder content: () -> Content
    ) {
        self.padding = padding
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    public var body: some View {
        content
            .padding(padding)
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Color.lineStrong, lineWidth: 0.5)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 2)
    }
}

// MARK: - MetricCard

/// Dashboard tile: eyebrow label + large numeric value with optional tone and privacy masking.
public struct MetricCard: View {

    public var label: String
    /// Pre-formatted currency or percentage string.
    public var value: String
    public var tone: Color
    public var isPrivate: Bool

    public init(
        label: String,
        value: String,
        tone: Color = .ink,
        isPrivate: Bool = false
    ) {
        self.label = label
        self.value = value
        self.tone = tone
        self.isPrivate = isPrivate
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.metricLabel)
                .foregroundStyle(Color.muted)

            Group {
                if isPrivate {
                    Text("•••••")
                        .font(.metricValue)
                        .foregroundStyle(Color.faint)
                } else {
                    Text(value)
                        .font(.metricValue)
                        .foregroundStyle(tone)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.lineStrong, lineWidth: 0.5)
        )
        .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 2)
    }
}

// MARK: - MoneyText

/// Formats a `Double` with the given `CurrencyCode` using monospaced digits.
public struct MoneyText: View {

    public var amount: Double
    public var currency: CurrencyCode
    public var font: Font
    public var color: Color
    public var isPrivate: Bool

    public init(
        amount: Double,
        currency: CurrencyCode = .gbp,
        font: Font = .moneySmall,
        color: Color = .ink,
        isPrivate: Bool = false
    ) {
        self.amount = amount
        self.currency = currency
        self.font = font
        self.color = color
        self.isPrivate = isPrivate
    }

    private var formatted: String {
        Self.formatter(for: currency).string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    private static func formatter(for code: CurrencyCode) -> NumberFormatter {
        let option = CURRENCY_OPTIONS.first { $0.code == code }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.locale = Locale(identifier: option?.locale ?? "en-GB")
        fmt.minimumFractionDigits = 2
        fmt.maximumFractionDigits = 2
        return fmt
    }

    public var body: some View {
        Group {
            if isPrivate {
                Text("•••••")
                    .foregroundStyle(Color.faint)
            } else {
                Text(formatted)
                    .foregroundStyle(color)
            }
        }
        .font(font)
    }
}

// MARK: - AnimatedMoneyText

/// MoneyText that animates the value change with `.contentTransition(.numericText(value:))`.
public struct AnimatedMoneyText: View {

    public var amount: Double
    public var currency: CurrencyCode
    public var font: Font
    public var color: Color
    public var isPrivate: Bool

    public init(
        amount: Double,
        currency: CurrencyCode = .gbp,
        font: Font = .moneyMedium,
        color: Color = .ink,
        isPrivate: Bool = false
    ) {
        self.amount = amount
        self.currency = currency
        self.font = font
        self.color = color
        self.isPrivate = isPrivate
    }

    private var formatted: String {
        Self.formatter(for: currency).string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    private static func formatter(for code: CurrencyCode) -> NumberFormatter {
        let option = CURRENCY_OPTIONS.first { $0.code == code }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.locale = Locale(identifier: option?.locale ?? "en-GB")
        fmt.minimumFractionDigits = 2
        fmt.maximumFractionDigits = 2
        return fmt
    }

    public var body: some View {
        Group {
            if isPrivate {
                Text("•••••")
                    .foregroundStyle(Color.faint)
            } else {
                Text(formatted)
                    .foregroundStyle(color)
                    .contentTransition(.numericText(value: amount))
                    .animation(Motion.standard, value: amount)
            }
        }
        .font(font)
    }
}

// MARK: - StatusPill

/// Small pill showing the current sync state of the ledger.
public struct StatusPill: View {

    public enum State: Equatable {
        case loading
        case saving
        case saved
        case offline
    }

    public var state: State

    @SwiftUI.State private var visible: Bool = true
    @SwiftUI.State private var hideTask: Task<Void, Never>?

    public init(state: State) {
        self.state = state
    }

    private var label: String {
        switch state {
        case .loading:  return "Loading…"
        case .saving:   return "Saving…"
        case .saved:    return "Saved"
        case .offline:  return "Offline"
        }
    }

    private var iconName: String {
        switch state {
        case .loading:  return "arrow.triangle.2.circlepath"
        case .saving:   return "arrow.up.circle"
        case .saved:    return "checkmark.circle.fill"
        case .offline:  return "wifi.slash"
        }
    }

    private var pillColor: Color {
        switch state {
        case .loading:  return .brandBlue
        case .saving:   return .brandAmber
        case .saved:    return .brandMint
        case .offline:  return .brandRed
        }
    }

    public var body: some View {
        if visible {
            HStack(spacing: 4) {
                Image(systemName: iconName)
                    .font(.system(size: 11, weight: .semibold))
                Text(label)
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(pillColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(pillColor.opacity(0.15), in: Capsule())
            .transition(.opacity.combined(with: .scale(scale: 0.9)))
            .onChange(of: state) { _, newState in
                hideTask?.cancel()
                visible = true
                if newState == .saved {
                    hideTask = Task {
                        try? await Task.sleep(for: .seconds(2))
                        guard !Task.isCancelled else { return }
                        withAnimation(Motion.snappy) {
                            visible = false
                        }
                    }
                }
            }
        }
    }
}

// MARK: - PrivacyBlur

/// Wraps content and applies a blur overlay when `isPrivate` is true.
public struct PrivacyBlur<Content: View>: View {

    public var isPrivate: Bool
    private let content: Content

    public init(
        isPrivate: Bool,
        @ViewBuilder content: () -> Content
    ) {
        self.isPrivate = isPrivate
        self.content = content()
    }

    public var body: some View {
        content
            .blur(radius: isPrivate ? 8 : 0)
            .allowsHitTesting(!isPrivate)
            .animation(.easeInOut(duration: 0.2), value: isPrivate)
    }
}

// MARK: - EmptyStateView

/// Full-width empty state with system image, title, subtitle, and optional action.
public struct EmptyStateView: View {

    public var title: String
    public var subtitle: String
    public var systemImage: String
    public var actionLabel: String?
    public var action: (() -> Void)?

    public init(
        title: String,
        subtitle: String,
        systemImage: String = "tray",
        actionLabel: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.actionLabel = actionLabel
        self.action = action
    }

    public var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text(subtitle)
        } actions: {
            if let label = actionLabel, let action {
                Button(label, action: action)
                    .buttonStyle(.bordered)
                    .tint(.brandBlue)
            }
        }
    }
}

// MARK: - ColorDot

/// Small filled circle for category / series indicators.
public struct ColorDot: View {

    public var hex: String
    public var size: CGFloat

    public init(hex: String, size: CGFloat = 8) {
        self.hex = hex
        self.size = size
    }

    public var body: some View {
        Circle()
            .fill(Color(hex: hex))
            .frame(width: size, height: size)
    }
}

// MARK: - TonePill

/// Small status badge coloured by a `FinancialSignalTone` or a custom `Color`.
public struct TonePill: View {

    public var label: String
    public var color: Color

    public init(label: String, color: Color) {
        self.label = label
        self.color = color
    }

    public var body: some View {
        Text(label)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
    }
}

// MARK: - SectionHeader

/// Styled list section header with optional trailing total and collapse toggle.
public struct SectionHeader: View {

    public var title: String
    public var total: String?
    public var color: Color?
    public var isCollapsed: Bool
    public var onToggle: (() -> Void)?

    public init(
        title: String,
        total: String? = nil,
        color: Color? = nil,
        isCollapsed: Bool = false,
        onToggle: (() -> Void)? = nil
    ) {
        self.title = title
        self.total = total
        self.color = color
        self.isCollapsed = isCollapsed
        self.onToggle = onToggle
    }

    public var body: some View {
        Button {
            onToggle?()
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if let c = color {
                    Circle()
                        .fill(c)
                        .frame(width: 7, height: 7)
                        .offset(y: -1)
                }

                Text(title)
                    .font(.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(Color.muted)
                    .kerning(0.5)

                Spacer()

                if let total {
                    Text(total)
                        .font(.eyebrow)
                        .foregroundStyle(Color.muted)
                        .monospacedDigit()
                }

                if onToggle != nil {
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.faint)
                        .animation(Motion.snappy, value: isCollapsed)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(onToggle == nil)
    }
}
