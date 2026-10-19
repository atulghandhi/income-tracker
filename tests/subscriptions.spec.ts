import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/finance";
import {
  amountPatternOf,
  merchantKeysSimilar,
  deleteSubscription,
  detectSubscriptions,
  markSubscriptionCancelled,
  normalizeSubscriptionPrefs,
  reactivateSubscription,
  restoreDeletedSubscriptions,
  setSubscriptionKind,
  setSubscriptionTolerance,
  shiftIsoDate,
  type Subscription,
} from "../src/subscriptions";
import type { ExpenseEntry, IncomeEntry, LedgerState } from "../src/types";

// Synthetic ledgers for the subscription tracker. Every scenario names the trap it guards
// against: the 4-weekly salary trap, the currency wobble that is not a price rise, three Apple
// charges on one descriptor, a weekly Tesco shop, a direct debit nudged by a bank holiday.

const TODAY = "2026-06-10";

type Row = { name: string; amount: number; date: string; category?: string; recurring?: boolean; id?: string; debtAccountId?: string; toAccountId?: string };

function ledgerWith(rows: Row[], incomes: Array<{ source: string; amount: number; date: string }> = []): LedgerState {
  const state = createInitialState();
  state.months = {};
  let counter = 0;
  const ensure = (monthKey: string) => {
    if (!state.months[monthKey]) state.months[monthKey] = { incomes: [], expenses: [], note: "" };
    return state.months[monthKey];
  };
  for (const row of rows) {
    const monthKey = row.date.slice(0, 7);
    const expense: ExpenseEntry = {
      id: row.id ?? `e${(counter += 1)}`,
      name: row.name,
      category: row.category ?? "",
      amount: row.amount,
      color: "#1baf7a",
      recurring: row.recurring ?? false,
      date: row.date,
      debtAccountId: row.debtAccountId,
      toAccountId: row.toAccountId,
    };
    ensure(monthKey).expenses.push(expense);
  }
  for (const income of incomes) {
    const entry: IncomeEntry = { id: `i${(counter += 1)}`, source: income.source, amount: income.amount, color: "#2f7fdd", recurring: false, date: income.date };
    ensure(income.date.slice(0, 7)).incomes.push(entry);
  }
  ensure(TODAY.slice(0, 7));
  state.selectedMonth = TODAY.slice(0, 7);
  return state;
}

// Same day each month, from a start date, n times.
function monthly(name: string, amount: number | number[], start: string, count: number, extra: Partial<Row> = {}): Row[] {
  const rows: Row[] = [];
  const [year, month, day] = start.split("-").map(Number);
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const iso = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
    rows.push({ name, amount: Array.isArray(amount) ? amount[index] : amount, date: iso, ...extra });
  }
  return rows;
}

function everyNDays(name: string, amount: number, start: string, days: number, count: number, extra: Partial<Row> = {}): Row[] {
  const rows: Row[] = [];
  for (let index = 0; index < count; index += 1) rows.push({ name, amount, date: shiftIsoDate(start, index * days), ...extra });
  return rows;
}

function all(report: ReturnType<typeof detectSubscriptions>): Subscription[] {
  return [...report.subscriptions, ...report.bills, ...report.cancelled];
}

function find(report: ReturnType<typeof detectSubscriptions>, needle: string): Subscription | undefined {
  return all(report).find((subscription) => subscription.key.includes(needle));
}

test.describe("subscription detection", () => {
  test("a monthly subscription is found across descriptor variants, with yearly cost and next date", () => {
    const state = ledgerWith([
      { name: "Netflix", amount: 10.99, date: "2026-01-15", category: "Subscriptions" },
      { name: "NETFLIX.COM", amount: 10.99, date: "2026-02-15", category: "Subscriptions" },
      { name: "Netflix", amount: 10.99, date: "2026-03-15", category: "Subscriptions" },
      { name: "Netflix", amount: 10.99, date: "2026-04-15", category: "Subscriptions" },
      { name: "Netflix", amount: 10.99, date: "2026-05-15", category: "Subscriptions" },
    ]);
    const report = detectSubscriptions(state, { today: TODAY });
    const netflix = find(report, "netflix");
    expect(netflix).toBeTruthy();
    expect(netflix!.cadence).toBe("monthly");
    expect(netflix!.kind).toBe("subscription");
    expect(netflix!.currentPrice).toBe(10.99);
    expect(netflix!.yearlyCost).toBe(131.88);
    expect(netflix!.nextExpected).toBe("2026-06-15");
    expect(netflix!.status).toBe("active");
    expect(netflix!.priceChanges).toHaveLength(0);
    expect(netflix!.scheduleHint).toBe("around the 15th");
    expect(report.totals.yearly).toBe(131.88);
  });

  test("4-weekly payments are told apart from monthly ones — 13 a year, not 12", () => {
    const state = ledgerWith([
      ...everyNDays("PureGym", 24.99, "2026-01-02", 28, 6, { category: "Health" }),
      ...monthly("Spotify", 10.99, "2026-01-05", 6, { category: "Subscriptions" }),
    ]);
    const report = detectSubscriptions(state, { today: TODAY });
    const gym = find(report, "puregym")!;
    const spotify = find(report, "spotify")!;
    expect(gym.cadence).toBe("4-weekly");
    expect(gym.cyclesPerYear).toBe(13);
    expect(gym.yearlyCost).toBe(324.87);
    expect(gym.nextExpected).toBe(shiftIsoDate("2026-01-02", 28 * 6));
    expect(spotify.cadence).toBe("monthly");
    expect(spotify.yearlyCost).toBe(131.88);
  });

  test("a 4-weekly pattern with only three payments still reads as 4-weekly", () => {
    const state = ledgerWith(everyNDays("Gym", 30, "2026-03-06", 28, 3, { category: "Health" }));
    const gym = find(detectSubscriptions(state, { today: TODAY }), "gym")!;
    expect(gym.cadence).toBe("4-weekly");
  });

  test("an annual subscription is found from two renewals and the next renewal is predicted", () => {
    const state = ledgerWith([
      { name: "Amazon Prime", amount: 95, date: "2024-07-14" },
      { name: "AMZNPRIME", amount: 95, date: "2025-07-14" },
      ...monthly("Netflix", 10.99, "2026-01-15", 5),
    ]);
    const report = detectSubscriptions(state, { today: TODAY });
    const prime = find(report, "amazon prime")!;
    expect(prime).toBeTruthy();
    expect(prime.cadence).toBe("annual");
    expect(prime.cyclesPerYear).toBe(1);
    expect(prime.yearlyCost).toBe(95);
    expect(prime.nextExpected).toBe("2026-07-14");
    expect(prime.daysUntilNext).toBe(34);
    expect(prime.status).toBe("active");
    expect(prime.kind).toBe("subscription");
  });

  test("an annual renewal inside the next 30 days is listed as coming up", () => {
    const state = ledgerWith([
      { name: "Adobe Creative Cloud", amount: 599.88, date: "2024-06-20" },
      { name: "Adobe Creative Cloud", amount: 599.88, date: "2025-06-22" },
      ...monthly("Netflix", 10.99, "2026-01-15", 5),
    ]);
    const report = detectSubscriptions(state, { today: TODAY });
    const adobe = find(report, "adobe")!;
    expect(adobe.cadence).toBe("annual");
    expect(adobe.nextExpected).toBe("2026-06-21");
    expect(report.totals.renewalsSoon.map((subscription) => subscription.key)).toContain("adobe creative cloud");
  });

  test("quarterly and half-yearly cadences are recognised", () => {
    const state = ledgerWith([
      { name: "Water Plus", amount: 90, date: "2025-09-01", category: "Bills" },
      { name: "Water Plus", amount: 90, date: "2025-12-01", category: "Bills" },
      { name: "Water Plus", amount: 90, date: "2026-03-02", category: "Bills" },
      { name: "Car insurance", amount: 240, date: "2025-11-10" },
      { name: "Car insurance", amount: 240, date: "2026-05-11" },
    ]);
    const report = detectSubscriptions(state, { today: TODAY });
    expect(find(report, "water plus")!.cadence).toBe("quarterly");
    expect(find(report, "water plus")!.yearlyCost).toBe(360);
    expect(find(report, "car insurance")!.cadence).toBe("half-yearly");
    expect(find(report, "car insurance")!.kind).toBe("bill");
  });
});

