// FeedbackSheet.swift
// Income Tracker — in-app feedback form.
// Submits to /rest/v1/ledgerlite_feedback via SyncCoordinator.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - FeedbackSheet

struct FeedbackSheet: View {
    @Environment(SyncCoordinator.self) var sync
    @Environment(\.dismiss) var dismiss

    enum FeedbackType: String, CaseIterable {
        case bug     = "bug"
        case feature = "feature"
        case general = "general"

        var label: String {
            switch self {
            case .bug:     return "Bug report"
            case .feature: return "Feature request"
            case .general: return "General"
            }
        }
    }

    @State private var feedbackType: FeedbackType = .general
    @State private var subject     = ""
    @State private var description = ""
    @State private var email       = ""
    @State private var submitStatus: SubmitStatus = .idle

    enum SubmitStatus { case idle, sending, sent, error }

    var body: some View {
        NavigationStack {
            Form {
                if submitStatus == .sent {
                    // Success view
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 56))
                            .foregroundStyle(Color.brandMint)
                            .symbolEffect(.bounce)
                        Text("Thanks for your feedback!")
                            .font(.title2.bold())
                        Text("We'll review it shortly.")
                            .foregroundStyle(Color.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                    .listRowBackground(Color.clear)
                } else {
                    Section {
                        Picker("Type", selection: $feedbackType) {
                            ForEach(FeedbackType.allCases, id: \.self) { t in
                                Text(t.label).tag(t)
                            }
                        }
                        .pickerStyle(.segmented)
                        .listRowInsets(.init(top: 8, leading: 0, bottom: 8, trailing: 0))
                        .listRowBackground(Color.clear)
                    }

                    Section("Subject") {
                        TextField(subjectPlaceholder, text: $subject)
                    }

                    Section("Description") {
                        TextField("Add more detail…", text: $description, axis: .vertical)
                            .lineLimit(4...10)
                    }

                    Section {
                        TextField("your@email.com (optional)", text: $email)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    } header: {
                        Text("Email for follow-up")
                    } footer: {
                        Text("We only use this to respond to your feedback.")
                    }

                    if submitStatus == .error {
                        Section {
                            Label("Couldn't send feedback. Please try again.", systemImage: "exclamationmark.triangle")
                                .foregroundStyle(Color.brandRed)
                        }
                    }
                }
            }
            .navigationTitle("Send feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if submitStatus != .sent {
                        Button("Send") { Task { await submit() } }
                            .disabled(
                                subject.trimmingCharacters(in: .whitespaces).isEmpty ||
                                description.trimmingCharacters(in: .whitespaces).isEmpty ||
                                submitStatus == .sending
                            )
                            .fontWeight(.semibold)
                    }
                }
            }
            .onChange(of: submitStatus) { _, new in
                if new == .sent {
                    Haptics.notification(.success)
                    Task {
                        try? await Task.sleep(for: .seconds(2))
                        dismiss()
                    }
                }
            }
        }
    }

    var subjectPlaceholder: String {
        switch feedbackType {
        case .bug:     return "What went wrong?"
        case .feature: return "What would you like to see?"
        case .general: return "Your message"
        }
    }

    func submit() async {
        submitStatus = .sending
        do {
            try await sync.submitFeedback(
                type: feedbackType.rawValue,
                subject: subject.trimmingCharacters(in: .whitespaces),
                description: description.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces).isEmpty
                    ? nil
                    : email.trimmingCharacters(in: .whitespaces)
            )
            submitStatus = .sent
        } catch {
            submitStatus = .error
        }
    }
}

// MARK: - In SyncCoordinator+Feedback.swift

// Extension on SyncCoordinator that POSTs user feedback to Supabase.
// File: Sync/SyncCoordinator+Feedback.swift

extension SyncCoordinator {

    /// POSTs a feedback row to `/rest/v1/ledgerlite_feedback`.
    /// Does **not** require the user to be signed in — anonymous feedback is
    /// accepted (the anon key authorises the insert via a permissive policy).
    func submitFeedback(
        type: String,
        subject: String,
        description: String,
        email: String?
    ) async throws {
        struct FeedbackPayload: Encodable {
            let type: String
            let subject: String
            let description: String
            let email: String?
            let app_version: String
            let created_at: String
        }

        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        let payload = FeedbackPayload(
            type: type,
            subject: subject,
            description: description,
            email: email,
            app_version: version,
            created_at: ISO8601DateFormatter().string(from: .now)
        )

        let body = try JSONEncoder().encode(payload)

        // The feedback table accepts the anon key (no user token required).
        // We use the internal `restRequest` helper rather than the private
        // `supabaseRequest` so this extension can live in a separate file.
        _ = try await restRequest(
            path: "/rest/v1/ledgerlite_feedback",
            method: "POST",
            token: nil,
            body: body,
            extraHeaders: ["Prefer": "return=minimal"]
        )
    }
}
