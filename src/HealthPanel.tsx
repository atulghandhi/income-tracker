import { useState, type FormEvent } from "react";
import { ArrowRight, Gauge, PenLine } from "lucide-react";
import { interpretCreditScore, knownScoreReading, knownScoreScale } from "./creditScore";
import type { Localizer, RegionKey } from "./region";
import type { HealthAction, HealthScoreBreakdown, KnownCreditScore } from "./types";
import { InfoHint, PanelTitle, ProgressRule, formatDecimal, healthTone } from "./ui";

export type HealthDestination = "ledger" | "accounts" | "allocate" | "goals";

type Props = {
  health: HealthScoreBreakdown;
  region: RegionKey;
  t: Localizer;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  known?: KnownCreditScore;
  onSaveKnown: (score: KnownCreditScore | undefined) => void;
  onOpen: (destination: HealthDestination) => void;
};

// One plain sentence per step, with the money involved, and the page where it gets done.
function describeAction(action: HealthAction, money: (value: number) => string): { text: string; to: HealthDestination } {
  const amount = action.amount ?? 0;
  switch (action.id) {
    case "interest-trap":
      return { text: `Pay ${money(amount)} more a month on ${action.name ?? "your debt"}. Its minimum doesn't cover the interest, so it keeps growing.`, to: "accounts" };
    case "cash-flow":
      return action.amount
        ? { text: `Close the ${money(amount)} a month gap between what comes in and what goes out.`, to: "ledger" }
        : { text: `Spending takes ${action.percent ?? 0}% of your income. Trimming it lifts the score most.`, to: "ledger" };
    case "cards":
      return { text: `Pay ${money(amount)} off your cards to bring them under 30% of their limits (now ${action.percent ?? 0}%).`, to: "allocate" };
    case "payments":
      return { text: `Clear ${action.name ?? "your smallest debt"} to free up ${money(amount)} a month of minimum payments.`, to: "allocate" };
    case "debt":
      return { text: `Your debts come to ${action.percent ?? 0} months of income. Allocate plans the quickest way down.`, to: "allocate" };
    case "savings":
      return { text: `Save ${money(amount)} more a month to reach your ${action.percent ?? 0}% savings target.`, to: "goals" };
  }
}

export default function HealthPanel({ health, region, t, formatter, privacy, known, onSaveKnown, onOpen }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const scale = knownScoreScale(region);
  const [min, max] = scale === "Experian" ? [0, 999] : [300, 850];
  const own = known && known.scale === scale ? known : undefined;
  const reading = own ? knownScoreReading(own.score, region) : interpretCreditScore(health.estimatedCreditScore, region).primary;
  const money = (value: number) => (privacy ? "•••" : formatter.format(value));
  const steps = health.actions.slice(0, 2);

  function save(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value) {
      onSaveKnown(undefined);
      setEditing(false);
      return;
    }
    const score = Number(value);
    if (!Number.isFinite(score) || score < min || score > max) return;
    onSaveKnown({ score: Math.round(score), scale, updatedAt: new Date().toISOString() });
    setEditing(false);
  }

  return (
    <article className={`miniPanel healthPanel ${health.noData ? "" : healthTone(health.score)}`}>
      <PanelTitle title="Health score" icon={<Gauge size={16} />} action={<InfoHint label="How health score is calculated" text={t(health.detail)} />} />
      <div className="scoreHeadline">
        <div className="scoreNumber">
          {health.noData ? "N/A" : formatDecimal(health.score)}
          {!health.noData && <small>/10</small>}
        </div>
        {!health.noData && <span className="scoreBadge">{health.summary}</span>}
      </div>
      {health.noData && <span className="scoreCaption">Add data to generate a score</span>}
      {!health.noData && (
        <>
          {steps.length > 0 && (
            <div className="healthSteps">
              <span className="healthStepsLabel">Next steps</span>
              <ul>
                {steps.map((action) => {
                  const { text, to } = describeAction(action, money);
                  return (
                    <li key={action.id}>
                      <button type="button" onClick={() => onOpen(to)}>
                        <span>{t(text)}</span>
                        <b aria-label={`adds ${action.gain.toFixed(1)} to the score`}>+{action.gain.toFixed(1)}</b>
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {editing ? (
            <form className="creditEstimate creditEntry" onSubmit={save}>
              <label htmlFor="known-credit-score">Your {scale} score</label>
              <input
                id="known-credit-score"
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                placeholder={`${min}–${max}`}
                value={draft}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(false);
                }}
              />
              <button className="commandButton" type="submit">
                Save
              </button>
            </form>
          ) : (
            <div className="creditEstimate">
              <span>{own ? "Your credit score" : "Estimated credit score"}</span>
              <strong>
                {reading.score}
                <small>
                  {" "}
                  {reading.scale} · {reading.band.label}
                </small>
              </strong>
              <button
                className="iconButton creditEdit"
                type="button"
                aria-label={own ? "Change your credit score" : "Enter your real credit score"}
                data-tip={own ? "Change" : "Know yours? Enter it"}
                onClick={() => {
                  setDraft(own ? String(own.score) : "");
                  setEditing(true);
                }}
              >
                <PenLine size={14} />
              </button>
            </div>
          )}

          <div className="ruleList">
            <ProgressRule label="Cash flow" value={health.cashFlowScore} target={75} />
            <ProgressRule label="Debt load" value={health.debtLoadScore} target={75} />
            <ProgressRule label="Payments" value={health.paymentPressureScore} target={75} />
            <ProgressRule label="Card headroom" value={health.utilizationScore} target={75} />
            <ProgressRule label="Savings" value={health.savingsScore} target={75} />
          </div>
        </>
      )}
    </article>
  );
}
