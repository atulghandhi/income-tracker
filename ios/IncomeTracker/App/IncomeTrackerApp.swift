// IncomeTrackerApp.swift
// Swift 6 / iOS 17+ SwiftUI entry point.
// Owns the store, the sync coordinator and the router, injects them into the
// environment, registers the store for App Intents, and routes incoming URLs.

import SwiftUI
import AppIntents

@main
struct IncomeTrackerApp: App {

    @State private var store: LedgerStore
    @State private var syncCoordinator = SyncCoordinator()
    @State private var router = AppRouter()

    init() {
        let store = LedgerStore()
        _store = State(initialValue: store)
        // Siri / Shortcuts run the intents inside this process and resolve the store
        // through the dependency manager, so they write to the same ledger the UI shows.
        AppDependencyManager.shared.add(dependency: store)
        NotificationScheduler.registerCategories()
        NotificationPresenter.shared.install()
        Haptics.prepare()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(syncCoordinator)
                .environment(router)
                .onOpenURL { url in
                    // incometracker://auth-callback… completes Google sign-in; every
                    // other incometracker:// URL (widgets, Shortcuts) is navigation.
                    if url.host?.lowercased() == "auth-callback" {
                        syncCoordinator.handleAuthCallback(url: url)
                    } else {
                        router.handle(url: url)
                    }
                }
        }
    }
}
