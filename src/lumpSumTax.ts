import { ukStudentLoanRate, ukStudentLoanThreshold } from "./loans";
import { UK_TAX_TABLES, ukIncomeTax, ukPersonalAllowance, ukTableYear, ukTaxYearFor } from "./taxUK";
import type { LumpSumSource, UkStudentLoanPlan, UndergradLoanPlan } from "./types";

export type { LumpSumSource } from "./types";

// How much of a one-off, untaxed lump sum to set aside for UK tax, given the salary that has
// already been taxed through PAYE this year and anything else already received from the same kind
// of source. The bill is worked out marginally: tax on (already received + this lump sum) minus
// tax on (already received), with the lump stacked on top of salary, so the right bands, the
// personal-allowance taper and each source's own allowance are all respected.
//
// England, Wales and Northern Ireland rates. Scottish income tax bands differ for earned income
// (savings, dividend and capital-gains rates are UK-wide). Pension contributions, Gift Aid, the
// High Income Child Benefit Charge, Business Asset Disposal Relief and non-UK income are out of
// scope — this sizes a sensible reserve, it does not replace a tax return.

export const LUMP_SUM_SOURCES: Array<{ value: LumpSumSource; label: string; hint: string }> = [
  { value: "self-employed", label: "Self-employed or freelance income", hint: "Profit from work done outside PAYE. Income tax at your marginal rate plus Class 4 National Insurance on profits above the lower limit." },
  { value: "other-income", label: "Other untaxed income", hint: "Income paid without tax taken off: royalties, commission, a tip or fee paid gross, casual earnings, foreign income. Income tax at your marginal rate, no National Insurance." },
  { value: "rental", label: "Rental profit", hint: "Rent received less allowable expenses (or the £1,000 property allowance). Income tax at your marginal rate, no National Insurance." },
  { value: "savings-interest", label: "Savings interest (outside an ISA)", hint: "Interest from accounts, bonds or peer-to-peer lending. The starting rate for savings and your Personal Savings Allowance (£1,000 basic rate, £500 higher rate, nil additional rate) come off first." },
  { value: "dividends", label: "Dividends", hint: "Dividends from shares or your own company, outside an ISA or pension. The £500 dividend allowance comes off first; the rest is taxed at dividend rates." },
  { value: "capital-gain", label: "Capital gain (shares, crypto, property that is not your home)", hint: "The gain, not the sale price: what you sold for less what you paid and costs. The £3,000 annual exempt amount comes off first; the rest is taxed at 18% inside the basic-rate band and 24% above it." },
];

type YearExtras = {
  savingsAllowanceBasic: number;
  savingsAllowanceHigher: number;
  startingRateBand: number;
  dividendAllowance: number;
  dividendBasic: number;
  dividendHigher: number;
  dividendAdditional: number;
  cgtExempt: number;
  cgtBasic: number;
  cgtHigher: number;
  class4Lower: number;
  class4Upper: number;
  class4Main: number;
  class4Upper2: number;
};

// Keyed like UK_TAX_TABLES by the year the tax year starts in.
export const UK_LUMP_SUM_TABLES: Record<number, YearExtras> = {
  2025: {
    savingsAllowanceBasic: 1_000,
    savingsAllowanceHigher: 500,
    startingRateBand: 5_000,
    dividendAllowance: 500,
    dividendBasic: 8.75,
    dividendHigher: 33.75,
    dividendAdditional: 39.35,
    cgtExempt: 3_000,
    cgtBasic: 18,
    cgtHigher: 24,
    class4Lower: 12_570,
    class4Upper: 50_270,
    class4Main: 6,
    class4Upper2: 2,
  },
  2026: {
    savingsAllowanceBasic: 1_000,
    savingsAllowanceHigher: 500,
    startingRateBand: 5_000,
    dividendAllowance: 500,
    dividendBasic: 8.75,
    dividendHigher: 33.75,
    dividendAdditional: 39.35,
    cgtExempt: 3_000,
    cgtBasic: 18,
    cgtHigher: 24,
    class4Lower: 12_570,
    class4Upper: 50_270,
    class4Main: 6,
    class4Upper2: 2,
  },
};

