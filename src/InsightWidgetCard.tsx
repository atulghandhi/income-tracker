import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { buildDemoLedger } from "./demoData";
import { getMonthKey, shiftMonth } from "./finance";
import { buildInsightsModel, type InsightsModel } from "./insightsData";
import { WIDGET_COMPONENTS, widgetEmptyHint, widgetHasData, type WidgetActions, type WidgetSize } from "./insightWidgets";
import { widgetInstance } from "./insightsState";
import type { InsightWidgetType, InsightsState } from "./types";
import { InfoHint } from "./ui";

// The money-flow family of Insights widgets (money flow, spending pace, savings rate, versus last
// month, upcoming payments, the spending calendar, credit & debt, to-dos and notes) draw
// themselves to the pixel box they are given. In the page grid a widget's width comes from its
// column span, so this card measures itself and hands the widget its box, with a fixed height in
// rows of the original dashboard (150px rows, 20px gaps).

const ROW_HEIGHT = 150;
const ROW_GAP = 20;
const HEADER_HEIGHT = 74;

// Pace, upcoming and the calendar are about "today", so their sample is the demo's live month;
// the rest show the demo's last complete month.
const LIVE_SAMPLE_TYPES = new Set<InsightWidgetType>(["spendingPace", "upcoming", "calendar"]);

export type InsightWidgetSpec = {
  type: InsightWidgetType;
  rows: number;
  // Rows at a given card width, for a widget whose tiles stack when it is narrow.
  rowsAt?: (width: number) => number;
  hint?: { label: string; text: string };
  variants?: Array<{ id: string; label: string }>;
};

export const INSIGHT_WIDGET_SPECS: Record<string, InsightWidgetSpec> = {
  "cash-flow": {
    type: "moneyFlow",
    rows: 3,
    hint: { label: "About the money flow", text: "Income pours in at the top and out into each category. Click a stream, bucket or the tank to see every transaction behind it." },
    variants: [
      { id: "waterfall", label: "Waterfall" },
      { id: "particles", label: "Particle stream" },
    ],
  },
  "spending-pace": {
    type: "spendingPace",
    rows: 2,
    hint: { label: "About spending pace", text: "Compares how much of the month's income has gone out with how much of the month has passed. Safe to spend is what is left, spread over the remaining days." },
  },
  "savings-rate": {
    type: "savingsRate",
    rows: 2,
    hint: { label: "About the savings rate", text: "Net income divided by income for the month. The target slider sets the rate the health score and warnings measure against." },
  },
  // Four figures and a row per card: one row at full width, taller as the tiles stack.
  "debt-overview": { type: "debt", rows: 1, rowsAt: (width) => (width >= 760 ? 1 : width >= 480 ? 2 : 3) },
  "month-compare": { type: "monthCompare", rows: 2 },
  upcoming: { type: "upcoming", rows: 2 },
  calendar: { type: "calendar", rows: 2 },
  todo: { type: "todo", rows: 2 },
  notes: { type: "notes", rows: 2 },
};

export function InsightWidgetCard({
  id,
  title,
  spec,
  model,
  insights,
  actions,
  formatter,
  privacy,
  animations,
  editing,
  onVariant,
}: {
  id: string;
  title: string;
  spec: InsightWidgetSpec;
  model: InsightsModel;
  insights: InsightsState;
  actions: WidgetActions;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  animations: boolean;
  editing: boolean;
  onVariant: (variant: string) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const widget = widgetInstance(insights, id, spec.type);
  const hasData = widgetHasData(spec.type, model);
  const showSample = !hasData && sample;
  const sampleModel = useMemo(() => {
    if (!showSample) return null;
    const today = model.today;
    const demo = buildDemoLedger({ today: new Date(`${today}T12:00:00`) });
    const current = getMonthKey(new Date(`${today}T12:00:00`));
    return buildInsightsModel(demo, LIVE_SAMPLE_TYPES.has(spec.type) ? current : shiftMonth(current, -1), { today, formatter });
  }, [showSample, model.today, spec.type, formatter]);

  const rows = width > 0 && spec.rowsAt ? spec.rowsAt(width) : spec.rows;
  const height = rows * ROW_HEIGHT + (rows - 1) * ROW_GAP;
  const narrow = width > 0 && width < 340;
  const size: WidgetSize = {
    // Width in the original dashboard's quarter-page units, so a widget picks the same layout.
    w: width >= 760 ? 4 : width >= 560 ? 3 : width >= 340 ? 2 : 1,
    h: rows,
    cols: 4,
    width,
    height,
    bodyWidth: Math.max(0, width - (narrow ? 32 : 40)),
    bodyHeight: height - (narrow ? HEADER_HEIGHT - 4 : HEADER_HEIGHT),
  };
  const Component = WIDGET_COMPONENTS[spec.type];
  const hint = widgetEmptyHint(spec.type);

  return (
    <article
      ref={ref}
      className={`insightCard inGrid ${showSample ? "sampleCard" : ""} ${narrow ? "narrow" : ""}`}
      style={{ height }}
      data-widget-type={spec.type}
      aria-label={title}
    >
      <header className="insightCardHead">
        <h3>{title}</h3>
        <div className="insightCardActions">
          {spec.variants && !editing && (
            <div className="segmented" role="radiogroup" aria-label={`${title} look`}>
              {spec.variants.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  role="radio"
                  aria-checked={(widget.variant ?? spec.variants![0].id) === variant.id}
                  className={(widget.variant ?? spec.variants![0].id) === variant.id ? "selected" : ""}
                  onClick={() => onVariant(variant.id)}
                >
                  {variant.label}
                </button>
              ))}
            </div>
          )}
          {showSample && (
            <button className="sampleBadge" type="button" onClick={() => setSample(false)} aria-label="Hide sample data">
              {narrow ? "Sample" : "Sample data"}
              <X size={11} />
            </button>
          )}
          {!hasData && !showSample && !editing && (
            <button className="quietButton sampleToggle" type="button" onClick={() => setSample(true)} aria-label="Show sample data">
              <Sparkles size={13} />
              {!narrow && <span>Show sample data</span>}
            </button>
          )}
          {!editing && spec.hint && <InfoHint label={spec.hint.label} text={spec.hint.text} />}
        </div>
      </header>
      <div className="insightCardBody">
        {width === 0 ? null : hasData || sampleModel ? (
          <Component
            widget={widget}
            model={sampleModel ?? model}
            sample={Boolean(sampleModel)}
            size={size}
            formatter={formatter}
            privacy={privacy}
            animations={animations}
            editing={editing}
            insights={insights}
            actions={actions}
          />
        ) : (
          <div className="widgetEmpty">
            <div className="widgetEmptyDashes" aria-hidden="true">
              <span>–</span>
              <span>–</span>
            </div>
            <p>
              {hint.text}{" "}
              <button className="linkButton" type="button" onClick={() => actions.navigate(hint.view)} disabled={editing}>
                Add real data
              </button>
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
