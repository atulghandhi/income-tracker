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
}

extension AccountType {
    var displayName: String {
        switch self {
        case .creditCard:    return "Credit Card"
        case .loan:          return "Loan"
        case .overdraft:     return "Overdraft"
        case .other:         return "Other"
        case .current:       return "Current Account"
        case .savingsAccount: return "Savings Account"
        case .isa:           return "ISA"
        case .investment:    return "Investment Account"
        case .pension:       return "Pension"
        case .otherAsset:    return "Other Asset"
        }
    }
}

// MARK: - AccountsScreen

struct AccountsScreen: View {
    @Environment(LedgerStore.self) var store
    @State private var filter: AccountClass? = nil
    @State private var showAddAccount = false
    @State private var editingAccount: Account? = nil

    var filteredAccounts: [Account] {
        guard let f = filter else { return store.state.accounts }
        return store.state.accounts.filter { $0.accountClass == f }
    }

    var accountsByClass: [(AccountClass, [Account])] {
        AccountClass.allCases.compactMap { cls in
            let items = filteredAccounts.filter { $0.accountClass == cls }
            return items.isEmpty ? nil : (cls, items)
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                NetWorthSummaryCard()
                FilterChipsRow(selected: $filter)

                if store.state.accounts.isEmpty {
                    EmptyStateView(
                        title: "No accounts yet",
                        subtitle: "Add your cash, savings, investments, and debts to track your net worth.",
                        systemImage: "creditcard.and.123",
                        actionLabel: "Add Account"
                    ) {
                        showAddAccount = true
                        Haptics.impact(.light)
                    }
                    .padding(.top, 40)
                } else if accountsByClass.isEmpty {
                    EmptyStateView(
                        title: "No accounts in this class",
                        subtitle: "Switch filter or add a new account.",
                        systemImage: "line.3.horizontal.decrease.circle"
                    )
                    .padding(.top, 40)
                } else {
                    ForEach(accountsByClass, id: \.0) { cls, accounts in
                        AccountClassSection(
                            accountClass: cls,
                            accounts: accounts,
                            onEdit: { editingAccount = $0 }
                        )
                    }
                }
            }
            .padding()
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Accounts")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddAccount = true
                    Haptics.impact(.light)
                } label: {
                    Image(systemName: "plus")
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
    }
}

// MARK: - FilterChipsRow

private struct FilterChipsRow: View {
    @Binding var selected: AccountClass?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
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
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isSelected ? Color.surface : Color.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(isSelected ? Color.brandBlue : Color.surfaceHigh)
                )
                .overlay(
                    Capsule()
                        .strokeBorder(isSelected ? Color.clear : Color.lineStrong, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
        .animation(Motion.snappy, value: isSelected)
    }
}

// MARK: - NetWorthSummaryCard

struct NetWorthSummaryCard: View {
    @Environment(LedgerStore.self) var store

    private var summary: NetWorthSummary { FinanceEngine.netWorthSummary(store.state.accounts) }
    private var debt: DebtSummary { FinanceEngine.debtSummary(store.state.accounts) }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 16) {
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
                .animation(Motion.standard, value: summary.totalAssets)

                // Metrics row
                HStack(spacing: 12) {
                    metricItem("Assets", value: summary.totalAssets, color: .brandMint)
                    Divider().frame(height: 32)
                    metricItem("Debt", value: summary.totalDebt, color: .brandRed)
                    Divider().frame(height: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Utilization")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        Text(String(format: "%.0f%%", debt.utilization))
                            .font(.moneySmall)
                            .foregroundStyle(
                                debt.utilization > 75 ? Color.brandRed
                                : debt.utilization > 30 ? Color.brandAmber
                                : Color.ink
                            )
                    }
                }
            }
        }
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

// MARK: - AccountClassSection

struct AccountClassSection: View {
    var accountClass: AccountClass
    var accounts: [Account]
    var onEdit: (Account) -> Void
    @Environment(LedgerStore.self) var store

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: accountClass.displayName)

            ForEach(accounts) { account in
                AccountRow(account: account)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onEdit(account)
                        Haptics.impact(.light)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            withAnimation(Motion.snappy) {
                                store.removeAccount(id: account.id)
                            }
                            Haptics.notification(.error)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }

                        Button { onEdit(account) } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        .tint(.brandBlue)
                    }
                    .contextMenu {
                        Button { onEdit(account) } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        Button {
                            var updated = account
                            updated.includeInNetWorth.toggle()
                            store.updateAccount(updated)
                        } label: {
                            Label(
                                account.includeInNetWorth
                                    ? "Exclude from net worth"
                                    : "Include in net worth",
                                systemImage: account.includeInNetWorth
                                    ? "minus.circle"
                                    : "plus.circle"
                            )
                        }
                        Divider()
                        Button(role: .destructive) {
                            store.removeAccount(id: account.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .transition(.slideIn())
            }
        }
    }
}

// MARK: - AccountRow

struct AccountRow: View {
    var account: Account
    @Environment(LedgerStore.self) var store

    var body: some View {
        Card(padding: 14) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color(hex: account.color))
                    .frame(width: 10, height: 10)

