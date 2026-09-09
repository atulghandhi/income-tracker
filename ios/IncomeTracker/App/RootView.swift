// RootView.swift
// Five-tab shell for the Income Tracker app.
// Handles hydration, the privacy lock, appearance preferences, the sync nudge,
// merge conflicts, first-run onboarding and scene-phase housekeeping.

import SwiftUI
import LocalAuthentication

struct RootView: View {

    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @Environment(AppRouter.self) var router
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage("colorSchemePreference") private var colorSchemePref: ColorSchemePreference = .system
    @AppStorage(Motion.animationsEnabledKey) private var animationsEnabled = true
    @AppStorage("requireFaceID") private var requireFaceID = false
    @AppStorage("onboarding.completed") private var onboardingCompleted = false

    @State private var showSettings = false
    @State private var showSyncNudge = false
    @State private var syncNudgeDismissed = false
    @State private var isLocked = false
    @State private var isAuthenticating = false
    @State private var showOnboarding = false
    @State private var hasHydratedOnce = false

    var body: some View {
        @Bindable var router = router

        TabView(selection: $router.selectedTab) {
            // Ledger is the home tab: opening the app lands on the quick-log bar.
            NavigationStack { LedgerScreen() }
                .tabItem { Label("Ledger", systemImage: "list.bullet.rectangle") }
                .tag(AppRouter.Tab.ledger)

            NavigationStack { DashboardScreen() }
                .tabItem { Label("Dashboard", systemImage: "square.grid.2x2") }
                .tag(AppRouter.Tab.dashboard)

            NavigationStack { AccountsScreen() }
                .tabItem { Label("Accounts", systemImage: "creditcard") }
                .tag(AppRouter.Tab.accounts)

            NavigationStack { GoalsScreen() }
                .tabItem { Label("Goals", systemImage: "target") }
                .tag(AppRouter.Tab.goals)

            NavigationStack { InsightsScreen() }
                .tabItem { Label("Insights", systemImage: "chart.line.uptrend.xyaxis") }
                .tag(AppRouter.Tab.insights)
        }
        .tint(.brandBlue)
        .preferredColorScheme(colorSchemePref.colorScheme)
        // The in-app "Animations" switch: strip animations from every transaction.
        .transaction { transaction in
            if !animationsEnabled { transaction.animation = nil }
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        .sheet(isPresented: $showOnboarding) {
            OnboardingSheet {
                onboardingCompleted = true
                showOnboarding = false
            }
            .environment(store)
            .interactiveDismissDisabled(true)
        }
        // Sync nudge banner slides up from the bottom above the tab bar.
        .overlay(alignment: .bottom) {
            if showSyncNudge && !sync.isSignedIn && !syncNudgeDismissed {
                SyncNudgeBanner(
                    onSignIn: {
                        withAnimation { showSyncNudge = false }
                        showSettings = true
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
        // Merge-conflict sheet — the user picks a side; nothing pushes until then.
        .sheet(item: Binding(
            get: { sync.mergeConflict },
            set: { _ in } // resolution is done inside the sheet
        )) { conflict in
            MergeConflictSheet(conflict: conflict)
                .environment(store)
                .environment(sync)
                .interactiveDismissDisabled(true)
        }
        .overlay {
            if isLocked {
                PrivacyLockView(isAuthenticating: isAuthenticating, onUnlock: authenticate)
                    .transition(.opacity)
            }
        }
        .task {
            // 1. Install the cloud pusher so every debounced local save is followed
            //    by a push while signed in (never while a conflict is unresolved).
            store.cloudPusher = { state in
                guard sync.isSignedIn, sync.mergeConflict == nil, let userId = sync.currentUser?.id else { return true }
                do {
                    try await sync.saveCloudState(state, userId: userId)
                    return true
                } catch {
                    sync.lastSyncError = error.localizedDescription
                    return false
                }
            }

            // 2. Restore any persisted auth session before touching the cloud.
            await sync.restoreSession()

            // 3. Hydrate store: local first, then cloud if signed in.
            await store.hydrate(sync: sync)
            hasHydratedOnce = true

            // 4. First run: a short setup sheet for anyone with an empty ledger.
            if !onboardingCompleted && !store.state.hasLocalData && sync.mergeConflict == nil {
                showOnboarding = true
            } else if !onboardingCompleted {
                onboardingCompleted = true
            }

            // 5. After five minutes, nudge signed-out users to back up — interrupting a
            //    brand-new user mid-setup costs more than the nudge earns.
            try? await Task.sleep(for: .seconds(300))
            if !sync.isSignedIn {
                withAnimation { showSyncNudge = true }
            }
        }
        // Signing in after launch (from Settings or the nudge) pulls the cloud
        // copy and merges it with whatever exists locally.
        .onChange(of: sync.isSignedIn) { wasSignedIn, isSignedIn in
            if !wasSignedIn && isSignedIn {
                Task { await store.hydrate(sync: sync) }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                if requireFaceID { isLocked = true }
                Task { await store.flushPendingSave() }
            case .active:
                if isLocked {
                    authenticate()
                } else if hasHydratedOnce {
                    Task { await store.refreshFromCloudIfIdle(sync: sync) }
                }
            default:
                break
            }
        }
        .onAppear {
            if requireFaceID {
                isLocked = true
                authenticate()
            }
        }
    }

    // MARK: - Privacy lock

    private func authenticate() {
        guard !isAuthenticating else { return }
        let context = LAContext()
        context.localizedCancelTitle = "Not now"
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            // No passcode set — there is nothing to lock behind.
            withAnimation(Motion.snappy) { isLocked = false }
            return
        }
        isAuthenticating = true
        Task {
            let unlocked = (try? await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Unlock your ledger"
            )) ?? false
            isAuthenticating = false
            if unlocked {
                withAnimation(Motion.snappy) { isLocked = false }
                await store.refreshFromCloudIfIdle(sync: sync)
            }
        }
    }
}

// MARK: - PrivacyLockView

/// Full-screen cover shown while Face ID is required; hides every figure beneath it.
struct PrivacyLockView: View {
    var isAuthenticating: Bool
    var onUnlock: () -> Void

    var body: some View {
        ZStack {
            Color.bg.ignoresSafeArea()
            VStack(spacing: Spacing.lg) {
                Image(systemName: "lock.shield")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(Color.brandBlue)
                    .accessibilityHidden(true)
                Text("Income Tracker is locked")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.ink)
                Text("Use Face ID or your passcode to open your ledger.")
                    .font(.subheadline)
                    .foregroundStyle(Color.muted)
                    .multilineTextAlignment(.center)
                Button(action: onUnlock) {
                    if isAuthenticating {
                        ProgressView()
                            .frame(maxWidth: 160)
                    } else {
                        Label("Unlock", systemImage: "faceid")
                            .frame(maxWidth: 160)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.brandBlue)
                .disabled(isAuthenticating)
            }
            .padding(Spacing.xxl)
        }
    }
}
