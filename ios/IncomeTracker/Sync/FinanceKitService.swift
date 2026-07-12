// FinanceKitService.swift
// Stage D1 of docs/AUTOMATION_PLAN.md — automatic transaction capture from
// Apple Wallet via FinanceKit (iOS 17.4+; UK bank connections from iOS 18.4).
//
// PREREQUISITES (all external — the code below degrades gracefully without them):
//   1. Apple-granted FinanceKit entitlement (com.apple.developer.financekit).
//      Request at developer.apple.com; approval is manual and takes time.
//      Add to IncomeTracker.entitlements once granted (see project.yml note).
//   2. App Store listing in the Finance category (US or UK storefront).
//   3. NSFinancialDataDescription usage string in Info.plist (already added).
//
// Design: FinanceKit transactions are mapped into the same `CsvImportRow`
// shape the CSV importer produces and flow through the existing
// ImportReviewSheet → LedgerStore.commitCSVImport pipeline. The FinanceKit
// transaction UUID is the dedupe key ("fk-<uuid>", mirroring the web app's
// OFX FITID handling), so re-syncs never double-import.

import Foundation
import SwiftUI

#if canImport(FinanceKit)
import FinanceKit
#endif

// MARK: - Availability

public enum WalletFeedAvailability: Sendable, Equatable {
    /// FinanceKit doesn't exist on this OS, the entitlement is missing,
    /// or the device has no Wallet financial data.
    case unavailable
    /// Available but the user hasn't been asked yet.
    case notDetermined
    /// User granted access.
    case authorized
    /// User declined access (re-prompting is not possible; direct to Settings).
    case denied
}

// MARK: - Service

/// Pulls new Wallet transactions and converts them to reviewable import rows.
/// All methods are safe to call on any OS version; they report `.unavailable`
/// instead of crashing when FinanceKit (or its entitlement) is absent.
@MainActor
public final class FinanceKitService: ObservableObject {

    public static let shared = FinanceKitService()

    @Published public private(set) var availability: WalletFeedAvailability = .unavailable
    @Published public private(set) var lastSyncedAt: Date?

    private let lastSyncKey = "financekit.lastSyncedAt"

    private init() {
        lastSyncedAt = UserDefaults.standard.object(forKey: lastSyncKey) as? Date
    }

    // MARK: Authorization

