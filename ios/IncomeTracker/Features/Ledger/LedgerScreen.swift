// LedgerScreen.swift
// Income Tracker — Ledger feature screen.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - LedgerScreen

struct LedgerScreen: View {
    @Environment(LedgerStore.self) var store
    @State private var showAddSheet = false
    @State private var addKind: TransactionKind = .income
    @State private var editingEntry: EntryEdit? = nil
    @State private var collapsedCategories: Set<String> = []
    @State private var showMonthPicker = false
    @State private var searchText = ""

    enum EntryEdit: Identifiable {
        case income(IncomeEntry)
        case expense(ExpenseEntry)

        var id: String {
            switch self {
            case .income(let e):  return e.id
            case .expense(let e): return e.id
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            SurplusBar(projection: projection)

            List {
                // MARK: Income Section
                Section {
                    if filteredIncomes.isEmpty && !searchText.isEmpty {
                        Text("No matching income")
                            .font(.subheadline)
                            .foregroundStyle(Color.muted)
                            .padding(.vertical, 8)
                    } else if store.currentMonthBudget.incomes.isEmpty {
                        EmptyStateView(
                            title: "No income yet",
                            subtitle: "Tap + to add your first income source.",
                            systemImage: "arrow.down.circle",
                            actionLabel: "Add Income"
                        ) {
                            addKind = .income
                            showAddSheet = true
                            Haptics.impact(.light)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    } else {
                        ForEach(filteredIncomes) { entry in
                            IncomeRow(entry: entry)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        withAnimation(Motion.snappy) {
                                            store.removeIncome(id: entry.id)
                                        }
                                        Haptics.destructiveAction()
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }

                                    Button {
                                        let copy = IncomeEntry(
                                            id: createId(prefix: "inc"),
                                            source: entry.source,
                                            amount: entry.amount,
                                            color: entry.color,
                                            recurring: entry.recurring
                                        )
                                        store.addIncome(copy)
                                        Haptics.confirmSave()
                                    } label: {
                                        Label("Duplicate", systemImage: "plus.square.on.square")
                                    }
                                    .tint(.brandBlue)
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        var updated = entry
                                        updated.recurring.toggle()
                                        store.updateIncome(updated)
                                        Haptics.impact(.light)
                                    } label: {
                                        Label(
                                            entry.recurring ? "One-off" : "Recurring",
                                            systemImage: "arrow.triangle.2.circlepath"
                                        )
                                    }
                                    .tint(.brandMint)

                                    Button { editingEntry = .income(entry) } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    .tint(.brandBlue)
                                }
                                .onTapGesture {
                                    Haptics.rowTap()
                                    editingEntry = .income(entry)
                                }
                                .contextMenu {
                                    Button { editingEntry = .income(entry) } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    Button {
                                        var updated = entry
                                        updated.recurring.toggle()
                                        store.updateIncome(updated)
                                    } label: {
                                        Label(
                                            entry.recurring ? "Make one-off" : "Make recurring",
                                            systemImage: "arrow.triangle.2.circlepath"
                                        )
                                    }
                                    Divider()
                                    Button(role: .destructive) {
                                        store.removeIncome(id: entry.id)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                } header: {
                    SectionHeader(
                        title: "Income",
                        total: formatted(projection.monthlyIncome),
                        color: .brandMint
                    )
                }

                // MARK: Expense Sections (grouped by category)
                ForEach(expenseCategories, id: \.self) { category in
                    let categoryExpenses = filteredExpenses.filter { $0.category == category }
                    let isCollapsed = collapsedCategories.contains(category)
                    let categoryTotal = categoryExpenses.reduce(0) { $0 + $1.amount }
                    let categoryColor = Color(hex: categoryExpenses.first?.color ?? "#9EA8B7")

                    Section {
                        if !isCollapsed {
                            if categoryExpenses.isEmpty {
                                Text("No matching expenses")
                                    .font(.subheadline)
                                    .foregroundStyle(Color.muted)
                                    .padding(.vertical, 8)
                            } else {
                                ForEach(categoryExpenses) { entry in
                                    ExpenseRow(entry: entry, allCategories: expenseCategories)
                                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                            Button(role: .destructive) {
                                                withAnimation(Motion.snappy) {
                                                    store.removeExpense(id: entry.id)
                                                }
                                                Haptics.destructiveAction()
                                            } label: {
                                                Label("Delete", systemImage: "trash")
                                            }

                                            Button {
                                                let copy = ExpenseEntry(
                                                    id: createId(prefix: "exp"),
                                                    name: entry.name,
                                                    category: entry.category,
                                                    amount: entry.amount,
                                                    color: entry.color,
                                                    recurring: entry.recurring
                                                )
                                                store.addExpense(copy)
                                                Haptics.confirmSave()
                                            } label: {
                                                Label("Duplicate", systemImage: "plus.square.on.square")
                                            }
                                            .tint(.brandBlue)
                                        }
                                        .swipeActions(edge: .leading) {
                                            Button {
                                                var updated = entry
                                                updated.recurring.toggle()
                                                store.updateExpense(updated)
                                                Haptics.impact(.light)
                                            } label: {
                                                Label(
                                                    entry.recurring ? "One-off" : "Recurring",
                                                    systemImage: "arrow.triangle.2.circlepath"
                                                )
                                            }
                                            .tint(.brandMint)

                                            Button { editingEntry = .expense(entry) } label: {
                                                Label("Edit", systemImage: "pencil")
                                            }
                                            .tint(.brandBlue)
                                        }
                                        .onTapGesture {
                                            Haptics.rowTap()
                                            editingEntry = .expense(entry)
                                        }
                                        .contextMenu {
                                            Menu("Move to category") {
                                                ForEach(expenseCategories.filter { $0 != entry.category }, id: \.self) { cat in
                                                    Button(cat) {
                                                        var updated = entry
                                                        updated.category = cat
                                                        store.updateExpense(updated)
                                                        Haptics.selection()
                                                    }
                                                }
                                            }
                                            Button { editingEntry = .expense(entry) } label: {
                                                Label("Edit", systemImage: "pencil")
                                            }
                                            Button {
                                                var updated = entry
                                                updated.recurring.toggle()
                                                store.updateExpense(updated)
                                            } label: {
                                                Label(
                                                    entry.recurring ? "Make one-off" : "Make recurring",
                                                    systemImage: "arrow.triangle.2.circlepath"
                                                )
                                            }
                                            Divider()
                                            Button(role: .destructive) {
                                                store.removeExpense(id: entry.id)
                                            } label: {
                                                Label("Delete", systemImage: "trash")
                                            }
                                        }
                                        .draggable(entry.id)
                                }
                            }
                        }
                    } header: {
                        SectionHeader(
                            title: category,
                            total: formatted(categoryTotal),
                            color: categoryColor,
                            isCollapsed: isCollapsed
                        ) {
                            withAnimation(Motion.snappy) {
                                if isCollapsed {
                                    collapsedCategories.remove(category)
                                } else {
                                    collapsedCategories.insert(category)
                                }
                            }
                            Haptics.selection()
                        }
                        .dropDestination(for: String.self) { droppedIds, _ in
                            var moved = false
                            for id in droppedIds {
                                if var entry = store.currentMonthBudget.expenses.first(where: { $0.id == id }) {
                                    entry.category = category
                                    store.updateExpense(entry)
                                    Haptics.selection()
                                    moved = true
                                }
                            }
                            return moved
                        }
                    }
                }

                // Add expense shortcut at the bottom
                Section {
                    Button {
                        addKind = .expense
                        showAddSheet = true
                        Haptics.impact(.light)
                    } label: {
                        Label("Add expense", systemImage: "plus")
                            .font(.subheadline)
                            .foregroundStyle(Color.brandBlue)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .searchable(text: $searchText, prompt: "Search transactions")
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle(formatMonth(store.selectedMonth))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                MonthSwitcherControl(
                    month: store.selectedMonth,
                    onPrev: {
                        store.previousMonth()
                        Haptics.impact(.soft)
                    },
                    onNext: {
                        store.nextMonth()
                        Haptics.impact(.soft)
                    },
                    onTap: { showMonthPicker = true }
                )
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddSheet = true
                    Haptics.impact(.light)
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddEntrySheet(kind: $addKind)
                .environment(store)
        }
        .sheet(item: $editingEntry) { edit in
            switch edit {
            case .income(let e):
                EditIncomeSheet(entry: e)
                    .environment(store)
            case .expense(let e):
                EditExpenseSheet(entry: e, allCategories: expenseCategories)
                    .environment(store)
            }
        }
        .sheet(isPresented: $showMonthPicker) {
            MonthPickerSheet(selectedMonth: store.selectedMonth) { key in
                store.selectMonth(key)
                showMonthPicker = false
                Haptics.selection()
            }
            .environment(store)
        }
        .gesture(
            DragGesture(minimumDistance: 40)
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) * 1.5 else { return }
                    if value.translation.width < 0 {
                        store.nextMonth()
                    } else {
                        store.previousMonth()
                    }
                    Haptics.impact(.soft)
                }
        )
    }

    // MARK: - Computed properties

    var projection: Projection {
        FinanceEngine.projection(for: store.currentMonthBudget)
    }

    var filteredIncomes: [IncomeEntry] {
        guard !searchText.isEmpty else { return store.currentMonthBudget.incomes }
        return store.currentMonthBudget.incomes.filter {
            $0.source.localizedCaseInsensitiveContains(searchText)
        }
    }

    var filteredExpenses: [ExpenseEntry] {
        guard !searchText.isEmpty else { return store.currentMonthBudget.expenses }
        return store.currentMonthBudget.expenses.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.category.localizedCaseInsensitiveContains(searchText)
        }
    }

    var expenseCategories: [String] {
        var seen = Set<String>()
        return store.currentMonthBudget.expenses.compactMap { e in
            seen.insert(e.category).inserted ? e.category : nil
        }
    }

    func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - SurplusBar

struct SurplusBar: View {
    var projection: Projection
    @Environment(LedgerStore.self) var store

    private var surplus: Double { projection.monthlySurplus }
    private var isPositive: Bool { surplus >= 0 }
    private var barColor: Color { isPositive ? .brandMint : .brandRed }

    // Fill ratio capped 0…1 based on income
    private var fillFraction: CGFloat {
        guard projection.monthlyIncome > 0 else { return 0 }
        return CGFloat(min(abs(surplus) / projection.monthlyIncome, 1.0))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(isPositive ? "Surplus" : "Deficit")
                    .font(.caption)
                    .foregroundStyle(Color.muted)

                Spacer()

                Text(formatted(surplus))
                    .font(.moneySmall)
                    .foregroundStyle(barColor)
                    .contentTransition(.numericText())
                    .animation(Motion.standard, value: surplus)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Track
                    Rectangle()
                        .fill(barColor.opacity(0.12))
                        .frame(height: 4)

                    // Fill
                    Rectangle()
                        .fill(barColor)
                        .frame(width: geo.size.width * fillFraction, height: 4)
                        .animation(Motion.standard, value: fillFraction)
                }
            }
            .frame(height: 4)

            Divider()
                .background(Color.line)
        }
        .background(Color.surface)
    }