test.describe("price changes", () => {
  test("a real increase is flagged with its yearly impact", () => {
    const state = ledgerWith(monthly("Netflix", [10.99, 10.99, 10.99, 12.99, 12.99], "2026-01-15", 5, { category: "Subscriptions" }));
    const netflix = find(detectSubscriptions(state, { today: TODAY }), "netflix")!;
    expect(netflix.priceChanges).toHaveLength(1);
    expect(netflix.priceChanges[0]).toMatchObject({ from: 10.99, to: 12.99, date: "2026-04-15", confirmed: true, yearlyImpact: 24 });
    expect(netflix.priceChanges[0].percent).toBeCloseTo(18.2, 0);
    expect(netflix.flaggedIncrease).toBeTruthy();
    expect(netflix.currentPrice).toBe(12.99);
    expect(netflix.yearlyCost).toBe(155.88);
  });

  test("an increase seen only on the latest payment is reported as unconfirmed", () => {
    const state = ledgerWith(monthly("Spotify", [10.99, 10.99, 10.99, 10.99, 11.99], "2026-01-19", 5, { category: "Subscriptions" }));
    const spotify = find(detectSubscriptions(state, { today: TODAY }), "spotify")!;
    expect(spotify.priceChanges).toHaveLength(1);
    expect(spotify.priceChanges[0].confirmed).toBe(false);
    expect(spotify.currentPrice).toBe(11.99);
  });

  test("a single odd payment between two runs at the same price is not a price change", () => {
    const state = ledgerWith(monthly("Disney+", [7.99, 7.99, 4.99, 7.99, 7.99], "2026-01-03", 5, { category: "Subscriptions" }));
    const disney = find(detectSubscriptions(state, { today: TODAY }), "disney")!;
    expect(disney.priceChanges).toHaveLength(0);
    expect(disney.currentPrice).toBe(7.99);
  });

  test("a decrease is recorded but not flagged as an increase", () => {
    const state = ledgerWith(monthly("Now TV", [9.99, 9.99, 9.99, 6.99, 6.99], "2026-01-03", 5, { category: "Subscriptions" }));
    const now = find(detectSubscriptions(state, { today: TODAY }), "now tv")!;
    expect(now.priceChanges).toHaveLength(1);
    expect(now.priceChanges[0].to).toBe(6.99);
    expect(now.flaggedIncrease).toBeNull();
  });

  test("currency-conversion wobble is not a price change", () => {
    // $12.99 billed in GBP as the rate drifts: every payment slightly different, none a real rise.
    const amounts = [10.21, 10.34, 10.12, 10.45, 10.29, 10.18, 10.52, 10.4, 10.27, 10.36];
    const state = ledgerWith(monthly("Openai ChatGPT", amounts, "2025-08-04", 10));
    const chatgpt = find(detectSubscriptions(state, { today: TODAY }), "chatgpt")!;
    expect(chatgpt).toBeTruthy();
    expect(chatgpt.cadence).toBe("monthly");
    expect(chatgpt.amountPattern).toBe("fluctuating");
    expect(chatgpt.priceChanges).toHaveLength(0);
    expect(chatgpt.flaggedIncrease).toBeNull();
    expect(chatgpt.currentPrice).toBeGreaterThan(10);
    expect(chatgpt.currentPrice).toBeLessThan(10.6);
    expect(amountPatternOf(amounts)).toBe("fluctuating");
  });

  test("a sustained step inside a wobbling series still counts as a price change", () => {
    // $10 → $15 billed in GBP: the wobble stays, the level jumps ~50% and stays there.
    const amounts = [7.91, 8.04, 7.95, 8.1, 11.88, 12.02, 11.95, 12.11];
    const state = ledgerWith(monthly("Notion Labs", amounts, "2025-10-07", 8));
    const notion = find(detectSubscriptions(state, { today: TODAY }), "notion")!;
    expect(notion).toBeTruthy();
    expect(notion.priceChanges).toHaveLength(1);
    expect(notion.priceChanges[0].from).toBeCloseTo(8, 0);
    expect(notion.priceChanges[0].to).toBeCloseTo(12, 0);
    expect(notion.flaggedIncrease).toBeTruthy();
  });

  test("increases add up in the report totals", () => {
    const state = ledgerWith([
      ...monthly("Netflix", [10.99, 10.99, 10.99, 12.99, 12.99], "2026-01-15", 5, { category: "Subscriptions" }),
      ...monthly("Spotify", 10.99, "2026-01-19", 5, { category: "Subscriptions" }),
    ]);
    const report = detectSubscriptions(state, { today: TODAY });
    expect(report.totals.increasesCount).toBe(1);
    expect(report.totals.increasesYearlyImpact).toBe(24);
  });
});

