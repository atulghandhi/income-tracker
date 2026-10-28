import { expect, test } from "@playwright/test";
import {
  DEFAULT_ALLOCATION_SETTINGS,
  accessibleSavings,
  bestOn,
  buildPlanInputs,
  comparePlans,
  COMPARE_METRICS,
  normalizeAllocationSettings,
  planDebtsFromAccounts,
  rankSavingsDestinations,
  simulatePlan,
  type PlanDebt,
  type PlanInputs,
  type PlanSaver,
} from "../src/allocate";
import type { Account } from "../src/types";

// The allocation planner: every figure here is pinned by hand from the rules in allocate.ts.
// Rates compound monthly at the geometric rate the rest of the app uses (1.12^(1/12) - 1 for 12%).

function debt(overrides: Partial<PlanDebt> & { id: string }): PlanDebt {
  return {
    name: overrides.id,
    type: "credit-card",
    balance: 1000,
    rate: 20,
    promoRate: 0,
    promoMonths: 0,
    minimumPayment: 50,
    creditLimit: 0,
    color: "#2f7fdd",
    ...overrides,
  };
}

function saver(overrides: Partial<PlanSaver> & { id: string }): PlanSaver {
  return {
    name: overrides.id,
    type: "savings",
    accountClass: "savings",
    rate: 4,
    payroll: false,
    color: "#1baf7a",
    ...overrides,
  };
}

function inputs(overrides: Partial<PlanInputs>): PlanInputs {
  return {
    debts: [],
    savers: [],
    goals: [],
    monthlyExtra: 0,
    lumpSum: 0,
    monthlyExpenses: 0,
    currentBuffer: 0,
    bufferMonths: 3,
    taxReserve: 0,
    taxDueInMonths: 6,
    horizonMonths: 36,
    assumedInvestmentReturn: 6,
    safeSavingsRate: 4,
    promoGuard: true,
    rollover: true,
    customShares: { debts: 60, buffer: 20, savings: 20 },
    customMethod: "avalanche",
    savingsPriority: "safe-rate",
    region: "GB",
    startDate: new Date(2026, 0, 1),
    ...overrides,
  };
}

test.describe("single debt arithmetic", () => {
  test("a 0% balance clears on schedule, sooner with extra, and the date is labelled", () => {
    const plain = simulatePlan(inputs({ debts: [debt({ id: "card", balance: 1200, rate: 0, minimumPayment: 100 })] }), "interest");
    expect(plain.summary.debtFreeMonth).toBe(12);
    expect(plain.summary.totalInterest).toBe(0);
    expect(plain.summary.debtFreeLabel).toBe("Jan 2027");
    expect(plain.points[0].totalDebt).toBe(1200);
    expect(plain.points[12].totalDebt).toBe(0);
    expect(plain.summary.paymentsNow).toBe(100);
    expect(plain.summary.paymentsAfter12).toBe(0);

    const extra = simulatePlan(inputs({ debts: [debt({ id: "card", balance: 1200, rate: 0, minimumPayment: 100 })], monthlyExtra: 100 }), "interest");
    expect(extra.summary.debtFreeMonth).toBe(6);
    expect(extra.debts[0].firstMonthExtra).toBe(100);
    // Once the card is clear, the spare and the freed minimum go to savings (there is nothing else).
    expect(extra.points[7].allocations.savings).toBeCloseTo(200, 6);
  });

  test("interest compounds monthly at the geometric rate", () => {
    const result = simulatePlan(inputs({ debts: [debt({ id: "loan", balance: 1000, rate: 12, minimumPayment: 100 })], horizonMonths: 12 }), "interest");
    const monthly = Math.pow(1.12, 1 / 12) - 1;
    expect(result.points[1].interest).toBeCloseTo(1000 * monthly, 6);
    expect(result.points[1].totalDebt).toBeCloseTo(1000 * (1 + monthly) - 100, 6);
    expect(result.points[2].interest).toBeCloseTo((1000 * (1 + monthly) - 100) * monthly, 6);
  });

  test("a lump sum that covers everything clears the debt today", () => {
    const result = simulatePlan(inputs({ debts: [debt({ id: "card", balance: 800 })], lumpSum: 1000 }), "interest");
    expect(result.summary.debtFreeMonth).toBe(0);
    expect(result.summary.debtFreeLabel).toBe("Today");
    expect(result.summary.lumpSumSplit.debt).toBe(800);
    expect(result.summary.lumpSumSplit.savings).toBe(200);
    expect(result.debts[0].lumpSumShare).toBe(800);
    expect(result.summary.totalInterest).toBe(0);
  });
});

