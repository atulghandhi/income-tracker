// InsightsScreen.swift
// Income Tracker — Insights feature screen.
// Swift 6 / iOS 17+

import SwiftUI
import Charts

// MARK: - Chart tab enum

enum InsightsChartTab: String, CaseIterable, Hashable {
    case flows = "In vs out"
    case cashFlow = "Cash flow"
    case netWorth = "Net worth"
}

// MARK: - InsightsScreen

struct InsightsScreen: View {
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @Environment(AppRouter.self) var router

    // Loaded data
    @State private var health: HealthScoreBreakdown? = nil
    @State private var signals: [FinancialSignal] = []
    @State private var flowPoints: [MonthlyFlowPoint] = []
    @State private var netWorthPoints: [NetWorthPoint] = []
    @State private var subscriptions: [RecurrenceCandidate] = []
    @State private var missed: [RecurrenceCandidate] = []
    @State private var isLoading = true
    @State private var selectedChartTab: InsightsChartTab = .flows
    @State private var netWorthHorizon = 24
    @State private var showSettings = false

    private struct LoadKey: Hashable {
        let month: String
        let stamp: String
        let horizon: Int
    }

    private var loadKey: LoadKey {
        LoadKey(month: store.selectedMonth, stamp: store.state.lastSavedAt, horizon: netWorthHorizon)
    }

    private var projection: Projection {
        FinanceEngine.projection(for: store.currentMonthBudget)
    }

    private var isPrivate: Bool { store.state.privacyMode }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                if isLoading && health == nil {
                    loadingPlaceholder
                } else {
                    MetricGridView(projection: projection)

                    if let h = health {
                        HealthScoreCard(health: h)
                    }

                    SavingsTargetCard(projection: projection)

                    CategoryBreakdownCard(month: store.currentMonthBudget) {
                        router.selectedTab = .ledger
                    }

                    if !subscriptions.isEmpty || !missed.isEmpty {
                        RecurringPaymentsCard(subscriptions: subscriptions, missed: missed)
                    }

                    YearAtThisPaceCard(projection: projection)

                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        SectionHeader(title: "Signals")
                        if signals.isEmpty {
                            Card {
                                Text("Add income, outgoings and accounts to get personalised signals about your money.")
                                    .font(.subheadline)
                                    .foregroundStyle(Color.muted)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        } else {
                            ForEach(signals) { signal in
                                FinancialSignalCard(signal: signal)
                                    .transition(.scaleFade)
                            }
                            Text("Signals are rules of thumb computed on this device from your ledger. They are not financial advice.")
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                        }
                    }

                    ChartSwitcherSection(
                        selectedTab: $selectedChartTab,
                        netWorthHorizon: $netWorthHorizon,
                        flowPoints: flowPoints,
                        netWorthPoints: netWorthPoints
                    )
                }
            }
            .padding(Spacing.lg)
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Insights")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape")
                        .foregroundStyle(Color.muted)
                }
                .accessibilityLabel("Settings")
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        .task(id: loadKey) {
            await loadData()
        }
    }

    private var loadingPlaceholder: some View {
        VStack(spacing: Spacing.lg) {
            ForEach(0..<3, id: \.self) { _ in
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .fill(Color.surfaceHigh)
                    .frame(height: 100)
                    .shimmer()
            }
        }
    }

    private func loadData() async {
        isLoading = true
        let state = store.state
        let month = store.currentMonthBudget
        let horizon = netWorthHorizon
        let todayIso = isoDateString(Date())

        let result = await Task.detached(priority: .userInitiated) {
            let accounts = FinanceEngine.rollForwardDebtBalances(accounts: state.accounts, months: state.months)
            let proj = FinanceEngine.projection(for: month)
            let h = FinanceEngine.healthScore(
                month: month,
                accounts: accounts,
                savingsTarget: state.savingsTarget
            )
            let allMonths = state.months.keys.sorted().compactMap { state.months[$0] }
            let sigs = FinanceEngine.financialSignals(
                month: month,
                accounts: accounts,
                allMonths: allMonths,
                savingsTarget: state.savingsTarget
            )
            let flows = FinanceEngine.monthlyFlowPoints(state)
            let nwPoints = FinanceEngine.netWorthOutlook(
                accounts: accounts,
                recurringMonthlySurplus: proj.recurringMonthlySurplus,
                horizonMonths: horizon,
                assumedInvestmentReturn: state.assumedInvestmentReturn
            )
            let subs = Recurrence.detectSubscriptions(state)
            let missedNow = Recurrence.findMissed(state, todayIso: todayIso)
            return (h, sigs, flows, nwPoints, subs, missedNow)
        }.value

        guard !Task.isCancelled else { return }
        withAnimation(Motion.standard) {
            health = result.0
            signals = result.1
            flowPoints = result.2
            netWorthPoints = result.3
            subscriptions = result.4
            missed = result.5
            isLoading = false
        }
    }
}