    public func refreshAvailability() async {
        #if canImport(FinanceKit)
        guard #available(iOS 17.4, *) else {
            availability = .unavailable
            return
        }
        do {
            let status = try await FinanceStore.shared.authorizationStatus()
            switch status {
            case .authorized: availability = .authorized
            case .denied: availability = .denied
            case .notDetermined: availability = .notDetermined
            @unknown default: availability = .unavailable
            }
        } catch {
            // Missing entitlement (or FinanceKit disabled) surfaces as an error.
            availability = .unavailable
        }
        #else
        availability = .unavailable
        #endif
    }

    /// Presents Apple's consent UI (account picker + time range).
    public func requestAccess() async {
        #if canImport(FinanceKit)
        guard #available(iOS 17.4, *) else { return }
        do {
            let status = try await FinanceStore.shared.requestAuthorization()
            availability = status == .authorized ? .authorized : .denied
        } catch {
            availability = .unavailable
        }
        #endif
    }

    // MARK: Sync

    /// Fetches Wallet transactions and returns them as reviewable import rows,
    /// deduped against the ledger. Returns [] when unauthorized/unavailable.
    ///
    /// Suggestion pipeline parity with CSV import: the user's learned rules and
    /// the system rules run over the descriptor; Wallet's own merchant name is
    /// preferred as the description when present.
    public func fetchNewTransactionRows(state: LedgerState) async -> [CsvImportRow] {
        #if canImport(FinanceKit)
        guard #available(iOS 17.4, *), availability == .authorized else { return [] }

        do {
            // Overlap window: re-fetch 45 days back; UUID-keyed hashes make
            // re-imports no-ops, so overlap is safe and catches late-posting rows.
            let since = (lastSyncedAt ?? .distantPast).addingTimeInterval(-45 * 86_400)
            let query = TransactionQuery(
                sortDescriptors: [SortDescriptor(\FinanceKit.Transaction.transactionDate, order: .reverse)],
                predicate: nil,
                limit: 500,
                offset: nil
            )
            let transactions = try await FinanceStore.shared.transactions(query: query)

            let existingHashes = collectLedgerHashes(state: state)
            let isoFormatter = DateFormatter()
            isoFormatter.dateFormat = "yyyy-MM-dd"
            isoFormatter.timeZone = .current

            var rows: [CsvImportRow] = []
            for (index, transaction) in transactions.enumerated() {
                guard transaction.transactionDate >= since else { continue }

                let signedAmount = signedAmountOf(transaction)
                let description = (transaction.merchantName?.isEmpty == false ? transaction.merchantName! : transaction.transactionDescription)
                    .trimmingCharacters(in: .whitespaces)
                guard !description.isEmpty, signedAmount != 0 else { continue }

                let isoDate = isoFormatter.string(from: transaction.transactionDate)
                let hash = "fk-\(transaction.id.uuidString)"
                let fallbackHash = createTransactionHash(date: isoDate, description: description, amount: signedAmount)
                let duplicate = existingHashes.contains(hash) || existingHashes.contains(fallbackHash)

                let suggestion = suggestEntryCategory(description: description, amount: signedAmount, rules: state.categoryRules)

                rows.append(CsvImportRow(
                    id: "draft-\(index + 1)-\(hash)",
                    rowNumber: index + 1,
                    date: isoDate,
                    monthKey: String(isoDate.prefix(7)),
                    description: description,
                    amount: signedAmount,
                    rawAmount: String(format: "%.2f", signedAmount),
                    kind: suggestion.kind,
                    suggestedKind: suggestion.kind,
                    category: suggestion.category,
                    suggestedCategory: suggestion.category,
                    color: categoryColor(for: suggestion.category),
                    include: !duplicate && suggestion.kind != .transfer,
                    duplicate: duplicate,
                    duplicateOf: nil,
                    confidence: suggestion.confidence,
                    note: duplicate ? "Already in your ledger" : suggestion.note,
                    hash: hash,
                    debtAccountId: suggestion.debtAccountId
                ))
            }

            markSynced()
            return rows
        } catch {
            return []
        }
        #else
        return []
        #endif
    }

    private func markSynced() {
        lastSyncedAt = Date()
        UserDefaults.standard.set(lastSyncedAt, forKey: lastSyncKey)
    }

    // MARK: Helpers

    #if canImport(FinanceKit)
    @available(iOS 17.4, *)
    private func signedAmountOf(_ transaction: FinanceKit.Transaction) -> Double {
        let magnitude = abs(NSDecimalNumber(decimal: transaction.transactionAmount.amount).doubleValue)
        switch transaction.creditDebitIndicator {
        case .credit: return magnitude
        case .debit: return -magnitude
        @unknown default: return -magnitude
        }
    }
    #endif

    private func collectLedgerHashes(state: LedgerState) -> Set<String> {
        var hashes = Set<String>()
        for (_, month) in state.months {
            for income in month.incomes {
                if let imported = income.imported { hashes.insert(imported.hash) }
                if let date = income.date {
                    hashes.insert(createTransactionHash(date: date, description: income.source, amount: income.amount))
                }
            }
            for expense in month.expenses {
                if let imported = expense.imported { hashes.insert(imported.hash) }
                if let date = expense.date {
                    hashes.insert(createTransactionHash(date: date, description: expense.name, amount: -abs(expense.amount)))
                }
            }
        }
        return hashes
    }
}

// MARK: - Settings section view

/// Drop-in section for SettingsSheet: shows connect state and triggers a sync
/// that hands rows to the shared import review flow.
public struct WalletFeedSection: View {
    @ObservedObject private var service = FinanceKitService.shared

    /// Owner supplies the ledger state and receives reviewable rows.
    public var state: LedgerState
    public var onRowsFetched: ([CsvImportRow]) -> Void

    @State private var syncing = false

    public init(state: LedgerState, onRowsFetched: @escaping ([CsvImportRow]) -> Void) {
        self.state = state
        self.onRowsFetched = onRowsFetched
    }

    public var body: some View {
        Section {
            switch service.availability {
            case .unavailable:
                Label("Apple Wallet feed isn’t available on this device", systemImage: "wallet.pass")
                    .foregroundStyle(.secondary)
            case .denied:
                Label("Wallet access declined — enable in Settings ▸ Privacy", systemImage: "wallet.pass")
                    .foregroundStyle(.secondary)
            case .notDetermined:
                Button {
                    Task { await service.requestAccess() }
                } label: {
                    Label("Connect Apple Wallet", systemImage: "wallet.pass")
                }
            case .authorized:
                Button {
                    syncing = true
                    Task {
                        let rows = await service.fetchNewTransactionRows(state: state)
                        syncing = false
                        onRowsFetched(rows)
                    }
                } label: {
                    if syncing {
                        Label("Syncing…", systemImage: "arrow.triangle.2.circlepath")
                    } else {
                        Label("Sync Wallet transactions", systemImage: "arrow.triangle.2.circlepath")
                    }
                }
                .disabled(syncing)
                if let lastSyncedAt = service.lastSyncedAt {
                    Text("Last synced \(lastSyncedAt.formatted(.relative(presentation: .named)))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("Automatic import")
        } footer: {
            Text("Transactions from accounts you share via Apple Wallet import automatically — no bank login inside this app. Requires iOS 18.4+ for UK banks.")
        }
        .task { await service.refreshAvailability() }
    }
}