test.describe("what is not a subscription", () => {
  test("a weekly supermarket shop is ignored, even when the amounts are similar", () => {
    const rows: Row[] = [];
    const amounts = [62.4, 58.9, 71.2, 60.5, 64.8, 59.3, 66.1, 61.7, 63.2, 60.9, 65.4, 62.8];
    amounts.forEach((amount, index) => rows.push({ name: "TESCO STORES 2041", amount, date: shiftIsoDate("2026-03-07", index * 7), category: "Food" }));
    const report = detectSubscriptions(state(rows), { today: TODAY });
    expect(find(report, "tesco")).toBeUndefined();
  });

  test("an identical weekly spend at a retailer is still not a subscription", () => {
    const report = detectSubscriptions(state(everyNDays("Tesco", 5, "2026-03-07", 7, 12, { category: "Food" })), { today: TODAY });
    expect(find(report, "tesco")).toBeUndefined();
  });

  test("a retailer's own plan (Tesco Mobile) is a bill, the weekly shop beside it is not", () => {
    const rows = [
      ...monthly("Tesco Mobile", 10, "2026-01-20", 5),
      ...everyNDays("Tesco", 54.2, "2026-03-07", 7, 4, { category: "Food" }),
    ];
    const report = detectSubscriptions(state(rows), { today: TODAY });
    expect(find(report, "tesco mobile")).toBeTruthy();
    expect(find(report, "tesco mobile")!.kind).toBe("bill");
    expect(all(report).filter((subscription) => subscription.key === "tesco")).toHaveLength(0);
  });

  test("salary and other income never appear", () => {
    const ledger = ledgerWith(monthly("Netflix", 10.99, "2026-01-15", 5), [
      { source: "ACME LTD SALARY", amount: 2875, date: "2026-01-28" },
      { source: "ACME LTD SALARY", amount: 2875, date: "2026-02-27" },
      { source: "ACME LTD SALARY", amount: 2875, date: "2026-03-27" },
      { source: "ACME LTD SALARY", amount: 2875, date: "2026-04-28" },
      { source: "ACME LTD SALARY", amount: 2875, date: "2026-05-28" },
    ]);
    const report = detectSubscriptions(ledger, { today: TODAY });
    expect(find(report, "acme")).toBeUndefined();
    expect(find(report, "salary")).toBeUndefined();
  });

  test("transfers to the user's own accounts and scheduled debt placeholders are skipped", () => {
    const rows = [
      ...monthly("To savings pot", 200, "2026-01-01", 5, { toAccountId: "acc-1" }),
      ...monthly("ISA top up", 100, "2026-01-01", 5, { category: "Transfers" }),
    ];
    const ledger = state(rows);
    ledger.months["2026-03"].expenses.push({ id: "sp", name: "Barclaycard", category: "Debt payments", amount: 60, color: "#1", recurring: true, date: "2026-03-12", scheduledPayment: true, debtAccountId: "d1" });
    const report = detectSubscriptions(ledger, { today: TODAY });
    expect(all(report)).toHaveLength(0);
  });

  test("a variable monthly spend at a non-bill merchant is not picked up", () => {
    const report = detectSubscriptions(state(monthly("Eating out", [90, 112, 75, 130, 88], "2026-01-22", 5, { category: "Food" })), { today: TODAY });
    expect(all(report)).toHaveLength(0);
  });

  test("a variable utility bill is tracked as a bill with a range, not a subscription", () => {
    const report = detectSubscriptions(state(monthly("Octopus Energy", [118.4, 142.9, 131.2, 96.7, 84.3], "2026-01-05", 5, { category: "Bills" })), { today: TODAY });
    const octopus = find(report, "octopus")!;
    expect(octopus).toBeTruthy();
    expect(octopus.kind).toBe("bill");
    expect(octopus.amountPattern).toBe("variable");
    expect(octopus.priceChanges).toHaveLength(0);
    expect(octopus.amountRange).toEqual({ min: 84.3, max: 142.9 });
    expect(octopus.yearlyCost).toBeGreaterThan(1000);
  });

  function state(rows: Row[]) {
    return ledgerWith(rows);
  }
});

test.describe("separate subscriptions to one payee", () => {
  test("three Apple charges on the same descriptor become three subscriptions", () => {
    const rows = [
      ...monthly("APPLE.COM/BILL", 0.99, "2026-01-03", 5),
      ...monthly("APPLE.COM/BILL", 10.99, "2026-01-11", 5),
      ...monthly("APPLE.COM/BILL", 8.99, "2026-01-20", 5),
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(3);
    expect(apple.map((subscription) => subscription.currentPrice).sort()).toEqual([0.99, 10.99, 8.99]);
    expect(apple.every((subscription) => subscription.siblings === 2)).toBe(true);
    expect(new Set(apple.map((subscription) => subscription.id)).size).toBe(3);
    expect(report.totals.yearly).toBeCloseTo((0.99 + 10.99 + 8.99) * 12, 1);
  });

  test("a price change is one subscription, not two — clusters that follow each other merge", () => {
    const rows = monthly("Spotify", [9.99, 9.99, 9.99, 10.99, 10.99, 10.99], "2025-12-19", 6, { category: "Subscriptions" });
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(all(report).filter((subscription) => subscription.key === "spotify")).toHaveLength(1);
    expect(find(report, "spotify")!.priceChanges).toHaveLength(1);
  });

  test("a tiny plan that ends and a big plan that starts are separate, not a 1,000% rise", () => {
    const rows = [
      ...monthly("APPLE.COM/BILL", 0.79, "2025-09-03", 4),
      ...monthly("APPLE.COM/BILL", 10.99, "2026-02-03", 4),
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(2);
    expect(apple.every((subscription) => subscription.priceChanges.length === 0)).toBe(true);
  });

  test("a monthly subscription beside one-off purchases at the same merchant is still found", () => {
    const rows = [
      ...monthly("Amazon Prime", 8.99, "2026-01-09", 5),
      { name: "Amazon Prime", amount: 23.5, date: "2026-02-14" },
      { name: "Amazon Prime", amount: 61.2, date: "2026-03-28" },
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const prime = all(report).filter((subscription) => subscription.key === "amazon prime");
    expect(prime).toHaveLength(1);
    expect(prime[0].currentPrice).toBe(8.99);
    expect(prime[0].occurrences).toBe(5);
  });
});

test.describe("working-day tolerance", () => {
  test("a direct debit nudged by weekends and bank holidays still fits a monthly cadence", () => {
    // Due on the 1st; lands on the next working day after weekends and the Easter bank holidays.
    const dates = ["2025-12-01", "2026-01-02", "2026-02-02", "2026-03-02", "2026-04-07", "2026-05-01", "2026-06-01"];
    const rows = dates.map((date) => ({ name: "Council Tax", amount: 168, date, category: "Bills" }));
    const council = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "council")!;
    expect(council).toBeTruthy();
    expect(council.cadence).toBe("monthly");
    expect(council.status).toBe("active");
    expect(council.missedCycles).toBe(0);
    expect(council.kind).toBe("bill");
  });

  test("a payment that is late but inside the tolerance is not reported missing", () => {
    const rows = monthly("Netflix", 10.99, "2026-01-08", 5, { category: "Subscriptions" });
    // Today is two days after the expected 8 June: inside the default four-day window.
    const netflix = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "netflix")!;
    expect(netflix.nextExpected).toBe("2026-06-08");
    expect(netflix.status).toBe("active");
    // Nine days after and it is due.
    const later = find(detectSubscriptions(ledgerWith(rows), { today: "2026-06-17" }), "netflix")!;
    expect(later.status).toBe("due");
  });

  test("the user can widen the tolerance per subscription", () => {
    const rows = monthly("Netflix", 10.99, "2026-01-08", 5, { category: "Subscriptions" });
    const state = ledgerWith(rows);
    const netflix = find(detectSubscriptions(state, { today: "2026-06-17" }), "netflix")!;
    expect(netflix.status).toBe("due");
    const widened = setSubscriptionTolerance(state, netflix, 10);
    const again = find(detectSubscriptions(widened, { today: "2026-06-17" }), "netflix")!;
    expect(again.toleranceDays).toBe(10);
    expect(again.toleranceSource).toBe("user");
    expect(again.status).toBe("active");
  });

  test("weekend drift does not turn a monthly payment into 4-weekly", () => {
    const dates = ["2026-01-30", "2026-02-27", "2026-03-30", "2026-04-30", "2026-05-29"];
    const rows = dates.map((date) => ({ name: "Broadband", amount: 32, date, category: "Bills" }));
    const broadband = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "broadband")!;
    expect(broadband.cadence).toBe("monthly");
    expect(broadband.cyclesPerYear).toBe(12);
  });
});