    private func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - IncomeRow

struct IncomeRow: View {
    var entry: IncomeEntry
    @Environment(LedgerStore.self) var store

    var body: some View {
        HStack(spacing: 10) {
            ColorDot(hex: entry.color, size: 10)

            Text(entry.source)
                .font(.body)
                .foregroundStyle(Color.ink)
                .lineLimit(1)

            Spacer()

            if entry.recurring {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.brandMint)
            }

            Text(formatted(entry.amount))
                .font(.moneySmall)
                .foregroundStyle(Color.brandMint)
                .contentTransition(.numericText())
                .animation(Motion.standard, value: entry.amount)
        }
        .padding(.vertical, 2)
    }

    private func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - ExpenseRow

struct ExpenseRow: View {
    var entry: ExpenseEntry
    var allCategories: [String]
    @Environment(LedgerStore.self) var store

    var body: some View {
        HStack(spacing: 10) {
            ColorDot(hex: entry.color, size: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.body)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)

                // Show category chip only when there are multiple categories
                if allCategories.count > 1 {
                    Text(entry.category)
                        .font(.caption2)
                        .foregroundStyle(Color.muted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(hex: entry.color).opacity(0.15))
                        .clipShape(Capsule())
                }
            }

            Spacer()

            if entry.recurring {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.muted)
            }

