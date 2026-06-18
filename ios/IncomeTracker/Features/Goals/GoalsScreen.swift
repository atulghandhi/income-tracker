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
}

// MARK: - GoalsScreen

struct GoalsScreen: View {
    @Environment(LedgerStore.self) var store
    @State private var showAddGoal = false
    @State private var editingGoal: SavingsGoal? = nil
    @State private var sequence: GoalSequenceResult? = nil
    @State private var isLoadingSequence = false

    private var effectiveSurplus: Double {
        if let override = store.state.goalPlannerSurplus {
            return override
        }
        let month = store.currentMonthBudget
        return FinanceEngine.projection(for: month).recurringMonthlySurplus
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Planner surplus control
                PlannerSurplusControl()

                // Goals list or empty state
                if store.state.goals.isEmpty {
                    EmptyStateView(
                        title: "No goals yet",
                        subtitle: "Add savings goals to plan your financial future and track progress.",
                        systemImage: "target",
                        actionLabel: "Add Goal"
                    ) {
                        showAddGoal = true
                        Haptics.impact(.light)
                    }
                    .padding(.top, 32)
                } else {
                    // Reorderable goal cards
                    VStack(spacing: 12) {
                        ForEach(store.state.goals) { goal in
                            let outcome = sequence?.goals.first(where: { $0.goalId == goal.id })
                            GoalCard(
                                goal: goal,
                                outcome: outcome,
                                onEdit: { editingGoal = goal }
                            )
                            .transition(.scaleFade)
                        }
                    }

                    // Timeline chart
                    if let seq = sequence {
                        GoalsTimelineChart(
                            sequence: seq,
                            goals: store.state.goals
                        )
                    } else if isLoadingSequence {
                        ProgressView("Calculating…")
                            .frame(maxWidth: .infinity)
                            .frame(height: 200)
                            .background(Color.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
            }
            .padding()
        }
        .background(Color.bg.ignoresSafeArea())
        .navigationTitle("Goals")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddGoal = true
                    Haptics.impact(.light)
                } label: {
                    Image(systemName: "plus")
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
        .task(id: store.state.goals) {
            await recomputeSequence()
        }
        .task(id: store.state.goalPlannerSurplus) {
            await recomputeSequence()
        }
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
        withAnimation(Motion.standard) {
            sequence = result
            isLoadingSequence = false
        }
    }
}

// MARK: - PlannerSurplusControl

private struct PlannerSurplusControl: View {
    @Environment(LedgerStore.self) var store
    @State private var editText: String = ""
    @State private var isEditing = false
    @FocusState private var focused: Bool

    private var derivedSurplus: Double {
        let month = store.currentMonthBudget
        return FinanceEngine.projection(for: month).recurringMonthlySurplus
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Monthly planner surplus")
                            .font(.cardTitle)
                            .foregroundStyle(Color.ink)
                        Text("Funds available to allocate to goals each month")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                    }
                    Spacer()
                    if store.state.goalPlannerSurplus != nil {
                        Button("Reset") {
                            store.setGoalPlannerSurplus(nil)
                            isEditing = false
                            Haptics.selection()
                        }
                        .font(.caption)
                        .foregroundStyle(Color.brandBlue)
                    }
                }

