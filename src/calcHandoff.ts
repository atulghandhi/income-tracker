// Data handoff from the static calculators (/tools/*.html).
//
// A calculator is the first thing many people use. When they press "Save to my plan" the page
// parks what they typed in localStorage on this origin (scripts/build-content.mjs, CALC_SAVE) and
// opens the matching app page with #calc=1. The app picks it up here once the ledger has hydrated
// and turns it into real accounts, goals or a salary, so nothing has to be typed twice.
//
// Everything stays in the browser: same-origin localStorage in, deleted on pickup.

import { pickAccountColor, isoToday } from "./accountFlow";
import { colors, createId, getMonthKey } from "./finance";
import type { AppView } from "./routes";
import type { Account, DebtAccountType, LedgerState, PlanPriority, SavingsGoal } from "./types";

export const CALC_HANDOFF_KEY = "it_calc_handoff";
// Far longer than the hop takes; a payload left by a closed tab should not surprise a later visit.
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ITEMS = 20;
const MAX_MONEY = 100_000_000;

export type CalcDebt = {
  name: string;
  type: DebtAccountType;
  balance: number;
  apr: number;
  minPayment: number;
  promoRate: number;
  promoMonths: number;
  creditLimit: number;
};

export type CalcGoal = { name: string; target: number; saved: number; monthly: number; rate: number; deadlineMonths: number };

export type CalcHandoff = {
  source: string;
  view: AppView;
  debts: CalcDebt[];
  goals: CalcGoal[];
  // Extra paid towards debts each month, on top of the minimums.
  extra: number | null;
  priority: PlanPriority | null;
  grossSalary: number | null;
};

export type CalcHandoffResult = {
  ledger: LedgerState;
  debtsAdded: number;
  debtsUpdated: number;
  goalsAdded: number;
  goalsUpdated: number;
  salarySet: boolean;
};

export function hashRequestsCalcHandoff(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, "")).has("calc");
}

const DEBT_TYPES: DebtAccountType[] = ["credit-card", "loan", "mortgage", "auto-loan", "student-loan", "overdraft", "other"];
const VIEWS: AppView[] = ["allocate", "accounts", "goals", "pay", "ledger", "dashboard"];
const PRIORITIES: PlanPriority[] = ["interest", "quick-wins", "payments", "credit-score", "balanced"];

function money(value: unknown, max = MAX_MONEY): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n * 100) / 100);
}

function text(value: unknown, fallback: string): string {
  const s = typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) : "";
  return s || fallback;
}

// Anything typed into a public page is untrusted: keep only well-formed, bounded fields.
export function parseCalcHandoff(raw: unknown, now: number): CalcHandoff | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.at !== "number" || now - r.at > MAX_AGE_MS || r.at - now > 60_000) return null;
  const view = VIEWS.includes(r.view as AppView) ? (r.view as AppView) : "dashboard";
  const debts: CalcDebt[] = (Array.isArray(r.debts) ? r.debts : [])
    .slice(0, MAX_ITEMS)
    .map((d, index): CalcDebt | null => {
      if (!d || typeof d !== "object") return null;
      const x = d as Record<string, unknown>;
      const balance = money(x.balance);
      if (balance <= 0) return null;
      const name = text(x.name, `Debt ${index + 1}`);
      const given = DEBT_TYPES.includes(x.type as DebtAccountType) ? (x.type as DebtAccountType) : "other";
      const type = given === "other" ? guessDebtType(name) : given;
      return {
        name,
        type,
        balance,
        apr: money(x.apr, 100),
        minPayment: money(x.minPayment),
        promoRate: money(x.promoRate, 100),
        promoMonths: Math.round(money(x.promoMonths, 120)),
        creditLimit: money(x.creditLimit),
      };
    })
    .filter((d): d is CalcDebt => d !== null);
  const goals: CalcGoal[] = (Array.isArray(r.goals) ? r.goals : [])
    .slice(0, MAX_ITEMS)
    .map((g, index): CalcGoal | null => {
      if (!g || typeof g !== "object") return null;
      const x = g as Record<string, unknown>;
      const target = money(x.target);
      if (target <= 0) return null;
      return {
        name: text(x.name, `Goal ${index + 1}`),
        target,
        saved: Math.min(target, money(x.saved)),
        monthly: money(x.monthly),
        rate: money(x.rate, 25),
        deadlineMonths: Math.round(money(x.deadlineMonths, 600)),
      };
    })
    .filter((g): g is CalcGoal => g !== null);
  const extra = r.extra === undefined || r.extra === null ? null : money(r.extra);
  const priority = PRIORITIES.includes(r.priority as PlanPriority) ? (r.priority as PlanPriority) : null;
  const gross = money(r.grossSalary);
  const source = text(r.source, "calculator").replace(/[^a-z0-9-]/gi, "").slice(0, 60) || "calculator";
  if (!debts.length && !goals.length && !gross) return null;
  return { source, view, debts, goals, extra, priority, grossSalary: gross > 0 ? gross : null };
}

// Returns the parked payload, if there is a fresh one, and removes it either way. One read per
// page load, so React's StrictMode double effect gets the same answer.
let taken: CalcHandoff | null | undefined;
export function takeCalcHandoff(now = Date.now()): CalcHandoff | null {
  if (taken !== undefined) return taken;
  taken = null;
  try {
    const raw = localStorage.getItem(CALC_HANDOFF_KEY);
    localStorage.removeItem(CALC_HANDOFF_KEY);
    if (raw) taken = parseCalcHandoff(JSON.parse(raw), now);
  } catch {
    // Blocked storage or a mangled record: the visitor simply lands on the page.
  }
  return taken;
}

