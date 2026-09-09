// ImportReviewSheet.swift
// Income Tracker — import review sheet (CSV, OFX, QIF, pasted text, screenshots).
// Shows parsed rows with per-row controls; the user confirms or cancels the import.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - ImportReviewSheet

struct ImportReviewSheet: View {

    /// The parsed rows supplied by the importer.
    var rows: [CsvImportRow]
    /// Original file name (shown in the header).
    var fileName: String
    /// Debt accounts available for linking debt-payment rows (may be empty).
    var debtAccounts: [Account] = []
    /// Called with the final (possibly user-edited) rows when the user taps "Import".
    var onConfirm: ([CsvImportRow]) -> Void
    /// Called when the user taps "Cancel".
    var onDismiss: () -> Void

    @Environment(LedgerStore.self) private var store

    // Mutable working copy of the rows — drives the UI. Seeded once at init so the
    // list never flashes empty and re-appearing does not throw edits away.
    @State private var editableRows: [CsvImportRow]

    // Bulk category picker
    @State private var bulkCategory = ""
    @State private var bulkCustomCategory = ""

    init(
        rows: [CsvImportRow],
        fileName: String,
        debtAccounts: [Account] = [],
        onConfirm: @escaping ([CsvImportRow]) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.rows = rows
        self.fileName = fileName
        self.debtAccounts = debtAccounts
        self.onConfirm = onConfirm
        self.onDismiss = onDismiss
        _editableRows = State(initialValue: rows)
    }

    /// Categories from the rows plus every category the ledger already uses.
    private var availableCategories: [String] {
        var seen = Set<String>()
        let fromRows = editableRows.map(\.category)
        let fromLedger = store.state.months.keys.sorted().reversed()
            .flatMap { store.state.months[$0]?.expenses.map(\.category) ?? [] }
        return (fromRows + fromLedger + ["Unsorted"])
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .sorted()
    }

    private var includedCount: Int {
        editableRows.filter { $0.include && $0.kind != .transfer }.count
    }

    private var transferCount: Int {
        editableRows.filter { $0.kind == .transfer }.count
    }

    private var duplicateCount: Int {
        editableRows.filter(\.duplicate).count
    }

