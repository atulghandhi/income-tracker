// InsightsScreen.swift
// Income Tracker — Insights feature screen.
// Swift 6 / iOS 17+

import SwiftUI
import Charts

// MARK: - Chart tab enum

enum InsightsChartTab: String, CaseIterable, Hashable {
    case flows = "Inflows / Outflows"
    case cashFlow = "Cash flow"
    case netWorth = "Net worth"
}

// MARK: - InsightsScreen

struct InsightsScreen: View {
    @Environment(LedgerStore.self) var store

    // Loaded data
    @State private var health: HealthScoreBreakdown? = nil
    @State private var signals: [FinancialSignal] = []
    @State private var flowPoints: [MonthlyFlowPoint] = []
    @State private var netWorthPoints: [NetWorthPoint] = []
    @State private var isLoading = true
    @State private var selectedChartTab: InsightsChartTab = .flows

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if isLoading {
                    loadingPlaceholder
                } else {
                    // Health score
                    if let h = health {
                        HealthScoreCard(health: h)
                    }

                    // Financial signals
                    if signals.isEmpty {
                        EmptyStateView(
                            title: "No signals",
                            subtitle: "Add income, expenses, and accounts to get personalised financial signals.",
                            systemImage: "waveform.path.ecg"
                        )
                        .frame(minHeight: 160)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(title: "Signals")
                            ForEach(signals) { signal in
                                FinancialSignalCard(signal: signal)
                                    .transition(.scaleFade)
                            }
                        }
                    }

                    // Chart switcher
                    ChartSwitcherSection(
                        selectedTab: $selectedChartTab,
                        flowPoints: flowPoints,
                        netWorthPoints: netWorthPoints
                    )
                }
            }
            .padding()
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Insights")
        .navigationBarTitleDisplayMode(.large)
        .task(id: store.state.selectedMonth) {
            await loadData()
        }
        .task(id: store.state.accounts) {
            await loadData()
        }
    }

    private var loadingPlaceholder: some View {
        VStack(spacing: 16) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.surfaceHigh)
                    .frame(height: 100)
                    .shimmer()
            }
        }
    }

    private func loadData() async {
        let state = store.state
        let month = store.currentMonthBudget

        let result = await Task.detached(priority: .userInitiated) {
            let proj = FinanceEngine.projection(for: month)
            let h = FinanceEngine.healthScore(
                month: month,
                accounts: state.accounts,
                savingsTarget: state.savingsTarget
            )
            let allMonths = Array(state.months.values)
            let sigs = FinanceEngine.financialSignals(
                month: month,
                accounts: state.accounts,
                allMonths: allMonths,
                savingsTarget: state.savingsTarget
            )
            let flows = FinanceEngine.monthlyFlowPoints(state)
            let nwPoints = FinanceEngine.netWorthOutlook(
                accounts: state.accounts,
                recurringMonthlySurplus: proj.recurringMonthlySurplus,
                horizonMonths: min(state.goalsHorizonMonths, 60),
                assumedInvestmentReturn: state.assumedInvestmentReturn
            )
            return (h, sigs, flows, nwPoints)
        }.value

        withAnimation(Motion.standard) {
            health = result.0
            signals = result.1
            flowPoints = result.2
            netWorthPoints = result.3
            isLoading = false
        }
    }
}

// MARK: - Shimmer modifier

private struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color.white.opacity(0),
                        Color.white.opacity(0.35),
                        Color.white.opacity(0)
                    ]),
                    startPoint: .init(x: phase - 0.3, y: 0.5),
                    endPoint: .init(x: phase + 0.3, y: 0.5)
                )
                .blendMode(.plusLighter)
            )
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 1.3
                }
            }
    }
}

private extension View {
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - HealthScoreCard

struct HealthScoreCard: View {
    var health: HealthScoreBreakdown
    @State private var showSubScores = false

    private var scoreColor: Color {
        if health.score >= 7.5 { return .brandMint }
        if health.score >= 5.0 { return .brandAmber }
        return .brandRed
    }

    private var creditColor: Color {
        let s = health.estimatedCreditScore
        if s >= 720 { return .brandMint }
        if s >= 580 { return .brandAmber }
        return .brandRed
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 16) {
                // Header row
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Financial health")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text(health.summary)
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                            .lineLimit(2)
                    }
                    Spacer()
                    // Arc gauge (custom)
                    HealthArc(score: health.score, color: scoreColor)
                        .frame(width: 68, height: 68)
                }