            Text(formatted(entry.amount))
                .font(.moneySmall)
                .foregroundStyle(Color.ink)
                .contentTransition(.numericText())
                .animation(Motion.standard, value: entry.amount)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onDrag {
            Haptics.drag()
            return NSItemProvider(object: entry.id as NSString)
        }
    }

    private func formatted(_ amount: Double) -> String {
        FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
    }
}

// MARK: - MonthSwitcherControl

struct MonthSwitcherControl: View {
    var month: String
    var onPrev: () -> Void
    var onNext: () -> Void
    var onTap: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Button(action: onPrev) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.brandBlue)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }

            Button(action: onTap) {
                Text(formatMonth(month))
                    .font(.headline)
                    .foregroundStyle(Color.ink)
                    .animation(.none, value: month)
                    .contentTransition(.numericText())
                    .padding(.horizontal, 6)
            }

            Button(action: onNext) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.brandBlue)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
        }
    }
}

// MARK: - AddEntrySheet

struct AddEntrySheet: View {
    @Binding var kind: TransactionKind
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) private var dismiss

    // Shared fields
    @State private var name: String = ""
    @State private var amountText: String = ""
    @State private var recurring: Bool = true
    @State private var selectedColor: String = CATEGORY_COLORS.first ?? "#00B89E"
    @State private var showValidationError = false

    // Expense-only
    @State private var category: String = "General"
    @State private var newCategoryText: String = ""
    @State private var isAddingCategory = false

    private var amount: Double { Double(amountText) ?? 0 }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && amount > 0 }

    private var existingCategories: [String] {
        var seen = Set<String>()
        return store.currentMonthBudget.expenses.compactMap { e in
            seen.insert(e.category).inserted ? e.category : nil
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                // Kind picker
                Section {
                    Picker("Type", selection: $kind) {
                        Text("Income").tag(TransactionKind.income)
                        Text("Expense").tag(TransactionKind.expense)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))
                }

                // Name / Source
                Section(kind == .income ? "Source" : "Name") {
                    TextField(
                        kind == .income ? "e.g. Salary, Freelance" : "e.g. Netflix, Groceries",
                        text: $name
                    )
                    .autocorrectionDisabled()
                }

                // Amount
                Section("Amount") {
                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                }

                // Expense-only: Category
                if kind == .expense {
                    Section("Category") {
                        if existingCategories.isEmpty {
                            TextField("e.g. Housing, Transport", text: $category)
                        } else {
                            Picker("Category", selection: $category) {
                                ForEach(existingCategories, id: \.self) { cat in
                                    Text(cat).tag(cat)
                                }
                                Text("New category…").tag("__new__")
                            }
                            .onChange(of: category) { _, new in
                                if new == "__new__" {
                                    isAddingCategory = true
                                    category = newCategoryText.isEmpty ? "General" : newCategoryText
                                }
                            }

                            if isAddingCategory {
                                TextField("Category name", text: $newCategoryText)
                                    .onChange(of: newCategoryText) { _, v in
                                        if !v.isEmpty { category = v }
                                    }
                            }
                        }
                    }
                }

                // Color
                Section("Colour") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
                        ForEach(CATEGORY_COLORS, id: \.self) { hex in
                            Button {
                                selectedColor = hex
                                Haptics.selection()
                            } label: {
                                Circle()
                                    .fill(Color(hex: hex))
                                    .frame(width: 28, height: 28)
                                    .overlay(
                                        Circle()
                                            .strokeBorder(Color.ink.opacity(selectedColor == hex ? 0.8 : 0), lineWidth: 2.5)
                                            .padding(2)
                                    )
                                    .scaleEffect(selectedColor == hex ? 1.15 : 1)
                                    .animation(Motion.snappy, value: selectedColor)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                }

                // Recurring
                Section {
                    Toggle("Recurring monthly", isOn: $recurring)
                        .tint(.brandMint)
                }

                // Validation error
                if showValidationError {
                    Section {
                        Text("Please enter a name and a valid amount.")
                            .font(.caption)
                            .foregroundStyle(.brandRed)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle(kind == .income ? "Add Income" : "Add Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                        .tint(.brandBlue)
                }
            }
        }
    }

    private func save() {
        guard isValid else {
            withAnimation(Motion.snappy) { showValidationError = true }
            Haptics.notification(.error)
            return
        }

        let trimmedName = name.trimmingCharacters(in: .whitespaces)

        if kind == .income {
            let entry = IncomeEntry(
                id: createId(prefix: "inc"),
                source: trimmedName,
                amount: amount,
                color: selectedColor,
                recurring: recurring
            )
            store.addIncome(entry)
        } else {
            let resolvedCategory = category == "__new__"
                ? (newCategoryText.isEmpty ? "General" : newCategoryText)
                : category
            let entry = ExpenseEntry(
                id: createId(prefix: "exp"),
                name: trimmedName,
                category: resolvedCategory,
                amount: amount,
                color: selectedColor,
                recurring: recurring
            )
            store.addExpense(entry)
        }

        Haptics.confirmSave()
        dismiss()
    }
}

