// GoalsScreen.swift
// Income Tracker — Goals feature screen.
// Swift 6 / iOS 17+

import SwiftUI
import Charts

// MARK: - GoalStatus display helpers

extension GoalStatus {
    var displayName: String {
        switch self {
        case .complete:   return "Complete"
        case .onTrack:    return "On track"
        case .tight:      return "Tight"
        case .atRisk:     return "At risk"
        case .noDeadline: return "No deadline"
        }
    }

    var pillColor: Color {
        switch self {
        case .complete:   return .brandMint
        case .onTrack:    return .brandBlue
        case .tight:      return .brandAmber
        case .atRisk:     return .brandRed
        case .noDeadline: return .muted
        }
    }
}

extension GoalFundingMode {
    var displayName: String {
        switch self {
        case .fixed: return "Fixed"
        case .fill:  return "Fill"
        case .auto:  return "Auto"
        }
    }

    var explanation: String {
        switch self {
        case .fixed: return "Puts a set amount in every month."
        case .fill:  return "Takes whatever surplus is left after the goals above it."
        case .auto:  return "Spreads the surplus so the deadline is met."
        }
    }
}

let GOAL_HORIZON_OPTIONS = [12, 24, 36, 60, 120]

// MARK: - GoalsScreen

struct GoalsScreen: View {
    @Environment(LedgerStore.self) var store
    @Environment(SyncCoordinator.self) var sync
    @State private var showAddGoal = false
    @State private var editingGoal: SavingsGoal? = nil
    @State private var sequence: GoalSequenceResult? = nil
    @State private var isLoadingSequence = false
    @State private var showSettings = false

    /// Recompute the plan once for any change in its inputs.
    private struct PlanKey: Hashable {
        let goals: [SavingsGoal]
        let surplus: Double
        let horizon: Int
    }

    private var planKey: PlanKey {
        PlanKey(goals: store.state.goals, surplus: effectiveSurplus, horizon: store.state.goalsHorizonMonths)
    }

    private var effectiveSurplus: Double {
        if let override = store.state.goalPlannerSurplus {
            return override
        }
        return FinanceEngine.projection(for: store.currentMonthBudget).recurringMonthlySurplus
    }

    private var orderedGoals: [SavingsGoal] {
        store.state.goals.sorted { $0.priority < $1.priority }
    }

    private var isPrivate: Bool { store.state.privacyMode }

