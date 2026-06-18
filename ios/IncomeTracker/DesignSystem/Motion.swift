// Motion.swift
// Income Tracker design-system — animation tokens and reduce-motion support.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - Animation tokens

/// Named animation presets for the Income Tracker design system.
public enum Motion {

    /// General-purpose spring — transitions, list inserts/removes.
    static let standard: Animation = .spring(response: 0.42, dampingFraction: 0.82)

    /// Tighter spring for quick UI reactions (toggles, chip selections).
    static let snappy: Animation = .snappy(duration: 0.28, extraBounce: 0.05)

    /// Playful overshot spring — onboarding illustrations, celebrations.
    static let bouncy: Animation = .spring(response: 0.5, dampingFraction: 0.62)

    /// Page-level transition — sheet presentations.
    static let page: Animation = .spring(response: 0.45, dampingFraction: 0.9)

    /// Delay increment (seconds) between staggered list items.
    static let stagger: Double = 0.04

    /// Returns the correct animation based on the current reduce-motion preference.
    /// - Parameters:
    ///   - animation: The full-motion animation to use when not reduced.
    ///   - env: The value of `\.accessibilityReduceMotion` from the environment.
    static func resolve(_ animation: Animation, env: Bool) -> Animation {
        env ? .easeOut(duration: 0.12) : animation
    }
}

// MARK: - View extension

public extension View {
    /// Animates changes to `value` using the given `Animation` preset,
    /// automatically substituting a reduced animation when the user has
    /// enabled Reduce Motion in Accessibility settings.
    ///
    /// Usage:
    /// ```swift
    /// Text(amount)
    ///     .motionAnimation(Motion.standard, value: amount)
    /// ```
    func motionAnimation(_ animation: Animation, value: some Equatable) -> some View {
        modifier(MotionAnimationModifier(animation: animation, value: value))
    }
}

// MARK: - Internal modifier

private struct MotionAnimationModifier<V: Equatable>: ViewModifier {
    let animation: Animation
    let value: V
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content.animation(
            Motion.resolve(animation, env: reduceMotion),
            value: value
        )
    }
}

// MARK: - Transition helpers

public extension AnyTransition {
    /// Slide + fade transition for list rows.
    static func slideIn(edge: Edge = .leading) -> AnyTransition {
        .asymmetric(
            insertion: .move(edge: edge).combined(with: .opacity),
            removal:   .move(edge: edge == .leading ? .trailing : .leading).combined(with: .opacity)
        )
    }

    /// Scale + fade — good for cards appearing on screen.
    static let scaleFade: AnyTransition = .scale(scale: 0.92).combined(with: .opacity)
}
