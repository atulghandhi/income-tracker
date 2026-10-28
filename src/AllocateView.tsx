import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Check, Coins, CreditCard, ExternalLink, Info, Landmark, PiggyBank, RefreshCw, Scale, ShieldCheck, Target, TrendingDown } from "lucide-react";
import {
  ALLOCATION_HORIZONS,
  COMPARE_METRICS,
  METHOD_LABELS,
  PLAN_PRIORITIES,
  PRIORITY_INFO,
  SAVINGS_PRIORITIES,
  SAVINGS_PRIORITY_INFO,
  bestOn,
  debtHelpLinks,
  exclusionReason,
  type BucketKind,
  type CompareMetric,
  type PlanComparison,
  type PlanPoint,
  type PlanResult,
  type SavingsDestination,
} from "./allocate";
import { resolveStudentLoan } from "./allocate";
import { LUMP_SUM_SOURCES, UNDERGRAD_PLANS, planLabel } from "./lumpSumTax";
import type { RegionKey } from "./region";
import type { AllocationSettings, CountryCode, LumpSumSource, PayoffMethod, PlanPriority, SavingsPriority, TaxProfile } from "./types";
import { EmptyState, InfoHint, MoneyInput, NumberInput, PanelTitle, formatDecimal } from "./ui";

// The Allocate page: where spare money and one-off lump sums go, under the priority the user
// picks, with every strategy simulated side by side. Also the "Debt payoff plan" widget the
// Dashboard shows. All figures come from allocate.ts; this file only draws.

type Localizer = (text: string) => string;

const BUCKET_LABELS: Record<BucketKind, string> = { tax: "Tax reserve", buffer: "Cash buffer", debt: "Debts", savings: "Savings" };
const BUCKET_COLORS: Record<BucketKind, string> = { tax: "#c98500", buffer: "#1baf7a", debt: "#2f7fdd", savings: "#7a6cd6" };

function money(formatter: Intl.NumberFormat, value: number): string {
  return formatter.format(Math.round(value));
}

function describeMonths(months: number | null, beyond = "Not within 50 years"): string {
  if (months === null) return beyond;
  if (months <= 0) return "Today";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} yrs ${rest} mo` : `${years} years`;
}

function parseMoney(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function kindLabel(destination: SavingsDestination): string {
  switch (destination.kind) {
    case "goal":
      return "Goal";
    case "investment":
    case "assumed-investment":
      return "Investment";
    case "cash":
      return "Cash";
    default:
      return "Savings";
  }
}

// ─── Charts ──────────────────────────────────────────────────────────────────

// Round gridline values (1, 2, 2.5, 5 × a power of ten) with about four lines up to `max`.
function niceTicks(max: number): number[] {
  if (max <= 0) return [];
  const rough = max / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((unit) => unit * magnitude).find((candidate) => candidate >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = step; value <= max + 1e-6; value += step) ticks.push(value);
  return ticks;
}

type Segment = { id: string; label: string; value: number; color: string };

function SplitBar({ segments, total, formatter, privacy, ariaLabel }: { segments: Segment[]; total: number; formatter: Intl.NumberFormat; privacy: boolean; ariaLabel: string }) {
  const visible = segments.filter((segment) => segment.value > 0.5);
  if (!visible.length || total <= 0) return null;
  return (
    <div className="splitBar" role="img" aria-label={ariaLabel}>
      <div className="splitBarTrack">
        {visible.map((segment) => (
          <span key={segment.id} className="splitBarSegment" style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }} title={`${segment.label}: ${money(formatter, segment.value)}`} />
        ))}
      </div>
      <ul className="splitBarLegend">
        {visible.map((segment) => (
          <li key={segment.id}>
            <span className="swatch small" style={{ background: segment.color }} />
            <span className="splitBarName">{segment.label}</span>
            <strong className={privacy ? "masked" : ""}>{money(formatter, segment.value)}</strong>
            <em>{formatDecimal((segment.value / total) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DebtPathChart({
  selected,
  baseline,
  formatter,
  privacy,
  selectedLabel,
  hasDebts,
}: {
  selected: PlanResult;
  baseline: PlanResult;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  selectedLabel: string;
  hasDebts: boolean;
}) {
  const width = 720;
  const height = 250;
  const padLeft = 64;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 30;
  const points = selected.points;
  const last = points.length - 1;
  const built = (point: PlanPoint) => point.savings + (point.buffer - selected.summary.bufferNow) + point.taxReserve;
  const maxValue = Math.max(1, ...points.map((point) => Math.max(point.totalDebt, built(point))), ...baseline.points.map((point) => point.totalDebt));
  const xFor = (index: number) => padLeft + (index / Math.max(1, last)) * (width - padLeft - padRight);
  const yFor = (value: number) => padTop + (1 - value / maxValue) * (height - padTop - padBottom);
  const pathOf = (series: PlanPoint[], pick: (point: PlanPoint) => number) => series.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(pick(point)).toFixed(1)}`).join(" ");
  const tickEvery = last <= 24 ? 6 : 12;
  const ticks = points.filter((point) => point.month % tickEvery === 0 || point.month === last);
  const gridValues = niceTicks(maxValue);
  const debtFree = selected.summary.debtFreeMonth;
  const areaSelected = `${pathOf(points, (point) => point.totalDebt)} L ${xFor(last).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(0).toFixed(1)} ${yFor(0).toFixed(1)} Z`;

  return (
    <div className="debtPathChart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Debt and savings over time under the chosen plan, against minimums only">
        <defs>
          <linearGradient id="debtPathFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(47, 127, 221, 0.22)" />
            <stop offset="100%" stopColor="rgba(47, 127, 221, 0.02)" />
          </linearGradient>
        </defs>
        {gridValues.map((value) => (
          <g key={value}>
            <line className="chartGrid" x1={padLeft} x2={width - padRight} y1={yFor(value)} y2={yFor(value)} />
            <text className={`chartAxisLabel ${privacy ? "masked" : ""}`} x={padLeft - 8} y={yFor(value) + 4} textAnchor="end">
              {formatter.format(Math.round(value))}
            </text>
          </g>
        ))}
        <line className="chartAxis" x1={padLeft} x2={width - padRight} y1={yFor(0)} y2={yFor(0)} />
        {hasDebts && <path d={areaSelected} fill="url(#debtPathFill)" />}
        {hasDebts && <path className="chartLine baseline" d={pathOf(baseline.points, (point) => point.totalDebt)} />}
        {hasDebts && <path className="chartLine selected" d={pathOf(points, (point) => point.totalDebt)} />}
        <path className="chartLine savings" d={pathOf(points, built)} />
        {debtFree !== null && debtFree > 0 && debtFree <= last && (
          <g>
            <line className="chartMarker" x1={xFor(debtFree)} x2={xFor(debtFree)} y1={padTop} y2={yFor(0)} />
            <text className="chartMarkerLabel" x={xFor(debtFree)} y={padTop - 4} textAnchor={debtFree > last * 0.8 ? "end" : "middle"}>
              Debt-free
            </text>
          </g>
        )}
        {ticks.map((point) => (
          <text key={point.month} className="chartAxisLabel" x={xFor(point.month)} y={height - 8} textAnchor={point.month === 0 ? "start" : point.month === last ? "end" : "middle"}>
            {point.month === 0 ? "Now" : point.label}
          </text>
        ))}
      </svg>
      <div className="chartLegend">
        {hasDebts && (
          <span>
            <i className="legendLine selected" /> Debt · {selectedLabel}
          </span>
        )}
        {hasDebts && (
          <span>
            <i className="legendLine baseline" /> Debt · minimums only
          </span>
        )}
        <span>
          <i className="legendLine savings" /> Built up (buffer, reserve, savings)
        </span>
      </div>
    </div>
  );
}