                HStack(spacing: 8) {
                    Text(FinanceEngine.currencySymbol(for: store.state.currency))
                        .font(.moneyMedium)
                        .foregroundStyle(Color.muted)

                    if isEditing {
                        TextField(
                            String(format: "%.2f", derivedSurplus),
                            text: $editText
                        )
                        .font(.moneyMedium)
                        .foregroundStyle(Color.ink)
                        .keyboardType(.decimalPad)
                        .focused($focused)
                        .onSubmit { commitEdit() }
                    } else {
                        let display = store.state.goalPlannerSurplus ?? derivedSurplus
                        Text(String(format: "%.2f", display))
                            .font(.moneyMedium)
                            .foregroundStyle(store.state.goalPlannerSurplus != nil ? Color.brandBlue : Color.ink)
                            .contentTransition(.numericText(value: display))
                            .animation(Motion.standard, value: display)
                            .onTapGesture { beginEdit() }
                    }

                    if !isEditing {
                        Image(systemName: "pencil")
                            .font(.caption)
                            .foregroundStyle(Color.faint)
                            .onTapGesture { beginEdit() }
                    } else {
                        Button("Done") { commitEdit() }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.brandBlue)
                    }
                }

                if store.state.goalPlannerSurplus == nil {
                    Text("Derived from recurring income − recurring expenses")
                        .font(.caption2)
                        .foregroundStyle(Color.faint)
                }
            }
        }
    }

    private func beginEdit() {
        let current = store.state.goalPlannerSurplus ?? derivedSurplus
        editText = String(format: "%.2f", current)
        isEditing = true
        focused = true
        Haptics.impact(.light)
    }

    private func commitEdit() {
        if let value = Double(editText) {
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
    var onEdit: () -> Void
    @Environment(LedgerStore.self) var store

    private var progress: Double {
        guard goal.target > 0 else { return 1.0 }
        return min(goal.saved / goal.target, 1.0)
    }

    private var status: GoalStatus { outcome?.status ?? .noDeadline }

    var body: some View {
        Card {
            HStack(spacing: 16) {
                // Progress ring
                ZStack {
                    Circle()
                        .stroke(Color(hex: goal.color).opacity(0.2), lineWidth: 5)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color(hex: goal.color), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(Motion.bouncy, value: goal.saved)

                    if status == .complete {
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(Color(hex: goal.color))
                    } else {
                        Text(String(format: "%.0f%%", progress * 100))
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(Color(hex: goal.color))
                    }
                }
                .frame(width: 54, height: 54)

                // Info
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 6) {
                        Text(goal.name)
                            .font(.headline)
                            .foregroundStyle(Color.ink)
                            .lineLimit(1)
                        Spacer()
                        TonePill(label: status.displayName, color: status.pillColor)
                            .animation(Motion.snappy, value: status)
                    }

                    HStack(spacing: 8) {
                        MoneyText(
                            amount: goal.saved,
                            currency: store.state.currency,
                            font: .moneySmall,
                            color: .ink,
                            isPrivate: store.state.privacyMode
                        )
                        Text("of")
                            .font(.caption)
                            .foregroundStyle(Color.muted)
                        MoneyText(
                            amount: goal.target,
                            currency: store.state.currency,
                            font: .moneySmall,
                            color: .muted,
                            isPrivate: store.state.privacyMode
                        )
                    }

                    HStack(spacing: 8) {
                        // Funding mode chip
                        Text(goal.fundingMode.displayName)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color.muted)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.surfaceHigh, in: Capsule())

                        if let outcome, let completionDate = outcome.completionDate {
                            Text("ETA \(completionDate)")
                                .font(.caption2)
                                .foregroundStyle(Color.muted)
                        } else if goal.deadlineMonths > 0 {
                            Text("\(goal.deadlineMonths) mo deadline")
                                .font(.caption2)
                                .foregroundStyle(Color.muted)
                        }

                        Spacer()

                        if goal.fundingMode == .fixed && goal.monthlyAmount > 0 {
                            MoneyText(
                                amount: goal.monthlyAmount,
                                currency: store.state.currency,
                                font: Font.system(size: 11, weight: .medium, design: .rounded).monospacedDigit(),
                                color: .muted,
                                isPrivate: store.state.privacyMode
                            )
                            Text("/ mo")
                                .font(.caption2)
                                .foregroundStyle(Color.faint)
                        }
                    }
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onEdit()
            Haptics.impact(.light)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                withAnimation(Motion.snappy) {
                    store.removeGoal(id: goal.id)
                }
                Haptics.notification(.error)
            } label: {
                Label("Delete", systemImage: "trash")
            }

            Button {
                duplicateGoal()
                Haptics.impact(.medium)
            } label: {
                Label("Duplicate", systemImage: "plus.square.on.square")
            }
            .tint(.brandBlue)
        }
        .contextMenu {
            Button { onEdit() } label: {
                Label("Edit", systemImage: "pencil")
            }
            Button { duplicateGoal() } label: {
                Label("Duplicate", systemImage: "plus.square.on.square")
            }
            Divider()
            Button(role: .destructive) {
                store.removeGoal(id: goal.id)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private func duplicateGoal() {
        var copy = goal
        copy.id = createId(prefix: "goal")
        copy.name = "\(goal.name) (copy)"
        copy.priority = (store.state.goals.map(\.priority).max() ?? 0) + 1
        copy.createdAt = ISO8601DateFormatter().string(from: .now)
        store.addGoal(copy)
    }
}

// MARK: - GoalsTimelineChart

struct GoalsTimelineChart: View {
    var sequence: GoalSequenceResult
    var goals: [SavingsGoal]

    // Build a flat array of (monthIndex, goalId, accumulated) for charting
    private struct ChartPoint: Identifiable {
        var id: String { "\(monthIndex)-\(goalId)" }
        var monthIndex: Int
        var goalId: String
        var goalName: String
        var color: String
        var accumulated: Double
    }

    private var chartPoints: [ChartPoint] {
        var points: [ChartPoint] = []
        let goalMap = Dictionary(uniqueKeysWithValues: goals.map { ($0.id, $0) })

        for monthPoint in sequence.timeline {
            for (goalId, perGoal) in monthPoint.perGoal {
                guard let goal = goalMap[goalId] else { continue }
                points.append(ChartPoint(
                    monthIndex: monthPoint.month,
                    goalId: goalId,
                    goalName: goal.name,
                    color: goal.color,
                    accumulated: perGoal.accumulated
                ))
            }
        }
        return points
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
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
                            y: .value("Accumulated", point.accumulated)
                        )
                        .foregroundStyle(Color(hex: point.color))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(by: .value("Goal", point.goalName))
                    }
                    .chartForegroundStyleScale(
                        domain: goals.map(\.name),
                        range: goals.map { Color(hex: $0.color) }
                    )
                    .chartXAxis {
                        AxisMarks(values: .stride(by: 12)) { value in
                            AxisValueLabel {
                                if let idx = value.as(Int.self) {
                                    Text("Mo \(idx)")
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
                    .animation(Motion.standard, value: sequence.goals.count)

                    // Legend
                    FlowLayout(spacing: 8) {
                        ForEach(goals) { goal in
                            HStack(spacing: 4) {
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

    private func abbreviateMoney(_ value: Double) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", value / 1_000_000) }
        if value >= 1_000 { return String(format: "%.0fk", value / 1_000) }
        return String(format: "%.0f", value)
    }
}

// MARK: - FlowLayout (simple left-to-right wrapping layout for legend)

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
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
    @State private var target: String = "1000"
    @State private var saved: String = "0"
    @State private var fundingMode: GoalFundingMode = .auto
    @State private var monthlyAmount: String = "0"
    @State private var deadlineMonths: String = "0"
    @State private var interestRate: String = "0"
    @State private var colorHex = CATEGORY_COLORS[0]
    @State private var note = ""

    private var isEditing: Bool { goal != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Goal details") {
                    TextField("Goal name", text: $name)

                    HStack {
                        Text("Target")
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("1000.00", text: $target)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }

                    HStack {
                        Text("Already saved")
                            .foregroundStyle(Color.muted)
                        Spacer()
                        Text(FinanceEngine.currencySymbol(for: store.state.currency))
                            .foregroundStyle(Color.muted)
                        TextField("0.00", text: $saved)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                    }
                }

                Section("Funding") {
                    Picker("Mode", selection: $fundingMode) {
                        ForEach([GoalFundingMode.fixed, .auto, .fill], id: \.self) { mode in
                            Text(mode.displayName).tag(mode)
                        }
                    }
                    .onChange(of: fundingMode) { _, _ in Haptics.selection() }

                    if fundingMode == .fixed {
                        HStack {
                            Text("Monthly amount")
                                .foregroundStyle(Color.muted)
                            Spacer()
                            Text(FinanceEngine.currencySymbol(for: store.state.currency))
                                .foregroundStyle(Color.muted)
                            TextField("0.00", text: $monthlyAmount)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                    }

                    HStack {
                        Text("Deadline (months)")
                            .foregroundStyle(Color.muted)
                        Spacer()
                        TextField("0 = none", text: $deadlineMonths)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                    }

                    HStack {
                        Text("Interest rate")
                            .foregroundStyle(Color.muted)
                        Spacer()
                        TextField("0.0", text: $interestRate)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        Text("%")
                            .foregroundStyle(Color.muted)
                    }
                }

                Section("Appearance") {
                    HStack(spacing: 10) {
                        Text("Color").foregroundStyle(Color.muted)
                        Spacer()
                        ForEach(CATEGORY_COLORS, id: \.self) { hex in
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 22, height: 22)
                                .overlay(
                                    Circle()
                                        .strokeBorder(Color.white, lineWidth: colorHex == hex ? 2.5 : 0)
                                )
                                .shadow(color: colorHex == hex ? Color(hex: hex).opacity(0.5) : .clear, radius: 3)
                                .onTapGesture {
                                    colorHex = hex
                                    Haptics.selection()
                                }
                                .animation(Motion.snappy, value: colorHex)
                        }
                    }
                }

                Section("Note") {
                    TextField("Optional note…", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }

                if isEditing {
                    Section {
                        Button(role: .destructive) {
                            if let id = goal?.id {
                                store.removeGoal(id: id)
                            }
                            Haptics.notification(.error)
                            dismiss()
                        } label: {
                            Text("Delete goal")
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Goal" : "Add Goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        save()
                        Haptics.confirmSave()
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                    .fontWeight(.semibold)
                }
            }
            .onAppear { populateFromGoal() }
        }
    }

    private func populateFromGoal() {
        guard let g = goal else { return }
        name = g.name
        target = String(g.target)
        saved = String(g.saved)
        fundingMode = g.fundingMode
        monthlyAmount = String(g.monthlyAmount)
        deadlineMonths = String(g.deadlineMonths)
        interestRate = String(g.interestRate)
        colorHex = g.color
        note = g.note
    }

    private func save() {
        let id = goal?.id ?? createId(prefix: "goal")
        let priority = goal?.priority ?? ((store.state.goals.map(\.priority).max() ?? 0) + 1)
        let built = SavingsGoal(
            id: id,
            name: name.trimmingCharacters(in: .whitespaces),
            target: Double(target) ?? 0,
            saved: Double(saved) ?? 0,
            color: colorHex,
            priority: priority,
            fundingMode: fundingMode,
            monthlyAmount: Double(monthlyAmount) ?? 0,
            deadlineMonths: Int(deadlineMonths) ?? 0,
            interestRate: Double(interestRate) ?? 0,
            note: note,
            createdAt: goal?.createdAt ?? ISO8601DateFormatter().string(from: .now)
        )
        if isEditing {
            store.updateGoal(built)
        } else {
            store.addGoal(built)
        }
    }
}
