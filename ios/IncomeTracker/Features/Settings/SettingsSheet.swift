// SettingsSheet.swift
// Income Tracker — Settings sheet (all sections).
// Swift 6 / iOS 17+

import SwiftUI
import UniformTypeIdentifiers

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

    // Cloud vault
    @State private var isSyncing = false

    // Data control
    @State private var showExportJSONShare = false
    @State private var showExportCSVShare  = false
    @State private var exportJSONItem: ShareItem? = nil
    @State private var exportCSVItem:  ShareItem?  = nil
    @State private var showCSVImporter  = false
    @State private var showJSONImporter = false
    @State private var jsonImportError: String? = nil
    @State private var jsonImportSuccess = false

    // Transfer rules
    @State private var newRulePattern = ""

    // Privacy
    @AppStorage("requireFaceID") private var requireFaceID = false

    // Appearance
    @AppStorage("colorSchemePreference") private var colorSchemePref: ColorSchemePreference = .system
    @AppStorage("animationsEnabled")     private var animationsEnabled = true

    // Danger zone
    @State private var showClearMonthConfirm = false

    // Feedback sheet
    @State private var showFeedback = false

    // CSV import review
    @State private var csvImportRows: [CsvImportRow] = []
    @State private var csvFileName = ""
    @State private var showCSVReview = false

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                cloudVaultSection
                dataControlSection
                currencySection
                privacySection
                appearanceSection
                transferRulesSection
                feedbackSection
                dangerZoneSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
            // JSON share sheet
            .sheet(item: $exportJSONItem) { item in
                ShareSheet(items: [item.url as Any])
            }
            // CSV share sheet
            .sheet(item: $exportCSVItem) { item in
                ShareSheet(items: [item.url as Any])
            }
            // Feedback
            .sheet(isPresented: $showFeedback) {
                FeedbackSheet()
            }
            // CSV review
            .sheet(isPresented: $showCSVReview) {
                ImportReviewSheet(
                    rows: csvImportRows,
                    fileName: csvFileName,
                    onConfirm: { confirmedRows in
                        commitCSVImport(rows: confirmedRows, fileName: csvFileName)
                        showCSVReview = false
                    },
                    onDismiss: { showCSVReview = false }
                )
            }
            // CSV file importer
            .fileImporter(
                isPresented: $showCSVImporter,
                allowedContentTypes: [.commaSeparatedText]
            ) { result in
                handleCSVImport(result: result)
            }
            // JSON file importer
            .fileImporter(
                isPresented: $showJSONImporter,
                allowedContentTypes: [.json]
            ) { result in
                handleJSONImport(result: result)
            }
            // Alerts
            .alert("Clear \(formatMonth(store.state.selectedMonth))?",
                   isPresented: $showClearMonthConfirm) {
                Button("Clear", role: .destructive) {
                    Haptics.destructiveAction()
                    clearSelectedMonth()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All income and expense entries for this month will be permanently deleted.")
            }
            .alert("Import error", isPresented: Binding(
                get: { jsonImportError != nil },
                set: { if !$0 { jsonImportError = nil } }
            )) {
                Button("OK") { jsonImportError = nil }
            } message: {
                Text(jsonImportError ?? "")
            }
        }
    }

    // MARK: - Account section

    @ViewBuilder
    private var accountSection: some View {
        Section("Account") {
            if sync.isSignedIn, let user = sync.currentUser {
                HStack(spacing: 12) {
                    // Avatar initials circle
                    ZStack {
                        Circle()
                            .fill(Color.brandBlue)
                        Text(initialsFor(user.email))
                            .font(.headline)
                            .foregroundStyle(.white)
                    }
                    .frame(width: 44, height: 44)

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
                    Task {
                        await sync.signOut()
                        Haptics.impact(.light)
                    }
                } label: {
                    Text("Sign out")
                }
            } else {
                // Apple sign-in
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
                    appleSignIn.startSignIn()
                    Haptics.impact(.light)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "apple.logo")
                        Text("Sign in with Apple")
                            .fontWeight(.medium)
                    }
                }

                // Google sign-in (secondary, text-link style)
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

            HStack(spacing: 12) {
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
            Text("Your ledger syncs to a private Supabase row tied to your account. Row-level security: only you can read it.")
                .font(.caption)
                .foregroundStyle(Color.muted)

            if let lastSync = sync.lastSyncedAt {
                LabeledContent("Last synced") {
                    Text(lastSync, style: .relative)
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }
            } else {
                LabeledContent("Last synced") {
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

    // MARK: - Data control section

    @ViewBuilder
    private var dataControlSection: some View {
        Section("Data control") {
            // Export JSON
            Button {
                exportAsJSON()
            } label: {
                Label("Export JSON", systemImage: "square.and.arrow.up")
            }

            // Export CSV
            Button {
                exportAsCSV()
            } label: {
                Label("Export CSV", systemImage: "tablecells")
            }

            // Import CSV
            Button {
                showCSVImporter = true
            } label: {
                Label("Import CSV", systemImage: "square.and.arrow.down")
            }

            // Import JSON
            Button {
                showJSONImporter = true
            } label: {
                Label("Import JSON backup", systemImage: "doc.badge.arrow.up")
            }
        }

        // Recent import history (up to 5)
        let recentBatches = store.state.importBatches.suffix(5).reversed()
        if !recentBatches.isEmpty {
            Section("Recent imports") {
                ForEach(Array(recentBatches)) { batch in
                    ImportBatchRow(batch: batch) {
                        store.undoImportBatch(id: batch.id)
                        Haptics.notification(.warning)
                    }
                }
            }
        }
    }

    // MARK: - Currency section

    @ViewBuilder
    private var currencySection: some View {
        Section("Currency") {
            Picker("Currency", selection: Binding(
                get: { store.state.currency },
                set: { store.setCurrency($0) }
            )) {
                ForEach(CURRENCY_OPTIONS, id: \.code) { option in
                    Text(option.label).tag(option.code)
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
        }
    }

    // MARK: - Privacy section

    @ViewBuilder
    private var privacySection: some View {
        Section("Privacy") {
            Toggle("Privacy mode", isOn: Binding(
                get: { store.state.privacyMode },
                set: { value in
                    store.setPrivacyMode(value)
                    Haptics.impact(.light)
                }
            ))

            Toggle("Require Face ID", isOn: $requireFaceID)
                .onChange(of: requireFaceID) {
                    Haptics.impact(.light)
                }
        }
    }

    // MARK: - Appearance section

    @ViewBuilder
    private var appearanceSection: some View {
        Section("Appearance") {
            Picker("Color scheme", selection: $colorSchemePref) {
                ForEach(ColorSchemePreference.allCases) { pref in
                    Text(pref.label).tag(pref)
                }
            }
            .pickerStyle(.segmented)

            Toggle("Enable animations", isOn: $animationsEnabled)
        }
    }

    // MARK: - Transfer rules section

    @ViewBuilder
    private var transferRulesSection: some View {
        let transferRules = store.state.categoryRules.filter { $0.kind == .transfer }

        Section {
            ForEach(transferRules) { rule in
                VStack(alignment: .leading, spacing: 2) {
                    Text(rule.pattern)
                        .font(.subheadline)
                        .foregroundStyle(Color.ink)
                    Text("Auto-skip transfers matching this payee")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                }
            }
            .onDelete { offsets in
                let ids = offsets.map { transferRules[$0].id }
                ids.forEach { store.removeCategoryRule(id: $0) }
                Haptics.destructiveAction()
            }

            HStack {
                TextField("Payee pattern to skip…", text: $newRulePattern)
                    .autocorrectionDisabled()

                Button("Add") {
                    addTransferRule()
                }
                .disabled(newRulePattern.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } header: {
            Text("Transfer rules")
        } footer: {
            Text("Transactions whose payee matches these patterns are automatically excluded during CSV import.")
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

    // MARK: - Actions

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
                .appendingPathComponent("ledger-export.json")
            try data.write(to: url)
            exportJSONItem = ShareItem(url: url)
            Haptics.impact(.light)
        } catch {
            // Silently fail — share sheet won't open
        }
    }

    private func exportAsCSV() {
        let csv = store.exportCSV()
        guard let data = csv.data(using: .utf8) else { return }
        do {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("ledger-export.csv")
            try data.write(to: url)
            exportCSVItem = ShareItem(url: url)
            Haptics.impact(.light)
        } catch {
            // Silently fail
        }
    }

    private func handleCSVImport(result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            guard url.startAccessingSecurityScopedResource() else {
                jsonImportError = "Could not open the selected file."
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let text = try? String(contentsOf: url, encoding: .utf8) else {
                jsonImportError = "Could not read the selected file."
                return
            }
            let parsed = parseBankCsv(
                text: text,
                fileName: url.lastPathComponent,
                state: store.state
            )
            if !parsed.rows.isEmpty {
                csvFileName = url.lastPathComponent
                csvImportRows = parsed.rows
                showCSVReview = true
            } else {
                jsonImportError = parsed.errors.first ?? "No importable transactions were found."
            }
        case .failure(let error):
            jsonImportError = error.localizedDescription
        }
    }

    private func commitCSVImport(rows: [CsvImportRow], fileName: String) {
        store.commitCSVImport(rows: rows, fileName: fileName)
        Haptics.confirmSave()
    }

    private func handleJSONImport(result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            guard let data = try? Data(contentsOf: url) else {
                jsonImportError = "Could not read the selected file."
                return
            }
            do {
                try store.importJSON(data)
                Haptics.confirmSave()
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
        let now = ISO8601DateFormatter().string(from: .now)
        let rule = CategoryRule(
            id: createId(prefix: "rule"),
            pattern: pattern,
            category: "Transfers",
            kind: .transfer,
            createdAt: now,
            updatedAt: now
        )
        store.addCategoryRule(rule)
        newRulePattern = ""
        Haptics.impact(.light)
    }

    private func clearSelectedMonth() {
        store.update { s in
            s.months[s.selectedMonth] = .empty
        }
    }
}

// MARK: - ColorSchemePreference

enum ColorSchemePreference: String, CaseIterable, Identifiable, RawRepresentable {
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

// AppStorage handles RawRepresentable<String> natively — no extra conformance needed.

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
    }

    private func relativeDate(_ iso: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: iso) else { return iso }
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

