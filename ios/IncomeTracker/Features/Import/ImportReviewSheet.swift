// ImportReviewSheet.swift
// Income Tracker — CSV import review sheet.
// Shows parsed rows with per-row controls; user confirms or cancels the import.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - ImportReviewSheet

struct ImportReviewSheet: View {

    /// The parsed rows supplied by the CSV importer.
    var rows: [CsvImportRow]
    /// Original file name (shown in the header).
    var fileName: String
    /// Debt accounts available for linking debt-payment rows (may be empty).
    var debtAccounts: [Account] = []
    /// Called with the final (possibly user-edited) rows when the user taps "Import".
    var onConfirm: ([CsvImportRow]) -> Void
    /// Called when the user taps "Cancel".
    var onDismiss: () -> Void

    // Mutable working copy of the rows — drives the UI.
    @State private var editableRows: [CsvImportRow] = []

    // Bulk category picker
    @State private var bulkCategory = ""

    // All categories present in the rows (for the bulk picker).
    private var availableCategories: [String] {
        Array(Set(editableRows.map(\.category))).sorted()
    }

    // How many rows are currently marked for inclusion.
    private var includedCount: Int {
        editableRows.filter(\.include).count
    }

    private var duplicateCount: Int {
        editableRows.filter(\.duplicate).count
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // ── Header bar ────────────────────────────────────────────────
                headerBar

                Divider()

                // ── Bulk actions ─────────────────────────────────────────────
                bulkActionsBar

                Divider()

                // ── Row list ─────────────────────────────────────────────────
                if editableRows.isEmpty {
                    ContentUnavailableView(
                        "No rows",
                        systemImage: "doc.text",
                        description: Text("The CSV contained no importable transactions.")
                    )
                } else {
                    List {
                        ForEach($editableRows) { $row in
                            ImportRowCell(row: $row, availableCategories: availableCategories, debtAccounts: debtAccounts)
                        }
                    }
                    .listStyle(.plain)
                }

                Divider()

                // ── Footer ───────────────────────────────────────────────────
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
        .onAppear {
            editableRows = rows
        }
    }

    // MARK: - Header bar