    private var includedTotal: Double {
        editableRows.filter { $0.include && $0.kind != .transfer }.reduce(0) { $0 + $1.amount }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                headerBar
                Divider()
                bulkActionsBar
                Divider()

                if editableRows.isEmpty {
                    ContentUnavailableView(
                        "No rows",
                        systemImage: "doc.text",
                        description: Text("The file contained no importable transactions.")
                    )
                } else {
                    List {
                        ForEach($editableRows) { $row in
                            ImportRowCell(
                                row: $row,
                                availableCategories: availableCategories,
                                debtAccounts: debtAccounts,
                                currency: store.state.currency
                            )
                        }
                    }
                    .listStyle(.plain)
                }

                Divider()
                footerBar
            }
            .navigationTitle("Review import")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        Haptics.impact(.light)
                        onDismiss()
                    }
                }
            }
        }
        .presentationDetents([.large])
        .interactiveDismissDisabled(true)
    }

    // MARK: - Header bar

    private var headerBar: some View {
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text(fileName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Spacer()
                Text("\(editableRows.count) row\(editableRows.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
            }

            HStack(spacing: Spacing.sm) {
                if duplicateCount > 0 {
                    TonePill(label: "\(duplicateCount) duplicate\(duplicateCount != 1 ? "s" : "")", color: .brandAmber)
                }
                if transferCount > 0 {
                    TonePill(label: "\(transferCount) transfer\(transferCount != 1 ? "s" : "") skipped", color: .brandBlue)
                }
                Spacer()
                Button("All") {
                    withAnimation(Motion.snappy) {
                        for idx in editableRows.indices { editableRows[idx].include = true }
                    }
                    Haptics.impact(.light)
                }
                Button("None") {
                    withAnimation(Motion.snappy) {
                        for idx in editableRows.indices { editableRows[idx].include = false }
                    }
                    Haptics.impact(.light)
                }
                Button("Skip dupes") {
                    withAnimation(Motion.snappy) {
                        for idx in editableRows.indices where editableRows[idx].duplicate {
                            editableRows[idx].include = false
                        }
                    }
                    Haptics.impact(.light)
                }
                .disabled(duplicateCount == 0)
            }
            .font(.caption.weight(.semibold))
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    // MARK: - Bulk actions bar

    private var bulkActionsBar: some View {
        HStack(spacing: Spacing.sm) {
            Text("Category for selected")
                .font(.caption)
                .foregroundStyle(Color.muted)
                .lineLimit(1)

            Picker("Category", selection: $bulkCategory) {
                Text("Choose…").tag("")
                ForEach(availableCategories, id: \.self) { cat in
                    Text(cat).tag(cat)
                }
                Text("New…").tag("__new__")
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .controlSize(.small)

            if bulkCategory == "__new__" {
                TextField("Name", text: $bulkCustomCategory)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)
                    .frame(maxWidth: 140)
            }

            Button("Apply") {
                let chosen = bulkCategory == "__new__"
                    ? bulkCustomCategory.trimmingCharacters(in: .whitespaces)
                    : bulkCategory
                guard !chosen.isEmpty else { return }
                withAnimation(Motion.snappy) {
                    for idx in editableRows.indices where editableRows[idx].include {
                        editableRows[idx].category = chosen
                        editableRows[idx].categorySource = "user"
                    }
                }
                Haptics.impact(.light)
            }
            .disabled((bulkCategory.isEmpty || (bulkCategory == "__new__" && bulkCustomCategory.trimmingCharacters(in: .whitespaces).isEmpty)) || includedCount == 0)
            .buttonStyle(.bordered)
            .controlSize(.small)

            Spacer(minLength: 0)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color.bg)
    }

    // MARK: - Footer bar

    private var footerBar: some View {
        VStack(spacing: Spacing.sm) {
            if includedCount > 0 && !store.state.privacyMode {
                Text("Net \(formatSignedMoney(includedTotal, currency: store.state.currency)) across \(includedCount) row\(includedCount == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
                    .monospacedDigit()
            }
            HStack(spacing: Spacing.md) {
                Button("Cancel") {
                    Haptics.impact(.light)
                    onDismiss()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity)

                Button {
                    onConfirm(editableRows)
                } label: {
                    Text(includedCount == 0
                         ? (transferCount > 0 ? "Save transfer rules" : "Nothing selected")
                         : "Import \(includedCount) row\(includedCount != 1 ? "s" : "")")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.brandBlue)
                .disabled(includedCount == 0 && transferCount == 0)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color.surfaceHigh)
    }
}

// MARK: - ImportRowCell

private struct ImportRowCell: View {
    @Binding var row: CsvImportRow

    var availableCategories: [String]
    var debtAccounts: [Account]
    var currency: CurrencyCode

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private let allKinds: [TransactionKind] = [.income, .expense, .debtPayment, .transfer]

    private var categoryChoices: [String] {
        var seen = Set<String>()
        return (availableCategories + [row.category]).filter { !$0.isEmpty && seen.insert($0).inserted }.sorted()
    }

    var body: some View {
        // Controls stack below the text at accessibility sizes instead of clipping.
        let stacked = dynamicTypeSize.isAccessibilitySize
        VStack(alignment: .leading, spacing: Spacing.sm) {
            HStack(alignment: .center, spacing: Spacing.md) {
                Toggle(isOn: $row.include) {
                    Text("Include \(row.description)")
                }
                .labelsHidden()
                .onChange(of: row.include) { Haptics.impact(.light) }

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(row.date)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(Color.muted)
                        if row.duplicate {
                            TonePill(label: "Duplicate", color: .brandAmber)
                        }
                        if row.kind == .transfer {
                            TonePill(label: "Transfer", color: .brandBlue)
                        }
                    }
                    Text(row.description)
                        .font(.subheadline)
                        .foregroundStyle(row.include ? Color.ink : Color.muted)
                        .lineLimit(2)

                    if let match = row.duplicateOf {
                        Label("May duplicate “\(match)”", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption2)
                            .foregroundStyle(Color.brandAmber)
                            .lineLimit(2)
                    } else if !row.note.isEmpty && row.confidence < 0.8 {
                        Text(row.note)
                            .font(.caption2)
                            .foregroundStyle(Color.faint)
                            .lineLimit(1)
                    }
                }

                Spacer(minLength: Spacing.sm)

                Text(formatSignedMoney(row.amount, currency: currency))
                    .font(.subheadline.monospacedDigit().weight(.medium))
                    .foregroundStyle(row.amount >= 0 ? Color.brandMint : Color.brandRed)
            }

            if stacked {
                pickers
            } else {
                HStack(spacing: Spacing.sm) {
                    Spacer(minLength: 0)
                    pickers
                }
            }
        }
        .padding(.vertical, 4)
        .opacity(row.include ? 1.0 : 0.45)
        .animation(Motion.snappy, value: row.include)
    }

    @ViewBuilder
    private var pickers: some View {
        Picker("Kind", selection: $row.kind) {
            ForEach(allKinds, id: \.self) { kind in
                Text(kindLabel(kind)).tag(kind)
            }
        }
        .pickerStyle(.menu)
        .labelsHidden()
        .controlSize(.small)
        .onChange(of: row.kind) { _, newKind in
            // The account link only means something on debt-payment rows.
            if newKind != .debtPayment {
                row.debtAccountId = nil
            }
            // Transfers are never imported; everything else is opt-in by the toggle.
            if newKind == .transfer {
                row.include = false
            }
        }
        .accessibilityLabel("Kind")

        Picker("Category", selection: $row.category) {
            ForEach(categoryChoices, id: \.self) { cat in
                Text(cat).tag(cat)
            }
        }
        .pickerStyle(.menu)
        .labelsHidden()
        .controlSize(.small)
        .onChange(of: row.category) { _, _ in
            row.categorySource = "user"
        }
        .accessibilityLabel("Category")

        if row.kind == .debtPayment && !debtAccounts.isEmpty {
            Picker("Pays account", selection: $row.debtAccountId) {
                Text("Not linked").tag(String?.none)
                ForEach(debtAccounts) { account in
                    Text("Pays \(account.name)").tag(String?.some(account.id))
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .controlSize(.small)
            .accessibilityLabel("Debt account")
        }
    }

    private func kindLabel(_ kind: TransactionKind) -> String {
        switch kind {
        case .income:      return "Income"
        case .expense:     return "Expense"
        case .debtPayment: return "Debt payment"
        case .transfer:    return "Transfer"
        }
    }
}