test.describe("cancelled subscriptions", () => {
  test("a subscription that stops being paid is detected as stopped and listed as cancelled", () => {
    const rows = [
      ...monthly("Disney+", 7.99, "2025-10-03", 5, { category: "Subscriptions" }), // last 2026-02-03
      ...monthly("Netflix", 10.99, "2026-01-15", 5, { category: "Subscriptions" }),
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const disney = find(report, "disney")!;
    expect(disney.status).toBe("stopped");
    expect(report.cancelled.map((subscription) => subscription.key)).toContain("disney");
    expect(report.subscriptions.map((subscription) => subscription.key)).not.toContain("disney");
    expect(report.totals.yearly).toBe(131.88);
    expect(report.totals.cancelledYearlySaving).toBeCloseTo(95.88, 2);
  });

  test("the user can flag a subscription cancelled, then delete it from the cancelled list", () => {
    let state = ledgerWith(monthly("Netflix", 10.99, "2026-01-15", 5, { category: "Subscriptions", recurring: true }));
    let netflix = find(detectSubscriptions(state, { today: TODAY }), "netflix")!;
    expect(netflix.alreadyRecurring).toBe(true);

    state = markSubscriptionCancelled(state, netflix, TODAY);
    let report = detectSubscriptions(state, { today: TODAY });
    netflix = find(report, "netflix")!;
    expect(netflix.status).toBe("cancelled");
    expect(netflix.cancelledAt).toBe(TODAY);
    expect(report.cancelled).toHaveLength(1);
    expect(report.subscriptions).toHaveLength(0);
    // The latest entry stops repeating into new months.
    expect(state.months["2026-05"].expenses[0].recurring).toBe(false);
    expect(state.months["2026-01"].expenses[0].recurring).toBe(true);

    state = reactivateSubscription(state, netflix);
    expect(find(detectSubscriptions(state, { today: TODAY }), "netflix")!.status).toBe("active");

    state = markSubscriptionCancelled(state, netflix, TODAY);
    state = deleteSubscription(state, netflix);
    report = detectSubscriptions(state, { today: TODAY });
    expect(all(report)).toHaveLength(0);
    expect(report.deletedCount).toBe(1);

    state = restoreDeletedSubscriptions(state);
    expect(all(detectSubscriptions(state, { today: TODAY }))).toHaveLength(1);
  });

  test("a charge after the user cancelled is called out", () => {
    let state = ledgerWith(monthly("Netflix", 10.99, "2026-01-15", 4, { category: "Subscriptions" }));
    const netflix = find(detectSubscriptions(state, { today: "2026-04-20" }), "netflix")!;
    state = markSubscriptionCancelled(state, netflix, "2026-04-20");
    state.months["2026-05"] = { incomes: [], expenses: [{ id: "late", name: "Netflix", category: "Subscriptions", amount: 10.99, color: "#1", recurring: false, date: "2026-05-15" }], note: "" };
    const report = detectSubscriptions(state, { today: TODAY });
    const again = find(report, "netflix")!;
    expect(again.status).toBe("cancelled");
    expect(again.chargedAfterCancel).toHaveLength(1);
    expect(report.totals.chargedAfterCancel.map((subscription) => subscription.key)).toContain("netflix");
  });

  test("a cancelled subscription whose rows are gone is still remembered on the cancelled list", () => {
    let state = ledgerWith(monthly("Netflix", 10.99, "2026-01-15", 5, { category: "Subscriptions" }));
    const netflix = find(detectSubscriptions(state, { today: TODAY }), "netflix")!;
    state = markSubscriptionCancelled(state, netflix, TODAY);
    state = { ...state, months: { [TODAY.slice(0, 7)]: { incomes: [], expenses: [], note: "" } } };
    const report = detectSubscriptions(state, { today: TODAY });
    expect(report.cancelled).toHaveLength(1);
    expect(report.cancelled[0].label).toBe("Netflix");
    expect(report.cancelled[0].yearlyCost).toBe(131.88);
  });

  test("stale data is judged against the last transaction, not today", () => {
    // Nothing imported since February: Netflix has not "stopped", the data simply ends.
    const rows = monthly("Netflix", 10.99, "2025-10-15", 5, { category: "Subscriptions" }); // last 2026-02-15
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(report.dataEnd).toBe("2026-02-15");
    expect(report.dataStale).toBe(true);
    expect(find(report, "netflix")!.status).toBe("active");
  });
});

test.describe("preferences", () => {
  test("kind can be overridden and reset", () => {
    let state = ledgerWith(monthly("Puregym", 24.99, "2026-01-02", 5));
    const gym = find(detectSubscriptions(state, { today: TODAY }), "puregym")!;
    expect(gym.kind).toBe("subscription");
    state = setSubscriptionKind(state, gym, "bill");
    expect(detectSubscriptions(state, { today: TODAY }).bills.map((subscription) => subscription.key)).toContain("puregym");
    state = setSubscriptionKind(state, gym, null);
    expect(state.subscriptionPrefs).toHaveLength(0);
  });

  test("stored preferences are normalised defensively", () => {
    const prefs = normalizeSubscriptionPrefs([
      { id: "netflix|monthly", status: "cancelled", cancelledAt: "2026-06-01", label: "Netflix", cadence: "monthly", price: 10.99, updatedAt: "x" },
      { id: "bogus" }, // nothing decided — dropped
      { id: "x|monthly", toleranceDays: 99 },
      null,
      { status: "deleted" }, // no id — dropped
    ]);
    expect(prefs).toHaveLength(2);
    expect(prefs[0]).toMatchObject({ id: "netflix|monthly", status: "cancelled", label: "Netflix" });
    expect(prefs[1].toleranceDays).toBe(14);
  });

  test("a preference saved before a second stream appeared still applies to the right one", () => {
    let state = ledgerWith(monthly("APPLE.COM/BILL", 2.99, "2026-01-03", 5));
    const icloud = find(detectSubscriptions(state, { today: TODAY }), "apple")!;
    expect(icloud.id).toBe("apple|monthly");
    state = markSubscriptionCancelled(state, icloud, TODAY);
    // A new Apple Music plan starts: same payee, different price.
    for (const row of monthly("APPLE.COM/BILL", 10.99, "2026-03-11", 3)) {
      state.months[row.date.slice(0, 7)].expenses.push({ id: `m-${row.date}`, name: row.name, category: "", amount: row.amount, color: "#1", recurring: false, date: row.date });
    }
    const report = detectSubscriptions(state, { today: TODAY });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(2);
    expect(apple.find((subscription) => subscription.currentPrice === 2.99)!.status).toBe("cancelled");
    expect(apple.find((subscription) => subscription.currentPrice === 10.99)!.status).toBe("active");
  });
});

test.describe("messy real-world histories", () => {
  test("a skipped month does not break the pattern", () => {
    const rows = monthly("Spotify", 10.99, "2025-11-19", 7, { category: "Subscriptions" }).filter((row) => !row.date.startsWith("2026-02"));
    const spotify = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "spotify")!;
    expect(spotify).toBeTruthy();
    expect(spotify.cadence).toBe("monthly");
    expect(spotify.missedCycles).toBe(1);
    expect(spotify.occurrences).toBe(6);
  });

  test("a duplicate charge in one month is tolerated", () => {
    const rows = [...monthly("Spotify", 10.99, "2025-11-19", 7, { category: "Subscriptions" }), { name: "Spotify", amount: 10.99, date: "2026-02-20", category: "Subscriptions" }];
    const spotify = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "spotify")!;
    expect(spotify).toBeTruthy();
    expect(spotify.cadence).toBe("monthly");
    expect(spotify.occurrences).toBe(8);
  });

  test("cancelling and re-subscribing on a different day of the month yields two runs, not nothing", () => {
    const rows = [...monthly("Netflix", 10.99, "2025-08-03", 4, { category: "Subscriptions" }), ...monthly("Netflix", 10.99, "2026-02-21", 4, { category: "Subscriptions" })];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const netflix = all(report).filter((subscription) => subscription.key === "netflix");
    expect(netflix.length).toBeGreaterThanOrEqual(1);
    expect(report.subscriptions.some((subscription) => subscription.key === "netflix" && subscription.status === "active")).toBe(true);
    expect(report.totals.yearly).toBe(131.88);
  });

  test("an annual renewal whose price rose between the only two renewals is still one subscription", () => {
    const rows = [
      { name: "Amazon Prime", amount: 95, date: "2024-07-14" },
      { name: "Amazon Prime", amount: 99, date: "2025-07-14" },
      ...monthly("Netflix", 10.99, "2026-01-15", 5),
    ];
    const prime = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "amazon prime")!;
    expect(prime).toBeTruthy();
    expect(prime.cadence).toBe("annual");
    expect(prime.currentPrice).toBe(99);
    expect(prime.priceChanges).toHaveLength(1);
    expect(prime.priceChanges[0]).toMatchObject({ from: 95, to: 99, yearlyImpact: 4 });
  });

  test("a price that changed twice keeps the whole history", () => {
    const rows = monthly("Disney+", [7.99, 7.99, 7.99, 8.99, 8.99, 8.99, 10.99, 10.99, 10.99], "2025-09-03", 9, { category: "Subscriptions" });
    const disney = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "disney")!;
    expect(disney.priceChanges.map((change) => change.to)).toEqual([8.99, 10.99]);
    expect(disney.currentPrice).toBe(10.99);
    expect(disney.occurrences).toBe(9);
  });

  test("two subscriptions to one payee at the same price on different days are told apart", () => {
    const rows = [...monthly("APPLE.COM/BILL", 2.99, "2026-01-03", 6), ...monthly("APPLE.COM/BILL", 2.99, "2026-01-19", 6)];
    const report = detectSubscriptions(ledgerWith(rows), { today: "2026-06-25" });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(2);
    expect(report.totals.yearly).toBeCloseTo(2.99 * 24, 1);
  });

  test("an unknown merchant on a clean monthly cadence is picked up after three payments", () => {
    const rows = monthly("ZETTLE_* LOCAL YOGA", 45, "2026-03-06", 3);
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(all(report)).toHaveLength(1);
    expect(all(report)[0].kind).toBe("subscription");
  });

  test("two payments alone at an unknown merchant are not enough", () => {
    const rows = monthly("Some Shop", 45, "2026-04-06", 2);
    expect(all(detectSubscriptions(ledgerWith(rows), { today: TODAY }))).toHaveLength(0);
  });
});

