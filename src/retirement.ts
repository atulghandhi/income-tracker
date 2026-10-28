import type { RegionKey } from "./region";
import type { Account, AccountType, LedgerState } from "./types";

// Retirement, pension and tax-advantaged accounts: how much goes in each month (from the employee,
// from the employer), and how that compares with the annual contribution limit.
//
// Amounts are resolved to plain monthly figures on the account (`monthlyContribution`,
// `employerMonthlyContribution`) so every forecast reads one number. When a contribution is set as a
// % of pay, syncPlanContributions keeps the amount in step with the salary in the tax profile.

export type LimitKey = "401k" | "ira" | "hsa" | "fsa" | "isa" | "lisa" | "pension" | "529";

type LimitEntry = {
  base: number;
  // Extra allowed from age 50 (55 for an HSA) when the account is flagged catch-up eligible.
  catchUp?: number;
  // HSA family-coverage tier.
  family?: number;
};

type LimitTable = Record<LimitKey, LimitEntry | undefined>;

// Statutory limits by year. US years are calendar years; UK years are tax years starting 6 April
// (2026 = 2026/27). The latest year at or before today is used, so figures stay sensible until the
// next table is added.
const US_LIMITS: Record<number, Partial<LimitTable>> = {
  2025: {
    "401k": { base: 23_500, catchUp: 7_500 },
    ira: { base: 7_000, catchUp: 1_000 },
    hsa: { base: 4_300, family: 8_550, catchUp: 1_000 },
    fsa: { base: 3_300 },
    "529": { base: 19_000 },
  },
  2026: {
    "401k": { base: 24_500, catchUp: 8_000 },
    ira: { base: 7_500, catchUp: 1_100 },
    hsa: { base: 4_400, family: 8_750, catchUp: 1_000 },
    fsa: { base: 3_400 },
    "529": { base: 19_000 },
  },
};

const GB_LIMITS: Record<number, Partial<LimitTable>> = {
  2025: {
    isa: { base: 20_000 },
    lisa: { base: 4_000 },
    pension: { base: 60_000 },
  },
  2026: {
    isa: { base: 20_000 },
    lisa: { base: 4_000 },
    pension: { base: 60_000 },
  },
};

export const LIMIT_LABELS: Record<LimitKey, { label: string; note: string; countsEmployer: boolean }> = {
  "401k": {
    label: "401(k) / 403(b) employee limit",
    note: "Your own contributions across every 401(k) and 403(b). Employer money is extra (the combined cap is much higher).",
    countsEmployer: false,
  },
  ira: { label: "IRA limit (traditional + Roth)", note: "One limit shared across all your IRAs. Income limits can reduce what you may put into a Roth.", countsEmployer: false },
  hsa: { label: "HSA limit", note: "Includes anything your employer adds. Only available with a high-deductible health plan.", countsEmployer: true },
  fsa: { label: "Health FSA limit", note: "Use-it-or-lose-it: plan to spend it within the plan year.", countsEmployer: false },
  isa: { label: "ISA allowance", note: "Shared across cash ISAs, stocks & shares ISAs and lifetime ISAs in the tax year.", countsEmployer: false },
  lisa: { label: "Lifetime ISA limit", note: "Counts within the overall ISA allowance. The government adds 25% on top.", countsEmployer: false },
  pension: { label: "Pension annual allowance", note: "Includes employer contributions and tax relief across all your pensions. Tapers for very high earners.", countsEmployer: true },
  "529": { label: "529 gift-tax exclusion", note: "No federal contribution limit; this is the per-beneficiary annual gift-tax exclusion.", countsEmployer: false },
};

export function limitKeyForType(type: AccountType): LimitKey | null {
  switch (type) {
    case "401k":
    case "403b":
      return "401k";
    case "traditional-ira":
    case "roth-ira":
      return "ira";
    case "hsa":
      return "hsa";
    case "fsa":
      return "fsa";
    case "isa":
      return "isa";
    case "lisa":
      return "lisa";
    case "pension":
    case "sipp":
      return "pension";
    case "529":
      return "529";
    default:
      return null;
  }
}

// The limit year in force today: the calendar year in the US, the tax year starting 6 April in
// the UK.
export function limitYear(region: RegionKey, today = new Date()): number {
  const year = today.getFullYear();
  if (region === "US") return year;
  const beforeApril6 = today.getMonth() < 3 || (today.getMonth() === 3 && today.getDate() < 6);
  return beforeApril6 ? year - 1 : year;
}

export function limitYearLabel(region: RegionKey, year: number): string {
  return region === "US" ? String(year) : `${year}/${String(year + 1).slice(-2)}`;
}

