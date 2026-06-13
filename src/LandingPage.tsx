import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  LineChart,
  ReceiptText,
  Target,
  TrendingUp,
  Upload,
  ArrowRight,
  ChevronDown,
} from "lucide-react";

// ─── Web Audio helpers ───────────────────────────────────────────────────────

function createAudioCtx(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function playHoverSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.06);
  gain.gain.setValueAtTime(0.04, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

function playClickSound(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

function playChimeSound(ctx: AudioContext) {
  const notes = [523, 659, 784];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime + i * 0.12;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

// ─── Features data ───────────────────────────────────────────────────────────

const features = [
  {
    icon: <ReceiptText size={24} />,
    title: "Monthly Ledger",
    desc: "Log income and expenses month by month. Categorise, group, and sort with drag-and-drop.",
  },
  {
    icon: <Cloud size={24} />,
    title: "Cloud Sync",
    desc: "Sign in with Google and your data syncs instantly across every device you use.",
  },
  {
    icon: <Upload size={24} />,
    title: "Bank CSV Import",
    desc: "Import real transactions from your bank in seconds. The app reads your CSV and auto-categorises.",
  },
  {
    icon: <LineChart size={24} />,
    title: "Spending Intelligence",
    desc: "Charts and signals that surface where your money actually goes, month over month.",
  },
  {
    icon: <TrendingUp size={24} />,
    title: "Net Worth Outlook",
    desc: "See a 1, 2, or 5-year forecast of your financial trajectory based on your current habits.",
  },
  {
    icon: <Target size={24} />,
    title: "Goals & Notes",
    desc: "Track a savings goal — emergency fund, holiday, house deposit — and log monthly notes for future reference.",
  },
];

const steps = [
  {
    n: "01",
    title: "Add your income",
    desc: "Enter your salary, freelance work, or any money coming in for the month.",
  },
  {
    n: "02",
    title: "Log your expenses",
    desc: "Add what you spend, or import directly from your bank's CSV export.",
  },
  {
    n: "03",
    title: "Watch the insights",
    desc: "The app calculates your surplus, savings rate, annual projections, and financial health score automatically.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingPage({ onEnter }: { onEnter: () => void }) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [headerVisible, setHeaderVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  function getCtx(): AudioContext | null {
    if (reducedMotion) return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioCtx();
    }
    if (audioCtxRef.current?.state === "suspended") {
      void audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  function enter() {
    const ctx = getCtx();
    if (ctx) playClickSound(ctx);
    localStorage.setItem("hasSeenLanding", "1");
    onEnter();
  }

  // Check reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Play chime on mount
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => {
      const ctx = createAudioCtx();
      if (ctx) {
        audioCtxRef.current = ctx;
        playChimeSound(ctx);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  // Sticky header slide-in
  useEffect(() => {
    const timer = setTimeout(() => setHeaderVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  // Scroll reveal via IntersectionObserver
  useEffect(() => {
    if (reducedMotion) {
      document.querySelectorAll(".lp-reveal").forEach((el) => {
        (el as HTMLElement).style.opacity = "1";
        (el as HTMLElement).style.transform = "none";
      });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("lp-revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [reducedMotion]);

  function onHover() {
    const ctx = getCtx();
    if (ctx) playHoverSound(ctx);
  }

  return (
    <>
      {/* Inject styles */}
      <style>{LANDING_CSS}</style>

      {/* ── Sticky nav ── */}
      <header className={`lp-nav ${headerVisible ? "lp-nav--visible" : ""}`}>
        <div className="lp-nav__inner">
          <div className="lp-nav__brand">
            <img src="/icon.svg" width={28} height={28} alt="" style={{ borderRadius: 8 }} />
            <span>The Income Tracker</span>
          </div>
          <button
            className="lp-btn lp-btn--primary lp-btn--sm"
            onClick={enter}
            onMouseEnter={onHover}
          >
            Continue to app <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <main className="lp-root">

        {/* ── Hero ── */}
        <section className="lp-hero">
          <div className="lp-hero__bg">
            <div className="lp-grid-lines" aria-hidden="true" />
            <div className="lp-orb lp-orb--1" aria-hidden="true" />
            <div className="lp-orb lp-orb--2" aria-hidden="true" />
            <div className="lp-orb lp-orb--3" aria-hidden="true" />
          </div>
          <div className="lp-hero__content">
            <div className="lp-hero__badge lp-reveal">Free · Private · Cloud-synced</div>
            <h1 className="lp-hero__title lp-reveal">
              Your financial life,<br />
              <span className="lp-shimmer">clearly tracked.</span>
            </h1>
            <p className="lp-hero__sub lp-reveal">
              Income, expenses, goals — all in one place. No spreadsheets. No subscriptions. Just clarity.
            </p>
            <div className="lp-hero__actions lp-reveal">
              <button
                className="lp-btn lp-btn--primary lp-btn--lg"
                onClick={enter}
                onMouseEnter={onHover}
              >
                Open the App <ArrowRight size={18} />
              </button>
              <a
                href="#features"
                className="lp-btn lp-btn--ghost lp-btn--lg"
                onMouseEnter={onHover}
              >
                See how it works <ChevronDown size={18} />
              </a>
            </div>
          </div>
          <div className="lp-hero__scroll-hint" aria-hidden="true">
            <span />
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="lp-section">
          <div className="lp-container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">Everything you need</span>
              <h2 className="lp-section__title">Built for real financial life</h2>
              <p className="lp-section__sub">Not a bank. Not a broker. Just a sharp, private tool to understand where your money goes.</p>
            </div>
            <div className="lp-feature-grid">
              {features.map((f, i) => (
                <article
                  key={f.title}
                  className="lp-feature-card lp-reveal"
                  style={{ animationDelay: `${i * 60}ms` } as React.CSSProperties}
                  onMouseEnter={onHover}
                >
                  <div className="lp-feature-card__icon">{f.icon}</div>
                  <h3 className="lp-feature-card__title">{f.title}</h3>
                  <p className="lp-feature-card__desc">{f.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="lp-section lp-section--dark">
          <div className="lp-container">
            <div className="lp-section__head lp-reveal">
              <span className="lp-eyebrow">Simple by design</span>
              <h2 className="lp-section__title">Up and running in minutes</h2>
            </div>
            <div className="lp-steps">
              {steps.map((s, i) => (
                <div key={s.n} className="lp-step lp-reveal" style={{ transitionDelay: `${i * 80}ms` } as React.CSSProperties}>
                  <div className="lp-step__num">{s.n}</div>
                  <div className="lp-step__body">
                    <h3 className="lp-step__title">{s.title}</h3>
                    <p className="lp-step__desc">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="lp-section lp-cta-section">
          <div className="lp-cta-glow" aria-hidden="true" />
          <div className="lp-container lp-cta-content lp-reveal">
            <h2 className="lp-cta__title">Ready to take control?</h2>
            <p className="lp-cta__sub">No credit card. No setup. Just open and go.</p>
            <button
              className="lp-btn lp-btn--primary lp-btn--xl"
              onClick={enter}
              onMouseEnter={onHover}
            >
              Get Started — It's Free <ArrowRight size={20} />
            </button>
          </div>
        </section>

      </main>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const LANDING_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

*, *::before, *::after { box-sizing: border-box; }

.lp-root {
  font-family: 'Inter', system-ui, sans-serif;
  background: #010f1f;
  color: #d4e4fa;
  line-height: 1.6;
  overflow-x: hidden;
}

/* ── Nav ── */
.lp-nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  padding: 0 24px;
  height: 60px;
  background: rgba(1, 15, 31, 0.72);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(212, 228, 250, 0.08);
  transform: translateY(-100%);
  opacity: 0;
  transition: transform 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 400ms ease;
}
.lp-nav--visible {
  transform: translateY(0);
  opacity: 1;
}
.lp-nav__inner {
  max-width: 1160px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lp-nav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 660;
  color: #d4e4fa;
}

/* ── Buttons ── */
.lp-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 10px;
  font-family: inherit;
  font-weight: 640;
  cursor: pointer;
  text-decoration: none;
  transition:
    transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 160ms ease,
    background 160ms ease;
}
.lp-btn:active { transform: scale(0.96) !important; }

.lp-btn--primary {
  background: #00dfc1;
  color: #010f1f;
}
.lp-btn--primary:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 8px 28px rgba(0, 223, 193, 0.38);
}
.lp-btn--ghost {
  background: rgba(212, 228, 250, 0.08);
  color: #d4e4fa;
  border: 1px solid rgba(212, 228, 250, 0.16);
}
.lp-btn--ghost:hover {
  background: rgba(212, 228, 250, 0.12);
  transform: translateY(-2px);
}
.lp-btn--sm  { padding: 8px 16px;  font-size: 13px; }
.lp-btn--lg  { padding: 14px 26px; font-size: 15px; border-radius: 12px; }
.lp-btn--xl  { padding: 18px 36px; font-size: 17px; border-radius: 14px; }

/* ── Hero ── */
.lp-hero {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 100px 24px 80px;
  overflow: hidden;
  text-align: center;
}
.lp-hero__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.lp-grid-lines {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 223, 193, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 223, 193, 0.04) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%);
}
.lp-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  animation: lpOrb 12s ease-in-out infinite alternate;
}
.lp-orb--1 {
  width: 600px; height: 600px;
  top: -200px; left: -100px;
  background: radial-gradient(circle, rgba(0, 223, 193, 0.12), transparent 70%);
  animation-duration: 14s;
}
.lp-orb--2 {
  width: 400px; height: 400px;
  bottom: -100px; right: -50px;
  background: radial-gradient(circle, rgba(108, 92, 231, 0.14), transparent 70%);
  animation-duration: 10s;
  animation-delay: -4s;
}
.lp-orb--3 {
  width: 300px; height: 300px;
  top: 40%; left: 60%;
  background: radial-gradient(circle, rgba(0, 150, 223, 0.1), transparent 70%);
  animation-duration: 16s;
  animation-delay: -8s;
}
@keyframes lpOrb {
  from { transform: translate(0, 0) scale(1); }
  to   { transform: translate(40px, 30px) scale(1.08); }
}

.lp-hero__content {
  position: relative;
  z-index: 1;
  max-width: 780px;
}
.lp-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
  padding: 6px 16px;
  border: 1px solid rgba(0, 223, 193, 0.3);
  border-radius: 999px;
  background: rgba(0, 223, 193, 0.07);
  color: #00dfc1;
  font-size: 13px;
  font-weight: 640;
  letter-spacing: 0.02em;
}
.lp-hero__title {
  margin: 0 0 24px;
  font-size: clamp(42px, 7vw, 80px);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
  color: #eef4ff;
}
.lp-shimmer {
  background: linear-gradient(120deg, #00dfc1 20%, #a7c8ff 50%, #00dfc1 80%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: lpShimmer 3s linear infinite;
}
@keyframes lpShimmer {
  from { background-position: 0% center; }
  to   { background-position: 200% center; }
}
.lp-hero__sub {
  margin: 0 0 40px;
  font-size: clamp(16px, 2vw, 20px);
  color: rgba(212, 228, 250, 0.72);
  line-height: 1.55;
  max-width: 560px;
  margin-inline: auto;
  margin-bottom: 40px;
}
.lp-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
}
.lp-hero__scroll-hint {
  position: absolute;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
}
.lp-hero__scroll-hint span {
  display: block;
  width: 2px;
  height: 40px;
  margin: 0 auto;
  background: linear-gradient(to bottom, rgba(0,223,193,0.6), transparent);
  animation: lpScrollHint 2s ease-in-out infinite;
}
@keyframes lpScrollHint {
  0%, 100% { opacity: 0.4; transform: scaleY(1); }
  50%       { opacity: 1;   transform: scaleY(1.2); }
}

/* ── Sections ── */
.lp-section {
  padding: 96px 24px;
}
.lp-section--dark {
  background: rgba(5, 20, 36, 0.6);
}
.lp-container {
  max-width: 1080px;
  margin: 0 auto;
}
.lp-section__head {
  text-align: center;
  margin-bottom: 60px;
}
.lp-eyebrow {
  display: inline-block;
  margin-bottom: 12px;
  color: #00dfc1;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  font-weight: 720;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.lp-section__title {
  margin: 0 0 16px;
  font-size: clamp(28px, 4vw, 46px);
  font-weight: 780;
  letter-spacing: -0.025em;
  color: #eef4ff;
  line-height: 1.15;
}
.lp-section__sub {
  margin: 0 auto;
  max-width: 520px;
  color: rgba(212, 228, 250, 0.64);
  font-size: 16px;
}

/* ── Feature grid ── */
.lp-feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
@media (max-width: 900px) {
  .lp-feature-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 560px) {
  .lp-feature-grid { grid-template-columns: 1fr; }
}
.lp-feature-card {
  padding: 28px 24px;
  border: 1px solid rgba(212, 228, 250, 0.08);
  border-radius: 16px;
  background: rgba(18, 33, 49, 0.54);
  backdrop-filter: blur(12px);
  transition:
    transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
    border-color 200ms ease,
    box-shadow 200ms ease;
  cursor: default;
}
.lp-feature-card:hover {
  transform: translateY(-5px);
  border-color: rgba(0, 223, 193, 0.28);
  box-shadow: 0 12px 40px rgba(0, 223, 193, 0.08);
}
.lp-feature-card__icon {
  display: inline-grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 18px;
  border-radius: 12px;
  background: rgba(0, 223, 193, 0.1);
  color: #00dfc1;
}
.lp-feature-card__title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: #eef4ff;
}
.lp-feature-card__desc {
  margin: 0;
  font-size: 14px;
  color: rgba(212, 228, 250, 0.64);
  line-height: 1.55;
}

/* ── Steps ── */
.lp-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
}
@media (max-width: 760px) {
  .lp-steps { grid-template-columns: 1fr; gap: 24px; }
}
.lp-step {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.lp-step__num {
  flex: 0 0 auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 720;
  color: #00dfc1;
  background: rgba(0, 223, 193, 0.1);
  border: 1px solid rgba(0, 223, 193, 0.22);
  border-radius: 8px;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  letter-spacing: 0.04em;
}
.lp-step__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  color: #eef4ff;
}
.lp-step__desc {
  margin: 0;
  font-size: 14px;
  color: rgba(212, 228, 250, 0.62);
  line-height: 1.55;
}

/* ── Final CTA ── */
.lp-cta-section {
  position: relative;
  text-align: center;
  overflow: hidden;
}
.lp-cta-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0, 223, 193, 0.08), transparent 70%);
  pointer-events: none;
}
.lp-cta-content {
  position: relative;
  z-index: 1;
}
.lp-cta__title {
  margin: 0 0 16px;
  font-size: clamp(32px, 5vw, 56px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #eef4ff;
}
.lp-cta__sub {
  margin: 0 0 40px;
  font-size: 16px;
  color: rgba(212, 228, 250, 0.56);
}

/* ── Scroll reveal ── */
.lp-reveal {
  opacity: 0;
  transform: translateY(28px);
  transition:
    opacity 600ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 600ms cubic-bezier(0.16, 1, 0.3, 1);
}
.lp-revealed {
  opacity: 1 !important;
  transform: none !important;
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .lp-reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
  .lp-orb, .lp-hero__scroll-hint span, .lp-shimmer {
    animation: none !important;
  }
  .lp-shimmer {
    background: #00dfc1;
  }
}
`;