test.describe("payoff methods", () => {
  // Three debts chosen so every method picks a different first target:
  //   A 3000 @ 10%, min 60 (2.0% of balance)   B 1000 @ 20%, min 25 (2.5%)   C 2000 @ 30%, min 40 (2.0%)
  const three = () => [
    debt({ id: "A", balance: 3000, rate: 10, minimumPayment: 60 }),
    debt({ id: "B", balance: 1000, rate: 20, minimumPayment: 25 }),
    debt({ id: "C", balance: 2000, rate: 30, minimumPayment: 40 }),
  ];

  test("avalanche, snowball and cash-flow attack different debts first", () => {
    const lump = { debts: three(), lumpSum: 500, monthlyExtra: 300 };
    const avalanche = simulatePlan(inputs(lump), "interest");
    const snowball = simulatePlan(inputs(lump), "quick-wins");
    const cashflow = simulatePlan(inputs(lump), "payments");
    const first = (result: typeof avalanche) => result.debts.find((item) => item.lumpSumShare > 0)?.id;
    expect(first(avalanche)).toBe("C");
    expect(first(snowball)).toBe("B");
    expect(first(cashflow)).toBe("B");
    const order = (result: typeof avalanche) => [...result.debts].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map((item) => item.id);
    expect(order(avalanche)).toEqual(["C", "B", "A"]);
    expect(order(snowball)).toEqual(["B", "C", "A"]);
    // Cash-flow re-ranks every month: A's fixed 60 becomes a bigger share of its shrinking balance
    // faster than C's 40 does at 30% APR, so A overtakes C once B is gone.
    expect(order(cashflow)).toEqual(["B", "A", "C"]);
    // Highest APR first costs the least interest; every plan beats minimums only.
    const comparison = comparePlans(inputs(lump), "interest");
    expect(avalanche.summary.totalInterest).toBeLessThanOrEqual(snowball.summary.totalInterest);
    expect(avalanche.summary.totalInterest).toBeLessThanOrEqual(cashflow.summary.totalInterest);
    expect(comparison.baseline.summary.totalInterest).toBeGreaterThan(snowball.summary.totalInterest);
    expect(bestOn(COMPARE_METRICS[0], comparison.results).has("interest")).toBe(true);
  });

  test("a cleared debt's payment rolls into the next one", () => {
    const debts = [debt({ id: "small", balance: 200, rate: 0, minimumPayment: 100 }), debt({ id: "big", balance: 5000, rate: 0, minimumPayment: 100 })];
    const rolled = simulatePlan(inputs({ debts, monthlyExtra: 0 }), "quick-wins");
    // Month 2 clears "small"; from month 3 its 100 goes to "big" on top of big's own 100.
    expect(rolled.points[2].debtBalances.small).toBe(0);
    expect(rolled.points[3].paidToDebt).toBe(200);
    expect(rolled.points[3].allocations.debt).toBe(100);
    expect(rolled.summary.debtFreeMonth).toBe(2 + Math.ceil(4800 / 200));

    const kept = simulatePlan(inputs({ debts, monthlyExtra: 0, rollover: false }), "quick-wins");
    expect(kept.points[3].paidToDebt).toBe(100);
    expect(kept.summary.debtFreeMonth).toBe(50);
  });

  test("the unused part of a final minimum payment is spare the same month", () => {
    // 150 owed at 0% with a 100 minimum: month 1 pays 100, month 2 pays 50 and frees 50.
    const result = simulatePlan(inputs({ debts: [debt({ id: "x", balance: 150, rate: 0, minimumPayment: 100 }), debt({ id: "y", balance: 1000, rate: 0, minimumPayment: 10 })] }), "interest");
    expect(result.points[2].allocations.debt).toBe(50);
    // y pays its own 10 and receives x's spare 50: 1000 - 10 - 10 - 50.
    expect(result.points[2].debtBalances.y).toBe(930);
  });
});

