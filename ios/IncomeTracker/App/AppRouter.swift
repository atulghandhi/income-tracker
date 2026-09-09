// AppRouter.swift
// Tab selection and deep-link routing shared by the whole app.
//
// Widgets open incometracker://dashboard, Shortcuts can open incometracker://log,
// and notifications land on the tab that matches what they nagged about. Only the
// OAuth callback (incometracker://auth-callback) is handled elsewhere.

import Foundation
import Observation

@MainActor
@Observable
final class AppRouter {

    enum Tab: String, Hashable, CaseIterable {
        case ledger, dashboard, accounts, goals, insights
    }

    var selectedTab: Tab = .ledger

    /// Set by a deep link; the Ledger tab opens the entry form and clears it.
    var pendingQuickLog = false

    /// Handles an `incometracker://` URL. Returns false for URLs that are not navigation.
    @discardableResult
    func handle(url: URL) -> Bool {
        guard url.scheme?.lowercased() == "incometracker" else { return false }
        switch url.host?.lowercased() {
        case "dashboard":
            selectedTab = .dashboard
        case "ledger":
            selectedTab = .ledger
        case "log", "add", "quick-log":
            selectedTab = .ledger
            pendingQuickLog = true
        case "accounts":
            selectedTab = .accounts
        case "goals":
            selectedTab = .goals
        case "insights":
            selectedTab = .insights
        default:
            return false
        }
        return true
    }
}
