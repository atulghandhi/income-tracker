import type { FilingStatus, PayFrequency } from "./types";

// A deliberately basic US gross-to-net estimate: federal income tax from the bracket tables, FICA,
// and a flat state rate. No credits, itemised deductions, local taxes or multiple jobs. It exists
// to show roughly where a paycheck goes, not to file a return.

export type TaxBracket = { rate: number; upTo: number };

type FederalYear = {
  standardDeduction: Record<FilingStatus, number>;
  brackets: Record<FilingStatus, TaxBracket[]>;
  socialSecurityWageBase: number;
  additionalMedicareThreshold: Record<FilingStatus, number>;
};

const SOCIAL_SECURITY_RATE = 6.2;
const MEDICARE_RATE = 1.45;
const ADDITIONAL_MEDICARE_RATE = 0.9;

function brackets(edges: number[]): TaxBracket[] {
  const rates = [10, 12, 22, 24, 32, 35, 37];
  return rates.map((rate, index) => ({ rate, upTo: edges[index] ?? Infinity }));
}

// Bracket tops per filing status, from the IRS inflation adjustments (2025 figures reflect the
// July 2025 standard-deduction increase).
export const US_FEDERAL_TABLES: Record<number, FederalYear> = {
  2025: {
    standardDeduction: { single: 15_750, "married-joint": 31_500, "married-separate": 15_750, head: 23_625 },
    brackets: {
      single: brackets([11_925, 48_475, 103_350, 197_300, 250_525, 626_350]),
      "married-joint": brackets([23_850, 96_950, 206_700, 394_600, 501_050, 751_600]),
      "married-separate": brackets([11_925, 48_475, 103_350, 197_300, 250_525, 375_800]),
      head: brackets([17_000, 64_850, 103_350, 197_300, 250_525, 626_350]),
    },
    socialSecurityWageBase: 176_100,
    additionalMedicareThreshold: { single: 200_000, "married-joint": 250_000, "married-separate": 125_000, head: 200_000 },
  },
  2026: {
    standardDeduction: { single: 16_100, "married-joint": 32_200, "married-separate": 16_100, head: 24_150 },
    brackets: {
      single: brackets([12_400, 50_400, 105_700, 201_775, 256_225, 640_600]),
      "married-joint": brackets([24_800, 100_800, 211_400, 403_550, 512_450, 768_700]),
      "married-separate": brackets([12_400, 50_400, 105_700, 201_775, 256_225, 384_350]),
      head: brackets([17_700, 67_450, 105_700, 201_775, 256_225, 640_600]),
    },
    socialSecurityWageBase: 184_500,
    additionalMedicareThreshold: { single: 200_000, "married-joint": 250_000, "married-separate": 125_000, head: 200_000 },
  },
};

export function federalTableYear(year: number): number {
  const years = Object.keys(US_FEDERAL_TABLES)
    .map(Number)
    .sort((a, b) => a - b);
  return years.filter((candidate) => candidate <= year).pop() ?? years[0];
}

export const FILING_STATUS_OPTIONS: Array<{ value: FilingStatus; label: string }> = [
  { value: "single", label: "Single" },
  { value: "married-joint", label: "Married filing jointly" },
  { value: "married-separate", label: "Married filing separately" },
  { value: "head", label: "Head of household" },
];

export const PAY_FREQUENCY_OPTIONS: Array<{ value: PayFrequency; label: string; periods: number }> = [
  { value: "monthly", label: "Monthly", periods: 12 },
  { value: "semimonthly", label: "Twice a month", periods: 24 },
  { value: "biweekly", label: "Every two weeks", periods: 26 },
  { value: "weekly", label: "Weekly", periods: 52 },
];

export function payPeriodsPerYear(frequency: PayFrequency): number {
  return PAY_FREQUENCY_OPTIONS.find((option) => option.value === frequency)?.periods ?? 12;
}

// State income tax, simplified to one rate per state. Flat-tax states use their statutory rate;
// progressive states carry a rough effective rate for a middle income, clearly marked so the user
// can override it.
export type StateTax = { code: string; name: string; rate: number; kind: "none" | "flat" | "approx" };

