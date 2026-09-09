// DashboardScreen.swift
// Income Tracker — Dashboard feature screen.
// Swift 6 / iOS 17+

import SwiftUI
import Charts

// MARK: - DashboardScreen

struct DashboardScreen: View {
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @Environment(AppRouter.self) var router

    @State private var selectedHorizon: Int = 24  // 12 / 24 / 60
    @State private var showSettings = false
    @State private var chartScrubIndex: Int? = nil
    @State private var netWorthPoints: [NetWorthPoint] = []
    @State private var isLoading = true
    @State private var importFlow = ImportFlowState()
    @State private var showAddEntry = false
    @State private var addKind: TransactionKind = .expense
    @State private var importNotice: String? = nil
    @AppStorage("dashboard.checklistDismissed") private var checklistDismissed = false

    /// Everything the outlook depends on. Changing any of it recomputes once.
    private struct OutlookKey: Hashable {
        let month: String
        let horizon: Int
        let stamp: String
    }

    private var outlookKey: OutlookKey {
        OutlookKey(month: store.selectedMonth, horizon: selectedHorizon, stamp: store.state.lastSavedAt)
    }

    private var isPrivate: Bool { store.state.privacyMode }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.xl) {
                if let importNotice {
                    Label(importNotice, systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.brandMint)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(Spacing.md)
                        .background(Color.mintSoft, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                        .transition(.move(edge: .top).combined(with: .opacity))
                }

                if !checklistDismissed && !checklist.allDone {
                    GettingStartedCard(
                        items: checklist,
                        onLog: {
                            addKind = .expense
                            showAddEntry = true
                        },
                        onIncome: {
                            addKind = .income
                            showAddEntry = true
                        },
                        onImport: { importFlow.showFilePicker = true },
                        onAccount: { router.selectedTab = .accounts },
                        onDismiss: { withAnimation(Motion.snappy) { checklistDismissed = true } }
                    )
                    .transition(.scaleFade)
                }

                MonthPulseCard(projection: projection) {
                    router.selectedTab = .ledger
                }

                NetWorthHeroCard(
                    points: netWorthPoints,
                    scrubIndex: $chartScrubIndex,
                    horizon: $selectedHorizon,
                    isLoading: isLoading
                )

                MetricGridView(projection: projection)

                RecentTransactionsCard {
                    router.selectedTab = .ledger
                }

                AccountsSummaryStrip {
                    router.selectedTab = .accounts
                }

                DashboardSummaryRows()

                QuickActionsRow(
                    onLog: {
                        addKind = .expense
                        showAddEntry = true
                    },
                    importFlow: $importFlow,
                    onAccounts: { router.selectedTab = .accounts },
                    onGoals: { router.selectedTab = .goals }
                )
            }
            .padding(Spacing.lg)
            .animation(Motion.snappy, value: importNotice)
        }
        .background(Color.bg.ignoresSafeArea())
        .refreshable {
            await store.refreshFromCloudIfIdle(sync: sync)
        }
        .navigationTitle(greetingText)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: Spacing.sm) {
                    StatusPill(state: syncStatusPillState)
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                            .foregroundStyle(Color.muted)
                    }
                    .accessibilityLabel("Settings")
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        .sheet(isPresented: $showAddEntry) {
            AddEntrySheet(kind: $addKind)
                .environment(store)
        }
        .importFlow($importFlow) { result in
            let rows = result.importedRows
            importNotice = rows > 0
                ? "Imported \(rows) row\(rows == 1 ? "" : "s")" + (result.sweptEntries > 0 ? " · \(result.sweptEntries) transfer\(result.sweptEntries == 1 ? "" : "s") removed" : "")
                : (result.learnedTransferPatterns > 0 ? "Transfer patterns saved" : "Nothing imported")
            Task {
                try? await Task.sleep(for: .seconds(4))
                withAnimation(Motion.snappy) { importNotice = nil }
            }
        }
        .task(id: outlookKey) {
            await recomputeNetWorth()
        }
        .onChange(of: selectedHorizon) { _, _ in
            Haptics.selection()
        }
    }

    // MARK: - Private helpers

    private var checklist: GettingStartedItems {
        let months = store.state.months.values
        return GettingStartedItems(
            hasIncome: months.contains { !$0.incomes.isEmpty },
            hasExpense: months.contains { !$0.expenses.isEmpty },
            hasImport: !store.state.importBatches.isEmpty,
            hasAccount: !store.state.accounts.isEmpty
        )
    }

    private func recomputeNetWorth() async {
        isLoading = true
        let state = store.state
        let horizon = selectedHorizon
        let points = await Task.detached(priority: .userInitiated) {
            FinanceEngine.netWorthOutlook(
                accounts: FinanceEngine.rollForwardDebtBalances(accounts: state.accounts, months: state.months),
                recurringMonthlySurplus: FinanceEngine.projection(
                    for: state.months[state.selectedMonth] ?? .empty
                ).recurringMonthlySurplus,
                horizonMonths: horizon,
                assumedInvestmentReturn: state.assumedInvestmentReturn
            )
        }.value
        guard !Task.isCancelled else { return }
        netWorthPoints = points
        isLoading = false
    }

    var projection: Projection {
        FinanceEngine.projection(for: store.currentMonthBudget)
    }

    var greetingText: String {
        let hour = ledgerCalendar.component(.hour, from: .now)
        return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
    }

    var syncStatusPillState: StatusPill.State {
        switch store.saveStatus {
        case .loading:  return .loading
        case .saving:   return .saving
        case .loaded:   return .saved
        case .offline:  return .offline
        }
    }
}

