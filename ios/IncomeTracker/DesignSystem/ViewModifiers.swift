// ViewModifiers.swift
// Income Tracker design-system — reusable view modifiers.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - CardModifier

/// Applies the standard card appearance: surface fill, rounded corners,
/// a thin stroke hairline, and a subtle drop shadow.
public struct CardModifier: ViewModifier {

    public var padding: CGFloat
    public var cornerRadius: CGFloat
    public var shadowOpacity: Double

    public init(
        padding: CGFloat = 16,
        cornerRadius: CGFloat = 16,
        shadowOpacity: Double = 0.06
    ) {
        self.padding = padding
        self.cornerRadius = cornerRadius
        self.shadowOpacity = shadowOpacity
    }

    public func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.surface)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Color.lineStrong, lineWidth: 0.5)
            )
            .shadow(color: Color.black.opacity(shadowOpacity), radius: 8, x: 0, y: 2)
    }
}

public extension View {
    /// Applies the standard Income Tracker card style with optional padding override.
    func cardStyle(
        padding: CGFloat = 16,
        cornerRadius: CGFloat = 16,
        shadowOpacity: Double = 0.06
    ) -> some View {
        modifier(CardModifier(padding: padding, cornerRadius: cornerRadius, shadowOpacity: shadowOpacity))
    }
}

// MARK: - ShimmerModifier

/// Animating left-to-right gradient shimmer for loading skeleton states.
public struct ShimmerModifier: ViewModifier {

    public var isActive: Bool
    @State private var phase: CGFloat = -1

    public init(isActive: Bool = true) {
        self.isActive = isActive
    }

    public func body(content: Content) -> some View {
        if isActive {
            content
                .redacted(reason: .placeholder)
                .overlay(
                    GeometryReader { proxy in
                        LinearGradient(
                            gradient: Gradient(stops: [
                                .init(color: .clear,                    location: 0.0),
                                .init(color: Color.white.opacity(0.55), location: 0.4),
                                .init(color: Color.white.opacity(0.55), location: 0.6),
                                .init(color: .clear,                    location: 1.0),
                            ]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: proxy.size.width * 2)
                        .offset(x: phase * proxy.size.width * 2)
                    }
                    .clipped()
                )
                .onAppear {
                    withAnimation(
                        .linear(duration: 1.4).repeatForever(autoreverses: false)
                    ) {
                        phase = 1
                    }
                }
        } else {
            content
        }
    }
}

public extension View {
    /// Overlays an animated shimmer gradient. Pass `isActive: false` to show real content.
    func shimmer(isActive: Bool = true) -> some View {
        modifier(ShimmerModifier(isActive: isActive))
    }
}

// MARK: - PrivacyBlurModifier

/// Blurs the view when the app's privacy mode is enabled.
public struct PrivacyBlurModifier: ViewModifier {

    public var isPrivate: Bool
    public var radius: CGFloat

    public init(isPrivate: Bool, radius: CGFloat = 8) {
        self.isPrivate = isPrivate
        self.radius = radius
    }

    public func body(content: Content) -> some View {
        content
            .blur(radius: isPrivate ? radius : 0)
            .allowsHitTesting(!isPrivate)
            .animation(.easeInOut(duration: 0.2), value: isPrivate)
    }
}

public extension View {
    /// Blurs the view when `isPrivate` is true.
    func privacyBlurred(_ isPrivate: Bool, radius: CGFloat = 8) -> some View {
        modifier(PrivacyBlurModifier(isPrivate: isPrivate, radius: radius))
    }

    /// Named-parameter overload for call-sites that prefer explicit labelling.
    func privacyBlurred(isBlurred: Bool, radius: CGFloat = 8) -> some View {
        modifier(PrivacyBlurModifier(isPrivate: isBlurred, radius: radius))
    }
}

// MARK: - PressScaleModifier

/// Scales the view down slightly when pressed — provides tactile press feedback.
public struct PressScaleModifier: ViewModifier {

    public var scale: CGFloat
    @GestureState private var isPressed: Bool = false

    public init(scale: CGFloat = 0.96) {
        self.scale = scale
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed ? scale : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .updating($isPressed) { _, state, _ in state = true }
            )
    }
}

public extension View {
    /// Adds a subtle press-scale effect on tap.
    func pressScale(_ scale: CGFloat = 0.96) -> some View {
        modifier(PressScaleModifier(scale: scale))
    }
}

// MARK: - ConditionalModifier

public extension View {
    /// Applies the modifier returned by `transform` only when `condition` is true.
    @ViewBuilder
    func `if`<Content: View>(
        _ condition: Bool,
        transform: (Self) -> Content
    ) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
