// NotificationScheduler.swift
// Schedules and cancels UNUserNotification reminders for upcoming debt bill due dates.
//
// Lifecycle:
//   1. Call `scheduleBillReminders(accounts:daysAhead:)` after every account mutation.
//   2. The function requests notification permission on first use, then cancels all
//      existing bill reminders and re-schedules one per qualifying debt account.
//   3. Call `cancelAllBillReminders()` if the user disables notifications in Settings.

import UserNotifications
import Foundation

// MARK: - NotificationScheduler

@MainActor
enum NotificationScheduler {

    /// UNNotificationCategory identifier used for all bill-due reminders.
    static let categoryID = "BILL_DUE"

    // MARK: - Public API

    /// Cancels all existing bill reminders and reschedules them from `accounts`.
    ///
    /// Only debt accounts with both a `dueDay > 0` and a `minimumPayment > 0` receive
    /// a notification. Each reminder fires `daysAhead` calendar days before the next
    /// occurrence of the account's due day (rolling over to the following month if the
    /// due day has already passed for the current month).
    ///
    /// Permission is requested automatically on the first call if not yet determined.
    /// If the user has denied permission this function returns early.
    ///
    /// - Parameters:
    ///   - accounts: The full account list from `LedgerState.accounts`.
    ///   - daysAhead: How many days before the due date the reminder fires. Default: 3.
    static func scheduleBillReminders(
        accounts: [Account],
        daysAhead: Int = 3
    ) async {
        let center = UNUserNotificationCenter.current()

        // Check current authorisation status.
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            // First time — request permission.  If the user denies we'll return on the
            // next call because authorizationStatus will be .denied.
            _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
            // Re-read after the request.
            let updated = await center.notificationSettings()
            guard updated.authorizationStatus == .authorized else { return }
        case .authorized, .provisional, .ephemeral:
            break  // Allowed — proceed.
        case .denied:
            return  // User has explicitly denied; nothing to do.
        @unknown default:
            return
        }

        let qualifying = debtAccountsNeedingReminders(accounts)

        // Cancel existing bill reminders for every qualifying account so we always
        // start from a clean slate (handles rescheduled due days, deleted accounts, etc.).
        let oldIDs = qualifying.map { notificationID(for: $0) }
        center.removePendingNotificationRequests(withIdentifiers: oldIDs)

        let calendar = Calendar.current
        let today = calendar.component(.day, from: .now)