export const US_STATES: StateTax[] = [
  { code: "AL", name: "Alabama", rate: 4.5, kind: "approx" },
  { code: "AK", name: "Alaska", rate: 0, kind: "none" },
  { code: "AZ", name: "Arizona", rate: 2.5, kind: "flat" },
  { code: "AR", name: "Arkansas", rate: 3.5, kind: "approx" },
  { code: "CA", name: "California", rate: 6, kind: "approx" },
  { code: "CO", name: "Colorado", rate: 4.4, kind: "flat" },
  { code: "CT", name: "Connecticut", rate: 4.5, kind: "approx" },
  { code: "DE", name: "Delaware", rate: 5, kind: "approx" },
  { code: "DC", name: "District of Columbia", rate: 6, kind: "approx" },
  { code: "FL", name: "Florida", rate: 0, kind: "none" },
  { code: "GA", name: "Georgia", rate: 5.19, kind: "flat" },
  { code: "HI", name: "Hawaii", rate: 6.5, kind: "approx" },
  { code: "ID", name: "Idaho", rate: 5.3, kind: "flat" },
  { code: "IL", name: "Illinois", rate: 4.95, kind: "flat" },
  { code: "IN", name: "Indiana", rate: 3, kind: "flat" },
  { code: "IA", name: "Iowa", rate: 3.8, kind: "flat" },
  { code: "KS", name: "Kansas", rate: 5, kind: "approx" },
  { code: "KY", name: "Kentucky", rate: 4, kind: "flat" },
  { code: "LA", name: "Louisiana", rate: 3, kind: "flat" },
  { code: "ME", name: "Maine", rate: 6, kind: "approx" },
  { code: "MD", name: "Maryland", rate: 6.5, kind: "approx" },
  { code: "MA", name: "Massachusetts", rate: 5, kind: "flat" },
  { code: "MI", name: "Michigan", rate: 4.25, kind: "flat" },
  { code: "MN", name: "Minnesota", rate: 6, kind: "approx" },
  { code: "MS", name: "Mississippi", rate: 4.4, kind: "flat" },
  { code: "MO", name: "Missouri", rate: 4.5, kind: "approx" },
  { code: "MT", name: "Montana", rate: 5.5, kind: "approx" },
  { code: "NE", name: "Nebraska", rate: 5, kind: "approx" },
  { code: "NV", name: "Nevada", rate: 0, kind: "none" },
  { code: "NH", name: "New Hampshire", rate: 0, kind: "none" },
  { code: "NJ", name: "New Jersey", rate: 4, kind: "approx" },
  { code: "NM", name: "New Mexico", rate: 4.5, kind: "approx" },
  { code: "NY", name: "New York", rate: 5.5, kind: "approx" },
  { code: "NC", name: "North Carolina", rate: 4.25, kind: "flat" },
  { code: "ND", name: "North Dakota", rate: 1.5, kind: "approx" },
  { code: "OH", name: "Ohio", rate: 2.75, kind: "approx" },
  { code: "OK", name: "Oklahoma", rate: 4.5, kind: "approx" },
  { code: "OR", name: "Oregon", rate: 8, kind: "approx" },
  { code: "PA", name: "Pennsylvania", rate: 3.07, kind: "flat" },
  { code: "RI", name: "Rhode Island", rate: 4, kind: "approx" },
  { code: "SC", name: "South Carolina", rate: 5, kind: "approx" },
  { code: "SD", name: "South Dakota", rate: 0, kind: "none" },
  { code: "TN", name: "Tennessee", rate: 0, kind: "none" },
  { code: "TX", name: "Texas", rate: 0, kind: "none" },
  { code: "UT", name: "Utah", rate: 4.5, kind: "flat" },
  { code: "VT", name: "Vermont", rate: 5, kind: "approx" },
  { code: "VA", name: "Virginia", rate: 5, kind: "approx" },
  { code: "WA", name: "Washington", rate: 0, kind: "none" },
  { code: "WV", name: "West Virginia", rate: 4.5, kind: "approx" },
  { code: "WI", name: "Wisconsin", rate: 5, kind: "approx" },
  { code: "WY", name: "Wyoming", rate: 0, kind: "none" },
];

export function stateTaxFor(code: string): StateTax | undefined {
  return US_STATES.find((state) => state.code === code);
}

export type UsTaxInput = {
  grossAnnualSalary: number;
  filingStatus: FilingStatus;
  state: string;
  // Replaces the table's state rate when set.
  stateRateOverride?: number | null;
  // Annual pre-tax payroll deductions. 401(k)/403(b) skip income tax only; HSA and section-125
  // health premiums skip FICA too.
  preTaxRetirementAnnual?: number;
  preTaxHsaAnnual?: number;
  preTaxHealthPremiumAnnual?: number;
  // Roth payroll contributions: taxed, but still leave the paycheck.
  afterTaxPayrollAnnual?: number;
  payFrequency?: PayFrequency;
  year?: number;
};

export type TaxLine = { label: string; amount: number; rate?: number };

