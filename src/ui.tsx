import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from "react";
import { FINANCIAL_GLOSSARY } from "./glossary";
import { Info } from "lucide-react";
import { clampPercent, getCurrencyFormatter } from "./finance";
import type { NetWorthPoint } from "./types";

// Small presentational pieces shared by the app shell, the region-specific panels and the
// insights widgets.

export function MetricCard({
  label,
  value,
  suffix,
  tone,
  privacy,
  formatter,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone: "green" | "red" | "amber";
  privacy?: boolean;
  formatter?: Intl.NumberFormat;
}) {
  return (
    <article className={`metricCard ${tone}`}>
      <span><GlossaryTerm term={label} /></span>
      <strong className={privacy && !suffix ? "masked" : ""}>
        {suffix ? `${formatDecimal(value)}${suffix}` : <AnimatedCurrency value={value} formatter={formatter ?? getCurrencyFormatter("GBP")} />}
      </strong>
    </article>
  );
}

export function EmptyState({ icon, title, text, onAction }: { icon: ReactNode; title: string; text: string; onAction?: () => void }) {
  return (
    <div
      className={`emptyState${onAction ? " emptyState--clickable" : ""}`}
      onClick={onAction}
      role={onAction ? "button" : undefined}
      tabIndex={onAction ? 0 : undefined}
      onKeyDown={onAction ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAction(); } } : undefined}
    >
      <div className="emptyIcon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
      {onAction && <span className="emptyStateHint">Click to start adding</span>}
    </div>
  );
}

export function PanelTitle({ title, icon, action }: { title: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panelTitle">
      <h3>{title}</h3>
      <div className="panelTitleActions">
        {action}
        {icon ?? <Info size={16} />}
      </div>
    </div>
  );
}

// A list that can grow long: the first few rows, and a button for the rest.
const SHOW_MORE_PREVIEW = 3;

