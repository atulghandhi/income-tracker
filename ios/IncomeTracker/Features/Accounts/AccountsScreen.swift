// AccountsScreen.swift
// Income Tracker — Accounts feature screen.
// Swift 6 / iOS 17+

import SwiftUI
import Charts

// MARK: - AccountClass extensions

extension AccountClass: CaseIterable {
    public static var allCases: [AccountClass] { [.cash, .savings, .investment, .debt] }

    var displayName: String {
        switch self {
        case .cash:       return "Cash"
        case .savings:    return "Savings"
        case .investment: return "Investments"
        case .debt:       return "Debt"
        }
    }

    var symbol: String {
        switch self {
        case .cash:       return "banknote"
        case .savings:    return "building.columns"
        case .investment: return "chart.line.uptrend.xyaxis"
        case .debt:       return "creditcard"
        }
    }
}

extension AccountType {
    var displayName: String {
        switch self {
        case .creditCard:     return "Credit card"
        case .loan:           return "Loan"
        case .overdraft:      return "Overdraft"
        case .other:          return "Other"
        case .current:        return "Current account"
        case .savingsAccount: return "Savings account"
        case .isa:            return "ISA"
        case .investment:     return "Investment account"
        case .pension:        return "Pension"
        case .otherAsset:     return "Other asset"
        }
    }
}

/// "3.9%" rather than "3.9000000000000004%".
func formatPercent(_ value: Double, digits: Int = 1) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 0
    formatter.maximumFractionDigits = digits
    return (formatter.string(from: NSNumber(value: value)) ?? "\(value)") + "%"
}

// MARK: - AccountsScreen

struct AccountsScreen: View {
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @State private var filter: AccountClass? = nil
    @State private var showAddAccount = false
    @State private var editingAccount: Account? = nil
    @State private var showSettings = false
    @State private var pendingDelete: Account? = nil

    private var isPrivate: Bool { store.state.privacyMode }

    var filteredAccounts: [Account] {
        // Rolled-forward balances: debt accounts show what's left after the scheduled
        // (or linked) payments since their snapshot month, not the raw stored figure.
        guard let f = filter else { return store.effectiveAccounts }
        return store.effectiveAccounts.filter { $0.accountClass == f }
    }

    var accountsByClass: [(AccountClass, [Account])] {
        AccountClass.allCases.compactMap { cls in
            let items = filteredAccounts.filter { $0.accountClass == cls }
            return items.isEmpty ? nil : (cls, items)
        }
    }

    private var debtSummary: DebtSummary { FinanceEngine.debtSummary(store.effectiveAccounts) }
    private var utilizationHigh: Bool { debtSummary.utilization >= 80 }