test.describe("preference resolution when streams come and go", () => {
  test("a decision follows its stream when the other stream to the payee disappears", () => {
    let state = ledgerWith([...monthly("APPLE.COM/BILL", 2.99, "2026-01-03", 5), ...monthly("APPLE.COM/BILL", 10.99, "2026-01-11", 5)]);
    const report = detectSubscriptions(state, { today: TODAY });
    const music = all(report).find((subscription) => subscription.currentPrice === 10.99)!;
    expect(music.id).toBe("apple|monthly|10.99");
    state = markSubscriptionCancelled(state, music, TODAY);
    // The 2.99 rows are deleted: only one Apple stream is left, with a base id, and it must still
    // read as cancelled — while a pref that named the 2.99 price would not.
    for (const month of Object.values(state.months)) month.expenses = month.expenses.filter((expense) => expense.amount !== 2.99);
    const again = all(detectSubscriptions(state, { today: TODAY }));
    expect(again).toHaveLength(1);
    expect(again[0].id).toBe("apple|monthly");
    expect(again[0].status).toBe("cancelled");
  });

  test("a decision made about one price never lands on a sibling at another price", () => {
    let state = ledgerWith([...monthly("APPLE.COM/BILL", 2.99, "2026-01-03", 5), ...monthly("APPLE.COM/BILL", 10.99, "2026-01-11", 5)]);
    const icloud = all(detectSubscriptions(state, { today: TODAY })).find((subscription) => subscription.currentPrice === 2.99)!;
    state = markSubscriptionCancelled(state, icloud, TODAY);
    for (const month of Object.values(state.months)) month.expenses = month.expenses.filter((expense) => expense.amount !== 2.99);
    const report = detectSubscriptions(state, { today: TODAY });
    expect(report.subscriptions).toHaveLength(1);
    expect(report.subscriptions[0].currentPrice).toBe(10.99);
    expect(report.subscriptions[0].status).toBe("active");
    // The cancelled iCloud plan is still remembered on the cancelled list.
    expect(report.cancelled.map((subscription) => subscription.label)).toContain("APPLE.COM/BILL");
  });
});