// MARK: - Getting started

struct GettingStartedItems: Equatable {
    var hasIncome: Bool
    var hasExpense: Bool
    var hasImport: Bool
    var hasAccount: Bool

    var allDone: Bool { hasIncome && hasExpense && hasAccount && hasImport }
    var doneCount: Int { [hasIncome, hasExpense, hasImport, hasAccount].filter { $0 }.count }
}

/// First-run checklist: the four steps that turn an empty ledger into a useful one.
struct GettingStartedCard: View {
    var items: GettingStartedItems
    var onLog: () -> Void
    var onIncome: () -> Void
    var onImport: () -> Void
    var onAccount: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Getting started")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text("\(items.doneCount) of 4 done")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                    Button("Hide", action: onDismiss)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.muted)
                }

                ProgressView(value: Double(items.doneCount), total: 4)
                    .tint(.brandMint)

                step(done: items.hasIncome, title: "Add your income", detail: "Salary or anything regular that comes in", action: onIncome)
                step(done: items.hasExpense, title: "Log a spend", detail: "\"coffee 3.20\" in the Ledger bar is enough", action: onLog)
                step(done: items.hasImport, title: "Import a bank statement", detail: "CSV, OFX or QIF — the app sorts the rows", action: onImport)
                step(done: items.hasAccount, title: "Add an account", detail: "Cards and savings feed the net-worth outlook", action: onAccount)
            }
        }
    }

    @ViewBuilder
    private func step(done: Bool, title: String, detail: String, action: @escaping () -> Void) -> some View {
        Button(action: {
            guard !done else { return }
            Haptics.impact(.light)
            action()
        }) {
            HStack(spacing: Spacing.md) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(done ? Color.brandMint : Color.faint)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(done ? Color.muted : Color.ink)
                        .strikethrough(done, color: Color.muted)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(Color.faint)
                }
                Spacer()
                if !done {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.faint)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(done)
        .accessibilityValue(done ? "Done" : "Not done")
    }
}

// MARK: - MonthPulseCard

/// The month on screen at a glance: what is left, income against outgoings, and the
/// day-of-month pace. Tapping opens the Ledger.
struct MonthPulseCard: View {
    var projection: Projection
    var onOpenLedger: () -> Void
    @Environment(LedgerStore.self) var store

    private var isPrivate: Bool { store.state.privacyMode }
    private var isCurrentMonth: Bool { store.selectedMonth == getMonthKey() }

    private var monthProgress: Double {
        guard isCurrentMonth else { return 1 }
        let day = ledgerCalendar.component(.day, from: .now)
        return Double(day) / Double(max(1, daysInMonth(monthKey: store.selectedMonth)))
    }

    private var spendFraction: Double {
        guard projection.monthlyIncome > 0 else { return projection.monthlyExpenses > 0 ? 1 : 0 }
        return min(projection.monthlyExpenses / projection.monthlyIncome, 1)
    }

