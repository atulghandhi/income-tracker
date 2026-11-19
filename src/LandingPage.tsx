import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Lock } from "lucide-react";
import { BANK_GUIDES } from "./generated/bankGuides";
import { LANDING_COPY, rememberLandingRegion } from "./landingContent";
import type { RegionKey } from "./region";

// ─── Audio ────────────────────────────────────────────────────────────────────

function mkCtx(): AudioContext | null {
  try { return new AudioContext(); } catch { return null; }
}

function sndHover(ctx: AudioContext) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.frequency.setValueAtTime(900, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.055);
  g.gain.setValueAtTime(0.038, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.055);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.055);
}

function sndClick(ctx: AudioContext) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.frequency.setValueAtTime(260, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.11);
  g.gain.setValueAtTime(0.11, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.11);
  o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.11);
}

function sndChime(ctx: AudioContext) {
  [523, 659, 784].forEach((freq, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + i * 0.13;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.start(t); o.stop(t + 0.5);
  });
}

// ─── Data ────────────────────────────────────────────────────────────────────

// 40-month bar data — SVG 1044px wide, scrolls 312px (12 bars = 1 year) left
const BAR_EXT = [
  { m: "Nov", v: -340 }, { m: "Dec", v:  920 },
  { m: "Jan", v:  580 }, { m: "Feb", v: -240 },
  { m: "Mar", v: -160 }, { m: "Apr", v:  760 },
  { m: "May", v:  420 }, { m: "Jun", v: -580 },
  { m: "Jul", v:  310 }, { m: "Aug", v: -450 },
  { m: "Sep", v:  670 }, { m: "Oct", v: -120 },
  { m: "Nov", v:  840 }, { m: "Dec", v: -960 },
  { m: "Jan", v:  450 }, { m: "Feb", v:  -80 },
  { m: "Mar", v: -530 }, { m: "Apr", v:  680 },
  { m: "May", v: -290 }, { m: "Jun", v:  340 },
  { m: "Jul", v: -320 }, { m: "Aug", v:  680 },
  { m: "Sep", v: -450 }, { m: "Oct", v:  290 },
  { m: "Nov", v: -720 }, { m: "Dec", v:  840 },
  { m: "Jan", v:  530 }, { m: "Feb", v: -180 },
  { m: "Jul", v: -180 }, { m: "Aug", v:  420 },
  { m: "Sep", v:  -95 }, { m: "Oct", v:  310 },
  { m: "Nov", v: -520 }, { m: "Dec", v: -890 },
  { m: "Jan", v:  640 }, { m: "Feb", v:  280 },
  { m: "Mar", v: -140 }, { m: "Apr", v:  510 },
  { m: "May", v:  390 }, { m: "Jun", v:  -62 },
];

const CMP = [
  { label: "Works across accounts from different banks", s: "Yes",          b: "Their accounts only" },
  { label: "Import your own CSV files",                  s: "Manual paste", b: "Rarely" },
  { label: "No bank credentials required",               s: "Yes",          b: "No" },
  { label: "Drag-and-drop categorisation",               s: "No",           b: "No" },
  { label: "Month-by-month ledger view",                 s: "Manual",       b: "No" },
  { label: "Free",                                       s: "Yes",          b: "Yes" },
];

type HeroFocus = "inc-name" | "inc-amt" | "exp-name" | "exp-amt" | null;

// ─── Component ───────────────────────────────────────────────────────────────

// A round stamp on the corner of the hero window: the page's one playful detail.
// It states facts the product keeps, nothing borrowed from anyone else.
function Sticker() {
  const text = "NO BANK LOGIN \u00b7 FREE \u00b7 PRIVATE \u00b7 ";
  return (
    <svg className="lp-sticker" viewBox="0 0 120 120" role="img" aria-label="No bank login. Free. Private.">
      <defs>
        <path id="lp-sticker-ring" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="58" className="lp-sticker-bg" />
      <circle cx="60" cy="60" r="31" className="lp-sticker-core" />
      <text className="lp-sticker-text" aria-hidden="true">
        <textPath href="#lp-sticker-ring" startOffset="0" textLength="272" lengthAdjust="spacing">{text}</textPath>
      </text>
      <path className="lp-sticker-lock" aria-hidden="true" d="M52 58v-5a8 8 0 0 1 16 0v5M49 58h22v15H49z" />
    </svg>
  );
}

