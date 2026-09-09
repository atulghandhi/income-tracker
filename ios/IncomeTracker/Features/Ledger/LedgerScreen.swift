// LedgerScreen.swift
// Income Tracker — Ledger feature screen: the home tab.
// Swift 6 / iOS 17+
//
// Built around one idea: opening the app and logging what you spent should take
// the same effort as logging a meal in a food-tracker. The quick-log bar is docked
// above the keyboard, one line adds an entry ("tesco 23.40", "salary 2400 recurring"),
// Return adds and keeps the cursor in the field for the next one, and the full
// form is a tap away for anything that needs a date or a category change.

import SwiftUI

// MARK: - LedgerScreen

struct LedgerScreen: View {
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @Environment(AppRouter.self) var router

    @State private var showSettings = false
    @State private var showAddSheet = false
    @State private var addKind: TransactionKind = .expense
    @State private var editingEntry: EntryEdit? = nil
    @State private var collapsedCategories: Set<String> = []
    @State private var showMonthPicker = false
    @State private var searchText = ""
    @State private var importFlow = ImportFlowState()
    @State private var toast: LedgerToast? = nil
    @State private var dismissedRecurringKeys: Set<String> = []
    @State private var recurringSuggestions: [RecurrenceCandidate] = []
    @State private var monthNoteDraft = ""
    @State private var showMonthNote = false

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

    private var debtAccounts: [Account] {
        store.state.accounts.filter { $0.accountClass == .debt }
    }

    private var isPrivate: Bool { store.state.privacyMode }