export type LumpSumTaxLine = { label: string; amount: number; rate?: number; base?: number };

export type LumpSumTaxInput = {
  amount: number;
  source: LumpSumSource;
  // Gross salary already taxed through PAYE this year (annual).
  grossAnnualSalary: number;
  // Already received this tax year from the same kind of source, before tax.
  priorThisYear: number;
  // Student loans being repaid: Self Assessment collects 9% (6% postgraduate) of income above the
  // plan threshold on untaxed income too, on top of what payroll already took from salary.
  studentLoan?: { plan: UndergradLoanPlan | null; postgrad: boolean };
  year?: number;
  today?: Date;
};

// Unearned income (rent, interest, dividends) only counts towards student-loan repayments once it
// is over £2,000 in the year — and then all of it counts. Earned income always counts; a capital
// gain is not income at all.
export const STUDENT_LOAN_UNEARNED_LIMIT = 2_000;

export function studentLoanIncomeKind(source: LumpSumSource): "earned" | "unearned" | "none" {
  if (source === "capital-gain") return "none";
  if (source === "self-employed" || source === "other-income") return "earned";
  return "unearned";
}

export const UNDERGRAD_PLANS: UndergradLoanPlan[] = ["plan1", "plan2", "plan4", "plan5"];

export function planLabel(plan: UkStudentLoanPlan): string {
  return plan === "postgrad" ? "Postgraduate loan" : plan.replace("plan", "Plan ");
}

// Repayment on everything counted so far this year (salary plus untaxed income), per plan.
function studentLoanDue(plan: UkStudentLoanPlan, income: number, year: number): number {
  return Math.max(0, income - ukStudentLoanThreshold(plan, year)) * (ukStudentLoanRate(plan) / 100);
}

// The extra repayment a lump sum triggers: the repayment on (salary + what counts so far + lump)
// less the repayment on (salary + what counted before).
export function ukStudentLoanOnLumpSum({
  plan,
  salary,
  priorThisYear,
  amount,
  source,
  year,
}: {
  plan: UkStudentLoanPlan;
  salary: number;
  priorThisYear: number;
  amount: number;
  source: LumpSumSource;
  year: number;
}): { repayment: number; counted: number; rate: number; threshold: number } {
  const kind = studentLoanIncomeKind(source);
  const rate = ukStudentLoanRate(plan);
  const threshold = ukStudentLoanThreshold(plan, year);
  if (kind === "none" || amount <= 0) return { repayment: 0, counted: 0, rate, threshold };
  const before = kind === "earned" || priorThisYear > STUDENT_LOAN_UNEARNED_LIMIT ? priorThisYear : 0;
  const after = kind === "earned" || priorThisYear + amount > STUDENT_LOAN_UNEARNED_LIMIT ? priorThisYear + amount : 0;
  const repayment = round2(studentLoanDue(plan, salary + after, year) - studentLoanDue(plan, salary + before, year));
  return { repayment, counted: Math.max(0, after - before), rate, threshold };
}

