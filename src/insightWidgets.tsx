import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Check, Clock3, Eye, EyeOff, Minus, Plus, Repeat, RotateCcw, Trash2, X } from "lucide-react";
import { clampPercent } from "./finance";
import type { InsightsModel } from "./insightsData";
import { visibleSignals } from "./insightsData";
import { MoneyFlow, type FlowVariant } from "./MoneyFlow";
import type { RecurrenceCandidate } from "./recurrence";
import type { FinancialSignal, InsightTodoItem, InsightWidgetInstance, InsightWidgetType, InsightsState } from "./types";
import { InfoHint, NetWorthChart, NetWorthHorizonTabs, ProgressRule, formatDecimal, healthTone, type NetWorthHorizon } from "./ui";

// ─── Widget plumbing ─────────────────────────────────────────────────────────

export type WidgetSize = {
  w: number;
  h: number;
  cols: number;
  width: number;
  height: number;
  // Pixels left for content once the card chrome (header, padding) is taken off.
  bodyWidth: number;
  bodyHeight: number;
};

export type WidgetTier = "xs" | "sm" | "md" | "lg";

export function tierFor(width: number): WidgetTier {
  if (width < 300) return "xs";
  if (width < 520) return "sm";
  if (width < 800) return "md";
  return "lg";
}

export type WidgetActions = {
  patchInsights: (updater: (current: InsightsState) => InsightsState) => void;
  markRecurring: (candidate: RecurrenceCandidate) => void;
  navigate: (view: "dashboard" | "ledger" | "accounts" | "goals" | "settings") => void;
  setSavingsTarget: (value: number) => void;
  toast: (message: string) => void;
};

export type WidgetContext = {
  widget: InsightWidgetInstance;
  model: InsightsModel;
  sample: boolean;
  size: WidgetSize;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  animations: boolean;
  editing: boolean;
  insights: InsightsState;
  actions: WidgetActions;
};

// Whether the real model has anything for this widget to show. Without it the card shows
// dashes and offers sample data instead of an empty chart.
export function widgetHasData(type: InsightWidgetType, model: InsightsModel): boolean {
  switch (type) {
    case "summary":
    case "moneyFlow":
    case "health":
    case "topCategories":
    case "spendingPace":
    case "annualSnapshot":
    case "savingsRate":
      return model.hasData;
    case "monthCompare":
      return model.hasData && model.previous.hasData;
    case "warnings":
      return model.hasData || model.accounts.length > 0;
    case "monthlyCashFlow":
      return model.year.some((point) => point.hasData);
    case "recurring":
      return model.recurring.length > 0;
    case "debt":
      return model.accounts.some((account) => account.accountClass === "debt");
    case "netWorth":
    case "accounts":
      return model.accounts.length > 0;
    case "goals":
      return model.goals.length > 0;
    case "upcoming":
      return model.upcoming.length > 0;
    case "calendar":
      // Any of the months the card can show: an earlier month with spending is worth seeing.
      return model.calendarMonths.some((month) => month.days.some((day) => day.count > 0));
    case "todo":
    case "notes":
      return true;
  }
}

// What an empty card says, and where the user can fix it.
export type NavView = Parameters<WidgetActions["navigate"]>[0];

export function widgetEmptyHint(type: InsightWidgetType): { text: string; view: NavView } {
  switch (type) {
    case "recurring":
      return { text: "Repeating payments appear once the same merchant shows up for three months.", view: "ledger" };
    case "debt":
      return { text: "Add a credit card, loan or overdraft to track utilisation and payments.", view: "accounts" };
    case "netWorth":
    case "accounts":
      return { text: "Add your accounts to see balances and a net worth projection.", view: "accounts" };
    case "goals":
      return { text: "Set a savings goal to see progress and a finish date here.", view: "goals" };
    case "upcoming":
      return { text: "Bills detected from your ledger and card due dates show up here.", view: "ledger" };
    case "calendar":
      return { text: "Import a statement or date your spending to fill the calendar.", view: "ledger" };
    case "monthlyCashFlow":
      return { text: "Add income and outgoings for any month of this year.", view: "ledger" };
    case "monthCompare":
      return { text: "Needs two consecutive months of spending to compare.", view: "ledger" };
    default:
      return { text: "Add income and outgoings for this month in the ledger.", view: "ledger" };
  }
}

// How many list rows of `rowPx` fit in the card body once `reservedPx` is taken.
function rowsThatFit(size: WidgetSize, rowPx: number, reservedPx = 0, minimum = 1): number {
  return Math.max(minimum, Math.floor((size.bodyHeight - reservedPx) / rowPx));
}

function Money({ value, formatter, privacy, className = "" }: { value: number; formatter: Intl.NumberFormat; privacy: boolean; className?: string }) {
  return <span className={`${className} ${privacy ? "masked" : ""}`.trim()}>{formatter.format(value)}</span>;
}