export function ShowMoreList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const overflow = items.length > SHOW_MORE_PREVIEW;
  return (
    <>
      <ul className="transferRuleList">{(expanded || !overflow ? items : items.slice(0, SHOW_MORE_PREVIEW)).map(renderItem)}</ul>
      {overflow && (
        <button className="linkButton" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

// The "i" that hides explanatory copy. On a desktop it opens on hover and closes when the pointer
// leaves the icon; on a touch screen a tap opens it and a tap anywhere else (or Escape) closes it.
// The bubble is rendered at the document root with fixed coordinates, so it is never clipped by a
// scrolling table or a panel, and it flips to whichever side and edge of the icon has room.
export function GlossaryTerm({ term, children }: { term: string; children?: ReactNode }) {
  const definition = FINANCIAL_GLOSSARY[term];
  return <span className="glossaryTerm">{children ?? term}{definition && <InfoHint label={`What is ${term.toLowerCase()}?`} text={definition} />}</span>;
}

export function InfoHint({ text, label = "More information" }: { text: ReactNode; label?: string }) {
  const tooltipId = useId();
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLSpanElement | null>(null);
  const visible = hovering || pinned;

  function place() {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 8;
    const next: CSSProperties = {};
    if (rect.top < 200) next.top = rect.bottom + gap;
    else next.bottom = window.innerHeight - rect.top + gap;
    const width = Math.min(320, window.innerWidth - 36);
    if (rect.left < window.innerWidth / 2) next.left = Math.min(Math.max(8, rect.left), window.innerWidth - 8 - width);
    else next.right = Math.min(Math.max(8, window.innerWidth - rect.right), window.innerWidth - 8 - width);
    setStyle(next);
  }

  useEffect(() => {
    if (!visible) return;
    const close = () => {
      setPinned(false);
      setHovering(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    const onScroll = () => {
      if (document.activeElement === ref.current) place();
      else close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [visible]);

  return (
    <span
      ref={ref}
      className={`infoHint ${visible ? "isOpen" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-expanded={visible}
      aria-describedby={visible ? tooltipId : undefined}
      onMouseEnter={() => {
        place();
        setHovering(true);
      }}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => {
        place();
        setHovering(true);
      }}
      onBlur={() => setHovering(false)}
      onClick={(event) => {
        event.stopPropagation();
        place();
        setPinned((current) => !current);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          place();
          setPinned((current) => !current);
        }
      }}
    >
      <Info size={15} aria-hidden="true" />
      {visible &&
        style &&
        createPortal(
          <span id={tooltipId} role="tooltip" className="infoHintBubble" style={style} onClick={(event) => event.stopPropagation()}>
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function ProgressRule({ label, value, target }: { label: string; value: number; target: number }) {
  const width = clampPercent(value);
  const targetPosition = clampPercent(target);
  const tone = value >= target ? "good" : value >= 40 ? "warn" : "bad";

  return (
    <div className={`progressRule ${tone}`}>
      <div>
        <span>{label}</span>
        <b>{formatDecimal(value)}%</b>
      </div>
      <div className="ruleTrack">
        <strong style={{ width: `${width}%` }} />
        <i style={{ left: `${targetPosition}%` }} />
      </div>
    </div>
  );
}

export function handleDraftEnter(event: KeyboardEvent<HTMLInputElement>, action: () => void) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  action();
}

export function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

export function focusNextFrame(ref: { current: HTMLInputElement | null }) {
  window.requestAnimationFrame(() => {
    ref.current?.focus();
    ref.current?.select();
  });
}

export function AnimatedCurrency({ value, formatter }: { value: number; formatter: Intl.NumberFormat }) {
  const displayValue = useAnimatedNumber(value);
  return <data value={String(value)} data-export-value={formatter.format(value)}>{formatter.format(displayValue)}</data>;
}

export function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const difference = value - from;
    const start = performance.now();
    const duration = 420;
    let frame = 0;

    function tick(now: number) {
      const progress = clampPercent(((now - start) / duration) * 100) / 100;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + difference * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return display;
}

// Text the user is typing stays exactly as typed while the field has focus, and follows the
// parent's value otherwise. Without this a numeric field that stores Number(value) eats the
// decimal point ("19." becomes 19 and re-renders as "19"), so decimals can't be typed by hand.
export function useDraftText(value: string) {
  const [text, setText] = useState(value);
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setText(value);
  }, [value]);
  return {
    text,
    setText,
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
      setText(value);
    },
  };
}

export function MoneyInput({
  ariaLabel,
  inputRef,
  value,
  symbol,
  placeholder,
  privacy,
  readOnly,
  onEnter,
  onChange,
}: {
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  value: string;
  symbol: string;
  placeholder?: string;
  privacy?: boolean;
  readOnly?: boolean;
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}) {
  const draft = useDraftText(value);
  return (
    <label className={privacy ? "moneyInput maskedInput" : "moneyInput"}>
      <span>{symbol}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft.text}
        placeholder={placeholder}
        readOnly={readOnly}
        onFocus={draft.onFocus}
        onBlur={draft.onBlur}
        onChange={(event) => {
          draft.setText(event.target.value);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.(event);
          }
        }}
        aria-label={ariaLabel}
      />
    </label>
  );
}

// A plain numeric input bound to a number: the parent gets a clamped number on every keystroke,
// the field keeps what was typed (see useDraftText). Empty means 0.
export function NumberInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  integer,
  ariaLabel,
  placeholder,
  className,
  disabled,
  onKeyDown,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const draft = useDraftText(String(value));
  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      className={className}
      value={draft.text}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={draft.onFocus}
      onBlur={draft.onBlur}
      onKeyDown={onKeyDown}
      onChange={(event) => {
        const raw = event.target.value;
        draft.setText(raw);
        if (raw.trim() === "" || raw.trim() === "-") {
          onCommit(Math.max(min, Math.min(max, 0)));
          return;
        }
        const parsed = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(parsed)) return;
        const clamped = Math.max(min, Math.min(max, integer ? Math.round(parsed) : parsed));
        onCommit(clamped);
      }}
    />
  );
}

export function formatDecimal(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export type NetWorthHorizon = 12 | 24 | 60;

export function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

// Same bands as the score summary in calculateHealthScore (Strong/Stable,
// Tight, At risk) so a card's accent matches the word it shows.
export function healthTone(score: number): "good" | "warn" | "bad" {
  return score >= 5.8 ? "good" : score >= 3.8 ? "warn" : "bad";
}

export function NetWorthHorizonTabs({
  horizon,
  onChange,
  compact,
}: {
  horizon: NetWorthHorizon;
  onChange: (horizon: NetWorthHorizon) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "tabs compactTabs" : "tabs"} role="tablist" aria-label="Net worth horizon">
      <button className={horizon === 12 ? "selected" : ""} type="button" onClick={() => onChange(12)}>
        1 year
      </button>
      <button className={horizon === 24 ? "selected" : ""} type="button" onClick={() => onChange(24)}>
        2 years
      </button>
      <button className={horizon === 60 ? "selected" : ""} type="button" onClick={() => onChange(60)}>
        5 years
      </button>
    </div>
  );
}

export function NetWorthChart({
  points,
  formatter,
  privacy,
  compact = false,
  hideStats = false,
  width = 720,
  height = 260,
}: {
  points: NetWorthPoint[];
  formatter: Intl.NumberFormat;
  privacy: boolean;
  compact?: boolean;
  hideStats?: boolean;
  // Drawing-space size. The insights widget passes its real pixel box so the chart fills it.
  width?: number;
  height?: number;
}) {
  const padding = 28;
  const plotTop = padding;
  const plotBottom = height - padding;
  const plotHeight = plotBottom - plotTop;
  const values = points.map((point) => point.netWorth);
  // Scale to the actual data so small movements stay visible even deep in the
  // red — never anchor the domain to zero (that flattens all-negative data
  // into a line pinned at the bottom of the plot).
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = Math.max(rawMax - rawMin, Math.max(Math.abs(rawMax), Math.abs(rawMin)) * 0.02, 1);
  const domainPad = spread * 0.12;
  const minValue = rawMin - domainPad;
  const maxValue = rawMax + domainPad;
  const range = maxValue - minValue;
  const yFor = (value: number) => plotTop + ((maxValue - value) / range) * plotHeight;
  const zeroY = yFor(0);
  const zeroVisible = zeroY >= plotTop && zeroY <= plotBottom;
  // Fraction of the plot height where the zero line sits — the stroke/fill
  // gradients flip from green to red at this offset.
  const zeroOffset = Math.min(1, Math.max(0, (zeroY - plotTop) / plotHeight));
  const areaBaselineY = Math.min(plotBottom, Math.max(plotTop, zeroY));
  const lastPoint = points[points.length - 1] ?? points[0];
  const totalInterest = points.reduce((sum, point) => sum + point.interestCharged, 0);
  const totalGrowth = points.reduce((sum, point) => sum + point.growthEarned, 0);
  const xFor = (index: number) => padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(1)} ${yFor(point.netWorth).toFixed(1)}`)
    .join(" ");
  // Shade between the line and the zero axis (or the nearest plot edge when
  // zero is out of frame) so negative territory reads as a red region.
  const areaPath = `${path} L ${width - padding} ${areaBaselineY.toFixed(1)} L ${padding} ${areaBaselineY.toFixed(1)} Z`;
  const markerPoints = points.filter((point) => point.monthIndex % 12 === 0 || point.monthIndex === points.length - 1);
  const mint = "#00dfc1";
  const red = "#ff8a7a";
  const gradientSeed = `${compact ? "c" : "f"}-${points.length}`;

  return (
    <div className={compact ? "netWorthChart compact" : "netWorthChart"}>
      {!hideStats && (
        <div className="netWorthStats">
          <div>
            <span>Ending net worth</span>
            <strong className={`${(lastPoint?.netWorth ?? 0) >= 0 ? "positiveText" : "negativeText"} ${privacy ? "masked" : ""}`}>
              {formatter.format(lastPoint?.netWorth ?? 0)}
            </strong>
          </div>
          <div>
            <span>Ending assets</span>
            <strong className={privacy ? "masked" : ""}>{formatter.format(lastPoint?.assetBalance ?? 0)}</strong>
          </div>
          <div>
            <span>Growth earned</span>
            <strong className={`positiveText ${privacy ? "masked" : ""}`}>{formatter.format(totalGrowth)}</strong>
          </div>
          <div>
            <span>Interest paid</span>
            <strong className={`${totalInterest > 0 ? "negativeText" : ""} ${privacy ? "masked" : ""}`}>{formatter.format(totalInterest)}</strong>
          </div>
        </div>
      )}
      <div className="netWorthSvgWrap">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projected net worth over selected horizon">
          <defs>
            <linearGradient id={`netWorthStroke-${gradientSeed}`} gradientUnits="userSpaceOnUse" x1="0" y1={plotTop} x2="0" y2={plotBottom}>
              <stop offset="0" stopColor={mint} />
              <stop offset={zeroOffset} stopColor={mint} />
              <stop offset={zeroOffset} stopColor={red} />
              <stop offset="1" stopColor={red} />
            </linearGradient>
            <linearGradient id={`netWorthFill-${gradientSeed}`} gradientUnits="userSpaceOnUse" x1="0" y1={plotTop} x2="0" y2={plotBottom}>
              <stop offset="0" stopColor="rgba(0, 223, 193, 0.22)" />
              <stop offset={zeroOffset} stopColor="rgba(0, 223, 193, 0.03)" />
              <stop offset={zeroOffset} stopColor="rgba(255, 138, 122, 0.05)" />
              <stop offset="1" stopColor="rgba(255, 138, 122, 0.24)" />
            </linearGradient>
          </defs>
          <line className="netWorthAxis" x1={padding} x2={width - padding} y1={plotBottom} y2={plotBottom} />
          {zeroVisible && (
            <>
              <line className="netWorthZeroAxis" x1={padding} x2={width - padding} y1={zeroY} y2={zeroY} />
              <text className="netWorthZeroLabel" x={width - padding} y={zeroY - 6} textAnchor="end">
                {formatter.format(0)}
              </text>
            </>
          )}
          <path d={areaPath} fill={`url(#netWorthFill-${gradientSeed})`} />
          <path className="netWorthLine" d={path} style={{ stroke: `url(#netWorthStroke-${gradientSeed})` }} />
          {markerPoints.map((point) => (
            <circle
              key={point.monthIndex}
              className="netWorthDot"
              cx={xFor(point.monthIndex)}
              cy={yFor(point.netWorth)}
              r="4"
              style={{ stroke: point.netWorth >= 0 ? mint : red }}
            />
          ))}
        </svg>
        <div className="netWorthLabels">
          {markerPoints.map((point) => (
            <span key={point.monthIndex}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