    var body: some View {
        VStack(spacing: 0) {
            MonthOverviewHeader(projection: projection)

            List {
                recurringSuggestionsSection
                incomeSection
                expenseSections
                monthNoteSection
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .scrollDismissesKeyboard(.interactively)
            .searchable(text: $searchText, prompt: "Search this month")
        }
        .background(Color.bg.ignoresSafeArea())
        // The quick-log bar rides above the keyboard and the tab bar.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            QuickLogBar(
                onAdded: { draft in
                    showToast(for: draft)
                },
                onOpenForm: { kind in
                    addKind = kind
                    showAddSheet = true
                }
            )
        }
        .overlay(alignment: .top) {
            if let toast {
                LedgerToastView(toast: toast) {
                    store.undo()
                    Haptics.impact(.light)
                    withAnimation(Motion.snappy) { self.toast = nil }
                }
                .padding(.horizontal, Spacing.lg)
                .padding(.top, Spacing.sm)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    showSettings = true
                    Haptics.impact(.light)
                } label: {
                    Image(systemName: "gearshape")
                        .foregroundStyle(Color.muted)
                }
                .accessibilityLabel("Settings")
            }
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
                Menu {
                    Button {
                        addKind = .expense
                        showAddSheet = true
                    } label: {
                        Label("Add expense", systemImage: "minus.circle")
                    }
                    Button {
                        addKind = .income
                        showAddSheet = true
                    } label: {
                        Label("Add income", systemImage: "plus.circle")
                    }
                    Divider()
                    ImportMenuItems(flow: $importFlow)
                    Divider()
                    if store.canUndo {
                        Button {
                            store.undo()
                            Haptics.impact(.light)
                        } label: {
                            Label("Undo last change", systemImage: "arrow.uturn.backward")
                        }
                    }
                    Button {
                        monthNoteDraft = store.currentMonthBudget.note
                        showMonthNote = true
                    } label: {
                        Label(store.currentMonthBudget.note.isEmpty ? "Add month note" : "Edit month note",
                              systemImage: "note.text")
                    }
                } label: {
                    Image(systemName: "plus")
                        .fontWeight(.semibold)
                }
                .accessibilityLabel("Add or import")
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
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
        .sheet(isPresented: $showMonthNote) {
            MonthNoteSheet(monthKey: store.selectedMonth, note: $monthNoteDraft) {
                store.setMonthNote(monthNoteDraft.trimmingCharacters(in: .whitespacesAndNewlines))
            }
        }
        .importFlow($importFlow) { result in
            showToast(LedgerToast(message: importSummary(result), canUndo: result.importedRows > 0))
        }
        // Recurrence detection walks the whole ledger; run it once per change, off the main thread.
        .task(id: store.state.lastSavedAt) {
            let snapshot = store.state
            let detected = await Task.detached(priority: .utility) {
                Recurrence.suggestRecurringFlags(snapshot)
            }.value
            guard !Task.isCancelled else { return }
            recurringSuggestions = detected
        }
        .onChange(of: router.pendingQuickLog) { _, pending in
            // A widget or Shortcut deep link asked for the composer.
            guard pending else { return }
            router.pendingQuickLog = false
            addKind = .expense
            showAddSheet = true
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private var recurringSuggestionsSection: some View {
        let suggestions = recurringSuggestions
            .filter { !dismissedRecurringKeys.contains($0.id) }
            .prefix(2)
        if !suggestions.isEmpty && searchText.isEmpty {
            Section {
                ForEach(Array(suggestions)) { candidate in
                    RecurringSuggestionRow(candidate: candidate, currency: store.state.currency, isPrivate: isPrivate) {
                        store.markRecurring(candidate)
                        Haptics.confirmSave()
                        withAnimation(Motion.snappy) { _ = dismissedRecurringKeys.insert(candidate.id) }
                    } onDismiss: {
                        withAnimation(Motion.snappy) { _ = dismissedRecurringKeys.insert(candidate.id) }
                    }
                    .listRowBackground(Color.blueSoft)
                }
            } header: {
                SectionHeader(title: "Looks recurring", color: .brandBlue)
            }
        }
    }

    @ViewBuilder
    private var incomeSection: some View {
        Section {
            if filteredIncomes.isEmpty && !searchText.isEmpty {
                Text("No matching income")
                    .font(.subheadline)
                    .foregroundStyle(Color.muted)
                    .padding(.vertical, Spacing.sm)
            } else if store.currentMonthBudget.incomes.isEmpty {
                Button {
                    addKind = .income
                    showAddSheet = true
                    Haptics.impact(.light)
                } label: {
                    Label("Add your income for \(formatMonth(store.selectedMonth))", systemImage: "plus.circle")
                        .font(.subheadline)
                        .foregroundStyle(Color.brandBlue)
                }
            } else {
                ForEach(filteredIncomes) { entry in
                    IncomeRow(entry: entry, isPrivate: isPrivate)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                withAnimation(Motion.snappy) {
                                    store.removeIncome(id: entry.id)
                                }
                                Haptics.destructiveAction()
                                showToast(LedgerToast(message: "Deleted \(entry.source)", canUndo: true))
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }

                            Button {
                                var copy = entry
                                copy.id = createId(prefix: "income")
                                copy.imported = nil
                                copy.seededFrom = nil
                                store.addIncome(copy)
                                Haptics.confirmSave()
                            } label: {
                                Label("Duplicate", systemImage: "plus.square.on.square")
                            }
                            .tint(.brandBlue)
                        }
                        .swipeActions(edge: .leading) {
                            Button {
                                store.setRecurring(!entry.recurring, entryId: entry.id)
                                Haptics.impact(.light)
                            } label: {
                                Label(entry.recurring ? "One-off" : "Recurring", systemImage: "arrow.triangle.2.circlepath")
                            }
                            .tint(.brandMint)
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            Haptics.rowTap()
                            editingEntry = .income(entry)
                        }
                        .contextMenu {
                            Button { editingEntry = .income(entry) } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            Button {
                                store.setRecurring(!entry.recurring, entryId: entry.id)
                            } label: {
                                Label(entry.recurring ? "Make one-off" : "Make recurring", systemImage: "arrow.triangle.2.circlepath")
                            }
                            Divider()
                            Button(role: .destructive) {
                                store.removeIncome(id: entry.id)
                                showToast(LedgerToast(message: "Deleted \(entry.source)", canUndo: true))
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityHint("Double tap to edit")
                }
            }
        } header: {
            SectionHeader(
                title: "Income",
                total: isPrivate ? "•••" : formatMoney(projection.monthlyIncome, currency: store.state.currency),
                color: .brandMint
            )
        }
    }

    @ViewBuilder
    private var expenseSections: some View {
        if store.currentMonthBudget.expenses.isEmpty && searchText.isEmpty {
            Section {
                VStack(alignment: .leading, spacing: Spacing.sm) {
                    Text("Nothing logged yet this month")
                        .font(.headline)
                        .foregroundStyle(Color.ink)
                    Text("Type what you spent below — \"coffee 3.20\" is enough. Return adds it and keeps the cursor ready for the next one.")
                        .font(.subheadline)
                        .foregroundStyle(Color.muted)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: Spacing.sm) {
                        Button {
                            importFlow.showFilePicker = true
                        } label: {
                            Label("Import statement", systemImage: "square.and.arrow.down")
                        }
                        .buttonStyle(.bordered)
                        .tint(.brandBlue)
                        Button {
                            addKind = .expense
                            showAddSheet = true
                        } label: {
                            Label("Full form", systemImage: "square.and.pencil")
                        }
                        .buttonStyle(.bordered)
                        .tint(.brandBlue)
                    }
                    .padding(.top, Spacing.xs)
                }
                .padding(.vertical, Spacing.xs)
            }
        }

        ForEach(expenseCategories, id: \.self) { category in
            let categoryExpenses = filteredExpenses.filter { $0.category == category }
            let isCollapsed = collapsedCategories.contains(category)
            let categoryTotal = categoryExpenses.reduce(0) { $0 + $1.amount }
            let categoryColor = Color(hex: categoryExpenses.first?.color ?? "#9EA8B7")

            if !categoryExpenses.isEmpty || searchText.isEmpty {
                Section {
                    if !isCollapsed {
                        ForEach(categoryExpenses) { entry in
                            ExpenseRow(entry: entry, showCategory: false, isPrivate: isPrivate)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        withAnimation(Motion.snappy) {
                                            store.removeExpense(id: entry.id)
                                        }
                                        Haptics.destructiveAction()
                                        showToast(LedgerToast(message: "Deleted \(entry.name)", canUndo: true))
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }

                                    Button {
                                        var copy = entry
                                        copy.id = createId(prefix: "expense")
                                        copy.imported = nil
                                        copy.seededFrom = nil
                                        copy.date = isoDateString(Date())
                                        store.addExpense(copy)
                                        Haptics.confirmSave()
                                    } label: {
                                        Label("Again today", systemImage: "plus.square.on.square")
                                    }
                                    .tint(.brandBlue)
                                }
                                .swipeActions(edge: .leading) {
                                    Button {
                                        store.setRecurring(!entry.recurring, entryId: entry.id)
                                        Haptics.impact(.light)
                                    } label: {
                                        Label(entry.recurring ? "One-off" : "Recurring", systemImage: "arrow.triangle.2.circlepath")
                                    }
                                    .tint(.brandMint)
                                }
                                .contentShape(Rectangle())
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
                                                updated.color = categoryColorInLedger(cat) ?? updated.color
                                                let learned = store.updateExpense(updated)
                                                Haptics.selection()
                                                if learned > 0 {
                                                    showToast(LedgerToast(message: "Rule saved · \(learned) similar sorted", canUndo: true))
                                                }
                                            }
                                        }
                                    }
                                    if !debtAccounts.isEmpty {
                                        Menu("Count as payment towards") {
                                            ForEach(debtAccounts) { account in
                                                Button {
                                                    var updated = entry
                                                    updated.debtAccountId = entry.debtAccountId == account.id ? nil : account.id
                                                    store.updateExpense(updated)
                                                    Haptics.selection()
                                                } label: {
                                                    if entry.debtAccountId == account.id {
                                                        Label(account.name, systemImage: "checkmark")
                                                    } else {
                                                        Text(account.name)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Button { editingEntry = .expense(entry) } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    Button {
                                        store.setRecurring(!entry.recurring, entryId: entry.id)
                                    } label: {
                                        Label(entry.recurring ? "Make one-off" : "Make recurring", systemImage: "arrow.triangle.2.circlepath")
                                    }
                                    Divider()
                                    Button(role: .destructive) {
                                        store.removeExpense(id: entry.id)
                                        showToast(LedgerToast(message: "Deleted \(entry.name)", canUndo: true))
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .accessibilityElement(children: .combine)
                                .accessibilityHint("Double tap to edit")
                        }
                    }
                } header: {
                    SectionHeader(
                        title: category,
                        total: isPrivate ? "•••" : formatMoney(categoryTotal, currency: store.state.currency),
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
                }
            }
        }
    }

    @ViewBuilder
    private var monthNoteSection: some View {
        let note = store.currentMonthBudget.note
        if !note.isEmpty && searchText.isEmpty {
            Section {
                Button {
                    monthNoteDraft = note
                    showMonthNote = true
                } label: {
                    HStack(alignment: .top, spacing: Spacing.sm) {
                        Image(systemName: "note.text")
                            .foregroundStyle(Color.brandAmber)
                        Text(note)
                            .font(.subheadline)
                            .foregroundStyle(Color.ink)
                            .multilineTextAlignment(.leading)
                    }
                }
                .buttonStyle(.plain)
            } header: {
                SectionHeader(title: "Note", color: .brandAmber)
            }
        }
    }

    // MARK: - Toasts

    private func showToast(for draft: QuickAddDraft) {
        let amount = isPrivate ? "•••" : formatMoney(draft.amount, currency: store.state.currency)
        let verb = draft.kind == .income ? "Income" : "Logged"
        showToast(LedgerToast(message: "\(verb) \(draft.description) · \(amount)", canUndo: true))
    }

    private func showToast(_ next: LedgerToast) {
        withAnimation(Motion.snappy) { toast = next }
        Task {
            try? await Task.sleep(for: .seconds(4))
            guard toast?.id == next.id else { return }
            withAnimation(Motion.snappy) { toast = nil }
        }
    }

    private func importSummary(_ result: ImportCommitResult) -> String {
        var parts: [String] = []
        if result.importedRows > 0 { parts.append("Imported \(result.importedRows) row\(result.importedRows == 1 ? "" : "s")") }
        if result.learnedTransferPatterns > 0 { parts.append("\(result.learnedTransferPatterns) transfer pattern\(result.learnedTransferPatterns == 1 ? "" : "s") saved") }
        if result.sweptEntries > 0 { parts.append("\(result.sweptEntries) transfer\(result.sweptEntries == 1 ? "" : "s") removed") }
        if result.mergedSeededEntries > 0 { parts.append("\(result.mergedSeededEntries) seeded entr\(result.mergedSeededEntries == 1 ? "y" : "ies") merged") }
        return parts.isEmpty ? "Nothing imported" : parts.joined(separator: " · ")
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

    private func categoryColorInLedger(_ category: String) -> String? {
        store.currentMonthBudget.expenses.first { $0.category == category }?.color
    }
}

// MARK: - Toast

struct LedgerToast: Identifiable, Equatable {
    let id = UUID()
    var message: String
    var canUndo: Bool
}

struct LedgerToastView: View {
    var toast: LedgerToast
    var onUndo: () -> Void

    var body: some View {
        HStack(spacing: Spacing.md) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Color.brandMint)
            Text(toast.message)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color.ink)
                .lineLimit(2)
            Spacer(minLength: 0)
            if toast.canUndo {
                Button("Undo", action: onUndo)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.brandBlue)
            }
        }
        .padding(.horizontal, Spacing.lg)
        .padding(.vertical, Spacing.md)
        .background(Color.surfaceHigh, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 0.5))
        .shadow(color: Color.ink.opacity(0.12), radius: 12, y: 4)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - QuickLogBar