    var body: some View {
        Button(action: {
            Haptics.rowTap()
            onOpenLedger()
        }) {
            Card {
                VStack(alignment: .leading, spacing: Spacing.md) {
                    HStack {
                        Text(formatMonth(store.selectedMonth))
                            .font(.cardTitle)
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.faint)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(projection.monthlySurplus >= 0 ? "Left this month" : "Over this month")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        AnimatedMoneyText(
                            amount: abs(projection.monthlySurplus),
                            currency: store.state.currency,
                            font: .moneyLarge,
                            color: projection.monthlySurplus >= 0 ? .brandMint : .brandRed,
                            isPrivate: isPrivate
                        )
                    }

                    // Spend bar with a day-of-month marker so pace is visible at a glance.
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.brandMint.opacity(0.18))
                                .frame(height: 6)
                            Capsule()
                                .fill(spendFraction >= 1 ? Color.brandRed : Color.brandBlue)
                                .frame(width: geo.size.width * spendFraction, height: 6)
                                .motionAnimation(Motion.standard, value: spendFraction)
                            if isCurrentMonth {
                                Rectangle()
                                    .fill(Color.ink.opacity(0.5))
                                    .frame(width: 2, height: 12)
                                    .offset(x: geo.size.width * monthProgress - 1)
                            }
                        }
                    }
                    .frame(height: 12)
                    .accessibilityHidden(true)

                    HStack {
                        Label(isPrivate ? "•••" : formatMoney(projection.monthlyIncome, currency: store.state.currency), systemImage: "arrow.down.circle")
                            .foregroundStyle(Color.brandMint)
                        Spacer()
                        Label(isPrivate ? "•••" : formatMoney(projection.monthlyExpenses, currency: store.state.currency), systemImage: "arrow.up.circle")
                            .foregroundStyle(Color.brandRed)
                        Spacer()
                        Text(isCurrentMonth ? "day \(ledgerCalendar.component(.day, from: .now)) of \(daysInMonth(monthKey: store.selectedMonth))" : "closed month")
                            .foregroundStyle(Color.faint)
                    }
                    .font(.caption.weight(.medium))
                    .monospacedDigit()
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the ledger")
    }
}

// MARK: - NetWorthHeroCard

struct NetWorthHeroCard: View {
    var points: [NetWorthPoint]
    @Binding var scrubIndex: Int?
    @Binding var horizon: Int
    var isLoading: Bool = false
    @Environment(LedgerStore.self) var store

    /// Index 0 of the outlook is today; a later index is a projection.
    private var displayPoint: NetWorthPoint? {
        if let idx = scrubIndex, let point = points[safe: idx] { return point }
        return points.first
    }

    private var isScrubbing: Bool { scrubIndex != nil && scrubIndex != 0 }

    private var projectedEnd: NetWorthPoint? { points.last }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack(alignment: .firstTextBaseline) {
                    Text(isScrubbing ? "Projected · \(displayPoint?.label ?? "")" : "Net worth today")
                        .font(.cardTitle)
                        .foregroundStyle(Color.muted)
                        .contentTransition(.opacity)
                    Spacer()
                    if !isScrubbing, let end = projectedEnd, let start = points.first, !store.state.privacyMode {
                        let delta = end.netWorth - start.netWorth
                        Text("\(formatSignedMoney(delta, currency: store.state.currency)) in \(horizon)M")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(delta >= 0 ? Color.brandMint : Color.brandRed)
                            .monospacedDigit()
                    }
                }

                AnimatedMoneyText(
                    amount: displayPoint?.netWorth ?? 0,
                    currency: store.state.currency,
                    font: .moneyLarge,
                    color: (displayPoint?.netWorth ?? 0) >= 0 ? .ink : .brandRed,
                    isPrivate: store.state.privacyMode
                )
                .shimmer(isActive: isLoading)

