import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ArrowLeft, Droplets, Repeat } from "lucide-react";
import type { FlowModel, FlowNode } from "./insightsData";

// ─── Money flow ──────────────────────────────────────────────────────────────
//
// Two renderings of the same model. "Waterfall" pours income down from the top into a
// pool, then out through channels into category buckets, with whatever is left filling
// a savings tank. "Particles" lays the same flow sideways and sends glowing particles
// along every stream. Clicking a node slides in a layered breakdown of what is inside.

export type FlowVariant = "waterfall" | "particles";

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

type MoneyFlowProps = {
  flow: FlowModel;
  variant: FlowVariant;
  width: number;
  height: number;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  animations: boolean;
  sample?: boolean;
};

const MIN_NODE = 6;

// SVG ids cannot carry spaces or punctuation from category names.
function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function truncate(text: string, maxChars: number): string {
  if (maxChars <= 1) return "";
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

// Characters that fit in `widthPx` at roughly 11–12px Inter (semi-bold, so err wide).
function charsFor(widthPx: number, fontSize = 11.5): number {
  return Math.floor(widthPx / (fontSize * 0.6));
}

// Label centres for a column of nodes: each keeps at least `minGap` from the one above,
// and the whole column slides up if the last one would fall off the chart.
function spreadLabels(centres: number[], minGap: number, height: number): number[] {
  const out = [...centres];
  for (let index = 1; index < out.length; index += 1) {
    out[index] = Math.max(out[index], out[index - 1] + minGap);
  }
  const overflow = out.length ? out[out.length - 1] + minGap / 2 - height : 0;
  if (overflow > 0) {
    for (let index = out.length - 1; index >= 0; index -= 1) {
      const limit = index === out.length - 1 ? height - minGap / 2 : out[index + 1] - minGap;
      out[index] = Math.min(out[index], limit);
    }
  }
  return out;
}

function useTip(shellRef: React.RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<Tip>(null);
  const show = (event: ReactMouseEvent, title: string, lines: string[]) => {
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: event.clientX - rect.left, y: event.clientY - rect.top, title, lines });
  };
  return { tip, show, hide: () => setTip(null) };
}

type Band = { node: FlowNode; x0: number; x1: number };

// Lays nodes along a horizontal band, widths proportional to value.
function layoutBand(nodes: FlowNode[], total: number, start: number, width: number, gap: number, minNode = MIN_NODE): Band[] {
  const count = nodes.length;
  if (!count) return [];
  const usable = Math.max(0, width - gap * (count - 1));
  const floor = Math.min(minNode, usable / count);
  const raw = nodes.map((node) => Math.max(floor, (node.value / Math.max(total, 1)) * usable));
  const overflow = raw.reduce((sum, value) => sum + value, 0) - usable;
  // Minimum widths can push the band over; take the excess from the widest nodes.
  if (overflow > 0) {
    const flexible = raw.map((value) => value - floor);
    const flexTotal = flexible.reduce((sum, value) => sum + value, 0) || 1;
    raw.forEach((value, index) => {
      raw[index] = value - (flexible[index] / flexTotal) * overflow;
    });
  }
  let cursor = start;
  return nodes.map((node, index) => {
    const band = { node, x0: cursor, x1: cursor + raw[index] };
    cursor += raw[index] + gap;
    return band;
  });
}

// An open sine-ish ripple line: the water texture that slides down each stream.
function ripplePath(x0: number, x1: number, y: number, amplitude: number, wavelength: number): string {
  const segments = Math.max(1, Math.ceil((x1 - x0) / wavelength));
  let d = `M ${x0.toFixed(1)} ${y.toFixed(1)}`;
  for (let index = 0; index < segments; index += 1) {
    d += ` q ${(wavelength / 4).toFixed(1)} ${(-amplitude * 2).toFixed(1)} ${(wavelength / 2).toFixed(1)} 0 t ${(wavelength / 2).toFixed(1)} 0`;
  }
  return d;
}

// A vertical ribbon between two horizontal spans.
function verticalRibbon(x0: number, x1: number, yTop: number, tx0: number, tx1: number, yBottom: number): string {
  const my = (yTop + yBottom) / 2;
  return `M ${x0} ${yTop} C ${x0} ${my}, ${tx0} ${my}, ${tx0} ${yBottom} L ${tx1} ${yBottom} C ${tx1} ${my}, ${x1} ${my}, ${x1} ${yTop} Z`;
}


