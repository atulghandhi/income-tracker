import { expect, test } from "@playwright/test";
import { defaultLayout, starterLayout } from "../src/layout";
import { recommendWidgets } from "../src/widgetRecs";

const empty = {
  hasIncomeAndSpending: false,
  debtCount: 0,
  goalCount: 0,
  recurringCount: 0,
  accountCount: 0,
  monthsWithData: 0,
  salaryEntered: false,
  hasRetirementAccount: false,
  signalCount: 0,
};

test.describe("Starter dashboard and widget suggestions", () => {
  test("a new user's dashboard has just the basic widgets; the full default is unchanged", () => {
    expect(starterLayout("dashboard", "GB").widgets.map((widget) => widget.id)).toEqual(["snapshot", "cash-flow", "spending-pace", "categories"]);
    expect(defaultLayout("dashboard", "GB").widgets.length).toBeGreaterThan(starterLayout("dashboard", "GB").widgets.length);
  });

  test("nothing is suggested before there is data", () => {
    expect(recommendWidgets(empty)).toEqual([]);
  });

  test("suggestions follow what the ledger holds, with the reason", () => {
    const recs = recommendWidgets({ ...empty, debtCount: 2, recurringCount: 1, goalCount: 1, monthsWithData: 2 });
    expect(recs.map((rec) => rec.id)).toEqual(["debt-overview", "payoff", "subscriptions", "goals", "month-compare", "chart"]);
    expect(recs[0].reason).toBe("You've added 2 debts");
    expect(recs.find((rec) => rec.id === "subscriptions")?.reason).toBe("1 recurring payment found");
  });

  test("income and spending unlock the health score and savings rate", () => {
    expect(recommendWidgets({ ...empty, hasIncomeAndSpending: true }).map((rec) => rec.id)).toEqual(["health", "savings-rate"]);
  });
});
