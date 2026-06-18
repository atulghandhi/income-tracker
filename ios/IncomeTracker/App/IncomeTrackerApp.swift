// IncomeTrackerApp.swift
// Swift 6 / iOS 17+ SwiftUI entry point.
// Injects LedgerStore and SyncCoordinator into the environment
// and wires the OAuth redirect URL handler.

import SwiftUI

@main
struct IncomeTrackerApp: App {

    @State private var store = LedgerStore()
    @State private var syncCoordinator = SyncCoordinator()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(syncCoordinator)
                .onOpenURL { url in
                    // Handle incometracker://auth-callback for Google OAuth.
                    syncCoordinator.handleAuthCallback(url: url)
                }
        }
    }
}
