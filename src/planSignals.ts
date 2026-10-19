import { summarizeMedical } from "./medical";
import type { RegionKey } from "./region";
import { contributionLimitGroups, employerMatchShortfalls, limitYear } from "./retirement";
import type { Account, FinancialSignal, HealthPlan, MonthBudget, TaxProfile } from "./types";

// Signals about the plan details: free employer money not taken, limits exceeded, FSA money about
// to expire. They join the ledger-based anomalies on the Insights page.

export function buildPlanSignals({
  accounts,
  taxProfile,
  healthPlan,
  months,
  region,
  formatter,
  today = new Date(),
}: {
  accounts: Account[];
  taxProfile: TaxProfile;
  healthPlan: HealthPlan;
  months: Record<string, MonthBudget>;
  region: RegionKey;
  formatter: Intl.NumberFormat;
  today?: Date;
}): FinancialSignal[] {
  const signals: FinancialSignal[] = [];

  for (const shortfall of employerMatchShortfalls(accounts, taxProfile.grossAnnualSalary).slice(0, 2)) {
    signals.push({
      id: `match-shortfall-${shortfall.accountId}`,
      title: "Employer match not fully taken",
      summary: `${shortfall.name}: contributing ${shortfall.currentPercent}% of pay, but the match covers up to ${shortfall.neededPercent}%.`,
      detail: `Raising your contribution to ${shortfall.neededPercent}% would bring in about ${formatter.format(shortfall.missedAnnual)} a year of employer money you are currently leaving behind — an immediate, risk-free return on that part of your pay.`,
      tone: "warning",
    });
  }

  for (const group of contributionLimitGroups(accounts, region, limitYear(region, today))) {
    if (group.counted <= group.limit) continue;
    signals.push({
      id: `limit-exceeded-${group.key}`,
      title: `${group.label} exceeded`,
      summary: `${formatter.format(group.counted)} a year planned against a ${formatter.format(group.limit)} limit for ${group.yearLabel}.`,
      detail: "Contributions over the limit are usually refunded or taxed twice. Check the plan figures, or lower the monthly amount so the year lands under the cap.",
      tone: "danger",
    });
  }

  if (region === "US") {
    const medical = summarizeMedical({ months, healthPlan, accounts, today });
    if (medical.fsaBalance > 0 && medical.monthsLeftInPlanYear <= 2) {
      signals.push({
        id: "fsa-expiring",
        title: "FSA balance about to expire",
        summary: `${formatter.format(medical.fsaBalance)} left in your FSA with ${medical.monthsLeftInPlanYear === 0 ? "the plan year ending this month" : `${medical.monthsLeftInPlanYear} month${medical.monthsLeftInPlanYear === 1 ? "" : "s"} left`}.`,
        detail: "Most FSAs forfeit whatever is unspent at the end of the plan year. Glasses, dental work, prescriptions and many over-the-counter items are eligible — spend it before it lapses.",
        tone: "warning",
      });
    }
    const hsaFunded = accounts.some((account) => account.accountClass !== "debt" && account.type === "hsa" && (Number(account.monthlyContribution) > 0 || Number(account.employerMonthlyContribution) > 0));
    if (hsaFunded && healthPlan.planType && healthPlan.planType !== "hdhp") {
      signals.push({
        id: "hsa-without-hdhp",
        title: "HSA contributions without a high-deductible plan",
        summary: "Money is going into an HSA, but the health plan on file is not an HDHP.",
        detail: "HSA contributions are only allowed while you are covered by a qualifying high-deductible health plan. If the plan type is right, pause the contributions; if it is wrong, update the plan in the Medical spending widget.",
        tone: "info",
      });
    }
  }

  return signals;
}