// MARK: - EditIncomeSheet

struct EditIncomeSheet: View {
    var entry: IncomeEntry
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) private var dismiss

    @State private var source: String
    @State private var amountText: String
    @State private var recurring: Bool
    @State private var selectedColor: String
    @State private var showValidationError = false

    init(entry: IncomeEntry) {
        self.entry = entry
        _source = State(initialValue: entry.source)
        _amountText = State(initialValue: String(entry.amount))
        _recurring = State(initialValue: entry.recurring)
        _selectedColor = State(initialValue: entry.color)
    }

    private var amount: Double { Double(amountText) ?? 0 }
    private var isValid: Bool { !source.trimmingCharacters(in: .whitespaces).isEmpty && amount > 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section("Source") {
                    TextField("e.g. Salary, Freelance", text: $source)
                        .autocorrectionDisabled()
                }

                Section("Amount") {
                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                }

                Section("Colour") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
                        ForEach(CATEGORY_COLORS, id: \.self) { hex in
                            Button {
                                selectedColor = hex
                                Haptics.selection()
                            } label: {
                                Circle()
                                    .fill(Color(hex: hex))
                                    .frame(width: 28, height: 28)
                                    .overlay(
                                        Circle()
                                            .strokeBorder(Color.ink.opacity(selectedColor == hex ? 0.8 : 0), lineWidth: 2.5)
                                            .padding(2)
                                    )
                                    .scaleEffect(selectedColor == hex ? 1.15 : 1)
                                    .animation(Motion.snappy, value: selectedColor)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                }

                Section {
                    Toggle("Recurring monthly", isOn: $recurring)
                        .tint(.brandMint)
                }

                if showValidationError {
                    Section {
                        Text("Please enter a source and a valid amount.")
                            .font(.caption)
                            .foregroundStyle(.brandRed)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle("Edit Income")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                        .tint(.brandBlue)
                }
            }
        }
    }

    private func save() {
        guard isValid else {
            withAnimation(Motion.snappy) { showValidationError = true }
            Haptics.notification(.error)
            return
        }
        var updated = entry
        updated.source = source.trimmingCharacters(in: .whitespaces)
        updated.amount = amount
        updated.recurring = recurring
        updated.color = selectedColor
        store.updateIncome(updated)
        Haptics.confirmSave()
        dismiss()
    }
}