    var body: some View {
        List {
            Section {
                PlannerSurplusControl()
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)

                HorizonPicker(selected: Binding(
                    get: { store.state.goalsHorizonMonths },
                    set: { store.setGoalsHorizonMonths($0) }
                ))
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            if store.state.goals.isEmpty {
                Section {
                    EmptyStateView(
                        title: "No goals yet",
                        subtitle: "Add a savings goal and the planner shows when you will get there on your current surplus.",
                        systemImage: "target",
                        actionLabel: "Add goal"
                    ) {
                        showAddGoal = true
                        Haptics.impact(.light)
                    }
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            } else {
                Section {
                    if effectiveSurplus <= 0 {
                        Label("Set a monthly surplus above to generate the forecast — right now nothing is left over to allocate.", systemImage: "info.circle")
                            .font(.caption)
                            .foregroundStyle(Color.brandAmber)
                            .listRowBackground(Color.amberSoft)
                    }

                    ForEach(orderedGoals) { goal in
                        let outcome = sequence?.goals.first(where: { $0.goalId == goal.id })
                        GoalCard(
                            goal: goal,
                            outcome: outcome,
                            isLoading: isLoadingSequence && sequence == nil,
                            onEdit: { editingGoal = goal }
                        )
                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            editingGoal = goal
                            Haptics.impact(.light)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                withAnimation(Motion.snappy) { store.removeGoal(id: goal.id) }
                                Haptics.notification(.error)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                            Button {
                                duplicate(goal)
                                Haptics.impact(.medium)
                            } label: {
                                Label("Duplicate", systemImage: "plus.square.on.square")
                            }
                            .tint(.brandBlue)
                        }
                        .contextMenu {
                            Button { editingGoal = goal } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                            Button {
                                store.moveGoal(id: goal.id, by: -1)
                                Haptics.selection()
                            } label: {
                                Label("Move up", systemImage: "arrow.up")
                            }
                            .disabled(orderedGoals.first?.id == goal.id)
                            Button {
                                store.moveGoal(id: goal.id, by: 1)
                                Haptics.selection()
                            } label: {
                                Label("Move down", systemImage: "arrow.down")
                            }
                            .disabled(orderedGoals.last?.id == goal.id)
                            Button { duplicate(goal) } label: {
                                Label("Duplicate", systemImage: "plus.square.on.square")
                            }
                            Divider()
                            Button(role: .destructive) {
                                store.removeGoal(id: goal.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityHint("Double tap to edit. Drag to change priority.")
                    }
                    .onMove { source, destination in
                        var ids = orderedGoals.map(\.id)
                        ids.move(fromOffsets: source, toOffset: destination)
                        store.setGoalOrder(ids: ids)
                        Haptics.selection()
                    }
                } header: {
                    SectionHeader(title: "Goals in priority order", color: .brandBlue)
                } footer: {
                    if let seq = sequence, !isPrivate {
                        Text("Average unallocated surplus over \(seq.horizonMonths) months: \(formatMoney(seq.avgUnallocatedSurplus, currency: store.state.currency)) per month.")
                    }
                }

                Section {
                    if let seq = sequence {
                        GoalsTimelineChart(sequence: seq, goals: orderedGoals)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    } else if isLoadingSequence {
                        ProgressView("Calculating…")
                            .frame(maxWidth: .infinity, minHeight: 200)
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Goals")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape")
                        .foregroundStyle(Color.muted)
                }
                .accessibilityLabel("Settings")
            }
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: Spacing.sm) {
                    if store.state.goals.count > 1 {
                        EditButton()
                    }
                    Button {
                        showAddGoal = true
                        Haptics.impact(.light)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add goal")
                }
            }
        }
        .sheet(isPresented: $showAddGoal) {
            GoalEditorSheet(goal: nil)
                .environment(store)
        }
        .sheet(item: $editingGoal) { goal in
            GoalEditorSheet(goal: goal)
                .environment(store)
        }
        .sheet(isPresented: $showSettings) {
            SettingsSheet()
                .environment(store)
                .environment(sync)
        }
        .task(id: planKey) {
            await recomputeSequence()
        }
    }

    private func duplicate(_ goal: SavingsGoal) {
        var copy = goal
        copy.id = createId(prefix: "goal")
        copy.name = "\(goal.name) (copy)"
        copy.priority = (store.state.goals.map(\.priority).max() ?? 0) + 1
        copy.createdAt = isoTimestampNow()
        store.addGoal(copy)
    }

    private func recomputeSequence() async {
        guard !store.state.goals.isEmpty else {
            sequence = nil
            return
        }
        isLoadingSequence = true
        let goals = store.state.goals
        let surplus = effectiveSurplus
        let horizon = store.state.goalsHorizonMonths
        let result = await Task.detached(priority: .userInitiated) {
            FinanceEngine.runGoalSequence(
                goals: goals,
                monthlySurplus: surplus,
                horizonMonths: horizon
            )
        }.value
        guard !Task.isCancelled else { return }
        withAnimation(Motion.standard) {
            sequence = result
            isLoadingSequence = false
        }
    }
}

// MARK: - HorizonPicker

struct HorizonPicker: View {
    @Binding var selected: Int

    var body: some View {
        HStack(spacing: Spacing.sm) {
            Text("Horizon")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.muted)
            Picker("Horizon", selection: $selected) {
                ForEach(GOAL_HORIZON_OPTIONS, id: \.self) { months in
                    Text(months >= 12 && months % 12 == 0 ? "\(months / 12)y" : "\(months)m").tag(months)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: selected) { _, _ in Haptics.selection() }
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - PlannerSurplusControl

private struct PlannerSurplusControl: View {
    @Environment(LedgerStore.self) var store
    @State private var editText: String = ""
    @State private var isEditing = false
    @FocusState private var focused: Bool

    private var derivedSurplus: Double {
        FinanceEngine.projection(for: store.currentMonthBudget).recurringMonthlySurplus
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Monthly planner surplus")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text("What the goals can share each month")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                    if store.state.goalPlannerSurplus != nil {
                        Button("Use live figure") {
                            store.setGoalPlannerSurplus(nil)
                            isEditing = false
                            Haptics.selection()
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.brandBlue)
                    }
                }

                HStack(spacing: Spacing.sm) {
                    Text(FinanceEngine.currencySymbol(for: store.state.currency))
                        .font(.moneyMedium)
                        .foregroundStyle(Color.muted)

                    if isEditing {
                        TextField(formatAmountInput(derivedSurplus), text: $editText)
                            .font(.moneyMedium)
                            .foregroundStyle(Color.ink)
                            .keyboardType(.decimalPad)
                            .focused($focused)
                            .onSubmit { commitEdit() }
                        Button("Done") { commitEdit() }
                            .font(.caption.weight(.semibold))
                            .buttonStyle(.borderedProminent)
                            .tint(.brandBlue)
                            .controlSize(.small)
                    } else {
                        let display = store.state.goalPlannerSurplus ?? derivedSurplus
                        Button(action: beginEdit) {
                            HStack(spacing: Spacing.sm) {
                                Text(store.state.privacyMode ? "•••" : formatAmountInput(display))
                                    .font(.moneyMedium)
                                    .foregroundStyle(store.state.goalPlannerSurplus != nil ? Color.brandBlue : Color.ink)
                                    .contentTransition(.numericText(value: display))
                                    .motionAnimation(Motion.standard, value: display)
                                Image(systemName: "pencil")
                                    .font(.caption)
                                    .foregroundStyle(Color.faint)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Planner surplus \(formatMoney(display, currency: store.state.currency))")
                        .accessibilityHint("Double tap to override")
                    }
                }

                Text(store.state.goalPlannerSurplus == nil
                     ? "Live: recurring income minus recurring outgoings this month"
                     : "Overridden — tap “Use live figure” to follow the ledger again")
                    .font(.caption2)
                    .foregroundStyle(Color.faint)
            }
        }
    }

    private func beginEdit() {
        let current = store.state.goalPlannerSurplus ?? derivedSurplus
        editText = formatAmountInput(current)
        isEditing = true
        focused = true
        Haptics.impact(.light)
    }

    private func commitEdit() {
        if let value = parseAmountInput(editText) {
            store.setGoalPlannerSurplus(value)
            Haptics.confirmSave()
        }
        isEditing = false
        focused = false
    }
}

// MARK: - GoalCard

struct GoalCard: View {
    var goal: SavingsGoal
    var outcome: GoalOutcome?
    var isLoading: Bool = false
    var onEdit: () -> Void
    @Environment(LedgerStore.self) var store

    private var progress: Double {
        guard goal.target > 0 else { return 1.0 }
        return min(goal.saved / goal.target, 1.0)
    }

    private var isPrivate: Bool { store.state.privacyMode }

    private enum Verdict {
        case complete, onTrack, tight, atRisk, noDeadline, unfunded, pending

        var label: String {
            switch self {
            case .complete: return "Complete"
            case .onTrack: return "On track"
            case .tight: return "Tight"
            case .atRisk: return "At risk"
            case .noDeadline: return "No deadline"
            case .unfunded: return "Unfunded"
            case .pending: return "Calculating"
            }
        }

        var color: Color {
            switch self {
            case .complete, .onTrack: return .brandMint
            case .tight: return .brandAmber
            case .atRisk, .unfunded: return .brandRed
            case .noDeadline: return .brandBlue
            case .pending: return .muted
            }
        }
    }

    private var verdict: Verdict {
        guard let outcome else { return isLoading ? .pending : .noDeadline }
        switch outcome.status {
        case .complete: return .complete
        case .onTrack: return .onTrack
        case .tight: return .tight
        case .atRisk: return .atRisk
        case .noDeadline:
            // Web distinguishes a goal nothing is flowing into from one that is
            // simply open-ended.
            return outcome.completionMonth == nil && outcome.shortfall > 0 ? .unfunded : .noDeadline
        }
    }

    /// The web's at-risk hint: what it would take to make the deadline.
    private var hint: String? {
        guard let outcome, !isPrivate else { return nil }
        switch outcome.status {
        case .atRisk, .tight:
            var parts: [String] = []
            if outcome.extraMonthlyNeeded > 0.5 {
                parts.append("add \(formatMoney(outcome.extraMonthlyNeeded, currency: store.state.currency))/month")
            }
            if outcome.extraMonthsNeeded >= 1 {
                let months = Int(outcome.extraMonthsNeeded.rounded(.up))
                parts.append("or extend by \(months) month\(months == 1 ? "" : "s")")
            }
            return parts.isEmpty ? nil : parts.joined(separator: " ").prefix(1).uppercased() + parts.joined(separator: " ").dropFirst()
        case .noDeadline:
            if outcome.completionMonth == nil && outcome.shortfall > 0 {
                return "Nothing is flowing into this goal yet — pick a funding mode or raise the surplus."
            }
            return nil
        default:
            return nil
        }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                HStack(spacing: Spacing.lg) {
                    ZStack {
                        Circle()
                            .stroke(Color(hex: goal.color).opacity(0.2), lineWidth: 5)
                        Circle()
                            .trim(from: 0, to: progress)
                            .stroke(Color(hex: goal.color), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .motionAnimation(Motion.bouncy, value: goal.saved)

                        if verdict == .complete {
                            Image(systemName: "checkmark")
                                .font(.footnote.weight(.bold))
                                .foregroundStyle(Color(hex: goal.color))
                        } else {
                            Text(formatPercent(progress * 100, digits: 0))
                                .font(.caption2.weight(.bold))
                                .monospacedDigit()
                                .foregroundStyle(Color(hex: goal.color))
                        }
                    }
                    .frame(width: 54, height: 54)
                    .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Text("\(goal.priority).")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color.faint)
                                .monospacedDigit()
                            Text(goal.name)
                                .font(.headline)
                                .foregroundStyle(Color.ink)
                                .lineLimit(1)
                            Spacer()
                            TonePill(label: verdict.label, color: verdict.color)
                                .motionAnimation(Motion.snappy, value: verdict.label)
                        }

                        HStack(spacing: Spacing.sm) {
                            MoneyText(amount: goal.saved, currency: store.state.currency, font: .moneySmall, color: .ink, isPrivate: isPrivate)
                            Text("of")
                                .font(.caption)
                                .foregroundStyle(Color.muted)
                            MoneyText(amount: goal.target, currency: store.state.currency, font: .moneySmall, color: .muted, isPrivate: isPrivate)
                        }

                        HStack(spacing: Spacing.sm) {
                            Text(goal.fundingMode.displayName)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(Color.muted)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.surfaceHigh, in: Capsule())

                            if let outcome, let completionDate = outcome.completionDate {
                                Text("Done \(completionDate)")
                                    .font(.caption2)
                                    .foregroundStyle(Color.muted)
                            } else if goal.deadlineMonths > 0 {
                                Text("\(goal.deadlineMonths)-month deadline")
                                    .font(.caption2)
                                    .foregroundStyle(Color.muted)
                            }

                            Spacer()

                            if goal.fundingMode == .fixed && goal.monthlyAmount > 0 {
                                MoneyText(amount: goal.monthlyAmount, currency: store.state.currency, font: .caption2, color: .muted, isPrivate: isPrivate)
                                Text("/ month")
                                    .font(.caption2)
                                    .foregroundStyle(Color.faint)
                            }
                        }
                    }
                }

                if let hint {
                    Label(hint, systemImage: "lightbulb")
                        .font(.caption)
                        .foregroundStyle(verdict.color)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - GoalsTimelineChart

struct GoalsTimelineChart: View {
    var sequence: GoalSequenceResult
    var goals: [SavingsGoal]
    @Environment(LedgerStore.self) var store

    private struct ChartPoint: Identifiable {
        var id: String { "\(monthIndex)-\(goalId)" }
        var monthIndex: Int
        var goalId: String
        var accumulated: Double
    }

    private var chartPoints: [ChartPoint] {
        let ids = Set(goals.map(\.id))
        var points: [ChartPoint] = []
        for monthPoint in sequence.timeline {
            for (goalId, perGoal) in monthPoint.perGoal where ids.contains(goalId) {
                points.append(ChartPoint(monthIndex: monthPoint.month, goalId: goalId, accumulated: perGoal.accumulated))
            }
        }
        return points.sorted { ($0.goalId, $0.monthIndex) < ($1.goalId, $1.monthIndex) }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Spacing.md) {
                Text("Goal timeline")
                    .font(.cardTitle)
                    .foregroundStyle(Color.ink)

                if chartPoints.isEmpty {
                    Text("Not enough data to chart.")
                        .font(.caption)
                        .foregroundStyle(Color.muted)
                        .frame(maxWidth: .infinity, minHeight: 180, alignment: .center)
                } else {
                    Chart(chartPoints) { point in
                        LineMark(
                            x: .value("Month", point.monthIndex),
                            y: .value("Saved", point.accumulated)
                        )
                        .interpolationMethod(.monotone)
                        // Series keyed by id, so two goals with the same name stay apart.
                        .foregroundStyle(by: .value("Goal", point.goalId))
                    }
                    .chartForegroundStyleScale(
                        domain: goals.map(\.id),
                        range: goals.map { Color(hex: $0.color) }
                    )
                    .chartLegend(.hidden)
                    .chartXAxis {
                        AxisMarks(values: .automatic(desiredCount: 5)) { value in
                            AxisValueLabel {
                                if let idx = value.as(Int.self) {
                                    Text(idx % 12 == 0 && idx > 0 ? "\(idx / 12)y" : "\(idx)m")
                                        .font(.caption2)
                                }
                            }
                            AxisGridLine()
                        }
                    }
                    .chartYAxis {
                        AxisMarks { value in
                            AxisGridLine()
                            AxisValueLabel {
                                if let v = value.as(Double.self) {
                                    Text(abbreviateMoney(v))
                                        .font(.caption2)
                                }
                            }
                        }
                    }
                    .frame(height: 200)
                    .privacyBlurred(store.state.privacyMode)
                    .accessibilityLabel("Goal timeline chart")
                    .accessibilityValue(summary)

                    FlowLayout(spacing: Spacing.sm) {
                        ForEach(goals) { goal in
                            HStack(spacing: Spacing.xs) {
                                ColorDot(hex: goal.color, size: 8)
                                Text(goal.name)
                                    .font(.caption2)
                                    .foregroundStyle(Color.muted)
                            }
                        }
                    }
                }
            }
        }
    }

    private var summary: String {
        sequence.goals.map { outcome in
            if let date = outcome.completionDate { return "\(outcome.name) complete \(date)" }
            return "\(outcome.name) \(outcome.status.displayName)"
        }.joined(separator: ", ")
    }

    private func abbreviateMoney(_ value: Double) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", value / 1_000_000) }
        if value >= 1_000 { return String(format: "%.0fk", value / 1_000) }
        return String(format: "%.0f", value)
    }
}

