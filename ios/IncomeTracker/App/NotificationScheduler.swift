// NotificationScheduler.swift
// Local reminders: upcoming debt bills, a daily "log today's spending" nudge and a
// monthly "import your statement" nudge. All three are opt-in from Settings; nothing
// is scheduled and no permission prompt appears until the user turns one on.
//
// Every reminder is a repeating calendar trigger, so a bill due on the 15th keeps
// reminding on the 12th of every month without the app having to reschedule it.

import UserNotifications
import Foundation

// MARK: - ReminderSettings

/// User choices for local reminders. Stored in the standard UserDefaults (not in the
/// synced ledger — a reminder time is a per-device preference).
public struct ReminderSettings: Hashable, Sendable {
    public var billsEnabled: Bool
    public var billDaysAhead: Int
    public var dailyLogEnabled: Bool
    public var dailyLogHour: Int
    public var dailyLogMinute: Int
    public var monthlyImportEnabled: Bool
    public var monthlyImportDay: Int

    public static let billsEnabledKey = "reminders.billsEnabled"
    public static let billDaysAheadKey = "reminders.billDaysAhead"
    public static let dailyLogEnabledKey = "reminders.dailyLogEnabled"
    public static let dailyLogHourKey = "reminders.dailyLogHour"
    public static let dailyLogMinuteKey = "reminders.dailyLogMinute"
    public static let monthlyImportEnabledKey = "reminders.monthlyImportEnabled"
    public static let monthlyImportDayKey = "reminders.monthlyImportDay"

    public static func load(from defaults: UserDefaults = .standard) -> ReminderSettings {
        ReminderSettings(
            billsEnabled: defaults.bool(forKey: billsEnabledKey),
            billDaysAhead: defaults.object(forKey: billDaysAheadKey) as? Int ?? 3,
            dailyLogEnabled: defaults.bool(forKey: dailyLogEnabledKey),
            dailyLogHour: defaults.object(forKey: dailyLogHourKey) as? Int ?? 20,
            dailyLogMinute: defaults.object(forKey: dailyLogMinuteKey) as? Int ?? 0,
            monthlyImportEnabled: defaults.bool(forKey: monthlyImportEnabledKey),
            monthlyImportDay: defaults.object(forKey: monthlyImportDayKey) as? Int ?? 1
        )
    }

    public var anyEnabled: Bool {
        billsEnabled || dailyLogEnabled || monthlyImportEnabled
    }
}

// MARK: - NotificationScheduler

@MainActor
enum NotificationScheduler {

    /// UNNotificationCategory identifier used for all bill-due reminders.
    static let billCategoryID = "BILL_DUE"
    static let logCategoryID = "LOG_SPENDING"
    static let importCategoryID = "IMPORT_STATEMENT"

    private static let billPrefix = "bill_"
    private static let dailyLogID = "daily_log"
    private static let monthlyImportID = "monthly_import"

    // MARK: - Permission