// MARK: - EditExpenseSheet

struct EditExpenseSheet: View {
    var entry: ExpenseEntry
    var allCategories: [String]
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var amountText: String
    @State private var recurring: Bool
    @State private var selectedColor: String
    @State private var category: String
    @State private var newCategoryText: String = ""
    @State private var isAddingCategory = false
    @State private var showValidationError = false

    init(entry: ExpenseEntry, allCategories: [String]) {
        self.entry = entry
        self.allCategories = allCategories
        _name = State(initialValue: entry.name)
        _amountText = State(initialValue: String(entry.amount))
        _recurring = State(initialValue: entry.recurring)
        _selectedColor = State(initialValue: entry.color)
        _category = State(initialValue: entry.category)
    }

    private var amount: Double { Double(amountText) ?? 0 }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && amount > 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. Netflix, Groceries", text: $name)
                        .autocorrectionDisabled()
                }

                Section("Amount") {
                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                }

                Section("Category") {
                    if allCategories.isEmpty {
                        TextField("e.g. Housing, Transport", text: $category)
                    } else {
                        Picker("Category", selection: $category) {
                            ForEach(allCategories, id: \.self) { cat in
                                Text(cat).tag(cat)
                            }
                            Text("New category…").tag("__new__")
                        }
                        .onChange(of: category) { _, new in
                            if new == "__new__" {
                                isAddingCategory = true
                                category = newCategoryText.isEmpty ? entry.category : newCategoryText
                            }
                        }

                        if isAddingCategory {
                            TextField("Category name", text: $newCategoryText)
                                .onChange(of: newCategoryText) { _, v in
                                    if !v.isEmpty { category = v }
                                }
                        }
                    }
                }

                Section("Colour") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
                        ForEach(CATEGORY_COLORS, id: \.self) { hex in
                            Button {
                                selectedColor = hex
                                Haptics.selection()
                            } label: {
                                Circle()
                                    .fill(Color(hex: hex))
                                    .frame(width: 28, height: 28)
                                    .overlay(
                                        Circle()
                                            .strokeBorder(Color.ink.opacity(selectedColor == hex ? 0.8 : 0), lineWidth: 2.5)
                                            .padding(2)
                                    )
                                    .scaleEffect(selectedColor == hex ? 1.15 : 1)
                                    .animation(Motion.snappy, value: selectedColor)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 6)
                }

                Section {
                    Toggle("Recurring monthly", isOn: $recurring)
                        .tint(.brandMint)
                }

                if showValidationError {
                    Section {
                        Text("Please enter a name and a valid amount.")
                            .font(.caption)
                            .foregroundStyle(.brandRed)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle("Edit Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .fontWeight(.semibold)
                        .tint(.brandBlue)
                }
            }
        }
    }

    private func save() {
        guard isValid else {
            withAnimation(Motion.snappy) { showValidationError = true }
            Haptics.notification(.error)
            return
        }
        let resolvedCategory = category == "__new__"
            ? (newCategoryText.isEmpty ? entry.category : newCategoryText)
            : category

        var updated = entry
        updated.name = name.trimmingCharacters(in: .whitespaces)
        updated.amount = amount
        updated.recurring = recurring
        updated.color = selectedColor
        updated.category = resolvedCategory
        store.updateExpense(updated)
        Haptics.confirmSave()
        dismiss()
    }
}

