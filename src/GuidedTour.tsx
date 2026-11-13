import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { GraduationCap, X } from "lucide-react";

type Step = { heading: string; bullets: string[]; target?: string };
type Tutorial = { title: string; badge: string; steps: Step[] };

// Chapters that follow a page's own tutorial steps. A chapter with a `target` points at the thing
// it describes: the page scrolls it into view and everything else dims around it.
const CHAPTERS: Record<string, Step[]> = {
  dashboard: [
    { heading: "Make the dashboard yours", bullets: ["Choose Customise beside the title to add, remove, move or resize widgets.", "Your layout is remembered on this device."], target: ".pageTitleRow" },
    { heading: "Follow the money", bullets: ["Click a stream or bucket in Money flow, or pick one from Explore, to see what is behind it.", "A payee that appears more than once opens into its transactions, and Other opens into the categories it hides."], target: '[data-widget-id="cash-flow"]' },
    { heading: "Compare your calendar", bullets: ["The Spending calendar shows one to four months, ending at the month selected in the top bar.", "If it is not on your dashboard, add it through Customise."], target: '[data-widget-id="calendar"]' },
    { heading: "Save a dashboard report", bullets: ["Export saves the whole dashboard as an image or a PDF, including widgets below the screen.", "With amounts hidden, the export hides them too."], target: ".dashboardExport" },
  ],
  settings: [
    { heading: "Import a bank statement", bullets: ["In Import data, choose a CSV, OFX, QIF or PDF statement.", "Check the preview, dates and amounts before accepting it. A scanned PDF may need its rows pasted instead."] },
    { heading: "Review before adding", bullets: ["Use the import review to correct columns and categories.", "Check possible duplicates so a transaction you already have is not added twice."] },
  ],
  allocate: [
    { heading: "Compare your choices", bullets: ["Avalanche pays the highest interest rate first. Snowball pays the smallest balance first.", "Compare the interest and the debt-free date before choosing; both are estimates from your figures."] },
  ],
};

type Box = { top: number; left: number; width: number; height: number };

export function TutorialOverlay({ tutorial, view, t, onClose }: { tutorial: Tutorial; view: string; t: (text: string) => string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const steps = [...tutorial.steps, ...(CHAPTERS[view] ?? [])];
  const index = Math.min(step, steps.length - 1);
  const current = steps[index];
  const isLast = index === steps.length - 1;

  // Focus moves into the card and returns to wherever it came from.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bring the chapter's subject to the top of the screen (the card sits at the bottom), then keep
  // the spotlight on it as the page scrolls or resizes.
  useLayoutEffect(() => {
    const target = current.target ? document.querySelector<HTMLElement>(current.target) : null;
    if (!target) {
      setBox(null);
      return;
    }
    const measure = () => {
      const rect = target.getBoundingClientRect();
      setBox({ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 });
    };
    target.setAttribute("data-tour-target", "true");
    target.scrollIntoView({ block: "start", behavior: "instant" });
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => {
      target.removeAttribute("data-tour-target");
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [current.target]);

  function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const controls = [...(cardRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === cardRef.current)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className={`tutorialBackdrop ${box ? "anchored" : ""}`} onKeyDown={trapTab}>
      {box && <div className="tourSpotlight" style={box as CSSProperties} aria-hidden="true" />}
      <div ref={cardRef} className="tutorialCard" role="dialog" aria-modal="true" aria-label={`${tutorial.title} tutorial`} tabIndex={-1}>
        <div className="tutorialTop">
          <span className="tutorialBadge">
            <GraduationCap size={13} />
            {tutorial.badge} · guided tour
          </span>
          <button type="button" className="iconButton" aria-label="Close tutorial" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <h2 className="tutorialTitle">{t(tutorial.title)}</h2>
        <div className="tutorialStep" aria-live="polite">
          {current.heading ? <h3 className="tutorialStepHeading">{t(current.heading)}</h3> : null}
          <ul className="tutorialBullets">
            {current.bullets.map((bullet, bulletIndex) => (
              <li key={bulletIndex}>{t(bullet)}</li>
            ))}
          </ul>
        </div>

        {steps.length > 1 ? (
          <nav className="tutorialDots" aria-label="Tour chapters">
            {steps.map((chapter, chapterIndex) => (
              <button
                key={chapterIndex}
                type="button"
                className={chapterIndex === index ? "active" : ""}
                aria-current={chapterIndex === index ? "step" : undefined}
                aria-label={t(chapter.heading || `${tutorial.badge} basics`)}
                title={t(chapter.heading || `${tutorial.badge} basics`)}
                onClick={() => setStep(chapterIndex)}
              />
            ))}
            <span className="tutorialCount">
              {index + 1} of {steps.length}
            </span>
          </nav>
        ) : null}

        <div className="tutorialActions">
          <button className="tutorialSkip" type="button" onClick={onClose}>
            Skip tutorial
          </button>
          <div className="tutorialNav">
            {index > 0 ? (
              <button className="commandButton" type="button" onClick={() => setStep(index - 1)}>
                Back
              </button>
            ) : null}
            <button className="tutorialNext" type="button" onClick={() => (isLast ? onClose() : setStep(index + 1))}>
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
