import type { RegionKey } from "./region";
import type { Account, RepaymentPlan, TaxProfile, UkStudentLoanPlan } from "./types";

// Loans: amortised payments for fixed-term borrowing, and the special repayment rules for student
// loans on each side of the Atlantic.
//
//   • US federal loans repay over 10 years on the standard plan, or as a share of discretionary
//     income on an income-driven plan. Private loans are ordinary amortising loans.
//   • UK loans are collected through payroll as 9% (6% postgraduate) of pay above a threshold, so
//     the "payment" depends on salary, not on the balance.

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

// Level monthly payment that clears `balance` over `termMonths` at a nominal annual rate — the
// formula lenders price loans with (APR / 12 per month).
export function amortizedPayment(balance: number, annualRatePercent: number, termMonths: number): number {
  const principal = positive(balance);
  const months = Math.max(1, Math.round(positive(termMonths)));
  const monthlyRate = positive(annualRatePercent) / 100 / 12;
  if (principal <= 0) return 0;
  if (monthlyRate === 0) return round2(principal / months);
  return round2((principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)));
}

// Total interest paid over the life of an amortised loan.
export function totalInterest(balance: number, annualRatePercent: number, termMonths: number): number {
  const payment = amortizedPayment(balance, annualRatePercent, termMonths);
  return round2(Math.max(0, payment * Math.max(1, Math.round(positive(termMonths))) - positive(balance)));
}

// ─── US student loans ────────────────────────────────────────────────────────

export const US_REPAYMENT_PLANS: Array<{ value: RepaymentPlan; label: string; hint: string; termMonths: number | null }> = [
  { value: "standard", label: "Standard (10 years)", hint: "Fixed payments that clear the loan in 10 years. Lowest total interest.", termMonths: 120 },
  { value: "graduated", label: "Graduated (10 years)", hint: "Starts lower and rises every two years; still 10 years. Costs more overall.", termMonths: 120 },
  { value: "extended", label: "Extended (25 years)", hint: "Balances over $30,000 can stretch to 25 years. Lower payment, much more interest.", termMonths: 300 },
  {
    value: "income-driven",
    label: "Income-driven (IBR / PAYE style)",
    hint: "About 10% of discretionary income — what you earn above 150% of the poverty line. Any balance left after 20–25 years is forgiven.",
    termMonths: null,
  },
];

// HHS poverty guideline for the 48 contiguous states (2025). Alaska and Hawaii are higher.
export const US_POVERTY_GUIDELINE = { year: 2025, base: 15_650, perPerson: 5_500 };

export function povertyGuideline(familySize: number): number {
  const size = Math.max(1, Math.round(positive(familySize) || 1));
  return US_POVERTY_GUIDELINE.base + (size - 1) * US_POVERTY_GUIDELINE.perPerson;
}

export type IncomeDrivenEstimate = {
  monthly: number;
  discretionaryIncome: number;
  povertyGuideline: number;
  percent: number;
};

// Simplified income-driven payment: 10% of income above 150% of the poverty guideline, per month.
export function incomeDrivenPayment({ adjustedGrossIncome, familySize = 1, percent = 10 }: { adjustedGrossIncome: number; familySize?: number; percent?: number }): IncomeDrivenEstimate {
  const guideline = povertyGuideline(familySize);
  const discretionary = Math.max(0, positive(adjustedGrossIncome) - 1.5 * guideline);
  return {
    monthly: round2((discretionary * (percent / 100)) / 12),
    discretionaryIncome: round2(discretionary),
    povertyGuideline: guideline,
    percent,
  };
}

// ─── UK student loans ────────────────────────────────────────────────────────

export const UK_STUDENT_LOAN_PLANS: Array<{ value: UkStudentLoanPlan; label: string; hint: string }> = [
  { value: "plan1", label: "Plan 1", hint: "Started an undergraduate course before September 2012 (England/Wales), or any time in Northern Ireland." },
  { value: "plan2", label: "Plan 2", hint: "Started an undergraduate course in England or Wales between September 2012 and July 2023." },
  { value: "plan4", label: "Plan 4", hint: "Scottish student loans." },
  { value: "plan5", label: "Plan 5", hint: "Started an undergraduate course in England from August 2023." },
  { value: "postgrad", label: "Postgraduate loan", hint: "Master's or doctoral loan. Repaid at 6% above £21,000, alongside any undergraduate plan." },
];

type UkThresholds = Record<UkStudentLoanPlan, number>;

// Repayment thresholds by tax year (2026 = 2026/27). Plan 2 and Plan 5 figures are published; the
// Plan 1 and Plan 4 figures for 2026/27 follow the usual RPI uprating and can be overridden.
const UK_THRESHOLDS: Record<number, UkThresholds> = {
  2025: { plan1: 26_065, plan2: 28_470, plan4: 32_745, plan5: 25_000, postgrad: 21_000 },
  2026: { plan1: 26_900, plan2: 29_385, plan4: 33_795, plan5: 25_000, postgrad: 21_000 },
};