// MARK: - FlowLayout (simple left-to-right wrapping layout for legends)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        // An unspecified width means "how wide would you like to be": answer with the
        // measured content, never with infinity.
        let limit = proposal.width ?? .greatestFiniteMagnitude
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > limit && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        let width = proposal.width ?? maxX
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - GoalEditorSheet

struct GoalEditorSheet: View {
    var goal: SavingsGoal?
    @Environment(LedgerStore.self) var store
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var target: String = ""
    @State private var saved: String = ""
    @State private var fundingMode: GoalFundingMode = .auto
    @State private var monthlyAmount: String = ""
    @State private var deadlineMonths: String = ""
    @State private var interestRate: String = ""
    @State private var colorHex = CATEGORY_COLORS[0]
    @State private var note = ""
    @State private var showDeleteConfirm = false
    @FocusState private var nameFocused: Bool

    private var isEditing: Bool { goal != nil }
    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && (parseAmountInput(target) ?? 0) > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Goal") {
                    TextField("Goal name (e.g. Emergency fund)", text: $name)
                        .focused($nameFocused)
                        .textInputAutocapitalization(.sentences)

                    LabeledContent("Target") {
                        HStack(spacing: Spacing.xs) {
                            Text(FinanceEngine.currencySymbol(for: store.state.currency))
                                .foregroundStyle(Color.muted)
                            TextField("1000.00", text: $target)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                    }

                    LabeledContent("Already saved") {
                        HStack(spacing: Spacing.xs) {
                            Text(FinanceEngine.currencySymbol(for: store.state.currency))
                                .foregroundStyle(Color.muted)
                            TextField("0.00", text: $saved)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }

                Section {
                    Picker("Funding", selection: $fundingMode) {
                        ForEach([GoalFundingMode.auto, .fixed, .fill], id: \.self) { mode in
                            Text(mode.displayName).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: fundingMode) { _, _ in Haptics.selection() }

                    if fundingMode == .fixed {
                        LabeledContent("Monthly amount") {
                            HStack(spacing: Spacing.xs) {
                                Text(FinanceEngine.currencySymbol(for: store.state.currency))
                                    .foregroundStyle(Color.muted)
                                TextField("0.00", text: $monthlyAmount)
                                    .keyboardType(.decimalPad)
                                    .multilineTextAlignment(.trailing)
                            }
                        }
                    }

                    LabeledContent("Deadline (months)") {
                        TextField("0 = none", text: $deadlineMonths)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }

                    LabeledContent("Interest on savings") {
                        HStack(spacing: Spacing.xs) {
                            TextField("0.0", text: $interestRate)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                            Text("%")
                                .foregroundStyle(Color.muted)
                        }
                    }
                } header: {
                    Text("Funding")
                } footer: {
                    Text(fundingMode.explanation)
                }

                Section("Appearance") {
                    VStack(alignment: .leading, spacing: Spacing.sm) {
                        Text("Colour").foregroundStyle(Color.muted)
                        ColorSwatchGrid(selected: $colorHex)
                    }
                }

                Section("Note") {
                    TextField("Optional note…", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            showDeleteConfirm = true
                        } label: {
                            Text("Delete goal")
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.bg)
            .navigationTitle(isEditing ? "Edit goal" : "Add goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                        Haptics.confirmSave()
                        dismiss()
                    }
                    .disabled(!isValid)
                    .fontWeight(.semibold)
                }
            }
            .confirmationDialog("Delete \(name)?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete goal", role: .destructive) {
                    if let id = goal?.id {
                        store.removeGoal(id: id)
                    }
                    Haptics.notification(.error)
                    dismiss()
                }
            }
            .onAppear {
                populateFromGoal()
                if !isEditing { nameFocused = true }
            }
        }
    }

    private func populateFromGoal() {
        guard let g = goal else {
            colorHex = paletteColor(at: store.state.goals.count)
            return
        }
        name = g.name
        target = formatAmountInput(g.target)
        saved = formatAmountInput(g.saved)
        fundingMode = g.fundingMode
        monthlyAmount = formatAmountInput(g.monthlyAmount)
        deadlineMonths = g.deadlineMonths > 0 ? String(g.deadlineMonths) : ""
        interestRate = g.interestRate == 0 ? "" : formatAmountInput(g.interestRate, fractionDigits: 2)
        colorHex = g.color
        note = g.note
    }

    private func save() {
        let id = goal?.id ?? createId(prefix: "goal")
        let priority = goal?.priority ?? ((store.state.goals.map(\.priority).max() ?? 0) + 1)
        let built = SavingsGoal(
            id: id,
            name: name.trimmingCharacters(in: .whitespaces),
            target: parseAmountInput(target) ?? 0,
            saved: parseAmountInput(saved) ?? 0,
            color: colorHex,
            priority: priority,
            fundingMode: fundingMode,
            monthlyAmount: fundingMode == .fixed ? (parseAmountInput(monthlyAmount) ?? 0) : 0,
            deadlineMonths: max(0, parseIntegerInput(deadlineMonths) ?? 0),
            interestRate: parseAmountInput(interestRate) ?? 0,
            note: note,
            createdAt: goal?.createdAt ?? isoTimestampNow()
        )
        if isEditing {
            store.updateGoal(built)
        } else {
            store.addGoal(built)
        }
    }
}
