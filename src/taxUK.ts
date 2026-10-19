import { ukStudentLoanRepayment } from "./loans";
import type { PayFrequency, UkStudentLoanPlan } from "./types";
import { payPeriodsPerYear } from "./taxUS";

// A basic UK gross-to-net estimate for an employee on PAYE: income tax (England, Wales and Northern
// Ireland rates), employee National Insurance, student-loan deductions and pension contributions.
// Scottish rates, benefits in kind, tax codes other than the standard one and the High Income
// Child Benefit Charge are all out of scope — this shows where pay goes, it does not replace a
// payslip.

type UkYear = {
  personalAllowance: number;
  // Income above which the personal allowance is withdrawn at £1 for every £2.
  allowanceTaperStart: number;
  basicRateBand: number;
  higherRateLimit: number;
  basicRate: number;
  higherRate: number;
  additionalRate: number;
  niPrimaryThreshold: number;
  niUpperLimit: number;
  niMainRate: number;
  niUpperRate: number;
};

// Tax years keyed by the year they start in (2026 = 6 April 2026 to 5 April 2027). Thresholds are
// frozen through these years; the student-loan thresholds live in loans.ts.
export const UK_TAX_TABLES: Record<number, UkYear> = {
  2025: {
    personalAllowance: 12_570,
    allowanceTaperStart: 100_000,
    basicRateBand: 37_700,
    higherRateLimit: 125_140,
    basicRate: 20,
    higherRate: 40,
    additionalRate: 45,
    niPrimaryThreshold: 12_570,
    niUpperLimit: 50_270,
    niMainRate: 8,
    niUpperRate: 2,
  },
  2026: {
    personalAllowance: 12_570,
    allowanceTaperStart: 100_000,
    basicRateBand: 37_700,
    higherRateLimit: 125_140,
    basicRate: 20,
    higherRate: 40,
    additionalRate: 45,
    niPrimaryThreshold: 12_570,
    niUpperLimit: 50_270,
    niMainRate: 8,
    niUpperRate: 2,
  },
};

export function ukTableYear(year: number): number {
  const years = Object.keys(UK_TAX_TABLES)
    .map(Number)
    .sort((a, b) => a - b);
  return years.filter((candidate) => candidate <= year).pop() ?? years[0];
}

// The UK tax year a date falls in, by its starting year.
export function ukTaxYearFor(date = new Date()): number {
  const beforeApril6 = date.getMonth() < 3 || (date.getMonth() === 3 && date.getDate() < 6);
  return beforeApril6 ? date.getFullYear() - 1 : date.getFullYear();
}

export type UkTaxInput = {
  grossAnnualSalary: number;
  // Employee pension contributions taken from pay before tax (net-pay arrangement). They reduce
  // income tax but not National Insurance.
  pensionAnnual?: number;
  studentLoanPlan?: UkStudentLoanPlan | "none";
  postgradLoan?: boolean;
  payFrequency?: PayFrequency;
  year?: number;
};

