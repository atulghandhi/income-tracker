// DashboardScreen.swift
// Income Tracker — Dashboard feature screen.
// Swift 6 / iOS 17+

import SwiftUI
import Charts

// MARK: - DashboardScreen

struct DashboardScreen: View {
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @State private var selectedHorizon: Int = 24  // 12 / 24 / 60
    @State private var showSettings = false
    @State private var chartScrubIndex: Int? = nil

    @State private var netWorthPoints: [NetWorthPoint] = []
    @State private var isLoading = true
    @State private var horizonTrigger: Int = 24

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                NetWorthHeroCard(
                    points: netWorthPoints,
                    scrubIndex: $chartScrubIndex,
                    horizon: $selectedHorizon,
                    isLoading: isLoading
                )
                .transition(.scaleFade)

                MetricGridView(projection: projection)

                RecentTransactionsCard()

                AccountsSummaryStrip()

                QuickActionsRow()
            }
            .padding()
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle(greetingText)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 8) {
                    StatusPill(state: syncStatusPillState)
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                            .foregroundStyle(Color.muted)
                    }
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        .task(id: horizonTrigger) {
            await recomputeNetWorth()
        }
        .onChange(of: store.state.selectedMonth) { _, _ in
            horizonTrigger += 1
        }
        .onChange(of: selectedHorizon) { _, _ in
            Haptics.selection()
            horizonTrigger += 1
        }
    }

    // MARK: - Private helpers

    private func recomputeNetWorth() async {
        isLoading = true
        let state = store.state
        let horizon = selectedHorizon
        let points = await Task.detached(priority: .userInitiated) {
            FinanceEngine.netWorthOutlook(
                accounts: state.accounts,
                recurringMonthlySurplus: FinanceEngine.projection(
                    for: state.months[state.selectedMonth] ?? .empty
                ).recurringMonthlySurplus,
                horizonMonths: horizon,
                assumedInvestmentReturn: state.assumedInvestmentReturn
            )
        }.value
        netWorthPoints = points
        isLoading = false
    }

    var projection: Projection {
        FinanceEngine.projection(for: store.currentMonthBudget)
    }

    var greetingText: String {
        let hour = Calendar.current.component(.hour, from: .now)
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

// MARK: - NetWorthHeroCard

struct NetWorthHeroCard: View {
    var points: [NetWorthPoint]
    @Binding var scrubIndex: Int?
    @Binding var horizon: Int
    var isLoading: Bool = false
    @Environment(LedgerStore.self) var store

    private var displayPoint: NetWorthPoint? {
        if let idx = scrubIndex {
            return points[safe: idx]
        }
        return points.last
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Net worth")
                    .font(.cardTitle)
                    .foregroundStyle(Color.muted)

                AnimatedMoneyText(
                    amount: displayPoint?.netWorth ?? 0,
                    currency: store.state.currency,
                    font: .moneyLarge
                )
                .shimmer(isActive: isLoading)

                Picker("Horizon", selection: $horizon) {
                    Text("12M").tag(12)
                    Text("24M").tag(24)
                    Text("60M").tag(60)
                }
                .pickerStyle(.segmented)

                SparklineChart(points: points, scrubIndex: $scrubIndex)
                    .frame(height: 120)
                    .shimmer(isActive: isLoading)

                // Scrub label
                if let point = displayPoint, scrubIndex != nil {
                    Text(point.label)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .transition(.opacity)
                }
            }
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// MARK: - SparklineChart

struct SparklineChart: View {
    var points: [NetWorthPoint]
    @Binding var scrubIndex: Int?

    private var minNetWorth: Double { points.map(\.netWorth).min() ?? 0 }
    private var maxNetWorth: Double { points.map(\.netWorth).max() ?? 1 }

    var body: some View {
        Chart {
            // Asset area (background layer)
            ForEach(Array(points.enumerated()), id: \.offset) { idx, point in
                AreaMark(
                    x: .value("Month", idx),
                    y: .value("Assets", point.assetBalance)
                )
                .foregroundStyle(Color.brandBlue.opacity(0.10))
                .interpolationMethod(.catmullRom)
            }

            // Debt area (negative fill from top)
            ForEach(Array(points.enumerated()), id: \.offset) { idx, point in
                AreaMark(
                    x: .value("Month", idx),
                    y: .value("Debt", point.debtBalance)
                )
                .foregroundStyle(Color.brandRed.opacity(0.08))
                .interpolationMethod(.catmullRom)
            }

            // Net worth area fill
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

            // Net worth line
            ForEach(Array(points.enumerated()), id: \.offset) { idx, point in
                LineMark(
                    x: .value("Month", idx),
                    y: .value("Net Worth", point.netWorth)
                )
                .foregroundStyle(Color.brandMint)
                .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                .interpolationMethod(.catmullRom)
            }

            // Scrub vertical rule
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
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                updateScrubIndex(at: value.location, proxy: proxy, geo: geo)
                                Haptics.selection()
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
        guard !points.isEmpty else { return }
        let origin = geo[proxy.plotFrame!].origin
        let xInPlot = location.x - origin.x
        guard let xValue: Int = proxy.value(atX: xInPlot) else { return }
        let clamped = max(0, min(points.count - 1, xValue))
        if scrubIndex != clamped {
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
        LazyVGrid(columns: columns, spacing: 12) {
            MetricCard(
                label: "Income",
                value: formatted(projection.monthlyIncome),
                tone: .brandMint
            )
            .contentTransition(.numericText())
            .animation(Motion.standard, value: projection.monthlyIncome)
            .motionAnimation(Motion.standard, value: projection.monthlyIncome)

            MetricCard(
                label: "Outgoings",
                value: formatted(projection.monthlyExpenses),
                tone: .brandRed
            )
            .contentTransition(.numericText())
            .animation(Motion.standard, value: projection.monthlyExpenses)
            .motionAnimation(Motion.standard, value: projection.monthlyExpenses)

            MetricCard(
                label: "Surplus",
                value: formatted(projection.monthlySurplus),
                tone: projection.monthlySurplus >= 0 ? .brandMint : .brandRed
            )
            .contentTransition(.numericText())
            .animation(Motion.standard, value: projection.monthlySurplus)
            .motionAnimation(Motion.standard, value: projection.monthlySurplus)

            MetricCard(
                label: "Savings Rate",
                value: savingsRateFormatted,
                tone: savingsRateColor
            )
            .contentTransition(.numericText())
            .animation(Motion.standard, value: projection.savingsRate)
            .motionAnimation(Motion.standard, value: projection.savingsRate)
        }
    }

    private var savingsRateFormatted: String {
        String(format: "%.1f%%", projection.savingsRate)
    }

    private var savingsRateColor: Color {
        if projection.savingsRate >= store.state.savingsTarget { return .brandMint }
        if projection.savingsRate >= 10 { return .brandAmber }
        return .brandRed
    }

    private func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - RecentTransactionsCard

struct RecentTransactionsCard: View {
    @Environment(LedgerStore.self) var store

    private var recentEntries: [(id: String, label: String, amount: Double, color: String, isIncome: Bool)] {
        let budget = store.currentMonthBudget
        var items: [(id: String, label: String, amount: Double, color: String, isIncome: Bool, date: String)] = []

        for entry in budget.incomes {
            let date = entry.date ?? store.selectedMonth + "-01"
            items.append((id: entry.id, label: entry.source, amount: entry.amount, color: entry.color, isIncome: true, date: date))
        }
        for entry in budget.expenses {
            let date = entry.date ?? store.selectedMonth + "-01"
            items.append((id: entry.id, label: entry.name, amount: entry.amount, color: entry.color, isIncome: false, date: date))
        }

        // Sort by date descending then take 5
        items.sort { $0.date > $1.date }
        let top = Array(items.prefix(5))
        return top.map { (id: $0.id, label: $0.label, amount: $0.amount, color: $0.color, isIncome: $0.isIncome) }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Recent")
                        .font(.cardTitle)
                        .foregroundStyle(Color.ink)
                    Spacer()
                    Text(formatMonth(store.selectedMonth))
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }

                if recentEntries.isEmpty {
                    EmptyStateView(
                        title: "No transactions",
                        subtitle: "Add income or expenses in the Ledger tab.",
                        systemImage: "tray"
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(recentEntries.enumerated()), id: \.element.id) { idx, entry in
                            HStack(spacing: 10) {
                                ColorDot(hex: entry.color, size: 9)

                                Text(entry.label)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.ink)
                                    .lineLimit(1)

                                Spacer()

                                Text(formatted(entry.amount))
                                    .font(.moneySmall)
                                    .foregroundStyle(entry.isIncome ? Color.brandMint : Color.ink)
                            }
                            .padding(.vertical, 9)

                            if idx < recentEntries.count - 1 {
                                Divider()
                                    .background(Color.line)
                            }
                        }
                    }
                }
            }
        }
    }

    private func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - AccountsSummaryStrip

struct AccountsSummaryStrip: View {
    @Environment(LedgerStore.self) var store

    private var assetSummary: AssetSummary { FinanceEngine.assetSummary(store.state.accounts) }
    private var debtSummary: DebtSummary   { FinanceEngine.debtSummary(store.state.accounts) }
    private var netSummary: NetWorthSummary { FinanceEngine.netWorthSummary(store.state.accounts) }

    var body: some View {
        HStack(spacing: 10) {
            chipView(label: "Assets", amount: assetSummary.totalAssets, color: .brandMint)
            chipView(label: "Debt",   amount: debtSummary.totalDebt,    color: .brandRed)
            chipView(label: "Net",    amount: netSummary.netWorth,       color: .brandBlue)
        }
    }

    @ViewBuilder
    private func chipView(label: String, amount: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.eyebrow)
                .foregroundStyle(Color.muted)

            Text(formatted(amount))
                .font(.moneySmall)
                .foregroundStyle(color)
                .contentTransition(.numericText())
                .animation(Motion.standard, value: amount)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(color.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - QuickActionsRow

struct QuickActionsRow: View {
    @Environment(LedgerStore.self) var store
    @State private var showAddEntry = false
    @State private var showImport = false
    @State private var addKind: TransactionKind = .expense
    @State private var appeared = false

    // CSV import review
    @State private var csvImportRows: [CsvImportRow] = []
    @State private var csvFileName = ""
    @State private var showCSVReview = false
    @State private var csvImportError: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            // Add Entry
            quickButton(label: "Add Entry", icon: "plus.circle.fill", color: .brandMint, delayIndex: 0) {
                Haptics.impact(.light)
                showAddEntry = true
            }

            // Import CSV
            quickButton(label: "Import CSV", icon: "square.and.arrow.down.fill", color: .brandBlue, delayIndex: 1) {
                Haptics.impact(.light)
                showImport = true
            }
        }
        .onAppear {
            withAnimation(Motion.bouncy.delay(0.1)) { appeared = true }
        }
        .sheet(isPresented: $showAddEntry) {
            AddEntrySheet(kind: $addKind)
                .environment(store)
        }
        .fileImporter(
            isPresented: $showImport,
            allowedContentTypes: [.commaSeparatedText]
        ) { result in
            handleCSVImport(result: result)
        }
        .sheet(isPresented: $showCSVReview) {
            ImportReviewSheet(
                rows: csvImportRows,
                fileName: csvFileName,
                onConfirm: { confirmedRows in
                    store.commitCSVImport(rows: confirmedRows, fileName: csvFileName)
                    Haptics.confirmSave()
                    showCSVReview = false
                },
                onDismiss: { showCSVReview = false }
            )
        }
        .alert("Import error", isPresented: Binding(
            get: { csvImportError != nil },
            set: { if !$0 { csvImportError = nil } }
        )) {
            Button("OK") { csvImportError = nil }
        } message: {
            Text(csvImportError ?? "")
        }
    }

    private func handleCSVImport(result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            guard url.startAccessingSecurityScopedResource() else {
                csvImportError = "Could not open the selected file."
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else {
                csvImportError = "Could not read the selected file."
                return
            }
            let parsed = parseBankCsv(
                text: text,
                fileName: url.lastPathComponent,
                state: store.state
            )
            if parsed.rows.isEmpty {
                csvImportError = parsed.errors.first ?? "No importable transactions were found."
            } else {
                csvFileName = url.lastPathComponent
                csvImportRows = parsed.rows
                showCSVReview = true
            }
        case .failure(let error):
            csvImportError = error.localizedDescription
        }
    }

    @ViewBuilder
    private func quickButton(label: String, icon: String, color: Color, delayIndex: Int, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 7) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(color)
                Text(label)
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .pressScale(0.95)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 20)
        .animation(Motion.bouncy.delay(Double(delayIndex) * Motion.stagger + 0.05), value: appeared)
    }
}

// MARK: - Array safe subscript

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