                Picker("Horizon", selection: $horizon) {
                    Text("12M").tag(12)
                    Text("24M").tag(24)
                    Text("60M").tag(60)
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Outlook horizon")

                SparklineChart(points: points, scrubIndex: $scrubIndex)
                    .frame(height: 120)
                    .shimmer(isActive: isLoading)
                    .privacyBlurred(store.state.privacyMode)
                    .accessibilityLabel("Net worth outlook")
                    .accessibilityValue(outlookSummary)

                Text(isScrubbing ? "Drag to compare months · lift to return to today" : "Drag across the chart to see the projected figure for any month")
                    .font(.caption2)
                    .foregroundStyle(Color.faint)
            }
        }
    }

    private var outlookSummary: String {
        guard let first = points.first, let last = points.last else { return "No data" }
        return "From \(formatMoney(first.netWorth, currency: store.state.currency)) today to \(formatMoney(last.netWorth, currency: store.state.currency)) in \(horizon) months"
    }
}

// MARK: - SparklineChart

struct SparklineChart: View {
    var points: [NetWorthPoint]
    @Binding var scrubIndex: Int?

    private var minNetWorth: Double { points.map(\.netWorth).min() ?? 0 }

    var body: some View {
        Chart {
            ForEach(Array(points.enumerated()), id: \.offset) { idx, point in
                AreaMark(
                    x: .value("Month", idx),
                    yStart: .value("Base", minNetWorth),
                    yEnd: .value("Net Worth", point.netWorth)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color.brandMint.opacity(0.35), Color.brandMint.opacity(0.02)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .interpolationMethod(.catmullRom)
            }

            ForEach(Array(points.enumerated()), id: \.offset) { idx, point in
                LineMark(
                    x: .value("Month", idx),
                    y: .value("Net Worth", point.netWorth)
                )
                .foregroundStyle(Color.brandMint)
                .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.catmullRom)
            }

            if let idx = scrubIndex, let point = points[safe: idx] {
                RuleMark(x: .value("Selected", idx))
                    .foregroundStyle(Color.ink.opacity(0.3))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))

                PointMark(
                    x: .value("Month", idx),
                    y: .value("Net Worth", point.netWorth)
                )
                .foregroundStyle(Color.brandMint)
                .symbolSize(60)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartXScale(domain: 0 ... max(points.count - 1, 1))
        .animation(Motion.standard, value: points.count)
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle()
                    .fill(Color.clear)
                    .contentShape(Rectangle())
                    // A small minimum distance and a horizontal check keep vertical
                    // scrolling that starts on the chart working.
                    .gesture(
                        DragGesture(minimumDistance: 6)
                            .onChanged { value in
                                let horizontal = abs(value.translation.width) >= abs(value.translation.height)
                                guard scrubIndex != nil || horizontal else { return }
                                updateScrubIndex(at: value.location, proxy: proxy, geo: geo)
                            }
                            .onEnded { _ in
                                withAnimation(Motion.snappy) {
                                    scrubIndex = nil
                                }
                            }
                    )
            }
        }
    }

    private func updateScrubIndex(at location: CGPoint, proxy: ChartProxy, geo: GeometryProxy) {
        guard !points.isEmpty, let plotFrame = proxy.plotFrame else { return }
        let origin = geo[plotFrame].origin
        let xInPlot = location.x - origin.x
        guard let xValue: Int = proxy.value(atX: xInPlot) else { return }
        let clamped = max(0, min(points.count - 1, xValue))
        if scrubIndex != clamped {
            Haptics.selection()
            withAnimation(Motion.snappy) { scrubIndex = clamped }
        }
    }
}

// MARK: - MetricGridView

struct MetricGridView: View {
    var projection: Projection
    @Environment(LedgerStore.self) var store

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        LazyVGrid(columns: columns, spacing: Spacing.md) {
            MetricCard(
                label: "Income",
                value: formatMoney(projection.monthlyIncome, currency: store.state.currency),
                tone: .brandMint,
                isPrivate: store.state.privacyMode,
                detail: recurringDetail(projection.recurringMonthlyIncome, of: projection.monthlyIncome)
            )
            MetricCard(
                label: "Outgoings",
                value: formatMoney(projection.monthlyExpenses, currency: store.state.currency),
                tone: .brandRed,
                isPrivate: store.state.privacyMode,
                detail: recurringDetail(projection.recurringMonthlyExpenses, of: projection.monthlyExpenses)
            )
            MetricCard(
                label: "Surplus",
                value: formatMoney(projection.monthlySurplus, currency: store.state.currency),
                tone: projection.monthlySurplus >= 0 ? .brandMint : .brandRed,
                isPrivate: store.state.privacyMode,
                detail: store.state.privacyMode ? nil : "\(formatMoney(projection.recurringMonthlySurplus, currency: store.state.currency)) recurring"
            )
            MetricCard(
                label: "Savings rate",
                value: formatPercent(projection.savingsRate),
                tone: savingsRateColor,
                detail: "target \(formatPercent(store.state.savingsTarget, digits: 0))"
            )
        }
    }

    private func recurringDetail(_ recurring: Double, of total: Double) -> String? {
        guard !store.state.privacyMode, total > 0 else { return nil }
        return "\(formatMoney(recurring, currency: store.state.currency)) recurring"
    }

    private var savingsRateColor: Color {
        if projection.savingsRate >= store.state.savingsTarget { return .brandMint }
        if projection.savingsRate >= 10 { return .brandAmber }
        return .brandRed
    }
}