    /// Asks for permission once, from a Settings toggle. Returns whether reminders are allowed.
    static func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return true
        case .denied:
            return false
        case .notDetermined:
            let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            return granted
        @unknown default:
            return false
        }
    }

    static func isAuthorized() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        default: return false
        }
    }

    /// Registers notification categories so actions and grouping work. Cheap; call at launch.
    static func registerCategories() {
        let open = UNNotificationAction(identifier: "OPEN", title: "Open", options: [.foreground])
        let categories: Set<UNNotificationCategory> = [
            UNNotificationCategory(identifier: billCategoryID, actions: [open], intentIdentifiers: []),
            UNNotificationCategory(identifier: logCategoryID, actions: [open], intentIdentifiers: []),
            UNNotificationCategory(identifier: importCategoryID, actions: [open], intentIdentifiers: []),
        ]
        UNUserNotificationCenter.current().setNotificationCategories(categories)
    }

    // MARK: - Scheduling

    /// Stable digest of everything that feeds the schedule; the store skips a reschedule
    /// when it has not changed.
    static func fingerprint(accounts: [Account], settings: ReminderSettings, currency: CurrencyCode) -> String {
        let bills = qualifyingDebtAccounts(accounts)
            .map { "\($0.id)|\($0.name)|\($0.dueDay)|\($0.minimumPayment)" }
            .sorted()
            .joined(separator: ";")
        return "\(settings.hashValue)|\(currency.rawValue)|\(bills)"
    }

    /// Replaces every reminder from scratch according to `settings`. Removes all of the
    /// app's pending requests when nothing is enabled, so deleted or paid-off accounts
    /// never leave stale reminders behind. Never prompts for permission.
    static func reschedule(accounts: [Account], settings: ReminderSettings, currency: CurrencyCode) async {
        let center = UNUserNotificationCenter.current()
        await removeAllAppReminders(center)

        guard settings.anyEnabled, await isAuthorized() else { return }

        var requests: [UNNotificationRequest] = []

        if settings.billsEnabled {
            let daysAhead = max(0, min(14, settings.billDaysAhead))
            for account in qualifyingDebtAccounts(accounts) {
                requests.append(billRequest(for: account, daysAhead: daysAhead, currency: currency))
            }
        }

        if settings.dailyLogEnabled {
            let content = UNMutableNotificationContent()
            content.title = "Log today's spending"
            content.body = "Thirty seconds now keeps this month's numbers honest."
            content.sound = .default
            content.categoryIdentifier = logCategoryID
            var components = DateComponents()
            components.hour = max(0, min(23, settings.dailyLogHour))
            components.minute = max(0, min(59, settings.dailyLogMinute))
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            requests.append(UNNotificationRequest(identifier: dailyLogID, content: content, trigger: trigger))
        }

        if settings.monthlyImportEnabled {
            let content = UNMutableNotificationContent()
            content.title = "New month — import your statement"
            content.body = "Export last month's CSV from your bank and drop it in to keep the ledger complete."
            content.sound = .default
            content.categoryIdentifier = importCategoryID
            var components = DateComponents()
            components.day = max(1, min(28, settings.monthlyImportDay))
            components.hour = 9
            components.minute = 0
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            requests.append(UNNotificationRequest(identifier: monthlyImportID, content: content, trigger: trigger))
        }

        for request in requests {
            try? await center.add(request)
        }
    }

    /// Removes every pending Income Tracker notification from the system.
    static func cancelAllReminders() async {
        await removeAllAppReminders(UNUserNotificationCenter.current())
    }

    // MARK: - Private helpers

    private static func removeAllAppReminders(_ center: UNUserNotificationCenter) async {
        let pending = await center.pendingNotificationRequests()
        let ours = pending.map(\.identifier).filter {
            $0.hasPrefix(billPrefix) || $0 == dailyLogID || $0 == monthlyImportID
        }
        if !ours.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: ours)
        }
    }

    /// Debt accounts with a due day and a minimum payment get a bill reminder.
    private static func qualifyingDebtAccounts(_ accounts: [Account]) -> [Account] {
        accounts.filter {
            $0.accountClass == .debt && $0.dueDay > 0 && $0.minimumPayment > 0 && $0.balance > 0
        }
    }

    /// A repeating reminder `daysAhead` days before the account's due day, every month.
    /// Days are kept within 1...28 so the reminder exists in February too.
    private static func billRequest(for account: Account, daysAhead: Int, currency: CurrencyCode) -> UNNotificationRequest {
        let dueDay = max(1, min(28, account.dueDay))
        let reminderDay = ((dueDay - daysAhead - 1) % 28 + 28) % 28 + 1

        let content = UNMutableNotificationContent()
        content.title = daysAhead == 0
            ? "Bill due today"
            : "Bill due in \(daysAhead) day\(daysAhead == 1 ? "" : "s")"
        content.body = "\(account.name): minimum payment of \(formatCurrency(account.minimumPayment, currency: currency)) is due on the \(ordinal(dueDay))."
        content.sound = .default
        content.categoryIdentifier = billCategoryID
        content.userInfo = ["accountId": account.id, "dueDay": dueDay]

        var components = DateComponents()
        components.day = reminderDay
        components.hour = 9
        components.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

        return UNNotificationRequest(
            identifier: "\(billPrefix)\(account.id)",
            content: content,
            trigger: trigger
        )
    }

    private static func formatCurrency(_ amount: Double, currency: CurrencyCode) -> String {
        FinanceEngine.currencyFormatter(for: currency).string(from: NSNumber(value: amount))
            ?? String(format: "%.2f", amount)
    }

    /// English ordinal for a day number, e.g. 1 → "1st", 22 → "22nd".
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

// MARK: - Foreground presentation

/// Lets reminders show as banners while the app is open (without a delegate iOS
/// silently drops foreground notifications).
final class NotificationPresenter: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = NotificationPresenter()

    @MainActor
    func install() {
        UNUserNotificationCenter.current().delegate = self
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
