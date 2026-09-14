import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { BANK_GUIDES } from "./generated/bankGuides";

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

const CSV_ROWS = [
  { date: "13 Jun", desc: "TESCO EXTRA 4261", amt: "42.61", cat: "Food" },
  { date: "12 Jun", desc: "SOUTHERN RAIL",    amt: "12.40", cat: "Transport" },
  { date: "11 Jun", desc: "COSTA COFFEE",     amt: "4.35",  cat: "Eating out" },
  { date: "09 Jun", desc: "BUPA DENTAL PLAN", amt: "75.00", cat: "Health" },
] as const;

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

const FAQ = [
  { q: "Is The Income Tracker free?", a: "Yes. Completely free: no credit card, no subscription, no sign-up. Open it and start." },
  { q: "Do I need to connect or log in to my bank?", a: "No. Download a CSV from your bank and drop it in. There is no open banking connection and you never enter bank credentials." },
  { q: "Which UK banks does it work with?", a: "Any bank that exports CSV, OFX or QIF: Barclays, HSBC, Lloyds, NatWest, Santander, Nationwide, Halifax, TSB, Monzo, Starling, Revolut, Chase, Amex and more. Step-by-step export guides cover 20 banks, and PDF statements can be pasted in." },
  { q: "Where is my financial data stored?", a: "In your browser, on your device. Nothing is uploaded unless you choose to sign in to sync across devices, and you can export everything at any time." },
  { q: "Is it an alternative to YNAB, Emma or Money Dashboard?", a: "For a free, private monthly picture of income, spending and surplus, yes. The comparison pages say plainly where each of those wins." },
  { q: "Does it work on a phone?", a: "Yes. It runs in any browser, installs to your home screen like an app, and works offline once loaded." },
] as const;

const RESOURCES = [
  { href: "/tools/weekly-to-monthly-budget-calculator.html", t: "Weekly to monthly calculator", d: "Convert pay and bills to the same budget period" },
  { href: "/tools/split-bills-by-income-calculator.html", t: "Split bills by income", d: "Compare proportional contributions with 50/50" },
  { href: "/tools/christmas-budget-savings-calculator.html", t: "Christmas savings planner", d: "Work out how much to put aside each payday" },
  { href: "/import/", t: "Bank CSV guides", d: "Export from 20 UK banks, step by step" },
  { href: "/guides/", t: "Budgeting guides", d: "Answer-first, no jargon, no bank login" },
  { href: "/tools/", t: "Free calculators", d: "50/30/20, emergency fund, payoff, surplus" },
  { href: "/templates/", t: "Budget templates", d: "Free CSVs that import in one step" },
  { href: "/compare/", t: "Compare apps", d: "Honest side-by-sides, including where we lose" },
  { href: "/whats-new.html", t: "What\u2019s new", d: "Release notes, newest first" },
] as const;

