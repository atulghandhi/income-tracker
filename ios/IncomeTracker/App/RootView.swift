// RootView.swift
// Five-tab shell for the Income Tracker app.
// Handles sync nudge banner, merge-conflict sheet, and initial hydration.

import SwiftUI

struct RootView: View {

    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync

    @State private var showSettings = false
    @State private var showSyncNudge = false
    @State private var syncNudgeDismissed = false

    var body: some View {
        TabView {
            // Tab 1: Dashboard
            NavigationStack { DashboardScreen() }
                .tabItem { Label("Dashboard", systemImage: "square.grid.2x2") }

            // Tab 2: Ledger
            NavigationStack { LedgerScreen() }
                .tabItem { Label("Ledger", systemImage: "list.bullet.rectangle") }

            // Tab 3: Accounts
            NavigationStack { AccountsScreen() }
                .tabItem { Label("Accounts", systemImage: "creditcard") }

            // Tab 4: Goals
            NavigationStack { GoalsScreen() }
                .tabItem { Label("Goals", systemImage: "target") }

            // Tab 5: Insights
            NavigationStack { InsightsScreen() }
                .tabItem { Label("Insights", systemImage: "chart.line.uptrend.xyaxis") }
        }
        .tint(.brandBlue)
        // Settings sheet (toolbar button wired per-screen via environment action).
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        // Sync nudge banner slides up from the bottom above the tab bar.
        .overlay(alignment: .bottom) {
            if showSyncNudge && !sync.isSignedIn && !syncNudgeDismissed {
                SyncNudgeBanner(
                    onSignIn: {
                        withAnimation { showSyncNudge = false }
                        // TODO: trigger Google / Apple sign-in sheet from here.
                    },
                    onDismiss: {
                        syncNudgeDismissed = true
                        withAnimation { showSyncNudge = false }
                    }
                )
                .padding(.bottom, 90) // clear the tab bar
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // Merge-conflict sheet — interactiveDismissDisabled prevents swipe-to-dismiss.
        .sheet(item: Binding(
            get: { sync.mergeConflict },
            set: { _ in } // resolution is done inside the sheet
        )) { conflict in
            MergeConflictSheet(conflict: conflict)
                .environment(store)
                .environment(sync)
                .interactiveDismissDisabled(true)
        }
        .task {
            // 1. Restore any persisted auth session before touching the cloud.
            await sync.restoreSession()

            // 2. Hydrate store: local first, then cloud if signed in.
            await store.hydrate(sync: sync)

            // 3. After 60 s show the sync nudge if the user is still signed out.
            try? await Task.sleep(for: .seconds(60))
            if !sync.isSignedIn {
                withAnimation { showSyncNudge = true }
            }
        }
    }
}