    private var headerBar: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text(fileName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    Text("\(editableRows.count) rows")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                    if duplicateCount > 0 {
                        Text("· \(duplicateCount) duplicate\(duplicateCount != 1 ? "s" : "")")
                            .font(.caption)
                            .foregroundStyle(Color.brandAmber)
                    }
                }
            }

            Spacer()

            // Select all / deselect all
            Button("All") {
                withAnimation(Motion.snappy) {
                    for idx in editableRows.indices {
                        editableRows[idx].include = true
                    }
                }
                Haptics.impact(.light)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)

            Button("None") {
                withAnimation(Motion.snappy) {
                    for idx in editableRows.indices {
                        editableRows[idx].include = false
                    }
                }
                Haptics.impact(.light)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)

            // Skip duplicates
            Button("Skip dupes") {
                withAnimation(Motion.snappy) {
                    for idx in editableRows.indices where editableRows[idx].duplicate {
                        editableRows[idx].include = false
                    }
                }
                Haptics.impact(.light)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(duplicateCount == 0)
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    // MARK: - Bulk actions bar

    private var bulkActionsBar: some View {
        HStack(spacing: 12) {
            Text("Apply category to included:")
                .font(.caption)
                .foregroundStyle(Color.muted)

            Picker("Category", selection: $bulkCategory) {
                Text("Choose…").tag("")
                ForEach(availableCategories, id: \.self) { cat in
                    Text(cat).tag(cat)
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .controlSize(.small)

            Button("Apply") {
                guard !bulkCategory.isEmpty else { return }
                withAnimation(Motion.snappy) {
                    for idx in editableRows.indices where editableRows[idx].include {
                        editableRows[idx].category = bulkCategory
                    }
                }
                Haptics.impact(.light)
            }
            .disabled(bulkCategory.isEmpty || includedCount == 0)
            .buttonStyle(.bordered)
            .controlSize(.small)

            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color.bg)
    }

    // MARK: - Footer bar

    private var footerBar: some View {
        HStack(spacing: 12) {
            Button("Cancel") {
                Haptics.impact(.light)
                onDismiss()
            }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)

            Button {
                Haptics.confirmSave()
                onConfirm(editableRows)
            } label: {
                Text(includedCount == 0
                     ? "Nothing selected"
                     : "Import \(includedCount) row\(includedCount != 1 ? "s" : "")")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.brandBlue)
            .disabled(includedCount == 0)
            .frame(maxWidth: .infinity)
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

    // All TransactionKind cases presented to the user (excluding internal kinds
    // the CSV importer may produce).
    private let allKinds: [TransactionKind] = [.income, .expense, .debtPayment, .transfer]

    var body: some View {
        HStack(alignment: .center, spacing: 12) {

            // Inclusion toggle
            Toggle("", isOn: $row.include)
                .labelsHidden()
                .onChange(of: row.include) { Haptics.impact(.light) }

            // Date + description
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(row.date)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(Color.muted)
                    if row.duplicate {
                        Text("Duplicate")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.brandAmber)
                            .clipShape(Capsule())
                    }
                }
                Text(row.description)
                    .font(.subheadline)
                    .foregroundStyle(row.include ? Color.ink : Color.muted)
                    .lineLimit(1)

                // Point at the entry this row appears to duplicate so the
                // user can compare before opting in.
                if let match = row.duplicateOf {
                    Label("May duplicate “\(match)”", systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(Color.brandAmber)
                        .lineLimit(2)
                }
            }

            Spacer()

            // Amount (coloured by sign)
            VStack(alignment: .trailing, spacing: 4) {
                Text(formattedAmount(row.amount))
                    .font(.subheadline.monospacedDigit().weight(.medium))
                    .foregroundStyle(row.amount >= 0 ? Color.brandMint : Color.brandRed)

                // Kind picker
                Picker("Kind", selection: $row.kind) {
                    ForEach(allKinds, id: \.self) { kind in
                        Text(kindLabel(kind)).tag(kind)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .controlSize(.mini)
                .onChange(of: row.kind) { _, newKind in
                    // The account link only means something on debt-payment rows.
                    if newKind != .debtPayment {
                        row.debtAccountId = nil
                    }
                }

                // Category picker
                Picker("Category", selection: $row.category) {
                    // Include the current category even if not in availableCategories
                    let cats = (availableCategories + [row.category])
                        .removingDuplicates()
                        .sorted()
                    ForEach(cats, id: \.self) { cat in
                        Text(cat).tag(cat)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .controlSize(.mini)

                // Debt account link (debt-payment rows only). Linked payments replace the
                // account's scheduled monthly payment in the balance roll-forward.
                if row.kind == .debtPayment && !debtAccounts.isEmpty {
                    Picker("Pays account", selection: $row.debtAccountId) {
                        Text("Not linked").tag(String?.none)
                        ForEach(debtAccounts) { account in
                            Text("Pays \(account.name)").tag(String?.some(account.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .controlSize(.mini)
                }
            }
            .frame(minWidth: 110, alignment: .trailing)
        }
        .padding(.vertical, 4)
        .opacity(row.include ? 1.0 : 0.45)
        .animation(Motion.snappy, value: row.include)
    }

    private func formattedAmount(_ amount: Double) -> String {
        let abs = Swift.abs(amount)
        let sign = amount < 0 ? "−" : "+"
        return "\(sign)\(String(format: "%.2f", abs))"
    }

    private func kindLabel(_ kind: TransactionKind) -> String {
        switch kind {
        case .income:      return "Income"
        case .expense:     return "Expense"
        case .debtPayment: return "Debt"
        case .transfer:    return "Transfer"
        }
    }
}

// MARK: - Array deduplication helper

private extension Array where Element: Hashable {
    func removingDuplicates() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