// MARK: - HealthScoreCard

struct HealthScoreCard: View {
    var health: HealthScoreBreakdown
    @State private var showSubScores = false

    private var scoreColor: Color {
        if health.noData { return .muted }
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
            VStack(alignment: .leading, spacing: Spacing.lg) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Financial health")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text(health.noData ? "Add this month's income and outgoings to get a score." : health.summary)
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                            .lineLimit(3)
                    }
                    Spacer()
                    HealthArc(score: health.noData ? nil : health.score, color: scoreColor)
                        .frame(width: 68, height: 68)
                        .accessibilityLabel("Health score")
                        .accessibilityValue(health.noData ? "Not available" : String(format: "%.1f out of 10", health.score))
                }

                if !health.noData {
                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(creditColor)
                            .font(.subheadline)
                        Text("Estimated credit score")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Text(String(format: "%.0f", health.estimatedCreditScore))
                            .font(.moneySmall)
                            .foregroundStyle(creditColor)
                    }
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.sm)
                    .background(creditColor.opacity(0.1), in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                    .accessibilityElement(children: .combine)

                    Button {
                        withAnimation(Motion.snappy) { showSubScores.toggle() }
                        Haptics.selection()
                    } label: {
                        HStack {
                            Text(showSubScores ? "Hide breakdown" : "Show breakdown")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Color.brandBlue)
                            Image(systemName: showSubScores ? "chevron.up" : "chevron.down")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Color.brandBlue)
                        }
                    }
                    .buttonStyle(.plain)

                    if showSubScores {
                        VStack(spacing: 10) {
                            SubScoreRow(label: "Cash flow",        score: health.cashFlowScore)
                            SubScoreRow(label: "Debt load",        score: health.debtLoadScore)
                            SubScoreRow(label: "Utilisation",      score: health.utilizationScore)
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
}

// MARK: - HealthArc

private struct HealthArc: View {
    /// nil renders the "N/A" state.
    var score: Double?
    var color: Color

    private var fraction: Double { (score ?? 0) / 10.0 }

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
                .motionAnimation(Motion.bouncy, value: score ?? 0)

            VStack(spacing: 0) {
                Text(score.map { String(format: "%.1f", $0) } ?? "N/A")
                    .font(Font.system(.subheadline, design: .rounded, weight: .bold).monospacedDigit())
                    .foregroundStyle(color)
                    .contentTransition(.numericText(value: score ?? 0))
                if score != nil {
                    Text("/ 10")
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                }
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
        VStack(spacing: Spacing.xs) {
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
                        .motionAnimation(Motion.standard, value: score)
                }
            }
            .frame(height: 5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(String(format: "%.1f out of 10", score))
    }
}

// MARK: - SavingsTargetCard

/// The web's savings-target gauge and editor.
struct SavingsTargetCard: View {
    var projection: Projection
    @Environment(LedgerStore.self) var store

    private var target: Double { store.state.savingsTarget }
    private var actual: Double { projection.savingsRate }
    private var fraction: Double { target > 0 ? max(0, min(actual / target, 1)) : 0 }
    private var onTarget: Bool { actual >= target }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Savings rate")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text(onTarget ? "You are hitting your target this month." : "\(formatPercent(max(0, target - actual))) short of the target this month.")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                    Text(formatPercent(actual))
                        .font(.moneyMedium)
                        .foregroundStyle(onTarget ? Color.brandMint : actual >= 10 ? Color.brandAmber : Color.brandRed)
                        .contentTransition(.numericText(value: actual))
                        .motionAnimation(Motion.standard, value: actual)
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.brandMint.opacity(0.18))
                            .frame(height: 8)
                        Capsule()
                            .fill(onTarget ? Color.brandMint : Color.brandAmber)
                            .frame(width: geo.size.width * fraction, height: 8)
                            .motionAnimation(Motion.standard, value: fraction)
                    }
                }
                .frame(height: 8)
                .accessibilityHidden(true)

                Stepper(
                    value: Binding(
                        get: { store.state.savingsTarget },
                        set: { store.setSavingsTarget($0) }
                    ),
                    in: 0...100,
                    step: 1
                ) {
                    HStack {
                        Text("Target")
                            .font(.subheadline)
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Text(formatPercent(target, digits: 0))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Color.ink)
                            .monospacedDigit()
                    }
                }
                .accessibilityLabel("Savings target")
                .accessibilityValue(formatPercent(target, digits: 0))
            }
        }
    }
}