                // Credit score badge
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(creditColor)
                        .font(.system(size: 14))
                    Text("Est. credit score")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                    Spacer()
                    Text(String(format: "%.0f", health.estimatedCreditScore))
                        .font(.moneySmall)
                        .foregroundStyle(creditColor)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(creditColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                // Expand/collapse sub-scores
                Button {
                    withAnimation(Motion.snappy) { showSubScores.toggle() }
                    Haptics.selection()
                } label: {
                    HStack {
                        Text(showSubScores ? "Hide breakdown" : "Show breakdown")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(Color.brandBlue)
                        Image(systemName: showSubScores ? "chevron.up" : "chevron.down")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(Color.brandBlue)
                    }
                }
                .buttonStyle(.plain)

                if showSubScores {
                    VStack(spacing: 10) {
                        SubScoreRow(label: "Cash flow",        score: health.cashFlowScore)
                        SubScoreRow(label: "Debt load",        score: health.debtLoadScore)
                        SubScoreRow(label: "Utilization",      score: health.utilizationScore)
                        SubScoreRow(label: "Payment pressure", score: health.paymentPressureScore)
                        SubScoreRow(label: "Savings",          score: health.savingsScore)
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                if !health.detail.isEmpty {
                    Text(health.detail)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                        .lineLimit(showSubScores ? nil : 2)
                }
            }
        }
    }
}

// MARK: - HealthArc

private struct HealthArc: View {
    var score: Double   // 0–10
    var color: Color

    private var fraction: Double { score / 10.0 }

    var body: some View {
        ZStack {
            Circle()
                .trim(from: 0.15, to: 0.85)
                .stroke(color.opacity(0.18), style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(90))

            Circle()
                .trim(from: 0.15, to: 0.15 + 0.7 * fraction)
                .stroke(color, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(90))
                .animation(Motion.bouncy, value: score)

            VStack(spacing: 0) {
                Text(String(format: "%.1f", score))
                    .font(Font.system(.subheadline, design: .rounded, weight: .bold).monospacedDigit())
                    .foregroundStyle(color)
                    .contentTransition(.numericText(value: score))
                Text("/ 10")
                    .font(.system(size: 9))
                    .foregroundStyle(Color.muted)
            }
        }
    }
}

// MARK: - SubScoreRow

private struct SubScoreRow: View {
    var label: String
    var score: Double   // 0–10

    private var color: Color {
        if score >= 7.5 { return .brandMint }
        if score >= 5.0 { return .brandAmber }
        return .brandRed
    }

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Text(label).font(.caption).foregroundStyle(Color.muted)
                Spacer()
                Text(String(format: "%.1f", score)).font(.caption.weight(.semibold)).foregroundStyle(color)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color.opacity(0.15))
                        .frame(height: 5)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color)
                        .frame(width: geo.size.width * (score / 10.0), height: 5)
                        .animation(Motion.standard, value: score)
                }
            }
            .frame(height: 5)
        }
    }
}

// MARK: - FinancialSignalCard

struct FinancialSignalCard: View {
    var signal: FinancialSignal
    @State private var isExpanded = false

    private var toneColor: Color { Color.tone(signal.tone) }
    private var toneSoftColor: Color { Color.toneSoft(signal.tone) }

    private var toneIcon: String {
        switch signal.tone {
        case .good:    return "checkmark.circle.fill"
        case .info:    return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger:  return "xmark.octagon.fill"
        }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                // Header row
                HStack(spacing: 10) {
                    Image(systemName: toneIcon)
                        .foregroundStyle(toneColor)
                        .font(.system(size: 18))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(signal.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.ink)
                        Text(signal.summary)
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                            .lineLimit(isExpanded ? nil : 2)
                    }

                    Spacer(minLength: 4)

                    if !signal.detail.isEmpty {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color.faint)
                            .animation(Motion.snappy, value: isExpanded)
                    }
                }

                // Expanded detail
                if isExpanded && !signal.detail.isEmpty {
                    Text(signal.detail)
                        .font(.footnote)
                        .foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(toneColor.opacity(0.35), lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            guard !signal.detail.isEmpty else { return }
            withAnimation(Motion.snappy) { isExpanded.toggle() }
            Haptics.impact(.light)
        }
    }
}

// MARK: - ChartSwitcherSection

struct ChartSwitcherSection: View {
    @Binding var selectedTab: InsightsChartTab
    var flowPoints: [MonthlyFlowPoint]
    var netWorthPoints: [NetWorthPoint]

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                Text("Charts")
                    .font(.cardTitle)
                    .foregroundStyle(Color.ink)

                Picker("Chart", selection: $selectedTab) {
                    ForEach(InsightsChartTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: selectedTab) { _, _ in Haptics.selection() }

                switch selectedTab {
                case .flows:
                    FlowsChart(points: flowPoints)
                case .cashFlow:
                    CashFlowChart(points: flowPoints)
                case .netWorth:
                    NetWorthChart(points: netWorthPoints)
                }
            }
        }
    }
}