export type UkTaxResult = {
  year: number;
  yearLabel: string;
  gross: number;
  pension: number;
  personalAllowance: number;
  taxableIncome: number;
  incomeTax: number;
  bands: Array<{ name: string; rate: number; taxed: number; tax: number }>;
  marginalRate: number;
  nationalInsurance: number;
  studentLoan: number;
  postgradLoan: number;
  totalDeductions: number;
  effectiveDeductionRate: number;
  // Marginal rate including NI and student loan — what the next £1 of pay actually loses.
  marginalDeductionRate: number;
  net: number;
  netMonthly: number;
  netPerPaycheck: number;
  payPeriods: number;
  lines: Array<{ label: string; amount: number; rate?: number }>;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

export function ukPersonalAllowance(adjustedNetIncome: number, year: number): number {
  const table = UK_TAX_TABLES[ukTableYear(year)];
  const excess = Math.max(0, positive(adjustedNetIncome) - table.allowanceTaperStart);
  return Math.max(0, table.personalAllowance - Math.floor(excess / 2));
}

export function ukIncomeTax(grossAfterPension: number, year: number): { tax: number; bands: UkTaxResult["bands"]; personalAllowance: number; taxableIncome: number; marginalRate: number } {
  const table = UK_TAX_TABLES[ukTableYear(year)];
  const income = positive(grossAfterPension);
  const personalAllowance = ukPersonalAllowance(income, year);
  const taxableIncome = Math.max(0, income - personalAllowance);
  // Bands expressed in taxable income: the higher-rate band ends where total income reaches the
  // additional-rate limit, which moves as the allowance tapers away.
  const higherTop = Math.max(table.basicRateBand, table.higherRateLimit - personalAllowance);
  const basicTaxed = Math.min(taxableIncome, table.basicRateBand);
  const higherTaxed = Math.min(Math.max(0, taxableIncome - table.basicRateBand), higherTop - table.basicRateBand);
  const additionalTaxed = Math.max(0, taxableIncome - higherTop);
  const bands = [
    { name: "Basic rate", rate: table.basicRate, taxed: round2(basicTaxed), tax: round2(basicTaxed * (table.basicRate / 100)) },
    { name: "Higher rate", rate: table.higherRate, taxed: round2(higherTaxed), tax: round2(higherTaxed * (table.higherRate / 100)) },
    { name: "Additional rate", rate: table.additionalRate, taxed: round2(additionalTaxed), tax: round2(additionalTaxed * (table.additionalRate / 100)) },
  ].filter((band) => band.taxed > 0);
  const marginalRate = additionalTaxed > 0 ? table.additionalRate : higherTaxed > 0 ? table.higherRate : basicTaxed > 0 ? table.basicRate : 0;
  return { tax: round2(bands.reduce((sum, band) => sum + band.tax, 0)), bands, personalAllowance, taxableIncome, marginalRate };
}

export function ukNationalInsurance(gross: number, year: number): number {
  const table = UK_TAX_TABLES[ukTableYear(year)];
  const income = positive(gross);
  const main = Math.max(0, Math.min(income, table.niUpperLimit) - table.niPrimaryThreshold) * (table.niMainRate / 100);
  const upper = Math.max(0, income - table.niUpperLimit) * (table.niUpperRate / 100);
  return round2(main + upper);
}

export function estimateUkTakeHome(input: UkTaxInput): UkTaxResult {
  const year = ukTableYear(input.year ?? ukTaxYearFor());
  const table = UK_TAX_TABLES[year];
  const gross = positive(input.grossAnnualSalary);
  const pension = Math.min(gross, positive(input.pensionAnnual));
  const incomeTax = ukIncomeTax(gross - pension, year);
  const nationalInsurance = ukNationalInsurance(gross, year);
  const plan = input.studentLoanPlan && input.studentLoanPlan !== "none" ? input.studentLoanPlan : null;
  const studentLoan = plan ? ukStudentLoanRepayment({ grossAnnualSalary: gross, plan, year }).annual : 0;
  const postgradLoan = input.postgradLoan ? ukStudentLoanRepayment({ grossAnnualSalary: gross, plan: "postgrad", year }).annual : 0;
  const totalDeductions = round2(incomeTax.tax + nationalInsurance + studentLoan + postgradLoan);
  const net = round2(gross - pension - totalDeductions);
  const payPeriods = payPeriodsPerYear(input.payFrequency ?? "monthly");

  const niMarginal = gross > table.niUpperLimit ? table.niUpperRate : gross > table.niPrimaryThreshold ? table.niMainRate : 0;
  const loanMarginal = (studentLoan > 0 ? 9 : 0) + (postgradLoan > 0 ? 6 : 0);
  // Between £100k and £125,140 every £2 also loses £1 of allowance, an effective 60% band.
  const taperMarginal = gross - pension > table.allowanceTaperStart && gross - pension <= table.higherRateLimit ? table.higherRate / 2 : 0;

  const lines: UkTaxResult["lines"] = [
    { label: "Gross pay", amount: gross },
    ...(pension > 0 ? [{ label: "Pension contributions (before tax)", amount: -pension }] : []),
    { label: "Income tax", amount: -incomeTax.tax, rate: incomeTax.marginalRate },
    { label: "National Insurance", amount: -nationalInsurance, rate: niMarginal },
    ...(plan ? [{ label: `Student loan (${plan.replace("plan", "Plan ")})`, amount: -studentLoan, rate: 9 }] : []),
    ...(input.postgradLoan ? [{ label: "Postgraduate loan", amount: -postgradLoan, rate: 6 }] : []),
    { label: "Take-home pay", amount: net },
  ];

  return {
    year,
    yearLabel: `${year}/${String(year + 1).slice(-2)}`,
    gross,
    pension,
    personalAllowance: incomeTax.personalAllowance,
    taxableIncome: round2(incomeTax.taxableIncome),
    incomeTax: incomeTax.tax,
    bands: incomeTax.bands,
    marginalRate: incomeTax.marginalRate,
    nationalInsurance,
    studentLoan,
    postgradLoan,
    totalDeductions,
    effectiveDeductionRate: gross > 0 ? round2((totalDeductions / gross) * 100) : 0,
    marginalDeductionRate: incomeTax.marginalRate + niMarginal + loanMarginal + taperMarginal,
    net,
    netMonthly: round2(net / 12),
    netPerPaycheck: round2(net / payPeriods),
    payPeriods,
    lines,
  };
}