// MARK: - CategoryBreakdownCard

/// Where this month's money went, largest category first.
struct CategoryBreakdownCard: View {
    var month: MonthBudget
    var onOpenLedger: () -> Void
    @Environment(LedgerStore.self) var store

    private struct Row: Identifiable {
        let id: String
        let name: String
        let color: String
        let total: Double
        let count: Int
    }

    private var rows: [Row] {
        var order: [String] = []
        var totals: [String: (Double, Int, String)] = [:]
        for expense in month.expenses {
            let key = expense.category.isEmpty ? "Unsorted" : expense.category
            if totals[key] == nil { order.append(key) }
            let current = totals[key] ?? (0, 0, expense.color)
            totals[key] = (current.0 + expense.amount, current.1 + 1, current.2)
        }
        return order.compactMap { key in
            guard let value = totals[key] else { return nil }
            return Row(id: key, name: key, color: value.2, total: value.0, count: value.1)
        }
        .sorted { $0.total > $1.total }
    }

    private var grandTotal: Double { max(rows.reduce(0) { $0 + $1.total }, 1) }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Button(action: onOpenLedger) {
                    HStack {
                        Text("Where it went")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Spacer()
                        Text(formatMonth(store.selectedMonth))
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.faint)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the ledger")

                if rows.isEmpty {
                    Text("No outgoings logged this month yet.")
                        .font(.subheadline)
                        .foregroundStyle(Color.muted)
                } else {
                    ForEach(rows.prefix(6)) { row in
                        VStack(spacing: Spacing.xs) {
                            HStack(spacing: Spacing.sm) {
                                ColorDot(hex: row.color, size: 8)
                                Text(row.name)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.ink)
                                    .lineLimit(1)
                                Text("\(row.count)")
                                    .font(.caption2)
                                    .foregroundStyle(Color.faint)
                                Spacer()
                                Text(formatPercent(row.total / grandTotal * 100, digits: 0))
                                    .font(.caption)
                                    .foregroundStyle(Color.muted)
                                    .monospacedDigit()
                                MoneyText(amount: row.total, currency: store.state.currency, font: .moneySmall, color: .ink, isPrivate: store.state.privacyMode)
                            }
                            GeometryReader { geo in
                                Capsule()
                                    .fill(Color(hex: row.color).opacity(0.8))
                                    .frame(width: max(4, geo.size.width * row.total / grandTotal), height: 4)
                            }
                            .frame(height: 4)
                            .accessibilityHidden(true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if rows.count > 6 {
                        Text("+ \(rows.count - 6) more categories in the ledger")
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                    }
                }
            }
        }
    }
}

// MARK: - RecurringPaymentsCard

/// Subscriptions and regular bills detected from the ledger, plus anything that
/// looks overdue this cycle.
struct RecurringPaymentsCard: View {
    var subscriptions: [RecurrenceCandidate]
    var missed: [RecurrenceCandidate]
    @Environment(LedgerStore.self) var store

