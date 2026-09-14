// OnboardingSheet.swift
// First-run setup: currency, an optional regular income, and the one habit that
// makes the app useful (log spends as they happen). Deliberately short — the
// dashboard checklist carries the rest.

import SwiftUI

struct OnboardingSheet: View {
    var onFinish: () -> Void
    @Environment(LedgerStore.self) private var store

    @State private var currency: CurrencyCode = .gbp
    @State private var incomeName = "Salary"
    @State private var incomeAmount = ""
    @State private var page = 0
    @FocusState private var amountFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                TabView(selection: $page) {
                    welcomePage.tag(0)
                    setupPage.tag(1)
                    habitPage.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .indexViewStyle(.page(backgroundDisplayMode: .always))

                Button(action: advance) {
                    Text(page == 2 ? "Start logging" : "Continue")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.brandBlue)
                .controlSize(.large)
                .padding(Spacing.lg)
            }
            .background(Color.bg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip") {
                        commitSetup()
                        onFinish()
                    }
                    .foregroundStyle(Color.muted)
                }
            }
            .onAppear { currency = store.state.currency }
        }
        .presentationDetents([.large])
    }

    private var welcomePage: some View {
        VStack(spacing: Spacing.lg) {
            Spacer()
            Image("BrandLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)
                .accessibilityHidden(true)
            Text("Know where your money goes")
                .font(.title.weight(.bold))
                .foregroundStyle(Color.ink)
                .multilineTextAlignment(.center)
            Text("Log spends in one line, import your bank statement in seconds, and watch the month add up. Everything stays on your phone unless you choose to sync.")
                .font(.body)
                .foregroundStyle(Color.muted)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .padding(Spacing.xl)
    }

    private var setupPage: some View {
        Form {
            Section {
                Picker("Currency", selection: $currency) {
                    ForEach(CURRENCY_OPTIONS, id: \.code) { option in
                        Text(option.label).tag(option.code)
                    }
                }
            } header: {
                Text("Your currency")
            }

            Section {
                TextField("Income name", text: $incomeName)
                    .textInputAutocapitalization(.words)
                HStack {
                    Text(FinanceEngine.currencySymbol(for: currency))
                        .foregroundStyle(Color.muted)
                    TextField("Monthly amount (optional)", text: $incomeAmount)
                        .keyboardType(.decimalPad)
                        .focused($amountFocused)
                }
            } header: {
                Text("Regular income")
            } footer: {
                Text("Added as a repeating entry so every new month starts with it. Skip it if your income varies — you can log it as it lands.")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.bg)
    }

    private var habitPage: some View {
        VStack(alignment: .leading, spacing: Spacing.lg) {
            Spacer()
            Text("The habit that makes it work")
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.ink)
            habitRow(icon: "keyboard", title: "Type it as you spend", detail: "\"coffee 3.20\" in the bar at the bottom of the Ledger. Return adds it and keeps the cursor ready for the next one.")
            habitRow(icon: "square.and.arrow.down", title: "Import once a month", detail: "Drop in your bank's CSV, OFX or QIF. Duplicates are caught and transfers between your own accounts are skipped.")
            habitRow(icon: "chart.line.uptrend.xyaxis", title: "Check the Dashboard", detail: "What's left this month, your net worth and where it is heading.")
            Spacer()
        }
        .padding(Spacing.xl)
    }

    @ViewBuilder
    private func habitRow(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: Spacing.md) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(Color.brandBlue)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(Color.ink)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func advance() {
        Haptics.impact(.light)
        if page < 2 {
            withAnimation(Motion.standard) { page += 1 }
        } else {
            commitSetup()
            onFinish()
        }
    }

    private func commitSetup() {
        if currency != store.state.currency {
            store.setCurrency(currency)
        }
        let name = incomeName.trimmingCharacters(in: .whitespaces)
        if let amount = parseAmountInput(incomeAmount), amount > 0, !name.isEmpty {
            store.snapToCurrentMonth()
            store.addIncome(IncomeEntry(
                id: createId(prefix: "income"),
                source: name,
                amount: (amount * 100).rounded() / 100,
                color: categoryColor(for: "Income"),
                recurring: true,
                date: isoDateString(Date())
            ))
        }
    }
}
