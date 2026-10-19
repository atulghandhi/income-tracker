import type { RegionKey } from "./region";

// The health score produces a rough credit estimate on a 300–850 scale (see estimateCreditScore in
// finance.ts). What that number means depends on where you live: in the US it reads like a FICO or
// VantageScore figure; in the UK the agencies use their own scales, so it is translated onto
// Experian's 0–999 scale, the one most people recognise.

export type ScoreTone = "bad" | "warn" | "ok" | "good" | "great";

export type ScoreBand = { label: string; min: number; max: number; tone: ScoreTone };

export type ScoreReading = {
  scale: string;
  // Lowest and highest possible on this scale.
  min: number;
  max: number;
  score: number;
  band: ScoreBand;
  bands: ScoreBand[];
  note: string;
};

export type CreditScoreInterpretation = {
  region: RegionKey;
  primary: ScoreReading;
  secondary?: ScoreReading;
  // What the bands mean for the user, in their country's terms.
  meaning: string;
};

export const FICO_BANDS: ScoreBand[] = [
  { label: "Poor", min: 300, max: 579, tone: "bad" },
  { label: "Fair", min: 580, max: 669, tone: "warn" },
  { label: "Good", min: 670, max: 739, tone: "ok" },
  { label: "Very good", min: 740, max: 799, tone: "good" },
  { label: "Exceptional", min: 800, max: 850, tone: "great" },
];

export const VANTAGE_BANDS: ScoreBand[] = [
  { label: "Very poor", min: 300, max: 499, tone: "bad" },
  { label: "Poor", min: 500, max: 600, tone: "warn" },
  { label: "Fair", min: 601, max: 660, tone: "ok" },
  { label: "Good", min: 661, max: 780, tone: "good" },
  { label: "Excellent", min: 781, max: 850, tone: "great" },
];

export const EXPERIAN_BANDS: ScoreBand[] = [
  { label: "Very poor", min: 0, max: 560, tone: "bad" },
  { label: "Poor", min: 561, max: 720, tone: "warn" },
  { label: "Fair", min: 721, max: 880, tone: "ok" },
  { label: "Good", min: 881, max: 960, tone: "good" },
  { label: "Excellent", min: 961, max: 999, tone: "great" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function bandFor(score: number, bands: ScoreBand[]): ScoreBand {
  return bands.find((band) => score >= band.min && score <= band.max) ?? bands[Math.round(score) <= bands[0].max ? 0 : bands.length - 1];
}

// Linear map from the internal 300–850 estimate onto 0–999.
export function toExperianScale(estimate: number): number {
  return Math.round(((clamp(estimate, 300, 850) - 300) / 550) * 999);
}

export function interpretCreditScore(estimate: number, region: RegionKey): CreditScoreInterpretation {
  const score = Math.round(clamp(estimate, 300, 850));
  if (region === "US") {
    const fico = bandFor(score, FICO_BANDS);
    const vantage = bandFor(score, VANTAGE_BANDS);
    return {
      region,
      primary: {
        scale: "FICO",
        min: 300,
        max: 850,
        score,
        band: fico,
        bands: FICO_BANDS,
        note: "FICO 8 ranges, the scores most lenders pull.",
      },
      secondary: {
        scale: "VantageScore",
        min: 300,
        max: 850,
        score,
        band: vantage,
        bands: VANTAGE_BANDS,
        note: "VantageScore 3.0 ranges, used by Credit Karma and many free score apps.",
      },
      meaning:
        fico.tone === "great" || fico.tone === "good"
          ? "Lenders usually offer their best rates from the mid-700s. Payment history (35%) and utilization (30%) matter most."
          : fico.tone === "ok"
            ? "Most lenders approve in this range, though not always at the best rate. Paying cards below 30% of their limits is the fastest lever."
            : "Sub-prime territory for most lenders: expect higher rates or deposits. On-time payments and lower card balances move this most.",
    };
  }
  const experianScore = toExperianScale(score);
  const band = bandFor(experianScore, EXPERIAN_BANDS);
  return {
    region,
    primary: {
      scale: "Experian",
      min: 0,
      max: 999,
      score: experianScore,
      band,
      bands: EXPERIAN_BANDS,
      note: "Experian's 0–999 bands. Equifax (0–1000) and TransUnion (0–710) use their own scales, so the number differs but the band is usually similar.",
    },
    meaning:
      band.tone === "great" || band.tone === "good"
        ? "Lenders usually offer their best deals from the Good band. Being on the electoral roll and keeping card balances low help most."
        : band.tone === "ok"
          ? "Most lenders will approve in this band, not always at the headline rate. Lower card utilisation and no missed payments lift it."
          : "Expect higher rates or refusals. Paying on time every month and reducing card balances move this most.",
  };
}