test.describe("utilisation water-fill", () => {
  test("levels the most-used card down to the next, then brings them down together", () => {
    const cards = [
      debt({ id: "X", balance: 900, creditLimit: 1000, minimumPayment: 0 }),
      debt({ id: "Y", balance: 300, creditLimit: 1000, minimumPayment: 0 }),
    ];
    const levelled = simulatePlan(inputs({ debts: cards, lumpSum: 600 }), "credit-score");
    expect(levelled.points[0].debtBalances).toEqual({ X: 300, Y: 300 });
    expect(levelled.points[0].maxUtilisation).toBeCloseTo(30, 6);

    const further = simulatePlan(inputs({ debts: cards, lumpSum: 800 }), "credit-score");
    expect(further.points[0].debtBalances).toEqual({ X: 200, Y: 200 });
    expect(further.summary.utilisationNow).toBeCloseTo(60, 6);
    expect(further.points[0].utilisation).toBeCloseTo(20, 6);
    expect(further.summary.monthsToUtilisationUnder30).toBe(0);
  });

  test("cards come before loans whatever their rate, then loans by APR", () => {
    const result = simulatePlan(
      inputs({
        debts: [debt({ id: "loan", type: "loan", balance: 5000, rate: 40, minimumPayment: 0 }), debt({ id: "card", balance: 500, creditLimit: 1000, rate: 5, minimumPayment: 0 })],
        lumpSum: 700,
      }),
      "credit-score",
    );
    expect(result.debts.find((item) => item.id === "card")?.lumpSumShare).toBe(500);
    expect(result.debts.find((item) => item.id === "loan")?.lumpSumShare).toBe(200);
  });
});

test.describe("buffers and reserves", () => {
  test("cash buffer first fills the gap to the target before any debt", () => {
    const result = simulatePlan(
      inputs({ debts: [debt({ id: "card", balance: 2000 })], monthlyExpenses: 1000, currentBuffer: 1000, bufferMonths: 3, lumpSum: 2500, monthlyExtra: 500 }),
      "cash-buffer",
    );
    expect(result.summary.bufferTarget).toBe(3000);
    expect(result.summary.lumpSumSplit).toEqual({ tax: 0, buffer: 2000, debt: 500, savings: 0 });
    expect(result.summary.bufferReachedMonth).toBe(0);
    // With the buffer full, the monthly spare goes straight to the card.
    expect(result.points[1].allocations.debt).toBe(500);
    expect(result.points[1].allocations.buffer).toBe(0);
  });

  test("a buffer already at target is recognised, and without expenses there is no target", () => {
    const full = simulatePlan(inputs({ debts: [debt({ id: "card" })], monthlyExpenses: 500, currentBuffer: 5000, monthlyExtra: 100 }), "cash-buffer");
    expect(full.summary.bufferReachedMonth).toBe(0);
    expect(full.points[1].allocations.debt).toBe(100);
    const sizeless = simulatePlan(inputs({ debts: [debt({ id: "card" })], monthlyExpenses: 0, monthlyExtra: 100 }), "cash-buffer");
    expect(sizeless.summary.bufferTarget).toBe(0);
    expect(sizeless.points[1].allocations.debt).toBe(100);
  });

  test("tax bill first funds the reserve outright; other priorities spread it to the due month", () => {
    const base = { debts: [debt({ id: "card", balance: 5000 })], taxReserve: 1200, taxDueInMonths: 6, monthlyExtra: 500 };
    const first = simulatePlan(inputs(base), "tax-buffer");
    expect(first.points[1].allocations).toEqual({ tax: 500, buffer: 0, debt: 0, savings: 0 });
    expect(first.points[2].allocations.tax).toBe(500);
    expect(first.points[3].allocations.tax).toBeCloseTo(200, 6);
    expect(first.points[3].allocations.debt).toBeCloseTo(300, 6);
    expect(first.summary.taxFundedMonth).toBe(3);
    expect(first.summary.taxShortfall).toBe(0);
    // The reserve is held (and shown) until the bill is paid in month 6, then it leaves the picture.
    expect(first.points[5].taxReserve).toBeGreaterThanOrEqual(1200);
    expect(first.points[6].taxReserve).toBe(0);

    const spread = simulatePlan(inputs(base), "interest");
    expect(spread.points[1].allocations.tax).toBeCloseTo(200, 6);
    expect(spread.points[1].allocations.debt).toBeCloseTo(300, 6);
    expect(spread.summary.taxFundedMonth).toBe(6);
    expect(spread.summary.taxShortfall).toBeCloseTo(0, 1);
    // A lump sum is not raided for a bill months away unless "tax bill first" is chosen.
    const lump = simulatePlan(inputs({ ...base, lumpSum: 1000 }), "interest");
    expect(lump.summary.lumpSumSplit.tax).toBe(0);
    expect(simulatePlan(inputs({ ...base, lumpSum: 1000 }), "tax-buffer").summary.lumpSumSplit.tax).toBe(1000);
  });

  test("a shortfall at the due date is reported", () => {
    const result = simulatePlan(inputs({ taxReserve: 3000, taxDueInMonths: 2, monthlyExtra: 500 }), "tax-buffer");
    expect(result.summary.taxFundedMonth).toBeNull();
    expect(result.summary.taxShortfall).toBeCloseTo(2000, 0);
  });
});