// MARK: - MonthPickerSheet

struct MonthPickerSheet: View {
    var selectedMonth: String
    var onSelect: (String) -> Void
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) private var dismiss

    // Generate a range of months: 24 past + current + 12 future
    private var months: [String] {
        let current = getMonthKey()
        return (-24 ... 12).map { shiftMonth(current, by: $0) }.reversed()
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(months, id: \.self) { key in
                    let hasData = store.state.months[key] != nil &&
                        (!(store.state.months[key]?.incomes.isEmpty ?? true) ||
                         !(store.state.months[key]?.expenses.isEmpty ?? true))

                    Button {
                        onSelect(key)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(formatMonth(key))
                                    .font(.body)
                                    .foregroundStyle(Color.ink)

                                if hasData {
                                    let budget = store.state.months[key] ?? .empty
                                    let proj = FinanceEngine.projection(for: budget)
                                    Text("\(budget.incomes.count) income · \(budget.expenses.count) expenses")
                                        .font(.caption)
                                        .foregroundStyle(Color.muted)
                                    Text(formattedSurplus(proj.monthlySurplus))
                                        .font(.caption)
                                        .foregroundStyle(proj.monthlySurplus >= 0 ? Color.brandMint : Color.brandRed)
                                }
                            }

                            Spacer()

                            if key == selectedMonth {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Color.brandBlue)
                            }

                            if hasData {
                                Circle()
                                    .fill(Color.brandBlue)
                                    .frame(width: 6, height: 6)
                            }
                        }
                    }
                    .listRowBackground(key == selectedMonth ? Color.brandBlue.opacity(0.08) : Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle("Select Month")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func formattedSurplus(_ amount: Double) -> String {
        let prefix = amount >= 0 ? "+" : ""
        let formatted = FinanceEngine.currencyFormatter(for: store.state.currency)
            .string(from: NSNumber(value: amount)) ?? ""
        return "\(prefix)\(formatted)"
    }
}