// A horizontal ribbon between two vertical spans.
function horizontalRibbon(x0: number, sy0: number, sy1: number, x1: number, ty0: number, ty1: number): string {
  const mx = (x0 + x1) / 2;
  return `M ${x0} ${sy0} C ${mx} ${sy0}, ${mx} ${ty0}, ${x1} ${ty0} L ${x1} ${ty1} C ${mx} ${ty1}, ${mx} ${sy1}, ${x0} ${sy1} Z`;
}

function horizontalCentre(x0: number, y0: number, x1: number, y1: number): string {
  const mx = (x0 + x1) / 2;
  return `M ${x0} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`;
}

export function MoneyFlow(props: MoneyFlowProps) {
  const { flow, variant, formatter, privacy } = props;
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { tip, show, hide } = useTip(shellRef);

  // A node that vanished (say the month changed) closes its own breakdown.
  useEffect(() => {
    if (!selected) return;
    const stillThere = [...flow.sources, ...flow.targets].some((node) => node.id === selected.id);
    if (!stillThere) setSelected(null);
  }, [flow, selected]);

  const money = (value: number) => (privacy ? "•••" : formatter.format(value));
  const percent = (value: number) => `${((value / Math.max(flow.total, 1)) * 100).toFixed(1)}%`;

  return (
    <div className={`moneyFlow ${variant}`} ref={shellRef} onMouseLeave={hide}>
      {variant === "waterfall" ? (
        <Waterfall {...props} onSelect={setSelected} showTip={show} />
      ) : (
        <Particles {...props} onSelect={setSelected} showTip={show} />
      )}
      {tip && !selected && (
        <div className="chartTip" style={{ left: Math.min(tip.x + 14, Math.max(0, props.width - 200)), top: tip.y + 14 }}>
          <strong>{tip.title}</strong>
          {tip.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
      <div className={`flowDetail ${selected ? "open" : ""}`} aria-hidden={!selected}>
        {selected && (
          <FlowBreakdown node={selected} flow={flow} money={money} percent={percent} privacy={privacy} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function FlowBreakdown({
  node,
  flow,
  money,
  percent,
  privacy,
  onClose,
}: {
  node: FlowNode;
  flow: FlowModel;
  money: (value: number) => string;
  percent: (value: number) => string;
  privacy: boolean;
  onClose: () => void;
}) {
  const isSavings = node.id === "cat-savings";
  const isShortfall = node.id === "src-shortfall";
  const max = Math.max(1, ...node.items.map((item) => item.value));
  const recurringTotal = node.items.filter((item) => item.recurring).reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="flowDetailCard" role="dialog" aria-label={`${node.label} breakdown`}>
      <div className="flowDetailHead">
        <button className="iconButton" type="button" onClick={onClose} aria-label="Back to money flow">
          <ArrowLeft size={17} />
        </button>
        <div>
          <span className="swatch small" style={{ background: node.color }} />
          <h4>{node.label}</h4>
          <em className={privacy ? "masked" : ""}>
            {money(node.value)} · {percent(node.value)} of the flow
          </em>
        </div>
      </div>
      {isSavings ? (
        <div className="flowDetailNote">
          <Droplets size={16} />
          <p>
            Income of <b className={privacy ? "masked" : ""}>{money(flow.income)}</b> minus spending of{" "}
            <b className={privacy ? "masked" : ""}>{money(flow.expenses)}</b> leaves{" "}
            <b className={privacy ? "masked" : ""}>{money(node.value)}</b> unspent — a{" "}
            {((node.value / Math.max(flow.income, 1)) * 100).toFixed(0)}% savings rate. Money not routed to an account stays in the tank.
          </p>
        </div>
      ) : isShortfall ? (
        <div className="flowDetailNote danger">
          <Droplets size={16} />
          <p>
            Spending of <b className={privacy ? "masked" : ""}>{money(flow.expenses)}</b> outran income of{" "}
            <b className={privacy ? "masked" : ""}>{money(flow.income)}</b>. The gap of{" "}
            <b className={privacy ? "masked" : ""}>{money(node.value)}</b> came from savings, credit or an overdraft.
          </p>
        </div>
      ) : (
        <>
          <ul className="flowItems">
            {node.items.map((item, index) => (
              <li key={item.id} style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}>
                <div className="flowItemLabel">
                  <span>{item.label}</span>
                  {item.recurring && <Repeat size={11} aria-label="Recurring" />}
                  {item.date && <small>{item.date.slice(8, 10)}/{item.date.slice(5, 7)}</small>}
                </div>
                <div className="flowItemBar">
                  <i style={{ width: `${(item.value / max) * 100}%`, background: node.color }} />
                </div>
                <strong className={privacy ? "masked" : ""}>{money(item.value)}</strong>
              </li>
            ))}
          </ul>
          <div className="flowDetailFoot">
            <span>
              {node.items.length} {node.items.length === 1 ? "item" : "items"}
            </span>
            {recurringTotal > 0 && (
              <span>
                Recurring <b className={privacy ? "masked" : ""}>{money(recurringTotal)}</b>
              </span>
            )}
          </div>
        </>
      )}
      {node.history && node.history.some((point) => point.value > 0) && <FlowHistory history={node.history} color={node.color} money={money} privacy={privacy} />}
    </div>
  );
}

// The selected node across recent months, with the month on screen last and highlighted.
function FlowHistory({ history, color, money, privacy }: { history: NonNullable<FlowNode["history"]>; color: string; money: (value: number) => string; privacy: boolean }) {
  const max = Math.max(1, ...history.map((point) => point.value));
  const average = history.reduce((sum, point) => sum + point.value, 0) / history.length;
  return (
    <div className="flowHistory">
      <div className="flowHistoryHead">
        <span>Last {history.length} months</span>
        <span>
          avg <b className={privacy ? "masked" : ""}>{money(average)}</b>
        </span>
      </div>
      <div className="flowHistoryBars">
        {history.map((point, index) => (
          <div className={`flowHistoryBar ${index === history.length - 1 ? "current" : ""}`} key={point.monthKey} data-tip={`${point.label}: ${money(point.value)}`}>
            <div className="flowHistoryTrack">
              <i style={{ height: `${Math.max(point.value > 0 ? 4 : 0, (point.value / max) * 100)}%`, background: color, animationDelay: `${index * 40}ms` }} />
            </div>
            <small>{point.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

type RenderProps = MoneyFlowProps & {
  onSelect: (node: FlowNode) => void;
  showTip: (event: ReactMouseEvent, title: string, lines: string[]) => void;
};

// ─── Waterfall ───────────────────────────────────────────────────────────────

function Waterfall({ flow, width, height, formatter, privacy, animations, onSelect, showTip }: RenderProps) {
  const uid = useId().replace(/:/g, "");
  const money = (value: number) => (privacy ? "•••" : formatter.format(value));
  const percent = (value: number) => `${((value / Math.max(flow.total, 1)) * 100).toFixed(0)}%`;

  // ── Shape of the page: header, funnel, channels, category boxes, leftover tank ──
  const compact = width < 440;
  const tall = height >= 300;
  const padX = 12;
  const gap = compact ? 5 : 8;
  const usable = width - padX * 2;
  const headerH = tall ? 48 : 22;
  const tankH = tall ? 72 : 48;
  const boxH = tall ? 46 : 30;
  const tankTop = height - tankH;
  const boxY = tankTop - (tall ? 16 : 9) - boxH;
  // Each income source starts as its own labelled column; the columns merge into one trunk
  // (mergeY) that fans out to the full width at the split (splitY), where spending peels off.
  const funnelTop = headerH + 16;
  const splitY = Math.round(funnelTop + (boxY - funnelTop) * 0.56);
  const mergeY = Math.round(funnelTop + (splitY - funnelTop) * 0.48);
  const topWidth = usable * (compact ? 0.84 : 0.62);
  const topX0 = padX + (usable - topWidth) / 2;
  const sourceGap = compact ? 8 : 14;

  // Savings keeps its slot in the bottom band but has no box: its channel carries on past
  // the spending boxes into the tank, like water pouring past them.
  const targets = useMemo(() => {
    const savings = flow.targets.find((node) => node.id === "cat-savings");
    const rest = flow.targets.filter((node) => node.id !== "cat-savings");
    return savings ? [...rest, savings] : rest;
  }, [flow.targets]);

  const sourceBands = layoutBand(flow.sources, flow.total, topX0, topWidth, sourceGap, compact ? 14 : 22);
  const targetBands = layoutBand(targets, flow.total, padX, usable, gap, compact ? 18 : 24);

  // Proportional, gap-free slices of a span: where streams sit once they have merged.
  const sliceAt = (nodes: FlowNode[], start: number, span: number) => {
    let cursor = start;
    return nodes.map((node) => {
      const width = (node.value / Math.max(flow.total, 1)) * span;
      const slice = { x0: cursor, x1: cursor + width };
      cursor += width;
      return slice;
    });
  };
  // The trunk: the merged income, a little narrower than the source columns, centred.
  const trunkWidth = topWidth - sourceGap * Math.max(0, flow.sources.length - 1);
  const trunkX0 = padX + (usable - trunkWidth) / 2;
  const inSlices = sliceAt(flow.sources, trunkX0, trunkWidth);
  const outSlices = sliceAt(targets, padX, usable);

  const savingsShare = flow.income > 0 ? Math.max(0, Math.min(1, flow.surplus / flow.income)) : 0;
  const savingsNode = targets.find((node) => node.id === "cat-savings");
  const savingsBand = targetBands.find((band) => band.node.id === "cat-savings");

  type Stream = { key: string; node: FlowNode | null; d: string; x0: number; x1: number; yTop: number; yBottom: number; color: string; fill: string };
  const streams: Stream[] = [
    ...sourceBands.map((band, index) => ({
      key: `in-${band.node.id}`,
      node: band.node,
      d: verticalRibbon(band.x0, band.x1, funnelTop, inSlices[index].x0, inSlices[index].x1, mergeY),
      x0: Math.min(band.x0, inSlices[index].x0),
      x1: Math.max(band.x1, inSlices[index].x1),
      yTop: funnelTop,
      yBottom: mergeY,
      color: band.node.color,
      fill: `url(#${uid}-in-${safeId(band.node.id)})`,
    })),
    // Everything coming in, as one body of water, fanning out to the full width.
    {
      key: "trunk",
      node: null,
      d: verticalRibbon(trunkX0, trunkX0 + trunkWidth, mergeY, padX, padX + usable, splitY),
      x0: padX,
      x1: padX + usable,
      yTop: mergeY,
      yBottom: splitY,
      color: "var(--blue)",
      fill: `url(#${uid}-trunk)`,
    },
    ...targetBands.map((band, index) => {
      const isSavings = band.node.id === "cat-savings";
      const bottom = isSavings ? tankTop + (tall ? 10 : 6) : boxY;
      return {
        key: `out-${band.node.id}`,
        node: band.node,
        d: verticalRibbon(outSlices[index].x0, outSlices[index].x1, splitY, band.x0, band.x1, bottom),
        x0: Math.min(band.x0, outSlices[index].x0),
        x1: Math.max(band.x1, outSlices[index].x1),
        yTop: splitY,
        yBottom: bottom,
        color: band.node.color,
        fill: `url(#${uid}-out-${safeId(band.node.id)})`,
      };
    }),
  ];

  // Ripples: lines of water sliding down inside each stream, clipped to its shape. The whole
  // set shifts by exactly one gap, so the loop is seamless.
  const rippleGap = 15;
  const rippleSets = useMemo(() => {
    if (!animations) return [];
    let seed = 9;
    const random = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed / 4294967296;
    };
    return streams.map((stream) => {
      const lines: string[] = [];
      for (let y = stream.yTop - rippleGap; y <= stream.yBottom + rippleGap; y += rippleGap) {
        const wobble = random() * 18;
        lines.push(ripplePath(stream.x0 - 30 - wobble, stream.x1 + 30, y, 1.6 + random() * 1.2, 34 + random() * 26));
      }
      return { key: stream.key, lines, duration: 1 + random() * 0.5, delay: -random() * 1.2 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations, flow, width, height]);

  const fits = (text: string, room: number, fontSize = 11.5) => text.length * fontSize * 0.58 <= room;

  return (
    <svg
      className="moneyFlowSvg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Income pouring down into spending categories, with what is left over collecting in a tank"
    >
      <defs>
        {sourceBands.map((band) => (
          <linearGradient key={band.node.id} id={`${uid}-in-${safeId(band.node.id)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: band.node.color, stopOpacity: 0.5 }} />
            <stop offset="1" style={{ stopColor: "var(--blue)", stopOpacity: 0.34 }} />
          </linearGradient>
        ))}
        <linearGradient id={`${uid}-trunk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--blue)", stopOpacity: 0.34 }} />
          <stop offset="1" style={{ stopColor: "var(--blue)", stopOpacity: 0.3 }} />
        </linearGradient>
        {targetBands.map((band) => (
          <linearGradient key={band.node.id} id={`${uid}-out-${safeId(band.node.id)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--blue)", stopOpacity: 0.3 }} />
            <stop offset="1" style={{ stopColor: band.node.color, stopOpacity: 0.52 }} />
          </linearGradient>
        ))}
        {streams.map((stream) => (
          <clipPath key={stream.key} id={`${uid}-clip-${safeId(stream.key)}`}>
            <path d={stream.d} />
          </clipPath>
        ))}
        {savingsBand && (
          <clipPath id={`${uid}-tank`}>
            <rect x={padX} y={tankTop} width={usable} height={tankH} rx={tall ? 14 : 10} />
          </clipPath>
        )}
      </defs>

      {/* Header: what comes in each month */}
      {tall ? (
        <>
          <text className="flowEyebrow" x={width / 2} y={14} textAnchor="middle">
            Comes in each month
          </text>
          <text className={`flowTotal ${privacy ? "masked" : ""}`} x={width / 2} y={40} textAnchor="middle">
            {money(flow.income)}
          </text>
        </>
      ) : (
        <text className="flowTotalInline" x={width / 2} y={14} textAnchor="middle">
          <tspan className="flowEyebrow">In this month </tspan>
          <tspan className={privacy ? "masked" : ""} dx="4">
            {money(flow.income)}
          </tspan>
        </text>
      )}

      {/* One labelled column per source */}
      {sourceBands.map((band) => {
        const columnWidth = band.x1 - band.x0;
        const room = columnWidth + sourceGap - 10;
        const withAmount = `${band.node.label}  ${money(band.node.value)}`;
        const text = fits(withAmount, room, 12) ? withAmount : fits(band.node.label, room, 12) ? band.node.label : truncate(band.node.label, charsFor(room, 12));
        // A label that would be mostly ellipsis says nothing; hovering the column names it.
        if (text.length < 5) return null;
        return (
          <text key={band.node.id} className="flowSources column" x={band.x0 + columnWidth / 2} y={funnelTop - 5} textAnchor="middle">
            {text}
          </text>
        );
      })}

      {/* The water */}
      {streams.map((stream, index) => (
        <g
          key={stream.key}
          className={stream.node ? "flowStream" : "flowStream trunk"}
          onClick={() => stream.node && onSelect(stream.node)}
          onMouseMove={(event) =>
            stream.node
              ? showTip(event, stream.node.label, [`${money(stream.node.value)} · ${percent(stream.node.value)} of the flow`])
              : showTip(event, "Everything coming in", [`${money(flow.income)} this month`])
          }
        >
          <path d={stream.d} fill={stream.fill} />
          {rippleSets[index] && (
            <g clipPath={`url(#${uid}-clip-${safeId(stream.key)})`}>
              <g className="flowRipples" style={{ animationDuration: `${rippleSets[index].duration.toFixed(2)}s`, animationDelay: `${rippleSets[index].delay.toFixed(2)}s`, ["--ripple-gap" as string]: `${rippleGap}px` }}>
                {rippleSets[index].lines.map((line, lineIndex) => (
                  <path key={lineIndex} className="flowRipple" d={line} style={{ opacity: 0.22 + (lineIndex % 3) * 0.12 }} />
                ))}
              </g>
            </g>
          )}
        </g>
      ))}

      {/* The weir: where everything coming in splits into where it goes */}
      <line className="flowSplit" x1={padX} x2={width - padX} y1={splitY} y2={splitY} />

      {/* Category boxes */}
      {targetBands.map((band) => {
        if (band.node.id === "cat-savings") return null;
        const boxWidth = band.x1 - band.x0;
        const label = band.node.label;
        const amount = money(band.node.value);
        // Wide enough for a (possibly shortened) name and the amount; otherwise the name
        // turns on its side, and the narrowest boxes rely on hover.
        const wide = boxWidth >= 58;
        const vertical = !wide && boxH >= 40 && boxWidth >= 18;
        const shown = wide ? truncate(label, charsFor(boxWidth - 10, 12.5)) : label;
        return (
          <g
            key={band.node.id}
            className="flowNodeGroup"
            onClick={() => onSelect(band.node)}
            onMouseMove={(event) => showTip(event, label, [`${amount} · ${percent(band.node.value)}`])}
          >
            <path className="flowBox" d={boxPath(band.x0, boxY, boxWidth, boxH, 10)} style={{ fill: band.node.color, stroke: band.node.color }} />
            {wide && (
              <>
                <text className="flowBoxName" x={band.x0 + boxWidth / 2} y={boxY + (tall ? 19 : 13)} textAnchor="middle">
                  {shown}
                </text>
                <text className={`flowBoxAmount ${privacy ? "masked" : ""}`} x={band.x0 + boxWidth / 2} y={boxY + (tall ? 36 : 25)} textAnchor="middle">
                  {amount}
                </text>
              </>
            )}
            {vertical && (
              <text
                className="flowBoxName vertical"
                x={band.x0 + boxWidth / 2}
                y={boxY + boxH / 2}
                textAnchor="middle"
                transform={`rotate(-90 ${(band.x0 + boxWidth / 2).toFixed(1)} ${(boxY + boxH / 2).toFixed(1)})`}
              >
                {truncate(label, charsFor(boxH - 8, 10.5))}
              </text>
            )}
          </g>
        );
      })}

      {/* Left over each month */}
      <g
        className={`flowTank ${flow.surplus < 0 ? "deficit" : ""}`}
        onClick={() => savingsNode && onSelect(savingsNode)}
        onMouseMove={(event) =>
          showTip(event, flow.surplus < 0 ? "Overspent" : "Left over", [`${money(Math.abs(flow.surplus))} · ${percent(Math.abs(flow.surplus))} of income`])
        }
      >
        <rect className="flowTankGlass" x={padX} y={tankTop} width={usable} height={tankH} rx={tall ? 14 : 10} />
        {flow.surplus > 0 && (
          <g clipPath={`url(#${uid}-tank)`}>
            {(() => {
              const level = tankTop + tankH * (1 - Math.max(0.22, savingsShare));
              return (
                <>
                  <rect className="flowTankWater" x={padX} y={level} width={usable} height={tankH} />
                  <path className={animations ? "flowWave animated" : "flowWave"} d={wavePath(padX - usable, level, usable * 3, 2.5, Math.max(80, usable / 4))} />
                  <path className={animations ? "flowWave soft animated" : "flowWave soft"} d={wavePath(padX - usable + 30, level + 3, usable * 3, 2, Math.max(110, usable / 3))} />
                </>
              );
            })()}
          </g>
        )}
        <rect className="flowTankRim" x={padX} y={tankTop} width={usable} height={tankH} rx={tall ? 14 : 10} />
        <text className="flowEyebrow tank" x={padX + 14} y={tankTop + (tall ? 20 : 17)}>
          {flow.surplus < 0 ? "Overspent this month" : "Left over each month"}
        </text>
        {tall && (
          <text className={`flowTotal tank ${privacy ? "masked" : ""}`} x={padX + 14} y={tankTop + 48}>
            {money(Math.abs(flow.surplus))}
          </text>
        )}
        {!tall && (
          <text className={`flowBoxAmount tank ${privacy ? "masked" : ""}`} x={padX + 14} y={tankTop + 36}>
            {money(Math.abs(flow.surplus))}
          </text>
        )}
        {flow.income > 0 && (
          <text className="flowSources tank" x={width - padX - 14} y={tankTop + (tall ? 20 : 17)} textAnchor="end">
            {percent(Math.abs(flow.surplus))} of income
          </text>
        )}
      </g>
    </svg>
  );
}

// A box with square top corners (the stream lands flush on it) and rounded bottom corners.
function boxPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M ${x} ${y} H ${x + width} V ${y + height - r} Q ${x + width} ${y + height} ${x + width - r} ${y + height} H ${x + r} Q ${x} ${y + height} ${x} ${y + height - r} Z`;
}

function wavePath(x: number, y: number, width: number, amplitude: number, wavelength: number): string {
  const segments = Math.ceil(width / wavelength);
  let d = `M ${x} ${y}`;
  for (let index = 0; index < segments; index += 1) {
    d += ` q ${wavelength / 4} ${-amplitude * 2} ${wavelength / 2} 0 t ${wavelength / 2} 0`;
  }
  d += ` L ${x + segments * wavelength} ${y + 200} L ${x} ${y + 200} Z`;
  return d;
}

// ─── Particles ───────────────────────────────────────────────────────────────

function Particles({ flow, width, height, formatter, privacy, animations, onSelect, showTip }: RenderProps) {
  const uid = useId().replace(/:/g, "");
  const money = (value: number) => (privacy ? "•••" : formatter.format(value));
  const percent = (value: number) => `${((value / Math.max(flow.total, 1)) * 100).toFixed(0)}%`;

  const compact = width < 520;
  const labelWidth = Math.max(60, Math.min(compact ? 96 : 170, width * 0.26));
  const nodeW = 12;
  const padY = 18;
  const gap = 10;
  const xLeft = labelWidth;
  const xRight = width - labelWidth - nodeW;
  const xHub = (xLeft + xRight) / 2;

  const usable = (count: number) => height - padY * 2 - Math.max(0, count - 1) * gap;
  const scale = Math.min(usable(flow.sources.length), usable(flow.targets.length), usable(1)) / Math.max(flow.total, 1);

  type Placed = { node: FlowNode; y0: number; y1: number };
  const place = (nodes: FlowNode[]): Placed[] => {
    const contentHeight = nodes.reduce((sum, node) => sum + Math.max(node.value * scale, 3), 0) + Math.max(0, nodes.length - 1) * gap;
    let y = (height - contentHeight) / 2;
    return nodes.map((node) => {
      const nodeHeight = Math.max(node.value * scale, 3);
      const placed = { node, y0: y, y1: y + nodeHeight };
      y += nodeHeight + gap;
      return placed;
    });
  };
  const left = place(flow.sources);
  const right = place(flow.targets);
  const hubHeight = Math.max(3, flow.total * scale);
  const hubY0 = (height - hubHeight) / 2;

  let inOffset = hubY0;
  const inLinks = left.map((placed) => {
    const linkHeight = Math.max(placed.node.value * scale, 3);
    const link = { placed, y0: inOffset, y1: inOffset + linkHeight };
    inOffset += linkHeight;
    return link;
  });
  let outOffset = hubY0;
  const outLinks = right.map((placed) => {
    const linkHeight = Math.max(placed.node.value * scale, 3);
    const link = { placed, y0: outOffset, y1: outOffset + linkHeight };
    outOffset += linkHeight;
    return link;
  });

  // Particle lanes: a few paths spread across each ribbon, each carrying a handful of dots.
  const particles = useMemo(() => {
    if (!animations) return [];
    const lanes: Array<{ id: string; d: string; color: string; count: number; dur: number }> = [];
    const seed = (text: string) => text.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    inLinks.forEach((link) => {
      const thickness = Math.max(link.y1 - link.y0, 3);
      const laneCount = Math.max(1, Math.min(4, Math.round(thickness / 14)));
      for (let lane = 0; lane < laneCount; lane += 1) {
        const t = (lane + 0.5) / laneCount;
        const sy = link.placed.y0 + (link.placed.y1 - link.placed.y0) * t;
        const ty = link.y0 + thickness * t;
        lanes.push({
          id: `${safeId(link.placed.node.id)}-${lane}`,
          d: horizontalCentre(xLeft + nodeW, sy, xHub, ty),
          color: link.placed.node.color,
          count: Math.max(1, Math.min(5, Math.round((link.placed.node.value / Math.max(flow.total, 1)) * 12 / laneCount))),
          dur: 2.6 + ((seed(link.placed.node.id) + lane * 7) % 9) * 0.18,
        });
      }
    });
    outLinks.forEach((link) => {
      const thickness = Math.max(link.y1 - link.y0, 3);
      const laneCount = Math.max(1, Math.min(4, Math.round(thickness / 14)));
      for (let lane = 0; lane < laneCount; lane += 1) {
        const t = (lane + 0.5) / laneCount;
        const sy = link.y0 + thickness * t;
        const ty = link.placed.y0 + (link.placed.y1 - link.placed.y0) * t;
        lanes.push({
          id: `${safeId(link.placed.node.id)}-${lane}`,
          d: horizontalCentre(xHub + nodeW, sy, xRight, ty),
          color: link.placed.node.color,
          count: Math.max(1, Math.min(5, Math.round((link.placed.node.value / Math.max(flow.total, 1)) * 12 / laneCount))),
          dur: 2.6 + ((seed(link.placed.node.id) + lane * 5) % 9) * 0.18,
        });
      }
    });
    return lanes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations, flow, width, height]);

  const leftChars = charsFor(labelWidth - 16);
  const rightChars = charsFor(labelWidth - 16);
  // Small nodes share a single label line so neighbours can be kept apart.
  const twoLine = !compact && height / Math.max(1, Math.max(left.length, right.length)) >= 46;
  const labelGap = twoLine ? 32 : 15;
  const leftLabelY = spreadLabels(left.map((placed) => (placed.y0 + placed.y1) / 2), labelGap, height);
  const rightLabelY = spreadLabels(right.map((placed) => (placed.y0 + placed.y1) / 2), labelGap, height);

  return (
    <svg className="moneyFlowSvg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Income sources flowing through to savings and spending categories">
      <defs>
        {inLinks.map((link) => (
          <linearGradient key={link.placed.node.id} id={`${uid}-in-${safeId(link.placed.node.id)}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: link.placed.node.color }} />
            <stop offset="1" style={{ stopColor: "var(--blue)" }} />
          </linearGradient>
        ))}
        {outLinks.map((link) => (
          <linearGradient key={link.placed.node.id} id={`${uid}-out-${safeId(link.placed.node.id)}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "var(--blue)" }} />
            <stop offset="1" style={{ stopColor: link.placed.node.color }} />
          </linearGradient>
        ))}
        {particles.map((lane) => (
          <path key={lane.id} id={`${uid}-lane-${lane.id}`} d={lane.d} fill="none" />
        ))}
      </defs>
      {inLinks.map((link) => (
        <path
          key={link.placed.node.id}
          className="sankeyLink flowRibbon"
          d={horizontalRibbon(xLeft + nodeW, link.placed.y0, link.placed.y1, xHub, link.y0, link.y1)}
          fill={`url(#${uid}-in-${safeId(link.placed.node.id)})`}
          onMouseMove={(event) => showTip(event, `${link.placed.node.label} → Income`, [`${money(link.placed.node.value)} · ${percent(link.placed.node.value)} of flow`])}
          onClick={() => onSelect(link.placed.node)}
        />
      ))}
      {outLinks.map((link) => (
        <path
          key={link.placed.node.id}
          className="sankeyLink flowRibbon"
          d={horizontalRibbon(xHub + nodeW, link.y0, link.y1, xRight, link.placed.y0, link.placed.y1)}
          fill={`url(#${uid}-out-${safeId(link.placed.node.id)})`}
          onMouseMove={(event) => showTip(event, `Income → ${link.placed.node.label}`, [`${money(link.placed.node.value)} · ${percent(link.placed.node.value)} of flow`])}
          onClick={() => onSelect(link.placed.node)}
        />
      ))}
      {particles.map((lane) =>
        Array.from({ length: lane.count }, (_, index) => (
          <circle key={`${lane.id}-${index}`} className="flowParticle" r={compact ? 2 : 2.6} fill={lane.color} style={{ color: lane.color }}>
            <animateMotion dur={`${lane.dur}s`} repeatCount="indefinite" begin={`${-((index / lane.count) * lane.dur).toFixed(2)}s`}>
              <mpath href={`#${uid}-lane-${lane.id}`} />
            </animateMotion>
          </circle>
        )),
      )}
      {left.map((placed, index) => {
        const centre = (placed.y0 + placed.y1) / 2;
        const labelY = leftLabelY[index];
        return (
          <g key={placed.node.id} className="flowNodeGroup" onClick={() => onSelect(placed.node)} onMouseMove={(event) => showTip(event, placed.node.label, [`${money(placed.node.value)} · ${percent(placed.node.value)}`])}>
            <rect className="flowNode" x={xLeft} y={placed.y0} width={nodeW} height={placed.y1 - placed.y0} rx={3} fill={placed.node.color} />
            {Math.abs(labelY - centre) > 2 && <line className="flowLeader" x1={xLeft - 4} y1={centre} x2={xLeft - 4} y2={labelY} />}
            <text className="flowLabel" x={xLeft - 8} y={labelY - (twoLine ? 7 : 0)} textAnchor="end" dominantBaseline="middle">
              <tspan className="name">{truncate(placed.node.label, twoLine ? leftChars : leftChars - 7)}</tspan>
              {twoLine ? (
                <tspan className={privacy ? "amt masked" : "amt"} x={xLeft - 8} dy="14">
                  {money(placed.node.value)}
                </tspan>
              ) : (
                !compact && (
                  <tspan className={privacy ? "amt masked" : "amt"} dx="5">
                    {money(placed.node.value)}
                  </tspan>
                )
              )}
            </text>
          </g>
        );
      })}
      <g className="flowPool">
        <rect x={xHub} y={hubY0} width={nodeW} height={hubHeight} rx={3} fill="var(--blue)" />
        <text className="flowLabel hub" x={xHub + nodeW / 2} y={hubY0 - 8} textAnchor="middle">
          <tspan className="name">{flow.surplus < 0 ? "Income + shortfall" : "Income"}</tspan>
          {!compact && (
            <tspan className={privacy ? "amt masked" : "amt"} dx="6">
              {money(flow.total)}
            </tspan>
          )}
        </text>
      </g>
      {right.map((placed, index) => {
        const centre = (placed.y0 + placed.y1) / 2;
        const labelY = rightLabelY[index];
        return (
          <g key={placed.node.id} className="flowNodeGroup" onClick={() => onSelect(placed.node)} onMouseMove={(event) => showTip(event, placed.node.label, [`${money(placed.node.value)} · ${percent(placed.node.value)}`])}>
            <rect className="flowNode" x={xRight} y={placed.y0} width={nodeW} height={placed.y1 - placed.y0} rx={3} fill={placed.node.color} />
            {Math.abs(labelY - centre) > 2 && <line className="flowLeader" x1={xRight + nodeW + 4} y1={centre} x2={xRight + nodeW + 4} y2={labelY} />}
            <text className="flowLabel" x={xRight + nodeW + 8} y={labelY - (twoLine ? 7 : 0)} dominantBaseline="middle">
              <tspan className="name">{truncate(placed.node.label, twoLine ? rightChars : rightChars - 6)}</tspan>
              {twoLine ? (
                <tspan className={privacy ? "amt masked" : "amt"} x={xRight + nodeW + 8} dy="14">
                  {money(placed.node.value)} · {percent(placed.node.value)}
                </tspan>
              ) : (
                !compact && (
                  <tspan className={privacy ? "amt masked" : "amt"} dx="5">
                    {percent(placed.node.value)}
                  </tspan>
                )
              )}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