// MARK: - FlowsChart (Inflows / Outflows — two LineMark series)

private struct FlowsChart: View {
    var points: [MonthlyFlowPoint]

    private var hasData: Bool { points.contains(where: { $0.hasData }) }

    // Flat series for charting
    private struct SeriesPoint: Identifiable {
        var id: String { "\(kind)-\(label)" }
        var kind: String
        var label: String
        var value: Double
    }

    private var seriesPoints: [SeriesPoint] {
        let relevant = points.filter { $0.hasData }
        return relevant.flatMap { p in [
            SeriesPoint(kind: "Income",   label: p.label, value: p.income),
            SeriesPoint(kind: "Expenses", label: p.label, value: p.expenses)
        ]}
    }

    var body: some View {
        Group {
            if !hasData {
                emptyChart
            } else {
                Chart(seriesPoints) { point in
                    LineMark(
                        x: .value("Month", point.label),
                        y: .value("Amount", point.value)
                    )
                    .foregroundStyle(by: .value("Series", point.kind))
                    .interpolationMethod(.monotone)
                    .symbol(by: .value("Series", point.kind))
                }
                .chartForegroundStyleScale([
                    "Income":   Color.brandMint,
                    "Expenses": Color.brandRed
                ])
                .chartXAxis {
                    AxisMarks(values: .stride(by: 2)) { _ in
                        AxisValueLabel(orientation: .verticalReversed)
                            .font(.caption2)
                        AxisGridLine()
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(abbreviate(v)).font(.caption2)
                            }
                        }
                    }
                }
                .chartLegend(position: .bottom, alignment: .leading)
                .frame(height: 200)
            }
        }
    }

    private var emptyChart: some View {
        Text("Add income and expenses to see flow trends.")
            .font(.caption)
            .foregroundStyle(Color.muted)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
    }
}

// MARK: - CashFlowChart (surplus per month — green above zero, red below)

private struct CashFlowChart: View {
    var points: [MonthlyFlowPoint]

    private var hasData: Bool { points.contains(where: { $0.hasData }) }
    private var relevant: [MonthlyFlowPoint] { points.filter { $0.hasData } }

    var body: some View {
        Group {
            if !hasData {
                Text("No cash-flow data yet.")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
            } else {
                Chart(relevant) { point in
                    BarMark(
                        x: .value("Month", point.label),
                        y: .value("Surplus", point.surplus)
                    )
                    .foregroundStyle(point.surplus >= 0 ? Color.brandMint : Color.brandRed)
                    .cornerRadius(4)
                    .annotation(position: point.surplus >= 0 ? .top : .bottom) {
                        if abs(point.surplus) > 0 {
                            Text(abbreviate(point.surplus))
                                .font(.system(size: 8))
                                .foregroundStyle(Color.muted)
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: 1)) { _ in
                        AxisValueLabel(orientation: .verticalReversed)
                            .font(.caption2)
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(abbreviate(v)).font(.caption2)
                            }
                        }
                    }
                }
                // Zero rule line
                .chartOverlay { proxy in
                    if let yOrigin = proxy.position(forY: 0.0) {
                        Rectangle()
                            .fill(Color.lineStrong)
                            .frame(height: 1)
                            .offset(y: yOrigin)
                    }
                }
                .frame(height: 200)
            }
        }
    }
}

// MARK: - NetWorthChart (AreaMark)

private struct NetWorthChart: View {
    var points: [NetWorthPoint]

    var body: some View {
        Group {
            if points.isEmpty {
                Text("Add accounts to project net worth.")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
            } else {
                Chart(points) { point in
                    AreaMark(
                        x: .value("Month", point.monthIndex),
                        y: .value("Net worth", point.netWorth)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.brandBlue.opacity(0.35), Color.brandBlue.opacity(0.05)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .interpolationMethod(.monotone)

                    LineMark(
                        x: .value("Month", point.monthIndex),
                        y: .value("Net worth", point.netWorth)
                    )
                    .foregroundStyle(Color.brandBlue)
                    .interpolationMethod(.monotone)
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: 12)) { value in
                        AxisValueLabel {
                            if let idx = value.as(Int.self) {
                                Text("Mo \(idx)").font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(abbreviate(v)).font(.caption2)
                            }
                        }
                    }
                }
                .frame(height: 200)
            }
        }
    }
}

// MARK: - Shared money abbreviation helper

private func abbreviate(_ value: Double) -> String {
    let abs = Swift.abs(value)
    let sign = value < 0 ? "-" : ""
    if abs >= 1_000_000 { return "\(sign)\(String(format: "%.1f", abs / 1_000_000))M" }
    if abs >= 1_000     { return "\(sign)\(String(format: "%.0f", abs / 1_000))k" }
    return "\(sign)\(String(format: "%.0f", abs))"
}
