// MergeConflictSheet.swift
// Income Tracker — conflict resolution sheet shown when cloud and local
// data both have recent activity and cannot be merged automatically.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - MergeConflictSheet

struct MergeConflictSheet: View {
    var conflict: SyncCoordinator.MergeConflict
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @Environment(\.dismiss) var dismiss

    var body: some View {
        // Non-dismissible (caller uses .interactiveDismissDisabled(true))
        NavigationStack {
            VStack(spacing: 24) {
                // Icon
                Image(systemName: "icloud.and.arrow.up.and.arrow.down")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.brandBlue)
                    .symbolEffect(.pulse)

                Text("Your account already has data")
                    .font(.title2.bold())

                Text("Both this device and your cloud have separate data. Choose which to keep — the other will be overwritten.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.muted)

                // Two large choice cards side by side
                HStack(spacing: 16) {
                    ConflictChoiceCard(
                        title: "Keep this device's data",
                        summary: ledgerSummary(conflict.local),
                        warning: "Cloud data will be replaced.",
                        action: {
                            // Keep local: it becomes the newest write and is pushed to the cloud.
                            sync.mergeConflict = nil
                            store.replaceState(conflict.local, pushToCloud: true)
                        }
                    )

                    ConflictChoiceCard(
                        title: "Use cloud data",
                        summary: ledgerSummary(conflict.cloud),
                        warning: "Local data will be cleared.",
                        action: {
                            // Use cloud: adopt it as-is (its timestamp already wins) and save locally.
                            sync.mergeConflict = nil
                            store.replaceState(conflict.cloud, pushToCloud: false)
                        }
                    )
                }
                .padding(.horizontal)

                Spacer()
            }
            .padding(.top, 40)
            .navigationBarHidden(true)
        }
    }

    func ledgerSummary(_ state: LedgerState) -> String {
        let txCount = state.months.values.reduce(0) { $0 + $1.incomes.count + $1.expenses.count }
        let monthCount = state.months.count
        return "\(txCount) transaction\(txCount != 1 ? "s" : "") · \(monthCount) month\(monthCount != 1 ? "s" : "")"
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