        for account in qualifying {
            guard let request = buildRequest(
                for: account,
                daysAhead: daysAhead,
                today: today,
                calendar: calendar
            ) else { continue }

            try? await center.add(request)
        }
    }

    /// Removes every pending Income Tracker notification from the system.
    /// Call this when the user turns off notifications in the app's Settings screen.
    static func cancelAllBillReminders() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    // MARK: - Private helpers

    /// Returns accounts that qualify for a bill reminder:
    /// debt class, non-zero due day, non-zero minimum payment.
    private static func debtAccountsNeedingReminders(_ accounts: [Account]) -> [Account] {
        accounts.filter {
            $0.accountClass == .debt && $0.dueDay > 0 && $0.minimumPayment > 0
        }
    }

    /// Stable notification identifier for an account — stays the same across
    /// reschedules so `removePendingNotificationRequests` can target it precisely.
    private static func notificationID(for account: Account) -> String {
        "bill_\(account.id)"
    }

    /// Builds the `UNNotificationRequest` for `account`, or returns `nil` if the
    /// computed trigger date is in the past.
    private static func buildRequest(
        for account: Account,
        daysAhead: Int,
        today: Int,
        calendar: Calendar
    ) -> UNNotificationRequest? {
        let rawDueDay = account.dueDay

        // Clamp to a sane range (1–28 avoids Feb edge-cases; same as FinanceEngine.clampDueDay).
        let dueDay = min(max(rawDueDay, 1), 28)

        // Determine the target month: if the due day has already passed this month,
        // schedule for the same day next month.
        var components = calendar.dateComponents([.year, .month], from: .now)
        components.day = dueDay
        components.hour = 9
        components.minute = 0

        if dueDay <= today {
            // Roll forward one month.
            components.month = (components.month ?? 1) + 1
        }

        guard
            let dueDate = calendar.date(from: components),
            let reminderDate = calendar.date(byAdding: .day, value: -daysAhead, to: dueDate),
            reminderDate > .now
        else { return nil }

        // Build content.
        let content = UNMutableNotificationContent()
        content.title = "Bill due in \(daysAhead) day\(daysAhead == 1 ? "" : "s")"
        content.body = "\(account.name) — minimum payment of \(formatCurrency(account.minimumPayment)) is due on the \(ordinal(dueDay))."
        content.sound = .default
        content.categoryIdentifier = categoryID
        // Store the account ID so a notification action could deep-link later.
        content.userInfo = ["accountId": account.id, "dueDay": dueDay]

        let triggerComponents = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: reminderDate
        )
        let trigger = UNCalendarNotificationTrigger(
            dateMatching: triggerComponents,
            repeats: false
        )

        return UNNotificationRequest(
            identifier: notificationID(for: account),
            content: content,
            trigger: trigger
        )
    }

    /// Formats a currency amount. Uses a plain £ prefix as a sensible fallback
    /// since the notification scheduler doesn't have access to the full LedgerState.
    /// The WidgetDataProvider snapshot carries the currency code for a richer format.
    private static func formatCurrency(_ amount: Double) -> String {
        // Try to read the currency from the widget snapshot; fall back to £.
        let code = WidgetDataProvider.read()?.currency ?? "GBP"
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = code
        fmt.maximumFractionDigits = code == "JPY" ? 0 : 2
        fmt.minimumFractionDigits = code == "JPY" ? 0 : 2
        return fmt.string(from: NSNumber(value: amount)) ?? String(format: "%.2f", amount)
    }

    /// Returns an English ordinal string for a day number, e.g. 1 → "1st", 22 → "22nd".
    private static func ordinal(_ n: Int) -> String {
        let suffix: String
        switch n % 10 {
        case 1 where n % 100 != 11: suffix = "st"
        case 2 where n % 100 != 12: suffix = "nd"
        case 3 where n % 100 != 13: suffix = "rd"
        default:                    suffix = "th"
        }
        return "\(n)\(suffix)"
    }
}

// MARK: - Widget snapshot update hook
//
// Every time the ledger state is persisted locally we must also push a fresh
// widget snapshot to the shared App Group container so that widgets display
// up-to-date figures without needing to launch the main app.
//
// Integration point: `LedgerStore+Persistence.swift → persistLocally()`
//
// Add the following two lines at the end of `persistLocally()`, after the
// UserDefaults write, so the widget snapshot is always in sync with the
// persisted ledger state:
//
//   WidgetDataProvider.write(buildWidgetSnapshot(from: state))
//
// Additionally, reschedule bill reminders whenever accounts are persisted:
//
//   Task { await NotificationScheduler.scheduleBillReminders(accounts: state.accounts) }
//
// Example of what the updated `persistLocally()` in LedgerStore+Persistence.swift
// should look like once the hook is wired up:
//
//   func persistLocally() async {
//       guard let data = try? JSONEncoder.ledger.encode(state) else { return }
//       let defaults = UserDefaults(suiteName: kAppGroupID)
//       defaults?.set(data, forKey: kStateKey)
//       defaults?.synchronize()
//
//       // Keep the widget snapshot in sync.
//       WidgetDataProvider.write(buildWidgetSnapshot(from: state))
//
//       // Reschedule bill due-date notifications.
//       Task { await NotificationScheduler.scheduleBillReminders(accounts: state.accounts) }
//   }
//
// No changes to `scheduleSave()` itself are required — `persistLocally()` is
// already called by every save path (debounced autosave and undo restoration).