    private var monthlyTotal: Double {
        subscriptions.reduce(0) { $0 + $1.monthlyEquivalent }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Recurring payments")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text("Detected from repeating amounts in your ledger")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                    if !subscriptions.isEmpty {
                        VStack(alignment: .trailing, spacing: 0) {
                            MoneyText(amount: monthlyTotal, currency: store.state.currency, font: .moneySmall, color: .ink, isPrivate: store.state.privacyMode)
                            Text("per month")
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                        }
                    }
                }

                if !missed.isEmpty {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        ForEach(missed.prefix(3)) { candidate in
                            Label {
                                Text("\(candidate.label) usually lands by now (\(candidate.cadence.label.lowercased())). Nothing this cycle yet.")
                                    .font(.caption)
                                    .foregroundStyle(Color.brandAmber)
                            } icon: {
                                Image(systemName: "clock.badge.exclamationmark")
                                    .foregroundStyle(Color.brandAmber)
                            }
                        }
                    }
                    .padding(Spacing.sm)
                    .background(Color.amberSoft, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                }

                ForEach(subscriptions.prefix(8)) { candidate in
                    HStack(spacing: Spacing.sm) {
                        ColorDot(hex: candidate.color, size: 8)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(candidate.label)
                                .font(.subheadline)
                                .foregroundStyle(Color.ink)
                                .lineLimit(1)
                            Text("\(candidate.cadence.label) · seen \(candidate.occurrences)×" + (candidate.nextExpected.map { " · next \(shortDate($0))" } ?? ""))
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                        }
                        Spacer()
                        MoneyText(amount: candidate.typicalAmount, currency: store.state.currency, font: .moneySmall, color: .ink, isPrivate: store.state.privacyMode)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    private func shortDate(_ iso: String) -> String {
        guard let date = TextImportDates.isoDay(iso) else { return iso }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}

// MARK: - YearAtThisPaceCard

/// Annual projection from this month's recurring run-rate, next to the year so far.
struct YearAtThisPaceCard: View {
    var projection: Projection
    @Environment(LedgerStore.self) var store

    private var yearPrefix: String { String(store.selectedMonth.prefix(4)) }

    private var yearToDate: (income: Double, expenses: Double, months: Int) {
        var income = 0.0
        var expenses = 0.0
        var count = 0
        for (key, month) in store.state.months where key.hasPrefix(yearPrefix) && key <= store.selectedMonth {
            let p = FinanceEngine.projection(for: month)
            guard p.monthlyIncome > 0 || p.monthlyExpenses > 0 else { continue }
            income += p.monthlyIncome
            expenses += p.monthlyExpenses
            count += 1
        }
        return (income, expenses, count)
    }

    var body: some View {
        let ytd = yearToDate
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text("A year at this pace")
                    .font(.cardTitle)
                    .foregroundStyle(Color.ink)
                Text("Recurring income and outgoings from \(formatMonth(store.selectedMonth)) carried across twelve months.")
                    .font(.caption)
                    .foregroundStyle(Color.muted)

                HStack(spacing: Spacing.md) {
                    column("Income", value: projection.recurringMonthlyIncome * 12, color: .brandMint)
                    column("Outgoings", value: projection.recurringMonthlyExpenses * 12, color: .brandRed)
                    column("Surplus", value: projection.recurringMonthlySurplus * 12, color: projection.recurringMonthlySurplus >= 0 ? .brandBlue : .brandRed)
                }

                if ytd.months > 0 {
                    Divider()
                    HStack {
                        Text("\(yearPrefix) so far (\(ytd.months) month\(ytd.months == 1 ? "" : "s"))")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Text(store.state.privacyMode ? "•••" : "\(formatSignedMoney(ytd.income - ytd.expenses, currency: store.state.currency)) net")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ytd.income - ytd.expenses >= 0 ? Color.brandMint : Color.brandRed)
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func column(_ label: String, value: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.muted)
            MoneyText(amount: value, currency: store.state.currency, font: .moneySmall, color: color, isPrivate: store.state.privacyMode)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - FinancialSignalCard

struct FinancialSignalCard: View {
    var signal: FinancialSignal
    @State private var isExpanded = false

    private var toneColor: Color { Color.tone(signal.tone) }

    private var toneIcon: String {
        switch signal.tone {
        case .good:    return "checkmark.circle.fill"
        case .info:    return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger:  return "xmark.octagon.fill"
        }
    }

    var body: some View {
        Button {
            guard !signal.detail.isEmpty else { return }
            withAnimation(Motion.snappy) { isExpanded.toggle() }
            Haptics.impact(.light)
        } label: {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Image(systemName: toneIcon)
                            .foregroundStyle(toneColor)
                            .font(.title3)

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
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Color.faint)
                        }
                    }

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
                RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
                    .strokeBorder(toneColor.opacity(0.35), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(signal.detail.isEmpty ? "" : (isExpanded ? "Collapses the detail" : "Expands the detail"))
    }
}

// MARK: - ChartSwitcherSection

struct ChartSwitcherSection: View {
    @Binding var selectedTab: InsightsChartTab
    @Binding var netWorthHorizon: Int
    var flowPoints: [MonthlyFlowPoint]
    var netWorthPoints: [NetWorthPoint]
    @Environment(LedgerStore.self) var store

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

                Group {
                    switch selectedTab {
                    case .flows:
                        FlowsChart(points: flowPoints)
                    case .cashFlow:
                        CashFlowChart(points: flowPoints)
                    case .netWorth:
                        VStack(spacing: Spacing.sm) {
                            Picker("Horizon", selection: $netWorthHorizon) {
                                Text("12M").tag(12)
                                Text("24M").tag(24)
                                Text("60M").tag(60)
                            }
                            .pickerStyle(.segmented)
                            .accessibilityLabel("Net worth horizon")
                            NetWorthChart(points: netWorthPoints)
                        }
                    }
                }
                .privacyBlurred(store.state.privacyMode)
            }
        }
    }
}

