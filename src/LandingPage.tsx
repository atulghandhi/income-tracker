import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";

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
  { date: "13 Jun", desc: "TESCO EXTRA 4261",  amt: "42.61", cat: "Food" },
  { date: "12 Jun", desc: "SOUTHERN RAIL",      amt: "12.40", cat: "Transport" },
  { date: "11 Jun", desc: "COSTA COFFEE",       amt: "4.35",  cat: "Eating out" },
  { date: "09 Jun", desc: "BUPA DENTAL PLAN",   amt: "75.00", cat: "Health" },
] as const;

const BAR = [
  { m: "Jul", v: -180 }, { m: "Aug", v:  420 },
  { m: "Sep", v:  -95 }, { m: "Oct", v:  310 },
  { m: "Nov", v: -520 }, { m: "Dec", v: -890 },
  { m: "Jan", v:  640 }, { m: "Feb", v:  280 },
  { m: "Mar", v: -140 }, { m: "Apr", v:  510 },
  { m: "May", v:  390 }, { m: "Jun", v:  -62 },
];

const CMP = [
  { label: "Works across accounts from different banks", l: true,  s: "Yes",          b: "Their accounts only" },
  { label: "Import your own CSV files",                  l: true,  s: "Manual paste", b: "Rarely" },
  { label: "No bank credentials required",               l: true,  s: "Yes",          b: "No" },
  { label: "Drag-and-drop categorisation",               l: true,  s: "No",           b: "No" },
  { label: "Month-by-month ledger view",                 l: true,  s: "Manual",       b: "No" },
  { label: "Free",                                       l: true,  s: "Yes",          b: "Yes" },
];

