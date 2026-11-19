import { useMemo } from "react";
import { DEFAULT_GRAIN, DEFAULT_HUE, framePreview } from "./frame";

type Props = {
  hue: number;
  grain: number;
  theme: "light" | "dark";
  onHue: (hue: number) => void;
  onGrain: (grain: number) => void;
};

const PRESETS = [
  { hue: 172, name: "Teal" },
  { hue: 212, name: "Sky" },
  { hue: 252, name: "Iris" },
  { hue: 318, name: "Orchid" },
  { hue: 12, name: "Coral" },
  { hue: 38, name: "Sand" },
  { hue: 128, name: "Fern" },
];

function hueName(hue: number): string {
  const nearest = PRESETS.reduce((best, p) => {
    const d = Math.min(Math.abs(p.hue - hue), 360 - Math.abs(p.hue - hue));
    return d < best.d ? { name: p.name, d } : best;
  }, { name: PRESETS[0].name, d: Infinity });
  return nearest.d <= 20 ? nearest.name : `Hue ${Math.round(hue)}`;
}

// The colour your app sits on. Drag across the strip and the whole frame
// changes as you go; text on it is kept readable whatever you pick.
export default function FramePicker({ hue, grain, theme, onHue, onGrain }: Props) {
  // The strip shows the real frame colour at each hue, not a raw rainbow.
  const strip = useMemo(() => {
    const stops = [];
    for (let h = 0; h <= 360; h += 20) stops.push(`${framePreview(h, theme).a} ${(h / 360) * 100}%`);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }, [theme]);
  const preview = framePreview(hue, theme);

  return (
    <div className="framePicker">
      <div className="framePreview" style={{ background: `linear-gradient(150deg, ${preview.a}, ${preview.b})` }} aria-hidden="true">
        <span className="framePreviewSide" />
        <span className="framePreviewCanvas" />
      </div>
      <div className="framePickerControls">
        <label className="frameField">
          <span className="frameFieldLabel">
            Colour <strong>{hueName(hue)}</strong>
          </span>
          <input
            className="frameHue"
            type="range"
            min={0}
            max={360}
            step={1}
            value={hue}
            onChange={(event) => onHue(Number(event.target.value))}
            style={{ background: strip }}
            aria-valuetext={hueName(hue)}
          />
        </label>
        <div className="frameSwatches" role="group" aria-label="Suggested colours">
          {PRESETS.map((p) => (
            <button
              key={p.hue}
              type="button"
              className={Math.round(hue) === p.hue ? "frameSwatch active" : "frameSwatch"}
              style={{ background: `linear-gradient(150deg, ${framePreview(p.hue, theme).a}, ${framePreview(p.hue, theme).b})` }}
              onClick={() => onHue(p.hue)}
              aria-label={p.name}
              aria-pressed={Math.round(hue) === p.hue}
              data-tip={p.name}
            />
          ))}
        </div>
        <label className="frameField">
          <span className="frameFieldLabel">
            Grain <strong>{grain === 0 ? "Off" : `${Math.round((grain / 0.2) * 100)}%`}</strong>
          </span>
          <input
            className="frameGrain"
            type="range"
            min={0}
            max={0.2}
            step={0.01}
            value={grain}
            onChange={(event) => onGrain(Number(event.target.value))}
          />
        </label>
        {(hue !== DEFAULT_HUE || grain !== DEFAULT_GRAIN) && (
          <button
            className="linkButton"
            type="button"
            onClick={() => {
              onHue(DEFAULT_HUE);
              onGrain(DEFAULT_GRAIN);
            }}
          >
            Back to the original
          </button>
        )}
      </div>
    </div>
  );
}
