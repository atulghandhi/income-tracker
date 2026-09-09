// ImportFlow.swift
// One import pipeline for every inlet — a CSV/OFX/QIF file, pasted text, or a
// screenshot — ending in the same review sheet and the same store commit. Screens
// hold an `ImportFlowState`, drop `ImportMenuItems` into a menu, and attach
// `.importFlow(...)` once; the modifier owns the pickers, the sheet and the errors.

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UIKit

// MARK: - State

struct ImportFlowState {
    var showFilePicker = false
    var showPhotoPicker = false
    var showReview = false
    var reviewRows: [CsvImportRow] = []
    var reviewFileName = ""
    var reviewTotalRows = 0
    var errorMessage: String? = nil
    var isWorking = false
}

// MARK: - Staging helpers

enum ImportFlow {

    /// Parses any supported text (CSV, OFX, QIF or loose lines) and stages it for review.
    @MainActor
    static func stage(text: String, fileName: String, store: LedgerStore, into flow: inout ImportFlowState) {
        let parsed = parseBankText(text: text, fileName: fileName, state: store.state)
        guard !parsed.rows.isEmpty else {
            flow.errorMessage = parsed.errors.first ?? "No transactions were found in \(fileName)."
            return
        }
        stage(rows: parsed.rows, fileName: fileName, totalRows: parsed.totalRows, into: &flow)
    }

    @MainActor
    static func stage(rows: [CsvImportRow], fileName: String, totalRows: Int, into flow: inout ImportFlowState) {
        flow.reviewRows = rows
        flow.reviewFileName = fileName
        flow.reviewTotalRows = totalRows
        flow.showReview = true
    }

    /// Reads the clipboard and stages whatever transaction lines it holds.
    @MainActor
    static func stagePasteboard(store: LedgerStore, into flow: inout ImportFlowState) {
        let text = UIPasteboard.general.string ?? ""
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            flow.errorMessage = "Nothing to paste. Copy a few lines from your banking app or a statement first — one transaction per line."
            return
        }
        stage(text: text, fileName: "Pasted transactions", store: store, into: &flow)
    }

    /// Everything the file picker should let through: the well-known CSV/text types
    /// plus the OFX/QIF extensions banks hand out, which have no system type.
    static let fileTypes: [UTType] = {
        var types: [UTType] = [.commaSeparatedText, .tabSeparatedText, .plainText, .text, .data]
        for ext in ["csv", "txt", "ofx", "qfx", "qif"] {
            if let type = UTType(filenameExtension: ext), !types.contains(type) {
                types.append(type)
            }
        }
        return types
    }()
}

// MARK: - Menu items

/// Drop into any `Menu` to offer the three import inlets.
struct ImportMenuItems: View {
    @Binding var flow: ImportFlowState
    @Environment(LedgerStore.self) private var store

    var body: some View {
        Button {
            flow.showFilePicker = true
        } label: {
            Label("Import CSV, OFX or QIF", systemImage: "square.and.arrow.down")
        }
        Button {
            ImportFlow.stagePasteboard(store: store, into: &flow)
        } label: {
            Label("Paste transactions", systemImage: "doc.on.clipboard")
        }
        Button {
            flow.showPhotoPicker = true
        } label: {
            Label("Scan a screenshot", systemImage: "text.viewfinder")
        }
    }
}

// MARK: - Modifier

extension View {
    /// Attaches the pickers, review sheet, progress overlay and error alert for an
    /// import flow. `onCommit` fires after the reviewed rows are committed.
    func importFlow(_ flow: Binding<ImportFlowState>, onCommit: @escaping (ImportCommitResult) -> Void) -> some View {
        modifier(ImportFlowModifier(flow: flow, onCommit: onCommit))
    }
}

private struct ImportFlowModifier: ViewModifier {
    @Binding var flow: ImportFlowState
    var onCommit: (ImportCommitResult) -> Void

    @Environment(LedgerStore.self) private var store
    @State private var photoItem: PhotosPickerItem? = nil

    func body(content: Content) -> some View {
        content
            .fileImporter(
                isPresented: $flow.showFilePicker,
                allowedContentTypes: ImportFlow.fileTypes
            ) { result in
                handleFile(result)
            }
            .photosPicker(isPresented: $flow.showPhotoPicker, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                photoItem = nil
                Task { await scan(item) }
            }
            .sheet(isPresented: $flow.showReview) {
                ImportReviewSheet(
                    rows: flow.reviewRows,
                    fileName: flow.reviewFileName,
                    debtAccounts: store.state.accounts.filter { $0.accountClass == .debt },
                    onConfirm: { confirmedRows in
                        let result = store.commitCSVImport(
                            rows: confirmedRows,
                            fileName: flow.reviewFileName,
                            totalRows: flow.reviewTotalRows
                        )
                        flow.showReview = false
                        if result.didChangeLedger {
                            Haptics.confirmSave()
                        }
                        onCommit(result)
                    },
                    onDismiss: { flow.showReview = false }
                )
                .environment(store)
            }
            .alert("Import", isPresented: Binding(
                get: { flow.errorMessage != nil },
                set: { if !$0 { flow.errorMessage = nil } }
            )) {
                Button("OK") { flow.errorMessage = nil }
            } message: {
                Text(flow.errorMessage ?? "")
            }
            .overlay {
                if flow.isWorking {
                    ZStack {
                        Color.ink.opacity(0.15).ignoresSafeArea()
                        ProgressView("Reading…")
                            .padding(Spacing.xl)
                            .background(Color.surface, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
                    }
                    .transition(.opacity)
                }
            }
    }

    @MainActor
    private func handleFile(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else {
                flow.errorMessage = "Could not open \(url.lastPathComponent)."
                return
            }
            guard let text = decodeImportedText(data) else {
                flow.errorMessage = "\(url.lastPathComponent) doesn't look like a text export. Ask your bank for CSV, OFX or QIF."
                return
            }
            let fileName = url.lastPathComponent
            // Let the document picker finish dismissing before presenting the review
            // sheet, otherwise SwiftUI can drop the presentation on the floor.
            Task {
                try? await Task.sleep(for: .milliseconds(400))
                ImportFlow.stage(text: text, fileName: fileName, store: store, into: &flow)
            }
        case .failure(let error):
            flow.errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func scan(_ item: PhotosPickerItem) async {
        flow.isWorking = true
        defer { flow.isWorking = false }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                flow.errorMessage = "Couldn't read that image."
                return
            }
            let rows = try await ScreenshotImporter().importRows(from: image, state: store.state)
            ImportFlow.stage(rows: rows, fileName: "Screenshot", totalRows: rows.count, into: &flow)
        } catch let error as ScreenshotImportError {
            switch error {
            case .unreadableImage:
                flow.errorMessage = "Couldn't read that image."
            case .noTextFound:
                flow.errorMessage = "No text was found in the screenshot. Try a clearer image of the transaction list."
            case .noTransactionsFound:
                flow.errorMessage = "No transaction lines were recognised. Make sure each row shows a description and an amount."
            }
        } catch {
            flow.errorMessage = error.localizedDescription
        }
    }
}