test.describe("reported edge cases — flexible order values are not a price change", () => {
  test("a meal kit ordered in different box sizes each time is not flagged with price changes", () => {
    // Gousto/HelloFresh-style: the same three box prices, revisited in no particular (non-cyclical)
    // order — not a price that keeps stepping up and down, and not three coincidental quarterly
    // subscriptions at three different prices either.
    const [small, medium, large] = [29.99, 44.99, 54.99];
    const order = [small, medium, large, small, small, medium, large, medium, small, large, medium, large];
    const rows = monthly("Gousto", order, "2025-10-07", 12, { category: "Food" });
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const gousto = find(report, "gousto")!;
    expect(gousto).toBeTruthy();
    expect(gousto.kind).toBe("subscription");
    expect(gousto.amountPattern).toBe("variable");
    expect(gousto.priceChanges).toHaveLength(0);
    expect(gousto.flaggedIncrease).toBeNull();
  });

  test("a weekly meal kit with varying box sizes is tracked without false price rises", () => {
    const sizes = [24.99, 34.99, 44.99];
    const rows = everyNDays("Hellofresh", 0, "2026-01-05", 7, 10).map((row, index) => ({ ...row, amount: sizes[(index * 2 + 1) % sizes.length], category: "Food" }));
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const hellofresh = find(report, "hellofresh")!;
    expect(hellofresh).toBeTruthy();
    expect(hellofresh.cadence).toBe("weekly");
    expect(hellofresh.kind).toBe("subscription");
    expect(hellofresh.priceChanges).toHaveLength(0);
  });

  test("a promo that applied for a few months and then reverted is still a simple fixed price", () => {
    const rows = monthly("Gym Plus", [30, 30, 30, 20, 20, 30, 30, 30], "2025-10-05", 8, { category: "Health" });
    const gym = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "gym plus")!;
    expect(gym.amountPattern).toBe("fixed");
    expect(gym.priceChanges.length).toBeLessThanOrEqual(2);
  });

  test("amountPatternOf itself: oscillating between a few values is variable, not fixed", () => {
    expect(amountPatternOf([29.99, 54.99, 44.99, 29.99, 44.99, 54.99, 29.99, 54.99, 44.99, 29.99])).toBe("variable");
    expect(amountPatternOf([10.99, 10.99, 10.99, 12.99, 12.99, 12.99])).toBe("fixed");
    expect(amountPatternOf([10, 10, 10, 8, 8, 10, 10, 10])).toBe("fixed"); // one round trip is still a simple change
  });

  test("a weekly shop with an amount that happens to repeat a little is still not a subscription", () => {
    const amounts = [62.4, 58.9, 71.2, 58.9, 64.8, 71.2, 66.1, 58.9, 63.2, 71.2, 65.4, 62.8];
    const rows = amounts.map((amount, index) => ({ name: "TESCO STORES 2041", amount, date: shiftIsoDate("2026-01-07", index * 7), category: "Food" }));
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(find(report, "tesco")).toBeUndefined();
  });
});