function StrategyBars({
  results,
  metric,
  selected,
  formatter,
  privacy,
  t,
  onSelect,
}: {
  results: PlanResult[];
  metric: CompareMetric;
  selected: PlanPriority;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  t: Localizer;
  onSelect: (priority: PlanPriority) => void;
}) {
  const values = results.map((result) => metric.value(result));
  const max = Math.max(1, ...values.filter((value): value is number => value !== null));
  const best = bestOn(metric, results);
  const isMoney = metric.id === "interest" || metric.id === "payments" || metric.id === "buffer" || metric.id === "net";
  return (
    <div className="strategyBars" role="list" aria-label={`${metric.label} by strategy`}>
      {results.map((result, index) => {
        const value = values[index];
        const width = value === null ? 100 : Math.max(2, (value / max) * 100);
        return (
          <button
            type="button"
            role="listitem"
            key={result.priority}
            className={`strategyBar ${result.priority === selected ? "isSelected" : ""} ${best.has(result.priority) ? "isBest" : ""}`}
            onClick={() => onSelect(result.priority)}
            aria-label={`${t(PRIORITY_INFO[result.priority].label)}: ${value === null ? "not reached" : isMoney ? money(formatter, value) : describeMonths(value)}`}
          >
            <span className="strategyBarName">{t(PRIORITY_INFO[result.priority].label)}</span>
            <span className="strategyBarTrack">
              <i className={value === null ? "isNull" : ""} style={{ width: `${width}%` }} />
            </span>
            <strong className={isMoney && privacy ? "masked" : ""}>{value === null ? "—" : isMoney ? money(formatter, value) : describeMonths(value)}</strong>
          </button>
        );
      })}
    </div>
  );
}

