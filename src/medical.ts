import { getMonthKey } from "./finance";
import { MEDICAL_CATEGORY_PATTERN } from "./region";
import type { Account, ExpenseEntry, HealthPlan, MonthBudget } from "./types";

// US medical spending against the health plan's deductible and out-of-pocket maximum, plus the
// HSA / FSA balances set aside to pay for it.

export const DEFAULT_HEALTH_PLAN: HealthPlan = {
  planType: "",
  coverage: "self",
  premiumMonthly: 0,
  deductible: 0,
  outOfPocketMax: 0,
  planYearStartMonth: 1,
};

export const HEALTH_PLAN_TYPES: Array<{ value: HealthPlan["planType"]; label: string; hint: string }> = [
  { value: "", label: "Not set", hint: "" },
  { value: "hdhp", label: "High-deductible (HDHP)", hint: "Lower premiums, higher deductible. The only plan type that lets you contribute to an HSA." },
  { value: "ppo", label: "PPO", hint: "See any provider without a referral; out-of-network care costs more." },
  { value: "hmo", label: "HMO", hint: "In-network care only, usually through a primary care doctor. Lower premiums." },
  { value: "epo", label: "EPO", hint: "In-network only, but no referrals needed." },
  { value: "other", label: "Other", hint: "" },
];

// Premiums are paid whether or not you see a doctor; they never count towards the deductible.
const PREMIUM_PATTERN = /\b(premium|insurance)\b/i;

export function isMedicalExpense(expense: Pick<ExpenseEntry, "name" | "category">): boolean {
  const text = `${expense.category} ${expense.name}`;
  return MEDICAL_CATEGORY_PATTERN.test(text) && !PREMIUM_PATTERN.test(expense.name);
}

export function isHealthPremium(expense: Pick<ExpenseEntry, "name" | "category">): boolean {
  return MEDICAL_CATEGORY_PATTERN.test(`${expense.category} ${expense.name}`) && PREMIUM_PATTERN.test(expense.name);
}

// The month keys of the plan year containing `today`, from its first month up to today's month.
export function planYearMonths(planYearStartMonth: number, today = new Date()): { months: string[]; startKey: string; endKey: string; monthsLeft: number } {
  const start = Math.min(12, Math.max(1, Math.round(planYearStartMonth) || 1));
  const currentMonth = today.getMonth() + 1;
  const startYear = currentMonth >= start ? today.getFullYear() : today.getFullYear() - 1;
  const months: string[] = [];
  for (let offset = 0; offset < 12; offset += 1) {
    const date = new Date(startYear, start - 1 + offset, 1);
    const key = getMonthKey(date);
    if (key > getMonthKey(today)) break;
    months.push(key);
  }
  const end = new Date(startYear, start - 1 + 11, 1);
  return { months, startKey: getMonthKey(new Date(startYear, start - 1, 1)), endKey: getMonthKey(end), monthsLeft: 12 - months.length };
}

export type MedicalSummary = {
  spentThisPlanYear: number;
  premiumsThisPlanYear: number;
  deductible: number;
  outOfPocketMax: number;
  deductibleMet: boolean;
  deductiblePercent: number;
  outOfPocketPercent: number;
  remainingDeductible: number;
  remainingOutOfPocket: number;
  hsaBalance: number;
  fsaBalance: number;
  hsaMonthly: number;
  fsaMonthly: number;
  // Months of the plan year still to come — how long there is to spend an FSA balance.
  monthsLeftInPlanYear: number;
  planYearStart: string;
  monthsCounted: number;
  hasPlan: boolean;
  hasAccounts: boolean;
};

export function summarizeMedical({
  months,
  healthPlan,
  accounts,
  today = new Date(),
}: {
  months: Record<string, MonthBudget>;
  healthPlan: HealthPlan;
  accounts: Account[];
  today?: Date;
}): MedicalSummary {
  const planYear = planYearMonths(healthPlan.planYearStartMonth, today);
  let spent = 0;
  let premiums = 0;
  for (const key of planYear.months) {
    const month = months[key];
    if (!month) continue;
    for (const expense of month.expenses) {
      const amount = Math.max(0, Number(expense.amount) || 0);
      if (isMedicalExpense(expense)) spent += amount;
      else if (isHealthPremium(expense)) premiums += amount;
    }
  }
  const deductible = Math.max(0, Number(healthPlan.deductible) || 0);
  const outOfPocketMax = Math.max(0, Number(healthPlan.outOfPocketMax) || 0);
  const hsa = accounts.filter((account) => account.accountClass !== "debt" && account.type === "hsa");
  const fsa = accounts.filter((account) => account.accountClass !== "debt" && account.type === "fsa");
  const sum = (list: Account[], field: "balance" | "monthlyContribution") => list.reduce((total, account) => total + Math.max(0, Number(account[field]) || 0), 0);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    spentThisPlanYear: round(spent),
    premiumsThisPlanYear: round(premiums),
    deductible,
    outOfPocketMax,
    deductibleMet: deductible > 0 && spent >= deductible,
    deductiblePercent: deductible > 0 ? Math.min(100, round((spent / deductible) * 100)) : 0,
    outOfPocketPercent: outOfPocketMax > 0 ? Math.min(100, round((spent / outOfPocketMax) * 100)) : 0,
    remainingDeductible: round(Math.max(0, deductible - spent)),
    remainingOutOfPocket: round(Math.max(0, outOfPocketMax - spent)),
    hsaBalance: round(sum(hsa, "balance")),
    fsaBalance: round(sum(fsa, "balance")),
    hsaMonthly: round(sum(hsa, "monthlyContribution") + hsa.reduce((total, account) => total + Math.max(0, Number(account.employerMonthlyContribution) || 0), 0)),
    fsaMonthly: round(sum(fsa, "monthlyContribution")),
    monthsLeftInPlanYear: planYear.monthsLeft,
    planYearStart: planYear.startKey,
    monthsCounted: planYear.months.length,
    hasPlan: deductible > 0 || outOfPocketMax > 0 || Boolean(healthPlan.planType),
    hasAccounts: hsa.length > 0 || fsa.length > 0,
  };
}