function tableFor(region: RegionKey, year: number): Partial<LimitTable> {
  const table = region === "US" ? US_LIMITS : GB_LIMITS;
  const years = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  const chosen = years.filter((candidate) => candidate <= year).pop() ?? years[0];
  return table[chosen] ?? {};
}

export type AnnualLimit = {
  key: LimitKey;
  label: string;
  note: string;
  limit: number;
  year: number;
  // True when the figure came from the account's override rather than the table.
  overridden: boolean;
};

// The annual contribution limit that applies to this account, or null when the type has none (or
// the other region's instrument is being shown and has no table here).
export function annualLimitFor(account: Account, region: RegionKey, year = limitYear(region)): AnnualLimit | null {
  const key = limitKeyForType(account.type);
  if (!key) return null;
  const override = Math.max(0, Number(account.annualLimitOverride) || 0);
  const meta = LIMIT_LABELS[key];
  if (override > 0) return { key, label: meta.label, note: meta.note, limit: override, year, overridden: true };
  const entry = tableFor(region, year)[key] ?? tableFor(region === "US" ? "GB" : "US", year)[key];
  if (!entry) return null;
  let limit = key === "hsa" && account.coverage === "family" && entry.family ? entry.family : entry.base;
  if (account.catchUpEligible && entry.catchUp) limit += entry.catchUp;
  return { key, label: meta.label, note: meta.note, limit, year, overridden: false };
}

// ─── Contribution amounts ────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

// What the employee pays in each month: the % of pay when one is set and the salary is known,
// otherwise the amount typed on the account.
export function employeeMonthlyContribution(account: Account, grossAnnualSalary: number): number {
  if (account.accountClass === "debt") return 0;
  const percent = positive(account.contributionPercent);
  const salary = positive(grossAnnualSalary);
  if (percent > 0 && salary > 0) return round2((salary / 12) * (percent / 100));
  return positive(account.monthlyContribution);
}

// What the employer adds each month. With a salary, the match ("50% of what you pay, on the first
// 6% of pay") and any fixed % of pay are worked out from it; without one, the typed amount stands.
export function employerMonthlyContribution(account: Account, grossAnnualSalary: number): number {
  if (account.accountClass === "debt") return 0;
  const salary = positive(grossAnnualSalary);
  const matchPercent = positive(account.employerMatchPercent);
  const fixedPercent = positive(account.employerContributionPercent);
  const typed = positive(account.employerMonthlyContribution);
  if (salary <= 0 || (matchPercent <= 0 && fixedPercent <= 0)) return typed;

  const monthlyPay = salary / 12;
  const employeeMonthly = employeeMonthlyContribution(account, salary);
  const employeePercent = positive(account.contributionPercent) > 0 ? positive(account.contributionPercent) : (employeeMonthly / monthlyPay) * 100;
  const cap = account.employerMatchCapPercent === undefined || account.employerMatchCapPercent === null ? employeePercent : positive(account.employerMatchCapPercent);
  const matchedPercent = Math.min(employeePercent, cap);
  const match = matchPercent > 0 ? (matchPercent / 100) * (matchedPercent / 100) * monthlyPay : 0;
  const fixed = (fixedPercent / 100) * monthlyPay;
  return round2(match + fixed);
}

// Whether the salary-based rules on an account would change its stored amounts.
function usesSalary(account: Account): boolean {
  return positive(account.contributionPercent) > 0 || positive(account.employerMatchPercent) > 0 || positive(account.employerContributionPercent) > 0;
}

// Keeps %-of-pay contributions and employer matches in step with the salary in the tax profile.
// Part of the cross-page sync every change goes through, so editing the salary updates every
// workplace plan at once.
export function syncPlanContributions(state: LedgerState): LedgerState {
  const salary = positive(state.taxProfile?.grossAnnualSalary);
  if (salary <= 0) return state;
  let changed = false;
  const accounts = state.accounts.map((account) => {
    if (account.accountClass === "debt" || !usesSalary(account)) return account;
    const monthlyContribution = employeeMonthlyContribution(account, salary);
    const employerMonthly = employerMonthlyContribution(account, salary);
    const sameEmployee = positive(account.contributionPercent) <= 0 || monthlyContribution === account.monthlyContribution;
    const sameEmployer = employerMonthly === positive(account.employerMonthlyContribution);
    if (sameEmployee && sameEmployer) return account;
    changed = true;
    return {
      ...account,
      monthlyContribution: positive(account.contributionPercent) > 0 ? monthlyContribution : account.monthlyContribution,
      employerMonthlyContribution: employerMonthly,
    };
  });
  return changed ? { ...state, accounts } : state;
}