test.describe("reported edge cases — one-off purchases at a subscription's payee", () => {
  test("occasional movie rentals at a different price do not register as a subscription or a cancellation", () => {
    const rows: Row[] = [
      { name: "Amazon Prime", amount: 95, date: "2024-07-14" },
      { name: "Amazon Prime", amount: 95, date: "2025-07-14" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-09-02" },
      { name: "Amazon Prime", amount: 3.49, date: "2025-11-20" },
      ...monthly("Netflix", 10.99, "2026-01-15", 5),
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const prime = find(report, "amazon prime")!;
    expect(prime).toBeTruthy();
    expect(prime.cadence).toBe("annual");
    expect(prime.currentPrice).toBe(95);
    expect(prime.status).toBe("active");
    // The rentals neither became their own entry nor a cancelled one.
    expect(all(report).filter((subscription) => subscription.key === "amazon prime")).toHaveLength(1);
    expect(report.cancelled).toHaveLength(0);
  });

  test("two one-off purchases of a known subscription merchant, a month apart, are not enough on their own", () => {
    const rows: Row[] = [
      { name: "Amazon Prime", amount: 4.99, date: "2026-02-02" },
      { name: "Amazon Prime", amount: 4.99, date: "2026-03-04" },
    ];
    expect(all(detectSubscriptions(ledgerWith(rows), { today: TODAY }))).toHaveLength(0);
  });

  test("a one-off purchase landing near a subscription's due date does not get absorbed as a price drop", () => {
    // A monthly Amazon Prime-style subscription at 8.99, with an unrelated 4.99 purchase landing
    // right around the next due date. The subscription keeps its own price; the 4.99 is not folded in.
    const rows: Row[] = [...monthly("Amazon Prime", 8.99, "2026-01-09", 4), { name: "Amazon Prime", amount: 4.99, date: "2026-05-10" }];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const prime = find(report, "amazon prime")!;
    expect(prime).toBeTruthy();
    expect(prime.currentPrice).toBe(8.99);
    expect(prime.occurrences).toBe(4);
    expect(prime.priceChanges).toHaveLength(0);
  });
});

test.describe("reported edge cases — storefront one-offs must not reach the cancelled list", () => {
  // A real annual Prime membership, two years of it, beside the rentals in each scenario.
  const membership: Row[] = [
    { name: "Amazon Prime", amount: 95, date: "2024-07-14" },
    { name: "Amazon Prime", amount: 95, date: "2025-07-14" },
    ...monthly("Netflix", 10.99, "2026-01-15", 5, { category: "Subscriptions" }),
  ];
  const onlyPrime = (report: ReturnType<typeof detectSubscriptions>) => {
    const prime = all(report).filter((subscription) => subscription.key === "amazon prime");
    expect(prime).toHaveLength(1);
    expect(prime[0]).toMatchObject({ cadence: "annual", currentPrice: 95, status: "active" });
    expect(report.cancelled).toHaveLength(0);
  };

  test("two rentals six months apart at one price, two at another, are not two half-yearly plans", () => {
    const rows: Row[] = [
      ...membership,
      { name: "Amazon Prime", amount: 4.99, date: "2025-03-08" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-09-06" },
      { name: "Amazon Prime", amount: 3.49, date: "2025-05-20" },
      { name: "Amazon Prime", amount: 3.49, date: "2025-11-23" },
    ];
    onlyPrime(detectSubscriptions(ledgerWith(rows), { today: TODAY }));
  });

  test("two rentals a year apart at the same price are not a yearly plan", () => {
    const rows: Row[] = [...membership, { name: "Amazon Prime", amount: 4.99, date: "2024-12-21" }, { name: "Amazon Prime", amount: 4.99, date: "2025-12-20" }, { name: "Amazon Prime", amount: 3.49, date: "2025-06-02" }];
    onlyPrime(detectSubscriptions(ledgerWith(rows), { today: TODAY }));
  });

  test("two rentals a year apart at different prices are not a yearly plan that went up", () => {
    const rows: Row[] = [...membership, { name: "Amazon Prime", amount: 4.99, date: "2024-12-21" }, { name: "Amazon Prime", amount: 5.99, date: "2025-12-20" }];
    onlyPrime(detectSubscriptions(ledgerWith(rows), { today: TODAY }));
  });

  test("three rentals on similar days in a row, then nothing, are not a cancelled monthly plan", () => {
    const rows: Row[] = [
      ...membership,
      { name: "Amazon Prime", amount: 4.99, date: "2025-06-14" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-07-12" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-08-15" },
      { name: "Amazon Prime", amount: 3.49, date: "2025-10-03" },
    ];
    onlyPrime(detectSubscriptions(ledgerWith(rows), { today: TODAY }));
  });

  test("rentals with a month skipped are not a plan either", () => {
    const rows: Row[] = [
      ...membership,
      { name: "Amazon Prime", amount: 4.99, date: "2025-05-14" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-06-13" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-08-15" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-09-14" },
    ];
    onlyPrime(detectSubscriptions(ledgerWith(rows), { today: TODAY }));
  });

  test("but a membership that went up between its only two renewals is still found when it is all the payee is paid for", () => {
    const rows: Row[] = [{ name: "Amazon Prime", amount: 95, date: "2024-07-14" }, { name: "Amazon Prime", amount: 99, date: "2025-07-14" }];
    const prime = find(detectSubscriptions(ledgerWith(rows), { today: TODAY }), "amazon prime")!;
    expect(prime).toBeTruthy();
    expect(prime.priceChanges).toHaveLength(1);
  });

  test("a short-lived Netflix trial that stopped after two months is still a cancellation", () => {
    // Unambiguous seller, nothing else bought there: two months then silence is a real cancellation.
    const rows: Row[] = [...monthly("Netflix", 10.99, "2025-09-15", 2, { category: "Subscriptions" }), ...monthly("Spotify", 10.99, "2026-01-19", 5, { category: "Subscriptions" })];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(report.cancelled.map((subscription) => subscription.key)).toEqual(["netflix"]);
  });

  test("a membership with three renewals that then lapsed is still a cancellation, rentals or not", () => {
    const rows: Row[] = [
      { name: "Amazon Prime", amount: 95, date: "2022-07-14" },
      { name: "Amazon Prime", amount: 95, date: "2023-07-14" },
      { name: "Amazon Prime", amount: 95, date: "2024-07-14" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-03-08" },
      { name: "Amazon Prime", amount: 3.49, date: "2025-11-23" },
      ...monthly("Netflix", 10.99, "2026-01-15", 5, { category: "Subscriptions" }),
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(report.cancelled.map((subscription) => [subscription.key, subscription.currentPrice])).toEqual([["amazon prime", 95]]);
  });

  test("a well-evidenced Apple plan that stopped is still a cancellation", () => {
    const rows: Row[] = [...monthly("APPLE.COM/BILL", 2.99, "2025-06-03", 6), { name: "APPLE.COM/BILL", amount: 1.99, date: "2025-08-20" }, ...monthly("Netflix", 10.99, "2026-01-15", 5)];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(report.cancelled.map((subscription) => subscription.key)).toEqual(["apple"]);
  });

  test("a user's own cancelled flag is never dropped as weak", () => {
    let state = ledgerWith([...membership, { name: "Amazon Prime", amount: 4.99, date: "2024-12-21" }, { name: "Amazon Prime", amount: 4.99, date: "2025-12-20" }]);
    const prime = find(detectSubscriptions(state, { today: TODAY }), "amazon prime")!;
    state = markSubscriptionCancelled(state, prime, TODAY);
    const report = detectSubscriptions(state, { today: TODAY });
    expect(report.cancelled.map((subscription) => subscription.currentPrice)).toEqual([95]);
  });
});

test.describe("reported edge cases — a payee renames itself", () => {
  test("a merchant descriptor and price changing together is one subscription, not a cancellation and a new one", () => {
    const rows: Row[] = [...monthly("Spotify", 11.99, "2025-09-19", 5, { category: "Subscriptions" }), ...monthly("Spotify P", 10.99, "2026-02-19", 4, { category: "Subscriptions" })];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const spotify = all(report).filter((subscription) => subscription.key.startsWith("spotify"));
    expect(spotify).toHaveLength(1);
    expect(spotify[0].status).toBe("active");
    expect(spotify[0].occurrences).toBe(9);
    expect(spotify[0].currentPrice).toBe(10.99);
    expect(report.cancelled).toHaveLength(0);
    expect(spotify[0].notes.some((note) => note.includes("Spotify") && note.includes("Spotify P"))).toBe(true);
  });

  test("a rename is not invented for two genuinely different, unrelated payees", () => {
    const rows: Row[] = [...monthly("Sky", 45, "2025-09-03", 5, { category: "Bills" }), ...monthly("Skype Credit", 10, "2026-02-11", 4)];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(all(report).some((subscription) => subscription.key === "sky" && subscription.occurrences !== 5)).toBe(false);
    expect(all(report).filter((subscription) => subscription.key === "sky" || subscription.key === "skype credit")).toHaveLength(2);
  });

  test("a rename is not invented across a big, implausible price jump", () => {
    const rows: Row[] = [...monthly("Joe's Gym", 20, "2025-09-05", 5, { category: "Health" }), ...monthly("Joe's Gym Premium", 95, "2026-02-07", 4, { category: "Health" })];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(all(report).filter((subscription) => subscription.key.startsWith("joe"))).toHaveLength(2);
  });

  test("overlapping (still concurrent) similarly-named payees are never merged", () => {
    // Both keep being paid after the "rename" point would be — they are not sequential, so two
    // genuinely different plans with similar names stay separate.
    const rows: Row[] = [...monthly("Virgin Media", 45, "2025-09-03", 9, { category: "Bills" }), ...monthly("Virgin Mobile", 20, "2025-11-11", 7, { category: "Bills" })];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    expect(all(report).filter((subscription) => subscription.key === "virgin media" || subscription.key === "virgin mobile")).toHaveLength(2);
  });
});

test.describe("merchantKeysSimilar", () => {
  test("catches a short suffix or prefix added to the same name", () => {
    expect(merchantKeysSimilar("spotify", "spotify p")).toBe(true);
    expect(merchantKeysSimilar("netflix", "netflix uk")).toBe(true);
    expect(merchantKeysSimilar("apple", "apple")).toBe(true);
  });

  test("does not match unrelated payees that merely share a prefix", () => {
    expect(merchantKeysSimilar("sky", "skype")).toBe(false); // too short to trust a bare prefix
    expect(merchantKeysSimilar("virgin media", "virgin mobile")).toBe(false); // diverges early, not a suffix/prefix of each other
    expect(merchantKeysSimilar("joes gym", "joes gym premium")).toBe(false); // suffix too long relative to the name
  });
});

test.describe("reported edge cases — several subscriptions at the same price", () => {
  test("two Apple subscriptions at the identical price on different days are both found", () => {
    const rows = [...monthly("APPLE.COM/BILL", 2.99, "2026-01-03", 5), ...monthly("APPLE.COM/BILL", 2.99, "2026-01-19", 5)];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(2);
    expect(new Set(apple.map((subscription) => subscription.id)).size).toBe(2);
    expect(apple.every((subscription) => subscription.currentPrice === 2.99)).toBe(true);
    expect(apple.every((subscription) => subscription.siblings === 1)).toBe(true);
    expect(report.totals.yearly).toBeCloseTo(2.99 * 24, 1);
  });

  test("the same pair with only three months of history each is still told apart", () => {
    const rows = [...monthly("APPLE.COM/BILL", 2.99, "2026-02-03", 3), ...monthly("APPLE.COM/BILL", 2.99, "2026-02-19", 3)];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(2);
  });

  test("two plans that started in different months (ragged overlap) are still told apart", () => {
    // The second plan only began a couple of months in, so not every month has two payments.
    const rows = [...monthly("APPLE.COM/BILL", 2.99, "2025-11-03", 7), ...monthly("APPLE.COM/BILL", 2.99, "2026-02-19", 4)];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const apple = all(report).filter((subscription) => subscription.key === "apple");
    expect(apple).toHaveLength(2);
    expect(apple.map((subscription) => subscription.occurrences).sort()).toEqual([4, 7]);
  });
});

test.describe("all four reported bugs together in one ledger", () => {
  test("a realistic mixed year gets every call right at once", () => {
    const [small, medium, large] = [28.99, 39.99, 49.99];
    const order = [small, medium, large, small, small, medium, large, medium, small, large, medium, large];
    const rows: Row[] = [
      // 1. A meal kit with varying order sizes — should read as one subscription, no price flags.
      ...monthly("Gousto", order, "2025-10-07", 12, { category: "Food" }),
      // 2. A real annual Amazon Prime membership, plus unrelated one-off rentals at other prices.
      { name: "Amazon Prime", amount: 95, date: "2024-07-14" },
      { name: "Amazon Prime", amount: 95, date: "2025-07-14" },
      { name: "Amazon Prime", amount: 4.99, date: "2025-10-02" },
      { name: "Amazon Prime", amount: 3.49, date: "2026-01-20" },
      // 3. Spotify renames its own descriptor in the same month the price changes.
      ...monthly("Spotify", 11.99, "2025-09-19", 5, { category: "Subscriptions" }),
      ...monthly("Spotify P", 10.99, "2026-02-19", 4, { category: "Subscriptions" }),
      // 4. Two separate Apple subscriptions, same price, different billing days.
      ...monthly("APPLE.COM/BILL", 2.99, "2025-09-03", 10),
      ...monthly("APPLE.COM/BILL", 2.99, "2025-09-19", 10),
      // Noise that must stay out of the picture entirely.
      ...everyNDays("TESCO STORES 2041", 0, "2026-01-07", 7, 12).map((row, index) => ({ ...row, amount: 40 + ((index * 17) % 45), category: "Food" })),
    ];
    const report = detectSubscriptions(ledgerWith(rows), { today: TODAY });
    const all_ = all(report);

    const gousto = all_.find((s) => s.key.includes("gousto"))!;
    expect(gousto).toBeTruthy();
    expect(gousto.priceChanges).toHaveLength(0);
    expect(gousto.kind).toBe("subscription");

    const prime = all_.filter((s) => s.key === "amazon prime");
    expect(prime).toHaveLength(1);
    expect(prime[0].cadence).toBe("annual");
    expect(prime[0].currentPrice).toBe(95);

    const spotify = all_.filter((s) => s.key.startsWith("spotify"));
    expect(spotify).toHaveLength(1);
    expect(spotify[0].occurrences).toBe(9);
    expect(spotify[0].status).toBe("active");

    const apple = all_.filter((s) => s.key === "apple");
    expect(apple).toHaveLength(2);
    expect(apple.every((s) => s.currentPrice === 2.99)).toBe(true);

    expect(all_.some((s) => s.key === "tesco")).toBe(false);
    expect(report.cancelled).toHaveLength(0);
    expect(report.totals.increasesCount).toBe(0);
  });
});

test.describe("undated manual entries", () => {
  test("a manual expense repeated in consecutive months without dates is monthly", () => {
    const state = createInitialState();
    state.months = {};
    for (const monthKey of ["2026-03", "2026-04", "2026-05", "2026-06"]) {
      state.months[monthKey] = { incomes: [], expenses: [{ id: `g-${monthKey}`, name: "Gym", category: "Health", amount: 32, color: "#1", recurring: true }], note: "" };
    }
    const report = detectSubscriptions(state, { today: TODAY });
    const gym = find(report, "gym")!;
    expect(gym).toBeTruthy();
    expect(gym.cadence).toBe("monthly");
    expect(gym.yearlyCost).toBe(384);
    expect(gym.status).toBe("active");
  });
});
