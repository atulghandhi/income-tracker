// MergeConflictSheet.swift
// Income Tracker — shown the first time this device syncs with an account when both
// hold their own, different data (no shared history to merge from). Combining is the
// recommended choice; the other two keep one side. Mirrors MergeConflictModal on the web.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - MergeConflictSheet

struct MergeConflictSheet: View {
    var conflict: SyncCoordinator.MergeConflict
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync

    var body: some View {
        // Non-dismissible (caller uses .interactiveDismissDisabled(true))
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    Image(systemName: "icloud.and.arrow.up.and.arrow.down")
                        .font(.system(size: 48))
                        .foregroundStyle(Color.brandBlue)
                        .symbolEffect(.pulse)
                        .accessibilityHidden(true)

                    Text("Your account already has data")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)

                    Text("This iPhone and your account each have their own transactions. Choose how to bring them together.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Color.muted)

                    ConflictChoiceCard(
                        title: "Combine both (recommended)",
                        summary: "\(transactionCount(conflict.local)) here + \(transactionCount(conflict.cloud)) in your account",
                        warning: "Nothing is lost. Statements imported on both are kept once.",
                        action: { choose(.combine) }
                    )

                    HStack(spacing: 16) {
                        ConflictChoiceCard(
                            title: "Use my account's data",
                            summary: ledgerSummary(conflict.cloud),
                            warning: "This iPhone's data will be cleared.",
                            action: { choose(.cloud) }
                        )
                        ConflictChoiceCard(
                            title: "Use this iPhone's data",
                            summary: ledgerSummary(conflict.local),
                            warning: "Your account's data will be replaced on every device.",
                            action: { choose(.local) }
                        )
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 32)
            }
            .navigationBarHidden(true)
        }
    }

    private func choose(_ choice: SyncEngine.FirstSyncChoice) {
        sync.mergeConflict = nil
        Task { await store.syncEngine?.resolveFirstSync(choice) }
    }

    private func transactionCount(_ state: LedgerState) -> String {
        let count = state.months.values.reduce(0) { $0 + $1.incomes.count + $1.expenses.count }
        return "\(count) transaction\(count != 1 ? "s" : "")"
    }

    func ledgerSummary(_ state: LedgerState) -> String {
        let monthCount = state.months.values.filter { !$0.incomes.isEmpty || !$0.expenses.isEmpty }.count
        return "\(transactionCount(state)) · \(monthCount) month\(monthCount != 1 ? "s" : "")"
    }
}

// MARK: - ConflictChoiceCard

struct ConflictChoiceCard: View {
    var title: String
    var summary: String
    var warning: String
    var action: () -> Void

    var body: some View {
        Button(action: { Haptics.impact(.medium); action() }) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.headline).foregroundStyle(Color.ink)
                Text(summary).font(.caption).foregroundStyle(Color.muted)
                Spacer()
                Text(warning).font(.caption2).foregroundStyle(Color.faint)
            }
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            .padding(16)
        }
        .buttonStyle(PressableCardButtonStyle())
        .accessibilityHint(warning)
    }
}

/// Card-shaped button that dips slightly while pressed, using the public
/// `configuration.isPressed` instead of a private SwiftUI gesture hook.
struct PressableCardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(Color.surfaceHigh)
            .clipShape(.rect(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.lineStrong))
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(Motion.snappy, value: configuration.isPressed)
    }
}