function Sparkline({ selected, baseline }: { selected: PlanPoint[]; baseline: PlanPoint[] }) {
  const width = 240;
  const height = 56;
  const max = Math.max(1, ...selected.map((point) => point.totalDebt), ...baseline.map((point) => point.totalDebt));
  const last = Math.max(1, selected.length - 1);
  const path = (series: PlanPoint[]) => series.map((point, index) => `${index === 0 ? "M" : "L"} ${((index / last) * width).toFixed(1)} ${(4 + (1 - point.totalDebt / max) * (height - 8)).toFixed(1)}`).join(" ");
  return (
    <svg className="payoffSparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Debt balance over time, plan against minimums only">
      <path className="chartLine baseline" d={path(baseline)} />
      <path className="chartLine selected" d={path(selected)} />
    </svg>
  );
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

function PriorityHint({ info, method, t }: { info: (typeof PRIORITY_INFO)[PlanPriority]; method: string; t: Localizer }) {
  return (
    <>
      <b>{t(info.label)}</b> · {t(method)}
      <br />
      {t(info.detail)}
    </>
  );
}

function PlanNote({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <p className={`allocateNote ${tone}`}>
      {tone === "warn" ? <AlertCircle size={14} /> : <Info size={14} />}
      <span>{children}</span>
    </p>
  );
}

function NextMoves({ result, lumpSum, formatter, privacy, compact }: { result: PlanResult; lumpSum: number; formatter: Intl.NumberFormat; privacy: boolean; compact?: boolean }) {
  const lines: Array<{ id: string; label: string; value: number; color: string }> = [];
  const split = lumpSum > 0 ? result.summary.lumpSumSplit : result.summary.firstMonthSplit;
  const debtShare = (debt: PlanResult["debts"][number]) => (lumpSum > 0 ? debt.lumpSumShare : debt.firstMonthExtra);
  if (split.tax > 0.5) lines.push({ id: "tax", label: "Set aside for tax", value: split.tax, color: BUCKET_COLORS.tax });
  if (split.buffer > 0.5) lines.push({ id: "buffer", label: "Into the cash buffer", value: split.buffer, color: BUCKET_COLORS.buffer });
  result.debts
    .filter((debt) => debtShare(debt) > 0.5)
    .sort((a, b) => debtShare(b) - debtShare(a))
    .forEach((debt) => lines.push({ id: debt.id, label: `${lumpSum > 0 ? "Pay off" : "Extra to"} ${debt.name}`, value: debtShare(debt), color: debt.color }));
  if (split.savings > 0.5) lines.push({ id: "savings", label: `Into ${result.destination.name}`, value: split.savings, color: BUCKET_COLORS.savings });
  if (!lines.length) return null;
  return (
    <div className="nextMoves">
      <span className="nextMovesTitle">{lumpSum > 0 ? `Today: split the ${money(formatter, lumpSum)} lump sum` : `This month: ${money(formatter, result.points[1]?.pool ?? 0)} spare`}</span>
      <ul>
        {lines.slice(0, compact ? 3 : 8).map((line) => (
          <li key={line.id}>
            <span className="swatch small" style={{ background: line.color }} />
            <span>{line.label}</span>
            <strong className={privacy ? "masked" : ""}>{money(formatter, line.value)}</strong>
          </li>
        ))}
        {compact && lines.length > 3 && <li className="nextMovesMore">+{lines.length - 3} more</li>}
      </ul>
    </div>
  );
}

// ─── The page ────────────────────────────────────────────────────────────────

export function AllocateView({
  comparison,
  settings,
  ledgerSurplus,
  monthlyExpenses,
  assumedInvestmentReturn,
  region,
  country,
  taxProfile,
  symbol,
  formatter,
  privacy,
  t,
  onChange,
  onOpenAccounts,
  onOpenGoals,
}: {
  comparison: PlanComparison;
  settings: AllocationSettings;
  // The ledger's spare-per-month figure, before any override.
  ledgerSurplus: number;
  monthlyExpenses: number;
  assumedInvestmentReturn: number;
  region: RegionKey;
  country: CountryCode;
  // Salary and student-loan plan from the tax profile: the defaults for the taxable-lump-sum questions.
  taxProfile: Pick<TaxProfile, "grossAnnualSalary" | "studentLoanPlan" | "postgradLoan">;
  symbol: string;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  t: Localizer;
  onChange: (patch: Partial<AllocationSettings>) => void;
  onOpenAccounts: () => void;
  onOpenGoals: () => void;
}) {
  const { selected, baseline, results } = comparison;
  const summary = selected.summary;
  const info = PRIORITY_INFO[settings.priority];
  const savingsInfo = SAVINGS_PRIORITY_INFO[settings.savingsPriority];
  const hasDebts = selected.debts.length > 0;
  const lumpSum = settings.lumpSum;
  const lumpTax = comparison.lumpSumTax;
  const lumpTaxSettings = settings.lumpSumTax;
  const showLumpTax = country === "GB" && lumpSum > 0;
  const taxProfileSalary = Math.max(0, taxProfile.grossAnnualSalary);
  const monthlySalary = lumpTaxSettings.monthlySalary ?? Math.round((taxProfileSalary / 12) * 100) / 100;
  const studentLoan = resolveStudentLoan(lumpTaxSettings, taxProfile);
  const lumpTaxActive = Boolean(lumpTax && lumpTax.tax > 0);
  const setStudentLoan = (patch: Partial<typeof studentLoan>) => onChange({ lumpSumTax: { ...lumpTaxSettings, studentLoan: { ...studentLoan, ...patch } } });
  const monthlyExtra = settings.monthlyExtraOverride ?? Math.max(0, ledgerSurplus);
  const overridden = settings.monthlyExtraOverride !== null;
  const nothingToAllocate = lumpSum <= 0 && monthlyExtra <= 0;
  const [compareMetric, setCompareMetric] = useState<CompareMetric["id"]>("interest");
  const metric = COMPARE_METRICS.find((item) => item.id === compareMetric) ?? COMPARE_METRICS[0];
  const monthsMetric = COMPARE_METRICS.find((item) => item.id === "debt-free") ?? COMPARE_METRICS[1];

  const interestSaved = baseline.summary.totalInterest - summary.totalInterest;
  const monthsSooner = baseline.summary.debtFreeMonth !== null && summary.debtFreeMonth !== null ? baseline.summary.debtFreeMonth - summary.debtFreeMonth : null;
  const horizonLabel = settings.horizonMonths >= 12 ? `${settings.horizonMonths / 12} year${settings.horizonMonths === 12 ? "" : "s"}` : `${settings.horizonMonths} months`;
  const builtAtHorizon = summary.endingSavings + (summary.endingBuffer - summary.bufferNow);

  const lumpSegments = useMemo<Segment[]>(() => {
    const split = summary.lumpSumSplit;
    return [
      { id: "lump-tax", label: "Tax on the lump sum", value: summary.lumpSumTaxHeld, color: "#a3660a" },
      { id: "tax", label: BUCKET_LABELS.tax, value: split.tax - summary.lumpSumTaxHeld, color: BUCKET_COLORS.tax },
      { id: "buffer", label: BUCKET_LABELS.buffer, value: split.buffer, color: BUCKET_COLORS.buffer },
      ...selected.debts.map((debt) => ({ id: debt.id, label: debt.name, value: debt.lumpSumShare, color: debt.color })),
      { id: "savings", label: selected.destination.name, value: split.savings, color: BUCKET_COLORS.savings },
    ];
  }, [summary.lumpSumSplit, summary.lumpSumTaxHeld, selected.debts, selected.destination.name]);

  const monthSegments = useMemo<Segment[]>(() => {
    const split = summary.firstMonthSplit;
    return [
      { id: "tax", label: BUCKET_LABELS.tax, value: split.tax, color: BUCKET_COLORS.tax },
      { id: "buffer", label: BUCKET_LABELS.buffer, value: split.buffer, color: BUCKET_COLORS.buffer },
      ...selected.debts.map((debt) => ({ id: debt.id, label: debt.name, value: debt.firstMonthExtra, color: debt.color })),
      { id: "savings", label: selected.destination.name, value: split.savings, color: BUCKET_COLORS.savings },
    ];
  }, [summary.firstMonthSplit, selected.debts, selected.destination.name]);
  const firstMonthPool = selected.points[1]?.pool ?? 0;

  const orderedDebts = [...selected.debts].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || b.rate - a.rate);
  const helpLinks = debtHelpLinks(region);
  const protectionNote = region === "US" ? "Cash deposits are FDIC/NCUA insured up to $250,000 per depositor, per bank." : "Cash deposits are protected by the FSCS up to £85,000 per person, per banking group.";
  const taxHint =
    region === "US"
      ? "Estimated taxes are due quarterly (April, June, September, January). Enter the amount you expect to owe and how many months until the next payment."
      : "Self Assessment: the balancing payment and first payment on account fall due on 31 January, the second on 31 July. Enter the bill you expect and how many months until it is due.";

  function selectPriority(priority: PlanPriority) {
    if (priority !== settings.priority) onChange({ priority });
  }

  return (
    <section className="viewStack allocateView" aria-label="Allocate">
      <div className="pageHeader compactHeader">
        <div>
          <h2>Allocate debt and savings</h2>
          <p className="withHint">
            {t("Split spare cash and one-off lump sums between debts, a cash buffer, a tax bill and savings, and compare the well-known payoff strategies.")}
            <InfoHint
              label="About these figures"
              text={t(
                "Illustrations worked out from the figures you enter and standard assumptions: rates stay as they are, payments are made on time, minimums stay at today's amount and nothing new is borrowed. Not financial advice — you choose the priority; the numbers show what each approach would mean.",
              )}
            />
          </p>
        </div>
        <div className="pageHeaderSide">
          <div className="tabs compactTabs" role="tablist" aria-label="Plan horizon">
            {ALLOCATION_HORIZONS.map((months) => (
              <button key={months} type="button" role="tab" aria-selected={settings.horizonMonths === months} className={settings.horizonMonths === months ? "selected" : ""} onClick={() => onChange({ horizonMonths: months })}>
                {months >= 12 ? `${months / 12} yr` : `${months} mo`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="allocateGrid">
        {/* ── Inputs ── */}
        <aside className="allocateInputs">
          <article className="miniPanel allocatePanel">
            <PanelTitle title="Money to allocate" icon={<Coins size={16} />} />
            <div className="planGrid allocateFields">
              <label className="planField wide">
                <span className="fieldLabel">
                  Spare each month
                  <InfoHint label="Spare each month help" text={t("What your ledger says is left each month after bills, minimum debt payments and the savings contributions already set on your accounts. Type a different figure to plan with, or reset to follow the ledger.")} />
                </span>
                <MoneyInput
                  ariaLabel="Spare each month"
                  symbol={symbol}
                  value={monthlyExtra ? String(Math.round(monthlyExtra * 100) / 100) : ""}
                  placeholder="0"
                  privacy={privacy}
                  onChange={(raw) => onChange({ monthlyExtraOverride: parseMoney(raw) })}
                />
                <small className="allocateFieldHint">
                  {overridden ? (
                    <>
                      Overridden ·{" "}
                      <button className="inlineLinkBtn" type="button" onClick={() => onChange({ monthlyExtraOverride: null })}>
                        <RefreshCw size={11} /> reset to ledger ({money(formatter, Math.max(0, ledgerSurplus))})
                      </button>
                    </>
                  ) : ledgerSurplus > 0 ? (
                    "From your ledger's recurring surplus."
                  ) : (
                    "Your ledger shows nothing spare this month. Type an amount to plan with."
                  )}
                </small>
              </label>
              <label className="planField wide">
                <span className="fieldLabel">
                  One-off lump sum
                  <InfoHint label="Lump sum help" text="A bonus, tax refund, gift, inheritance or sale proceeds — money arriving once. The plan splits it today, before the monthly amounts start." />
                </span>
                <MoneyInput ariaLabel="One-off lump sum" symbol={symbol} value={lumpSum ? String(lumpSum) : ""} placeholder="0" privacy={privacy} onChange={(raw) => onChange({ lumpSum: parseMoney(raw) })} />
              </label>
              {showLumpTax && (
                <>
                  <label className="planCheck wide">
                    <input type="checkbox" checked={lumpTaxSettings.taxable} onChange={(event) => onChange({ lumpSumTax: { ...lumpTaxSettings, taxable: event.target.checked } })} aria-label="This lump sum is taxable" />
                    <span>
                      This lump sum is taxable
                      <InfoHint
                        label="What taxable means"
                        text={
                          <>
                            Money that arrives without tax already taken off and that HMRC counts as income or a gain. <b>Taxable:</b> freelance or side income, rental profit, interest outside an ISA, dividends, a gain on selling shares, crypto or a property that is not your home.{" "}
                            <b>Not taxable:</b> gifts, inheritances (any inheritance tax is paid by the estate), lottery or Premium Bond wins, tax refunds, a work bonus paid through PAYE (tax already taken), ISA interest, selling your main home or personal items for under £6,000. Tick it and the tax is held back from the
                            lump sum before anything is allocated.
                          </>
                        }
                      />
                    </span>
                  </label>
                  {lumpTaxSettings.taxable && (
                    <>
                      <label className="planField wide">
                        <span className="fieldLabel">
                          Where is it from?
                          <InfoHint label="Source help" text={LUMP_SUM_SOURCES.find((option) => option.value === lumpTaxSettings.source)?.hint ?? ""} />
                        </span>
                        <select value={lumpTaxSettings.source} onChange={(event) => onChange({ lumpSumTax: { ...lumpTaxSettings, source: event.target.value as LumpSumSource } })} aria-label="Source of the lump sum">
                          {LUMP_SUM_SOURCES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="planField">
                        <span className="fieldLabel">
                          Salary before tax (monthly)
                          <InfoHint label="Salary help" text="Your gross pay each month, taxed through PAYE. It sets which band the lump sum lands in. Taken from the Pay & tax page when you have set a salary there; leave it at 0 if you have none." />
                        </span>
                        <MoneyInput ariaLabel="Monthly salary before tax" symbol={symbol} value={monthlySalary ? String(monthlySalary) : ""} placeholder="0" privacy={privacy} onChange={(raw) => onChange({ lumpSumTax: { ...lumpTaxSettings, monthlySalary: parseMoney(raw) } })} />
                        {lumpTaxSettings.monthlySalary !== null && taxProfileSalary > 0 && (
                          <small className="allocateFieldHint">
                            <button className="inlineLinkBtn" type="button" onClick={() => onChange({ lumpSumTax: { ...lumpTaxSettings, monthlySalary: null } })}>
                              <RefreshCw size={11} /> use tax profile ({money(formatter, taxProfileSalary / 12)}/mo)
                            </button>
                          </small>
                        )}
                      </label>
                      <label className="planField">
                        <span className="fieldLabel">
                          Already received this tax year
                          <InfoHint label="Already received help" text="Money of this same kind you have already had since 6 April, before tax. It uses up allowances and band room first, so the lump sum may be taxed at a higher rate than it would on its own." />
                        </span>
                        <MoneyInput ariaLabel="Already received this tax year from this source" symbol={symbol} value={lumpTaxSettings.priorThisYear ? String(lumpTaxSettings.priorThisYear) : ""} placeholder="0" privacy={privacy} onChange={(raw) => onChange({ lumpSumTax: { ...lumpTaxSettings, priorThisYear: parseMoney(raw) } })} />
                      </label>
                      <label className="planCheck wide">
                        <input type="checkbox" checked={studentLoan.repaying} onChange={(event) => setStudentLoan({ repaying: event.target.checked })} aria-label="Repaying a student loan" />
                        <span>
                          Repaying a student loan
                          <InfoHint
                            label="Student loans and untaxed income"
                            text="Payroll only collects student loan repayments on your salary. Untaxed income goes on your tax return, and HMRC adds 9% (6% for a postgraduate loan) of everything above your plan's threshold to the bill. Rent, interest and dividends only count once they are over £2,000 in the year; capital gains never count. Pre-filled from Insights › Take-home estimate when a plan is set there."
                          />
                        </span>
                      </label>
                      {studentLoan.repaying && (
                        <div className="planCheckRow wide" role="group" aria-label="Student loan plans">
                          {UNDERGRAD_PLANS.map((plan) => (
                            <label className="planCheck" key={plan}>
                              <input type="checkbox" checked={studentLoan.plan === plan} onChange={(event) => setStudentLoan({ plan: event.target.checked ? plan : null })} aria-label={`Student loan ${planLabel(plan)}`} />
                              <span>{planLabel(plan)}</span>
                            </label>
                          ))}
                          <label className="planCheck">
                            <input type="checkbox" checked={studentLoan.postgrad} onChange={(event) => setStudentLoan({ postgrad: event.target.checked })} aria-label="Postgraduate loan" />
                            <span>
                              Postgraduate
                              <InfoHint label="Which plan?" text="One undergraduate plan at a time: Plan 1 (started before September 2012, or Northern Ireland), Plan 2 (England or Wales, 2012 to July 2023), Plan 4 (Scotland), Plan 5 (England from August 2023). A postgraduate loan is repaid alongside it at 6% above £21,000." />
                            </span>
                          </label>
                        </div>
                      )}
                      {lumpTax && (
                        <div className="lumpTaxResult wide" role="status">
                          <div className="lumpTaxHeadline">
                            <div>
                              <span>{lumpTax.studentLoan > 0 ? "Set aside for tax and loan" : "Set aside for tax"}</span>
                              <strong className={privacy ? "masked" : ""}>{money(formatter, lumpTax.tax)}</strong>
                              <em>
                                {formatDecimal(lumpTax.effectiveRate)}% of the lump sum{lumpTax.topRate > 0 ? ` · top rate ${formatDecimal(lumpTax.topRate)}%` : ""}
                              </em>
                            </div>
                            <div>
                              <span>Left to allocate</span>
                              <strong className={privacy ? "masked" : ""}>{money(formatter, lumpTax.net)}</strong>
                              <em>due {lumpTax.dueLabel}</em>
                            </div>
                            <InfoHint
                              label="How the tax was worked out"
                              text={
                                <>
                                  Tax year {lumpTax.yearLabel}, England, Wales and Northern Ireland rates, stacked on top of a {money(formatter, monthlySalary * 12)} salary{lumpTaxSettings.priorThisYear > 0 ? ` and ${money(formatter, lumpTaxSettings.priorThisYear)} already received from this source` : ""}. Scottish bands differ for earned income.
                                  Pension contributions, Gift Aid and the High Income Child Benefit Charge are not included.
                                  {lumpTax.notes.length > 0 && (
                                    <ul>
                                      {lumpTax.notes.map((note) => (
                                        <li key={note}>{note}</li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              }
                            />
                          </div>
                          {lumpTax.lines.length > 0 && (
                            <ul className="lumpTaxLines">
                              {lumpTax.lines.map((line) => (
                                <li key={line.label}>
                                  <span>
                                    {line.label}
                                    {line.base !== undefined && line.rate !== undefined ? <em className={privacy ? "masked" : ""}> · {money(formatter, line.base)} at {formatDecimal(line.rate)}%</em> : null}
                                  </span>
                                  <strong className={privacy ? "masked" : ""}>{money(formatter, line.amount)}</strong>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {nothingToAllocate && <PlanNote tone="warn">Nothing to allocate yet — add a lump sum or a monthly amount above. The minimums-only path still shows below.</PlanNote>}
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle title="Your priority" icon={<Target size={16} />} action={<InfoHint label={`About ${info.label}`} text={<PriorityHint info={info} method={settings.priority === "custom" ? METHOD_LABELS[settings.customMethod] : info.methodLabel} t={t} />} />} />
            <div className="priorityList" role="radiogroup" aria-label="Allocation priority">
              {PLAN_PRIORITIES.map((priority) => {
                const option = PRIORITY_INFO[priority];
                const active = priority === settings.priority;
                return (
                  <button key={priority} type="button" role="radio" aria-checked={active} className={`priorityOption ${active ? "isActive" : ""}`} onClick={() => selectPriority(priority)}>
                    <span className="priorityRadio" aria-hidden="true">
                      {active && <Check size={12} />}
                    </span>
                    <span className="priorityText">
                      <strong>{t(option.label)}</strong>
                      <em>{t(option.summary)}</em>
                    </span>
                  </button>
                );
              })}
            </div>
            {settings.priority === "custom" && (
              <div className="planGrid allocateFields customShares">
                {(["debts", "buffer", "savings"] as const).map((bucket) => (
                  <label className="planField" key={bucket}>
                    <span className="fieldLabel">{BUCKET_LABELS[bucket === "debts" ? "debt" : bucket]} %</span>
                    <NumberInput ariaLabel={`${BUCKET_LABELS[bucket === "debts" ? "debt" : bucket]} share`} value={settings.customShares[bucket]} min={0} max={100} integer onCommit={(value) => onChange({ customShares: { ...settings.customShares, [bucket]: value } })} />
                  </label>
                ))}
                <label className="planField wide">
                  <span className="fieldLabel">Debt order</span>
                  <select value={settings.customMethod} onChange={(event) => onChange({ customMethod: event.target.value as PayoffMethod })} aria-label="Debt order for the custom split">
                    {(Object.keys(METHOD_LABELS) as PayoffMethod[]).map((method) => (
                      <option key={method} value={method}>
                        {t(METHOD_LABELS[method])}
                      </option>
                    ))}
                  </select>
                </label>
                {Math.round(settings.customShares.debts + settings.customShares.buffer + settings.customShares.savings) !== 100 && (
                  <PlanNote>Shares add up to {Math.round(settings.customShares.debts + settings.customShares.buffer + settings.customShares.savings)}% — they are scaled to 100%.</PlanNote>
                )}
              </div>
            )}
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle title="Savings priority" icon={<PiggyBank size={16} />} action={<InfoHint label={`About ${savingsInfo.label}`} text={t(savingsInfo.detail)} />} />
            <div className="priorityList compact" role="radiogroup" aria-label="Savings priority">
              {SAVINGS_PRIORITIES.map((priority) => {
                const option = SAVINGS_PRIORITY_INFO[priority];
                const active = priority === settings.savingsPriority;
                return (
                  <button key={priority} type="button" role="radio" aria-checked={active} className={`priorityOption ${active ? "isActive" : ""}`} onClick={() => onChange({ savingsPriority: priority as SavingsPriority })}>
                    <span className="priorityRadio" aria-hidden="true">
                      {active && <Check size={12} />}
                    </span>
                    <span className="priorityText">
                      <strong>{t(option.label)}</strong>
                      <em>{t(option.summary)}</em>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="planGrid allocateFields">
              <label className="planField">
                <span className="fieldLabel">
                  Safe savings rate
                  <InfoHint label="Safe savings rate help" text={t("Used for a new easy-access account when none of yours beats it, for growth on the cash buffer, and as the hurdle the Balanced priority compares debts against.")} />
                </span>
                <div className="planInputRow">
                  <NumberInput ariaLabel="Assumed safe savings rate" value={settings.safeSavingsRate} min={0} max={50} onCommit={(value) => onChange({ safeSavingsRate: value })} />
                  <span className="fieldSuffix">% a year</span>
                </div>
              </label>
              <label className="planField">
                <span className="fieldLabel">
                  Assumed investment return
                  <InfoHint label="Assumed investment return help" text="Set in Settings › Preferences. Long-run global equity returns have averaged roughly 5–7% a year after inflation, but any single year can be far above or below, including losses." />
                </span>
                <div className="planInputRow">
                  <input type="text" value={formatDecimal(assumedInvestmentReturn)} readOnly aria-label="Assumed investment return" />
                  <span className="fieldSuffix">% a year</span>
                </div>
              </label>
            </div>
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle title="Targets and rules" icon={<Scale size={16} />} />
            <div className="planGrid allocateFields">
              <label className="planField">
                <span className="fieldLabel">
                  Cash buffer target
                  <InfoHint label="Cash buffer help" text={t("Months of recurring spending to hold in easy-access savings. Guidance commonly mentions three to six months; what is right depends on how steady your income is. Savings you already hold count towards it.")} />
                </span>
                <div className="planInputRow">
                  <NumberInput ariaLabel="Cash buffer target in months" value={settings.bufferMonths} min={0} max={24} onCommit={(value) => onChange({ bufferMonths: value })} />
                  <span className="fieldSuffix">months</span>
                </div>
                <small className={`allocateFieldHint ${privacy ? "masked" : ""}`}>
                  {monthlyExpenses > 0
                    ? `= ${money(formatter, settings.bufferMonths * monthlyExpenses)} · you hold ${money(formatter, summary.bufferNow)} in easy-access savings`
                    : "Add recurring expenses to the Ledger to size the buffer."}
                </small>
              </label>
              <label className="planField">
                <span className="fieldLabel">
                  {lumpTaxActive ? "Other tax bill to set aside" : "Tax bill to set aside"}
                  <InfoHint
                    label="Tax bill help"
                    text={
                      lumpTaxActive && lumpTax
                        ? `${taxHint} The ${money(formatter, lumpTax.tax)} owed on the lump sum is already held back automatically, whatever priority you pick — only enter a bill on top of that here, or it would be set aside twice.`
                        : taxHint
                    }
                  />
                </span>
                <MoneyInput ariaLabel="Tax bill to set aside" symbol={symbol} value={settings.taxReserve ? String(settings.taxReserve) : ""} placeholder="0" privacy={privacy} onChange={(raw) => onChange({ taxReserve: parseMoney(raw) })} />
              </label>
              {settings.taxReserve > 0 && (
                <label className="planField">
                  <span className="fieldLabel">Due in</span>
                  <div className="planInputRow">
                    <NumberInput ariaLabel="Tax bill due in months" value={settings.taxDueInMonths} min={0} max={60} integer onCommit={(value) => onChange({ taxDueInMonths: value })} />
                    <span className="fieldSuffix">months</span>
                  </div>
                </label>
              )}
              <label className="planCheck wide">
                <input type="checkbox" checked={settings.promoGuard} onChange={(event) => onChange({ promoGuard: event.target.checked })} aria-label="Clear 0% balances before the promo ends" />
                <span>
                  Clear 0% balances before the promo ends
                  <InfoHint label="Promo guard help" text="Whatever the ordering says, a balance on an introductory 0% rate gets enough on top of its minimum to be cleared before the standard rate kicks in." />
                </span>
              </label>
              <label className="planCheck wide">
                <input type="checkbox" checked={settings.rollover} onChange={(event) => onChange({ rollover: event.target.checked })} aria-label="Roll cleared payments into the next debt" />
                <span>
                  Roll cleared payments into the next debt
                  <InfoHint label="Rollover help" text="When a debt is cleared, keep paying its monthly amount — onto the next debt, or into savings once they are all gone — rather than absorbing it back into everyday spending." />
                </span>
              </label>
            </div>
          </article>
        </aside>

        {/* ── Results ── */}
        <div className="allocateResults">
          <article className="miniPanel allocatePanel allocateHeadline">
            <PanelTitle
              title={t(info.label)}
              icon={<TrendingDown size={16} />}
              action={<span className="priorityMethodChip">{t(settings.priority === "custom" ? METHOD_LABELS[settings.customMethod] : info.methodLabel)}</span>}
            />
            {!hasDebts && comparison.excluded.length > 0 && <PlanNote>Every debt is currently left out of the plan, so the money goes to the buffer, the tax reserve and savings. Tick a debt under "Where the money goes" to include it.</PlanNote>}
            {!hasDebts && comparison.excluded.length === 0 && (
              <PlanNote>
                No debts with a balance are tracked, so everything goes to the buffer, the tax reserve and savings.{" "}
                <button className="inlineLinkBtn" type="button" onClick={onOpenAccounts}>
                  Add a credit card or loan on Accounts <ArrowRight size={11} />
                </button>
              </PlanNote>
            )}
            <div className="allocateMetrics">
              <div>
                <span>Debt-free</span>
                <strong>{hasDebts ? (summary.debtFreeLabel ?? "Not within 50 yrs") : "No debts"}</strong>
                <em>
                  {hasDebts
                    ? monthsSooner !== null && monthsSooner > 0
                      ? `${describeMonths(monthsSooner)} sooner than minimums only`
                      : summary.debtFreeMonth !== null && baseline.summary.debtFreeMonth === null
                        ? "Minimums alone never clear it"
                        : summary.debtFreeMonth === null
                          ? "Needs more than the minimums"
                          : `Same as minimums only (${describeMonths(summary.debtFreeMonth)})`
                    : "Nothing owed"}
                </em>
              </div>
              <div>
                <span>Total interest</span>
                <strong className={privacy ? "masked" : ""}>{money(formatter, summary.totalInterest)}</strong>
                <em className={privacy ? "masked" : ""}>{hasDebts && interestSaved > 0.5 ? `${money(formatter, interestSaved)} less than minimums only` : hasDebts ? `Minimums only: ${money(formatter, baseline.summary.totalInterest)}` : "—"}</em>
              </div>
              <div>
                <span>Payments in 12 months</span>
                <strong className={privacy ? "masked" : ""}>{money(formatter, summary.paymentsAfter12)}/mo</strong>
                <em className={privacy ? "masked" : ""}>{summary.paymentsNow > 0 ? `from ${money(formatter, summary.paymentsNow)}/mo today${summary.monthsToHalvePayments !== null ? ` · halved in ${describeMonths(summary.monthsToHalvePayments).toLowerCase()}` : ""}` : "No minimum payments set"}</em>
              </div>
              <div>
                <span>{t("Card utilisation")}</span>
                <strong>{summary.utilisationNow > 0 || summary.utilisationAfter12 > 0 ? `${formatDecimal(summary.utilisationNow)}% → ${formatDecimal(summary.utilisationAfter12)}%` : "—"}</strong>
                <em>
                  {summary.utilisationNow > 0
                    ? summary.monthsToUtilisationUnder30 !== null
                      ? `every card under 30% ${summary.monthsToUtilisationUnder30 === 0 ? "already" : `in ${describeMonths(summary.monthsToUtilisationUnder30).toLowerCase()}`}${summary.monthsToUtilisationUnder10 !== null && summary.monthsToUtilisationUnder10 > 0 ? ` · under 10% in ${describeMonths(summary.monthsToUtilisationUnder10).toLowerCase()}` : ""}`
                      : "not under 30% within the horizon"
                    : "No card limits tracked"}
                </em>
              </div>
              <div>
                <span>Built up in {horizonLabel}</span>
                <strong className={privacy ? "masked" : ""}>{money(formatter, builtAtHorizon)}</strong>
                <em className={privacy ? "masked" : ""}>
                  {summary.endingBuffer - summary.bufferNow > 0.5 ? `${money(formatter, summary.endingBuffer - summary.bufferNow)} buffer · ` : ""}
                  {money(formatter, summary.endingSavings)} savings{summary.growthEarned > 0.5 ? ` · ${money(formatter, summary.growthEarned)} of it growth` : ""}
                </em>
              </div>
            </div>
            {selected.notes.map((note) => (
              <PlanNote key={note.id} tone={note.tone}>
                {t(note.text)}
              </PlanNote>
            ))}
            {settings.priority === "tax-buffer" && lumpTaxActive && lumpTax && (
              <PlanNote>
                {money(formatter, lumpTax.tax)} for the tax on the lump sum is already held back before anything is allocated.{" "}
                {settings.taxReserve > 0 ? `"Tax bill first" puts the separate ${money(formatter, settings.taxReserve)} bill under Targets and rules ahead of everything else.` : `"Tax bill first" has no separate bill to fund — add one under Targets and rules if you expect another.`}
              </PlanNote>
            )}
            {summary.taxShortfall > 0.5 && (
              <PlanNote tone="warn">
                The tax reserve falls {money(formatter, summary.taxShortfall)} short when the bill is due. Raise the monthly amount, pick "Tax bill first", or give it more months.
              </PlanNote>
            )}
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle
              title="Where the money goes"
              icon={<Coins size={16} />}
              action={
                <InfoHint
                  label="How the split works"
                  text={t(
                    "The lump sum is split today, before any interest. The monthly amount is what is spare after bills and minimum payments, which carry on underneath. As each debt clears, its payment and the spare money move down the list automatically. Tick a debt out of the plan to leave it at minimums.",
                  )}
                />
              }
            />
            {lumpSum > 0 && (
              <div className="splitBlock">
                <h4>
                  Lump sum today <small className={privacy ? "masked" : ""}>{money(formatter, lumpSum)}</small>
                </h4>
                <SplitBar segments={lumpSegments} total={lumpSum} formatter={formatter} privacy={privacy} ariaLabel="How the lump sum is split" />
              </div>
            )}
            {firstMonthPool > 0 && (
              <div className="splitBlock">
                <h4>
                  Each month, starting {selected.points[1]?.label} <small className={privacy ? "masked" : ""}>{money(formatter, firstMonthPool)}</small>
                </h4>
                <SplitBar segments={monthSegments} total={firstMonthPool} formatter={formatter} privacy={privacy} ariaLabel="How the first month's spare money is split" />
              </div>
            )}
            {nothingToAllocate && <EmptyState icon={<Coins size={18} />} title="Nothing to split yet" text="Enter a lump sum or a monthly amount and the split appears here." />}
            {(hasDebts || comparison.excluded.length > 0) && (
              <div className="payoffTableWrap">
                <table className="payoffTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Debt</th>
                      <th>Balance</th>
                      <th>{lumpSum > 0 ? "From lump sum" : "Extra this month"}</th>
                      <th>Cleared</th>
                      <th>Interest paid</th>
                      <th>In plan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedDebts.map((debt) => (
                      <tr key={debt.id} className={debt.payoffMonth === 0 ? "isCleared" : ""}>
                        <td>{debt.order ?? "—"}</td>
                        <td>
                          <span className="swatch small" style={{ background: debt.color }} />
                          <strong>{debt.name}</strong>
                          <em>
                            {formatDecimal(debt.rate)}% APR{debt.promoMonths > 0 ? ` · 0% for ${debt.promoMonths} mo` : ""}
                            {debt.minimumPayment > 0 ? ` · ${money(formatter, debt.minimumPayment)}/mo min` : ""}
                          </em>
                        </td>
                        <td className={privacy ? "masked" : ""}>{money(formatter, debt.startBalance)}</td>
                        <td className={privacy ? "masked" : ""}>{(lumpSum > 0 ? debt.lumpSumShare : debt.firstMonthExtra) > 0.5 ? money(formatter, lumpSum > 0 ? debt.lumpSumShare : debt.firstMonthExtra) : "—"}</td>
                        <td>{debt.payoffLabel ?? "Not within 50 yrs"}</td>
                        <td className={privacy ? "masked" : ""}>{money(formatter, debt.interestPaid)}</td>
                        <td>
                          <input type="checkbox" checked onChange={() => onChange({ debtIncluded: { ...settings.debtIncluded, [debt.id]: false } })} aria-label={`Include ${debt.name} in the plan`} />
                        </td>
                      </tr>
                    ))}
                    {comparison.excluded.map((debt) => (
                      <tr key={debt.id} className="isExcluded">
                        <td>—</td>
                        <td>
                          <span className="swatch small" style={{ background: debt.color }} />
                          <strong>{debt.name}</strong>
                          <em>
                            {formatDecimal(debt.rate)}% APR{debt.minimumPayment > 0 ? ` · ${money(formatter, debt.minimumPayment)}/mo carries on` : ""} · left out
                            {exclusionReason(debt, region) && <InfoHint label={`Why ${debt.name} is left out`} text={t(exclusionReason(debt, region) ?? "")} />}
                          </em>
                        </td>
                        <td className={privacy ? "masked" : ""}>{money(formatter, debt.balance)}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>
                          <input type="checkbox" checked={false} onChange={() => onChange({ debtIncluded: { ...settings.debtIncluded, [debt.id]: true } })} aria-label={`Include ${debt.name} in the plan`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle
              title="Debt and savings over time"
              icon={<TrendingDown size={16} />}
              action={
                <>
                  <span className="panelWhen">{horizonLabel}</span>
                  <InfoHint label="About this chart" text={t("Total debt under the chosen plan against paying minimums only with the spare money left idle, plus what the plan builds up: the cash buffer, any tax reserve still held, and savings (including growth at each destination's rate).")} />
                </>
              }
            />
            <DebtPathChart selected={selected} baseline={baseline} formatter={formatter} privacy={privacy} selectedLabel={t(info.label)} hasDebts={hasDebts} />
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle
              title="Compare strategies"
              icon={<Scale size={16} />}
              action={
                <InfoHint
                  label="How to read the comparison"
                  text={
                    <>
                      {t("Every priority run on the same money. Ticks mark the lowest cost, earliest date or largest amount in each column — which one matters is your call. Click a row to switch to it.")}
                      <ul>
                        {COMPARE_METRICS.map((item) => (
                          <li key={item.id}>
                            <b>{t(item.label)}</b> — {t(item.hint)}
                          </li>
                        ))}
                      </ul>
                    </>
                  }
                />
              }
            />
            <div className="payoffTableWrap">
              <table className="payoffTable compareTable">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    {COMPARE_METRICS.map((item) => (
                      <th key={item.id} title={t(item.hint)}>
                        {t(item.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="isBaseline">
                    <td>
                      <strong>Minimums only</strong>
                      <em>Spare money left idle</em>
                    </td>
                    <td className={privacy ? "masked" : ""}>{money(formatter, baseline.summary.totalInterest)}</td>
                    <td>{describeMonths(baseline.summary.debtFreeMonth, "50+ yrs")}</td>
                    <td className={privacy ? "masked" : ""}>{money(formatter, baseline.summary.paymentsAfter12)}</td>
                    <td>{baseline.summary.monthsToUtilisationUnder30 === null ? "—" : describeMonths(baseline.summary.monthsToUtilisationUnder30)}</td>
                    <td className={privacy ? "masked" : ""}>{money(formatter, baseline.summary.bufferAfter12)}</td>
                    <td className={privacy ? "masked" : ""}>{money(formatter, baseline.summary.netPosition)}</td>
                  </tr>
                  {results.map((result) => {
                    const active = result.priority === settings.priority;
                    return (
                      <tr key={result.priority} className={active ? "isSelected" : ""} onClick={() => selectPriority(result.priority)} tabIndex={0} onKeyDown={(event) => (event.key === "Enter" || event.key === " " ? (event.preventDefault(), selectPriority(result.priority)) : undefined)} aria-selected={active}>
                        <td>
                          <strong>{t(PRIORITY_INFO[result.priority].label)}</strong>
                          <em>{t(result.priority === "custom" ? METHOD_LABELS[result.method].split(" (")[0] : PRIORITY_INFO[result.priority].methodLabel)}</em>
                        </td>
                        {COMPARE_METRICS.map((item) => {
                          const value = item.value(result);
                          const best = bestOn(item, results).has(result.priority);
                          const isMoney = item.id !== "debt-free" && item.id !== "utilisation";
                          const show = value === null ? (item.id === "utilisation" && result.summary.utilisationNow <= 0 ? "—" : item.id === "debt-free" ? "50+ yrs" : "—") : isMoney ? money(formatter, value) : describeMonths(value);
                          return (
                            <td key={item.id} className={`${best ? "isBest" : ""} ${isMoney && privacy ? "masked" : ""}`}>
                              {best && <Check size={12} aria-label="Leads this column" />}
                              {show}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="strategyCharts">
              <div>
                <div className="strategyChartHead">
                  <h4>{t(metric.label)}</h4>
                  <select value={compareMetric} onChange={(event) => setCompareMetric(event.target.value as CompareMetric["id"])} aria-label="Metric to chart">
                    {COMPARE_METRICS.filter((item) => item.id !== "debt-free").map((item) => (
                      <option key={item.id} value={item.id}>
                        {t(item.label)}
                      </option>
                    ))}
                  </select>
                </div>
                <StrategyBars results={results} metric={metric} selected={settings.priority} formatter={formatter} privacy={privacy} t={t} onSelect={selectPriority} />
              </div>
              <div>
                <div className="strategyChartHead">
                  <h4>Months to debt-free</h4>
                </div>
                <StrategyBars results={results} metric={monthsMetric} selected={settings.priority} formatter={formatter} privacy={privacy} t={t} onSelect={selectPriority} />
              </div>
            </div>
          </article>

          <article className="miniPanel allocatePanel">
            <PanelTitle
              title="Where savings would go"
              icon={<Landmark size={16} />}
              action={
                <InfoHint
                  label="About these destinations"
                  text={
                    <>
                      {t(savingsInfo.summary)} {t("The first is where the plan's savings are illustrated; the rest show the ranking.")}{" "}
                      {selected.destination.kind === "investment" || selected.destination.kind === "assumed-investment"
                        ? t("Investment returns are assumed, not promised: values can fall as well as rise and you may get back less than you put in. A cash buffer first is a common way to avoid having to sell at a bad moment.")
                        : t(protectionNote)}
                    </>
                  }
                />
              }
            />
            {settings.savingsPriority === "goals-first" && selected.destinations.every((item) => item.kind !== "goal") && (
              <PlanNote>
                No unfunded goals yet —{" "}
                <button className="inlineLinkBtn" type="button" onClick={onOpenGoals}>
                  add one on Goals <ArrowRight size={11} />
                </button>
              </PlanNote>
            )}
            <ol className="destinationList">
              {selected.destinations.slice(0, 6).map((destination, index) => (
                <li key={`${destination.kind}-${destination.id ?? index}`} className={index === 0 ? "isFirst" : ""}>
                  <span className="destinationRank">{index + 1}</span>
                  <span className="swatch small" style={{ background: destination.color }} />
                  <span className="destinationName">
                    <strong>{destination.name}</strong>
                    <em>
                      {kindLabel(destination)}
                      {destination.taxTreatment === "tax-free" || destination.taxTreatment === "roth" ? " · tax-free growth" : destination.taxTreatment === "pre-tax" ? " · tax relief on the way in" : ""}
                      {destination.kind === "assumed-cash" || destination.kind === "assumed-investment" ? " · not one of your accounts" : ""}
                    </em>
                  </span>
                  <strong className="destinationRate">{formatDecimal(destination.rate)}%</strong>
                </li>
              ))}
            </ol>
            {(selected.destination.kind === "investment" || selected.destination.kind === "assumed-investment") && (
              <p className="allocateRiskLine">
                <AlertCircle size={13} /> {t("Capital at risk: investment values can fall as well as rise.")}
              </p>
            )}
          </article>

          <div className="allocateNotice" role="note">
            <div className="allocateNoticeHead">
              <ShieldCheck size={16} />
              <h4>Information, not advice</h4>
              <InfoHint
                label="What these figures can and cannot tell you"
                text={t(
                  "The Income Tracker does not give regulated financial advice and is not authorised to do so. These illustrations use the balances, rates and payments you entered, held constant, with payments made on time and no new borrowing. They cannot take account of everything — early-repayment charges, a card's minimum falling as the balance does, tax on interest, changes to your income or rates — and they do not cover priority debts such as rent, mortgage arrears, council tax, energy or court fines, which come before any of this.",
                )}
              />
            </div>
            <p>
              {t("Free, impartial debt help:")}{" "}
              {helpLinks.map((link, index) => (
                <span key={link.url}>
                  {index > 0 && " · "}
                  <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.note}>
                    {link.name} <ExternalLink size={11} />
                  </a>
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Widget ──────────────────────────────────────────────────────────────────

export function PayoffWidget({
  comparison,
  settings,
  formatter,
  privacy,
  t,
  compare = false,
  onOpen,
  onOpenAccounts,
}: {
  comparison: PlanComparison;
  settings: AllocationSettings;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  t: Localizer;
  // Wide variant (a large Dashboard widget): adds the strategy table.
  compare?: boolean;
  onOpen: () => void;
  onOpenAccounts: () => void;
}) {
  const { selected, baseline, results } = comparison;
  const summary = selected.summary;
  const hasDebts = selected.debts.length > 0;
  const info = PRIORITY_INFO[settings.priority];
  const interestSaved = baseline.summary.totalInterest - summary.totalInterest;
  const monthsSooner = baseline.summary.debtFreeMonth !== null && summary.debtFreeMonth !== null ? baseline.summary.debtFreeMonth - summary.debtFreeMonth : null;
  const pool = settings.lumpSum > 0 ? settings.lumpSum : (selected.points[1]?.pool ?? 0);

  return (
    <article className="miniPanel payoffPanel">
      <PanelTitle
        title="Debt payoff plan"
        icon={<CreditCard size={16} />}
        action={
          <>
            {hasDebts && <span className="priorityMethodChip">{t(info.label)}</span>}
            <InfoHint label="About the payoff plan" text={t("Your chosen priority on Allocate, simulated from the debts on Accounts against paying minimums only. An illustration from your figures with rates held constant, not advice.")} />
          </>
        }
      />
      {!hasDebts ? (
        <EmptyState
          icon={<Coins size={18} />}
          title="No debts to plan for"
          text={t("Add credit cards and loans on Accounts to compare payoff strategies — or open Allocate to split a lump sum between a buffer, a tax bill and savings.")}
          onAction={onOpenAccounts}
        />
      ) : (
        <>
          <div className="debtMiniGrid payoffStats">
            <div>
              <span>Debt-free</span>
              <strong>{summary.debtFreeLabel ?? "50+ yrs"}</strong>
              {monthsSooner !== null && monthsSooner > 0 && <em>{describeMonths(monthsSooner)} sooner</em>}
            </div>
            <div>
              <span>Interest saved</span>
              <strong className={privacy ? "masked" : ""}>{money(formatter, Math.max(0, interestSaved))}</strong>
              <em>vs minimums only</em>
            </div>
            <div>
              <span>Payments in 12 mo</span>
              <strong className={privacy ? "masked" : ""}>{money(formatter, summary.paymentsAfter12)}</strong>
              <em className={privacy ? "masked" : ""}>from {money(formatter, summary.paymentsNow)}</em>
            </div>
          </div>
          <Sparkline selected={selected.points} baseline={baseline.points} />
          {pool > 0 ? (
            <NextMoves result={selected} lumpSum={settings.lumpSum} formatter={formatter} privacy={privacy} compact />
          ) : (
            <p className="panelSubcopy">Nothing spare to allocate yet — add a lump sum or a monthly amount on Allocate to see the plan's next move.</p>
          )}
          {compare && (
            <div className="payoffTableWrap">
              <table className="payoffTable compareTable mini">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Debt-free</th>
                    <th>Interest</th>
                    <th>Payments in 12 mo</th>
                  </tr>
                </thead>
                <tbody>
                  {results.slice(0, 6).map((result) => (
                    <tr key={result.priority} className={result.priority === settings.priority ? "isSelected" : ""}>
                      <td>
                        <strong>{t(PRIORITY_INFO[result.priority].label)}</strong>
                      </td>
                      <td>{describeMonths(result.summary.debtFreeMonth, "50+ yrs")}</td>
                      <td className={privacy ? "masked" : ""}>{money(formatter, result.summary.totalInterest)}</td>
                      <td className={privacy ? "masked" : ""}>{money(formatter, result.summary.paymentsAfter12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <div className="buttonRow dashboardActions">
        <button className="commandButton" type="button" onClick={onOpen}>
          <Coins size={16} />
          Open Allocate
        </button>
      </div>
    </article>
  );
}