type HeroFocus = "inc-name" | "inc-amt" | "exp-name" | "exp-amt" | null;

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingPage({ onEnter, onFeedback }: { onEnter: () => void; onFeedback: () => void }) {
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
      setHeroIncAdded([{ name: "Interest", amt: "78.00" }]);
      setHeroExpAdded([
        { name: "Costa Coffee", amt: "4.20" },
        { name: "Work commute", amt: "120.00" },
      ]);
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

      // Income: "Interest" → Tab → "78" → Enter
      t = 600;
      t = typeStr("Interest", setHeroName, t);
      t += 320; push(() => setHeroTabBadge(true), t);
      t += 350; push(() => { setHeroTabBadge(false); setHeroFocus("inc-amt"); }, t);
      t += 100; t = typeStr("78", setHeroAmt, t, 200);
      t += 250; push(() => setHeroEnterBadge(true), t);
      t += 350; push(() => {
        setHeroEnterBadge(false);
        setHeroFocus(null);
        setHeroIncAdded([{ name: "Interest", amt: "78.00" }]);
        setHeroName(""); setHeroAmt("");
      }, t);
      t += 400;

      // Expense 1: "Costa Coffee" → Tab → "4.20" → Enter
      push(() => setHeroFocus("exp-name"), t);
      t += 250; t = typeStr("Costa Coffee", setHeroName, t);
      t += 320; push(() => setHeroTabBadge(true), t);
      t += 350; push(() => { setHeroTabBadge(false); setHeroFocus("exp-amt"); }, t);
      t += 100; t = typeStr("4.20", setHeroAmt, t, 200);
      t += 250; push(() => setHeroEnterBadge(true), t);
      t += 350; push(() => {
        setHeroEnterBadge(false);
        setHeroFocus(null);
        setHeroExpAdded([{ name: "Costa Coffee", amt: "4.20" }]);
        setHeroName(""); setHeroAmt("");
      }, t);
      t += 400;

      // Expense 2: "Work commute" → Tab → "120" → Enter
      push(() => setHeroFocus("exp-name"), t);
      t += 250; t = typeStr("Work commute", setHeroName, t);
      t += 320; push(() => setHeroTabBadge(true), t);
      t += 350; push(() => { setHeroTabBadge(false); setHeroFocus("exp-amt"); }, t);
      t += 100; t = typeStr("120", setHeroAmt, t, 200);
      t += 250; push(() => setHeroEnterBadge(true), t);
      t += 350; push(() => {
        setHeroEnterBadge(false);
        setHeroFocus(null);
        setHeroExpAdded(prev => [...prev, { name: "Work commute", amt: "120.00" }]);
        setHeroName(""); setHeroAmt("");
      }, t);

      // Hold 2.5s then loop
      t += 2500;
      push(runLoop, t);
    }

    push(runLoop, 800);
    return () => { alive = false; tids.forEach(clearTimeout); };
  }, [reduced]);

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
  const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2 });

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
            <a href="/import/">Bank guides</a>
            <a href="/guides/">Guides</a>
            <a href="/tools/">Calculators</a>
            <a href="/compare/">Compare</a>
          </nav>
          <button className="lp-btn lp-btn--sm" onClick={enter} onMouseEnter={hover}>
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
            <p className="lp-sub">
              A month-by-month ledger for your income and expenses.
              Download a CSV from Barclays, HSBC, Monzo or Starling
              and import it in seconds. No account connection needed.
            </p>
            <div className="lp-actions">
              <button className="lp-btn lp-btn--lg" onClick={enter} onMouseEnter={hover}>
                Open the ledger <ArrowRight size={18} />
              </button>
              <button className="lp-skip" onClick={enter}>
                Already use it? Skip the tour
              </button>
            </div>
          </div>

          <div className="lp-hero-mock lp-r" style={{ transitionDelay: "200ms" }}>
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
                    <span className="lp-mp-total lp-mp-total--income">£{fmt(incomeTotal)}</span>
                  </div>
                  <div className="lp-col-head"><span>Source</span><span>Amount</span></div>
                  <div className="lp-mrow">
                    <span className="lp-dot-swatch" style={{ background: "#6c5ce7" }} />
                    <span className="lp-mname">Salary</span>
                    <span className="lp-mamt">£ 3,248.72</span>
                  </div>
                  {heroIncAdded.map(r => (
                    <div key={r.name} className="lp-mrow lp-mrow--new">
                      <span className="lp-dot-swatch" style={{ background: "#00b894" }} />
                      <span className="lp-mname">{r.name}</span>
                      <span className="lp-mamt">£ {r.amt}</span>
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
                        ? <>£{heroAmt}<span className="lp-cursor" /></>
                        : <span className="lp-ph">£</span>}
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
                    <span className="lp-mp-total">£{fmt(expenseTotal)}</span>
                  </div>
                  <div className="lp-col-head"><span>Expense</span><span>Amount</span></div>
                  {heroExpAdded.map(r => (
                    <div key={r.name} className="lp-mrow lp-mrow--new">
                      <span className="lp-mname">{r.name}</span>
                      <span className="lp-mamt lp-mamt--exp">£ {r.amt}</span>
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
                        ? <>£{heroAmt}<span className="lp-cursor" /></>
                        : <span className="lp-ph">£</span>}
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
          No open banking. No Plaid. No third-party access to your accounts.
          Just a CSV file you download yourself.
        </div>

        {/* ════ DEMO 1: CSV import ════ */}
        <section className="lp-demo lp-r" ref={el => { csvRef.current = el; }}>
          <div className="lp-demo-media">
            <div className="lp-csv-table">
              <div className="lp-csv-head">
                <span>Date</span><span>Description</span><span>Amount</span><span>Category</span>
              </div>
              {CSV_ROWS.map((row, i) => (
                <div key={row.desc} className={`lp-csv-row${csvStep > i ? " lp-csv-row--in" : ""}`}>
                  <span className="lp-csv-date">{row.date}</span>
                  <span className="lp-csv-desc">{row.desc}</span>
                  <span className="lp-csv-amt">£{row.amt}</span>
                  <span className={`lp-csv-cat${csvStep > CSV_ROWS.length + i ? " lp-csv-cat--in" : ""}`}>{row.cat}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="lp-demo-copy">
            <span className="lp-eyebrow">Bank CSV import</span>
            <h2 className="lp-demo-h2">Import from any UK bank</h2>
            <p className="lp-demo-p">
              Download a statement from Barclays, HSBC, Monzo or Starling.
              Drop the CSV into the app. Dates, descriptions and amounts are
              read automatically.
            </p>
            <p className="lp-demo-note">No formatting required. Works with standard bank exports.</p>
          </div>
        </section>

        {/* ════ DEMO 2: Monthly ledger ════ */}
        <section className="lp-demo lp-demo--flip lp-r">
          <div className="lp-demo-copy">
            <span className="lp-eyebrow">Monthly ledger</span>
            <h2 className="lp-demo-h2">See every month side by side</h2>
            <p className="lp-demo-p">
              Income on the left, expenses on the right. Drag transactions into
              named categories. Totals update as you type. Navigate between
              months with one click.
            </p>
          </div>
          <div className="lp-demo-media">
            <div className="lp-mini-ledger">
              <div className="lp-mini-panel lp-mini-panel--income">
                <div className="lp-mini-head">
                  <span>Income</span>
                  <span className="lp-mini-total lp-mini-total--income">£3,248.72</span>
                </div>
                <div className="lp-mini-row"><span>Salary (BACS)</span><span>£3,248.72</span></div>
              </div>
              <div className="lp-mini-panel lp-mini-panel--expense">
                <div className="lp-mini-head">
                  <span>Expenses</span>
                  <span className="lp-mini-total">£144.35</span>
                </div>
                <div className="lp-mini-cat">
                  <span className="lp-mini-cat-pip" /><span>Food</span>
                  <span className="lp-mini-cat-amt">£42.61</span>
                </div>
                <div className="lp-mini-row lp-mini-row--indent"><span>Tesco Extra</span><span>£42.61</span></div>
                <div className="lp-mini-row"><span>Southern Rail</span><span>£12.40</span></div>
                <div className="lp-mini-row"><span>Costa Coffee</span><span>£4.35</span></div>
                <div className="lp-mini-row"><span>Dentist (Bupa)</span><span>£75.00</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* ════ DEMO 3: Annual chart ⇄ projection card ════ */}
        <section className="lp-demo lp-r" ref={el => { annualRef.current = el; }}>
          <div className="lp-demo-media">
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
                      stroke="rgba(212,228,250,0.09)" strokeWidth={1} />
                    {BAR_EXT.map((b, i) => {
                      const h = Math.max((Math.abs(b.v) / maxV) * 52, 2);
                      const pos = b.v >= 0;
                      const x = 4 + i * 26;
                      const y = pos ? 62 - h : 62;
                      return (
                        <g key={i}>
                          <rect x={x} y={y} width={18} height={h} rx={3}
                            fill={pos ? "#00dfc1" : "#ff7675"} opacity={0.82} />
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
                      <span className="lp-proj-val">£39,330</span>
                    </div>
                    <div className="lp-proj-stat">
                      <span className="lp-proj-label">Projected outgoings</span>
                      <span className="lp-proj-val">£33,140</span>
                    </div>
                    <div className="lp-proj-stat">
                      <span className="lp-proj-label">Projected surplus</span>
                      <span className="lp-proj-val lp-proj-val--pos">+£6,190</span>
                    </div>
                    <div className="lp-proj-stat lp-proj-stat--rate">
                      <div>
                        <span className="lp-proj-label">Savings rate</span>
                        <span className="lp-proj-val lp-proj-val--pos">15.7%</span>
                      </div>
                      <div className="lp-proj-dial-wrap">
                        <svg width={46} height={46} viewBox="0 0 46 46" aria-hidden="true">
                          <circle cx={23} cy={23} r={dialR}
                            fill="none" stroke="rgba(212,228,250,0.12)" strokeWidth={5} />
                          <circle cx={23} cy={23} r={dialR}
                            fill="none" stroke="#00dfc1" strokeWidth={5}
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
          <div className="lp-demo-copy">
            <span className="lp-eyebrow">Annual picture</span>
            <h2 className="lp-demo-h2">One year, not one month</h2>
            <p className="lp-demo-p">
              The annual summary adds up every month you have entered.
              See your total balance, monthly average and projected savings
              for the year ahead. All calculated from what you actually put in.
            </p>
          </div>
        </section>

        {/* ════ BANKS ════ */}
        <section className="lp-banks lp-r" aria-labelledby="lp-banks-h2">
          <span className="lp-eyebrow">Works with your bank</span>
          <h2 className="lp-cmp-h2" id="lp-banks-h2">CSV export guides for {BANK_GUIDES.length} UK banks</h2>
          <p className="lp-section-p">
            Every major UK bank lets you download your own transactions. Pick yours for the exact steps, then import the file here.
            Only got a PDF? <a href="/guides/import-pdf-bank-statement.html">Paste it in</a>.
          </p>
          <ul className="lp-bank-grid">
            {BANK_GUIDES.map(bank => (
              <li key={bank.slug}>
                <a className="lp-bank" href={`/import/${bank.slug}.html`}>{bank.name}</a>
              </li>
            ))}
          </ul>
        </section>

        {/* ════ COMPARISON ════ */}
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

        {/* ════ RESOURCES ════ */}
        <section className="lp-res lp-r" aria-labelledby="lp-res-h2">
          <span className="lp-eyebrow">Free, with or without the app</span>
          <h2 className="lp-cmp-h2" id="lp-res-h2">Guides, calculators and templates</h2>
          <div className="lp-res-grid">
            {RESOURCES.map(r => (
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
            {FAQ.map(item => (
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

        {/* ════ FINAL CTA ════ */}
        <section className="lp-end lp-r">
          <h2 className="lp-end-h2">Open your first month.</h2>
          <p className="lp-end-deck">It takes about two minutes.</p>
          <button className="lp-btn lp-btn--lg" onClick={enter} onMouseEnter={hover}>
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
          </nav>
        </footer>

      </main>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.lp-page {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #010f1f;
  color: #d4e4fa;
  line-height: 1.6;
  padding-top: 56px;
}

/* ── Nav ── */
.lp-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  height: 56px;
  background: rgba(1, 15, 31, 0.84);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(212, 228, 250, 0.07);
  transform: translateY(-100%); opacity: 0;
  transition: transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 380ms ease;
}
.lp-nav--in { transform: translateY(0); opacity: 1; }
.lp-nav-inner {
  max-width: 1180px; margin: 0 auto; height: 100%; padding: 0 32px;
  display: flex; align-items: center; justify-content: space-between;
}
.lp-nav-brand {
  font-size: 15px; font-weight: 680;
  color: rgba(212, 228, 250, 0.88); letter-spacing: -0.01em;
}

/* ── Button ── */
.lp-btn {
  display: inline-flex; align-items: center; gap: 7px;
  background: #00dfc1; color: #010f1f;
  border: none; border-radius: 10px;
  font-family: inherit; font-weight: 700;
  cursor: pointer; text-decoration: none;
  transition: transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 160ms ease;
  white-space: nowrap;
}
.lp-btn:hover { transform: translateY(-2px) scale(1.025); box-shadow: 0 10px 30px rgba(0, 223, 193, 0.32); }
.lp-btn:active { transform: scale(0.97) !important; box-shadow: none !important; }
.lp-btn--sm { padding: 8px 15px; font-size: 13px; }
.lp-btn--lg { padding: 15px 28px; font-size: 15px; border-radius: 12px; }

/* ── Hero ── */
.lp-hero {
  display: grid; grid-template-columns: 1fr 1fr;
  min-height: calc(100vh - 56px);
  max-width: 1180px; margin: 0 auto;
  padding: 60px 40px; gap: 56px; align-items: center;
}
.lp-h1 {
  font-size: clamp(30px, 4vw, 56px);
  font-weight: 840; letter-spacing: -0.03em;
  line-height: 1.1; color: #eef4ff; margin-bottom: 22px;
}
.lp-accent { color: #00dfc1; }
.lp-sub {
  font-size: 16px; color: rgba(212, 228, 250, 0.66);
  line-height: 1.7; max-width: 420px; margin-bottom: 36px;
}
.lp-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.lp-skip {
  background: none; border: none;
  color: rgba(212, 228, 250, 0.28); font-size: 13px;
  cursor: pointer; font-family: inherit; padding: 0;
  transition: color 130ms ease;
}
.lp-skip:hover { color: rgba(212, 228, 250, 0.55); }

/* ── Browser chrome ── */
.lp-browser {
  border-radius: 12px; overflow: hidden;
  border: 1px solid rgba(212, 228, 250, 0.11);
  box-shadow: 0 40px 90px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,228,250,0.03);
  max-width: 560px;
}
.lp-chrome {
  background: rgba(22, 36, 52, 0.98); padding: 9px 14px;
  display: flex; align-items: center; gap: 12px;
  border-bottom: 1px solid rgba(212, 228, 250, 0.07);
}
.lp-dots { display: flex; gap: 5px; }
.lp-dots span {
  display: block; width: 10px; height: 10px; border-radius: 50%;
  background: rgba(212, 228, 250, 0.12);
}
.lp-dots span:nth-child(1) { background: #ff5f57; }
.lp-dots span:nth-child(2) { background: #ffbd2e; }
.lp-dots span:nth-child(3) { background: #28c840; }
.lp-url {
  flex: 1; background: rgba(1, 15, 31, 0.5); border-radius: 6px;
  padding: 4px 12px; font-size: 11px;
  color: rgba(212, 228, 250, 0.32); text-align: center;
  font-family: system-ui, sans-serif;
}

/* ── Mock body: two-column ledger ── */
.lp-mock-body {
  background: #010f1f;
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.lp-mp { /* each panel */ }
.lp-mp--income {
  border-left: 2px solid rgba(0, 223, 193, 0.22);
  border-right: 1px solid rgba(212, 228, 250, 0.07);
}
.lp-mp--expense {
  border-left: 2px solid rgba(255, 118, 117, 0.18);
}
.lp-mp-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 10px 12px;
  background: rgba(39, 54, 71, 0.16);
  border-bottom: 1px solid rgba(212, 228, 250, 0.055);
}
.lp-mp-title {
  font-size: 13px; font-weight: 680; color: #eef4ff;
  display: flex; align-items: center; gap: 5px;
}
.lp-glyph { font-size: 12px; display: inline-block; }
.lp-glyph--in  { color: #00dfc1; }
.lp-glyph--out { color: #ff7675; }
.lp-mp-sub { font-size: 10px; color: rgba(212, 228, 250, 0.38); margin-top: 2px; }
.lp-mp-total {
  font-family: 'SF Mono', monospace; font-size: 12px; font-weight: 660;
  color: #d4e4fa; text-align: right; max-width: 50%; word-break: break-all;
}
.lp-mp-total--income { color: #00dfc1; }
.lp-col-head {
  display: flex; justify-content: space-between; padding: 5px 12px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em;
  color: rgba(212, 228, 250, 0.3); text-transform: uppercase;
  border-bottom: 1px solid rgba(212, 228, 250, 0.05);
}
.lp-mrow {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(212, 228, 250, 0.04);
}
.lp-dot-swatch { width: 7px; height: 7px; border-radius: 2px; flex-shrink: 0; }
.lp-mname { flex: 1; font-size: 11.5px; color: rgba(212, 228, 250, 0.88); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-mamt { font-family: 'SF Mono', monospace; font-size: 11px; color: rgba(212, 228, 250, 0.88); white-space: nowrap; }
.lp-mamt--exp { color: rgba(212, 228, 250, 0.6); }

/* New row slide-in animation */
@keyframes lpRowIn {
  from { opacity: 0; transform: translateY(-5px); max-height: 0; }
  to   { opacity: 1; transform: none; max-height: 40px; }
}
.lp-mrow--new { animation: lpRowIn 300ms ease forwards; }

/* ── Add row (hero mock) ── */
.lp-madd {
  position: relative;
  display: flex; align-items: center; gap: 5px;
  padding: 7px 10px;
  background: rgba(1, 15, 31, 0.28);
  border-top: 1px dashed rgba(212, 228, 250, 0.09);
}
.lp-madd-plus {
  width: 20px; height: 20px; border-radius: 4px;
  border: 1px solid rgba(0, 223, 193, 0.3);
  display: grid; place-items: center;
  color: #00dfc1; font-size: 14px; line-height: 1; flex-shrink: 0;
}
.lp-madd-plus--exp {
  border-color: rgba(255, 118, 117, 0.3);
  color: #ff7675;
}
.lp-madd-field {
  flex: 1; min-width: 0;
  background: rgba(18, 33, 49, 0.7);
  border: 1px solid rgba(212, 228, 250, 0.1);
  border-radius: 4px; padding: 4px 7px;
  font-size: 11px; color: #d4e4fa;
  display: flex; align-items: center;
  min-height: 26px; overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.lp-madd-field--amt {
  flex: 0 0 52px; font-family: 'SF Mono', monospace;
}
.lp-madd-field--focus {
  border-color: rgba(0, 223, 193, 0.45);
  box-shadow: 0 0 0 2px rgba(0, 223, 193, 0.12);
}
.lp-madd-check {
  width: 20px; height: 20px; border-radius: 4px;
  border: 1px solid rgba(0, 223, 193, 0.25);
  display: grid; place-items: center;
  color: #00dfc1; font-size: 11px; flex-shrink: 0;
}
.lp-madd-check--exp {
  border-color: rgba(255, 118, 117, 0.22);
  color: #ff7675;
}
.lp-ph { color: rgba(212, 228, 250, 0.25); }
.lp-cursor {
  display: inline-block; width: 1.5px; height: 12px;
  background: #00dfc1;
  animation: lpBlink 1s step-end infinite;
  margin-left: 1px; flex-shrink: 0; vertical-align: middle;
}
@keyframes lpBlink { 0%,100%{opacity:1} 50%{opacity:0} }

/* ── Key hint badges ── */
.lp-key-badge {
  position: absolute;
  bottom: calc(100% + 3px);
  background: rgba(10, 25, 44, 0.96);
  border: 1px solid rgba(0, 223, 193, 0.38);
  border-radius: 4px; padding: 2px 6px;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em;
  color: #00dfc1;
  font-family: 'SF Mono', 'Courier New', monospace;
  white-space: nowrap; pointer-events: none; z-index: 5;
  transition: opacity 150ms ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
.lp-key-badge--tab  { left: 50%; transform: translateX(-50%); }
.lp-key-badge--enter { right: 6px; }

/* ── Privacy strip ── */
.lp-strip {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 15px 32px; text-align: center;
  font-size: 13.5px; color: rgba(212, 228, 250, 0.6);
  border-top: 1px solid rgba(212, 228, 250, 0.06);
  border-bottom: 1px solid rgba(212, 228, 250, 0.06);
  background: rgba(5, 20, 36, 0.55);
}
.lp-strip-pip {
  display: block; width: 8px; height: 8px; border-radius: 50%;
  background: #00dfc1; flex-shrink: 0;
  box-shadow: 0 0 10px rgba(0, 223, 193, 0.5);
}

/* ── Demo sections ── */
.lp-demo {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 64px; align-items: center;
  max-width: 1100px; margin: 0 auto; padding: 88px 40px;
}
.lp-demo--flip .lp-demo-copy  { order: 1; }
.lp-demo--flip .lp-demo-media { order: 2; }
.lp-eyebrow {
  display: inline-block; margin-bottom: 10px;
  color: #00dfc1; font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px; font-weight: 720; letter-spacing: 0.12em; text-transform: uppercase;
}
.lp-demo-h2 {
  font-size: clamp(22px, 2.8vw, 34px); font-weight: 760;
  letter-spacing: -0.022em; color: #eef4ff; line-height: 1.2; margin-bottom: 14px;
}
.lp-demo-p  { font-size: 15px; color: rgba(212, 228, 250, 0.66); line-height: 1.7; margin-bottom: 12px; }
.lp-demo-note { font-size: 13px; color: rgba(212, 228, 250, 0.35); line-height: 1.55; }

/* ── CSV table ── */
.lp-csv-table {
  background: rgba(8, 22, 38, 0.92); border: 1px solid rgba(212, 228, 250, 0.1);
  border-radius: 10px; overflow: hidden; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
}
.lp-csv-head {
  display: grid; grid-template-columns: 54px 1fr 60px 90px;
  padding: 9px 14px;
  background: rgba(39, 54, 71, 0.26); border-bottom: 1px solid rgba(212, 228, 250, 0.07);
  font-size: 10.5px; font-weight: 720; letter-spacing: 0.06em;
  text-transform: uppercase; color: rgba(212, 228, 250, 0.35);
}
.lp-csv-row {
  display: grid; grid-template-columns: 54px 1fr 60px 90px;
  padding: 8px 14px; align-items: center;
  border-bottom: 1px solid rgba(212, 228, 250, 0.04);
  color: rgba(212, 228, 250, 0.72);
  opacity: 0; transform: translateY(5px);
  transition: opacity 280ms ease, transform 280ms ease;
}
.lp-csv-row--in { opacity: 1; transform: none; }
.lp-csv-date { color: rgba(212, 228, 250, 0.38); font-size: 11px; }
.lp-csv-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
.lp-csv-amt  { text-align: right; }
.lp-csv-cat {
  display: inline-block; background: rgba(0, 223, 193, 0.07);
  border: 1px solid transparent; border-radius: 4px; padding: 1px 6px;
  font-size: 11px; color: transparent; white-space: nowrap;
  transition: color 260ms ease, border-color 260ms ease, background 260ms ease;
}
.lp-csv-cat--in { color: #00dfc1; border-color: rgba(0, 223, 193, 0.22); background: rgba(0, 223, 193, 0.09); }

/* ── Mini ledger demo ── */
.lp-mini-ledger { display: flex; flex-direction: row; gap: 12px; align-items: flex-start; }
.lp-mini-panel {
  flex: 1; min-width: 0;
  border: 1px solid rgba(212, 228, 250, 0.09); border-radius: 10px;
  overflow: hidden; background: rgba(10, 24, 40, 0.8);
}
.lp-mini-panel--income { border-color: rgba(0, 223, 193, 0.16); }
.lp-mini-panel--expense { border-color: rgba(255, 118, 117, 0.12); }
.lp-mini-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; font-size: 13px; font-weight: 680; color: #eef4ff;
  border-bottom: 1px solid rgba(212, 228, 250, 0.06);
  background: rgba(39, 54, 71, 0.18);
}
.lp-mini-total { font-family: 'SF Mono', monospace; font-size: 13px; }
.lp-mini-total--income { color: #00dfc1; }
.lp-mini-row {
  display: flex; justify-content: space-between; padding: 8px 14px;
  font-size: 12.5px; color: rgba(212, 228, 250, 0.78);
  border-bottom: 1px solid rgba(212, 228, 250, 0.04);
}
.lp-mini-row--indent { padding-left: 26px; color: rgba(212, 228, 250, 0.6); }
.lp-mini-cat {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; font-size: 11.5px; font-weight: 700;
  color: rgba(212, 228, 250, 0.45);
  background: rgba(1, 15, 31, 0.18); border-bottom: 1px solid rgba(212, 228, 250, 0.04);
}
.lp-mini-cat-pip { width: 7px; height: 7px; border-radius: 50%; background: #fd79a8; flex-shrink: 0; }
.lp-mini-cat-amt { margin-left: auto; font-family: 'SF Mono', monospace; }

/* ── Bar chart ── */
.lp-chart {
  background: rgba(8, 22, 38, 0.9); border: 1px solid rgba(212, 228, 250, 0.09);
  border-radius: 12px; padding: 18px 18px 14px;
}
.lp-chart-title {
  font-size: 11px; font-weight: 720; color: rgba(212, 228, 250, 0.35);
  letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 12px;
  font-family: 'SF Mono', monospace;
}
.lp-chart-lbl { font-size: 8.5px; fill: rgba(212, 228, 250, 0.3); font-family: 'SF Mono', monospace; }
.lp-chart-legend {
  display: flex; align-items: center; gap: 6px; margin-top: 10px;
  font-size: 12px; color: rgba(212, 228, 250, 0.42);
}
.lp-chart-pip { display: inline-block; width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.lp-chart-pip--pos { background: #00dfc1; margin-right: 4px; }
.lp-chart-pip--neg { background: #ff7675; margin-left: 14px; margin-right: 4px; }

/* ── Chart stage: clips the scrolling SVG ── */
.lp-chart-stage {
  position: relative; overflow: hidden; height: 126px;
}

/* Scrolling bar chart layer */
.lp-chart-scroll {
  position: absolute; top: 0; left: 0;
  transition: opacity 500ms ease;
}
@keyframes lpBarScroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-312px); }
}
.lp-chart-scroll--run {
  animation: lpBarScroll 3.2s ease-in-out forwards;
}

/* Projection card layer */
.lp-chart-proj {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center;
  transition: opacity 500ms ease;
  background: rgba(8, 22, 38, 0.9);
  padding: 4px 2px;
}
.lp-proj-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
.lp-proj-stat {
  display: flex; flex-direction: column; gap: 2px;
}
.lp-proj-stat--rate {
  flex-direction: row; align-items: center; justify-content: space-between;
}
.lp-proj-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; color: rgba(212, 228, 250, 0.38);
  font-family: 'SF Mono', monospace;
}
.lp-proj-val {
  font-family: 'SF Mono', monospace; font-size: 16px; font-weight: 700;
  color: #d4e4fa; letter-spacing: -0.02em;
}
.lp-proj-val--pos { color: #00dfc1; }
.lp-proj-dial-wrap { flex-shrink: 0; }

/* ── Comparison table ── */
.lp-cmp { max-width: 900px; margin: 0 auto; padding: 80px 40px; }
.lp-cmp-h2 {
  font-size: clamp(24px, 3vw, 38px); font-weight: 760;
  letter-spacing: -0.022em; color: #eef4ff; margin-bottom: 28px;
}
.lp-cmp-table {
  border: 1px solid rgba(212, 228, 250, 0.09); border-radius: 12px;
  overflow: hidden; background: rgba(8, 22, 38, 0.7);
}
.lp-cmp-head {
  display: grid; grid-template-columns: 1fr repeat(3, 140px);
  background: rgba(39, 54, 71, 0.2); border-bottom: 1px solid rgba(212, 228, 250, 0.07);
}
.lp-cmp-col { padding: 13px 12px; font-size: 13px; font-weight: 700; color: rgba(212, 228, 250, 0.42); text-align: center; }
.lp-cmp-col--hi { color: #00dfc1; }
.lp-cmp-row {
  display: grid; grid-template-columns: 1fr repeat(3, 140px);
  border-bottom: 1px solid rgba(212, 228, 250, 0.05); align-items: center;
}
.lp-cmp-row:last-child { border-bottom: none; }
.lp-cmp-label { padding: 13px 16px; font-size: 13.5px; color: rgba(212, 228, 250, 0.72); }
.lp-cmp-cell {
  padding: 13px 12px; text-align: center;
  display: flex; align-items: center; justify-content: center;
  color: rgba(212, 228, 250, 0.35);
}
.lp-cmp-cell--hi { color: #00dfc1; background: rgba(0, 223, 193, 0.03); }
.lp-check-muted { color: rgba(212, 228, 250, 0.35); }
.lp-cmp-text { font-size: 12.5px; }

/* ── Final CTA ── */
.lp-end {
  text-align: center; padding: 100px 40px 80px;
  border-top: 1px solid rgba(212, 228, 250, 0.06);
  background: rgba(5, 20, 36, 0.48);
}
.lp-end-h2 { font-size: clamp(30px, 4vw, 52px); font-weight: 820; letter-spacing: -0.03em; color: #eef4ff; margin-bottom: 10px; }
.lp-end-deck { font-size: 18px; color: rgba(212, 228, 250, 0.44); margin-bottom: 36px; }
.lp-end-note { margin-top: 18px; font-size: 13.5px; color: rgba(212, 228, 250, 0.3); }

/* ── Nav links ── */
.lp-nav-links { display: flex; align-items: center; gap: 18px; margin: 0 auto 0 32px; }
.lp-nav-links a { color: rgba(212, 228, 250, 0.6); text-decoration: none; font-size: 13.5px; font-weight: 500; transition: color 120ms ease; }
.lp-nav-links a:hover { color: #00dfc1; }

/* ── Banks ── */
.lp-banks, .lp-res, .lp-faq { max-width: 900px; margin: 0 auto; padding: 72px 40px 24px; }
.lp-section-p { color: rgba(212, 228, 250, 0.62); font-size: 15px; line-height: 1.7; max-width: 640px; margin: -12px 0 24px; }
.lp-section-p a, .lp-faq-item dd a { color: #00dfc1; text-decoration: none; }
.lp-section-p a:hover { text-decoration: underline; }
.lp-bank-grid { list-style: none; display: flex; flex-wrap: wrap; gap: 10px; }
.lp-bank {
  display: inline-block; padding: 9px 14px; border-radius: 999px;
  border: 1px solid rgba(212, 228, 250, 0.12); background: rgba(8, 22, 38, 0.7);
  color: rgba(212, 228, 250, 0.85); text-decoration: none; font-size: 13.5px; font-weight: 600;
  transition: border-color 140ms ease, color 140ms ease, transform 140ms ease;
}
.lp-bank:hover { border-color: rgba(0, 223, 193, 0.5); color: #00dfc1; transform: translateY(-1px); }

/* ── Resources ── */
.lp-res-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.lp-res-card {
  display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 12px;
  border: 1px solid rgba(212, 228, 250, 0.1); background: rgba(8, 22, 38, 0.7); text-decoration: none;
  transition: border-color 140ms ease, transform 140ms ease;
}
.lp-res-card:hover { border-color: rgba(0, 223, 193, 0.45); transform: translateY(-2px); }
.lp-res-card strong { color: #eef4ff; font-size: 15px; font-weight: 650; }
.lp-res-card span { color: rgba(212, 228, 250, 0.55); font-size: 13px; line-height: 1.5; }

/* ── FAQ ── */
.lp-faq-list { margin: 0 0 20px; }
.lp-faq-item { padding: 16px 0; border-top: 1px solid rgba(212, 228, 250, 0.08); }
.lp-faq-item:last-child { border-bottom: 1px solid rgba(212, 228, 250, 0.08); }
.lp-faq-item dt { color: #eef4ff; font-weight: 650; font-size: 15.5px; margin-bottom: 6px; }
.lp-faq-item dd { color: rgba(212, 228, 250, 0.66); font-size: 14.5px; line-height: 1.65; }

@media (max-width: 880px) {
  .lp-nav-links { display: none; }
  .lp-banks, .lp-res, .lp-faq { padding: 56px 24px 16px; }
}

/* ── Scroll reveal ── */
.lp-r {
  opacity: 0; transform: translateY(24px);
  transition: opacity 560ms cubic-bezier(0.16, 1, 0.3, 1), transform 560ms cubic-bezier(0.16, 1, 0.3, 1);
}
.lp-ri { opacity: 1; transform: none; }

/* ── Responsive ── */
@media (max-width: 880px) {
  .lp-hero { grid-template-columns: 1fr; min-height: auto; padding: 40px 24px 52px; gap: 40px; }
  .lp-hero-mock { order: -1; }
  .lp-browser { max-width: 100%; }
  .lp-h1 { font-size: clamp(28px, 7vw, 44px); }
  .lp-sub { max-width: 100%; }
  .lp-demo { grid-template-columns: 1fr; padding: 64px 24px; gap: 36px; }
  .lp-demo--flip .lp-demo-copy  { order: 0; }
  .lp-demo--flip .lp-demo-media { order: 0; }
  .lp-cmp { padding: 60px 24px; }
  .lp-cmp-head, .lp-cmp-row { grid-template-columns: 1fr repeat(3, 90px); }
  .lp-cmp-col { padding: 11px 6px; font-size: 12px; }
  .lp-cmp-label { padding: 11px 12px; font-size: 12.5px; }
  .lp-end { padding: 72px 24px 60px; }
  .lp-strip { font-size: 12.5px; padding: 14px 20px; }
}

/* Stack mock panels vertically on small phones */
@media (max-width: 460px) {
  .lp-mock-body { grid-template-columns: 1fr; }
  .lp-mp--income { border-right: none; border-bottom: 1px solid rgba(212, 228, 250, 0.07); }
}

/* ── Footer ── */
.lp-footer {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 10px;
  padding: 20px 40px;
  border-top: 1px solid rgba(212, 228, 250, 0.07);
  background: rgba(1, 15, 31, 0.6);
  font-size: 13px; color: rgba(212, 228, 250, 0.35);
}
.lp-footer-brand { letter-spacing: -0.01em; }
.lp-footer-links { display: flex; align-items: center; gap: 10px; }
.lp-footer-link {
  color: rgba(212, 228, 250, 0.45); text-decoration: none;
  transition: color 120ms ease;
}
.lp-footer-link:hover { color: #00dfc1; }
.lp-footer-linkbtn {
  background: none; border: none; padding: 0; margin: 0;
  font: inherit; cursor: pointer;
}
@media (max-width: 880px) {
  .lp-footer { padding: 18px 24px; }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .lp-r, .lp-btn, .lp-cursor { transition: none; animation: none; }
  .lp-r { opacity: 1; transform: none; }
  .lp-cursor { animation: none; opacity: 1; }
  .lp-csv-row { opacity: 1; transform: none; transition: none; }
  .lp-csv-cat { color: #00dfc1; border-color: rgba(0, 223, 193, 0.22); }
  .lp-nav { transition: none; }
  .lp-chart-scroll--run { animation: none; }
  .lp-mrow--new { animation: none; opacity: 1; transform: none; }
}
`;
