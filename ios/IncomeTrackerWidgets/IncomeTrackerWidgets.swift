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
    func placeholder(in context: Context) -> IncomeTrackerEntry {
        IncomeTrackerEntry(date: .now, snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (IncomeTrackerEntry) -> Void) {
        let snapshot = context.isPreview ? .placeholder : WidgetDataProvider.read()
        completion(IncomeTrackerEntry(date: .now, snapshot: snapshot ?? .placeholder))
    }

    // One entry, refreshed hourly; the app also reloads timelines on every save.
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

// MARK: - Palette (mirrors the app's Colors.swift; this target cannot import it)

enum WidgetPalette {
    static let mint = Color(light: "#00B89E", dark: "#00DFC1")
    static let red = Color(light: "#D6453B", dark: "#FFB4AB")
    static let blue = Color(light: "#0A6CEC", dark: "#3291FF")
}

private extension Color {
    init(light: String, dark: String) {
        self.init(uiColor: UIColor { traits in
            UIColor(Color(hexString: traits.userInterfaceStyle == .dark ? dark : light))
        })
    }

    init(hexString: String) {
        var raw = hexString
        if raw.hasPrefix("#") { raw.removeFirst() }
        var value: UInt64 = 0
        Scanner(string: raw).scanHexInt64(&value)
        let r = Double((value & 0xFF0000) >> 16) / 255
        let g = Double((value & 0x00FF00) >> 8) / 255
        let b = Double(value & 0x0000FF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

// MARK: - Empty state

/// Shown when the app has never written a snapshot (fresh install, or the app was
/// deleted and reinstalled) instead of a misleading £0.00.
struct NoDataWidgetView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "list.bullet.rectangle")
                .font(.title3)
                .foregroundStyle(WidgetPalette.blue)
            Text("Open Income Tracker")
                .font(.headline)
            Text("Log a spend and this fills in.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "incometracker://log"))
    }
}

// MARK: - Surplus widget views

/// Small: surplus + savings rate. Medium: adds income vs outgoings.
struct SurplusWidgetView: View {
    var entry: IncomeTrackerEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let snap = entry.snapshot {
            let isPrivate = snap.privacyMode
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Left this month")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Text(isPrivate ? "•••••" : formatMoney(snap.monthlySurplus, currency: snap.currency))
                        .font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                        .foregroundStyle(surplusColor(snap.monthlySurplus))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                        .contentTransition(.numericText())

                    Spacer(minLength: 0)

                    Text(isPrivate ? "•• % saved" : String(format: "%.0f%% saved", snap.savingsRate))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if family == .systemMedium {
                    VStack(alignment: .leading, spacing: 8) {
                        pair(label: "In", amount: snap.monthlyIncome, currency: snap.currency, color: WidgetPalette.mint, isPrivate: isPrivate)
                        pair(label: "Out", amount: snap.monthlyExpenses, currency: snap.currency, color: WidgetPalette.red, isPrivate: isPrivate)
                        Spacer(minLength: 0)
                        Link(destination: URL(string: "incometracker://log")!) {
                            Label("Log a spend", systemImage: "plus.circle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(WidgetPalette.blue)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .containerBackground(.fill.tertiary, for: .widget)
            .widgetURL(URL(string: "incometracker://dashboard"))
        } else {
            NoDataWidgetView()
        }
    }

    @ViewBuilder
    private func pair(label: String, amount: Double, currency: String, color: Color, isPrivate: Bool) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(isPrivate ? "•••••" : formatMoney(amount, currency: currency))
                .font(.system(.footnote, design: .rounded, weight: .semibold).monospacedDigit())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Net worth widget view (systemMedium)

struct NetWorthWidgetView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        if let snap = entry.snapshot {
            let isPrivate = snap.privacyMode
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Net worth")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Text(isPrivate ? "•••••" : formatMoney(snap.netWorth, currency: snap.currency))
                        .font(.system(.title3, design: .rounded, weight: .bold).monospacedDigit())
                        .foregroundStyle(netWorthColor(snap.netWorth))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)

                    if let billName = snap.nextBillName,
                       let billAmt = snap.nextBillAmount,
                       let dueDay = snap.nextBillDueDay {
                        Spacer(minLength: 0)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Next bill")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text(billName)
                                .font(.caption.weight(.medium))
                                .lineLimit(1)
                            Text(isPrivate
                                 ? "•••• · day \(dueDay)"
                                 : "\(formatMoney(billAmt, currency: snap.currency)) · day \(dueDay)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: 4) {
                    SparklineWidgetView(
                        values: isPrivate ? [] : snap.netWorthSparkline,
                        color: netWorthColor(snap.netWorth)
                    )
                    .frame(width: 84, height: 44)
                    Text("12-month outlook")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .containerBackground(.fill.tertiary, for: .widget)
            .widgetURL(URL(string: "incometracker://accounts"))
        } else {
            NoDataWidgetView()
        }
    }
}

// MARK: - Lock Screen — Inline (accessoryInline)

struct LockScreenInlineView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        let snap = entry.snapshot
        let isPrivate = snap?.privacyMode ?? false

        Label(
            snap == nil || isPrivate
                ? "Income Tracker"
                : "Left \(formatMoney(snap?.monthlySurplus ?? 0, currency: snap?.currency ?? "GBP"))",
            systemImage: "chart.line.uptrend.xyaxis"
        )
        .widgetURL(URL(string: "incometracker://ledger"))
    }
}

// MARK: - Lock Screen — Rectangular (accessoryRectangular)

struct LockScreenRectangularView: View {
    var entry: IncomeTrackerEntry

    var body: some View {
        let snap = entry.snapshot
        let isPrivate = snap?.privacyMode ?? false

        VStack(alignment: .leading, spacing: 2) {
            Text("Left this month")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(snap == nil ? "Open the app" : (isPrivate ? "•••••" : formatMoney(snap?.monthlySurplus ?? 0, currency: snap?.currency ?? "GBP")))
                .font(.system(.body, design: .rounded).monospacedDigit().bold())
                .foregroundStyle(surplusColor(snap?.monthlySurplus ?? 0))
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "incometracker://ledger"))
    }
}

// MARK: - Sparkline (Canvas)

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

/// Shows what is left this month and the savings rate.
struct SurplusWidget: Widget {
    let kind = "SurplusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IncomeTrackerTimelineProvider()) { entry in
            SurplusWidgetView(entry: entry)
        }
        .configurationDisplayName("Left this month")
        .description("This month's surplus at a glance, with a one-tap way to log a spend.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// Shows net worth, sparkline, and next bill date.
struct NetWorthWidget: Widget {
    let kind = "NetWorthWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IncomeTrackerTimelineProvider()) { entry in
            NetWorthWidgetView(entry: entry)
        }
        .configurationDisplayName("Net Worth")
        .description("Your net worth outlook and next bill due date.")
        .supportedFamilies([.systemMedium])
    }
}

/// Shows surplus on the Lock Screen.
struct LockScreenWidget: Widget {
    let kind = "LockScreenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: IncomeTrackerTimelineProvider()) { entry in
            LockScreenFamilyView(entry: entry)
        }
        .configurationDisplayName("Income Tracker")
        .description("What's left this month, on your Lock Screen.")
        .supportedFamilies([.accessoryInline, .accessoryRectangular])
    }
}

private struct LockScreenFamilyView: View {
    @Environment(\.widgetFamily) private var family
    var entry: IncomeTrackerEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            LockScreenRectangularView(entry: entry)
        default:
            LockScreenInlineView(entry: entry)
        }
    }
}

// MARK: - Shared Helpers

/// Formats a monetary amount with the given ISO 4217 currency code.
/// JPY uses 0 fraction digits; all others use 2.
private func formatMoney(_ amount: Double, currency: String) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = currency
    formatter.maximumFractionDigits = currency == "JPY" ? 0 : 2
    formatter.minimumFractionDigits = currency == "JPY" ? 0 : 2
    return formatter.string(from: NSNumber(value: amount)) ?? "\(amount)"
}

private func surplusColor(_ surplus: Double) -> Color {
    surplus >= 0 ? WidgetPalette.mint : WidgetPalette.red
}

private func netWorthColor(_ netWorth: Double) -> Color {
    netWorth >= 0 ? WidgetPalette.mint : WidgetPalette.red
}