const TYPED_TARGET = "Costa Coffee";

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  const ctxRef  = useRef<AudioContext | null>(null);
  const csvRef  = useRef<HTMLElement | null>(null);
  const [navIn,    setNavIn]    = useState(false);
  const [reduced,  setReduced]  = useState(false);
  const [typed,    setTyped]    = useState("");
  const [csvStep,  setCsvStep]  = useState(0);

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

  // Reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Ensure the page body is freely scrollable while the landing page is active.
  // The main app shell uses a fixed-height flex layout; without this the first
  // scroll gesture gets absorbed by an implicit scroll container and does nothing.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "unset";
    body.style.overflow = "unset";
    // Scroll to top on mount so the page always starts at the beginning.
    window.scrollTo(0, 0);
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
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

  // Scroll reveal via IntersectionObserver
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

  // Typewriter animation for the add-row
  useEffect(() => {
    if (reduced) { setTyped(TYPED_TARGET); return; }
    let tid: ReturnType<typeof setTimeout>;
    const st = { i: 0, fwd: true };
    function tick() {
      if (st.fwd) {
        st.i++;
        setTyped(TYPED_TARGET.slice(0, st.i));
        if (st.i >= TYPED_TARGET.length) { tid = setTimeout(() => { st.fwd = false; tick(); }, 1600); return; }
      } else {
        st.i--;
        setTyped(TYPED_TARGET.slice(0, st.i));
        if (st.i <= 0) { tid = setTimeout(() => { st.fwd = true; tick(); }, 500); return; }
      }
      tid = setTimeout(tick, st.fwd ? 105 : 60);
    }
    tid = setTimeout(tick, 1100);
    return () => clearTimeout(tid);
  }, [reduced]);

  // CSV animation: starts when the section enters the viewport
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
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-trigger CSV loop when step resets to 0
  const prevCsvStep = useRef(csvStep);
  useEffect(() => {
    if (prevCsvStep.current !== 0 && csvStep === 0 && csvRef.current && !reduced) {
      // small pause before restarting
      const t = setTimeout(() => {
        const el = csvRef.current;
        if (el) {
          const io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
              // trigger one run
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

  const maxV = Math.max(...BAR.map(b => Math.abs(b.v)));

  return (
    <>
      <style>{CSS}</style>

      {/* ── Fixed nav ── */}
      <header className={`lp-nav${navIn ? " lp-nav--in" : ""}`}>
        <div className="lp-nav-inner">
          <span className="lp-nav-brand">The Income Tracker</span>
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
            {/* Browser chrome wrapper */}
            <div className="lp-browser">
              <div className="lp-chrome">
                <div className="lp-dots"><span /><span /><span /></div>
                <div className="lp-url">theincometracker.app &nbsp;/&nbsp; Jun 2025</div>
              </div>

              <div className="lp-mock-body">
                {/* Income panel */}
                <div className="lp-mp lp-mp--income">
                  <div className="lp-mp-head">
                    <div>
                      <div className="lp-mp-title"><span className="lp-glyph lp-glyph--in">↓</span> Income</div>
                      <div className="lp-mp-sub">1 item</div>
                    </div>
                    <span className="lp-mp-total lp-mp-total--income">£3,248.72</span>
                  </div>
                  <div className="lp-col-head"><span>Source</span><span>Amount</span></div>
                  <div className="lp-mrow">
                    <span className="lp-dot-swatch" style={{ background: "#6c5ce7" }} />
                    <span className="lp-mname">Salary (BACS)</span>
                    <span className="lp-mamt">£ 3,248.72</span>
                  </div>
                </div>

                {/* Expense panel */}
                <div className="lp-mp lp-mp--expense">
                  <div className="lp-mp-head">
                    <div>
                      <div className="lp-mp-title"><span className="lp-glyph lp-glyph--out">↑</span> Expenses</div>
                      <div className="lp-mp-sub">5 items</div>
                    </div>
                    <span className="lp-mp-total">£144.35</span>
                  </div>
                  <div className="lp-col-head"><span>Expense</span><span>Amount</span></div>
                  {[
                    { name: "Tesco Extra",    amt: "£42.61" },
                    { name: "Southern Rail",  amt: "£12.40" },
                    { name: "Costa Coffee",   amt: "£4.35"  },
                    { name: "Dentist (Bupa)", amt: "£75.00" },
                    { name: "Spotify",        amt: "£9.99"  },
                  ].map(r => (
                    <div key={r.name} className="lp-mrow">
                      <span className="lp-mname">{r.name}</span>
                      <span className="lp-mamt lp-mamt--exp">{r.amt}</span>
                    </div>
                  ))}
                  {/* Add row with typewriter */}
                  <div className="lp-madd">
                    <span className="lp-madd-plus">+</span>
                    <span className="lp-madd-input">
                      {typed
                        ? <>{typed}<span className="lp-cursor" /></>
                        : <><span className="lp-ph">What did you spend on?</span><span className="lp-cursor" /></>
                      }
                    </span>
                    <span className="lp-madd-sym">£</span>
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
                <span>Date</span>
                <span>Description</span>
                <span>Amount</span>
                <span>Category</span>
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
                  <span className="lp-mini-cat-pip" />
                  <span>Food</span>
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

        {/* ════ DEMO 3: Annual chart ════ */}
        <section className="lp-demo lp-r">
          <div className="lp-demo-media">
            <div className="lp-chart">
              <div className="lp-chart-title">Net flow &nbsp;·&nbsp; Jul 2024 to Jun 2025</div>
              <svg viewBox="0 0 312 118" className="lp-chart-svg" aria-hidden="true">
                <line x1={0} y1={62} x2={312} y2={62} stroke="rgba(212,228,250,0.09)" strokeWidth={1} />
                {BAR.map((b, i) => {
                  const h = Math.max((Math.abs(b.v) / maxV) * 52, 2);
                  const pos = b.v >= 0;
                  const x = 4 + i * 26;
                  const y = pos ? 62 - h : 62;
                  return (
                    <g key={b.m}>
                      <rect x={x} y={y} width={18} height={h} rx={3}
                        fill={pos ? "#00dfc1" : "#ff7675"}
                        opacity={b.m === "Jun" ? 0.4 : 0.82}
                      />
                      <text x={x + 9} y={112} textAnchor="middle" className="lp-chart-lbl">{b.m}</text>
                    </g>
                  );
                })}
              </svg>
              <div className="lp-chart-legend">
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
                <div className="lp-cmp-cell lp-cmp-cell--hi">
                  <Check size={16} strokeWidth={2.5} />
                </div>
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

        {/* ════ FINAL CTA ════ */}
        <section className="lp-end lp-r">
          <h2 className="lp-end-h2">Open your first month.</h2>
          <p className="lp-end-deck">It takes about two minutes.</p>
          <button className="lp-btn lp-btn--lg" onClick={enter} onMouseEnter={hover}>
            Start the ledger <ArrowRight size={18} />
          </button>
          <p className="lp-end-note">Free. No credit card. No bank login.</p>
        </section>

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
  /* No overflow-x:hidden here — setting overflow on one axis creates an
     implicit scroll container in Safari/Chrome that swallows scroll events. */
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
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: calc(100vh - 56px);
  max-width: 1180px; margin: 0 auto;
  padding: 60px 40px;
  gap: 56px; align-items: center;
}
.lp-h1 {
  font-size: clamp(30px, 4vw, 56px);
  font-weight: 840; letter-spacing: -0.03em;
  line-height: 1.1; color: #eef4ff;
  margin-bottom: 22px;
}
.lp-accent { color: #00dfc1; }
.lp-sub {
  font-size: 16px; color: rgba(212, 228, 250, 0.66);
  line-height: 1.7; max-width: 420px;
  margin-bottom: 36px;
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
  max-width: 540px;
}
.lp-chrome {
  background: rgba(22, 36, 52, 0.98);
  padding: 9px 14px;
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
  font-family: system-ui, sans-serif; letter-spacing: 0;
}

/* ── Mock panels ── */
.lp-mock-body { background: #010f1f; }
.lp-mp {
  border-bottom: 1px solid rgba(212, 228, 250, 0.06);
}
.lp-mp--income { border-left: 2px solid rgba(0, 223, 193, 0.22); }
.lp-mp--expense { border-left: 2px solid rgba(255, 118, 117, 0.18); }
.lp-mp-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 12px 14px;
  background: rgba(39, 54, 71, 0.16);
  border-bottom: 1px solid rgba(212, 228, 250, 0.055);
}
.lp-mp-title {
  font-size: 15px; font-weight: 680; color: #eef4ff;
  display: flex; align-items: center; gap: 6px;
}
.lp-glyph { font-size: 13px; display: inline-block; }
.lp-glyph--in  { color: #00dfc1; }
.lp-glyph--out { color: #ff7675; }
.lp-mp-sub { font-size: 11px; color: rgba(212, 228, 250, 0.38); margin-top: 3px; }
.lp-mp-total { font-family: 'SF Mono', monospace; font-size: 14px; font-weight: 660; color: #d4e4fa; }
.lp-mp-total--income { color: #00dfc1; }
.lp-col-head {
  display: flex; justify-content: space-between;
  padding: 6px 14px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
  color: rgba(212, 228, 250, 0.3); text-transform: uppercase;
  background: rgba(1, 15, 31, 0.1);
  border-bottom: 1px solid rgba(212, 228, 250, 0.05);
}
.lp-mrow {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 14px;
  border-bottom: 1px solid rgba(212, 228, 250, 0.04);
}
.lp-dot-swatch {
  width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0;
}
.lp-mname { flex: 1; font-size: 12.5px; color: rgba(212, 228, 250, 0.88); }
.lp-mamt {
  font-family: 'SF Mono', monospace; font-size: 12px;
  color: rgba(212, 228, 250, 0.88);
}
.lp-mamt--exp { color: rgba(212, 228, 250, 0.6); }

/* ── Add row with typewriter ── */
.lp-madd {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 14px;
  background: rgba(1, 15, 31, 0.28);
  border-top: 1px dashed rgba(212, 228, 250, 0.09);
}
.lp-madd-plus {
  width: 24px; height: 24px; border-radius: 5px;
  border: 1px solid rgba(0, 223, 193, 0.28);
  display: grid; place-items: center;
  color: #00dfc1; font-size: 15px; line-height: 1;
  flex-shrink: 0;
}
.lp-madd-input {
  flex: 1; min-width: 0;
  background: rgba(18, 33, 49, 0.7);
  border: 1px solid rgba(212, 228, 250, 0.1);
  border-radius: 5px; padding: 5px 9px;
  font-size: 12px; color: #d4e4fa;
  display: flex; align-items: center; gap: 1px;
  min-height: 30px;
}
.lp-ph { color: rgba(212, 228, 250, 0.25); }
.lp-cursor {
  display: inline-block; width: 1.5px; height: 13px;
  background: #00dfc1;
  animation: lpBlink 1s step-end infinite;
  margin-left: 1px; flex-shrink: 0;
}
@keyframes lpBlink { 0%,100%{opacity:1} 50%{opacity:0} }
.lp-madd-sym {
  background: rgba(18, 33, 49, 0.7);
  border: 1px solid rgba(212, 228, 250, 0.1);
  border-radius: 5px; padding: 5px 10px;
  font-size: 12px; color: rgba(212, 228, 250, 0.35);
  flex-shrink: 0;
}

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
  max-width: 1100px; margin: 0 auto;
  padding: 88px 40px;
}
.lp-demo--flip .lp-demo-copy   { order: 1; }
.lp-demo--flip .lp-demo-media  { order: 2; }
.lp-eyebrow {
  display: inline-block; margin-bottom: 10px;
  color: #00dfc1;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px; font-weight: 720;
  letter-spacing: 0.12em; text-transform: uppercase;
}
.lp-demo-h2 {
  font-size: clamp(22px, 2.8vw, 34px);
  font-weight: 760; letter-spacing: -0.022em;
  color: #eef4ff; line-height: 1.2;
  margin-bottom: 14px;
}
.lp-demo-p {
  font-size: 15px; color: rgba(212, 228, 250, 0.66);
  line-height: 1.7; margin-bottom: 12px;
}
.lp-demo-note {
  font-size: 13px; color: rgba(212, 228, 250, 0.35); line-height: 1.55;
}

/* ── CSV table ── */
.lp-csv-table {
  background: rgba(8, 22, 38, 0.92);
  border: 1px solid rgba(212, 228, 250, 0.1);
  border-radius: 10px; overflow: hidden;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
}
.lp-csv-head {
  display: grid;
  grid-template-columns: 54px 1fr 60px 90px;
  padding: 9px 14px;
  background: rgba(39, 54, 71, 0.26);
  border-bottom: 1px solid rgba(212, 228, 250, 0.07);
  font-size: 10.5px; font-weight: 720; letter-spacing: 0.06em;
  text-transform: uppercase; color: rgba(212, 228, 250, 0.35);
}
.lp-csv-row {
  display: grid;
  grid-template-columns: 54px 1fr 60px 90px;
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
  display: inline-block;
  background: rgba(0, 223, 193, 0.07);
  border: 1px solid transparent;
  border-radius: 4px; padding: 1px 6px;
  font-size: 11px; color: transparent;
  white-space: nowrap;
  transition: color 260ms ease, border-color 260ms ease, background 260ms ease;
}
.lp-csv-cat--in {
  color: #00dfc1;
  border-color: rgba(0, 223, 193, 0.22);
  background: rgba(0, 223, 193, 0.09);
}

/* ── Mini ledger demo ── */
.lp-mini-ledger { display: flex; flex-direction: column; gap: 12px; }
.lp-mini-panel {
  border: 1px solid rgba(212, 228, 250, 0.09);
  border-radius: 10px; overflow: hidden;
  background: rgba(10, 24, 40, 0.8);
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
  display: flex; justify-content: space-between;
  padding: 8px 14px; font-size: 12.5px;
  color: rgba(212, 228, 250, 0.78);
  border-bottom: 1px solid rgba(212, 228, 250, 0.04);
}
.lp-mini-row--indent { padding-left: 26px; color: rgba(212, 228, 250, 0.6); }
.lp-mini-cat {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; font-size: 11.5px; font-weight: 700;
  color: rgba(212, 228, 250, 0.45);
  background: rgba(1, 15, 31, 0.18);
  border-bottom: 1px solid rgba(212, 228, 250, 0.04);
}
.lp-mini-cat-pip {
  width: 7px; height: 7px; border-radius: 50%;
  background: #fd79a8; flex-shrink: 0;
}
.lp-mini-cat-amt { margin-left: auto; font-family: 'SF Mono', monospace; }

/* ── Bar chart ── */
.lp-chart {
  background: rgba(8, 22, 38, 0.9);
  border: 1px solid rgba(212, 228, 250, 0.09);
  border-radius: 12px; padding: 20px 18px 14px;
}
.lp-chart-title {
  font-size: 11px; font-weight: 720;
  color: rgba(212, 228, 250, 0.35);
  letter-spacing: 0.04em; text-transform: uppercase;
  margin-bottom: 14px;
  font-family: 'SF Mono', monospace;
}
.lp-chart-svg { width: 100%; display: block; }
.lp-chart-lbl {
  font-size: 8.5px; fill: rgba(212, 228, 250, 0.3);
  font-family: 'SF Mono', monospace;
}
.lp-chart-legend {
  display: flex; align-items: center; gap: 6px;
  margin-top: 10px; font-size: 12px;
  color: rgba(212, 228, 250, 0.42);
}
.lp-chart-pip {
  display: inline-block; width: 9px; height: 9px;
  border-radius: 2px; flex-shrink: 0;
}
.lp-chart-pip--pos { background: #00dfc1; margin-right: 4px; }
.lp-chart-pip--neg { background: #ff7675; margin-left: 14px; margin-right: 4px; }

/* ── Comparison table ── */
.lp-cmp {
  max-width: 900px; margin: 0 auto;
  padding: 80px 40px;
}
.lp-cmp-h2 {
  font-size: clamp(24px, 3vw, 38px); font-weight: 760;
  letter-spacing: -0.022em; color: #eef4ff;
  margin-bottom: 28px;
}
.lp-cmp-table {
  border: 1px solid rgba(212, 228, 250, 0.09);
  border-radius: 12px; overflow: hidden;
  background: rgba(8, 22, 38, 0.7);
}
.lp-cmp-head {
  display: grid;
  grid-template-columns: 1fr repeat(3, 140px);
  background: rgba(39, 54, 71, 0.2);
  border-bottom: 1px solid rgba(212, 228, 250, 0.07);
}
.lp-cmp-col {
  padding: 13px 12px; font-size: 13px; font-weight: 700;
  color: rgba(212, 228, 250, 0.42); text-align: center;
}
.lp-cmp-col--hi { color: #00dfc1; }
.lp-cmp-row {
  display: grid;
  grid-template-columns: 1fr repeat(3, 140px);
  border-bottom: 1px solid rgba(212, 228, 250, 0.05);
  align-items: center;
}
.lp-cmp-row:last-child { border-bottom: none; }
.lp-cmp-label {
  padding: 13px 16px; font-size: 13.5px;
  color: rgba(212, 228, 250, 0.72);
}
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
  text-align: center;
  padding: 100px 40px 80px;
  border-top: 1px solid rgba(212, 228, 250, 0.06);
  background: rgba(5, 20, 36, 0.48);
}
.lp-end-h2 {
  font-size: clamp(30px, 4vw, 52px); font-weight: 820;
  letter-spacing: -0.03em; color: #eef4ff;
  margin-bottom: 10px;
}
.lp-end-deck {
  font-size: 18px; color: rgba(212, 228, 250, 0.44);
  margin-bottom: 36px;
}
.lp-end-note {
  margin-top: 18px; font-size: 13.5px;
  color: rgba(212, 228, 250, 0.3);
}

/* ── Scroll reveal ── */
.lp-r {
  opacity: 0; transform: translateY(24px);
  transition:
    opacity 560ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 560ms cubic-bezier(0.16, 1, 0.3, 1);
}
.lp-ri { opacity: 1; transform: none; }

/* ── Responsive ── */
@media (max-width: 880px) {
  .lp-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    padding: 40px 24px 52px;
    gap: 40px;
  }
  .lp-hero-mock { order: -1; }
  .lp-browser { max-width: 100%; }
  .lp-h1 { font-size: clamp(28px, 7vw, 44px); }
  .lp-sub { max-width: 100%; }
  .lp-demo {
    grid-template-columns: 1fr; padding: 64px 24px; gap: 36px;
  }
  .lp-demo--flip .lp-demo-copy  { order: 0; }
  .lp-demo--flip .lp-demo-media { order: 0; }
  .lp-cmp { padding: 60px 24px; }
  .lp-cmp-head, .lp-cmp-row { grid-template-columns: 1fr repeat(3, 90px); }
  .lp-cmp-col { padding: 11px 6px; font-size: 12px; }
  .lp-cmp-label { padding: 11px 12px; font-size: 12.5px; }
  .lp-end { padding: 72px 24px 60px; }
  .lp-strip { font-size: 12.5px; padding: 14px 20px; }
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .lp-r, .lp-btn, .lp-cursor { transition: none; animation: none; }
  .lp-r { opacity: 1; transform: none; }
  .lp-cursor { animation: none; opacity: 1; }
  .lp-csv-row { opacity: 1; transform: none; transition: none; }
  .lp-csv-cat { color: #00dfc1; border-color: rgba(0, 223, 193, 0.22); }
  .lp-nav { transition: none; }
}
`;
