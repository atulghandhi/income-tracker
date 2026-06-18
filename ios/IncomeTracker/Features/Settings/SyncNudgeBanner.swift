// SyncNudgeBanner.swift
// Income Tracker — floating banner that nudges signed-out users to back up.
// Swift 6 / iOS 17+

import SwiftUI

// MARK: - SyncNudgeBanner

struct SyncNudgeBanner: View {
    var onSignIn: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "icloud").foregroundStyle(Color.brandBlue)
            VStack(alignment: .leading, spacing: 2) {
                Text("Back up your data").font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink)
                Text("Sign in to sync across devices").font(.caption).foregroundStyle(Color.muted)
            }
            Spacer()
            Button("Sign in") { onSignIn(); Haptics.impact(.light) }
                .buttonStyle(.borderedProminent)
                .tint(.brandBlue)
                .controlSize(.small)
            Button { onDismiss() } label: { Image(systemName: "xmark").foregroundStyle(Color.muted) }
        }
        .padding(16)
        .background(Color.surfaceHigh)
        .clipShape(.rect(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.lineStrong))
        .shadow(color: .black.opacity(0.18), radius: 20, y: 8)
        .padding(.horizontal)
    }
}
