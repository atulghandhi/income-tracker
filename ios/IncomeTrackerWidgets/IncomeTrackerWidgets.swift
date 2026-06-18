// IncomeTrackerWidgets.swift
// Widget extension entry point.
//
// Provides three widget configurations:
//   • SurplusWidget  — small and medium; monthly surplus + savings rate.
//   • NetWorthWidget — medium; net-worth + 12-point sparkline + next bill.
//   • LockScreenWidget — accessoryInline and accessoryRectangular; surplus on the Lock Screen.
//
// Data is sourced from WidgetDataProvider (App Group UserDefaults) so the
// extension never needs to launch the main app.

import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct IncomeTrackerEntry: TimelineEntry {
    let date: Date
    /// `nil` when no snapshot has ever been written (e.g. fresh install).
    let snapshot: WidgetSnapshot?
}

// MARK: - Timeline Provider

struct IncomeTrackerTimelineProvider: TimelineProvider {
    // Shown while WidgetKit is loading real data — must never be nil.
    func placeholder(in context: Context) -> IncomeTrackerEntry {
        IncomeTrackerEntry(date: .now, snapshot: .placeholder)
    }

    // Fast path for the widget gallery and Today View.
    func getSnapshot(in context: Context, completion: @escaping (IncomeTrackerEntry) -> Void) {
        let snapshot = context.isPreview ? .placeholder : WidgetDataProvider.read()
        completion(IncomeTrackerEntry(date: .now, snapshot: snapshot ?? .placeholder))
    }

    // Called by WidgetKit to build the timeline of entries to display.
    // We emit a single entry and ask to be refreshed in one hour so the
    // widget stays in sync after the user makes changes in the main app
    // (the main app also triggers reloadAllTimelines immediately on save).
    func getTimeline(in context: Context, completion: @escaping (Timeline<IncomeTrackerEntry>) -> Void) {
        let entry = IncomeTrackerEntry(date: .now, snapshot: WidgetDataProvider.read())
        let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: .now) ?? .now
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - WidgetSnapshot placeholder

extension WidgetSnapshot {
    /// Realistic-looking placeholder used in widget previews and while loading.
    static let placeholder = WidgetSnapshot(
        currency: "GBP",
        monthlySurplus: 450,
        monthlyIncome: 3_200,
        monthlyExpenses: 2_750,
        savingsRate: 14.06,
        netWorth: 12_800,
        nextBillName: "Credit card",
        nextBillAmount: 50,
        nextBillDueDay: 15,
        privacyMode: false,
        updatedAt: .now,
        netWorthSparkline: [
            12_000, 12_100, 12_250, 12_400, 12_500, 12_650,
            12_700, 12_750, 12_780, 12_790, 12_800, 12_810,
        ]
    )
}

// MARK: - Small Widget View (systemSmall / systemMedium)

/// Displays the selected month's surplus in large numerals and the savings
/// rate beneath it. When privacy mode is on, values are replaced with bullets.
struct SmallWidgetView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        let snap = entry.snapshot
        let isPrivate = snap?.privacyMode ?? false

        VStack(alignment: .leading, spacing: 4) {
            Text("Monthly surplus")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text(isPrivate
                 ? "•••••"
                 : formatMoney(snap?.monthlySurplus ?? 0, currency: snap?.currency ?? "GBP"))
                .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                .foregroundStyle(surplusColor(snap?.monthlySurplus ?? 0))
                .contentTransition(.numericText())

            Spacer()

            Text(isPrivate
                 ? "•• % saved"
                 : String(format: "%.1f%% saved", snap?.savingsRate ?? 0))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "incometracker://dashboard"))
    }
}

// MARK: - Medium Widget View (systemMedium)

/// Left column: net worth + next upcoming bill.
/// Right column: 12-point sparkline drawn with Canvas.
struct MediumWidgetView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        let snap = entry.snapshot
        let isPrivate = snap?.privacyMode ?? false

        HStack(spacing: 16) {
            // Left column
            VStack(alignment: .leading, spacing: 6) {
                Text("Net worth")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Text(isPrivate
                     ? "•••••"
                     : formatMoney(snap?.netWorth ?? 0, currency: snap?.currency ?? "GBP"))
                    .font(.system(.title3, design: .rounded, weight: .bold).monospacedDigit())
                    .foregroundStyle(netWorthColor(snap?.netWorth ?? 0))

                // Next bill block — only shown when data is available.
                if let billName = snap?.nextBillName,
                   let billAmt = snap?.nextBillAmount,
                   let dueDay = snap?.nextBillDueDay {
                    Spacer()
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Next bill")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(billName)
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                        Text(isPrivate
                             ? "•••• · day \(dueDay)"
                             : "\(formatMoney(billAmt, currency: snap?.currency ?? "GBP")) · day \(dueDay)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Right column — sparkline
            SparklineWidgetView(
                values: snap?.netWorthSparkline ?? [],
                color: netWorthColor(snap?.netWorth ?? 0)
            )
            .frame(width: 80, height: 50)
        }
        .padding(16)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "incometracker://dashboard"))
    }
}