/// One line in, one entry out. Docked above the keyboard on the Ledger tab.
struct QuickLogBar: View {
    var onAdded: (QuickAddDraft) -> Void
    var onOpenForm: (TransactionKind) -> Void

    @Environment(LedgerStore.self) private var store
    @FocusState private var isFocused: Bool
    @State private var text = ""
    @State private var lastError: String? = nil
    @State private var memory = MerchantMemory.empty

    private var parsed: QuickAddResult? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        return parseQuickAdd(trimmed, state: store.state, memory: memory, monthKey: store.selectedMonth)
    }

    private var suggestions: [MerchantSuggestion] {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard isFocused else { return [] }
        if trimmed.isEmpty {
            // Nothing typed yet: the merchants logged most often, ready to tap.
            return Array(memory.all(.expense).prefix(6))
        }
        // Only suggest while the user is still on the description (no amount yet).
        guard parsed?.draft?.amount == nil || parsed?.draft?.amount == 0 else { return [] }
        return memory.suggest(.expense, text: trimmed, limit: 6)
    }

    var body: some View {
        VStack(spacing: Spacing.sm) {
            if !suggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Spacing.sm) {
                        ForEach(suggestions) { suggestion in
                            Button {
                                applySuggestion(suggestion)
                            } label: {
                                HStack(spacing: Spacing.xs) {
                                    ColorDot(hex: suggestion.color, size: 7)
                                    Text(suggestion.label)
                                        .lineLimit(1)
                                    if let stable = suggestion.stableAmount, !store.state.privacyMode {
                                        Text(formatMoney(stable, currency: store.state.currency))
                                            .foregroundStyle(Color.muted)
                                            .monospacedDigit()
                                    }
                                }
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.surfaceHigh, in: Capsule())
                                .overlay(Capsule().strokeBorder(Color.line, lineWidth: 0.5))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(suggestion.stableAmount.map { "\(suggestion.label), \(formatMoney($0, currency: store.state.currency))" } ?? suggestion.label)
                            .accessibilityHint(suggestion.stableAmount == nil ? "Fills in the name" : "Logs it with the usual amount")
                        }
                    }
                    .padding(.horizontal, Spacing.lg)
                }
                .transition(.opacity)
            }

            if let preview = previewText {
                HStack(spacing: Spacing.xs) {
                    Image(systemName: preview.isError ? "exclamationmark.circle" : "sparkles")
                    Text(preview.text)
                        .lineLimit(1)
                }
                .font(.caption)
                .foregroundStyle(preview.isError ? Color.brandAmber : Color.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Spacing.lg)
                .transition(.opacity)
            }

            HStack(spacing: Spacing.sm) {
                HStack(spacing: Spacing.sm) {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(Color.brandBlue)
                    TextField("Log a spend, e.g. Tesco 23.40", text: $text)
                        .focused($isFocused)
                        .submitLabel(.done)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.words)
                        .onSubmit(submit)
                        .accessibilityLabel("Quick log")
                        .accessibilityHint("Type a description and amount, then press return")
                    if !text.isEmpty {
                        Button {
                            text = ""
                            lastError = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Color.faint)
                        }
                        .accessibilityLabel("Clear")
                    }
                }
                .padding(.horizontal, Spacing.md)
                .padding(.vertical, 10)
                .background(Color.surfaceHigh, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .strokeBorder(isFocused ? Color.brandBlue.opacity(0.6) : Color.line, lineWidth: isFocused ? 1 : 0.5)
                )

                if text.isEmpty {
                    Button {
                        onOpenForm(.expense)
                        Haptics.impact(.light)
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .font(.body.weight(.semibold))
                            .frame(width: 44, height: 44)
                            .background(Color.surfaceHigh, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.line, lineWidth: 0.5))
                    }
                    .foregroundStyle(Color.brandBlue)
                    .accessibilityLabel("Open the full entry form")
                } else {
                    Button(action: submit) {
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(parsed?.draft == nil ? Color.faint : Color.brandBlue, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    }
                    .disabled(parsed?.draft == nil)
                    .accessibilityLabel("Add entry")
                }
            }
            .padding(.horizontal, Spacing.lg)
        }
        .padding(.vertical, Spacing.sm)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
        .animation(Motion.snappy, value: suggestions)
        .animation(Motion.snappy, value: previewText)
        .task(id: store.state.lastSavedAt) {
            memory = MerchantMemory(state: store.state)
        }
    }

    private struct Preview: Equatable {
        var text: String
        var isError: Bool
    }

    private var previewText: Preview? {
        if let lastError, text.isEmpty { return Preview(text: lastError, isError: true) }
        guard let parsed else { return nil }
        switch parsed {
        case .ok(let draft):
            var bits: [String] = []
            bits.append(draft.kind == .income ? "Income" : draft.category)
            if !store.state.privacyMode { bits.append(formatMoney(draft.amount, currency: store.state.currency)) }
            if let date = draft.date, date != isoDateString(Date()) { bits.append(shortDate(date)) }
            if draft.recurring { bits.append("recurring") }
            return Preview(text: "\(draft.description) · " + bits.joined(separator: " · "), isError: false)
        case .error(let message):
            // Only nag once there is clearly a description and no usable amount.
            let words = text.split(whereSeparator: { $0.isWhitespace })
            return words.count >= 2 ? Preview(text: message, isError: true) : nil
        }
    }

    private func submit() {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        switch parseQuickAdd(trimmed, state: store.state, memory: memory, monthKey: store.selectedMonth) {
        case .ok(let draft):
            add(draft)
        case .error(let message):
            lastError = message
            Haptics.notification(.error)
        }
    }

    private func add(_ draft: QuickAddDraft) {
        let date = draft.date ?? (store.selectedMonth == getMonthKey() ? isoDateString(Date()) : monthStartDate(store.selectedMonth))
        if draft.kind == .income {
            store.addIncome(IncomeEntry(
                id: createId(prefix: "income"),
                source: draft.description,
                amount: draft.amount,
                color: draft.color ?? categoryColor(for: "Income"),
                recurring: draft.recurring,
                date: date
            ))
        } else {
            store.addExpense(ExpenseEntry(
                id: createId(prefix: "expense"),
                name: draft.description,
                category: draft.category,
                amount: draft.amount,
                color: draft.color ?? categoryColor(for: draft.category),
                recurring: draft.recurring,
                date: date,
                categorySource: draft.categorySource
            ))
        }
        Haptics.confirmSave()
        text = ""
        lastError = nil
        // Keep the keyboard up with the cursor back in the field for the next line.
        isFocused = true
        onAdded(draft)
    }

    private func applySuggestion(_ suggestion: MerchantSuggestion) {
        if let stable = suggestion.stableAmount {
            let draft = QuickAddDraft(
                kind: suggestion.kind,
                description: suggestion.label,
                amount: stable,
                date: nil,
                recurring: false,
                category: suggestion.category.isEmpty ? "General" : suggestion.category,
                color: suggestion.color,
                categorySource: "memory",
                note: ""
            )
            add(draft)
        } else {
            text = suggestion.label + " "
            isFocused = true
            Haptics.selection()
        }
    }

    private func shortDate(_ iso: String) -> String {
        guard let date = TextImportDates.isoDay(iso) else { return iso }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}

