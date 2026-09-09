// Tokens.swift
// Income Tracker design-system — spacing, radius and elevation scale.
// Swift 6 / iOS 17+
//
// Screens should reach for these instead of ad-hoc point values so cards, rows
// and sheets line up with each other (and with the web app's 4pt rhythm).

import SwiftUI

public enum Spacing {
    /// 4pt — icon-to-label gaps, tight stacks.
    public static let xs: CGFloat = 4
    /// 8pt — within a row.
    public static let sm: CGFloat = 8
    /// 12pt — between related rows.
    public static let md: CGFloat = 12
    /// 16pt — card padding, screen gutters.
    public static let lg: CGFloat = 16
    /// 24pt — between sections.
    public static let xl: CGFloat = 24
    /// 32pt — hero breathing room.
    public static let xxl: CGFloat = 32
}

public enum Radius {
    /// 10pt — chips, small controls.
    public static let sm: CGFloat = 10
    /// 14pt — rows, input fields.
    public static let md: CGFloat = 14
    /// 18pt — cards.
    public static let lg: CGFloat = 18
    /// 24pt — sheets, hero panels.
    public static let xl: CGFloat = 24
}

public enum Elevation {
    /// Card shadow: soft, low, never black-on-dark.
    public static let cardShadowRadius: CGFloat = 14
    public static let cardShadowY: CGFloat = 6
    public static let cardShadowOpacity: Double = 0.07
}
