import { useState, useId } from "react";
import {
  Target,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Info,
} from "lucide-react";
import type {
  CurrencyCode,
  GoalFundingMode,
  GoalOutcome,
  GoalSequenceResult,
  SavingsGoal,
} from "./types";
import { colors, getCurrencySymbol } from "./finance";

// ─── Types ────────────────────────────────────────────────────────────────────

type HorizonOption = 12 | 24 | 36 | 60 | 120;
const HORIZON_OPTIONS: HorizonOption[] = [12, 24, 36, 60, 120];

// ─── GoalsView ────────────────────────────────────────────────────────────────

interface GoalsViewProps {
  goals: SavingsGoal[];
  goalSequence: GoalSequenceResult;
  goalPlannerSurplus: number;
  surplexOverridden: boolean;
  goalsHorizonMonths: number;
  currency: CurrencyCode;
  symbol: string;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  onAddGoal: () => string;
  onUpdateGoal: (id: string, patch: Partial<SavingsGoal>) => void;
  onRemoveGoal: (id: string) => void;
  onReorderGoal: (id: string, dir: "up" | "down") => void;
  onSurplusOverride: (value: number | null) => void;
  onHorizonChange: (h: number) => void;
}

export function GoalsView({
  goals,
  goalSequence,
  goalPlannerSurplus,
  surplexOverridden,
  goalsHorizonMonths,
  currency,
  symbol,
  formatter,
  privacy,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
  onReorderGoal,
  onSurplusOverride,
  onHorizonChange,
}: GoalsViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [surplusInput, setSurplusInput] = useState<string>(String(Math.round(goalPlannerSurplus)));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const sorted = [...goals].sort((a, b) => a.priority - b.priority);

  function handleAddGoal() {
    const id = onAddGoal();
    setEditingId(id);
  }

  function handleSurplusBlur() {
    const v = parseFloat(surplusInput.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(v)) {
      onSurplusOverride(v);
    } else {
      setSurplusInput(String(Math.round(goalPlannerSurplus)));
    }
  }

  function resetSurplus() {
    onSurplusOverride(null);
    setSurplusInput(String(Math.round(goalPlannerSurplus)));
  }

  return (
    <section className="viewStack goalsView" aria-label="Goals">
      <div className="pageHeader compactHeader">
        <div>
          <h2>Goals</h2>
          <p>Plan multiple savings goals with waterfall cash flow forecasting.</p>
        </div>
        <button className="commandButton" type="button" onClick={handleAddGoal}>
          <Plus size={15} />
          New goal
        </button>
      </div>

      {/* ── Surplus & horizon controls ── */}
      <div className="goalsPlannerBar">
        <div className="goalsSurplusField">
          <span className="goalsSurplusLabel">
            Monthly surplus available for goals
            <span className="goalsSurplusHint">
              {surplexOverridden ? (
                <>
                  (overridden ·{" "}
                  <button className="inlineLinkBtn" type="button" onClick={resetSurplus}>
                    <RefreshCw size={11} /> reset to ledger
                  </button>
                  )
                </>
              ) : (
                "(from ledger)"
              )}
            </span>
          </span>
          <div className="goalsSurplusInput">
            <span>{symbol}</span>
            <input
              type="number"
              min={0}
              value={surplusInput}
              onChange={(e) => setSurplusInput(e.target.value)}
              onBlur={handleSurplusBlur}
              aria-label="Monthly surplus for goals"
            />
            <span>/mo</span>
          </div>
        </div>

        <div className="goalsHorizonTabs" role="tablist" aria-label="Forecast horizon">
          {HORIZON_OPTIONS.map((h) => (
            <button
              key={h}
              className={goalsHorizonMonths === h ? "selected" : ""}
              role="tab"
              aria-selected={goalsHorizonMonths === h}
              type="button"
              onClick={() => onHorizonChange(h)}
            >
              {h >= 12 ? `${h / 12}yr` : `${h}mo`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Waterfall timeline ── */}
      {goals.length > 0 && goalSequence.timeline.length > 0 ? (
        <WaterfallTimeline
          goals={sorted}
          sequence={goalSequence}
          horizonMonths={goalsHorizonMonths}
        />
      ) : goals.length > 0 && goalPlannerSurplus <= 0 ? (
        <div className="goalsTimelineEmpty">
          <Info size={18} />
          <p>Set a monthly surplus above to generate the forecast.</p>
        </div>
      ) : null}

      {/* ── Goal cards ── */}
      {goals.length === 0 ? (
        <div className="goalsEmptyState">
          <Target size={32} />
          <h3>No goals yet</h3>
          <p>Add a savings goal to start planning your financial future with waterfall forecasting.</p>
          <button className="commandButton" type="button" onClick={handleAddGoal}>
            <Plus size={15} />
            Add first goal
          </button>
        </div>
      ) : (
        <div className="goalsCardGrid">
          {sorted.map((goal, idx) => {
            const outcome = goalSequence.goals.find((o) => o.goalId === goal.id) ?? null;
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                outcome={outcome}
                isFirst={idx === 0}
                isLast={idx === sorted.length - 1}
                isEditing={editingId === goal.id}
                confirmDelete={confirmDelete === goal.id}
                symbol={symbol}
                formatter={formatter}
                privacy={privacy}
                currency={currency}
                onEdit={() => setEditingId(editingId === goal.id ? null : goal.id)}
                onUpdate={(patch) => onUpdateGoal(goal.id, patch)}
                onMoveUp={() => onReorderGoal(goal.id, "up")}
                onMoveDown={() => onReorderGoal(goal.id, "down")}
                onConfirmDelete={() => setConfirmDelete(goal.id)}
                onDelete={() => { onRemoveGoal(goal.id); setConfirmDelete(null); setEditingId(null); }}
                onCancelDelete={() => setConfirmDelete(null)}
              />
            );
          })}
        </div>
      )}

      {goalSequence.avgUnallocatedSurplus > 0 && goals.length > 0 && (
        <p className="goalsUnallocated">
          Average unallocated surplus after all goals:{" "}
          <strong>{symbol}{Math.round(goalSequence.avgUnallocatedSurplus).toLocaleString("en")}/month</strong>
        </p>
      )}
    </section>
  );
}

// ─── WaterfallTimeline ────────────────────────────────────────────────────────

function WaterfallTimeline({
  goals,
  sequence,
  horizonMonths,
}: {
  goals: SavingsGoal[];
  sequence: GoalSequenceResult;
  horizonMonths: number;
}) {
  const ROW_H = 36;
  const LABEL_W = 130;
  const BAR_AREA_W = 680;
  const PAD = 16;
  const totalH = goals.length * ROW_H + PAD * 2 + 28; // extra for x-axis labels

  // Build quarter labels for x-axis
  const quarterMonths: number[] = [];
  for (let m = 0; m <= horizonMonths; m += 3) quarterMonths.push(m);

  function xForMonth(m: number) {
    return LABEL_W + (m / horizonMonths) * BAR_AREA_W;
  }

  return (
    <div className="goalsTimeline" role="img" aria-label="Goal waterfall timeline">
      <svg
        width={LABEL_W + BAR_AREA_W + PAD}
        height={totalH}
        style={{ overflow: "visible", display: "block", maxWidth: "100%" }}
        viewBox={`0 0 ${LABEL_W + BAR_AREA_W + PAD} ${totalH}`}
        preserveAspectRatio="xMinYMid meet"
      >
        {/* X-axis grid lines & labels */}
        {quarterMonths.map((m) => (
          <g key={m}>
            <line
              x1={xForMonth(m)}
              y1={PAD}
              x2={xForMonth(m)}
              y2={totalH - 26}
              stroke="rgba(212,228,250,0.07)"
              strokeWidth={1}
            />
            <text
              x={xForMonth(m)}
              y={totalH - 8}
              textAnchor="middle"
              fontSize={10}
              fill="rgba(212,228,250,0.35)"
            >
              {m === 0 ? "Now" : sequence.timeline[m - 1]?.label ?? ""}
            </text>
          </g>
        ))}

        {/* Vertical "today" line */}
        <line
          x1={xForMonth(0)}
          y1={PAD}
          x2={xForMonth(0)}
          y2={totalH - 26}
          stroke="rgba(0,223,193,0.5)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />

        {/* Goal bars */}
        {goals.map((goal, idx) => {
          const outcome = sequence.goals.find((o) => o.goalId === goal.id);
          const startM = 0;
          const endM = outcome?.completionMonth ?? horizonMonths;
          const isComplete = outcome?.status === "complete";
          const y = PAD + idx * ROW_H;
          const barY = y + 6;
          const barH = ROW_H - 12;
          const x1 = xForMonth(startM);
          const x2 = xForMonth(Math.min(endM, horizonMonths));
          const barW = Math.max(4, x2 - x1);
          const notReached = !outcome?.completionMonth;

          return (
            <g key={goal.id}>
              {/* Label */}
              <text
                x={LABEL_W - 8}
                y={y + ROW_H / 2 + 4}
                textAnchor="end"
                fontSize={11}
                fill="rgba(212,228,250,0.65)"
                style={{ fontFamily: "var(--sans, sans-serif)" }}
              >
                {(goal.name || "Goal").slice(0, 16)}
              </text>

              {/* Track (full horizon) */}
              <rect
                x={LABEL_W}
                y={barY}
                width={BAR_AREA_W}
                height={barH}
                rx={4}
                fill="rgba(212,228,250,0.04)"
              />

              {/* Fill bar */}
              <rect
                x={x1}
                y={barY}
                width={barW}
                height={barH}
                rx={4}
                fill={notReached ? "rgba(255,180,80,0.25)" : isComplete ? "rgba(0,223,193,0.2)" : goal.color}
                opacity={0.85}
              />

              {/* Completion marker */}
              {outcome?.completionMonth && outcome.completionMonth <= horizonMonths && (
                <circle
                  cx={xForMonth(outcome.completionMonth)}
                  cy={barY + barH / 2}
                  r={5}
                  fill={isComplete ? "rgba(0,223,193,0.9)" : goal.color}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  outcome,
  isFirst,
  isLast,
  isEditing,
  confirmDelete,
  symbol,
  formatter,
  privacy,
  currency,
  onEdit,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onConfirmDelete,
  onDelete,
  onCancelDelete,
}: {
  goal: SavingsGoal;
  outcome: GoalOutcome | null;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  confirmDelete: boolean;
  symbol: string;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  currency: CurrencyCode;
  onEdit: () => void;
  onUpdate: (patch: Partial<SavingsGoal>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const pct = goal.target > 0 ? Math.min(100, (goal.saved / goal.target) * 100) : 0;
  const status = outcome?.status ?? "no-deadline";

  const statusLabel: Record<string, string> = {
    complete: "Complete",
    "on-track": "On track",
    tight: "Tight",
    "at-risk": "At risk",
    "no-deadline": outcome?.completionMonth ? "No deadline" : "Unfunded",
  };

  const statusClass: Record<string, string> = {
    complete: "goalStatus--complete",
    "on-track": "goalStatus--ontrack",
    tight: "goalStatus--tight",
    "at-risk": "goalStatus--risk",
    "no-deadline": "goalStatus--muted",
  };

  return (
    <div className={`goalCard${isEditing ? " goalCard--editing" : ""}`}>
      <div className="goalCardHeader">
        <div className="goalCardDot" style={{ background: goal.color }} />
        <div className="goalCardMeta">
          <h3>{goal.name || <em>Unnamed goal</em>}</h3>
          <span className={`goalStatus ${statusClass[status]}`}>{statusLabel[status]}</span>
        </div>
        <div className="goalCardActions">
          {!isFirst && (
            <button className="goalIconBtn" type="button" onClick={onMoveUp} aria-label="Move up">
              <ChevronUp size={14} />
            </button>
          )}
          {!isLast && (
            <button className="goalIconBtn" type="button" onClick={onMoveDown} aria-label="Move down">
              <ChevronDown size={14} />
            </button>
          )}
          <button className={`goalIconBtn${isEditing ? " active" : ""}`} type="button" onClick={onEdit} aria-label="Edit goal">
            Edit
          </button>
        </div>
      </div>

      <div className="goalCardProgress">
        <div className="goalProgressTrack">
          <div className="goalProgressFill" style={{ width: `${pct}%`, background: goal.color }} />
        </div>
        <span className={privacy ? "masked" : ""}>{Math.round(pct)}%</span>
      </div>

      <div className="goalCardNumbers">
        <div className="goalCardStat">
          <span>Saved</span>
          <strong className={privacy ? "masked" : ""}>{symbol}{goal.saved.toLocaleString("en")}</strong>
        </div>
        <div className="goalCardStat">
          <span>Target</span>
          <strong className={privacy ? "masked" : ""}>{symbol}{goal.target.toLocaleString("en")}</strong>
        </div>
        {goal.monthlyAmount > 0 && (
          <div className="goalCardStat">
            <span>Per month</span>
            <strong className={privacy ? "masked" : ""}>{symbol}{goal.monthlyAmount.toLocaleString("en")}</strong>
          </div>
        )}
        {outcome?.completionDate && (
          <div className="goalCardStat">
            <span>Completes</span>
            <strong>{outcome.completionDate}</strong>
          </div>
        )}
      </div>

      {outcome?.status === "at-risk" && (outcome.extraMonthlyNeeded > 0 || outcome.extraMonthsNeeded > 0) && (
        <p className="goalGapHint">
          Add {symbol}{outcome.extraMonthlyNeeded.toLocaleString("en")}/month{outcome.extraMonthsNeeded > 0 ? ` — or extend by ${outcome.extraMonthsNeeded} month${outcome.extraMonthsNeeded > 1 ? "s" : ""}` : ""} to hit this goal.
        </p>
      )}

      {isEditing && (
        <GoalEditor
          goal={goal}
          symbol={symbol}
          onUpdate={onUpdate}
          confirmDelete={confirmDelete}
          onConfirmDelete={onConfirmDelete}
          onDelete={onDelete}
          onCancelDelete={onCancelDelete}
        />
      )}
    </div>
  );
}

// ─── GoalEditor ───────────────────────────────────────────────────────────────

function GoalEditor({
  goal,
  symbol,
  onUpdate,
  confirmDelete,
  onConfirmDelete,
  onDelete,
  onCancelDelete,
}: {
  goal: SavingsGoal;
  symbol: string;
  onUpdate: (patch: Partial<SavingsGoal>) => void;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const uid = useId();

  const FUNDING_MODES: { value: GoalFundingMode; label: string; hint: string }[] = [
    { value: "fixed", label: "Fixed", hint: `Save a set ${symbol}/month` },
    { value: "auto", label: "Auto", hint: "Engine works out the amount" },
    { value: "fill", label: "Fill", hint: "Absorb leftover surplus" },
  ];

  return (
    <div className="goalEditor">
      <div className="goalEditorRow">
        <label htmlFor={`${uid}-name`}>Goal name</label>
        <input
          id={`${uid}-name`}
          value={goal.name}
          placeholder="e.g. Emergency fund"
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </div>

      <div className="goalEditorRow goalEditorRow--2col">
        <div>
          <label htmlFor={`${uid}-target`}>Target ({symbol})</label>
          <input
            id={`${uid}-target`}
            type="number"
            min={0}
            value={goal.target || ""}
            placeholder="10000"
            onChange={(e) => onUpdate({ target: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-saved`}>Already saved ({symbol})</label>
          <input
            id={`${uid}-saved`}
            type="number"
            min={0}
            value={goal.saved || ""}
            placeholder="0"
            onChange={(e) => onUpdate({ saved: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="goalEditorRow">
        <label>Funding mode</label>
        <div className="goalFundingMode">
          {FUNDING_MODES.map((mode) => (
            <button
              key={mode.value}
              className={`goalFundingBtn${goal.fundingMode === mode.value ? " active" : ""}`}
              type="button"
              data-tip={mode.hint}
              onClick={() => onUpdate({ fundingMode: mode.value })}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {goal.fundingMode !== "fill" && (
        <div className="goalEditorRow">
          <label htmlFor={`${uid}-amount`}>Monthly contribution ({symbol})</label>
          <input
            id={`${uid}-amount`}
            type="number"
            min={0}
            value={goal.monthlyAmount || ""}
            placeholder="400"
            onChange={(e) => onUpdate({ monthlyAmount: parseFloat(e.target.value) || 0 })}
          />
        </div>
      )}

      <div className="goalEditorRow goalEditorRow--2col">
        <div className="goalEditorInlineField">
          <label htmlFor={`${uid}-deadline`}>Deadline</label>
          <div className="goalEditorInputRow">
            <input
              id={`${uid}-deadline`}
              type="number"
              min={0}
              value={goal.deadlineMonths || ""}
              placeholder="months"
              onChange={(e) => onUpdate({ deadlineMonths: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div className="goalEditorInlineField">
          <label htmlFor={`${uid}-rate`}>Interest AER %</label>
          <div className="goalEditorInputRow">
            <input
              id={`${uid}-rate`}
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={goal.interestRate || ""}
              placeholder="0"
              onChange={(e) => onUpdate({ interestRate: parseFloat(e.target.value) || 0 })}
            />
            <span
              className="goalEditorInfoIcon"
              tabIndex={0}
              role="button"
              aria-label="About interest rate"
            >
              <Info size={13} />
              <span className="goalEditorInfoTooltip">
                Optional. If set, the engine compounds interest monthly on the accumulated balance — simulating the return you'd earn in a savings account or ISA.
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="goalEditorRow">
        <label>Colour</label>
        <div className="goalColorPicker">
          {colors.slice(0, 8).map((c) => (
            <button
              key={c}
              className={`goalColorSwatch${goal.color === c ? " active" : ""}`}
              type="button"
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => onUpdate({ color: c })}
            />
          ))}
        </div>
      </div>

      <div className="goalEditorRow">
        <label htmlFor={`${uid}-note`}>Note</label>
        <input
          id={`${uid}-note`}
          value={goal.note}
          placeholder="Optional note"
          onChange={(e) => onUpdate({ note: e.target.value })}
        />
      </div>

      <div className="goalEditorDelete">
        {confirmDelete ? (
          <>
            <span>Are you sure?</span>
            <button className="goalDeleteConfirmBtn" type="button" onClick={onDelete}>
              <Trash2 size={13} /> Delete
            </button>
            <button className="goalDeleteCancelBtn" type="button" onClick={onCancelDelete}>
              Cancel
            </button>
          </>
        ) : (
          <button className="goalDeleteBtn" type="button" onClick={onConfirmDelete}>
            <Trash2 size={13} />
            Delete goal
          </button>
        )}
      </div>
    </div>
  );
}