export default function LandingPage({ onEnter, onFeedback, region = "GB" }: { onEnter: () => void; onFeedback: () => void; region?: RegionKey }) {
  const copy = LANDING_COPY[region];
  const cur = copy.currency;
  const CSV_ROWS = copy.csvRows;
  const incomeRow = copy.heroIncome;
  const [exp1, exp2] = copy.heroExpenses;
  const ctxRef    = useRef<AudioContext | null>(null);
  const csvRef    = useRef<HTMLElement | null>(null);
  const annualRef = useRef<HTMLElement | null>(null);

  const [navIn,    setNavIn]    = useState(false);
  const [reduced,  setReduced]  = useState(false);
  const [csvStep,  setCsvStep]  = useState(0);

  // Hero animation
  const [heroFocus,      setHeroFocus]      = useState<HeroFocus>(null);
  const [heroName,       setHeroName]       = useState("");
  const [heroAmt,        setHeroAmt]        = useState("");
  const [heroTabBadge,   setHeroTabBadge]   = useState(false);
  const [heroEnterBadge, setHeroEnterBadge] = useState(false);
  const [heroIncAdded,   setHeroIncAdded]   = useState<{ name: string; amt: string }[]>([]);
  const [heroExpAdded,   setHeroExpAdded]   = useState<{ name: string; amt: string }[]>([]);

  // Annual chart
  const [annualPhase,   setAnnualPhase]   = useState<"chart" | "proj">("chart");
  const [annualVisible, setAnnualVisible] = useState(false);
  const [chartKey,      setChartKey]      = useState(0);

  function getCtx(): AudioContext | null {
    if (reduced) return null;
    if (!ctxRef.current) ctxRef.current = mkCtx();
    if (ctxRef.current?.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }

  function enter() {
    const c = getCtx();
    if (c) sndClick(c);
    localStorage.setItem("hasSeenLanding", "1");
    onEnter();
  }

  function hover() {
    const c = getCtx();
    if (c) sndHover(c);
  }

  // Reduced-motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Body scroll unlock
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "unset";
    body.style.overflow = "unset";
    window.scrollTo(0, 0);
    return () => { html.style.overflow = prevHtml; body.style.overflow = prevBody; };
  }, []);

  // Nav slide-in + opening chime
  useEffect(() => {
    const t1 = setTimeout(() => setNavIn(true), 120);
    if (reduced) return () => clearTimeout(t1);
    const t2 = setTimeout(() => {
      const c = mkCtx();
      if (c) { ctxRef.current = c; sndChime(c); }
    }, 480);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduced]);

  // Scroll reveal
  useEffect(() => {
    if (reduced) {
      document.querySelectorAll(".lp-r").forEach(el => {
        (el as HTMLElement).style.opacity = "1";
        (el as HTMLElement).style.transform = "none";
      });
      return;
    }
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("lp-ri"); io.unobserve(e.target); }
      }),
      { threshold: 0.07 }
    );
    document.querySelectorAll(".lp-r").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [reduced]);

  // ── Hero animation loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (reduced) {
      setHeroIncAdded([incomeRow]);
      setHeroExpAdded([exp1, exp2]);
      return;
    }

    const tids: ReturnType<typeof setTimeout>[] = [];
    let alive = true;

    const push = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (alive) fn(); }, ms);
      tids.push(id);
    };

    const typeStr = (str: string, setter: (s: string) => void, startMs: number, charMs = 90): number => {
      for (let i = 1; i <= str.length; i++) {
        push(() => setter(str.slice(0, i)), startMs + i * charMs);
      }
      return startMs + str.length * charMs;
    };

    function runLoop() {
      setHeroFocus("inc-name");
      setHeroName("");
      setHeroAmt("");
      setHeroTabBadge(false);
      setHeroEnterBadge(false);
      setHeroIncAdded([]);
      setHeroExpAdded([]);

      let t = 0;

      // Income: name → Tab → amount → Enter
      t = 600;
      t = typeStr(incomeRow.name, setHeroName, t);
      t += 320; push(() => setHeroTabBadge(true), t);
      t += 350; push(() => { setHeroTabBadge(false); setHeroFocus("inc-amt"); }, t);
      t += 100; t = typeStr(incomeRow.amt.replace(/\.00$/, ""), setHeroAmt, t, 200);
      t += 250; push(() => setHeroEnterBadge(true), t);
      t += 350; push(() => {
        setHeroEnterBadge(false);
        setHeroFocus(null);
        setHeroIncAdded([incomeRow]);
        setHeroName(""); setHeroAmt("");
      }, t);
      t += 400;

      // Expense 1: name → Tab → amount → Enter
      push(() => setHeroFocus("exp-name"), t);
      t += 250; t = typeStr(exp1.name, setHeroName, t);
      t += 320; push(() => setHeroTabBadge(true), t);
      t += 350; push(() => { setHeroTabBadge(false); setHeroFocus("exp-amt"); }, t);
      t += 100; t = typeStr(exp1.amt.replace(/\.00$/, ""), setHeroAmt, t, 200);
      t += 250; push(() => setHeroEnterBadge(true), t);
      t += 350; push(() => {
        setHeroEnterBadge(false);
        setHeroFocus(null);
        setHeroExpAdded([exp1]);
        setHeroName(""); setHeroAmt("");
      }, t);
      t += 400;

      // Expense 2: name → Tab → amount → Enter
      push(() => setHeroFocus("exp-name"), t);
      t += 250; t = typeStr(exp2.name, setHeroName, t);
      t += 320; push(() => setHeroTabBadge(true), t);
      t += 350; push(() => { setHeroTabBadge(false); setHeroFocus("exp-amt"); }, t);
      t += 100; t = typeStr(exp2.amt.replace(/\.00$/, ""), setHeroAmt, t, 200);
      t += 250; push(() => setHeroEnterBadge(true), t);
      t += 350; push(() => {
        setHeroEnterBadge(false);
        setHeroFocus(null);
        setHeroExpAdded(prev => [...prev, exp2]);
        setHeroName(""); setHeroAmt("");
      }, t);

      // Hold 2.5s then loop
      t += 2500;
      push(runLoop, t);
    }

    push(runLoop, 800);
    return () => { alive = false; tids.forEach(clearTimeout); };
  }, [reduced, region]);

  // ── Annual chart: visibility tracking ────────────────────────────────────
  useEffect(() => {
    const el = annualRef.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(
      ([entry]) => setAnnualVisible(entry.isIntersecting),
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  // ── Annual chart: phase loop ──────────────────────────────────────────────
  useEffect(() => {
    if (reduced || !annualVisible) return;
    let alive = true;
    const tids: ReturnType<typeof setTimeout>[] = [];

    function loop() {
      setAnnualPhase("chart");
      setChartKey(k => k + 1);
      tids.push(setTimeout(() => {
        if (!alive) return;
        setAnnualPhase("proj");
        tids.push(setTimeout(() => { if (alive) loop(); }, 3500));
      }, 3500));
    }

    loop();
    return () => { alive = false; tids.forEach(clearTimeout); };
  }, [reduced, annualVisible]);

  // ── CSV animation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (reduced) { setCsvStep(99); return; }
    const el = csvRef.current;
    if (!el) return;
    let active = false;
    const tids: ReturnType<typeof setTimeout>[] = [];

    function run() {
      if (active) return;
      active = true;
      const push = (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); tids.push(t); };
      CSV_ROWS.forEach((_, i) => push(() => setCsvStep(i + 1), 300 + i * 450));
      const after = 300 + CSV_ROWS.length * 450 + 400;
      CSV_ROWS.forEach((_, i) => push(() => setCsvStep(CSV_ROWS.length + i + 1), after + i * 320));
      push(() => { setCsvStep(0); active = false; }, after + CSV_ROWS.length * 320 + 2400);
    }

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !active) run();
    }, { threshold: 0.25 });
    io.observe(el);
    return () => { io.disconnect(); tids.forEach(clearTimeout); };
  }, [reduced]);

  const prevCsvStep = useRef(csvStep);
  useEffect(() => {
    if (prevCsvStep.current !== 0 && csvStep === 0 && csvRef.current && !reduced) {
      const t = setTimeout(() => {
        const el = csvRef.current;
        if (el) {
          const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
              let active = true;
              const tids: ReturnType<typeof setTimeout>[] = [];
              const push = (fn: () => void, ms: number) => { const t = setTimeout(fn, ms); tids.push(t); };
              CSV_ROWS.forEach((_, i) => push(() => setCsvStep(i + 1), 300 + i * 450));
              const after = 300 + CSV_ROWS.length * 450 + 400;
              CSV_ROWS.forEach((_, i) => push(() => setCsvStep(CSV_ROWS.length + i + 1), after + i * 320));
              push(() => { setCsvStep(0); active = false; void active; }, after + CSV_ROWS.length * 320 + 2400);
              io.disconnect();
            }
          }, { threshold: 0.25 });
          io.observe(el);
          return () => io.disconnect();
        }
      }, 800);
      return () => clearTimeout(t);
    }
    prevCsvStep.current = csvStep;
  }, [csvStep, reduced]);

  // ── Derived hero values ───────────────────────────────────────────────────
  const incomeTotal  = 3248.72 + heroIncAdded.reduce((s, r) => s + parseFloat(r.amt), 0);
  const expenseTotal = heroExpAdded.reduce((s, r) => s + parseFloat(r.amt), 0);
  const incomeCount  = 1 + heroIncAdded.length;
  const expenseCount = heroExpAdded.length;
  const fmt = (n: number) => n.toLocaleString(copy.locale, { minimumFractionDigits: 2 });
  const miniExpenseTotal = parseFloat(copy.miniFood.amt) + copy.miniRows.reduce((s, r) => s + parseFloat(r.amt), 0);

  const maxV   = Math.max(...BAR_EXT.map(b => Math.abs(b.v)));
  const svgW   = 4 + BAR_EXT.length * 26; // 1044px for 40 bars
  const scrollX = 12 * 26;                 // 312px — scrolls one full year (12 bars)

  // Savings-rate arc
  const dialR    = 20;
  const dialCirc = 2 * Math.PI * dialR;
  const dialFill = 0.157 * dialCirc;

  return (
    <>
      <style>{CSS}</style>

      {/* ── Fixed nav ── */}
      <header className={`lp-nav${navIn ? " lp-nav--in" : ""}`}>
        <div className="lp-nav-inner">
          <span className="lp-nav-brand">The Income Tracker</span>
          <nav className="lp-nav-links" aria-label="Site">
            {copy.nav.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
            <a href={copy.switchTo.href} hrefLang={copy.switchTo.region === "US" ? "en-US" : "en-GB"} onClick={() => rememberLandingRegion(copy.switchTo.region)}>{copy.switchTo.label}</a>
          </nav>
          <button className="lp-btn lp-btn--sm lp-btn--onframe" onClick={enter} onMouseEnter={hover}>
            Continue to app <ArrowRight size={14} />
          </button>
        </div>
      </header>

      <main className="lp-page">

        {/* ════ HERO ════ */}
        <section className="lp-hero">
          <div className="lp-hero-copy lp-r">
            <h1 className="lp-h1">
              Track income and spending<br />
              <span className="lp-accent">without linking your bank.</span>
            </h1>
            <p className="lp-sub">{copy.heroSub}</p>
            <div className="lp-actions">
              <button className="lp-btn lp-btn--lg lp-btn--onframe" onClick={enter} onMouseEnter={hover}>
                Open the ledger <ArrowRight size={18} />
              </button>
              <button className="lp-skip" onClick={enter}>
                Already use it? Skip the tour
              </button>
            </div>
          </div>

          <div className="lp-hero-mock lp-r" style={{ transitionDelay: "200ms" }}>
            <Sticker />
            <div className="lp-browser">
              <div className="lp-chrome">
                <div className="lp-dots"><span /><span /><span /></div>
                <div className="lp-url">theincometracker.com &nbsp;/&nbsp; Example month</div>
              </div>

              {/* Two-column ledger mock */}
              <div className="lp-mock-body" aria-hidden="true">

                {/* ── Income panel ── */}
                <div className="lp-mp lp-mp--income">
                  <div className="lp-mp-head">
                    <div>
                      <div className="lp-mp-title"><span className="lp-glyph lp-glyph--in">↓</span> Income</div>
                      <div className="lp-mp-sub">{incomeCount} item{incomeCount !== 1 ? "s" : ""}</div>
                    </div>
                    <span className="lp-mp-total lp-mp-total--income">{cur}{fmt(incomeTotal)}</span>
                  </div>
                  <div className="lp-col-head"><span>Source</span><span>Amount</span></div>
                  <div className="lp-mrow">
                    <span className="lp-dot-swatch" style={{ background: "#6c5ce7" }} />
                    <span className="lp-mname">{copy.salaryLabel}</span>
                    <span className="lp-mamt">{cur} {fmt(3248.72)}</span>
                  </div>
                  {heroIncAdded.map(r => (
                    <div key={r.name} className="lp-mrow lp-mrow--new">
                      <span className="lp-dot-swatch" style={{ background: "#00b894" }} />
                      <span className="lp-mname">{r.name}</span>
                      <span className="lp-mamt">{cur} {r.amt}</span>
                    </div>
                  ))}
                  <div className="lp-madd">
                    <span className="lp-madd-plus">+</span>
                    <span className={`lp-madd-field${heroFocus === "inc-name" ? " lp-madd-field--focus" : ""}`}>
                      {heroFocus === "inc-name"
                        ? <>{heroName}<span className="lp-cursor" /></>
                        : heroFocus === "inc-amt" && heroName
                          ? heroName
                          : <span className="lp-ph">Source</span>}
                    </span>
                    <span className="lp-key-badge lp-key-badge--tab"
                      style={{ opacity: heroTabBadge && heroFocus === "inc-name" ? 1 : 0 }}>
                      ⇥ Tab
                    </span>
                    <span className={`lp-madd-field lp-madd-field--amt${heroFocus === "inc-amt" ? " lp-madd-field--focus" : ""}`}>
                      {heroFocus === "inc-amt"
                        ? <>{cur}{heroAmt}<span className="lp-cursor" /></>
                        : <span className="lp-ph">{cur}</span>}
                    </span>
                    <span className="lp-key-badge lp-key-badge--enter"
                      style={{ opacity: heroEnterBadge && heroFocus === "inc-amt" ? 1 : 0 }}>
                      ↵
                    </span>
                    <span className="lp-madd-check">✓</span>
                  </div>
                </div>

                {/* ── Expense panel ── */}
                <div className="lp-mp lp-mp--expense">
                  <div className="lp-mp-head">
                    <div>
                      <div className="lp-mp-title"><span className="lp-glyph lp-glyph--out">↑</span> Expenses</div>
                      <div className="lp-mp-sub">{expenseCount} item{expenseCount !== 1 ? "s" : ""}</div>
                    </div>
                    <span className="lp-mp-total">{cur}{fmt(expenseTotal)}</span>
                  </div>
                  <div className="lp-col-head"><span>Expense</span><span>Amount</span></div>
                  {heroExpAdded.map(r => (
                    <div key={r.name} className="lp-mrow lp-mrow--new">
                      <span className="lp-mname">{r.name}</span>
                      <span className="lp-mamt lp-mamt--exp">{cur} {r.amt}</span>
                    </div>
                  ))}
                  <div className="lp-madd lp-madd--exp">
                    <span className="lp-madd-plus lp-madd-plus--exp">+</span>
                    <span className={`lp-madd-field${heroFocus === "exp-name" ? " lp-madd-field--focus" : ""}`}>
                      {heroFocus === "exp-name"
                        ? <>{heroName}<span className="lp-cursor" /></>
                        : heroFocus === "exp-amt" && heroName
                          ? heroName
                          : <span className="lp-ph">Expense</span>}
                    </span>
                    <span className="lp-key-badge lp-key-badge--tab"
                      style={{ opacity: heroTabBadge && heroFocus === "exp-name" ? 1 : 0 }}>
                      ⇥ Tab
                    </span>
                    <span className={`lp-madd-field lp-madd-field--amt${heroFocus === "exp-amt" ? " lp-madd-field--focus" : ""}`}>
                      {heroFocus === "exp-amt"
                        ? <>{cur}{heroAmt}<span className="lp-cursor" /></>
                        : <span className="lp-ph">{cur}</span>}
                    </span>
                    <span className="lp-key-badge lp-key-badge--enter"
                      style={{ opacity: heroEnterBadge && heroFocus === "exp-amt" ? 1 : 0 }}>
                      ↵
                    </span>
                    <span className="lp-madd-check lp-madd-check--exp">✓</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* ════ PRIVACY STRIP ════ */}
        <div className="lp-strip lp-r">
          <span className="lp-strip-pip" aria-hidden="true" />
          {copy.strip}
        </div>

        {/* ════ DEMO 1: CSV import ════ */}
        <section className="lp-feat" ref={el => { csvRef.current = el; }} aria-labelledby="lp-csv-h2">
          <div className="lp-feat-copy">
            <h2 className="lp-feat-h2" id="lp-csv-h2">{copy.csvHeading}</h2>
            <p className="lp-feat-p">{copy.csvBody}</p>
          </div>
          <div className="lp-feat-frame lp-feat-frame--blue">
            <div className="lp-csv-table">
              <div className="lp-csv-head">
                <span>Date</span><span>Description</span><span>Amount</span><span>Category</span>
              </div>
              {CSV_ROWS.map((row, i) => (
                <div key={row.desc} className={`lp-csv-row${csvStep > i ? " lp-csv-row--in" : ""}`}>
                  <span className="lp-csv-date">{row.date}</span>
                  <span className="lp-csv-desc">{row.desc}</span>
                  <span className="lp-csv-amt">{cur}{row.amt}</span>
                  <span className={`lp-csv-cat${csvStep > CSV_ROWS.length + i ? " lp-csv-cat--in" : ""}`}>{row.cat}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════ DEMO 2: Monthly ledger ════ */}
        <section className="lp-feat" aria-labelledby="lp-ledger-h2">
          <div className="lp-feat-copy">
            <h2 className="lp-feat-h2" id="lp-ledger-h2">See every month side by side</h2>
            <p className="lp-feat-p">
              Income on the left, expenses on the right, totals that update as you type.
              Drag transactions into categories and move between months in one click.
            </p>
          </div>
          <div className="lp-feat-frame lp-feat-frame--green">
            <div className="lp-mini-ledger">
              <div className="lp-mini-panel lp-mini-panel--income">
                <div className="lp-mini-head">
                  <span>Income</span>
                  <span className="lp-mini-total lp-mini-total--income">{cur}{fmt(3248.72)}</span>
                </div>
                <div className="lp-mini-row"><span>{copy.miniIncomeLabel}</span><span>{cur}{fmt(3248.72)}</span></div>
              </div>
              <div className="lp-mini-panel lp-mini-panel--expense">
                <div className="lp-mini-head">
                  <span>Expenses</span>
                  <span className="lp-mini-total">{cur}{fmt(miniExpenseTotal)}</span>
                </div>
                <div className="lp-mini-cat">
                  <span className="lp-mini-cat-pip" /><span>{copy.miniFood.label}</span>
                  <span className="lp-mini-cat-amt">{cur}{copy.miniFood.amt}</span>
                </div>
                <div className="lp-mini-row lp-mini-row--indent"><span>{copy.miniFood.merchant}</span><span>{cur}{copy.miniFood.amt}</span></div>
                {copy.miniRows.map(r => (
                  <div className="lp-mini-row" key={r.name}><span>{r.name}</span><span>{cur}{r.amt}</span></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ════ DEMO 3: Annual chart ⇄ projection card ════ */}
        <section className="lp-feat" ref={el => { annualRef.current = el; }} aria-labelledby="lp-annual-h2">
          <div className="lp-feat-copy">
            <h2 className="lp-feat-h2" id="lp-annual-h2">One year, not one month</h2>
            <p className="lp-feat-p">
              Every month you enter adds up to a yearly picture: your monthly average,
              your balance and the savings you are on track for.
            </p>
          </div>
          <div className="lp-feat-frame lp-feat-frame--violet">
            <div className="lp-chart">
              <div className="lp-chart-title" style={{ transition: "opacity 400ms ease", opacity: 1 }}>
                {annualPhase === "chart" ? "Net flow · 40 months" : `Annual projection · ${new Date().getFullYear()} ↗`}
              </div>
              <div className="lp-chart-stage">

                {/* Scrolling bar chart */}
                <div
                  key={chartKey}
                  className="lp-chart-scroll lp-chart-scroll--run"
                  style={{ opacity: annualPhase === "proj" ? 0 : 1 }}
                >
                  <svg
                    viewBox={`0 0 ${svgW} 118`}
                    style={{ width: svgW, height: 118, display: "block" }}
                    aria-hidden="true"
                  >
                    <line x1={0} y1={62} x2={svgW} y2={62}
                      style={{ stroke: "var(--lp-line-strong)" }} strokeWidth={1} />
                    {BAR_EXT.map((b, i) => {
                      const h = Math.max((Math.abs(b.v) / maxV) * 52, 2);
                      const pos = b.v >= 0;
                      const x = 4 + i * 26;
                      const y = pos ? 62 - h : 62;
                      return (
                        <g key={i}>
                          <rect x={x} y={y} width={18} height={h} rx={3}
                            style={{ fill: pos ? "var(--lp-pos)" : "var(--lp-neg-fill)" }} opacity={0.9} />
                          {i % 2 === 0 && (
                            <text x={x + 9} y={112} textAnchor="middle" className="lp-chart-lbl">{b.m}</text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Projection card */}
                <div className="lp-chart-proj" style={{ opacity: annualPhase === "proj" ? 1 : 0 }}>
                  <div className="lp-proj-grid">
                    <div className="lp-proj-stat">
                      <span className="lp-proj-label">Projected income</span>
                      <span className="lp-proj-val">{cur}39,330</span>
                    </div>
                    <div className="lp-proj-stat">
                      <span className="lp-proj-label">Projected outgoings</span>
                      <span className="lp-proj-val">{cur}33,140</span>
                    </div>
                    <div className="lp-proj-stat">
                      <span className="lp-proj-label">Projected surplus</span>
                      <span className="lp-proj-val lp-proj-val--pos">+{cur}6,190</span>
                    </div>
                    <div className="lp-proj-stat lp-proj-stat--rate">
                      <div>
                        <span className="lp-proj-label">Savings rate</span>
                        <span className="lp-proj-val lp-proj-val--pos">15.7%</span>
                      </div>
                      <div className="lp-proj-dial-wrap">
                        <svg width={46} height={46} viewBox="0 0 46 46" aria-hidden="true">
                          <circle cx={23} cy={23} r={dialR}
                            fill="none" style={{ stroke: "var(--lp-line-strong)" }} strokeWidth={5} />
                          <circle cx={23} cy={23} r={dialR}
                            fill="none" style={{ stroke: "var(--lp-pos)" }} strokeWidth={5}
                            strokeDasharray={`${dialFill} ${dialCirc}`}
                            strokeLinecap="round"
                            transform="rotate(-90 23 23)" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lp-chart-legend" style={{
                opacity: annualPhase === "chart" ? 1 : 0,
                transition: "opacity 500ms ease",
              }}>
                <span className="lp-chart-pip lp-chart-pip--pos" />Surplus
                <span className="lp-chart-pip lp-chart-pip--neg" />Deficit
              </div>
            </div>
          </div>
        </section>

        {/* ════ PRIVACY ════ */}
        <section className="lp-privacy" aria-labelledby="lp-privacy-h2">
          <span className="lp-privacy-mark" aria-hidden="true"><Lock size={22} strokeWidth={2.2} /></span>
          <h2 className="lp-feat-h2" id="lp-privacy-h2">Your money stays on your device.</h2>
          <p className="lp-feat-p">
            The ledger lives in your browser. Nothing is uploaded unless you choose to sign in
            and sync, and you can export everything whenever you like.
          </p>
          <a className="lp-textlink" href="/guides/is-it-safe-to-upload-bank-statements.html">
            How we keep statements private <ArrowRight size={14} />
          </a>
        </section>

        {/* ════ BANKS ════ */}
        <section className="lp-banks lp-r" aria-labelledby="lp-banks-h2">
          <span className="lp-eyebrow">{copy.banksEyebrow}</span>
          {copy.bankNames ? (
            <>
              <h2 className="lp-cmp-h2" id="lp-banks-h2">{copy.banksHeading}</h2>
              <p className="lp-section-p">{copy.banksBody}</p>
              <ul className="lp-bank-grid">
                {copy.bankNames.map(name => (
                  <li key={name}><span className="lp-bank">{name}</span></li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 className="lp-cmp-h2" id="lp-banks-h2">CSV export guides for {BANK_GUIDES.length} UK banks</h2>
              <p className="lp-section-p">
                {copy.banksBody}{" "}
                Only got a PDF? <a href="/guides/import-pdf-bank-statement.html">Import it directly</a>.
              </p>
              <ul className="lp-bank-grid">
                {BANK_GUIDES.map(bank => (
                  <li key={bank.slug}>
                    <a className="lp-bank" href={`/import/${bank.slug}.html`}>{bank.name}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ════ COMPARISON ════ */}
        <div className="lp-band">
        <section className="lp-cmp lp-r">
          <h2 className="lp-cmp-h2">How it compares</h2>
          <div className="lp-cmp-table">
            <div className="lp-cmp-head">
              <div />
              <div className="lp-cmp-col lp-cmp-col--hi">Ledger</div>
              <div className="lp-cmp-col">Spreadsheet</div>
              <div className="lp-cmp-col">Bank app</div>
            </div>
            {CMP.map(row => (
              <div key={row.label} className="lp-cmp-row">
                <div className="lp-cmp-label">{row.label}</div>
                <div className="lp-cmp-cell lp-cmp-cell--hi"><Check size={16} strokeWidth={2.5} /></div>
                <div className="lp-cmp-cell">
                  {row.s === "Yes" ? <Check size={15} strokeWidth={2} className="lp-check-muted" /> : <span className="lp-cmp-text">{row.s}</span>}
                </div>
                <div className="lp-cmp-cell">
                  {row.b === "Yes" ? <Check size={15} strokeWidth={2} className="lp-check-muted" /> : <span className="lp-cmp-text">{row.b}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
        </div>

        {/* ════ RESOURCES ════ */}
        <section className="lp-res lp-r" aria-labelledby="lp-res-h2">
          <span className="lp-eyebrow">Free, with or without the app</span>
          <h2 className="lp-cmp-h2" id="lp-res-h2">Guides, calculators and templates</h2>
          {copy.resourcesNote && <p className="lp-section-p">{copy.resourcesNote}</p>}
          <div className="lp-res-grid">
            {copy.resources.map(r => (
              <a className="lp-res-card" href={r.href} key={r.href}>
                <strong>{r.t}</strong>
                <span>{r.d}</span>
              </a>
            ))}
          </div>
        </section>

        {/* ════ FAQ ════ */}
        <section className="lp-faq lp-r" aria-labelledby="lp-faq-h2">
          <h2 className="lp-cmp-h2" id="lp-faq-h2">Questions people ask</h2>
          <dl className="lp-faq-list">
            {copy.faq.map(item => (
              <div className="lp-faq-item" key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
          <p className="lp-section-p">
            More in the <a href="/about.html">about page</a>, the <a href="/privacy.html">privacy policy</a> and the{" "}
            <a href="/guides/is-it-safe-to-upload-bank-statements.html">guide to keeping statements private</a>.
          </p>
        </section>

        {/* ════ FINAL CTA + FOOTER, back on the frame colour ════ */}
        <div className="lp-endband">
        <section className="lp-end">
          <h2 className="lp-end-h2">Open your first month.</h2>
          <p className="lp-end-deck">It takes about two minutes.</p>
          <button className="lp-btn lp-btn--lg lp-btn--onframe" onClick={enter} onMouseEnter={hover}>
            Start the ledger <ArrowRight size={18} />
          </button>
          <p className="lp-end-note">Free. No credit card. No bank login.</p>
        </section>

        {/* ════ FOOTER ════ */}
        <footer className="lp-footer">
          <span className="lp-footer-brand">© {new Date().getFullYear()} The Income Tracker</span>
          <nav className="lp-footer-links" aria-label="Footer">
            <a href="/tools/" className="lp-footer-link">Calculators</a>
            <span aria-hidden="true">·</span>
            <a href="/import/" className="lp-footer-link">Bank CSV guides</a>
            <span aria-hidden="true">·</span>
            <a href="/guides/" className="lp-footer-link">Guides</a>
            <span aria-hidden="true">·</span>
            <a href="/compare/" className="lp-footer-link">Compare</a>
            <span aria-hidden="true">·</span>
            <a href="/templates/" className="lp-footer-link">Templates</a>
            <span aria-hidden="true">·</span>
            <a href="/about.html" className="lp-footer-link">About</a>
            <span aria-hidden="true">·</span>
            <button type="button" className="lp-footer-link lp-footer-linkbtn" onClick={onFeedback}>Contact us</button>
            <span aria-hidden="true">·</span>
            <a href="/privacy.html" className="lp-footer-link">Privacy Policy</a>
            <span aria-hidden="true">·</span>
            <a href="/tos.html" className="lp-footer-link">Terms of Service</a>
            <span aria-hidden="true">·</span>
            <a href={copy.switchTo.href} hrefLang={copy.switchTo.region === "US" ? "en-US" : "en-GB"} className="lp-footer-link" onClick={() => rememberLandingRegion(copy.switchTo.region)}>{copy.switchTo.label}</a>
          </nav>
        </footer>
        </div>

      </main>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

/* ─── Tokens ──────────────────────────────────────────────────────────────────
   The page is built like the app it sells: a coloured frame (hero, end band)
   with neutral content resting on it. Light and dark follow the theme the app
   saved (index.html sets data-theme before first paint), then the system.
   Small text on the frame stays at 0.86 opacity or above: 4.5:1 on every stop. */
:root {
  --lp-frame-a: hsl(178 80% 24%);
  --lp-frame-b: hsl(208 74% 33%);
  --lp-bg: #ffffff;
  --lp-surface: #ffffff;
  --lp-well: #f4f6f9;
  --lp-band: #fbf6ec;
  --lp-ink-strong: #0e1826;
  --lp-ink: #233247;
  --lp-ink-soft: #46556b;
  --lp-ink-muted: #5b6878;
  --lp-ink-rgb: 20, 32, 51;
  --lp-line: rgba(20, 32, 51, 0.09);
  --lp-line-strong: rgba(20, 32, 51, 0.18);
  --lp-accent: #00dfc1;
  --lp-accent-ink: #00756a;
  --lp-accent-wash: rgba(0, 140, 124, 0.09);
  --lp-pos: #00a38d;
  --lp-neg: #b42318;
  --lp-neg-fill: #e5534b;
  --lp-shadow: 0 1px 2px rgba(14, 24, 38, 0.06), 0 18px 48px -12px rgba(14, 24, 38, 0.28);
  --lp-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --lp-grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>");
}
:root[data-theme="dark"] {
  --lp-frame-a: hsl(182 58% 17%);
  --lp-frame-b: hsl(212 56% 13%);
  --lp-bg: #08182a;
  --lp-surface: #0d2034;
  --lp-well: #12273d;
  --lp-band: #0c1d30;
  --lp-ink-strong: #ffffff;
  --lp-ink: #d4e4fa;
  --lp-ink-soft: #b8c8e0;
  --lp-ink-muted: #9ea8b7;
  --lp-ink-rgb: 212, 228, 250;
  --lp-line: rgba(212, 228, 250, 0.09);
  --lp-line-strong: rgba(212, 228, 250, 0.18);
  --lp-accent-ink: #00dfc1;
  --lp-accent-wash: rgba(0, 223, 193, 0.1);
  --lp-pos: #00dfc1;
  --lp-neg: #ff8b8b;
  --lp-neg-fill: #ff7675;
  --lp-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04), 0 24px 56px -12px rgba(0, 0, 0, 0.6);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.lp-page {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--lp-bg);
  color: var(--lp-ink);
  line-height: 1.6;
  overflow-x: clip;
}
.lp-page a { color: var(--lp-accent-ink); }
.lp-page :focus-visible { outline: 2px solid var(--lp-accent-ink); outline-offset: 3px; border-radius: 6px; }

/* Frame surfaces share one gradient and one grain. */
.lp-nav, .lp-hero, .lp-endband { background: linear-gradient(150deg, var(--lp-frame-a), var(--lp-frame-b) 85%); color: #fff; }
.lp-hero::before, .lp-endband::before, .lp-feat-frame::before {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background-image: var(--lp-grain); opacity: 0.16; mix-blend-mode: overlay; border-radius: inherit;
}
.lp-hero :focus-visible, .lp-endband :focus-visible, .lp-nav :focus-visible { outline-color: #fff; }

/* ── Nav: a strip of the frame ── */
.lp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: 56px;
  background: linear-gradient(90deg, var(--lp-frame-a), var(--lp-frame-b));
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08);
  transform: translateY(-100%); opacity: 0;
  transition: transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 380ms ease;
}
.lp-nav--in { transform: translateY(0); opacity: 1; }
.lp-nav-inner {
  max-width: 1180px; margin: 0 auto; height: 100%; padding: 0 32px;
  display: flex; align-items: center; justify-content: space-between;
}
.lp-nav-brand { font-size: 15px; font-weight: 750; color: #fff; letter-spacing: -0.01em; }
.lp-nav-links { display: flex; align-items: center; gap: 4px; margin: 0 auto 0 28px; }
.lp-page .lp-nav-links a, .lp-nav-links a {
  color: rgba(255, 255, 255, 0.9); text-decoration: none; font-size: 13.5px; font-weight: 550;
  padding: 6px 10px; border-radius: 8px; transition: background-color 150ms var(--lp-ease);
}
.lp-nav-links a:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }

/* ── Buttons ── */
.lp-btn {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--lp-accent); color: #051424;
  border: none; border-radius: 999px;
  font-family: inherit; font-weight: 700;
  cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 160ms ease;
}
.lp-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); }
.lp-btn:active { transform: scale(0.97); box-shadow: none; }
.lp-btn--onframe { background: #fff; color: #0b2b3a; }
.lp-btn--sm { padding: 8px 15px; font-size: 13px; }
.lp-btn--lg { padding: 15px 28px; font-size: 15.5px; }

/* ── Hero: the frame, with the product rising out of it ── */
.lp-hero {
  position: relative; isolation: isolate; text-align: center;
  padding: 136px 24px 0;
}
.lp-hero-copy { max-width: 1000px; margin: 0 auto; }
.lp-h1 {
  font-size: clamp(34px, 5.2vw, 66px);
  font-weight: 830; letter-spacing: -0.035em;
  line-height: 1.04; color: #fff; margin-bottom: 22px;
}
.lp-accent { color: #b8fff2; }
.lp-sub {
  font-size: 17px; color: rgba(255, 255, 255, 0.9);
  line-height: 1.65; max-width: 580px; margin: 0 auto 34px;
}
.lp-actions { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.lp-skip {
  background: none; border: none; color: rgba(255, 255, 255, 0.9); font-size: 13.5px;
  cursor: pointer; font-family: inherit; padding: 4px 2px;
  text-decoration: underline; text-decoration-color: rgba(255, 255, 255, 0.4); text-underline-offset: 3px;
}
.lp-skip:hover { text-decoration-color: #fff; }
.lp-hero-mock {
  position: relative; max-width: 760px; margin: 64px auto -150px; text-align: left;
}

/* The page's one orchestrated moment: copy, then the window rising into place. */
.lp-hero .lp-r {
  opacity: 0; transform: translateY(28px);
  transition: opacity 640ms cubic-bezier(0.16, 1, 0.3, 1), transform 760ms cubic-bezier(0.16, 1, 0.3, 1);
}
.lp-hero .lp-ri { opacity: 1; transform: none; }

/* ── Sticker ── */
.lp-sticker {
  position: absolute; top: -46px; right: -46px; z-index: 3; width: 116px; height: 116px;
  transform: rotate(-12deg); filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.25));
  transition: transform 900ms cubic-bezier(0.2, 0.9, 0.25, 1.04);
}
.lp-sticker:hover { transform: rotate(348deg); }
.lp-sticker-bg { fill: var(--lp-accent); }
.lp-sticker-core { fill: #051424; }
.lp-sticker-text { font: 800 10.6px/1 'Inter', system-ui, sans-serif; fill: #051424; }
.lp-sticker-lock { fill: none; stroke: var(--lp-accent); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }

/* ── Browser chrome (the hero's canvas) ── */
.lp-browser {
  border-radius: 14px; overflow: hidden; background: var(--lp-surface);
  box-shadow: var(--lp-shadow), 0 0 0 1px rgba(255, 255, 255, 0.06);
}
@media (min-width: 900px) { .lp-browser { zoom: 1.18; } }
.lp-chrome {
  background: var(--lp-well); padding: 9px 14px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid var(--lp-line);
}
.lp-dots { display: flex; gap: 5px; }
.lp-dots span { display: block; width: 10px; height: 10px; border-radius: 50%; }
.lp-dots span:nth-child(1) { background: #ff5f57; }
.lp-dots span:nth-child(2) { background: #ffbd2e; }
.lp-dots span:nth-child(3) { background: #28c840; }
.lp-url {
  flex: 1; background: var(--lp-surface); border-radius: 6px; border: 1px solid var(--lp-line);
  padding: 3px 12px; font-size: 11px; color: var(--lp-ink-muted); text-align: center;
  font-family: system-ui, sans-serif;
}

/* ── Hero mock: two-column ledger ── */
.lp-mock-body { background: var(--lp-surface); display: grid; grid-template-columns: 1fr 1fr; }
.lp-mp--income { border-left: 2px solid var(--lp-pos); border-right: 1px solid var(--lp-line); }
.lp-mp--expense { border-left: 2px solid var(--lp-neg-fill); }
.lp-mp-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 10px 12px; background: var(--lp-well); border-bottom: 1px solid var(--lp-line);
}
.lp-mp-title { font-size: 13px; font-weight: 700; color: var(--lp-ink-strong); display: flex; align-items: center; gap: 5px; }
.lp-glyph { font-size: 12px; display: inline-block; }
.lp-glyph--in  { color: var(--lp-accent-ink); }
.lp-glyph--out { color: var(--lp-neg); }
.lp-mp-sub { font-size: 10px; color: var(--lp-ink-muted); margin-top: 2px; }
.lp-mp-total {
  font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 700;
  color: var(--lp-ink-strong); text-align: right; max-width: 50%; word-break: break-all;
}
.lp-mp-total--income { color: var(--lp-accent-ink); }
.lp-col-head {
  display: flex; justify-content: space-between; padding: 5px 12px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em;
  color: var(--lp-ink-muted); text-transform: uppercase; border-bottom: 1px solid var(--lp-line);
}
.lp-mrow { display: flex; align-items: center; gap: 7px; padding: 8px 12px; border-bottom: 1px solid var(--lp-line); }
.lp-dot-swatch { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
.lp-mname { flex: 1; font-size: 11.5px; color: var(--lp-ink-strong); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-mamt { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--lp-ink); white-space: nowrap; }
.lp-mamt--exp { color: var(--lp-ink-soft); }
@keyframes lpRowIn {
  from { opacity: 0; transform: translateY(-5px); max-height: 0; }
  to   { opacity: 1; transform: none; max-height: 40px; }
}
.lp-mrow--new { animation: lpRowIn 300ms ease forwards; }
.lp-madd {
  position: relative; display: flex; align-items: center; gap: 5px;
  padding: 7px 10px; background: var(--lp-well); border-top: 1px dashed var(--lp-line-strong);
}
.lp-madd-plus, .lp-madd-check {
  width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;
  border: 1px solid var(--lp-pos); display: grid; place-items: center;
  color: var(--lp-accent-ink); line-height: 1;
}
.lp-madd-plus { font-size: 14px; }
.lp-madd-check { font-size: 11px; }
.lp-madd-plus--exp, .lp-madd-check--exp { border-color: var(--lp-neg-fill); color: var(--lp-neg); }
.lp-madd-field {
  flex: 1; min-width: 0; background: var(--lp-surface);
  border: 1px solid var(--lp-line-strong); border-radius: 4px; padding: 4px 7px;
  font-size: 11px; color: var(--lp-ink-strong); display: flex; align-items: center;
  min-height: 26px; overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.lp-madd-field--amt { flex: 0 0 56px; font-variant-numeric: tabular-nums; }
.lp-madd-field--focus { border-color: var(--lp-pos); box-shadow: 0 0 0 2px var(--lp-accent-wash); }
.lp-ph { color: var(--lp-ink-muted); opacity: 0.7; }
.lp-cursor {
  display: inline-block; width: 1.5px; height: 12px; background: var(--lp-accent-ink);
  animation: lpBlink 1s step-end infinite; margin-left: 1px; flex-shrink: 0; vertical-align: middle;
}
@keyframes lpBlink { 0%,100%{opacity:1} 50%{opacity:0} }
.lp-key-badge {
  position: absolute; bottom: calc(100% + 3px);
  background: var(--lp-ink-strong); color: var(--lp-bg);
  border-radius: 4px; padding: 2px 6px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em;
  font-family: 'SF Mono', 'Courier New', monospace;
  white-space: nowrap; pointer-events: none; z-index: 5;
  transition: opacity 150ms ease; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
.lp-key-badge--tab  { left: 50%; transform: translateX(-50%); }
.lp-key-badge--enter { right: 6px; }

/* ── Facts strip, just under the risen window ── */
.lp-strip {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  max-width: 820px; margin: 0 auto; padding: 196px 24px 0; text-align: center;
  font-size: 14px; font-weight: 550; color: var(--lp-ink-soft);
}
.lp-strip-pip { display: block; width: 8px; height: 8px; border-radius: 50%; background: var(--lp-pos); flex-shrink: 0; }

/* ── Feature sections: one idea, one picture ── */
.lp-feat { max-width: 1040px; margin: 0 auto; padding: 120px 24px 0; text-align: center; }
.lp-feat-copy { max-width: 660px; margin: 0 auto 40px; }
.lp-feat-h2, .lp-cmp-h2 {
  font-size: clamp(26px, 3.4vw, 42px); font-weight: 800; letter-spacing: -0.03em;
  line-height: 1.12; color: var(--lp-ink-strong);
}
.lp-feat-p { font-size: 16.5px; color: var(--lp-ink-soft); line-height: 1.65; margin-top: 14px; }
.lp-feat-frame {
  position: relative; isolation: isolate; text-align: left;
  max-width: 900px; margin: 0 auto; padding: clamp(22px, 6vw, 72px);
  border-radius: 24px; box-shadow: var(--lp-shadow);
  background: linear-gradient(145deg, var(--fa), var(--fb));
}
.lp-feat-frame--blue   { --fa: hsl(214 88% 64%); --fb: hsl(236 70% 56%); }
.lp-feat-frame--green  { --fa: hsl(152 52% 62%); --fb: hsl(176 48% 46%); }
.lp-feat-frame--violet { --fa: hsl(262 70% 70%); --fb: hsl(290 46% 56%); }
:root[data-theme="dark"] .lp-feat-frame--blue   { --fa: hsl(218 52% 30%); --fb: hsl(238 44% 20%); }
:root[data-theme="dark"] .lp-feat-frame--green  { --fa: hsl(156 40% 24%); --fb: hsl(180 40% 15%); }
:root[data-theme="dark"] .lp-feat-frame--violet { --fa: hsl(262 38% 30%); --fb: hsl(290 30% 19%); }

/* CSV table */
.lp-csv-table {
  background: var(--lp-surface); border-radius: 12px; overflow: hidden;
  font-size: 12.5px; box-shadow: var(--lp-shadow);
}
.lp-csv-head, .lp-csv-row { display: grid; grid-template-columns: 58px 1fr 70px 100px; padding: 10px 16px; align-items: center; }
.lp-csv-head {
  background: var(--lp-well); border-bottom: 1px solid var(--lp-line);
  font-size: 10.5px; font-weight: 720; letter-spacing: 0.06em; text-transform: uppercase; color: var(--lp-ink-muted);
}
.lp-csv-row {
  border-bottom: 1px solid var(--lp-line); color: var(--lp-ink-strong);
  opacity: 0; transform: translateY(5px);
  transition: opacity 280ms ease, transform 280ms ease;
}
.lp-csv-row:last-child { border-bottom: none; }
.lp-csv-row--in { opacity: 1; transform: none; }
.lp-csv-date { color: var(--lp-ink-muted); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.lp-csv-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; font-weight: 550; }
.lp-csv-amt  { text-align: right; padding-right: 10px; font-variant-numeric: tabular-nums; }
.lp-csv-cat {
  justify-self: start; background: transparent;
  border: 1px solid transparent; border-radius: 999px; padding: 1px 9px;
  font-size: 11px; font-weight: 650; color: transparent; white-space: nowrap;
  transition: color 260ms ease, border-color 260ms ease, background-color 260ms ease;
}
.lp-csv-cat--in { color: var(--lp-accent-ink); border-color: var(--lp-pos); background: var(--lp-accent-wash); }

/* Mini ledger */
.lp-mini-ledger { display: flex; gap: 14px; align-items: flex-start; }
.lp-mini-panel {
  flex: 1; min-width: 0; border-radius: 12px; overflow: hidden;
  background: var(--lp-surface); box-shadow: var(--lp-shadow);
}
.lp-mini-panel--income { border-top: 3px solid var(--lp-pos); }
.lp-mini-panel--expense { border-top: 3px solid var(--lp-neg-fill); }
.lp-mini-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 11px 16px; font-size: 13.5px; font-weight: 700; color: var(--lp-ink-strong);
  border-bottom: 1px solid var(--lp-line); background: var(--lp-well);
}
.lp-mini-total { font-variant-numeric: tabular-nums; font-size: 13.5px; }
.lp-mini-total--income { color: var(--lp-accent-ink); }
.lp-mini-row {
  display: flex; justify-content: space-between; padding: 9px 16px;
  font-size: 13px; color: var(--lp-ink); border-bottom: 1px solid var(--lp-line);
  font-variant-numeric: tabular-nums;
}
.lp-mini-row:last-child { border-bottom: none; }
.lp-mini-row--indent { padding-left: 30px; color: var(--lp-ink-soft); }
.lp-mini-cat {
  display: flex; align-items: center; gap: 8px; padding: 8px 16px;
  font-size: 12px; font-weight: 700; color: var(--lp-ink-soft); border-bottom: 1px solid var(--lp-line);
}
.lp-mini-cat-pip { width: 7px; height: 7px; border-radius: 50%; background: #e84393; flex-shrink: 0; }
.lp-mini-cat-amt { margin-left: auto; font-variant-numeric: tabular-nums; }

/* Chart */
.lp-chart { background: var(--lp-surface); border-radius: 12px; padding: 18px 18px 14px; box-shadow: var(--lp-shadow); }
.lp-chart-title {
  font-size: 11px; font-weight: 720; color: var(--lp-ink-muted);
  letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 12px;
}
.lp-chart-lbl { font-size: 8.5px; fill: var(--lp-ink-muted); }
.lp-chart-legend { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: var(--lp-ink-soft); }
.lp-chart-pip { display: inline-block; width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.lp-chart-pip--pos { background: var(--lp-pos); margin-right: 4px; }
.lp-chart-pip--neg { background: var(--lp-neg-fill); margin-left: 14px; margin-right: 4px; }
.lp-chart-stage { position: relative; overflow: hidden; height: 126px; }
.lp-chart-scroll { position: absolute; top: 0; left: 0; transition: opacity 500ms ease; }
@keyframes lpBarScroll { from { transform: translateX(0); } to { transform: translateX(-312px); } }
.lp-chart-scroll--run { animation: lpBarScroll 3.2s ease-in-out forwards; }
.lp-chart-proj {
  position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center;
  transition: opacity 500ms ease; background: var(--lp-surface); padding: 4px 2px;
}
.lp-proj-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
.lp-proj-stat { display: flex; flex-direction: column; gap: 2px; }
.lp-proj-stat--rate { flex-direction: row; align-items: center; justify-content: space-between; }
.lp-proj-label { font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--lp-ink-muted); }
.lp-proj-val { font-variant-numeric: tabular-nums; font-size: 17px; font-weight: 750; color: var(--lp-ink-strong); letter-spacing: -0.02em; }
.lp-proj-val--pos { color: var(--lp-accent-ink); }
.lp-proj-dial-wrap { flex-shrink: 0; }

/* ── Privacy ── */
.lp-privacy { max-width: 780px; margin: 0 auto; padding: 128px 24px 0; text-align: center; }
.lp-privacy-mark {
  display: inline-grid; place-items: center; width: 52px; height: 52px; border-radius: 50%;
  background: var(--lp-accent-wash); color: var(--lp-accent-ink); margin-bottom: 18px;
}
.lp-textlink {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 18px;
  font-weight: 650; font-size: 15px; text-decoration: none;
}
.lp-textlink:hover { text-decoration: underline; }

/* ── Lists: banks, resources, FAQ ── */
.lp-banks, .lp-res, .lp-faq { max-width: 920px; margin: 0 auto; padding: 120px 24px 0; }
.lp-banks, .lp-res > .lp-eyebrow, .lp-res > .lp-cmp-h2, .lp-res > .lp-section-p, .lp-faq > .lp-cmp-h2 { text-align: center; }
.lp-res > .lp-eyebrow { display: block; }
.lp-eyebrow {
  display: inline-block; margin-bottom: 12px; color: var(--lp-accent-ink);
  font-size: 12px; font-weight: 750; letter-spacing: 0.1em; text-transform: uppercase;
}
.lp-cmp-h2 { margin-bottom: 14px; }
.lp-section-p { color: var(--lp-ink-soft); font-size: 16px; line-height: 1.65; max-width: 640px; margin: 0 auto 32px; }
.lp-section-p a, .lp-faq-item dd a { color: var(--lp-accent-ink); text-decoration: none; font-weight: 600; }
.lp-section-p a:hover { text-decoration: underline; }
.lp-bank-grid { list-style: none; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.lp-bank {
  display: inline-block; padding: 9px 15px; border-radius: 999px;
  border: 1px solid var(--lp-line-strong); background: var(--lp-surface);
  color: var(--lp-ink-strong); text-decoration: none; font-size: 13.5px; font-weight: 600;
  transition: border-color 150ms var(--lp-ease), background-color 150ms var(--lp-ease);
}
.lp-page a.lp-bank { color: var(--lp-ink-strong); }
a.lp-bank:hover { border-color: var(--lp-pos); background: var(--lp-accent-wash); }
.lp-res-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.lp-res-card {
  display: flex; flex-direction: column; gap: 4px; padding: 18px 20px; border-radius: 14px;
  border: 1px solid var(--lp-line-strong); background: var(--lp-surface); text-decoration: none;
  transition: border-color 150ms var(--lp-ease), background-color 150ms var(--lp-ease);
}
.lp-res-card:hover { border-color: var(--lp-pos); background: var(--lp-well); }
.lp-res-card strong { color: var(--lp-ink-strong); font-size: 15px; font-weight: 680; }
.lp-res-card span { color: var(--lp-ink-soft); font-size: 13.5px; line-height: 1.5; }
.lp-faq-list { margin: 8px 0 24px; }
.lp-faq-item { padding: 18px 0; border-top: 1px solid var(--lp-line-strong); }
.lp-faq-item:last-child { border-bottom: 1px solid var(--lp-line-strong); }
.lp-faq-item dt { color: var(--lp-ink-strong); font-weight: 680; font-size: 16px; margin-bottom: 6px; }
.lp-faq-item dd { color: var(--lp-ink-soft); font-size: 15px; line-height: 1.65; }
.lp-faq > .lp-section-p { margin: 0; max-width: none; }

/* ── Comparison, on a warm band ── */
.lp-band { background: var(--lp-band); margin-top: 120px; }
.lp-cmp { max-width: 900px; margin: 0 auto; padding: 96px 24px; }
.lp-cmp .lp-cmp-h2 { text-align: center; margin-bottom: 36px; }
.lp-cmp-table { border-radius: 16px; overflow: hidden; background: var(--lp-surface); box-shadow: var(--lp-shadow); }
.lp-cmp-head { display: grid; grid-template-columns: 1fr repeat(3, 140px); background: var(--lp-well); border-bottom: 1px solid var(--lp-line); }
.lp-cmp-col { padding: 14px 12px; font-size: 13px; font-weight: 700; color: var(--lp-ink-muted); text-align: center; }
.lp-cmp-col--hi { color: var(--lp-accent-ink); }
.lp-cmp-row { display: grid; grid-template-columns: 1fr repeat(3, 140px); border-bottom: 1px solid var(--lp-line); align-items: center; }
.lp-cmp-row:last-child { border-bottom: none; }
.lp-cmp-label { padding: 14px 18px; font-size: 14px; color: var(--lp-ink-strong); }
.lp-cmp-cell { padding: 14px 12px; text-align: center; display: flex; align-items: center; justify-content: center; color: var(--lp-ink-muted); }
.lp-cmp-cell--hi { color: var(--lp-accent-ink); background: var(--lp-accent-wash); }
.lp-check-muted { color: var(--lp-ink-muted); }
.lp-cmp-text { font-size: 12.5px; }

/* ── End band: final CTA and footer, back on the frame ── */
.lp-endband { position: relative; isolation: isolate; margin-top: 128px; }
.lp-end { text-align: center; padding: 120px 24px 104px; }
.lp-end-h2 { font-size: clamp(32px, 4.6vw, 58px); font-weight: 830; letter-spacing: -0.035em; color: #fff; margin-bottom: 10px; }
.lp-end-deck { font-size: 18px; color: rgba(255, 255, 255, 0.9); margin-bottom: 34px; }
.lp-end-note { margin-top: 18px; font-size: 14px; color: rgba(255, 255, 255, 0.9); }
.lp-footer {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;
  max-width: 1180px; margin: 0 auto; padding: 22px 32px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 13px; color: rgba(255, 255, 255, 0.88);
}
.lp-footer-brand { letter-spacing: -0.01em; }
.lp-footer-links { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; min-width: 0; }
.lp-page .lp-footer-link, .lp-footer-link { color: rgba(255, 255, 255, 0.9); text-decoration: none; }
.lp-footer-link:hover { color: #fff; text-decoration: underline; }
.lp-footer-linkbtn { background: none; border: none; padding: 0; margin: 0; font: inherit; cursor: pointer; }

/* ── Responsive ── */
@media (max-width: 880px) {
  .lp-nav-links { display: none; }
  .lp-nav { height: calc(56px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); }
  .lp-nav-inner { padding: 0 16px; gap: 12px; }
  .lp-nav-brand { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lp-nav .lp-btn { flex: 0 0 auto; min-height: 40px; }
  .lp-hero { padding: 100px 16px 0; }
  .lp-sub { font-size: 16px; }
  .lp-hero-mock { margin: 44px auto -110px; }
  .lp-sticker { width: 84px; height: 84px; top: -36px; right: -6px; }
  .lp-strip { padding: 144px 20px 0; font-size: 13.5px; }
  .lp-feat, .lp-banks, .lp-res, .lp-faq { padding-top: 88px; }
  .lp-privacy { padding-top: 96px; }
  .lp-feat-frame { border-radius: 18px; }
  .lp-band { margin-top: 88px; }
  .lp-cmp { padding: 72px 16px; }
  .lp-cmp-head, .lp-cmp-row { grid-template-columns: 1fr repeat(3, 84px); }
  .lp-cmp-col { padding: 11px 6px; font-size: 12px; }
  .lp-cmp-label { padding: 11px 12px; font-size: 13px; }
  .lp-endband { margin-top: 96px; }
  .lp-end { padding: 88px 20px 72px; }
  .lp-footer { padding: 18px 20px calc(18px + env(safe-area-inset-bottom, 0px)); }
  .lp-footer-link { padding: 6px 0; }
  .lp-btn--lg { min-height: 52px; }
  .lp-feat > *, .lp-hero > * { min-width: 0; }
}
@media (max-width: 560px) {
  .lp-feat, .lp-banks, .lp-res, .lp-faq, .lp-privacy { padding-left: 16px; padding-right: 16px; }
  .lp-feat-frame { margin: 0 -4px; padding: 16px; }
  .lp-strip-pip { display: none; }
  .lp-mini-ledger { flex-direction: column; align-items: stretch; }
  .lp-csv-head, .lp-csv-row { grid-template-columns: 46px 1fr 62px; padding: 9px 12px; }
  .lp-csv-head span:last-child { display: none; }
  .lp-csv-cat { grid-column: 2 / 4; margin-top: 4px; }
  .lp-csv-cat:not(.lp-csv-cat--in) { display: none; }
}
@media (max-width: 460px) {
  .lp-mock-body { grid-template-columns: 1fr; }
  .lp-mp--income { border-right: none; border-bottom: 1px solid var(--lp-line); }
}
@media (max-width: 380px) {
  .lp-cmp-head, .lp-cmp-row { grid-template-columns: minmax(0, 1fr) repeat(3, 58px); }
  .lp-cmp-col { font-size: 11px; padding: 10px 2px; }
  .lp-cmp-label { padding: 10px 8px; font-size: 12px; }
  .lp-nav-inner { padding: 0 12px; }
  .lp-btn--sm { padding: 8px 11px; }
  .lp-btn--lg { width: 100%; justify-content: center; }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .lp-hero .lp-r, .lp-btn, .lp-cursor, .lp-nav, .lp-sticker { transition: none; animation: none; }
  .lp-hero .lp-r { opacity: 1; transform: none; }
  .lp-sticker:hover { transform: rotate(-12deg); }
  .lp-cursor { opacity: 1; }
  .lp-csv-row { opacity: 1; transform: none; transition: none; }
  .lp-csv-cat { color: var(--lp-accent-ink); border-color: var(--lp-pos); background: var(--lp-accent-wash); }
  .lp-chart-scroll--run { animation: none; }
  .lp-mrow--new { animation: none; opacity: 1; transform: none; }
}
`;