export type LumpSumTaxResult = {
  year: number;
  yearLabel: string;
  amount: number;
  // Everything to set aside: tax plus any student loan repayment.
  tax: number;
  studentLoan: number;
  net: number;
  // Tax as a share of the lump sum.
  effectiveRate: number;
  // The highest rate any part of the lump sum was charged at.
  topRate: number;
  lines: LumpSumTaxLine[];
  dueDate: string;
  dueLabel: string;
  dueInMonths: number;
  notes: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

function tables(year: number) {
  const key = ukTableYear(year);
  return { year: key, income: UK_TAX_TABLES[key], extras: UK_LUMP_SUM_TABLES[key] ?? UK_LUMP_SUM_TABLES[2025] };
}

// Splits `amount` of income sitting on top of `position` (taxable income already used) across the
// basic, higher and additional bands, given where the higher band ends for this taxpayer.
function stack(position: number, amount: number, basicBand: number, higherTop: number): { basic: number; higher: number; additional: number } {
  const end = position + amount;
  const basic = Math.max(0, Math.min(end, basicBand) - Math.min(position, basicBand));
  const higher = Math.max(0, Math.min(end, higherTop) - Math.max(position, basicBand));
  const additional = Math.max(0, end - Math.max(position, higherTop));
  return { basic, higher, additional };
}

// ─── Each source's total-tax function (on everything from that source this year) ────────────

export function ukClass4NI(profits: number, year: number): number {
  const { extras } = tables(year);
  const income = positive(profits);
  const main = Math.max(0, Math.min(income, extras.class4Upper) - extras.class4Lower) * (extras.class4Main / 100);
  const upper = Math.max(0, income - extras.class4Upper) * (extras.class4Upper2 / 100);
  return round2(main + upper);
}

type BandTax = { basic: number; higher: number; additional: number; allowanceUsed: number; startingUsed: number; total: number };

// Interest stacked on top of non-savings income: unused personal allowance, then the starting
// rate for savings, then the Personal Savings Allowance (all at 0%), then the ordinary bands.
export function ukSavingsInterestTax(nonSavingsIncome: number, interest: number, year: number): BandTax {
  const { income: table, extras } = tables(year);
  const other = positive(nonSavingsIncome);
  const amount = positive(interest);
  // Interest counts towards adjusted net income, so it can taper the allowance.
  const personalAllowance = ukPersonalAllowance(other + amount, year);
  const otherTaxable = Math.max(0, other - personalAllowance);
  const unusedAllowance = Math.max(0, personalAllowance - other);
  const afterAllowance = Math.max(0, amount - unusedAllowance);
  const higherTop = Math.max(table.basicRateBand, table.higherRateLimit - personalAllowance);
  const startingBand = Math.max(0, extras.startingRateBand - otherTaxable);
  const startingUsed = Math.min(afterAllowance, startingBand);
  const totalTaxable = otherTaxable + afterAllowance;
  const psa = totalTaxable > higherTop ? 0 : totalTaxable > table.basicRateBand ? extras.savingsAllowanceHigher : extras.savingsAllowanceBasic;
  const psaUsed = Math.min(afterAllowance - startingUsed, psa);
  const remaining = afterAllowance - startingUsed - psaUsed;
  const bands = stack(otherTaxable + startingUsed + psaUsed, remaining, table.basicRateBand, higherTop);
  const total = bands.basic * (table.basicRate / 100) + bands.higher * (table.higherRate / 100) + bands.additional * (table.additionalRate / 100);
  return { ...bands, allowanceUsed: psaUsed, startingUsed, total: round2(total) };
}

// Dividends stacked on top of non-savings income: unused personal allowance, then the dividend
// allowance (0%, but it still occupies band space), then dividend rates by band.
export function ukDividendTax(nonSavingsIncome: number, dividends: number, year: number): BandTax {
  const { income: table, extras } = tables(year);
  const other = positive(nonSavingsIncome);
  const amount = positive(dividends);
  const personalAllowance = ukPersonalAllowance(other + amount, year);
  const otherTaxable = Math.max(0, other - personalAllowance);
  const unusedAllowance = Math.max(0, personalAllowance - other);
  const afterAllowance = Math.max(0, amount - unusedAllowance);
  const higherTop = Math.max(table.basicRateBand, table.higherRateLimit - personalAllowance);
  const allowanceUsed = Math.min(afterAllowance, extras.dividendAllowance);
  const bands = stack(otherTaxable + allowanceUsed, afterAllowance - allowanceUsed, table.basicRateBand, higherTop);
  const total = bands.basic * (extras.dividendBasic / 100) + bands.higher * (extras.dividendHigher / 100) + bands.additional * (extras.dividendAdditional / 100);
  return { ...bands, allowanceUsed, startingUsed: 0, total: round2(total) };
}

// Gains after the annual exempt amount: 18% for whatever fits in the unused basic-rate band, 24% above.
export function ukCapitalGainsTax(nonSavingsIncome: number, gains: number, year: number): { basic: number; higher: number; exemptUsed: number; total: number } {
  const { income: table, extras } = tables(year);
  const other = positive(nonSavingsIncome);
  const amount = positive(gains);
  const otherTaxable = Math.max(0, other - ukPersonalAllowance(other, year));
  const exemptUsed = Math.min(amount, extras.cgtExempt);
  const taxable = amount - exemptUsed;
  const basicLeft = Math.max(0, table.basicRateBand - otherTaxable);
  const basic = Math.min(taxable, basicLeft);
  const higher = taxable - basic;
  return { basic, higher, exemptUsed, total: round2(basic * (extras.cgtBasic / 100) + higher * (extras.cgtHigher / 100)) };
}

// ─── Due date ────────────────────────────────────────────────────────────────

// Self Assessment: tax on income or gains received in the tax year starting 6 April Y is due by
// 31 January Y+2.
export function selfAssessmentDueDate(today = new Date()): { year: number; dueDate: string; dueLabel: string; dueInMonths: number } {
  const year = ukTaxYearFor(today);
  const due = new Date(year + 2, 0, 31);
  const dueInMonths = Math.max(0, (due.getFullYear() - today.getFullYear()) * 12 + (due.getMonth() - today.getMonth()));
  return {
    year,
    dueDate: `${due.getFullYear()}-01-31`,
    dueLabel: `31 January ${due.getFullYear()}`,
    dueInMonths,
  };
}

// ─── The estimate ────────────────────────────────────────────────────────────

export function estimateLumpSumTax(input: LumpSumTaxInput): LumpSumTaxResult {
  const today = input.today ?? new Date();
  const due = selfAssessmentDueDate(today);
  const { year, income: table, extras } = tables(input.year ?? due.year);
  const amount = positive(input.amount);
  const salary = positive(input.grossAnnualSalary);
  const prior = positive(input.priorThisYear);
  const lines: LumpSumTaxLine[] = [];
  const notes: string[] = [];
  let tax = 0;
  let topRate = 0;

  const rateOf = (band: { basic: number; higher: number; additional: number }, rates: [number, number, number]) =>
    band.additional > 0.005 ? rates[2] : band.higher > 0.005 ? rates[1] : band.basic > 0.005 ? rates[0] : 0;

  switch (input.source) {
    case "self-employed":
    case "other-income":
    case "rental": {
      const before = ukIncomeTax(salary + prior, year);
      const after = ukIncomeTax(salary + prior + amount, year);
      const incomeTax = round2(after.tax - before.tax);
      const pa = after.personalAllowance;
      const higherTop = Math.max(table.basicRateBand, table.higherRateLimit - pa);
      const bands = stack(Math.max(0, salary + prior - pa), Math.max(0, amount - Math.max(0, pa - salary - prior)), table.basicRateBand, higherTop);
      if (bands.basic > 0.005) lines.push({ label: "Income tax at basic rate", amount: round2(bands.basic * (table.basicRate / 100)), rate: table.basicRate, base: round2(bands.basic) });
      if (bands.higher > 0.005) lines.push({ label: "Income tax at higher rate", amount: round2(bands.higher * (table.higherRate / 100)), rate: table.higherRate, base: round2(bands.higher) });
      if (bands.additional > 0.005) lines.push({ label: "Income tax at additional rate", amount: round2(bands.additional * (table.additionalRate / 100)), rate: table.additionalRate, base: round2(bands.additional) });
      // Allowance lost to the taper shows up as extra tax beyond the band arithmetic.
      const taperTax = round2(incomeTax - lines.reduce((sum, line) => sum + line.amount, 0));
      if (taperTax > 0.5) {
        lines.push({ label: "Extra tax from personal allowance withdrawn (£1 per £2 over £100,000)", amount: taperTax });
        notes.push("Between £100,000 and £125,140 of income, each £2 also removes £1 of personal allowance — an effective 60% rate.");
      }
      tax += incomeTax;
      topRate = Math.max(topRate, taperTax > 0.5 ? 60 : rateOf(bands, [table.basicRate, table.higherRate, table.additionalRate]));
      if (input.source === "self-employed") {
        const class4 = round2(ukClass4NI(prior + amount, year) - ukClass4NI(prior, year));
        if (class4 > 0) {
          lines.push({ label: "Class 4 National Insurance", amount: class4, rate: prior >= extras.class4Upper ? extras.class4Upper2 : extras.class4Main });
        } else {
          notes.push(`No Class 4 National Insurance: profits this year are under the £${extras.class4Lower.toLocaleString("en-GB")} lower limit.`);
        }
        tax += class4;
        notes.push("Allowable business expenses (or the £1,000 trading allowance) come off before tax; enter the profit, not the turnover.");
      }
      if (input.source === "rental") notes.push("Enter the profit after allowable expenses, or after the £1,000 property allowance if that is better.");
      break;
    }
    case "savings-interest": {
      const before = ukSavingsInterestTax(salary, prior, year);
      const after = ukSavingsInterestTax(salary, prior + amount, year);
      const taxNow = round2(after.total - before.total);
      const startingUsed = Math.max(0, after.startingUsed - before.startingUsed);
      const allowanceUsed = Math.max(0, after.allowanceUsed - before.allowanceUsed);
      if (startingUsed > 0.005) lines.push({ label: "Starting rate for savings (0%)", amount: 0, rate: 0, base: round2(startingUsed) });
      if (allowanceUsed > 0.005) lines.push({ label: "Personal Savings Allowance (0%)", amount: 0, rate: 0, base: round2(allowanceUsed) });
      const bands = { basic: after.basic - before.basic, higher: after.higher - before.higher, additional: after.additional - before.additional };
      if (bands.basic > 0.005) lines.push({ label: "Interest at basic rate", amount: round2(bands.basic * (table.basicRate / 100)), rate: table.basicRate, base: round2(bands.basic) });
      if (bands.higher > 0.005) lines.push({ label: "Interest at higher rate", amount: round2(bands.higher * (table.higherRate / 100)), rate: table.higherRate, base: round2(bands.higher) });
      if (bands.additional > 0.005) lines.push({ label: "Interest at additional rate", amount: round2(bands.additional * (table.additionalRate / 100)), rate: table.additionalRate, base: round2(bands.additional) });
      tax += taxNow;
      topRate = rateOf(bands, [table.basicRate, table.higherRate, table.additionalRate]);
      if (taxNow <= 0) notes.push("Covered by your allowances: nothing to set aside.");
      notes.push("Banks report interest to HMRC; for employees it is usually collected through a tax-code change rather than a return.");
      break;
    }
    case "dividends": {
      const before = ukDividendTax(salary, prior, year);
      const after = ukDividendTax(salary, prior + amount, year);
      const taxNow = round2(after.total - before.total);
      const allowanceUsed = Math.max(0, after.allowanceUsed - before.allowanceUsed);
      if (allowanceUsed > 0.005) lines.push({ label: "Dividend allowance (0%)", amount: 0, rate: 0, base: round2(allowanceUsed) });
      const bands = { basic: after.basic - before.basic, higher: after.higher - before.higher, additional: after.additional - before.additional };
      if (bands.basic > 0.005) lines.push({ label: "Dividends at basic rate", amount: round2(bands.basic * (extras.dividendBasic / 100)), rate: extras.dividendBasic, base: round2(bands.basic) });
      if (bands.higher > 0.005) lines.push({ label: "Dividends at higher rate", amount: round2(bands.higher * (extras.dividendHigher / 100)), rate: extras.dividendHigher, base: round2(bands.higher) });
      if (bands.additional > 0.005) lines.push({ label: "Dividends at additional rate", amount: round2(bands.additional * (extras.dividendAdditional / 100)), rate: extras.dividendAdditional, base: round2(bands.additional) });
      tax += taxNow;
      topRate = rateOf(bands, [extras.dividendBasic, extras.dividendHigher, extras.dividendAdditional]);
      if (taxNow <= 0) notes.push("Covered by your allowances: nothing to set aside.");
      break;
    }
    case "capital-gain": {
      const before = ukCapitalGainsTax(salary, prior, year);
      const after = ukCapitalGainsTax(salary, prior + amount, year);
      const taxNow = round2(after.total - before.total);
      const exemptUsed = Math.max(0, after.exemptUsed - before.exemptUsed);
      if (exemptUsed > 0.005) lines.push({ label: "Annual exempt amount (0%)", amount: 0, rate: 0, base: round2(exemptUsed) });
      const basic = after.basic - before.basic;
      const higher = after.higher - before.higher;
      if (basic > 0.005) lines.push({ label: "Capital gains tax at basic rate", amount: round2(basic * (extras.cgtBasic / 100)), rate: extras.cgtBasic, base: round2(basic) });
      if (higher > 0.005) lines.push({ label: "Capital gains tax at higher rate", amount: round2(higher * (extras.cgtHigher / 100)), rate: extras.cgtHigher, base: round2(higher) });
      tax += taxNow;
      topRate = higher > 0.005 ? extras.cgtHigher : basic > 0.005 ? extras.cgtBasic : 0;
      if (taxNow <= 0) notes.push("Within the annual exempt amount: nothing to set aside.");
      notes.push("A gain on UK residential property must be reported and paid within 60 days of completion, not by 31 January.");
      break;
    }
  }

  // Student loan repayments collected through the same return.
  let studentLoan = 0;
  if (input.studentLoan && (input.studentLoan.plan || input.studentLoan.postgrad)) {
    const plans: UkStudentLoanPlan[] = [...(input.studentLoan.plan ? [input.studentLoan.plan] : []), ...(input.studentLoan.postgrad ? ["postgrad" as const] : [])];
    const kind = studentLoanIncomeKind(input.source);
    for (const plan of plans) {
      const due = ukStudentLoanOnLumpSum({ plan, salary, priorThisYear: prior, amount, source: input.source, year });
      if (due.repayment > 0) {
        lines.push({ label: `Student loan (${planLabel(plan)})`, amount: due.repayment, rate: due.rate, base: round2(due.repayment / (due.rate / 100)) });
        studentLoan += due.repayment;
      }
    }
    if (kind === "none") notes.push("Capital gains are not income, so they do not count towards student loan repayments.");
    else if (kind === "unearned" && studentLoan <= 0) notes.push(`Unearned income (rent, interest, dividends) only counts towards student loan repayments once it is over £${STUDENT_LOAN_UNEARNED_LIMIT.toLocaleString("en-GB")} in the year.`);
    else if (kind === "unearned") notes.push(`Unearned income over £${STUDENT_LOAN_UNEARNED_LIMIT.toLocaleString("en-GB")} in the year counts in full towards student loan repayments.`);
    else if (studentLoan <= 0) notes.push("Income is under the student loan threshold, so no repayment is due on it.");
  }
  tax = round2(Math.max(0, tax + studentLoan));
  if (tax - studentLoan > 1_000) notes.push("A tax bill over £1,000 usually brings payments on account: half as much again towards next year, due on the same day, with the rest the following July.");

  return {
    year,
    yearLabel: `${year}/${String(year + 1).slice(-2)}`,
    amount,
    tax,
    studentLoan: round2(studentLoan),
    net: round2(amount - tax),
    effectiveRate: amount > 0 ? round2((tax / amount) * 100) : 0,
    topRate,
    lines,
    dueDate: due.dueDate,
    dueLabel: due.dueLabel,
    dueInMonths: due.dueInMonths,
    notes,
  };
}