export type UsTaxResult = {
  year: number;
  gross: number;
  standardDeduction: number;
  federalTaxableIncome: number;
  federalTax: number;
  federalBrackets: Array<{ rate: number; taxed: number; tax: number }>;
  marginalRate: number;
  stateCode: string;
  stateRate: number;
  stateKind: StateTax["kind"] | "override" | "none";
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  fica: number;
  preTaxDeductions: number;
  afterTaxDeductions: number;
  totalTax: number;
  effectiveTaxRate: number;
  net: number;
  netMonthly: number;
  netPerPaycheck: number;
  payPeriods: number;
  lines: TaxLine[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

export function federalIncomeTax(taxableIncome: number, filingStatus: FilingStatus, year: number): { tax: number; brackets: UsTaxResult["federalBrackets"]; marginalRate: number } {
  const table = US_FEDERAL_TABLES[federalTableYear(year)];
  const result: UsTaxResult["federalBrackets"] = [];
  let remaining = positive(taxableIncome);
  let lower = 0;
  let tax = 0;
  let marginalRate = 0;
  for (const bracket of table.brackets[filingStatus]) {
    if (remaining <= 0) break;
    const width = bracket.upTo - lower;
    const taxed = Math.min(remaining, width);
    const bracketTax = taxed * (bracket.rate / 100);
    result.push({ rate: bracket.rate, taxed: round2(taxed), tax: round2(bracketTax) });
    tax += bracketTax;
    marginalRate = bracket.rate;
    remaining -= taxed;
    lower = bracket.upTo;
  }
  return { tax: round2(tax), brackets: result, marginalRate };
}

export function estimateUsTakeHome(input: UsTaxInput): UsTaxResult {
  const year = federalTableYear(input.year ?? new Date().getFullYear());
  const table = US_FEDERAL_TABLES[year];
  const gross = positive(input.grossAnnualSalary);
  const retirement = Math.min(gross, positive(input.preTaxRetirementAnnual));
  const hsa = Math.min(gross - retirement, positive(input.preTaxHsaAnnual));
  const premium = Math.min(gross - retirement - hsa, positive(input.preTaxHealthPremiumAnnual));
  const afterTax = Math.min(gross, positive(input.afterTaxPayrollAnnual));
  const preTaxDeductions = retirement + hsa + premium;

  const standardDeduction = table.standardDeduction[input.filingStatus];
  const federalTaxableIncome = Math.max(0, gross - preTaxDeductions - standardDeduction);
  const federal = federalIncomeTax(federalTaxableIncome, input.filingStatus, year);

  // FICA: 401(k) money is still wages for Social Security and Medicare; HSA and health premiums are not.
  const ficaWages = Math.max(0, gross - hsa - premium);
  const socialSecurity = round2(Math.min(ficaWages, table.socialSecurityWageBase) * (SOCIAL_SECURITY_RATE / 100));
  const additionalMedicareWages = Math.max(0, ficaWages - table.additionalMedicareThreshold[input.filingStatus]);
  const medicare = round2(ficaWages * (MEDICARE_RATE / 100) + additionalMedicareWages * (ADDITIONAL_MEDICARE_RATE / 100));

  const stateEntry = stateTaxFor(input.state);
  const override = input.stateRateOverride;
  const stateRate = override !== null && override !== undefined && Number.isFinite(override) ? Math.max(0, Number(override)) : (stateEntry?.rate ?? 0);
  const stateKind: UsTaxResult["stateKind"] = override !== null && override !== undefined && Number.isFinite(override) ? "override" : (stateEntry?.kind ?? "none");
  // Applied to income after pre-tax deductions and the federal standard deduction — a rough stand-in
  // for each state's own exemptions.
  const stateTax = round2(federalTaxableIncome * (stateRate / 100));

  const totalTax = round2(federal.tax + stateTax + socialSecurity + medicare);
  const net = round2(gross - totalTax - preTaxDeductions - afterTax);
  const payPeriods = payPeriodsPerYear(input.payFrequency ?? "monthly");

  const lines: TaxLine[] = [
    { label: "Gross pay", amount: gross },
    ...(retirement > 0 ? [{ label: "Pre-tax retirement (401(k)/403(b))", amount: -retirement }] : []),
    ...(hsa > 0 ? [{ label: "HSA / FSA contributions", amount: -hsa }] : []),
    ...(premium > 0 ? [{ label: "Health insurance premiums (pre-tax)", amount: -premium }] : []),
    { label: "Federal income tax", amount: -federal.tax, rate: federal.marginalRate },
    { label: stateEntry && stateKind !== "override" ? `${stateEntry.name} income tax` : "State income tax", amount: -stateTax, rate: stateRate },
    { label: "Social Security (6.2%)", amount: -socialSecurity, rate: SOCIAL_SECURITY_RATE },
    { label: "Medicare (1.45%)", amount: -medicare, rate: MEDICARE_RATE },
    ...(afterTax > 0 ? [{ label: "Roth / after-tax payroll contributions", amount: -afterTax }] : []),
    { label: "Take-home pay", amount: net },
  ];

  return {
    year,
    gross,
    standardDeduction,
    federalTaxableIncome: round2(federalTaxableIncome),
    federalTax: federal.tax,
    federalBrackets: federal.brackets,
    marginalRate: federal.marginalRate,
    stateCode: stateEntry?.code ?? "",
    stateRate,
    stateKind,
    stateTax,
    socialSecurity,
    medicare,
    fica: round2(socialSecurity + medicare),
    preTaxDeductions: round2(preTaxDeductions),
    afterTaxDeductions: round2(afterTax),
    totalTax,
    effectiveTaxRate: gross > 0 ? round2((totalTax / gross) * 100) : 0,
    net,
    netMonthly: round2(net / 12),
    netPerPaycheck: round2(net / payPeriods),
    payPeriods,
    lines,
  };
}