test.describe("0% promo guard", () => {
  const promoCard = () => debt({ id: "promo", balance: 1200, rate: 22.9, promoRate: 0, promoMonths: 6, minimumPayment: 50 });
  const expensive = () => debt({ id: "loan", type: "loan", balance: 5000, rate: 30, minimumPayment: 100 });

  test("tops up a 0% balance so it clears before the promo ends, even under the avalanche", () => {
    const guarded = simulatePlan(inputs({ debts: [promoCard(), expensive()], monthlyExtra: 400 }), "interest");
    const promo = guarded.debts.find((item) => item.id === "promo")!;
    expect(promo.payoffMonth).toBeLessThanOrEqual(6);
    // Month 1: 1150 left after the minimum, 5 promo months to go — (1150 - 5 × 50) / 6 = 150 on top.
    expect(guarded.points[1].debtBalances.promo).toBeCloseTo(1000, 2);
    expect(promo.firstMonthExtra).toBeCloseTo(150, 2);
    expect(promo.interestPaid).toBe(0);

    const unguarded = simulatePlan(inputs({ debts: [promoCard(), expensive()], monthlyExtra: 400, promoGuard: false }), "interest");
    const promoUnguarded = unguarded.debts.find((item) => item.id === "promo")!;
    expect(promoUnguarded.firstMonthExtra).toBe(0);
    expect(promoUnguarded.payoffMonth).toBeGreaterThan(6);
    expect(promoUnguarded.interestPaid).toBeGreaterThan(0);
  });

  test("a lump sum covers what the minimums alone would not", () => {
    const result = simulatePlan(inputs({ debts: [promoCard(), expensive()], lumpSum: 2000 }), "interest");
    // 1200 - 6 × 50 = 900 goes to the promo card first; the rest to the 30% loan.
    expect(result.debts.find((item) => item.id === "promo")?.lumpSumShare).toBe(900);
    expect(result.debts.find((item) => item.id === "loan")?.lumpSumShare).toBe(1100);
  });
});

test.describe("balanced (rate comparison)", () => {
  test("debts cheaper than the best safe rate get minimums only; money builds a month's buffer then savings", () => {
    const result = simulatePlan(
      inputs({ debts: [debt({ id: "cheap", type: "loan", balance: 5000, rate: 3, minimumPayment: 100 })], savers: [saver({ id: "isa", rate: 4.5 })], monthlyExpenses: 1000, monthlyExtra: 300 }),
      "balanced",
    );
    expect(result.hurdleRate).toBe(4.5);
    expect(result.summary.bufferTarget).toBe(1000);
    expect(result.points[1].allocations).toEqual({ tax: 0, buffer: 300, debt: 0, savings: 0 });
    // The buffer earns the safe rate as it builds, so a little under 100 finishes it in month 4.
    expect(result.points[4].allocations.buffer).toBeGreaterThan(90);
    expect(result.points[4].allocations.buffer).toBeLessThan(100);
    expect(result.points[4].allocations.buffer + result.points[4].allocations.savings).toBeCloseTo(300, 6);
    expect(result.points[4].allocations.debt).toBe(0);
    expect(result.summary.bufferReachedMonth).toBe(4);
    expect(result.notes.some((note) => note.id === "parked" && note.text.includes("cheap"))).toBe(true);

    const dear = simulatePlan(inputs({ debts: [debt({ id: "dear", balance: 5000, rate: 25, minimumPayment: 100 })], monthlyExpenses: 1000, currentBuffer: 1000, monthlyExtra: 300 }), "balanced");
    expect(dear.points[1].allocations.debt).toBe(300);
  });
});

test.describe("custom split", () => {
  test("splits each pool by the chosen percentages and spills what a bucket cannot use", () => {
    const result = simulatePlan(
      inputs({ debts: [debt({ id: "card", balance: 400 })], monthlyExpenses: 1000, bufferMonths: 1, lumpSum: 1000, customShares: { debts: 50, buffer: 25, savings: 25 } }),
      "custom",
    );
    // 500 is offered to the card, which only needs 400; the spare 100 spills to savings.
    expect(result.summary.lumpSumSplit).toEqual({ tax: 0, buffer: 250, debt: 400, savings: 350 });
    expect(result.method).toBe("avalanche");
  });
});