// MARK: - RecentTransactionsCard

struct RecentTransactionsCard: View {
    var onOpenLedger: () -> Void
    @Environment(LedgerStore.self) var store

    private struct Recent: Identifiable {
        let id: String
        let label: String
        let amount: Double
        let color: String
        let isIncome: Bool
        let date: String
    }

    private var recentEntries: [Recent] {
        let budget = store.currentMonthBudget
        var items: [Recent] = []
        for entry in budget.incomes {
            items.append(Recent(id: entry.id, label: entry.source, amount: entry.amount, color: entry.color, isIncome: true, date: entry.date ?? store.selectedMonth + "-01"))
        }
        for entry in budget.expenses {
            items.append(Recent(id: entry.id, label: entry.name, amount: entry.amount, color: entry.color, isIncome: false, date: entry.date ?? store.selectedMonth + "-01"))
        }
        items.sort { $0.date > $1.date }
        return Array(items.prefix(5))
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Button(action: onOpenLedger) {
                    HStack {
                        Text("Recent")
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

                if recentEntries.isEmpty {
                    EmptyStateView(
                        title: "Nothing logged yet",
                        subtitle: "Type a spend in the Ledger bar or import a statement.",
                        systemImage: "tray",
                        actionLabel: "Open ledger",
                        action: onOpenLedger
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Spacing.sm)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(recentEntries.enumerated()), id: \.element.id) { idx, entry in
                            Button(action: onOpenLedger) {
                                HStack(spacing: 10) {
                                    ColorDot(hex: entry.color, size: 9)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(entry.label)
                                            .font(.subheadline)
                                            .foregroundStyle(Color.ink)
                                            .lineLimit(1)
                                        if let day = TextImportDates.isoDay(entry.date) {
                                            Text(day.formatted(.dateTime.day().month(.abbreviated)))
                                                .font(.caption2)
                                                .foregroundStyle(Color.faint)
                                        }
                                    }
                                    Spacer()
                                    MoneyText(
                                        amount: entry.amount,
                                        currency: store.state.currency,
                                        font: .moneySmall,
                                        color: entry.isIncome ? .brandMint : .ink,
                                        isPrivate: store.state.privacyMode
                                    )
                                }
                                .padding(.vertical, 9)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .combine)

                            if idx < recentEntries.count - 1 {
                                Divider().background(Color.line)
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - AccountsSummaryStrip

struct AccountsSummaryStrip: View {
    var onOpenAccounts: () -> Void
    @Environment(LedgerStore.self) var store

    private var assetSummary: AssetSummary { FinanceEngine.assetSummary(store.effectiveAccounts) }
    private var debtSummary: DebtSummary   { FinanceEngine.debtSummary(store.effectiveAccounts) }
    private var netSummary: NetWorthSummary { FinanceEngine.netWorthSummary(store.effectiveAccounts) }

    var body: some View {
        Button(action: {
            Haptics.rowTap()
            onOpenAccounts()
        }) {
            HStack(spacing: 10) {
                chipView(label: "Assets", amount: assetSummary.totalAssets, color: .brandMint)
                chipView(label: "Debt",   amount: debtSummary.totalDebt,    color: .brandRed)
                chipView(label: "Net",    amount: netSummary.netWorth,       color: .brandBlue)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens accounts")
    }

    @ViewBuilder
    private func chipView(label: String, amount: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.eyebrow)
                .foregroundStyle(Color.muted)
            AnimatedMoneyText(
                amount: amount,
                currency: store.state.currency,
                font: .moneySmall,
                color: color,
                isPrivate: store.state.privacyMode
            )
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, 10)
        .background(color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

// MARK: - DashboardSummaryRows

/// The web dashboard's summary strip: scheduled debt payments, card utilisation
/// and the most recent import.
struct DashboardSummaryRows: View {
    @Environment(LedgerStore.self) var store

    private var accounts: [Account] { store.effectiveAccounts }
    private var monthlyPayments: Double {
        accounts.filter { $0.accountClass == .debt && $0.balance > 0 }.reduce(0) { $0 + max(0, $1.minimumPayment) }
    }
    private var utilization: Double { FinanceEngine.debtSummary(accounts).utilization }
    private var lastImport: ImportBatch? { store.state.importBatches.first }

    var body: some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                row(icon: "calendar.badge.clock", label: "Monthly payments",
                    value: store.state.privacyMode ? "•••" : formatMoney(monthlyPayments, currency: store.state.currency),
                    tone: .ink)
                Divider().padding(.leading, 44)
                row(icon: "creditcard", label: "Card utilisation",
                    value: accounts.contains { $0.accountClass == .debt && $0.creditLimit > 0 } ? formatPercent(utilization, digits: 0) : "No cards",
                    tone: utilization >= 80 ? .brandRed : utilization > 30 ? .brandAmber : .ink)
                Divider().padding(.leading, 44)
                row(icon: "square.and.arrow.down", label: "Last import",
                    value: lastImport.map { "\($0.importedRows) rows · \(relative($0.importedAt))" } ?? "Never",
                    tone: .ink)
            }
        }
    }

    @ViewBuilder
    private func row(icon: String, label: String, value: String, tone: Color) -> some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(Color.brandBlue)
                .frame(width: 20)
            Text(label)
                .font(.subheadline)
                .foregroundStyle(Color.muted)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(tone)
                .monospacedDigit()
                .lineLimit(1)
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .accessibilityElement(children: .combine)
    }

    private func relative(_ iso: String) -> String {
        guard let date = parseIsoTimestamp(iso) else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: .now)
    }
}

// MARK: - QuickActionsRow

struct QuickActionsRow: View {
    var onLog: () -> Void
    @Binding var importFlow: ImportFlowState
    var onAccounts: () -> Void
    var onGoals: () -> Void

    @Environment(LedgerStore.self) var store
    @State private var appeared = false

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        LazyVGrid(columns: columns, spacing: Spacing.md) {
            quickButton(label: "Log a spend", icon: "plus.circle.fill", color: .brandMint, delayIndex: 0, action: onLog)

            Menu {
                ImportMenuItems(flow: $importFlow)
            } label: {
                quickLabel(label: "Import", icon: "square.and.arrow.down.fill", color: .brandBlue)
            }
            .pressScale(0.95)
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 20)
            .motionAnimation(Motion.bouncy.delay(Motion.stagger + 0.05), value: appeared)

            quickButton(label: "Accounts", icon: "creditcard.fill", color: .brandAmber, delayIndex: 2, action: onAccounts)
            quickButton(label: "Goals", icon: "target", color: Color(hex: "#7a6cd6"), delayIndex: 3, action: onGoals)
        }
        .onAppear {
            withAnimation(Motion.bouncy.delay(0.1)) { appeared = true }
        }
    }

    @ViewBuilder
    private func quickLabel(label: String, icon: String, color: Color) -> some View {
        VStack(spacing: 7) {
            Image(systemName: icon)
                .font(.title2.weight(.semibold))
                .foregroundStyle(color)
            Text(label)
                .font(.caption2.weight(.medium))
                .foregroundStyle(Color.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(color.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }

    @ViewBuilder
    private func quickButton(label: String, icon: String, color: Color, delayIndex: Int, action: @escaping () -> Void) -> some View {
        Button(action: {
            Haptics.impact(.light)
            action()
        }) {
            quickLabel(label: label, icon: icon, color: color)
        }
        .buttonStyle(.plain)
        .pressScale(0.95)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 20)
        .motionAnimation(Motion.bouncy.delay(Double(delayIndex) * Motion.stagger + 0.05), value: appeared)
    }
}

// MARK: - Array safe subscript

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