// MARK: - Lock Screen — Inline (accessoryInline)

/// Single line shown on the Lock Screen: an icon + the monthly surplus figure.
struct LockScreenInlineView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        let snap = entry.snapshot
        let isPrivate = snap?.privacyMode ?? false

        Label(
            isPrivate
                ? "Income Tracker"
                : "Surplus \(formatMoney(snap?.monthlySurplus ?? 0, currency: snap?.currency ?? "GBP"))",
            systemImage: "chart.line.uptrend.xyaxis"
        )
    }
}

// MARK: - Lock Screen — Rectangular (accessoryRectangular)

/// Two-line rectangular Lock Screen widget: app name + surplus figure.
struct LockScreenRectangularView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        let snap = entry.snapshot
        let isPrivate = snap?.privacyMode ?? false

        VStack(alignment: .leading, spacing: 2) {
            Text("Income Tracker")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(isPrivate
                 ? "•••••"
                 : formatMoney(snap?.monthlySurplus ?? 0, currency: snap?.currency ?? "GBP"))
                .font(.system(.body, design: .rounded).monospacedDigit().bold())
                .foregroundStyle(surplusColor(snap?.monthlySurplus ?? 0))
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Sparkline (Canvas)

/// Minimal polyline chart sized to whatever frame it is given.
/// Draws a single stroke through all data points; safe with empty or single-point input.
struct SparklineWidgetView: View {
    var values: [Double]
    var color: Color

    var body: some View {
        Canvas { context, size in
            guard values.count > 1 else { return }

            let minVal = values.min() ?? 0
            let maxVal = values.max() ?? 1
            let range = maxVal - minVal
            let step = size.width / Double(values.count - 1)

            var path = Path()
            for (i, value) in values.enumerated() {
                let x = Double(i) * step
                // When all values are equal range == 0; centre the line vertically.
                let y = range > 0
                    ? size.height * (1.0 - (value - minVal) / range)
                    : size.height / 2.0
                if i == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }
            context.stroke(path, with: .color(color), lineWidth: 2)
        }
    }
}

// MARK: - Widget Declarations

@main
struct IncomeTrackerWidgetBundle: WidgetBundle {
    var body: some Widget {
        SurplusWidget()
        NetWorthWidget()
        LockScreenWidget()
    }
}

/// Shows monthly surplus and savings rate.
/// Supports `.systemSmall` and `.systemMedium`.
struct SurplusWidget: Widget {
    let kind = "SurplusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IncomeTrackerTimelineProvider()) { entry in
            SmallWidgetView(entry: entry)
        }
        .configurationDisplayName("Monthly Surplus")
        .description("See this month's income vs expenses at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// Shows net worth, sparkline, and next bill date.
/// Supports `.systemMedium`.
struct NetWorthWidget: Widget {
    let kind = "NetWorthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IncomeTrackerTimelineProvider()) { entry in
            MediumWidgetView(entry: entry)
        }
        .configurationDisplayName("Net Worth")
        .description("Your net worth forecast and next bill due date.")
        .supportedFamilies([.systemMedium])
    }
}

/// Shows surplus on the Lock Screen.
/// Supports `.accessoryInline` and `.accessoryRectangular`.
struct LockScreenWidget: Widget {
    let kind = "LockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IncomeTrackerTimelineProvider()) { entry in
            // SwiftUI picks the correct view based on the widget family at render time.
            LockScreenFamilyView(entry: entry)
        }
        .configurationDisplayName("Income Tracker")
        .description("Surplus on your Lock Screen.")
        .supportedFamilies([.accessoryInline, .accessoryRectangular])
    }
}

/// Dispatches to the correct Lock Screen layout based on the active widget family.
private struct LockScreenFamilyView: View {
    @Environment(\.widgetFamily) private var family
    var entry: IncomeTrackerEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            LockScreenRectangularView(entry: entry)
        default:
            // .accessoryInline (and any future compact families)
            LockScreenInlineView(entry: entry)
        }
    }
}

// MARK: - Shared Helpers

/// Formats a monetary amount using the iOS NumberFormatter with the given
/// ISO 4217 currency code. JPY uses 0 fraction digits; all others use 2.
private func formatMoney(_ amount: Double, currency: String) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = currency
    formatter.maximumFractionDigits = currency == "JPY" ? 0 : 2
    formatter.minimumFractionDigits = currency == "JPY" ? 0 : 2
    return formatter.string(from: NSNumber(value: amount)) ?? "\(amount)"
}

/// Green for non-negative surplus, red for negative.
private func surplusColor(_ surplus: Double) -> Color {
    surplus >= 0 ? .mint : .red
}

/// Green for non-negative net worth, red for net debt position.
private func netWorthColor(_ netWorth: Double) -> Color {
    netWorth >= 0 ? .mint : .red
}