test.describe("savings destinations", () => {
  const savers = () => [
    saver({ id: "current", type: "current", accountClass: "cash", rate: 0.5 }),
    saver({ id: "easy", type: "savings", rate: 4.2, taxTreatment: "taxable" }),
    saver({ id: "isa", type: "isa", rate: 3.9, taxTreatment: "tax-free" }),
    saver({ id: "ss-isa", type: "isa", accountClass: "investment", rate: 6, taxTreatment: "tax-free" }),
    saver({ id: "pension", type: "pension", accountClass: "investment", rate: 6, taxTreatment: "pre-tax", payroll: true }),
  ];

  test("each savings priority ranks the user's own accounts its own way", () => {
    expect(rankSavingsDestinations(inputs({ savers: savers() }), "safe-rate").map((item) => item.id)).toEqual(["easy", "isa", "current"]);
    expect(rankSavingsDestinations(inputs({ savers: savers() }), "growth")[0].id).toBe("ss-isa");
    // Tax wrappers first, payroll-only pensions skipped, taxable cash accounts after.
    expect(rankSavingsDestinations(inputs({ savers: savers() }), "tax-efficient").map((item) => item.id)).toEqual(["ss-isa", "isa", "easy", "current"]);
  });

  test("without accounts an assumed destination stands in, named for the region", () => {
    const gb = rankSavingsDestinations(inputs({}), "safe-rate")[0];
    expect(gb.kind).toBe("assumed-cash");
    expect(gb.rate).toBe(4);
    expect(rankSavingsDestinations(inputs({ region: "US" }), "safe-rate")[0].name).toContain("High-yield");
    const growth = rankSavingsDestinations(inputs({ savers: [saver({ id: "easy", rate: 4 })] }), "growth");
    expect(growth[0].kind).toBe("assumed-investment");
    expect(growth[0].rate).toBe(6);
  });

  test("goals first fills goals in priority order and grows them at their own rate", () => {
    const result = simulatePlan(
      inputs({
        goals: [
          { id: "holiday", name: "Holiday", target: 1500, saved: 400, priority: 2, interestRate: 0, color: "#e05656" },
          { id: "fund", name: "Emergency fund", target: 1000, saved: 0, priority: 1, interestRate: 0, color: "#7a6cd6" },
        ],
        monthlyExtra: 600,
        savingsPriority: "goals-first",
      }),
      "interest",
    );
    expect(result.destinations.map((item) => item.id)).toEqual(["fund", "holiday", null]);
    // Month 1: 600 to the fund. Month 2: 400 finishes it, 200 starts the holiday (1100 to go).
    expect(result.points[1].goalsAdded).toBe(600);
    expect(result.points[2].goalsAdded).toBe(1200);
    expect(result.points[4].goalsAdded).toBe(2100);
    expect(result.points[4].savings).toBeCloseTo(2400, 6);
  });

  test("plan savings grow at the destination's rate", () => {
    const result = simulatePlan(inputs({ savers: [saver({ id: "easy", rate: 12 })], monthlyExtra: 1000, horizonMonths: 12 }), "interest");
    const monthly = Math.pow(1.12, 1 / 12) - 1;
    expect(result.points[1].savings).toBe(1000);
    expect(result.points[2].savings).toBeCloseTo(1000 * (1 + monthly) + 1000, 6);
    expect(result.summary.growthEarned).toBeGreaterThan(0);
  });
});

test.describe("baseline and comparison", () => {
  test("minimums only leaves the spare money idle, so net position is like for like", () => {
    const comparison = comparePlans(inputs({ debts: [debt({ id: "card", balance: 1000, rate: 0, minimumPayment: 100 })], monthlyExtra: 100, horizonMonths: 12 }), "interest");
    expect(comparison.baseline.points[3].savings).toBe(300);
    expect(comparison.baseline.summary.debtFreeMonth).toBe(10);
    // 12 × 100 spare plus the 100 minimum freed in months 11 and 12, all idle.
    expect(comparison.baseline.summary.netPosition).toBe(1400);
    expect(comparison.selected.summary.debtFreeMonth).toBe(5);
    expect(comparison.results.map((result) => result.priority)).not.toContain("custom");
    expect(comparePlans(inputs({}), "custom").results.map((result) => result.priority)).toContain("custom");
  });

  test("with no debts every priority simply saves", () => {
    const result = simulatePlan(inputs({ monthlyExtra: 200, horizonMonths: 12 }), "quick-wins");
    expect(result.summary.debtFreeMonth).toBe(0);
    expect(result.summary.totalInterest).toBe(0);
    expect(result.points[12].savings).toBeGreaterThan(2400);
  });

  test("missing minimum payments are called out", () => {
    const result = simulatePlan(inputs({ debts: [debt({ id: "card", minimumPayment: 0 })] }), "interest");
    expect(result.notes[0].tone).toBe("warn");
    expect(result.notes[0].text).toContain("No minimum payment is set for card");
    expect(result.summary.debtFreeMonth).toBeNull();
  });
});