// MARK: - RecurringSuggestionRow

struct RecurringSuggestionRow: View {
    var candidate: RecurrenceCandidate
    var currency: CurrencyCode
    var isPrivate: Bool
    var onAccept: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: Spacing.md) {
            ColorDot(hex: candidate.color, size: 10)
            VStack(alignment: .leading, spacing: 2) {
                Text(candidate.label)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Text("\(candidate.cadence.label) · \(isPrivate ? "•••" : formatMoney(candidate.typicalAmount, currency: currency)) · seen \(candidate.occurrences)×")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
            }
            Spacer(minLength: Spacing.sm)
            Button("Not now", action: onDismiss)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.muted)
                .buttonStyle(.plain)
            Button("Repeat", action: onAccept)
                .font(.caption.weight(.semibold))
                .buttonStyle(.borderedProminent)
                .tint(.brandBlue)
                .controlSize(.small)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Mark this as recurring so it carries into next month")
    }
}

// MARK: - MonthOverviewHeader

/// At-a-glance month summary pinned above the transaction list:
/// income so far, spending so far, and what's left, plus a spend bar.
struct MonthOverviewHeader: View {
    var projection: Projection
    @Environment(LedgerStore.self) var store

    private var surplus: Double { projection.monthlySurplus }
    private var isPositive: Bool { surplus >= 0 }
    private var barColor: Color { isPositive ? .brandMint : .brandRed }
    private var isPrivate: Bool { store.state.privacyMode }