// MARK: - FlowsChart (income vs outgoings, two line series)

private struct FlowsChart: View {
    var points: [MonthlyFlowPoint]

    private var relevant: [MonthlyFlowPoint] { points.filter { $0.hasData } }

    private struct SeriesPoint: Identifiable {
        var id: String { "\(kind)-\(label)" }
        var kind: String
        var label: String
        var value: Double
    }

    private var seriesPoints: [SeriesPoint] {
        relevant.flatMap { p in [
            SeriesPoint(kind: "Income",   label: p.label, value: p.income),
            SeriesPoint(kind: "Outgoings", label: p.label, value: p.expenses)
        ]}
    }

    var body: some View {
        Group {
            if relevant.isEmpty {
                Text("Add income and outgoings to see the trend.")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
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
                    "Income":    Color.brandMint,
                    "Outgoings": Color.brandRed
                ])
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 6)) { _ in
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
                .accessibilityLabel("Income versus outgoings by month")
                .accessibilityValue(relevant.map { "\($0.label): in \(abbreviate($0.income)), out \(abbreviate($0.expenses))" }.joined(separator: ". "))
            }
        }
    }
}

// MARK: - CashFlowChart (surplus per month — mint above zero, red below)

private struct CashFlowChart: View {
    var points: [MonthlyFlowPoint]

    private var relevant: [MonthlyFlowPoint] { points.filter { $0.hasData } }

    var body: some View {
        Group {
            if relevant.isEmpty {
                Text("No cash-flow data yet.")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
            } else {
                Chart {
                    ForEach(relevant) { point in
                        BarMark(
                            x: .value("Month", point.label),
                            y: .value("Surplus", point.surplus)
                        )
                        .foregroundStyle(point.surplus >= 0 ? Color.brandMint : Color.brandRed)
                        .cornerRadius(4)
                        .annotation(position: point.surplus >= 0 ? .top : .bottom) {
                            if abs(point.surplus) > 0 {
                                Text(abbreviate(point.surplus))
                                    .font(.caption2)
                                    .foregroundStyle(Color.muted)
                            }
                        }
                    }
                    RuleMark(y: .value("Zero", 0))
                        .foregroundStyle(Color.lineStrong)
                        .lineStyle(StrokeStyle(lineWidth: 1))
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 6)) { _ in
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
                .frame(height: 200)
                .accessibilityLabel("Monthly surplus")
                .accessibilityValue(relevant.map { "\($0.label): \(abbreviate($0.surplus))" }.joined(separator: ". "))
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
                    AxisMarks(values: .automatic(desiredCount: 5)) { value in
                        AxisValueLabel {
                            if let idx = value.as(Int.self) {
                                Text(idx > 0 && idx % 12 == 0 ? "\(idx / 12)y" : "\(idx)m").font(.caption2)
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
                .accessibilityLabel("Projected net worth")
                .accessibilityValue(points.last.map { "Reaches \(abbreviate($0.netWorth)) by \($0.label)" } ?? "")
            }
        }
    }
}

// MARK: - Shared money abbreviation helper

private func abbreviate(_ value: Double) -> String {
    let magnitude = Swift.abs(value)
    let sign = value < 0 ? "-" : ""
    if magnitude >= 1_000_000 { return "\(sign)\(String(format: "%.1f", magnitude / 1_000_000))M" }
    if magnitude >= 1_000     { return "\(sign)\(String(format: "%.0f", magnitude / 1_000))k" }
    return "\(sign)\(String(format: "%.0f", magnitude))"
}
