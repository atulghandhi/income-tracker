// SettingsSheet.swift
// Income Tracker — Settings sheet (all sections).
// Swift 6 / iOS 17+

import SwiftUI
import UniformTypeIdentifiers
import UIKit

// MARK: - SettingsSheet

struct SettingsSheet: View {

    @Environment(LedgerStore.self) private var store
    @Environment(SyncCoordinator.self) private var sync
    @Environment(\.dismiss) private var dismiss

    // Sign-in
    @State private var appleSignIn = AppleSignInCoordinator()
    @State private var signInError: String? = nil
    @State private var isSigningIn = false
    @State private var emailField = ""
    @State private var passwordField = ""
    @State private var emailAuthNotice: String? = nil
    @State private var showSignOutConfirm = false

    // Cloud vault
    @State private var isSyncing = false

    // Data control
    @State private var exportJSONItem: ShareItem? = nil
    @State private var exportCSVItem:  ShareItem?  = nil
    @State private var showJSONImporter = false
    @State private var jsonImportError: String? = nil
    @State private var importFlow = ImportFlowState()
    @State private var notice: String? = nil

    // Rules
    @State private var newRulePattern = ""

    // Privacy
    @AppStorage("requireFaceID") private var requireFaceID = false

    // Appearance
    @AppStorage("colorSchemePreference") private var colorSchemePref: ColorSchemePreference = .system
    @AppStorage(Motion.animationsEnabledKey) private var animationsEnabled = true

    // Reminders (per-device; see ReminderSettings)
    @AppStorage(ReminderSettings.billsEnabledKey) private var billsEnabled = false
    @AppStorage(ReminderSettings.billDaysAheadKey) private var billDaysAhead = 3
    @AppStorage(ReminderSettings.dailyLogEnabledKey) private var dailyLogEnabled = false
    @AppStorage(ReminderSettings.dailyLogHourKey) private var dailyLogHour = 20
    @AppStorage(ReminderSettings.dailyLogMinuteKey) private var dailyLogMinute = 0
    @AppStorage(ReminderSettings.monthlyImportEnabledKey) private var monthlyImportEnabled = false
    @AppStorage(ReminderSettings.monthlyImportDayKey) private var monthlyImportDay = 1
    @State private var notificationsDenied = false

    // Danger zone
    @State private var showClearMonthConfirm = false