test.describe("ledger plumbing", () => {
  function account(overrides: Partial<Account>): Account {
    return {
      id: overrides.name ?? "acct",
      name: "Account",
      accountClass: "savings",
      type: "savings",
      balance: 1000,
      rate: 4,
      promoRate: 0,
      promoMonths: 0,
      monthlyContribution: 0,
      creditLimit: 0,
      minimumPayment: 0,
      dueDay: 1,
      balanceAsOf: "2026-01",
      promoAsOf: "2026-01",
      includeInNetWorth: true,
      color: "#2f7fdd",
      note: "",
      ...overrides,
    };
  }

  test("debts with a balance become plan debts; easy-access savings count as the buffer", () => {
    const accounts = [
      account({ name: "Card", accountClass: "debt", type: "credit-card", balance: 800, creditLimit: 2000, minimumPayment: 40, rate: 24 }),
      account({ name: "Cleared", accountClass: "debt", type: "loan", balance: 0 }),
      account({ name: "Easy access", accountClass: "savings", type: "savings", balance: 2500 }),
      account({ name: "Fixed bond", accountClass: "savings", type: "cd", balance: 5000 }),
      account({ name: "Current", accountClass: "cash", type: "current", balance: 900 }),
      account({ name: "Home", accountClass: "investment", type: "other-asset", balance: 300000 }),
    ];
    expect(planDebtsFromAccounts(accounts).map((item) => item.name)).toEqual(["Card"]);
    expect(accessibleSavings(accounts)).toBe(2500);
    const built = buildPlanInputs({ accounts, goals: [], settings: { ...DEFAULT_ALLOCATION_SETTINGS, lumpSum: 500 }, monthlySurplus: 210.4, monthlyExpenses: 1800, assumedInvestmentReturn: 7, region: "GB" });
    expect(built.monthlyExtra).toBeCloseTo(210.4, 6);
    expect(built.lumpSum).toBe(500);
    expect(built.currentBuffer).toBe(2500);
    // The home is not somewhere to put savings.
    expect(built.savers.map((item) => item.name)).not.toContain("Home");
    expect(buildPlanInputs({ accounts, goals: [], settings: { ...DEFAULT_ALLOCATION_SETTINGS, monthlyExtraOverride: 50 }, monthlySurplus: 210.4, monthlyExpenses: 0, assumedInvestmentReturn: 6, region: "US" }).monthlyExtra).toBe(50);
    // A negative surplus means nothing spare, not a negative pool.
    expect(buildPlanInputs({ accounts, goals: [], settings: DEFAULT_ALLOCATION_SETTINGS, monthlySurplus: -300, monthlyExpenses: 0, assumedInvestmentReturn: 6, region: "GB" }).monthlyExtra).toBe(0);
  });

  test("stored settings are cleaned and defaults fill the gaps", () => {
    expect(normalizeAllocationSettings(undefined)).toEqual(DEFAULT_ALLOCATION_SETTINGS);
    const cleaned = normalizeAllocationSettings({ priority: "bogus", lumpSum: "2500", monthlyExtraOverride: -5, horizonMonths: 7, bufferMonths: 99, customShares: { debts: 150 }, promoGuard: "yes" });
    expect(cleaned.priority).toBe("interest");
    expect(cleaned.lumpSum).toBe(2500);
    expect(cleaned.monthlyExtraOverride).toBe(0);
    expect(cleaned.horizonMonths).toBe(36);
    expect(cleaned.bufferMonths).toBe(24);
    expect(cleaned.customShares).toEqual({ debts: 100, buffer: 20, savings: 20 });
    expect(cleaned.promoGuard).toBe(true);
    expect(normalizeAllocationSettings({ priority: "credit-score", savingsPriority: "growth", horizonMonths: 60, monthlyExtraOverride: null }).monthlyExtraOverride).toBeNull();
  });
});