                VStack(alignment: .leading, spacing: 2) {
                    Text(account.name)
                        .font(.body)
                        .foregroundStyle(Color.ink)
                    Text(secondaryLabel)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
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
                        Text(String(format: "%.0f%% used", (account.balance / account.creditLimit) * 100))
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                    }
                    if !account.includeInNetWorth {
                        Text("Excluded")
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                    }
                }
            }
        }
    }

    private var secondaryLabel: String {
        switch account.accountClass {
        case .debt:
            if account.promoMonths > 0 {
                return "\(account.promoRate)% promo \u{2192} \(account.rate)% APR"
            }
            return "\(account.rate)% APR"
        case .savings:
            return "\(account.rate)% AER"
        case .investment:
            return "\(account.rate)% expected return"
        case .cash:
            return account.type.displayName
        }
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
    @State private var balance: String = "0"
    @State private var rate: String = "0"
    @State private var promoRate: String = "0"
    @State private var promoMonths: String = "0"
    @State private var monthlyContribution: String = "0"
    @State private var creditLimit: String = "0"
    @State private var minimumPayment: String = "0"
    @State private var dueDay: String = "1"
    @State private var includeInNetWorth = true
    @State private var colorHex = CATEGORY_COLORS[0]
    @State private var note = ""

    private var isEditing: Bool { account != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Account name", text: $name)
                    Picker("Class", selection: $accountClass) {
                        ForEach(AccountClass.allCases, id: \.self) { cls in
                            Text(cls.displayName).tag(cls)
                        }
                    }
                    .onChange(of: accountClass) { _, _ in
                        accountType = defaultType(for: accountClass)
                        Haptics.selection()
                    }

                    Picker("Type", selection: $accountType) {
                        ForEach(accountTypes(for: accountClass), id: \.self) { t in
                            Text(t.displayName).tag(t)
                        }
                    }
                }

                Section("Balance") {
                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $balance)
                            .keyboardType(.decimalPad)
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
                            Text("promo months")
                                .foregroundStyle(Color.muted)
                        }
                    }
                }

                if accountClass != .debt {
                    Section("Monthly contribution") {
                        HStack {
                            Text(FinanceEngine.currencySymbol(for: store.state.currency))
                                .foregroundStyle(Color.muted)
                            TextField("0.00", text: $monthlyContribution)
                                .keyboardType(.decimalPad)
                        }
                    }
                }

                if accountClass == .debt {
                    Section("Credit details") {
                        HStack {
                            Text("Limit").foregroundStyle(Color.muted)
                            Spacer()
                            TextField("0.00", text: $creditLimit)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                        HStack {
                            Text("Min. payment").foregroundStyle(Color.muted)
                            Spacer()
                            TextField("0.00", text: $minimumPayment)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                        HStack {
                            Text("Due day").foregroundStyle(Color.muted)
                            Spacer()
                            TextField("1", text: $dueDay)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }

                Section("Options") {
                    Toggle("Include in net worth", isOn: $includeInNetWorth)

                    HStack(spacing: 10) {
                        Text("Color").foregroundStyle(Color.muted)
                        Spacer()
                        ForEach(CATEGORY_COLORS, id: \.self) { hex in
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 22, height: 22)
                                .overlay(
                                    Circle()
                                        .strokeBorder(Color.white, lineWidth: colorHex == hex ? 2.5 : 0)
                                )
                                .shadow(color: colorHex == hex ? Color(hex: hex).opacity(0.5) : .clear, radius: 3)
                                .onTapGesture {
                                    colorHex = hex
                                    Haptics.selection()
                                }
                                .animation(Motion.snappy, value: colorHex)
                        }
                    }
                }

                Section("Note") {
                    TextField("Optional note…", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            if let id = account?.id {
                                store.removeAccount(id: id)
                            }
                            Haptics.notification(.error)
                            dismiss()
                        } label: {
                            Text("Delete account")
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Account" : "Add Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        save()
                        Haptics.confirmSave()
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { populateFromAccount() }
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
        case .investment: return "% p.a."
        case .cash:       return "%"
        }
    }

    private func defaultType(for cls: AccountClass) -> AccountType {
        switch cls {
        case .cash:       return .current
        case .savings:    return .savingsAccount
        case .investment: return .investment
        case .debt:       return .creditCard
        }
    }

    private func accountTypes(for cls: AccountClass) -> [AccountType] {
        switch cls {
        case .cash:       return [.current, .other]
        case .savings:    return [.savingsAccount, .isa, .other]
        case .investment: return [.investment, .pension, .otherAsset]
        case .debt:       return [.creditCard, .loan, .overdraft, .other]
        }
    }

    // MARK: - Population / save

    private func populateFromAccount() {
        guard let a = account else { return }
        name = a.name
        accountClass = a.accountClass
        accountType = a.type
        balance = String(a.balance)
        rate = String(a.rate)
        promoRate = String(a.promoRate)
        promoMonths = String(a.promoMonths)
        monthlyContribution = String(a.monthlyContribution)
        creditLimit = String(a.creditLimit)
        minimumPayment = String(a.minimumPayment)
        dueDay = String(a.dueDay)
        includeInNetWorth = a.includeInNetWorth
        colorHex = a.color
        note = a.note
    }

    private func save() {
        let id = account?.id ?? createId(prefix: "acc")
        let built = Account(
            id: id,
            name: name.trimmingCharacters(in: .whitespaces),
            accountClass: accountClass,
            type: accountType,
            balance: Double(balance) ?? 0,
            rate: Double(rate) ?? 0,
            promoRate: Double(promoRate) ?? 0,
            promoMonths: Int(promoMonths) ?? 0,
            monthlyContribution: Double(monthlyContribution) ?? 0,
            creditLimit: Double(creditLimit) ?? 0,
            minimumPayment: Double(minimumPayment) ?? 0,
            dueDay: Int(dueDay) ?? 1,
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
