// Haptics.swift
// Income Tracker design-system — haptic feedback helpers.
// Swift 6 / iOS 17+
//
// Uses only UIKit (no SwiftUI dependency) so it can be called from
// view-models and action handlers without a View context.

import UIKit

// MARK: - Haptics

/// Central haptic-feedback coordinator with pre-warmed generators.
/// Call `Haptics.prepare()` on app launch (or before a likely interaction)
/// so the first feedback fires without latency.
public enum Haptics {

    // ── Pre-warmed generators ─────────────────────────────────────────────────

    private static let selectionGenerator: UISelectionFeedbackGenerator = {
        let g = UISelectionFeedbackGenerator()
        g.prepare()
        return g
    }()

    private static let lightImpact: UIImpactFeedbackGenerator = {
        let g = UIImpactFeedbackGenerator(style: .light)
        g.prepare()
        return g
    }()

    private static let mediumImpact: UIImpactFeedbackGenerator = {
        let g = UIImpactFeedbackGenerator(style: .medium)
        g.prepare()
        return g
    }()

    private static let rigidImpact: UIImpactFeedbackGenerator = {
        let g = UIImpactFeedbackGenerator(style: .rigid)
        g.prepare()
        return g
    }()

    private static let softImpact: UIImpactFeedbackGenerator = {
        let g = UIImpactFeedbackGenerator(style: .soft)
        g.prepare()
        return g
    }()

    private static let notificationGenerator: UINotificationFeedbackGenerator = {
        let g = UINotificationFeedbackGenerator()
        g.prepare()
        return g
    }()

    // ── Public API ────────────────────────────────────────────────────────────

    /// Light tick — chip selections, tab changes, toggle state flips.
    public static func selection() {
        selectionGenerator.selectionChanged()
        selectionGenerator.prepare()
    }

    /// Impact feedback at the given intensity level.
    /// - Parameter style: `.light` (default), `.medium`, `.rigid`, or `.soft`.
    public static func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        switch style {
        case .light:
            lightImpact.impactOccurred()
            lightImpact.prepare()
        case .medium:
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
        case .rigid:
            rigidImpact.impactOccurred()
            rigidImpact.prepare()
        case .soft:
            softImpact.impactOccurred()
            softImpact.prepare()
        case .heavy:
            // No dedicated heavy generator per spec; fall through to medium.
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
        @unknown default:
            mediumImpact.impactOccurred()
            mediumImpact.prepare()
        }
    }

    /// Notification feedback for success, warning, or error events.
    /// - Parameter type: `.success`, `.warning`, or `.error`.
    public static func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        notificationGenerator.notificationOccurred(type)
        notificationGenerator.prepare()
    }

    /// Pre-warms all generators.  Call early in the app lifecycle
    /// (e.g. `@main` init or the first `onAppear` of the root view).
    public static func prepare() {
        selectionGenerator.prepare()
        lightImpact.prepare()
        mediumImpact.prepare()
        rigidImpact.prepare()
        softImpact.prepare()
        notificationGenerator.prepare()
    }

    // ── Semantic convenience wrappers ─────────────────────────────────────────

    /// Called when a value is saved or a goal is completed — success thud.
    public static func confirmSave() {
        notification(.success)
    }

    /// Called when an action is destructive (delete, clear) — error rattle.
    public static func destructiveAction() {
        notification(.error)
    }

    /// Called when the user pulls-to-refresh or drags a slider — soft tick.
    public static func drag() {
        impact(.soft)
    }

    /// Called on row tap in a list — light click.
    public static func rowTap() {
        impact(.light)
    }
}