// ─── Employer match check ────────────────────────────────────────────────────

export type MatchShortfall = {
  accountId: string;
  name: string;
  // % of pay the employee contributes now, and the % needed for the full match.
  currentPercent: number;
  neededPercent: number;
  // Employer money left on the table per year at the current rate.
  missedAnnual: number;
};

// Accounts where the employee contributes less than the match cap: every point below it is free
// money not taken. Needs a salary and a match with a cap to say anything.
export function employerMatchShortfalls(accounts: Account[], grossAnnualSalary: number): MatchShortfall[] {
  const salary = positive(grossAnnualSalary);
  if (salary <= 0) return [];
  return accounts.flatMap((account) => {
    const matchPercent = positive(account.employerMatchPercent);
    const cap = positive(account.employerMatchCapPercent);
    if (account.accountClass === "debt" || matchPercent <= 0 || cap <= 0) return [];
    const employeeMonthly = employeeMonthlyContribution(account, salary);
    const currentPercent = positive(account.contributionPercent) > 0 ? positive(account.contributionPercent) : (employeeMonthly / (salary / 12)) * 100;
    if (currentPercent >= cap - 0.001) return [];
    const missedAnnual = round2((matchPercent / 100) * ((cap - currentPercent) / 100) * salary);
    return [{ accountId: account.id, name: account.name, currentPercent: round2(currentPercent), neededPercent: cap, missedAnnual }];
  });
}

// ─── Limit tracking ──────────────────────────────────────────────────────────

export type LimitGroupAccount = {
  id: string;
  name: string;
  type: AccountType;
  employeeAnnual: number;
  employerAnnual: number;
};

export type LimitGroup = {
  key: LimitKey;
  label: string;
  note: string;
  year: number;
  yearLabel: string;
  limit: number;
  // Annual contributions that count against the limit (employer money included where the rules say so).
  counted: number;
  employeeAnnual: number;
  employerAnnual: number;
  remaining: number;
  usedPercent: number;
  // Extra per month that would use the whole limit by year end, spread over 12 months.
  monthlyToMax: number;
  accounts: LimitGroupAccount[];
};

// Annual contributions grouped by the limit they share, against that limit. Accounts whose limit is
// overridden use the override; a group with several overrides takes the largest.
export function contributionLimitGroups(accounts: Account[], region: RegionKey, year = limitYear(region)): LimitGroup[] {
  const groups = new Map<LimitKey, LimitGroup>();
  for (const account of accounts) {
    if (account.accountClass === "debt") continue;
    const limit = annualLimitFor(account, region, year);
    if (!limit) continue;
    const employeeAnnual = round2(positive(account.monthlyContribution) * 12);
    const employerAnnual = round2(positive(account.employerMonthlyContribution) * 12);
    const existing = groups.get(limit.key);
    const meta = LIMIT_LABELS[limit.key];
    const group: LimitGroup = existing ?? {
      key: limit.key,
      label: meta.label,
      note: meta.note,
      year,
      yearLabel: limitYearLabel(region, year),
      limit: limit.limit,
      counted: 0,
      employeeAnnual: 0,
      employerAnnual: 0,
      remaining: 0,
      usedPercent: 0,
      monthlyToMax: 0,
      accounts: [],
    };
    group.limit = Math.max(group.limit, limit.limit);
    group.employeeAnnual = round2(group.employeeAnnual + employeeAnnual);
    group.employerAnnual = round2(group.employerAnnual + employerAnnual);
    group.accounts.push({ id: account.id, name: account.name, type: account.type, employeeAnnual, employerAnnual });
    groups.set(limit.key, group);
  }
  // A lifetime ISA also uses the overall ISA allowance.
  const lisa = groups.get("lisa");
  if (lisa) {
    const isa = groups.get("isa");
    if (isa) {
      isa.employeeAnnual = round2(isa.employeeAnnual + lisa.employeeAnnual);
      isa.accounts.push(...lisa.accounts);
    }
  }
  return Array.from(groups.values()).map((group) => {
    const counted = round2(group.employeeAnnual + (LIMIT_LABELS[group.key].countsEmployer ? group.employerAnnual : 0));
    const remaining = Math.max(0, round2(group.limit - counted));
    return {
      ...group,
      counted,
      remaining,
      usedPercent: group.limit > 0 ? Math.min(100, round2((counted / group.limit) * 100)) : 0,
      monthlyToMax: round2(remaining / 12),
    };
  });
}