export function ukStudentLoanThreshold(plan: UkStudentLoanPlan, year: number): number {
  const years = Object.keys(UK_THRESHOLDS)
    .map(Number)
    .sort((a, b) => a - b);
  const chosen = years.filter((candidate) => candidate <= year).pop() ?? years[0];
  return UK_THRESHOLDS[chosen][plan];
}

export function ukStudentLoanRate(plan: UkStudentLoanPlan): number {
  return plan === "postgrad" ? 6 : 9;
}

export type UkStudentLoanRepayment = {
  plan: UkStudentLoanPlan;
  threshold: number;
  ratePercent: number;
  annual: number;
  monthly: number;
};

// 9% (6% postgraduate) of everything earned above the plan's threshold, collected through payroll.
export function ukStudentLoanRepayment({
  grossAnnualSalary,
  plan,
  year,
  thresholdOverride,
}: {
  grossAnnualSalary: number;
  plan: UkStudentLoanPlan;
  year: number;
  thresholdOverride?: number;
}): UkStudentLoanRepayment {
  const threshold = positive(thresholdOverride) > 0 ? positive(thresholdOverride) : ukStudentLoanThreshold(plan, year);
  const ratePercent = ukStudentLoanRate(plan);
  const annual = round2(Math.max(0, positive(grossAnnualSalary) - threshold) * (ratePercent / 100));
  return { plan, threshold, ratePercent, annual, monthly: round2(annual / 12) };
}

// ─── Per-account summary ─────────────────────────────────────────────────────

export type LoanSuggestion = {
  // The payment the loan's own rules imply, when they can be worked out.
  suggestedPayment: number | null;
  // Why: "Standard plan over 120 months", "9% of pay above £29,385" …
  basis: string;
  // Extra context for the row ("Income-driven plans need your salary", …).
  notes: string[];
};

// What a loan's rules say the monthly payment should be, from the fields the user has filled in.
// Returns a null suggestion (with a note) when something needed is missing.
export function loanSuggestion(account: Account, region: RegionKey, profile: Pick<TaxProfile, "grossAnnualSalary">, year: number): LoanSuggestion {
  const notes: string[] = [];
  const balance = positive(account.balance);
  const salary = positive(profile.grossAnnualSalary);

  if (account.type === "student-loan") {
    if (region === "GB") {
      const plan = account.studentLoanPlan;
      if (!plan) return { suggestedPayment: null, basis: "", notes: ["Pick the repayment plan to estimate payroll deductions."] };
      if (salary <= 0) return { suggestedPayment: null, basis: "", notes: ["Add your gross salary on the Pay & tax page to work out the 9% repayment."] };
      const repayment = ukStudentLoanRepayment({ grossAnnualSalary: salary, plan, year });
      return {
        suggestedPayment: repayment.monthly,
        basis: `${repayment.ratePercent}% of pay above £${repayment.threshold.toLocaleString("en-GB")} · taken through payroll`,
        notes: repayment.monthly <= 0 ? ["Below the repayment threshold: nothing is taken from pay."] : [],
      };
    }
    // The loan-type select defaults to federal, so an unset type reads as federal here too.
    const loanType = account.studentLoanType ?? "federal";
    if (loanType === "federal" && account.repaymentPlan === "income-driven") {
      if (salary <= 0) return { suggestedPayment: null, basis: "", notes: ["Add your gross salary on the Pay & tax page to estimate an income-driven payment."] };
      const estimate = incomeDrivenPayment({ adjustedGrossIncome: salary, familySize: account.familySize ?? 1 });
      return {
        suggestedPayment: estimate.monthly,
        basis: `${estimate.percent}% of discretionary income (above 150% of the poverty line for a household of ${Math.max(1, account.familySize ?? 1)})`,
        notes: estimate.monthly <= 0 ? ["Income is under 150% of the poverty line: the payment would be $0."] : [],
      };
    }
    const plan = US_REPAYMENT_PLANS.find((option) => option.value === (account.repaymentPlan ?? "standard"));
    const term = positive(account.termMonths) > 0 ? positive(account.termMonths) : loanType === "federal" ? (plan?.termMonths ?? 120) : 0;
    if (term <= 0) return { suggestedPayment: null, basis: "", notes: ["Add the remaining term in months to work out the payment."] };
    return {
      suggestedPayment: amortizedPayment(balance, account.rate, term),
      basis: `${loanType === "federal" ? `${plan?.label ?? "Standard"} plan` : "Private loan"} · ${term} months at ${positive(account.rate)}%`,
      notes,
    };
  }

  if (account.type === "mortgage" || account.type === "auto-loan" || account.type === "loan") {
    const term = positive(account.termMonths);
    if (term <= 0) return { suggestedPayment: null, basis: "", notes: ["Add the remaining term in months to check the payment."] };
    return {
      suggestedPayment: amortizedPayment(balance, account.rate, term),
      basis: `${term} months at ${positive(account.rate)}%`,
      notes: [`About ${Math.round(totalInterest(balance, account.rate, term)).toLocaleString("en")} in interest over the term.`],
    };
  }

  return { suggestedPayment: null, basis: "", notes };
}