    // Fraction of income already spent, capped 0…1.
    private var spendFraction: CGFloat {
        guard projection.monthlyIncome > 0 else { return projection.monthlyExpenses > 0 ? 1 : 0 }
        return CGFloat(min(projection.monthlyExpenses / projection.monthlyIncome, 1.0))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                stat(label: "Income", amount: projection.monthlyIncome, color: .brandMint)
                stat(label: "Spent", amount: projection.monthlyExpenses, color: .brandRed)
                stat(label: isPositive ? "Left" : "Over", amount: abs(surplus), color: barColor)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, 10)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.brandMint.opacity(0.18))
                        .frame(height: 4)

                    Rectangle()
                        .fill(spendFraction >= 1 ? Color.brandRed : Color.brandRed.opacity(0.75))
                        .frame(width: geo.size.width * spendFraction, height: 4)
                        .motionAnimation(Motion.standard, value: spendFraction)
                }
            }
            .frame(height: 4)
            .accessibilityHidden(true)

            Divider()
                .background(Color.line)
        }
        .background(Color.surface)
    }

    @ViewBuilder
    private func stat(label: String, amount: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.muted)
            AnimatedMoneyText(amount: amount, currency: store.state.currency, font: .moneySmall, color: color, isPrivate: isPrivate)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - IncomeRow

struct IncomeRow: View {
    var entry: IncomeEntry
    var isPrivate: Bool
    @Environment(LedgerStore.self) var store

    var body: some View {
        HStack(spacing: 10) {
            ColorDot(hex: entry.color, size: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.source)
                    .font(.body)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                EntryMetaLine(date: entry.date, recurring: entry.recurring, seeded: entry.seededFrom != nil, imported: entry.imported != nil)
            }

            Spacer()

            AnimatedMoneyText(amount: entry.amount, currency: store.state.currency, font: .moneySmall, color: .brandMint, isPrivate: isPrivate)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - ExpenseRow

struct ExpenseRow: View {
    var entry: ExpenseEntry
    var showCategory: Bool
    var isPrivate: Bool
    @Environment(LedgerStore.self) var store

    var body: some View {
        HStack(spacing: 10) {
            ColorDot(hex: entry.color, size: 10)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                    .font(.body)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                HStack(spacing: Spacing.xs) {
                    if showCategory {
                        Text(entry.category)
                            .font(.caption2)
                            .foregroundStyle(Color.muted)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(hex: entry.color).opacity(0.15))
                            .clipShape(Capsule())
                    }
                    EntryMetaLine(date: entry.date, recurring: entry.recurring, seeded: entry.seededFrom != nil, imported: entry.imported != nil)
                }
            }

            Spacer()

            if entry.debtAccountId != nil {
                Image(systemName: "creditcard")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.brandMint)
                    .accessibilityLabel("Counts as a debt payment")
            }

            AnimatedMoneyText(amount: entry.amount, currency: store.state.currency, font: .moneySmall, color: .ink, isPrivate: isPrivate)
        }
        .padding(.vertical, 2)
    }
}

/// Tiny second line under an entry: day, and badges for recurring / seeded / imported.
struct EntryMetaLine: View {
    var date: String?
    var recurring: Bool
    var seeded: Bool
    var imported: Bool

    var body: some View {
        HStack(spacing: Spacing.xs) {
            if let date, let day = TextImportDates.isoDay(date) {
                Text(day.formatted(.dateTime.day().month(.abbreviated)))
            }
            if recurring {
                Label("Repeats", systemImage: "arrow.triangle.2.circlepath")
                    .labelStyle(.iconOnly)
                    .accessibilityLabel("Repeats monthly")
            }
            if seeded {
                Text("carried over")
            }
            if imported {
                Text("imported")
            }
        }
        .font(.caption2)
        .foregroundStyle(Color.faint)
    }
}

// MARK: - MonthSwitcherControl

struct MonthSwitcherControl: View {
    var month: String
    var onPrev: () -> Void
    var onNext: () -> Void
    var onTap: () -> Void

    var body: some View {
        HStack(spacing: Spacing.xs) {
            Button(action: onPrev) {
                Image(systemName: "chevron.left")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.brandBlue)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Previous month")

            Button(action: onTap) {
                Text(formatMonth(month))
                    .font(.headline)
                    .foregroundStyle(Color.ink)
                    .contentTransition(.numericText())
                    .padding(.horizontal, 6)
            }
            .accessibilityLabel("Month: \(formatMonth(month))")
            .accessibilityHint("Opens the month picker")

            Button(action: onNext) {
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.brandBlue)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Next month")
        }
    }
}

// MARK: - AddEntrySheet