function Sparkline({ values, color, width = 96, height = 28, baseline = false }: { values: number[]; color: string; width?: number; height?: number; baseline?: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;
  const xFor = (index: number) => (index / (values.length - 1)) * (width - 4) + 2;
  const yFor = (value: number) => height - 2 - ((value - min) / range) * (height - 4);
  const line = values.map((value, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`).join(" ");
  const area = `${line} L ${xFor(values.length - 1).toFixed(1)} ${height} L ${xFor(0)} ${height} Z`;
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={color} opacity={0.14} />
      {baseline && min < 0 && <line x1={2} x2={width - 2} y1={yFor(0)} y2={yFor(0)} className="sparkZero" />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xFor(values.length - 1)} cy={yFor(values[values.length - 1])} r={2.4} fill={color} />
    </svg>
  );
}

function Delta({ current, previous, invert = false, formatter, privacy, suffix }: { current: number; previous: number; invert?: boolean; formatter?: Intl.NumberFormat; privacy?: boolean; suffix?: string }) {
  const delta = current - previous;
  if (!Number.isFinite(delta) || Math.abs(delta) < (suffix ? 0.05 : 0.5)) {
    return (
      <em className="delta flat">
        <Minus size={11} /> level
      </em>
    );
  }
  const good = invert ? delta < 0 : delta > 0;
  const text = suffix ? `${delta > 0 ? "+" : ""}${formatDecimal(delta)}${suffix}` : `${delta > 0 ? "+" : "−"}${formatter!.format(Math.abs(delta))}`;
  return (
    <em className={`delta ${good ? "good" : "bad"} ${privacy && !suffix ? "masked" : ""}`}>
      {delta > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {text}
    </em>
  );
}

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function useTip() {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (event: ReactMouseEvent, title: string, lines: string[]) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: Math.min(event.clientX - rect.left, rect.width - 190), y: event.clientY - rect.top, title, lines });
  };
  const node = tip ? (
    <div className="chartTip" style={{ left: Math.max(0, tip.x + 12), top: tip.y + 12 }}>
      <strong>{tip.title}</strong>
      {tip.lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  ) : null;
  return { shellRef, show, hide: () => setTip(null), node };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export function SummaryWidget({ model, size, formatter, privacy }: WidgetContext) {
  const { projection, previous, trend } = model;
  const columns = size.width >= 560 ? 4 : size.width >= 300 ? 2 : 1;
  // A quarter-width card lists the figures as rows; a single short row keeps the two that matter most.
  const list = columns === 1;
  const detailed = size.h >= 2 && !list;
  const tileWidth = (size.bodyWidth - (columns - 1) * 16) / columns;
  const sparkWidth = Math.max(44, Math.min(96, tileWidth - 100));
  const metrics = [
    { id: "income", label: "Total income", value: projection.monthlyIncome, tone: "green", previous: previous.projection.monthlyIncome, series: trend.map((point) => point.income), invert: false },
    { id: "expenses", label: "Total expenses", value: projection.monthlyExpenses, tone: "red", previous: previous.projection.monthlyExpenses, series: trend.map((point) => point.expenses), invert: true },
    { id: "net", label: "Net income", value: projection.monthlySurplus, tone: projection.monthlySurplus >= 0 ? "green" : "red", previous: previous.projection.monthlySurplus, series: trend.map((point) => point.surplus), invert: false },
    { id: "rate", label: "Savings rate", value: projection.savingsRate, tone: projection.savingsRate >= model.savingsTarget ? "green" : "amber", previous: previous.projection.savingsRate, series: trend.map((point) => (point.income > 0 ? (point.surplus / point.income) * 100 : 0)), invert: false, suffix: "%" },
  ] as const;
  const tone = (name: string) => (name === "green" ? "var(--mint)" : name === "red" ? "var(--red)" : "var(--amber)");

  const shown = list && size.h === 1 ? metrics.filter((metric) => metric.id === "net" || metric.id === "rate") : metrics;
  const listDeltas = list && size.h >= 2 && previous.hasData;
  return (
    <div className={`summaryGrid cols-${columns} ${detailed ? "detailed" : ""} ${list ? "list" : ""} ${listDeltas ? "withDeltas" : ""}`} aria-label="Month summary">
      {shown.map((metric) => (
        <div className={`summaryStat ${metric.tone}`} key={metric.id} data-metric={metric.id}>
          <span className="summaryLabel">{metric.label}</span>
          {listDeltas && <Delta current={metric.value} previous={metric.previous} invert={metric.invert} formatter={formatter} privacy={privacy} suffix={"suffix" in metric ? " pts" : undefined} />}
          <strong className={`summaryValue ${"suffix" in metric ? "" : privacy ? "masked" : ""}`}>
            {"suffix" in metric ? `${formatDecimal(metric.value)}${metric.suffix}` : formatter.format(metric.value)}
          </strong>
          {detailed && (
            <div className="summaryMeta">
              {previous.hasData ? (
                <Delta current={metric.value} previous={metric.previous} invert={metric.invert} formatter={formatter} privacy={privacy} suffix={"suffix" in metric ? " pts" : undefined} />
              ) : (
                <em className="delta flat">no prior month</em>
              )}
              <Sparkline values={metric.series} color={tone(metric.tone)} width={sparkWidth} baseline={metric.id === "net"} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Money flow ──────────────────────────────────────────────────────────────

export function MoneyFlowWidget({ model, widget, size, formatter, privacy, animations, sample }: WidgetContext) {
  const variant: FlowVariant = widget.variant === "particles" ? "particles" : "waterfall";
  return (
    <MoneyFlow
      flow={model.flow}
      variant={variant}
      width={Math.max(200, size.bodyWidth)}
      height={Math.max(160, size.bodyHeight)}
      formatter={formatter}
      privacy={privacy}
      animations={animations}
      sample={sample}
    />
  );
}

// ─── Health score ────────────────────────────────────────────────────────────

export function HealthWidget({ model, widget, size }: WidgetContext) {
  const { health } = model;
  const tone = health.noData ? "" : healthTone(health.score);
  const meter = widget.variant === "meter";
  const rows = size.h;
  const wide = size.width >= 520;
  const rules = [
    { label: "Cash flow", value: health.cashFlowScore },
    { label: "Debt load", value: health.debtLoadScore },
    { label: "Payments", value: health.paymentPressureScore },
    { label: "Card headroom", value: health.utilizationScore },
    { label: "Savings", value: health.savingsScore },
  ];
  const visibleRules = rows >= 3 || (rows === 2 && wide) || (rows === 1 && size.width >= 800) ? rules : rows === 2 ? rules.slice(0, 2) : [];
  const ringSize = rows === 1 ? 74 : rows === 2 ? 96 : 118;
  const ratio = clampPercent(health.score * 10) / 100;

  return (
    <div className={`healthWidget ${tone} rows-${rows} ${wide ? "wide" : ""} ${size.width >= 800 ? "xwide" : ""} ${size.width < 300 ? "narrow" : ""} ${meter ? "meter" : "ring"}`}>
      <div className="healthHeadline">
        {meter ? (
          <div className="healthMeter" role="img" aria-label={`Health score ${health.noData ? "not available" : health.score} out of 10`}>
            <div className="healthMeterTrack">
              <i style={{ width: `${ratio * 100}%` }} />
              <b style={{ left: `${ratio * 100}%` }} />
            </div>
            <div className="healthMeterScale">
              <span>0</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>
        ) : (
          <svg className="healthRing" width={ringSize} height={ringSize} viewBox="0 0 120 120" role="img" aria-label={`Health score ${health.noData ? "not available" : health.score} out of 10`}>
            <circle className="healthRingTrack" cx="60" cy="60" r="50" />
            <circle className="healthRingValue" cx="60" cy="60" r="50" style={{ strokeDasharray: `${ratio * 314.16} 314.16` }} />
          </svg>
        )}
        <div className="healthNumbers">
          <div className="scoreNumber">
            {health.noData ? "–" : formatDecimal(health.score)}
            {!health.noData && <small>/10</small>}
          </div>
          {!health.noData && <span className="scoreBadge">{health.summary}</span>}
        </div>
      </div>
      {health.noData ? (
        <span className="scoreCaption">Add data to generate a score</span>
      ) : (
        <>
          <div className="creditEstimate">
            <span>Estimated credit score</span>
            <strong>{health.estimatedCreditScore}</strong>
          </div>
          {visibleRules.length > 0 && (
            <div className="ruleList">
              {visibleRules.map((rule) => (
                <ProgressRule key={rule.label} label={rule.label} value={rule.value} target={75} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Monthly cash flow ───────────────────────────────────────────────────────

export function MonthlyCashFlowWidget({ model, widget, size, formatter, privacy }: WidgetContext) {
  const points = model.year;
  const net = widget.variant === "net";
  const { shellRef, show, hide, node } = useTip();
  const width = Math.max(200, size.bodyWidth);
  const showLegend = size.h >= 2;
  const legendHeight = showLegend ? 30 : 0;
  const height = Math.max(90, size.bodyHeight - legendHeight);
  const money = (value: number) => (privacy ? "•••" : formatter.format(value));
  const padTop = 12;
  const padBottom = 22;
  const padX = 10;
  const plotHeight = height - padTop - padBottom;
  const slot = (width - padX * 2) / 12;
  const labelEvery = slot < 30 ? 3 : slot < 46 ? 2 : 1;
  const active = points.filter((point) => point.hasData);
  const latest = active[active.length - 1];
  const selectedIndex = points.findIndex((point) => point.monthKey === model.monthKey);

  let body: ReactNode;
  if (net) {
    const values = points.map((point) => (point.hasData ? point.surplus : 0));
    const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
    const zeroY = padTop + plotHeight / 2;
    const yFor = (value: number) => zeroY - (value / maxAbs) * (plotHeight / 2);
    const xFor = (index: number) => padX + index * slot + slot / 2;
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(point.hasData ? point.surplus : 0).toFixed(1)}`).join(" ");
    body = (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Net cash flow by month">
        <line className="flowGrid" x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} />
        <path className="flowNetArea" d={`${path} L ${xFor(11)} ${zeroY} L ${xFor(0)} ${zeroY} Z`} />
        <path className="flowNetLine" d={path} />
        {points.map((point, index) => (
          <g key={point.monthKey} className={point.hasData ? "flowMonth active" : "flowMonth"} onMouseMove={point.hasData ? (event) => show(event, point.label, [`Net ${point.surplus >= 0 ? "+" : ""}${money(point.surplus)}`]) : undefined}>
            <rect className="flowHit" x={padX + index * slot} y={padTop} width={slot} height={plotHeight} />
            {point.hasData && <circle className={`flowNetDot ${point.surplus < 0 ? "negative" : ""} ${index === selectedIndex ? "selected" : ""}`} cx={xFor(index)} cy={yFor(point.surplus)} r={index === selectedIndex ? 4.5 : 3} />}
            {index % labelEvery === 0 && (
              <text x={xFor(index)} y={height - 6} textAnchor="middle" className={index === selectedIndex ? "selected" : ""}>
                {point.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    );
  } else {
    const maxUp = Math.max(...points.map((point) => point.income), 1);
    const maxDown = Math.max(...points.map((point) => point.expenses), 1);
    const scale = plotHeight / (maxUp + maxDown);
    const zeroY = padTop + maxUp * scale;
    const barWidth = Math.max(6, Math.min(26, slot * 0.52));
    let started = false;
    const netPath = points
      .map((point, index) => {
        if (!point.hasData) return "";
        const command = started ? "L" : "M";
        started = true;
        return `${command} ${(padX + index * slot + slot / 2).toFixed(1)} ${(zeroY - point.surplus * scale).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");
    body = (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Monthly income above the line, spending below, and net cash flow">
        <line className="netWorthAxis" x1={padX} x2={width - padX} y1={zeroY} y2={zeroY} />
        {points.map((point, index) => {
          const x = padX + index * slot + slot / 2;
          const incomeHeight = point.income * scale;
          const expenseHeight = point.expenses * scale;
          return (
            <g key={point.monthKey} className={`flowMonth ${point.hasData ? "active" : ""} ${index === selectedIndex ? "selected" : ""}`} onMouseMove={point.hasData ? (event) => show(event, point.label, [`Income ${money(point.income)}`, `Spending ${money(point.expenses)}`, `Net ${point.surplus >= 0 ? "+" : ""}${money(point.surplus)}`]) : undefined}>
              <rect className="flowHit" x={x - slot / 2} y={padTop} width={slot} height={plotHeight} />
              <rect className="flowBar income" x={x - barWidth / 2} y={zeroY - Math.max(point.income > 0 ? 2 : 0, incomeHeight)} width={barWidth} height={Math.max(point.income > 0 ? 2 : 0, incomeHeight)} rx="3" />
              <rect className="flowBar expense" x={x - barWidth / 2} y={zeroY + 1} width={barWidth} height={Math.max(point.expenses > 0 ? 2 : 0, expenseHeight)} rx="3" />
              {index % labelEvery === 0 && (
                <text x={x} y={height - 6} textAnchor="middle" className={index === selectedIndex ? "selected" : ""}>
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
        <path className="flowNetLine" d={netPath} />
        {points.map((point, index) => point.hasData && <circle className={`flowNetDot ${index === selectedIndex ? "selected" : ""}`} key={point.monthKey} cx={padX + index * slot + slot / 2} cy={zeroY - point.surplus * scale} r={index === selectedIndex ? 4.5 : 3} />)}
      </svg>
    );
  }

  return (
    <div className="flowComparisonChart cashFlowWidget" ref={shellRef} onMouseLeave={hide} style={{ gridTemplateRows: showLegend ? `${height}px ${legendHeight - 8}px` : `${height}px` }}>
      {body}
      {showLegend && (
        <div className="flowLegend" style={{ height: legendHeight - 8 }}>
          {!net && (
            <>
              <span>
                <i className="income" /> Income
              </span>
              <span>
                <i className="expense" /> Spending
              </span>
            </>
          )}
          <span>
            <i className="net" /> Net
          </span>
          {latest && size.width >= 420 && (
            <strong className={privacy ? "masked" : ""}>
              Latest net {latest.surplus >= 0 ? "+" : ""}
              {formatter.format(latest.surplus)}
            </strong>
          )}
        </div>
      )}
      {node}
    </div>
  );
}

// ─── Warnings ────────────────────────────────────────────────────────────────

export function WarningsWidget({ model, insights, actions, size, sample, editing }: WidgetContext) {
  const [showHidden, setShowHidden] = useState(false);
  const hidden = sample ? [] : insights.hiddenWarnings;
  const { shown, hiddenCount } = visibleSignals(model.signals, hidden);
  const hiddenSignals = model.signals.filter((signal) => hidden.includes(signal.id));
  // Short cards list titles only; the detail lives in each row's tooltip.
  const compact = size.h === 1;

  useEffect(() => {
    if (hiddenCount === 0) setShowHidden(false);
  }, [hiddenCount]);

  const dismiss = (signal: FinancialSignal) => {
    if (sample || editing) return;
    actions.patchInsights((current) => ({ ...current, hiddenWarnings: Array.from(new Set([...current.hiddenWarnings, signal.id])) }));
  };
  const restore = (ids: string[]) => {
    actions.patchInsights((current) => ({ ...current, hiddenWarnings: current.hiddenWarnings.filter((id) => !ids.includes(id)) }));
  };

  return (
    <div className={`warningsWidget ${compact ? "compact" : ""}`}>
      <div className="warningsList" role="list">
        {shown.length === 0 && (
          <div className="warningsAllHidden">
            <EyeOff size={15} />
            <span>All warnings are hidden.</span>
          </div>
        )}
        {shown.map((signal) => (
          <SignalCard key={signal.id} signal={signal} compact={compact} onDismiss={signal.tone === "good" ? undefined : () => dismiss(signal)} />
        ))}
        {showHidden &&
          hiddenSignals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} compact={compact} dimmed onRestore={() => restore([signal.id])} />
          ))}
      </div>
      {hiddenCount > 0 && (
        <div className="warningsFoot">
          <button className="linkButton" type="button" onClick={() => setShowHidden((value) => !value)}>
            {showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
            {showHidden ? "Hide dismissed warnings" : `Show hidden warnings (${hiddenCount})`}
          </button>
          {showHidden && (
            <button className="linkButton" type="button" onClick={() => restore(hiddenSignals.map((signal) => signal.id))}>
              <RotateCcw size={13} />
              Restore all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SignalCard({ signal, compact, dimmed, onDismiss, onRestore }: { signal: FinancialSignal; compact: boolean; dimmed?: boolean; onDismiss?: () => void; onRestore?: () => void }) {
  return (
    <div className={`signalCard ${signal.tone} ${dimmed ? "dimmed" : ""} ${compact ? "compact" : ""}`} role="listitem">
      <div className="signalTitle">
        <strong>{signal.title}</strong>
        <div className="signalActions">
          <InfoHint label={`${signal.title} context`} text={compact ? `${signal.summary} ${signal.detail}` : signal.detail} />
          {onDismiss && (
            <button className="signalDismiss" type="button" onClick={onDismiss} aria-label={`Dismiss ${signal.title}`} data-tip="Hide this warning">
              <X size={13} />
            </button>
          )}
          {onRestore && (
            <button className="signalDismiss" type="button" onClick={onRestore} aria-label={`Restore ${signal.title}`} data-tip="Show again">
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>
      {!compact && <span>{signal.summary}</span>}
    </div>
  );
}

// ─── Top categories ──────────────────────────────────────────────────────────

export function TopCategoriesWidget({ model, widget, size, formatter, privacy }: WidgetContext) {
  const donut = widget.variant === "donut";
  const limit = donut ? rowsThatFit(size, 24, 0, 3) : rowsThatFit(size, 36, 0, 2);
  // Spending that has not been sorted into a category still counts — as one grey row.
  const uncategorised = model.projection.unpaidTotal;
  const allRows = [
    ...model.categories,
    ...(uncategorised > 0
      ? [{ name: "Uncategorised", monthly: uncategorised, annual: uncategorised * 12, share: (uncategorised / Math.max(1, model.projection.monthlyExpenses)) * 100, color: "#8e98a9", count: model.month.expenses.filter((expense) => !expense.category.trim()).length }]
      : []),
  ].sort((a, b) => b.monthly - a.monthly);
  const rows = allRows.slice(0, limit);
  const rest = allRows.slice(limit);
  const restTotal = rest.reduce((sum, row) => sum + row.monthly, 0);
  const max = Math.max(1, ...rows.map((row) => row.monthly));
  const { shellRef, show, hide, node } = useTip();
  const total = Math.max(1, model.projection.monthlyExpenses);

  if (donut) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const slices = [...rows, ...(restTotal > 0 ? [{ name: "Other", monthly: restTotal, share: (restTotal / total) * 100, color: "#8e98a9", annual: 0, count: rest.length }] : [])];
    const diameter = Math.min(size.bodyHeight - 8, size.width < 420 ? 120 : 160);
    return (
      <div className={`categoryDonutWrap ${size.width < 420 ? "stacked" : ""}`} ref={shellRef} onMouseLeave={hide}>
        <svg className="categoryDonut" width={diameter} height={diameter} viewBox="0 0 100 100" role="img" aria-label="Spending by category">
          {slices.map((slice) => {
            const fraction = slice.monthly / total;
            const dash = `${fraction * circumference} ${circumference}`;
            const element = (
              <circle
                key={slice.name}
                className="donutSlice"
                cx="50"
                cy="50"
                r={radius}
                style={{ stroke: slice.color, strokeDasharray: dash, strokeDashoffset: -offset * circumference }}
                onMouseMove={(event) => show(event, slice.name, [`${privacy ? "•••" : formatter.format(slice.monthly)} · ${formatDecimal(slice.share)}%`])}
              />
            );
            offset += fraction;
            return element;
          })}
          <text x="50" y="47" textAnchor="middle" className="donutCentre">
            {rows.length}
          </text>
          <text x="50" y="59" textAnchor="middle" className="donutCaption">
            categories
          </text>
        </svg>
        <ul className="categoryLegend">
          {slices.slice(0, size.h === 1 ? 3 : slices.length).map((slice) => (
            <li key={slice.name}>
              <span className="swatch small" style={{ background: slice.color }} />
              <span className="legendName">{slice.name}</span>
              <strong className={privacy ? "masked" : ""}>{formatter.format(slice.monthly)}</strong>
              <em>{formatDecimal(slice.share)}%</em>
            </li>
          ))}
        </ul>
        {node}
      </div>
    );
  }

  return (
    <div className="categoryBars" ref={shellRef} onMouseLeave={hide}>
      {rows.map((row) => (
        <div className="categoryBarRow" key={row.name} onMouseMove={(event) => show(event, row.name, [`${privacy ? "•••" : formatter.format(row.monthly)} · ${formatDecimal(row.share)}%`, `${row.count} ${row.count === 1 ? "item" : "items"}`])}>
          <div className="categoryBarHead">
            <span className="swatch small" style={{ background: row.color }} />
            <span className="categoryName">{row.name}</span>
            <strong className={privacy ? "masked" : ""}>{formatter.format(row.monthly)}</strong>
            <em>{formatDecimal(row.share)}%</em>
          </div>
          <div className="categoryTrack">
            <i style={{ width: `${(row.monthly / max) * 100}%`, background: row.color }} />
          </div>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="categoryMore">
          +{rest.length} more · <Money value={restTotal} formatter={formatter} privacy={privacy} />
        </div>
      )}
      {node}
    </div>
  );
}

// ─── Recurring payments ──────────────────────────────────────────────────────

export function RecurringWidget({ model, size, formatter, privacy, actions, sample, editing }: WidgetContext) {
  const limit = size.h === 1 ? Math.max(2, Math.floor(size.bodyWidth / 150)) : rowsThatFit(size, 40, 30, 2);
  const list = model.recurring.slice(0, limit);
  const compact = size.width < 300;
  const summary = (
    <div className="recurringSummary">
      <span>
        {model.recurring.length} recurring {model.recurring.length === 1 ? "payment" : "payments"}
      </span>
      <strong>
        <Money value={model.recurringMonthlyTotal} formatter={formatter} privacy={privacy} /> <small>/ month</small>
      </strong>
    </div>
  );
  if (size.h === 1) {
    return (
      <div className="recurringWidget brief">
        {summary}
        <div className="recurringChips">
          {list.map((candidate) => (
            <span className="recurringChip" key={`${candidate.kind}:${candidate.key}`} data-tip={`${candidate.cadence} · seen ${candidate.occurrences}×`}>
              <i style={{ background: candidate.color }} />
              <span>{candidate.label}</span>
              <b className={privacy ? "masked" : ""}>{formatter.format(candidate.typicalAmount)}</b>
            </span>
          ))}
          {model.recurring.length > limit && <span className="recurringChip more">+{model.recurring.length - limit} more</span>}
        </div>
      </div>
    );
  }
  return (
    <div className="recurringWidget">
      {summary}
      <div className="recurringList">
        {list.map((candidate) => (
          <div className="subscriptionRow" key={`${candidate.kind}:${candidate.key}`}>
            <span className="swatch small" style={{ background: candidate.color }} />
            <div className="subscriptionName">
              <strong>{candidate.label}</strong>
              {!compact && (
                <em>
                  {candidate.cadence} · seen {candidate.occurrences}×{candidate.category ? ` · ${candidate.category}` : ""}
                </em>
              )}
            </div>
            <strong className={privacy ? "masked" : ""}>{formatter.format(candidate.typicalAmount)}</strong>
            {!candidate.alreadyRecurring && !compact && (
              <button className="commandButton" type="button" disabled={sample || editing} onClick={() => actions.markRecurring(candidate)}>
                <Repeat size={13} />
                Mark recurring
              </button>
            )}
          </div>
        ))}
        {model.recurring.length > limit && <div className="categoryMore">+{model.recurring.length - limit} more</div>}
      </div>
      {model.missedRecurring.length > 0 && size.h >= 2 && (
        <div className="missedRecurring" role="status">
          {model.missedRecurring.slice(0, size.h >= 3 ? 4 : 1).map((candidate) => (
            <p key={`missed-${candidate.key}`}>
              <AlertCircle size={13} />
              {candidate.label} usually lands around {candidate.nextExpected ?? candidate.lastSeen} — not seen yet this cycle.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Annual snapshot ─────────────────────────────────────────────────────────

export function AnnualSnapshotWidget({ model, size, formatter, privacy }: WidgetContext) {
  const { projection } = model;
  const columns = size.width >= 520 ? 4 : 2;
  const facts = [
    { label: "Yearly income", value: projection.annualIncome, tone: "good" },
    { label: "Yearly outgoings", value: projection.annualExpenses, tone: "bad" },
    { label: projection.annualSurplus >= 0 ? "Yearly surplus" : "Yearly shortfall", value: projection.annualSurplus, tone: projection.annualSurplus >= 0 ? "good" : "bad" },
    { label: "Savings rate", value: projection.savingsRate, tone: projection.savingsRate >= 0 ? "good" : "bad", suffix: "%" },
  ];
  const surplusSeries = model.year.map((point) => (point.hasData ? point.surplus : 0));
  // A single short row only has room for the two figures that matter most.
  const visibleFacts = size.h === 1 && columns === 2 ? facts.slice(2) : facts;
  return (
    <div className={`annualWidget cols-${columns} rows-${size.h}`}>
      <div className="annualFacts">
        {visibleFacts.map((fact) => (
          <div className={`annualFact ${fact.tone}`} key={fact.label}>
            <span>{fact.label}</span>
            <strong className={fact.suffix || !privacy ? "" : "masked"}>{fact.suffix ? `${formatDecimal(fact.value)}${fact.suffix}` : formatter.format(fact.value)}</strong>
          </div>
        ))}
      </div>
      {size.h >= 2 && (
        <div className="annualRhythm">
          <div className="annualRhythmBars" aria-label="Surplus by month">
            {model.year.map((point, index) => {
              const max = Math.max(1, ...surplusSeries.map((value) => Math.abs(value)));
              const height = point.hasData ? Math.max(6, (Math.abs(point.surplus) / max) * 100) : 4;
              return (
                <div className="annualRhythmItem" key={point.monthKey} data-tip={point.hasData ? `${point.label}: ${privacy ? "•••" : formatter.format(point.surplus)}` : `${point.label}: no data`}>
                  <div className="railTrack">
                    <span className={point.surplus >= 0 ? "positive" : "negative"} style={{ height: `${height}%`, opacity: point.hasData ? 1 : 0.25 }} />
                  </div>
                  {(size.width >= 420 || index % 2 === 0) && <small>{point.label.slice(0, 1)}</small>}
                </div>
              );
            })}
          </div>
          <small className="annualNote">
            Recurring items × 12, plus this month&rsquo;s one-offs once
            {projection.oneOffCount > 0 ? ` · ${projection.oneOffCount} one-off ${projection.oneOffCount === 1 ? "item" : "items"} not projected forward` : ""}
          </small>
        </div>
      )}
    </div>
  );
}

// ─── Savings rate ────────────────────────────────────────────────────────────

export function SavingsRateWidget({ model, size, formatter, privacy, actions, sample, editing }: WidgetContext) {
  const rate = model.projection.savingsRate;
  const gauge = clampPercent(rate);
  const target = model.savingsTarget;
  const onTarget = rate >= target;
  const rateSeries = model.trend.map((point) => (point.income > 0 ? (point.surplus / point.income) * 100 : 0));
  return (
    <div className={`savingsWidget rows-${size.h} ${onTarget ? "good" : "warn"}`}>
      {size.h === 1 ? (
        <div className="savingsCompact">
          <strong>{formatDecimal(rate)}%</strong>
          <div className="savingsBar">
            <i style={{ width: `${gauge}%` }} />
            <b style={{ left: `${clampPercent(target)}%` }} />
          </div>
          <span>target {target}%</span>
        </div>
      ) : (
        <>
          <div className="gauge" style={{ "--value": `${gauge * 3.6}deg` } as CSSProperties}>
            <div>
              <strong>{formatDecimal(rate)}%</strong>
              <span>of income</span>
            </div>
          </div>
          <label className="targetInput">
            <span>
              Target {target}% · {onTarget ? "on target" : `${formatDecimal(target - rate)} pts short`}
            </span>
            <input type="range" min="0" max="80" value={target} disabled={sample || editing} aria-label="Savings rate target" onChange={(event) => actions.setSavingsTarget(Number(event.target.value))} />
          </label>
          {size.h >= 3 && (
            <div className="savingsExtra">
              <div>
                <span>Saved per year at this rate</span>
                <strong>
                  <Money value={Math.max(0, model.projection.annualSurplus)} formatter={formatter} privacy={privacy} />
                </strong>
              </div>
              <div>
                <span>Last six months</span>
                <Sparkline values={rateSeries} color="var(--mint)" width={120} height={30} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Spending pace ───────────────────────────────────────────────────────────

export function SpendingPaceWidget({ model, size, formatter, privacy }: WidgetContext) {
  const { pace } = model;
  const spentPct = clampPercent(pace.spentShare * 100);
  const elapsedPct = clampPercent(pace.elapsedShare * 100);
  const ahead = pace.income > 0 && pace.spentShare > pace.elapsedShare + 0.05;
  const future = !pace.isLive && pace.daysElapsed === 0;
  const tone = future ? "" : pace.spentShare > 1 ? "bad" : ahead ? "warn" : "good";
  return (
    <div className={`paceWidget rows-${size.h} ${tone}`}>
      <div className="paceHead">
        <span>{future ? "Month not started" : pace.isLive ? `Day ${pace.daysElapsed} of ${pace.daysInMonth}` : "Month complete"}</span>
        <strong className={privacy ? "masked" : ""}>
          {formatter.format(pace.spent)} <small>spent</small>
        </strong>
      </div>
      <div className="paceTrack" role="img" aria-label={`Spent ${Math.round(spentPct)}% of income with ${Math.round(elapsedPct)}% of the month elapsed`}>
        <i style={{ width: `${spentPct}%` }} />
        {pace.isLive && <b style={{ left: `${elapsedPct}%` }} data-tip="Where today sits in the month" />}
      </div>
      <div className="paceScale">
        <span>{Math.round(spentPct)}% of income</span>
        <span className={privacy ? "masked" : ""}>{formatter.format(pace.income)}</span>
      </div>
      {size.h >= 2 && !future && (
        <div className="paceFacts">
          {pace.isLive ? (
            <>
              <div>
                <span>Safe to spend</span>
                <strong className={privacy ? "masked" : ""}>
                  {formatter.format(pace.safePerDay)}
                  <small>/day</small>
                </strong>
              </div>
              <div>
                <span>Projected month end</span>
                <strong className={`${pace.projectedSpend > pace.income ? "negativeText" : ""} ${privacy ? "masked" : ""}`}>{formatter.format(pace.projectedSpend)}</strong>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>Average per day</span>
                <strong className={privacy ? "masked" : ""}>{formatter.format(pace.dailyAverage)}</strong>
              </div>
              <div>
                <span>Left over</span>
                <strong className={`${pace.income - pace.spent < 0 ? "negativeText" : "positiveText"} ${privacy ? "masked" : ""}`}>{formatter.format(pace.income - pace.spent)}</strong>
              </div>
            </>
          )}
          {size.h >= 3 && (
            <div className="paceNote">
              {pace.isLive
                ? ahead
                  ? "Spending is running ahead of the calendar — the bar is further along than the month is."
                  : "Spending is keeping pace with the month."
                : "A finished month: what went out against what came in."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Credit & debt ───────────────────────────────────────────────────────────

function utilisationTone(value: number): string {
  return value >= 90 ? "bad" : value >= 50 ? "warn" : value >= 30 ? "watch" : "good";
}

export function DebtWidget({ model, size, formatter, privacy }: WidgetContext) {
  const { debtSummary, cards } = model;
  const columns = size.width >= 520 ? 4 : 2;
  const showCards = size.h >= 2 || (cards.length <= 1 && columns === 4);
  const brief = size.h === 1 && columns === 2;
  return (
    <div className={`debtWidget cols-${columns} rows-${size.h}`}>
      <div className="debtStats">
        <div>
          <span>Total debt</span>
          <strong className={privacy ? "masked" : ""}>{formatter.format(debtSummary.totalDebt)}</strong>
        </div>
        {!brief && (
          <div>
            <span>Monthly payments</span>
            <strong className={privacy ? "masked" : ""}>{formatter.format(debtSummary.monthlyMinimums)}</strong>
          </div>
        )}
        <div className={utilisationTone(debtSummary.utilization)}>
          <span>Card utilisation</span>
          <strong>{formatDecimal(debtSummary.utilization)}%</strong>
        </div>
        {!brief && (
          <div>
            <span>Weighted APR</span>
            <strong>{formatDecimal(debtSummary.weightedApr)}%</strong>
          </div>
        )}
      </div>
      <div className={`utilisationBar ${utilisationTone(debtSummary.utilization)}`} role="img" aria-label={`Overall card utilisation ${Math.round(debtSummary.utilization)}%`}>
        <i style={{ width: `${clampPercent(debtSummary.utilization)}%` }} />
        <b style={{ left: "30%" }} data-tip="30% — the level most credit scoring treats as healthy" />
      </div>
      {showCards && cards.length > 0 && (
        <div className="cardList">
          {cards.slice(0, rowsThatFit(size, size.width < 300 ? 52 : 36, columns === 4 ? 92 : 150, 1)).map((card) => (
            <div className={`cardRow ${utilisationTone(card.utilisation)} ${size.width < 300 ? "stacked" : ""}`} key={card.id}>
              <div className="cardRowHead">
                <span className="swatch small" style={{ background: card.color }} />
                <span className="cardName">{card.name}</span>
                <em>
                  {card.promoMonths > 0 ? `0% · ${card.promoMonths} mo left` : `${formatDecimal(card.rate)}% APR`} · due {card.dueDay}
                  {ordinal(card.dueDay)}
                </em>
                <strong className={privacy ? "masked" : ""}>
                  {formatter.format(card.balance)} / {formatter.format(card.limit)}
                </strong>
              </div>
              <div className="categoryTrack">
                <i style={{ width: `${clampPercent(card.utilisation)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {cards.length === 0 && size.h >= 2 && <div className="categoryMore">No credit cards with a limit — loans and overdrafts are counted in total debt.</div>}
    </div>
  );
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  const mod10 = day % 10;
  return mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
}

// ─── Net worth outlook ───────────────────────────────────────────────────────

export function NetWorthWidget({ model, size, formatter, privacy }: WidgetContext) {
  const [horizon, setHorizon] = useState<NetWorthHorizon>(24);
  const points = model.netWorthOutlook[horizon];
  const last = points[points.length - 1];
  if (size.h === 1) {
    return (
      <div className="netWorthMini">
        <div>
          <span>Net worth today</span>
          <strong className={`${model.netWorth.netWorth >= 0 ? "positiveText" : "negativeText"} ${privacy ? "masked" : ""}`}>{formatter.format(model.netWorth.netWorth)}</strong>
        </div>
        <div>
          <span>In {horizon / 12} {horizon === 12 ? "year" : "years"}</span>
          <strong className={`${(last?.netWorth ?? 0) >= 0 ? "positiveText" : "negativeText"} ${privacy ? "masked" : ""}`}>{formatter.format(last?.netWorth ?? 0)}</strong>
        </div>
        <Sparkline values={points.map((point) => point.netWorth)} color={(last?.netWorth ?? 0) >= 0 ? "var(--mint)" : "var(--red)"} width={Math.min(160, size.width * 0.3)} height={34} baseline />
      </div>
    );
  }
  const showStats = size.h >= 3 || (size.h === 2 && size.width >= 800);
  const chartHeight = Math.max(80, size.bodyHeight - 44 - (showStats ? 104 : 0) - 26);
  return (
    <div className="netWorthWidget">
      <div className="chartUtilityRow">
        <NetWorthHorizonTabs horizon={horizon} onChange={setHorizon} compact />
      </div>
      <NetWorthChart points={points} formatter={formatter} privacy={privacy} compact hideStats={!showStats} width={Math.max(240, size.bodyWidth)} height={chartHeight} />
    </div>
  );
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export function GoalsWidget({ model, size, formatter, privacy }: WidgetContext) {
  const limit = rowsThatFit(size, 62, 0, 1);
  const sorted = [...model.goals].sort((a, b) => a.priority - b.priority).slice(0, limit);
  return (
    <div className="goalsWidget">
      {sorted.map((goal) => {
        const outcome = model.goalSequence.goals.find((candidate) => candidate.goalId === goal.id);
        const progress = goal.target > 0 ? clampPercent((goal.saved / goal.target) * 100) : 0;
        const status = outcome?.status ?? "no-deadline";
        return (
          <div className={`goalRow ${status}`} key={goal.id}>
            <div className="goalRowHead">
              <span className="swatch small" style={{ background: goal.color }} />
              <span className="goalRowName">{goal.name}</span>
              <strong className={privacy ? "masked" : ""}>
                {formatter.format(goal.saved)} <small>/ {formatter.format(goal.target)}</small>
              </strong>
            </div>
            <div className="categoryTrack">
              <i style={{ width: `${progress}%`, background: goal.color }} />
            </div>
            <div className="goalRowMeta">
              <span>
                {Math.round(progress)}%
                {outcome && outcome.shortfall > 0 && (
                  <>
                    {" · "}
                    <Money value={outcome.shortfall} formatter={formatter} privacy={privacy} /> to go
                  </>
                )}
              </span>
              <span className="goalEta">
                {status === "complete" ? "Complete" : outcome?.completionDate ? `Done by ${outcome.completionDate}` : "No finish date yet"}
                {status === "at-risk" && " · at risk"}
                {status === "tight" && " · tight"}
              </span>
            </div>
          </div>
        );
      })}
      {model.goals.length > limit && <div className="categoryMore">+{model.goals.length - limit} more goals</div>}
    </div>
  );
}

// ─── Versus last month ───────────────────────────────────────────────────────

export function MonthCompareWidget({ model, size, formatter, privacy }: WidgetContext) {
  const limit = rowsThatFit(size, 30, 34, 1);
  const rows = model.compare.slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.delta)));
  const totalDelta = model.projection.monthlyExpenses - model.previous.projection.monthlyExpenses;
  return (
    <div className="compareWidget">
      <div className="compareHead">
        <span>Spending vs {model.previous.label}</span>
        <Delta current={model.projection.monthlyExpenses} previous={model.previous.projection.monthlyExpenses} invert formatter={formatter} privacy={privacy} />
        <strong className={`${totalDelta > 0 ? "negativeText" : "positiveText"} ${privacy ? "masked" : ""}`}>{formatter.format(model.projection.monthlyExpenses)}</strong>
      </div>
      <div className="compareList">
        {rows.map((row) => (
          <div className="compareRow" key={row.name}>
            <span className="swatch small" style={{ background: row.color }} />
            <span className="compareName">{row.name}</span>
            <div className="compareTrack">
              <div className="compareHalf left">{row.delta < 0 && <i style={{ width: `${(Math.abs(row.delta) / max) * 100}%` }} />}</div>
              <div className="compareHalf right">{row.delta > 0 && <i style={{ width: `${(row.delta / max) * 100}%` }} />}</div>
            </div>
            <strong className={`${row.delta > 0 ? "negativeText" : row.delta < 0 ? "positiveText" : ""} ${privacy ? "masked" : ""}`}>
              {row.delta > 0 ? "+" : row.delta < 0 ? "−" : ""}
              {formatter.format(Math.abs(row.delta))}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Upcoming payments ───────────────────────────────────────────────────────

export function UpcomingWidget({ model, size, formatter, privacy }: WidgetContext) {
  const limit = rowsThatFit(size, 48, 30, 1);
  const list = model.upcoming.slice(0, limit);
  const total = model.upcoming.reduce((sum, item) => sum + item.amount, 0);
  return (
    <div className="upcomingWidget">
      <div className="recurringSummary">
        <span>Next 14 days</span>
        <strong>
          <Money value={total} formatter={formatter} privacy={privacy} />
        </strong>
      </div>
      <div className="upcomingList">
        {list.map((item) => (
          <div className={`upcomingRow ${item.daysAway <= 2 ? "soon" : ""}`} key={item.id}>
            <span className="upcomingDate">
              <b>{item.date.slice(8, 10)}</b>
              <small>{new Date(`${item.date}T00:00:00`).toLocaleString("en", { month: "short" })}</small>
            </span>
            <div className="subscriptionName">
              <strong>{item.label}</strong>
              <em>
                {item.daysAway === 0 ? "Today" : item.daysAway === 1 ? "Tomorrow" : `In ${item.daysAway} days`}
                {item.kind === "debt" ? " · card / loan" : ""}
              </em>
            </div>
            <strong className={privacy ? "masked" : ""}>{formatter.format(item.amount)}</strong>
          </div>
        ))}
        {model.upcoming.length > limit && <div className="categoryMore">+{model.upcoming.length - limit} more</div>}
      </div>
    </div>
  );
}

// ─── Spending calendar ───────────────────────────────────────────────────────

// How many months the card shows and how they tile at a given body width: side by side while each
// keeps a readable width, and four months as a 2×2 block rather than three and an orphan.
export function calendarLayout(bodyWidth: number, variant: string | undefined): { count: number; columns: number; rows: number } {
  const count = Math.min(4, Math.max(1, Math.round(Number(variant)) || 1));
  let columns = Math.min(count, Math.max(1, Math.floor((bodyWidth + CALENDAR_GAP) / (230 + CALENDAR_GAP))));
  if (count === 4 && columns === 3) columns = 2;
  return { count, columns, rows: Math.ceil(count / columns) };
}

const CALENDAR_GAP = 20;
const CALENDAR_TITLE = 24;

export function CalendarWidget(context: WidgetContext) {
  const { model, size, widget } = context;
  const { count, columns, rows } = calendarLayout(size.bodyWidth, widget.variant);
  if (count === 1) return <CalendarMonth {...context} days={model.calendar} height={size.bodyHeight} foot={size.h >= 3} />;
  const months = model.calendarMonths.slice(-count);
  // Every month gets the same number of week rows, so the day cells line up across the card.
  const weeks = Math.max(...months.map((month) => Math.ceil(((month.days[0]?.weekday ?? 0) + month.days.length) / 7)));
  const height = (size.bodyHeight - CALENDAR_GAP * (rows - 1)) / rows - CALENDAR_TITLE;
  return (
    <div className="multiMonthCalendar" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: CALENDAR_GAP }}>
      {months.map((month) => (
        <section key={month.monthKey} aria-label={month.label}>
          <h4 style={{ height: CALENDAR_TITLE }}>{month.label}</h4>
          <CalendarMonth {...context} days={month.days} height={height} weeks={weeks} foot={false} />
        </section>
      ))}
    </div>
  );
}

function CalendarMonth({ days, height, weeks, foot, formatter, privacy }: WidgetContext & { days: InsightsModel["calendar"]; height: number; weeks?: number; foot: boolean }) {
  const { shellRef, show, hide, node } = useTip();
  const leading = days[0]?.weekday ?? 0;
  const cells = [...Array.from({ length: leading }, () => null), ...days];
  const busiest = [...days].sort((a, b) => b.spent - a.spent)[0];
  const rowsNeeded = weeks ?? Math.ceil(cells.length / 7);
  const cellHeight = Math.max(16, Math.min(44, (height - (foot ? 40 : 20)) / rowsNeeded - 4));
  return (
    <div className="calendarWidget" style={{ height }} ref={shellRef} onMouseLeave={hide}>
      <div className="calendarHead">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <span key={index}>{day}</span>
        ))}
      </div>
      <div className="calendarGrid" style={{ gridAutoRows: `${cellHeight}px` }}>
        {cells.map((cell, index) =>
          cell ? (
            <div
              key={cell.date}
              className={`calendarCell ${cell.isFuture ? "future" : ""} ${cell.count ? "spent" : ""}`}
              style={{ "--heat": cell.intensity } as CSSProperties}
              onMouseMove={(event) => show(event, cell.date, cell.count ? [`${privacy ? "•••" : formatter.format(cell.spent)} across ${cell.count} ${cell.count === 1 ? "item" : "items"}`] : ["Nothing spent"])}
            >
              <span>{cell.day}</span>
            </div>
          ) : (
            <div key={`pad-${index}`} className="calendarCell pad" />
          ),
        )}
      </div>
      {foot && busiest && busiest.spent > 0 && (
        <div className="calendarFoot">
          Busiest day: <b>{busiest.date.slice(8, 10)}</b> · <Money value={busiest.spent} formatter={formatter} privacy={privacy} />
        </div>
      )}
      {node}
    </div>
  );
}

// ─── Account balances ────────────────────────────────────────────────────────

export function AccountsWidget({ model, size, formatter, privacy }: WidgetContext) {
  const limit = rowsThatFit(size, 40, 34, 1);
  const sorted = [...model.accounts].sort((a, b) => (a.accountClass === "debt" ? 1 : 0) - (b.accountClass === "debt" ? 1 : 0) || b.balance - a.balance);
  return (
    <div className="accountsWidget">
      <div className="accountsList">
        {sorted.slice(0, limit).map((account) => (
          <div className={`accountRowMini ${account.accountClass}`} key={account.id}>
            <span className="swatch small" style={{ background: account.color }} />
            <div className="subscriptionName">
              <strong>{account.name}</strong>
              <em>{account.accountClass === "debt" ? "Debt" : account.accountClass === "cash" ? "Current" : account.accountClass === "savings" ? "Savings" : "Investment"}</em>
            </div>
            <strong className={`${account.accountClass === "debt" ? "negativeText" : ""} ${privacy ? "masked" : ""}`}>
              {account.accountClass === "debt" ? "−" : ""}
              {formatter.format(account.balance)}
            </strong>
          </div>
        ))}
        {model.accounts.length > limit && <div className="categoryMore">+{model.accounts.length - limit} more</div>}
      </div>
      <div className="accountsFoot">
        <span>Net worth</span>
        <strong className={`${model.netWorth.netWorth >= 0 ? "positiveText" : "negativeText"} ${privacy ? "masked" : ""}`}>{formatter.format(model.netWorth.netWorth)}</strong>
      </div>
    </div>
  );
}

// ─── To-do list ──────────────────────────────────────────────────────────────

// How long the "Undo" popup stays up after a to-do is deleted (paused while hovered or focused).
export const TODO_UNDO_MS = 5000;

export function TodoWidget({ widget, insights, actions, editing, size }: WidgetContext) {
  const [draft, setDraft] = useState("");
  // The last deleted item and where it sat, kept only while its Undo popup is showing.
  const [removed, setRemoved] = useState<{ item: InsightTodoItem; index: number; stamp: number } | null>(null);
  const [undoPaused, setUndoPaused] = useState(false);
  const items = insights.todos[widget.id] ?? [];
  const open = items.filter((item) => !item.done).length;

  const update = (next: InsightTodoItem[]) => {
    actions.patchInsights((current) => ({ ...current, todos: { ...current.todos, [widget.id]: next } }));
  };
  // The delete saves straight away, so it syncs like any other edit; Undo puts the same item
  // (same id) back where it was, which the sync merge treats as an ordinary add.
  const remove = (item: InsightTodoItem) => {
    const index = items.findIndex((candidate) => candidate.id === item.id);
    update(items.filter((candidate) => candidate.id !== item.id));
    setUndoPaused(false);
    setRemoved({ item, index, stamp: Date.now() });
  };
  const undo = () => {
    if (!removed) return;
    const { item, index } = removed;
    actions.patchInsights((current) => {
      const list = current.todos[widget.id] ?? [];
      if (list.some((candidate) => candidate.id === item.id)) return current;
      const next = [...list];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
      return { ...current, todos: { ...current.todos, [widget.id]: next } };
    });
    setRemoved(null);
  };

  useEffect(() => {
    if (!removed || undoPaused) return;
    const timer = window.setTimeout(() => setRemoved(null), TODO_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [removed, undoPaused]);
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    update([...items, { id: `todo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`, text, done: false, createdAt: new Date().toISOString() }]);
    setDraft("");
  };

  return (
    <div className="todoWidget">
      <form
        className="todoAdd"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a money job…" aria-label="New to-do" disabled={editing} />
        <button className="iconButton" type="submit" aria-label="Add to-do" disabled={editing || !draft.trim()}>
          <Plus size={16} />
        </button>
      </form>
      <ul className="todoList">
        {items.length === 0 && <li className="todoEmpty">Nothing here yet — try “cancel unused subscription”.</li>}
        {items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button className="todoCheck" type="button" role="checkbox" aria-checked={item.done} aria-label={`${item.done ? "Reopen" : "Complete"} ${item.text}`} disabled={editing} onClick={() => update(items.map((candidate) => (candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate)))}>
              {item.done && <Check size={12} />}
            </button>
            <span>{item.text}</span>
            <button className="iconButton small" type="button" aria-label={`Delete ${item.text}`} disabled={editing} onClick={() => remove(item)}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      {size.h >= 2 && items.length > 0 && (
        <div className="todoFoot">
          {open === 0 ? "All done" : `${open} to do`} · {items.length - open} done
        </div>
      )}
      {removed &&
        createPortal(
          <div
            key={removed.stamp}
            className="undoToast"
            role="status"
            aria-live="polite"
            onMouseEnter={() => setUndoPaused(true)}
            onMouseLeave={() => setUndoPaused(false)}
            onFocus={() => setUndoPaused(true)}
            onBlur={() => setUndoPaused(false)}
          >
            <span>
              Deleted “{removed.item.text}”
            </span>
            <button className="undoToastAction" type="button" onClick={undo}>
              <RotateCcw size={13} /> Undo
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function NotesWidget({ widget, insights, actions, editing }: WidgetContext) {
  const saved = insights.notes[widget.id] ?? "";
  const [text, setText] = useState(saved);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setText(saved);
  }, [saved, widget.id]);

  const commit = (value: string) => {
    actions.patchInsights((current) => ({ ...current, notes: { ...current.notes, [widget.id]: value } }));
  };

  return (
    <div className="notesWidget">
      <textarea
        value={text}
        placeholder="Notes to self — renewal dates, things to check, what to do with the bonus…"
        aria-label="Notes"
        disabled={editing}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => commit(value), 400);
        }}
        onBlur={() => {
          if (timer.current) window.clearTimeout(timer.current);
          if (text !== saved) commit(text);
        }}
      />
      <div className="notesFoot">
        <Clock3 size={12} />
        {text === saved ? "Saved" : "Saving…"}
      </div>
    </div>
  );
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const WIDGET_COMPONENTS: Record<InsightWidgetType, (context: WidgetContext) => ReactNode> = {
  summary: SummaryWidget,
  moneyFlow: MoneyFlowWidget,
  health: HealthWidget,
  monthlyCashFlow: MonthlyCashFlowWidget,
  warnings: WarningsWidget,
  topCategories: TopCategoriesWidget,
  recurring: RecurringWidget,
  annualSnapshot: AnnualSnapshotWidget,
  savingsRate: SavingsRateWidget,
  spendingPace: SpendingPaceWidget,
  debt: DebtWidget,
  netWorth: NetWorthWidget,
  goals: GoalsWidget,
  monthCompare: MonthCompareWidget,
  upcoming: UpcomingWidget,
  calendar: CalendarWidget,
  accounts: AccountsWidget,
  todo: TodoWidget,
  notes: NotesWidget,
};

