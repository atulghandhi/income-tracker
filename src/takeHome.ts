import { isPayrollContribution } from "./finance";
import type { RegionKey } from "./region";
import { estimateUkTakeHome, ukTaxYearFor, type UkTaxResult } from "./taxUK";
import { estimateUsTakeHome, type UsTaxResult } from "./taxUS";
import type { Account, TaxProfile } from "./types";

// One entry point for "what does my gross salary become": picks the US or UK estimator, feeding it
// the payroll contributions already set up on the user's accounts.

export type PayrollDeductions = {
  // US: 401(k)/403(b) pre-tax; UK: pension (net pay arrangement).
  preTaxRetirementAnnual: number;
  // US: HSA and FSA money, exempt from FICA as well.
  preTaxHealthAccountsAnnual: number;
  // Roth payroll contributions: taxed, but not in the paycheck.
  afterTaxAnnual: number;
};

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

export function payrollDeductionsFromAccounts(accounts: Account[], region: RegionKey): PayrollDeductions {
  const result: PayrollDeductions = { preTaxRetirementAnnual: 0, preTaxHealthAccountsAnnual: 0, afterTaxAnnual: 0 };
  for (const account of accounts) {
    if (!isPayrollContribution(account)) continue;
    const annual = positive(account.monthlyContribution) * 12;
    if (annual <= 0) continue;
    if (account.type === "hsa" || account.type === "fsa") {
      result.preTaxHealthAccountsAnnual += annual;
    } else if (account.taxTreatment === "roth") {
      result.afterTaxAnnual += annual;
    } else if (region === "US" ? account.type === "401k" || account.type === "403b" : account.type === "pension" || account.type === "sipp") {
      result.preTaxRetirementAnnual += annual;
    } else if (account.taxTreatment === "pre-tax") {
      result.preTaxRetirementAnnual += annual;
    } else {
      result.afterTaxAnnual += annual;
    }
  }
  return result;
}

export type TakeHomeSummary = {
  region: RegionKey;
  hasSalary: boolean;
  gross: number;
  net: number;
  netMonthly: number;
  netPerPaycheck: number;
  payPeriods: number;
  // Taxes (and UK student loan) only — not the contributions the user chose to make.
  totalDeductions: number;
  effectiveRate: number;
  marginalRate: number;
  lines: Array<{ label: string; amount: number; rate?: number }>;
  yearLabel: string;
  us?: UsTaxResult;
  uk?: UkTaxResult;
  payroll: PayrollDeductions;
  // A one-off bonus, kept out of the regular figures above: what it adds to the year after tax.
  oneOffBonus?: { gross: number; net: number };
};

// Regular pay is the salary plus any bonus paid every month; a one-off bonus is valued separately as
// the extra take-home it adds to the year, so the monthly figure the budget uses stays steady.
export function computeTakeHome(region: RegionKey, profile: TaxProfile, accounts: Account[], today = new Date()): TakeHomeSummary {
  const salary = positive(profile.grossAnnualSalary);
  const bonus = positive(profile.bonusAmount);
  const oneOff = profile.bonusOneOff !== false;
  const regularGross = salary + (oneOff ? 0 : bonus * 12);
  const regular = estimate(region, profile, accounts, regularGross, today);
  if (!oneOff && bonus > 0) regular.lines[0] = { ...regular.lines[0], label: "Gross pay (incl. bonus/commission)" };
  if (oneOff && bonus > 0 && salary > 0) {
    const withBonus = estimate(region, profile, accounts, regularGross + bonus, today);
    regular.oneOffBonus = { gross: bonus, net: Math.round((withBonus.net - regular.net) * 100) / 100 };
  }
  return regular;
}

function estimate(region: RegionKey, profile: TaxProfile, accounts: Account[], gross: number, today: Date): TakeHomeSummary {
  const payroll = payrollDeductionsFromAccounts(accounts, region);
  const pensionAnnual = positive(profile.pensionMonthly) * 12;
  if (region === "US") {
    const us = estimateUsTakeHome({
      grossAnnualSalary: gross,
      filingStatus: profile.filingStatus,
      state: profile.state,
      stateRateOverride: profile.stateRateOverride,
      preTaxRetirementAnnual: payroll.preTaxRetirementAnnual + pensionAnnual,
      preTaxHsaAnnual: payroll.preTaxHealthAccountsAnnual,
      preTaxHealthPremiumAnnual: positive(profile.preTaxHealthPremiumMonthly) * 12,
      afterTaxPayrollAnnual: payroll.afterTaxAnnual,
      payFrequency: profile.payFrequency,
      year: today.getFullYear(),
    });
    return {
      region,
      hasSalary: gross > 0,
      gross,
      net: us.net,
      netMonthly: us.netMonthly,
      netPerPaycheck: us.netPerPaycheck,
      payPeriods: us.payPeriods,
      totalDeductions: us.totalTax,
      effectiveRate: us.effectiveTaxRate,
      marginalRate: us.marginalRate,
      lines: us.lines,
      yearLabel: String(us.year),
      us,
      payroll,
    };
  }
  const sacrifice = profile.pensionMethod !== "net-pay";
  const uk = estimateUkTakeHome({
    grossAnnualSalary: gross,
    salarySacrificeAnnual: sacrifice ? pensionAnnual : 0,
    pensionAnnual: payroll.preTaxRetirementAnnual + (sacrifice ? 0 : pensionAnnual),
    studentLoanPlan: profile.studentLoanPlan,
    postgradLoan: profile.postgradLoan,
    payFrequency: profile.payFrequency,
    year: ukTaxYearFor(today),
  });
  return {
    region,
    hasSalary: gross > 0,
    gross,
    net: uk.net,
    netMonthly: uk.netMonthly,
    netPerPaycheck: uk.netPerPaycheck,
    payPeriods: uk.payPeriods,
    totalDeductions: uk.totalDeductions,
    effectiveRate: uk.effectiveDeductionRate,
    marginalRate: uk.marginalDeductionRate,
    lines: uk.lines,
    yearLabel: uk.yearLabel,
    uk,
    payroll,
  };
}