    // Feedback sheet
    @State private var showFeedback = false

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                cloudVaultSection
                ledgerSection
                remindersSection
                dataControlSection
                privacySection
                appearanceSection
                rulesSection
                feedbackSection
                dangerZoneSection
                aboutSection
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
            .sheet(item: $exportJSONItem) { item in
                ShareSheet(items: [item.url as Any])
            }
            .sheet(item: $exportCSVItem) { item in
                ShareSheet(items: [item.url as Any])
            }
            .sheet(isPresented: $showFeedback) {
                FeedbackSheet()
            }
            .importFlow($importFlow) { result in
                let rows = result.importedRows
                showNotice(rows > 0 ? "Imported \(rows) row\(rows == 1 ? "" : "s")" : (result.learnedTransferPatterns > 0 ? "Transfer patterns saved" : "Nothing imported"))
            }
            .fileImporter(
                isPresented: $showJSONImporter,
                allowedContentTypes: [.json]
            ) { result in
                handleJSONImport(result: result)
            }
            .alert("Clear \(formatMonth(store.state.selectedMonth))?",
                   isPresented: $showClearMonthConfirm) {
                Button("Clear", role: .destructive) {
                    Haptics.destructiveAction()
                    clearSelectedMonth()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All income and expense entries for this month will be deleted. Undo is available from the Ledger menu straight afterwards.")
            }
            .alert("Import error", isPresented: Binding(
                get: { jsonImportError != nil },
                set: { if !$0 { jsonImportError = nil } }
            )) {
                Button("OK") { jsonImportError = nil }
            } message: {
                Text(jsonImportError ?? "")
            }
            .confirmationDialog("Sign out of this device?", isPresented: $showSignOutConfirm, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    Task {
                        await sync.signOut()
                        sync.mergeConflict = nil
                        store.resetAfterSignOut()
                        Haptics.impact(.light)
                    }
                }
            } message: {
                Text("Your ledger stays in your cloud vault and comes back when you sign in again. This device returns to an empty ledger.")
            }
            .task {
                notificationsDenied = await !NotificationScheduler.isAuthorized()
                    && (billsEnabled || dailyLogEnabled || monthlyImportEnabled)
            }
        }
    }

    // MARK: - Account section

    @ViewBuilder
    private var accountSection: some View {
        Section("Account") {
            if sync.isSignedIn, let user = sync.currentUser {
                HStack(spacing: Spacing.md) {
                    ZStack {
                        Circle()
                            .fill(Color.brandBlue)
                        Text(initialsFor(user.email))
                            .font(.headline)
                            .foregroundStyle(.white)
                    }
                    .frame(width: 44, height: 44)
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.email ?? "Signed in")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Color.ink)
                        Text("Syncing across your devices")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                }
                .padding(.vertical, 4)

                Button(role: .destructive) {
                    showSignOutConfirm = true
                } label: {
                    Text("Sign out")
                }
            } else {
                Button {
                    isSigningIn = true
                    signInError = nil
                    appleSignIn.onSuccess = { idToken, nonce in
                        Task {
                            do {
                                try await sync.signInWithApple(idToken: idToken, nonce: nonce)
                            } catch {
                                signInError = error.localizedDescription
                            }
                            isSigningIn = false
                        }
                    }
                    appleSignIn.onFailure = { error in
                        signInError = error.localizedDescription
                        isSigningIn = false
                    }
                    appleSignIn.onCancel = {
                        isSigningIn = false
                    }
                    appleSignIn.startSignIn()
                    Haptics.impact(.light)
                } label: {
                    HStack(spacing: Spacing.sm) {
                        Image(systemName: "apple.logo")
                        Text("Sign in with Apple")
                            .fontWeight(.medium)
                        if isSigningIn {
                            Spacer()
                            ProgressView().controlSize(.small)
                        }
                    }
                }
                .disabled(isSigningIn)

                Button {
                    signInError = nil
                    Task {
                        do {
                            try await sync.signInWithGoogle()
                            Haptics.impact(.light)
                        } catch {
                            signInError = error.localizedDescription
                        }
                    }
                } label: {
                    Text("Sign in with Google")
                        .foregroundStyle(Color.brandBlue)
                }
                .buttonStyle(.plain)

                if let error = signInError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(Color.brandRed)
                }
            }
        }

        if !sync.isSignedIn {
            emailAuthSection
        }
    }

    // MARK: - Email / password section

    @ViewBuilder
    private var emailAuthSection: some View {
        Section {
            TextField("Email", text: $emailField)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textContentType(.username)

            SecureField("Password", text: $passwordField)
                .textContentType(.password)

            HStack(spacing: Spacing.md) {
                Button {
                    runEmailAuth {
                        try await sync.signInWithEmail(
                            emailField.trimmingCharacters(in: .whitespaces),
                            password: passwordField
                        )
                        emailAuthNotice = nil
                    }
                } label: {
                    if isSigningIn {
                        ProgressView().controlSize(.small)
                    } else {
                        Text("Sign in").fontWeight(.semibold)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.brandBlue)
                .disabled(!emailFormValid || isSigningIn)

                Button("Create account") {
                    runEmailAuth {
                        let result = try await sync.signUpWithEmail(
                            emailField.trimmingCharacters(in: .whitespaces),
                            password: passwordField
                        )
                        emailAuthNotice = result == .confirmationRequired
                            ? "Check your inbox — confirm your email, then sign in here."
                            : nil
                    }
                }
                .buttonStyle(.bordered)
                .disabled(!emailFormValid || isSigningIn)
            }

            Button("Forgot password?") {
                runEmailAuth {
                    try await sync.sendPasswordReset(
                        email: emailField.trimmingCharacters(in: .whitespaces)
                    )
                    emailAuthNotice = "Password reset email sent."
                }
            }
            .font(.caption)
            .buttonStyle(.plain)
            .foregroundStyle(Color.brandBlue)
            .disabled(emailField.trimmingCharacters(in: .whitespaces).isEmpty || isSigningIn)

            if let notice = emailAuthNotice {
                Label(notice, systemImage: "envelope.badge")
                    .font(.caption)
                    .foregroundStyle(Color.brandMint)
            }
        } header: {
            Text("Or use email")
        } footer: {
            Text("Passwords need at least 6 characters. New accounts must confirm their email before the first sign-in.")
        }
    }

    private var emailFormValid: Bool {
        emailField.contains("@") && passwordField.count >= 6
    }

    /// Shared wrapper: clears errors, shows the spinner, and reports failures.
    private func runEmailAuth(_ operation: @escaping () async throws -> Void) {
        signInError = nil
        emailAuthNotice = nil
        isSigningIn = true
        Task {
            do {
                try await operation()
                Haptics.impact(.light)
            } catch {
                signInError = error.localizedDescription
                Haptics.notification(.error)
            }
            isSigningIn = false
        }
    }

    // MARK: - Cloud vault section

    @ViewBuilder
    private var cloudVaultSection: some View {
        Section {
            Text("Your ledger syncs to a private row tied to your account. Row-level security means only you can read it.")
                .font(.caption)
                .foregroundStyle(Color.muted)

            LabeledContent("Last synced") {
                if let lastSync = sync.lastSyncedAt {
                    Text(lastSync, style: .relative)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                } else {
                    Text("Never")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }
            }

            Button {
                Task {
                    isSyncing = true
                    await store.syncToCloud(sync: sync)
                    isSyncing = false
                    Haptics.impact(.light)
                }
            } label: {
                HStack {
                    if isSyncing || sync.isSyncing {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(isSyncing || sync.isSyncing ? "Syncing…" : "Sync now")
                }
            }
            .disabled(isSyncing || sync.isSyncing || !sync.isSignedIn)

            if let error = sync.lastSyncError {
                Label(error, systemImage: "exclamationmark.icloud")
                    .font(.caption)
                    .foregroundStyle(Color.brandRed)
            }
        } header: {
            Text("Cloud vault")
        }
    }

    // MARK: - Ledger section

    @ViewBuilder
    private var ledgerSection: some View {
        Section {
            Picker("Currency", selection: Binding(
                get: { store.state.currency },
                set: { store.setCurrency($0) }
            )) {
                ForEach(CURRENCY_OPTIONS, id: \.code) { option in
                    Text(option.label).tag(option.code)
                }
            }

            Stepper(
                value: Binding(
                    get: { store.state.savingsTarget },
                    set: { store.setSavingsTarget($0) }
                ),
                in: 0...100,
                step: 1
            ) {
                LabeledContent("Savings target", value: formatPercent(store.state.savingsTarget, digits: 0))
            }

            Picker("Goal horizon", selection: Binding(
                get: { store.state.goalsHorizonMonths },
                set: { store.setGoalsHorizonMonths($0) }
            )) {
                ForEach(GOAL_HORIZON_OPTIONS, id: \.self) { months in
                    Text(months % 12 == 0 ? "\(months / 12) year\(months == 12 ? "" : "s")" : "\(months) months").tag(months)
                }
            }

            Stepper(
                value: Binding(
                    get: { store.state.assumedInvestmentReturn },
                    set: { store.setAssumedInvestmentReturn(($0 * 2).rounded() / 2) }
                ),
                in: -50...50,
                step: 0.5
            ) {
                LabeledContent("Investment return", value: "\(formatPercent(store.state.assumedInvestmentReturn)) a year")
            }
        } header: {
            Text("Ledger")
        } footer: {
            Text("The savings target drives the health score; the horizon and return feed the goal planner and net-worth outlook. All three sync with the web app.")
        }
    }

    // MARK: - Reminders section

    @ViewBuilder
    private var remindersSection: some View {
        Section {
            Toggle("Daily \"log your spending\"", isOn: $dailyLogEnabled)
                .onChange(of: dailyLogEnabled) { _, on in reminderToggled(on) }
            if dailyLogEnabled {
                DatePicker(
                    "Remind me at",
                    selection: Binding(
                        get: {
                            ledgerCalendar.date(from: DateComponents(year: 2000, month: 1, day: 1, hour: dailyLogHour, minute: dailyLogMinute)) ?? .now
                        },
                        set: { date in
                            dailyLogHour = ledgerCalendar.component(.hour, from: date)
                            dailyLogMinute = ledgerCalendar.component(.minute, from: date)
                            store.rescheduleRemindersIfNeeded(force: true)
                        }
                    ),
                    displayedComponents: .hourAndMinute
                )
            }

            Toggle("Bill due reminders", isOn: $billsEnabled)
                .onChange(of: billsEnabled) { _, on in reminderToggled(on) }
            if billsEnabled {
                Stepper(value: $billDaysAhead, in: 0...14) {
                    LabeledContent("Days before due", value: "\(billDaysAhead)")
                }
                .onChange(of: billDaysAhead) { _, _ in store.rescheduleRemindersIfNeeded(force: true) }
            }

            Toggle("Monthly \"import your statement\"", isOn: $monthlyImportEnabled)
                .onChange(of: monthlyImportEnabled) { _, on in reminderToggled(on) }
            if monthlyImportEnabled {
                Stepper(value: $monthlyImportDay, in: 1...28) {
                    LabeledContent("Day of month", value: "\(monthlyImportDay)")
                }
                .onChange(of: monthlyImportDay) { _, _ in store.rescheduleRemindersIfNeeded(force: true) }
            }

            if notificationsDenied {
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Label("Notifications are off for Income Tracker — open iOS Settings", systemImage: "bell.slash")
                        .font(.caption)
                        .foregroundStyle(Color.brandAmber)
                }
            }
        } header: {
            Text("Reminders")
        } footer: {
            Text("Bill reminders use the due day and minimum payment on each debt account. Reminders are local to this device.")
        }
    }

    private func reminderToggled(_ on: Bool) {
        Haptics.impact(.light)
        Task {
            if on {
                let granted = await NotificationScheduler.requestPermission()
                notificationsDenied = !granted
            } else {
                notificationsDenied = false
            }
            store.rescheduleRemindersIfNeeded(force: true)
        }
    }

    // MARK: - Data control section

    @ViewBuilder
    private var dataControlSection: some View {
        Section {
            if let notice {
                Label(notice, systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.brandMint)
            }

            Menu {
                ImportMenuItems(flow: $importFlow)
            } label: {
                Label("Import transactions", systemImage: "square.and.arrow.down")
            }

            Button {
                showJSONImporter = true
            } label: {
                Label("Restore a JSON backup", systemImage: "doc.badge.arrow.up")
            }

            Button {
                exportAsJSON()
            } label: {
                Label("Export JSON backup", systemImage: "square.and.arrow.up")
            }

            Button {
                exportAsCSV()
            } label: {
                Label("Export CSV", systemImage: "tablecells")
            }
        } header: {
            Text("Data")
        } footer: {
            Text("Backups are the same JSON the web app exports, so either can restore the other.")
        }

        let recentBatches = Array(store.state.importBatches.prefix(5))
        if !recentBatches.isEmpty {
            Section("Recent imports") {
                ForEach(recentBatches) { batch in
                    ImportBatchRow(batch: batch) {
                        store.undoImportBatch(id: batch.id)
                        Haptics.notification(.warning)
                        showNotice("Removed \(batch.importedRows) imported row\(batch.importedRows == 1 ? "" : "s")")
                    }
                }
            }
        }
    }

    // MARK: - Privacy section

    @ViewBuilder
    private var privacySection: some View {
        Section {
            Toggle("Privacy mode", isOn: Binding(
                get: { store.state.privacyMode },
                set: { value in
                    store.setPrivacyMode(value)
                    Haptics.impact(.light)
                }
            ))

            Toggle("Require Face ID to open", isOn: $requireFaceID)
                .onChange(of: requireFaceID) { _, _ in Haptics.impact(.light) }
        } header: {
            Text("Privacy")
        } footer: {
            Text("Privacy mode hides amounts on every screen, in widgets and when Siri reads figures out. Face ID (or your passcode) is asked for each time the app comes to the front.")
        }
    }

    // MARK: - Appearance section

    @ViewBuilder
    private var appearanceSection: some View {
        Section("Appearance") {
            Picker("Colour scheme", selection: $colorSchemePref) {
                ForEach(ColorSchemePreference.allCases) { pref in
                    Text(pref.label).tag(pref)
                }
            }
            .pickerStyle(.segmented)

            Toggle("Animations", isOn: $animationsEnabled)
        }
    }

    // MARK: - Rules section

    @ViewBuilder
    private var rulesSection: some View {
        let rules = store.state.categoryRules.sorted { $0.updatedAt > $1.updatedAt }

        Section {
            HStack {
                TextField("Payee pattern to skip (e.g. transfer to savings)", text: $newRulePattern)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onSubmit(addTransferRule)

                Button("Add", action: addTransferRule)
                    .disabled(newRulePattern.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if rules.isEmpty {
                Text("No learned rules yet. Correct a category on an imported entry, or import a statement, and the app remembers the payee.")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
            } else {
                ForEach(rules) { rule in
                    HStack(spacing: Spacing.md) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(rule.pattern)
                                .font(.subheadline)
                                .foregroundStyle(Color.ink)
                            Text(rule.kind == .transfer ? "Skipped as a transfer" : "→ \(rule.category)" + (rule.kind == .debtPayment ? " (debt payment)" : ""))
                                .font(.caption)
                                .foregroundStyle(Color.muted)
                        }
                        Spacer()
                        TonePill(label: rule.kind == .transfer ? "Transfer" : "Rule", color: rule.kind == .transfer ? .brandBlue : .brandMint)
                    }
                    .accessibilityElement(children: .combine)
                }
                .onDelete { offsets in
                    let ids = offsets.map { rules[$0].id }
                    ids.forEach { store.removeCategoryRule(id: $0) }
                    Haptics.destructiveAction()
                }
            }
        } header: {
            Text("Learned rules")
        } footer: {
            Text("Rules sort future imports automatically. Transfer rules also remove matching entries so money moved between your own accounts never counts as spending. Swipe to delete.")
        }
    }

    // MARK: - Feedback section

    @ViewBuilder
    private var feedbackSection: some View {
        Section("Feedback") {
            Button {
                showFeedback = true
            } label: {
                HStack {
                    Label("Send feedback", systemImage: "envelope")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }
            }
            .foregroundStyle(Color.ink)
        }
    }

    // MARK: - Danger zone section

    @ViewBuilder
    private var dangerZoneSection: some View {
        Section("Danger zone") {
            Button(role: .destructive) {
                showClearMonthConfirm = true
            } label: {
                Label(
                    "Clear \(formatMonth(store.state.selectedMonth))",
                    systemImage: "trash"
                )
            }
        }
    }

    // MARK: - About section

    @ViewBuilder
    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: appVersion)
            Link(destination: URL(string: "https://ledgerlite.co.uk/privacy.html")!) {
                Label("Privacy policy", systemImage: "hand.raised")
            }
            Link(destination: URL(string: "https://ledgerlite.co.uk/guides/")!) {
                Label("Guides and bank CSV help", systemImage: "book")
            }
        } header: {
            Text("About")
        }
    }

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(version) (\(build))"
    }

    // MARK: - Actions

    private func showNotice(_ text: String) {
        withAnimation(Motion.snappy) { notice = text }
        Task {
            try? await Task.sleep(for: .seconds(4))
            withAnimation(Motion.snappy) { if notice == text { notice = nil } }
        }
    }

    private func initialsFor(_ email: String?) -> String {
        guard let email else { return "?" }
        let parts = email.components(separatedBy: "@").first?
            .components(separatedBy: ".")
            .compactMap { $0.first.map(String.init) }
        return parts?.prefix(2).joined().uppercased() ?? "?"
    }

    private func exportAsJSON() {
        guard let data = store.exportJSON() else { return }
        do {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("ledgerlite-backup-\(getMonthKey()).json")
            try data.write(to: url)
            exportJSONItem = ShareItem(url: url)
            Haptics.impact(.light)
        } catch {
            jsonImportError = "Could not write the export file."
        }
    }

    private func exportAsCSV() {
        let csv = store.exportCSV()
        guard let data = csv.data(using: .utf8) else { return }
        do {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("ledgerlite-export-\(getMonthKey()).csv")
            try data.write(to: url)
            exportCSVItem = ShareItem(url: url)
            Haptics.impact(.light)
        } catch {
            jsonImportError = "Could not write the export file."
        }
    }

    private func handleJSONImport(result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else {
                jsonImportError = "Could not read the selected file."
                return
            }
            do {
                try store.importJSON(data)
                Haptics.confirmSave()
                showNotice("Backup restored")
            } catch {
                jsonImportError = error.localizedDescription
            }
        case .failure(let error):
            jsonImportError = error.localizedDescription
        }
    }

    private func addTransferRule() {
        let pattern = newRulePattern.trimmingCharacters(in: .whitespaces)
        guard !pattern.isEmpty else { return }
        let removed = store.addTransferRule(pattern: pattern)
        newRulePattern = ""
        Haptics.impact(.light)
        showNotice(removed > 0 ? "Rule saved · \(removed) matching entr\(removed == 1 ? "y" : "ies") removed" : "Rule saved")
    }

    private func clearSelectedMonth() {
        store.update { s in
            s.months[s.selectedMonth] = .empty
        }
    }
}

// MARK: - ColorSchemePreference

enum ColorSchemePreference: String, CaseIterable, Identifiable {
    case system = "system"
    case light  = "light"
    case dark   = "dark"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light:  return "Light"
        case .dark:   return "Dark"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}

// MARK: - ShareItem (Identifiable wrapper for URLs)

private struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

// MARK: - ImportBatchRow

private struct ImportBatchRow: View {
    var batch: ImportBatch
    var onUndo: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(batch.fileName)
                    .font(.subheadline)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                Text("\(batch.importedRows) imported · \(batch.skippedRows) skipped")
                    .font(.caption)
                    .foregroundStyle(Color.muted)
            }
            Spacer()
            Text(relativeDate(batch.importedAt))
                .font(.caption2)
                .foregroundStyle(Color.faint)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                onUndo()
            } label: {
                Label("Undo import", systemImage: "arrow.uturn.backward")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint("Swipe left to undo this import")
    }

    private func relativeDate(_ iso: String) -> String {
        guard let date = parseIsoTimestamp(iso) else { return iso }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: .now)
    }
}

// MARK: - ShareSheet (UIActivityViewController wrapper)

private struct ShareSheet: UIViewControllerRepresentable {
    var items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