/// The full form. Return on the name moves to the amount (or saves when the amount is
/// already filled); the decimal pad gets an "Add" key in its toolbar; "Save & add
/// another" keeps the keyboard up with the cursor back on the name.
struct AddEntrySheet: View {
    @Binding var kind: TransactionKind
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) private var dismiss

    private enum Field: Hashable {
        case name, amount, customCategory
    }
    @FocusState private var focusedField: Field?

    // Shared fields
    @State private var name: String = ""
    @State private var amountText: String = ""
    @State private var recurring: Bool = false
    @State private var showValidationError = false
    @State private var savedFlash = false
    @State private var amountWasPrefilled = false

    // Category: nil = follow the automatic suggestion.
    @State private var categoryOverride: String? = nil
    @State private var customCategoryText: String = ""
    @State private var isAddingCategory = false

    // Date within the viewed month.
    @State private var entryDate: Date = .now

    private var amount: Double { parseAmountInput(amountText) ?? 0 }
    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && amount > 0
    }

    @State private var memory = MerchantMemory.empty

    private var merchantSuggestions: [MerchantSuggestion] {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard focusedField == .name, trimmed.count >= 1 else { return [] }
        return memory.suggest(kind == .income ? .income : .expense, text: trimmed, limit: 5)
    }

    /// Automatic category suggestion from the same rules the CSV importer uses.
    private var suggestion: CategorySuggestion {
        suggestEntryCategory(
            description: name,
            amount: kind == .income ? abs(amount) : -abs(amount),
            rules: store.state.categoryRules
        )
    }

    private var resolvedCategory: String {
        if isAddingCategory {
            let custom = customCategoryText.trimmingCharacters(in: .whitespaces)
            return custom.isEmpty ? "General" : custom
        }
        if let override = categoryOverride { return override }
        if let remembered = memory.find(.expense, text: name), !remembered.category.isEmpty {
            return remembered.category
        }
        // Never auto-file an expense under "Income".
        let suggested = suggestion.category
        return (kind == .expense && suggested == "Income") ? "General" : suggested
    }

    private var existingCategories: [String] {
        var seen = Set<String>()
        var cats = store.state.months.keys.sorted().reversed()
            .flatMap { store.state.months[$0]?.expenses ?? [] }
            .compactMap { e in seen.insert(e.category).inserted ? e.category : nil }
        if !cats.contains(resolvedCategory) && !isAddingCategory {
            cats.insert(resolvedCategory, at: 0)
        }
        return cats
    }

    /// True when the user is viewing the month that contains "today".
    private var isCurrentMonth: Bool {
        store.selectedMonth == getMonthKey()
    }

    private var monthDateRange: ClosedRange<Date> {
        let start = TextImportDates.isoDay(monthStartDate(store.selectedMonth)) ?? .now
        let end = ledgerCalendar.date(byAdding: DateComponents(month: 1, day: -1), to: start) ?? start
        return start...end
    }

    var body: some View {
        NavigationStack {
            Form {
                // Kind picker
                Section {
                    Picker("Type", selection: $kind) {
                        Text("Expense").tag(TransactionKind.expense)
                        Text("Income").tag(TransactionKind.income)
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))
                }

                Section {
                    TextField(
                        kind == .income ? "Income source (e.g. Salary)" : "What was it? (e.g. Tesco)",
                        text: $name
                    )
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.words)
                    .focused($focusedField, equals: .name)
                    .submitLabel(amount > 0 ? .done : .next)
                    .onSubmit {
                        if amount > 0 {
                            saveAndContinue()
                        } else {
                            focusedField = .amount
                        }
                    }
                    .onChange(of: name) { _, newValue in
                        // Prefill a remembered amount (Netflix is always £15.99) until the user types one.
                        guard amountText.isEmpty || amountWasPrefilled else { return }
                        if let match = memory.find(kind == .income ? .income : .expense, text: newValue),
                           let stable = match.stableAmount {
                            amountText = formatAmountInput(stable)
                            amountWasPrefilled = true
                        } else if amountWasPrefilled {
                            amountText = ""
                            amountWasPrefilled = false
                        }
                    }

                    if !merchantSuggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Spacing.sm) {
                                ForEach(merchantSuggestions) { suggestion in
                                    Button {
                                        name = suggestion.label
                                        if let stable = suggestion.stableAmount {
                                            amountText = formatAmountInput(stable)
                                            amountWasPrefilled = true
                                        }
                                        if !suggestion.category.isEmpty { categoryOverride = suggestion.category }
                                        focusedField = suggestion.stableAmount == nil ? .amount : .name
                                        Haptics.selection()
                                    } label: {
                                        HStack(spacing: Spacing.xs) {
                                            ColorDot(hex: suggestion.color, size: 7)
                                            Text(suggestion.label).lineLimit(1)
                                            if let stable = suggestion.stableAmount, !store.state.privacyMode {
                                                Text(formatMoney(stable, currency: store.state.currency))
                                                    .foregroundStyle(Color.muted)
                                            }
                                        }
                                        .font(.caption.weight(.medium))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 6)
                                        .background(Color.surfaceHigh, in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .listRowInsets(.init(top: 4, leading: 12, bottom: 4, trailing: 12))
                    }

                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .focused($focusedField, equals: .amount)
                            .onChange(of: amountText) { _, _ in
                                if focusedField == .amount { amountWasPrefilled = false }
                            }
                        if amountWasPrefilled && !amountText.isEmpty {
                            Text("usual")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Color.brandBlue)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.brandBlue.opacity(0.12))
                                .clipShape(Capsule())
                                .accessibilityLabel("Usual amount, prefilled")
                        }
                    }
                }

                // Category (expenses only) — automatic, tap to change.
                if kind == .expense {
                    Section {
                        Picker(selection: Binding(
                            get: { isAddingCategory ? "__new__" : resolvedCategory },
                            set: { newValue in
                                if newValue == "__new__" {
                                    isAddingCategory = true
                                    focusedField = .customCategory
                                } else {
                                    isAddingCategory = false
                                    categoryOverride = newValue
                                }
                            }
                        )) {
                            ForEach(existingCategories, id: \.self) { cat in
                                Text(cat).tag(cat)
                            }
                            Text("New category…").tag("__new__")
                        } label: {
                            HStack(spacing: Spacing.sm) {
                                Text("Category")
                                if categoryOverride == nil && !isAddingCategory && !name.isEmpty {
                                    Text("auto")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(Color.brandBlue)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.brandBlue.opacity(0.12))
                                        .clipShape(Capsule())
                                }
                            }
                        }

                        if isAddingCategory {
                            TextField("Category name", text: $customCategoryText)
                                .focused($focusedField, equals: .customCategory)
                                .submitLabel(.done)
                                .onSubmit { focusedField = .amount }
                        }
                    } footer: {
                        if categoryOverride == nil && !isAddingCategory && !name.isEmpty {
                            Text("Sorted automatically — change it if it's wrong and the app remembers.")
                        }
                    }
                }

                Section {
                    DatePicker(
                        "Date",
                        selection: $entryDate,
                        in: monthDateRange,
                        displayedComponents: .date
                    )
                    if !isCurrentMonth {
                        Text("Adding to \(formatMonth(store.selectedMonth))")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }

                    Toggle("Repeats every month", isOn: $recurring)
                        .tint(.brandMint)
                }

                // Validation error
                if showValidationError {
                    Section {
                        Text("Please enter a name and a valid amount.")
                            .font(.caption)
                            .foregroundStyle(Color.brandRed)
                    }
                }

                Section {
                    Button {
                        saveAndContinue()
                    } label: {
                        HStack {
                            Spacer()
                            Label(savedFlash ? "Saved!" : "Save & add another",
                                  systemImage: savedFlash ? "checkmark.circle.fill" : "plus.circle")
                                .foregroundStyle(savedFlash ? Color.brandMint : Color.brandBlue)
                            Spacer()
                        }
                    }
                    .disabled(!isValid)
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
                    Button("Save") {
                        if save() { dismiss() }
                    }
                    .fontWeight(.semibold)
                    .tint(.brandBlue)
                    .disabled(!isValid)
                }
                // The decimal pad has no Return key; give it one.
                ToolbarItemGroup(placement: .keyboard) {
                    if focusedField == .amount {
                        Button {
                            saveAndContinue()
                        } label: {
                            Label("Add another", systemImage: "plus.circle")
                        }
                        .disabled(!isValid)
                        Spacer()
                        Button("Done") {
                            if save() { dismiss() } else { focusedField = nil }
                        }
                        .fontWeight(.semibold)
                    }
                }
            }
        }
        .presentationDetents([.large])
        .task(id: store.state.lastSavedAt) {
            memory = MerchantMemory(state: store.state)
        }
        .onAppear {
            // Default the date: today inside the current month, otherwise the
            // first day of whichever month the user navigated to.
            entryDate = isCurrentMonth ? .now : monthDateRange.lowerBound
            // Pop the keyboard with the cursor on the name field immediately.
            focusedField = .name
        }
    }

    private func saveAndContinue() {
        guard save() else { return }
        // Reset for the next entry, keep the keyboard up.
        name = ""
        amountText = ""
        amountWasPrefilled = false
        categoryOverride = nil
        isAddingCategory = false
        customCategoryText = ""
        recurring = false
        focusedField = .name
        withAnimation(Motion.snappy) { savedFlash = true }
        Task {
            try? await Task.sleep(for: .seconds(1.2))
            withAnimation { savedFlash = false }
        }
    }

    @discardableResult
    private func save() -> Bool {
        guard isValid else {
            withAnimation(Motion.snappy) { showValidationError = true }
            Haptics.notification(.error)
            return false
        }
        showValidationError = false

        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let isoDate = isoDateString(entryDate)
        let rounded = (amount * 100).rounded() / 100

        if kind == .income {
            let entry = IncomeEntry(
                id: createId(prefix: "income"),
                source: trimmedName,
                amount: rounded,
                color: memory.find(.income, text: trimmedName)?.color ?? categoryColor(for: "Income"),
                recurring: recurring,
                date: isoDate
            )
            store.addIncome(entry)
        } else {
            let category = resolvedCategory
            let source: String? = categoryOverride != nil || isAddingCategory ? "user" : suggestion.source
            let entry = ExpenseEntry(
                id: createId(prefix: "expense"),
                name: trimmedName,
                category: category,
                amount: rounded,
                color: store.state.months.values.flatMap(\.expenses).first { $0.category == category }?.color
                    ?? categoryColor(for: category),
                recurring: recurring,
                date: isoDate,
                categorySource: source
            )
            store.addExpense(entry)
        }

        Haptics.confirmSave()
        return true
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
    @State private var entryDate: Date
    @State private var showValidationError = false

    init(entry: IncomeEntry) {
        self.entry = entry
        _source = State(initialValue: entry.source)
        _amountText = State(initialValue: formatAmountInput(entry.amount))
        _recurring = State(initialValue: entry.recurring)
        _selectedColor = State(initialValue: entry.color)
        _entryDate = State(initialValue: entry.date.flatMap(TextImportDates.isoDay) ?? .now)
    }

    private var amount: Double { parseAmountInput(amountText) ?? 0 }
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

                Section {
                    DatePicker("Date", selection: $entryDate, displayedComponents: .date)
                    Toggle("Repeats every month", isOn: $recurring)
                        .tint(.brandMint)
                }

                Section("Colour") {
                    ColorSwatchGrid(selected: $selectedColor)
                }

                if showValidationError {
                    Section {
                        Text("Please enter a source and a valid amount.")
                            .font(.caption)
                            .foregroundStyle(Color.brandRed)
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
        updated.amount = (amount * 100).rounded() / 100
        updated.recurring = recurring
        updated.color = selectedColor
        updated.date = isoDateString(entryDate)
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
    @State private var debtAccountId: String?
    @State private var entryDate: Date
    @State private var newCategoryText: String = ""
    @State private var isAddingCategory = false
    @State private var showValidationError = false

    init(entry: ExpenseEntry, allCategories: [String]) {
        self.entry = entry
        self.allCategories = allCategories
        _name = State(initialValue: entry.name)
        _amountText = State(initialValue: formatAmountInput(entry.amount))
        _recurring = State(initialValue: entry.recurring)
        _selectedColor = State(initialValue: entry.color)
        _category = State(initialValue: entry.category)
        _debtAccountId = State(initialValue: entry.debtAccountId)
        _entryDate = State(initialValue: entry.date.flatMap(TextImportDates.isoDay) ?? .now)
    }

    private var debtAccounts: [Account] {
        store.state.accounts.filter { $0.accountClass == .debt }
    }

    private var categoryChoices: [String] {
        var seen = Set<String>()
        let all = allCategories + store.state.months.keys.sorted().reversed()
            .flatMap { store.state.months[$0]?.expenses.map(\.category) ?? [] }
        return all.filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    private var amount: Double { parseAmountInput(amountText) ?? 0 }
    private var isValid: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty && amount > 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name") {
                    TextField("e.g. Netflix, Groceries", text: $name)
                        .autocorrectionDisabled()
                    if let original = entry.imported?.originalDescription, !original.isEmpty, original != name {
                        Text("Bank description: \(original)")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                }

                Section("Amount") {
                    HStack {
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                    }
                }

                Section {
                    if categoryChoices.isEmpty {
                        TextField("e.g. Housing, Transport", text: $category)
                    } else {
                        Picker("Category", selection: Binding(
                            get: { isAddingCategory ? "__new__" : category },
                            set: { newValue in
                                if newValue == "__new__" {
                                    isAddingCategory = true
                                } else {
                                    isAddingCategory = false
                                    category = newValue
                                }
                            }
                        )) {
                            ForEach(categoryChoices, id: \.self) { cat in
                                Text(cat).tag(cat)
                            }
                            if !categoryChoices.contains(category) && !category.isEmpty {
                                Text(category).tag(category)
                            }
                            Text("New category…").tag("__new__")
                        }

                        if isAddingCategory {
                            TextField("Category name", text: $newCategoryText)
                        }
                    }
                } header: {
                    Text("Category")
                } footer: {
                    if entry.imported != nil || entry.categorySource != nil {
                        Text("Changing the category of an imported entry saves a rule, and earlier automatic guesses for the same payee are re-sorted.")
                    }
                }

                Section {
                    DatePicker("Date", selection: $entryDate, displayedComponents: .date)
                    Toggle("Repeats every month", isOn: $recurring)
                        .tint(.brandMint)
                }

                Section("Colour") {
                    ColorSwatchGrid(selected: $selectedColor)
                }

                if !debtAccounts.isEmpty {
                    Section {
                        Picker("Counts towards", selection: $debtAccountId) {
                            Text("Not linked").tag(String?.none)
                            ForEach(debtAccounts) { account in
                                Text(account.name).tag(String?.some(account.id))
                            }
                        }
                    } header: {
                        Text("Debt payment")
                    } footer: {
                        Text("Linked payments replace the account's scheduled monthly payment for this month, so overpayments reduce the balance by the real amount.")
                    }
                }

                if showValidationError {
                    Section {
                        Text("Please enter a name and a valid amount.")
                            .font(.caption)
                            .foregroundStyle(Color.brandRed)
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
        let typedCategory = newCategoryText.trimmingCharacters(in: .whitespaces)
        let resolvedCategory = isAddingCategory
            ? (typedCategory.isEmpty ? entry.category : typedCategory)
            : category

        var updated = entry
        updated.name = name.trimmingCharacters(in: .whitespaces)
        updated.amount = (amount * 100).rounded() / 100
        updated.recurring = recurring
        updated.color = selectedColor
        updated.category = resolvedCategory
        updated.debtAccountId = debtAccountId
        updated.date = isoDateString(entryDate)
        store.updateExpense(updated)
        Haptics.confirmSave()
        dismiss()
    }
}

// MARK: - ColorSwatchGrid

struct ColorSwatchGrid: View {
    @Binding var selected: String

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 8), spacing: 10) {
            ForEach(CATEGORY_COLORS, id: \.self) { hex in
                Button {
                    selected = hex
                    Haptics.selection()
                } label: {
                    Circle()
                        .fill(Color(hex: hex))
                        .frame(width: 28, height: 28)
                        .overlay(
                            Circle()
                                .strokeBorder(Color.ink.opacity(selected == hex ? 0.8 : 0), lineWidth: 2.5)
                                .padding(2)
                        )
                        .scaleEffect(selected == hex ? 1.15 : 1)
                        .motionAnimation(Motion.snappy, value: selected)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Colour \(hex)")
                .accessibilityAddTraits(selected == hex ? [.isSelected] : [])
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - MonthNoteSheet

struct MonthNoteSheet: View {
    var monthKey: String
    @Binding var note: String
    var onSave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Anything worth remembering about \(formatMonth(monthKey))…", text: $note, axis: .vertical)
                        .lineLimit(3...8)
                        .focused($focused)
                } footer: {
                    Text("Notes sync with the web app and stay with the month.")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle("Month note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
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
                    let budget = store.state.months[key]
                    let hasData = budget.map { !$0.incomes.isEmpty || !$0.expenses.isEmpty } ?? false

                    Button {
                        onSelect(key)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(formatMonth(key))
                                    .font(.body)
                                    .foregroundStyle(Color.ink)

                                if hasData, let budget {
                                    let proj = FinanceEngine.projection(for: budget)
                                    Text("\(budget.incomes.count) income · \(budget.expenses.count) expenses")
                                        .font(.caption)
                                        .foregroundStyle(Color.muted)
                                    Text(store.state.privacyMode ? "•••" : formatSignedMoney(proj.monthlySurplus, currency: store.state.currency))
                                        .font(.caption)
                                        .monospacedDigit()
                                        .foregroundStyle(proj.monthlySurplus >= 0 ? Color.brandMint : Color.brandRed)
                                }
                            }

                            Spacer()

                            if key == selectedMonth {
                                Image(systemName: "checkmark")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Color.brandBlue)
                            }

                            if hasData {
                                Circle()
                                    .fill(Color.brandBlue)
                                    .frame(width: 6, height: 6)
                                    .accessibilityHidden(true)
                            }
                        }
                    }
                    .listRowBackground(key == selectedMonth ? Color.brandBlue.opacity(0.08) : Color.clear)
                    .accessibilityAddTraits(key == selectedMonth ? [.isSelected] : [])
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
                ToolbarItem(placement: .confirmationAction) {
                    Button("Today") {
                        onSelect(getMonthKey())
                    }
                }
            }
        }
    }
}