    var body: some View {
        List {
            Section {
                NetWorthSummaryCard()
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                AccountsMetricRow()
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                FilterChipsRow(selected: $filter)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if store.state.accounts.isEmpty {
                Section {
                    EmptyStateView(
                        title: "No accounts yet",
                        subtitle: "Add your cash, savings, investments and debts to see your net worth and where it is heading.",
                        systemImage: "creditcard.and.123",
                        actionLabel: "Add account"
                    ) {
                        showAddAccount = true
                        Haptics.impact(.light)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            } else if accountsByClass.isEmpty {
                Section {
                    EmptyStateView(
                        title: "Nothing in this class",
                        subtitle: "Switch the filter or add an account.",
                        systemImage: "line.3.horizontal.decrease.circle"
                    )
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            } else {
                ForEach(accountsByClass, id: \.0) { cls, accounts in
                    Section {
                        ForEach(accounts) { account in
                            AccountRow(account: account)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    editingAccount = account
                                    Haptics.impact(.light)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        pendingDelete = account
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                    Button {
                                        editingAccount = account
                                    } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    .tint(.brandBlue)
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        store.duplicateAccount(id: account.id)
                                        Haptics.impact(.medium)
                                    } label: {
                                        Label("Duplicate", systemImage: "plus.square.on.square")
                                    }
                                    .tint(.brandMint)
                                }
                                .contextMenu {
                                    Button { editingAccount = account } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    Button {
                                        store.duplicateAccount(id: account.id)
                                    } label: {
                                        Label("Duplicate", systemImage: "plus.square.on.square")
                                    }
                                    Button {
                                        var updated = account
                                        updated.includeInNetWorth.toggle()
                                        store.updateAccount(updated)
                                    } label: {
                                        Label(
                                            account.includeInNetWorth ? "Exclude from net worth" : "Include in net worth",
                                            systemImage: account.includeInNetWorth ? "minus.circle" : "plus.circle"
                                        )
                                    }
                                    Divider()
                                    Button(role: .destructive) {
                                        pendingDelete = account
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityHint("Double tap to edit")
                        }
                        .onMove { source, destination in
                            move(source: source, destination: destination, within: accounts)
                        }
                    } header: {
                        SectionHeader(
                            title: cls.displayName,
                            total: isPrivate ? "•••" : formatMoney(accounts.reduce(0) { $0 + $1.balance }, currency: store.state.currency),
                            color: cls == .debt ? .brandRed : .brandMint
                        )
                    }
                }
            }

            Section {
                InvestmentAssumptionRow()
            } header: {
                SectionHeader(title: "Assumptions")
            } footer: {
                Text("Used for the net-worth outlook and the widgets. Balances of investment accounts grow at this rate; savings use their own AER.")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Accounts")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                        .foregroundStyle(Color.muted)
                }
                .accessibilityLabel("Settings")
            }
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: Spacing.sm) {
                    if store.state.accounts.count > 1 {
                        EditButton()
                    }
                    Button {
                        showAddAccount = true
                        Haptics.impact(.light)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add account")
                }
            }
        }
        .sheet(isPresented: $showAddAccount) {
            AccountEditorSheet(account: nil)
                .environment(store)
        }
        .sheet(item: $editingAccount) { account in
            AccountEditorSheet(account: account)
                .environment(store)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        .alert("Delete \(pendingDelete?.name ?? "account")?", isPresented: Binding(
            get: { pendingDelete != nil },
            set: { if !$0 { pendingDelete = nil } }
        )) {
            Button("Delete", role: .destructive) {
                if let account = pendingDelete {
                    withAnimation(Motion.snappy) { store.removeAccount(id: account.id) }
                    Haptics.notification(.error)
                }
                pendingDelete = nil
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("Linked payments in the ledger stay; only the account and its balance history go.")
        }
        .onChange(of: utilizationHigh) { _, high in
            if high { Haptics.notification(.warning) }
        }
    }

    /// Maps a move inside one class section onto the full accounts array.
    private func move(source: IndexSet, destination: Int, within accounts: [Account]) {
        let all = store.state.accounts
        let globalSource = IndexSet(source.compactMap { index in
            all.firstIndex(where: { $0.id == accounts[index].id })
        })
        let globalDestination: Int
        if destination < accounts.count, let index = all.firstIndex(where: { $0.id == accounts[destination].id }) {
            globalDestination = index
        } else if let last = accounts.last, let index = all.firstIndex(where: { $0.id == last.id }) {
            globalDestination = index + 1
        } else {
            globalDestination = all.count
        }
        store.moveAccounts(from: globalSource, to: globalDestination)
        Haptics.selection()
    }
}

// MARK: - FilterChipsRow

private struct FilterChipsRow: View {
    @Binding var selected: AccountClass?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Spacing.sm) {
                FilterChip(label: "All", isSelected: selected == nil) {
                    withAnimation(Motion.snappy) { selected = nil }
                    Haptics.selection()
                }
                ForEach(AccountClass.allCases, id: \.self) { cls in
                    FilterChip(label: cls.displayName, isSelected: selected == cls) {
                        withAnimation(Motion.snappy) {
                            selected = selected == cls ? nil : cls
                        }
                        Haptics.selection()
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }
}

private struct FilterChip: View {
    var label: String
    var isSelected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(isSelected ? Color.surface : Color.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Capsule().fill(isSelected ? Color.brandBlue : Color.surfaceHigh))
                .overlay(Capsule().strokeBorder(isSelected ? Color.clear : Color.line, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .motionAnimation(Motion.snappy, value: isSelected)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

// MARK: - NetWorthSummaryCard

struct NetWorthSummaryCard: View {
    @Environment(LedgerStore.self) var store

    private var summary: NetWorthSummary { FinanceEngine.netWorthSummary(store.effectiveAccounts) }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.lg) {
                Text("Net worth")
                    .font(.cardTitle)
                    .foregroundStyle(Color.muted)

                AnimatedMoneyText(
                    amount: summary.netWorth,
                    currency: store.state.currency,
                    font: .moneyLarge,
                    color: summary.netWorth >= 0 ? .brandMint : .brandRed,
                    isPrivate: store.state.privacyMode
                )

                // Stacked bar: assets (mint) vs debt (red)
                GeometryReader { geo in
                    let total = summary.totalAssets + summary.totalDebt
                    let assetFraction = total > 0 ? min(summary.totalAssets / total, 1.0) : 1.0
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.brandRed.opacity(0.3))
                            .frame(height: 8)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.brandMint)
                            .frame(width: max(geo.size.width * assetFraction, 0), height: 8)
                    }
                }
                .frame(height: 8)
                .motionAnimation(Motion.standard, value: summary.totalAssets)
                .accessibilityHidden(true)

                HStack(spacing: Spacing.md) {
                    metricItem("Assets", value: summary.totalAssets, color: .brandMint)
                    Divider().frame(height: 32)
                    metricItem("Debt", value: summary.totalDebt, color: .brandRed)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func metricItem(_ label: String, value: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(Color.muted)
            MoneyText(
                amount: value,
                currency: store.state.currency,
                font: .moneySmall,
                color: color,
                isPrivate: store.state.privacyMode
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - AccountsMetricRow

/// The web's "Monthly into accounts" and "Card utilization" tiles plus the scheduled
/// debt payments, side by side.
struct AccountsMetricRow: View {
    @Environment(LedgerStore.self) var store

    private var accounts: [Account] { store.effectiveAccounts }
    private var monthlyIntoAccounts: Double {
        accounts.filter { $0.accountClass != .debt }.reduce(0) { $0 + max(0, $1.monthlyContribution) }
    }
    private var monthlyPayments: Double {
        accounts.filter { $0.accountClass == .debt && $0.balance > 0 }.reduce(0) { $0 + max(0, $1.minimumPayment) }
    }
    private var debt: DebtSummary { FinanceEngine.debtSummary(accounts) }

    var body: some View {
        HStack(spacing: Spacing.md) {
            MetricCard(
                label: "Into accounts",
                value: formatMoney(monthlyIntoAccounts, currency: store.state.currency),
                tone: .brandMint,
                isPrivate: store.state.privacyMode,
                detail: "per month"
            )
            MetricCard(
                label: "Debt payments",
                value: formatMoney(monthlyPayments, currency: store.state.currency),
                tone: .brandRed,
                isPrivate: store.state.privacyMode,
                detail: "per month"
            )
            MetricCard(
                label: "Utilisation",
                value: formatPercent(debt.utilization, digits: 0),
                tone: debt.utilization >= 80 ? .brandRed : debt.utilization > 30 ? .brandAmber : .ink,
                detail: debt.utilization >= 80 ? "keep under 30%" : "of card limits"
            )
        }
    }
}

// MARK: - InvestmentAssumptionRow

struct InvestmentAssumptionRow: View {
    @Environment(LedgerStore.self) var store

    var body: some View {
        Stepper(
            value: Binding(
                get: { store.state.assumedInvestmentReturn },
                set: { store.setAssumedInvestmentReturn(($0 * 2).rounded() / 2) }
            ),
            in: -50...50,
            step: 0.5
        ) {
            HStack {
                Text("Investment return")
                    .foregroundStyle(Color.ink)
                Spacer()
                Text("\(formatPercent(store.state.assumedInvestmentReturn)) a year")
                    .foregroundStyle(Color.muted)
                    .monospacedDigit()
            }
        }
        .accessibilityLabel("Assumed investment return")
        .accessibilityValue("\(formatPercent(store.state.assumedInvestmentReturn)) a year")
    }
}

// MARK: - AccountRow

struct AccountRow: View {
    var account: Account
    @Environment(LedgerStore.self) var store

    var body: some View {
        HStack(spacing: Spacing.md) {
            ZStack {
                Circle()
                    .fill(Color(hex: account.color).opacity(0.18))
                Image(systemName: account.accountClass.symbol)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color(hex: account.color))
            }
            .frame(width: 34, height: 34)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                    .font(.body)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Text(secondaryLabel)
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .lineLimit(2)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                MoneyText(
                    amount: account.balance,
                    currency: store.state.currency,
                    font: .moneySmall,
                    color: account.accountClass == .debt ? .brandRed : .ink,
                    isPrivate: store.state.privacyMode
                )
                if account.accountClass == .debt && account.creditLimit > 0 {
                    Text("\(formatPercent((account.balance / account.creditLimit) * 100, digits: 0)) used")
                        .font(.caption2)
                        .foregroundStyle((account.balance / account.creditLimit) >= 0.8 ? Color.brandRed : Color.muted)
                }
                if let note = autoTrackNote {
                    Text(note)
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                }
                if !account.includeInNetWorth {
                    Text("Excluded")
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                }
            }
        }
        .padding(.vertical, 4)
    }

    /// Shown when the displayed balance was rolled forward past its snapshot month, so the
    /// user knows the figure is auto-tracked (editing the balance re-anchors it).
    private var autoTrackNote: String? {
        guard account.accountClass == .debt,
              let stored = store.state.accounts.first(where: { $0.id == account.id }),
              stored.balance != account.balance,
              let anchor = stored.balanceAsOf else { return nil }
        return "Auto-tracked since \(formatMonth(anchor))"
    }

    private var secondaryLabel: String {
        switch account.accountClass {
        case .debt:
            var parts: [String] = []
            if account.promoMonths > 0 {
                let anchor = account.balanceAsOf ?? getMonthKey()
                let promoEnds = shiftMonth(anchor, by: account.promoMonths)
                parts.append("\(formatPercent(account.promoRate)) until \(formatMonth(promoEnds)), then \(formatPercent(account.rate)) APR")
            } else {
                parts.append("\(formatPercent(account.rate)) APR")
            }
            if account.minimumPayment > 0 {
                let money = store.state.privacyMode ? "•••" : formatMoney(account.minimumPayment, currency: store.state.currency)
                parts.append("\(money) due on the \(ordinalDay(account.dueDay))")
            }
            return parts.joined(separator: " · ")
        case .savings:
            return "\(formatPercent(account.rate)) AER" + contributionSuffix
        case .investment:
            return "\(formatPercent(account.rate)) expected" + contributionSuffix
        case .cash:
            return account.type.displayName + contributionSuffix
        }
    }

    private var contributionSuffix: String {
        guard account.monthlyContribution > 0 else { return "" }
        let money = store.state.privacyMode ? "•••" : formatMoney(account.monthlyContribution, currency: store.state.currency)
        return " · \(money)/month in"
    }

    private func ordinalDay(_ day: Int) -> String {
        let suffix: String
        switch day % 10 {
        case 1 where day % 100 != 11: suffix = "st"
        case 2 where day % 100 != 12: suffix = "nd"
        case 3 where day % 100 != 13: suffix = "rd"
        default: suffix = "th"
        }
        return "\(day)\(suffix)"
    }
}

// MARK: - AccountEditorSheet

struct AccountEditorSheet: View {
    var account: Account?
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var accountClass: AccountClass = .cash
    @State private var accountType: AccountType = .current
    @State private var balance: String = ""
    @State private var rate: String = ""
    @State private var promoRate: String = ""
    @State private var promoMonths: String = ""
    @State private var monthlyContribution: String = ""
    @State private var creditLimit: String = ""
    @State private var minimumPayment: String = ""
    @State private var dueDay: String = "1"
    @State private var includeInNetWorth = true
    @State private var colorHex = CATEGORY_COLORS[0]
    @State private var note = ""
    @State private var showDeleteConfirm = false
    @FocusState private var nameFocused: Bool

    private var isEditing: Bool { account != nil }

    private var typeOptions: [AccountTypeOption] {
        ACCOUNT_TYPE_OPTIONS[accountClass] ?? []
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Account name", text: $name)
                        .focused($nameFocused)
                        .textInputAutocapitalization(.words)
                    Picker("Class", selection: $accountClass) {
                        ForEach(AccountClass.allCases, id: \.self) { cls in
                            Text(cls.displayName).tag(cls)
                        }
                    }
                    .onChange(of: accountClass) { _, newClass in
                        accountType = resolveAccountType(accountType, for: newClass)
                        Haptics.selection()
                    }

                    Picker("Type", selection: $accountType) {
                        ForEach(typeOptions, id: \.value) { option in
                            Text(option.label).tag(option.value)
                        }
                    }
                }

                Section {
                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $balance)
                            .keyboardType(.decimalPad)
                    }
                } header: {
                    Text(accountClass == .debt ? "Balance owed" : "Balance")
                } footer: {
                    if accountClass == .debt {
                        Text("Debt balances roll forward each month by the scheduled payment (or the payments you link in the ledger). Edit the figure whenever your statement says otherwise.")
                    }
                }

                Section(rateSection) {
                    HStack {
                        TextField("0.0", text: $rate)
                            .keyboardType(.decimalPad)
                        Text(rateLabel)
                            .foregroundStyle(Color.muted)
                    }

                    if accountClass == .debt {
                        HStack {
                            TextField("0.0", text: $promoRate)
                                .keyboardType(.decimalPad)
                            Text("% promo rate")
                                .foregroundStyle(Color.muted)
                        }
                        HStack {
                            TextField("0", text: $promoMonths)
                                .keyboardType(.numberPad)
                            Text("promo months left")
                                .foregroundStyle(Color.muted)
                        }
                    }
                }

                if accountClass != .debt {
                    Section {
                        HStack {
                            Text(FinanceEngine.currencySymbol(for: store.state.currency))
                                .foregroundStyle(Color.muted)
                            TextField("0.00", text: $monthlyContribution)
                                .keyboardType(.decimalPad)
                        }
                    } header: {
                        Text("Monthly contribution")
                    } footer: {
                        Text("Surplus routed into this account every month in the net-worth outlook.")
                    }
                }

                if accountClass == .debt {
                    Section("Credit details") {
                        LabeledContent("Limit") {
                            TextField("0.00", text: $creditLimit)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                        LabeledContent("Minimum payment") {
                            TextField("0.00", text: $minimumPayment)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                        LabeledContent("Due day of month") {
                            TextField("1", text: $dueDay)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }

                Section("Options") {
                    Toggle("Include in net worth", isOn: $includeInNetWorth)

                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Colour").foregroundStyle(Color.muted)
                        ColorSwatchGrid(selected: $colorHex)
                    }
                }

                Section("Note") {
                    TextField("Optional note…", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Text("Delete account")
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle(isEditing ? "Edit account" : "Add account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                        Haptics.confirmSave()
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    .fontWeight(.semibold)
                }
            }
            .confirmationDialog("Delete \(name)?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete account", role: .destructive) {
                    if let id = account?.id {
                        store.removeAccount(id: id)
                    }
                    Haptics.notification(.error)
                    dismiss()
                }
            }
            .onAppear {
                populateFromAccount()
                if !isEditing { nameFocused = true }
            }
        }
    }

    // MARK: - Computed helpers

    private var rateSection: String {
        switch accountClass {
        case .debt:       return "Interest rate"
        case .savings:    return "Interest rate (AER)"
        case .investment: return "Expected return"
        case .cash:       return "Rate"
        }
    }

    private var rateLabel: String {
        switch accountClass {
        case .debt:       return "% APR"
        case .savings:    return "% AER"
        case .investment: return "% a year"
        case .cash:       return "%"
        }
    }

    // MARK: - Population / save

    private func populateFromAccount() {
        guard let a = account else { return }
        name = a.name
        accountClass = a.accountClass
        accountType = a.type
        balance = formatAmountInput(a.balance)
        rate = formatAmountInput(a.rate, fractionDigits: 2)
        promoRate = formatAmountInput(a.promoRate, fractionDigits: 2)
        promoMonths = String(a.promoMonths)
        monthlyContribution = formatAmountInput(a.monthlyContribution)
        creditLimit = formatAmountInput(a.creditLimit)
        minimumPayment = formatAmountInput(a.minimumPayment)
        dueDay = String(a.dueDay)
        includeInNetWorth = a.includeInNetWorth
        colorHex = a.color
        note = a.note
    }

    private func save() {
        let id = account?.id ?? createId(prefix: "account")
        let isDebt = accountClass == .debt
        let built = Account(
            id: id,
            name: name.trimmingCharacters(in: .whitespaces),
            accountClass: accountClass,
            type: resolveAccountType(accountType, for: accountClass),
            balance: parseAmountInput(balance) ?? 0,
            rate: parseAmountInput(rate) ?? 0,
            promoRate: max(0, parseAmountInput(promoRate) ?? 0),
            promoMonths: clampWholeNumber(Double(parseIntegerInput(promoMonths) ?? 0), max: 120),
            monthlyContribution: isDebt ? 0 : max(0, parseAmountInput(monthlyContribution) ?? 0),
            creditLimit: isDebt ? (parseAmountInput(creditLimit) ?? 0) : 0,
            minimumPayment: isDebt ? (parseAmountInput(minimumPayment) ?? 0) : 0,
            dueDay: isDebt ? clampDueDay(Double(parseIntegerInput(dueDay) ?? 1)) : 1,
            balanceAsOf: account?.balanceAsOf,
            includeInNetWorth: includeInNetWorth,
            color: colorHex,
            note: note
        )
        if isEditing {
            store.updateAccount(built)
        } else {
            store.addAccount(built)
        }
    }
}