// The debt list on the snowball page has no type picker; the name usually says what it is, and the
// type matters in the app (card utilisation, loan terms). Anything unclear stays "other".
export function guessDebtType(name: string): DebtAccountType {
  const n = name.toLowerCase();
  if (/overdraft/.test(n)) return "overdraft";
  if (/mortgage/.test(n)) return "mortgage";
  if (/student|slc\b/.test(n)) return "student-loan";
  if (/\bcar\b|auto|vehicle|pcp|\bhp\b|finance/.test(n)) return "auto-loan";
  if (/card|amex|american express|barclaycard|visa|mastercard|capital one|mbna|tesco bank|virgin money|aqua|vanquis/.test(n)) return "credit-card";
  if (/loan/.test(n)) return "loan";
  return "other";
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Folds the calculator's figures into the ledger. A debt or goal with the same name as one that is
// already there is updated rather than duplicated, so pressing Save twice is harmless.
export function applyCalcHandoff(ledger: LedgerState, handoff: CalcHandoff, today = new Date()): CalcHandoffResult {
  const month = getMonthKey(today);
  const day = isoToday(today);
  let accounts = [...ledger.accounts];
  let debtsAdded = 0;
  let debtsUpdated = 0;
  for (const debt of handoff.debts) {
    const figures: Partial<Account> = {
      balance: debt.balance,
      rate: debt.apr,
      promoRate: debt.promoRate,
      promoMonths: debt.promoMonths,
      promoAsOf: month,
      minimumPayment: debt.minPayment,
      balanceAsOf: month,
      balanceSetOn: day,
      ledgerOffset: 0,
      ...(debt.creditLimit > 0 ? { creditLimit: debt.creditLimit } : {}),
    };
    const existing = accounts.findIndex((account) => account.accountClass === "debt" && sameName(account.name, debt.name));
    if (existing >= 0) {
      accounts[existing] = { ...accounts[existing], ...figures };
      debtsUpdated++;
      continue;
    }
    accounts = [
      ...accounts,
      {
        id: createId("account"),
        name: debt.name,
        accountClass: "debt",
        type: debt.type,
        balance: debt.balance,
        rate: debt.apr,
        promoRate: debt.promoRate,
        promoMonths: debt.promoMonths,
        promoAsOf: month,
        monthlyContribution: 0,
        creditLimit: debt.creditLimit,
        minimumPayment: debt.minPayment,
        dueDay: 1,
        balanceAsOf: month,
        balanceSetOn: day,
        ledgerOffset: 0,
        includeInNetWorth: true,
        color: pickAccountColor(accounts.map((account) => account.color)),
        note: "Added from the calculator",
      },
    ];
    debtsAdded++;
  }

  let goals = [...ledger.goals];
  let goalsAdded = 0;
  let goalsUpdated = 0;
  for (const goal of handoff.goals) {
    const figures: Partial<SavingsGoal> = {
      target: goal.target,
      saved: goal.saved,
      monthlyAmount: goal.monthly,
      fundingMode: goal.monthly > 0 ? "fixed" : "auto",
      interestRate: goal.rate,
      deadlineMonths: goal.deadlineMonths,
    };
    const existing = goals.findIndex((g) => sameName(g.name, goal.name));
    if (existing >= 0) {
      goals[existing] = { ...goals[existing], ...figures };
      goalsUpdated++;
      continue;
    }
    goals = [
      ...goals,
      {
        id: createId("goal"),
        name: goal.name,
        target: goal.target,
        saved: goal.saved,
        color: colors[goals.length % colors.length],
        priority: goals.length + 1,
        fundingMode: goal.monthly > 0 ? "fixed" : "auto",
        monthlyAmount: goal.monthly,
        deadlineMonths: goal.deadlineMonths,
        interestRate: goal.rate,
        note: "Added from the calculator",
        createdAt: today.toISOString(),
      },
    ];
    goalsAdded++;
  }

  const allocation = {
    ...ledger.allocation,
    ...(handoff.extra !== null && handoff.debts.length ? { monthlyExtraOverride: handoff.extra } : {}),
    ...(handoff.priority ? { priority: handoff.priority } : {}),
  };
  // A new ledger has no surplus yet, so the Goals forecast would call every goal unfunded. Until
  // income is recorded, the monthly amount typed into the calculator stands in for it.
  const noIncome = Object.values(ledger.months).every((month) => !month.incomes.length);
  const goalMonthly = handoff.goals.reduce((sum, goal) => sum + goal.monthly, 0);
  const goalPlannerSurplus = noIncome && ledger.goalPlannerSurplus === null && goalMonthly > 0 ? goalMonthly : ledger.goalPlannerSurplus;
  const salarySet = handoff.grossSalary !== null;
  const taxProfile = salarySet ? { ...ledger.taxProfile, grossAnnualSalary: handoff.grossSalary as number } : ledger.taxProfile;

  return {
    ledger: { ...ledger, accounts, goals, allocation, taxProfile, goalPlannerSurplus },
    debtsAdded,
    debtsUpdated,
    goalsAdded,
    goalsUpdated,
    salarySet,
  };
}

export function describeCalcHandoff(result: Omit<CalcHandoffResult, "ledger">): string {
  const parts: string[] = [];
  const debts = result.debtsAdded + result.debtsUpdated;
  const goals = result.goalsAdded + result.goalsUpdated;
  if (debts) parts.push(`${debts} ${debts === 1 ? "debt" : "debts"}`);
  if (goals) parts.push(`${goals} ${goals === 1 ? "goal" : "goals"}`);
  if (result.salarySet) parts.push("your salary");
  return parts.length ? `Saved ${parts.join(" and ")} from the calculator` : "Nothing to save from the calculator";
}
