import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from "react";
import { Info } from "lucide-react";
import { clampPercent, getCurrencyFormatter } from "./finance";

// Small presentational pieces shared by the app shell and the region-specific panels.

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
      <span>{label}</span>
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

// The "i" that hides explanatory copy. On a desktop it opens on hover and closes when the pointer
// leaves the icon; on a touch screen a tap opens it and a tap anywhere else (or Escape) closes it.
// The bubble is rendered at the document root with fixed coordinates, so it is never clipped by a
// scrolling table or a panel, and it flips to whichever side and edge of the icon has room.
export function InfoHint({ text, label = "More information" }: { text: ReactNode; label?: string }) {
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
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
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
          <span role="tooltip" className="infoHintBubble" style={style} onClick={(event) => event.stopPropagation()}>
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
  return <>{formatter.format(displayValue)}</>;
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
