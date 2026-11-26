import { expect, test } from "@playwright/test";
import { applyCalcHandoff, describeCalcHandoff, guessDebtType, parseCalcHandoff } from "../src/calcHandoff";
import { createInitialState } from "../src/finance";

// A calculator's "Save to my plan" parks its figures in localStorage and opens the matching app
// page with #calc=1; the app folds them into the ledger (src/calcHandoff.ts).

const NOW = Date.UTC(2026, 10, 26, 12);

test.describe("calculator handoff: parsing", () => {
  test("keeps well-formed debts and goals and rejects stale or empty payloads", () => {
    const parsed = parseCalcHandoff(
      {
        v: 1,
        at: NOW - 1000,
        source: "debt-snowball-vs-avalanche-calculator",
        view: "allocate",
        debts: [
          { name: "Barclaycard", balance: 2500, apr: 22.9, minPayment: 75 },
          { name: "Nothing owed", balance: 0, apr: 10, minPayment: 10 },
          { name: "<b>Car finance</b>", balance: "6000", apr: 8.9, minPayment: 150, type: "rocket" },
        ],
        extra: 100,
        priority: "quick-wins",
      },
      NOW,
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.view).toBe("allocate");
    expect(parsed!.debts.map((debt) => debt.name)).toEqual(["Barclaycard", "<b>Car finance</b>"]);
    expect(parsed!.debts[0].type).toBe("credit-card");
    expect(parsed!.debts[1].type).toBe("auto-loan");
    expect(parsed!.debts[1].balance).toBe(6000);
    expect(parsed!.extra).toBe(100);
    expect(parsed!.priority).toBe("quick-wins");

    expect(parseCalcHandoff({ v: 1, at: NOW - 60 * 60 * 1000, debts: [{ balance: 1 }] }, NOW)).toBeNull();
    expect(parseCalcHandoff({ v: 2, at: NOW, debts: [{ balance: 1 }] }, NOW)).toBeNull();
    expect(parseCalcHandoff({ v: 1, at: NOW, debts: [] }, NOW)).toBeNull();
    expect(parseCalcHandoff({ v: 1, at: NOW, priority: "custom", view: "settings", debts: [{ balance: 5, apr: 900 }] }, NOW)).toMatchObject({
      priority: null,
      view: "dashboard",
      debts: [{ apr: 100 }],
    });
  });

  test("guesses the debt type from its name", () => {
    expect(guessDebtType("Amex")).toBe("credit-card");
    expect(guessDebtType("Overdraft")).toBe("overdraft");
    expect(guessDebtType("Personal loan")).toBe("loan");
    expect(guessDebtType("Car finance")).toBe("auto-loan");
    expect(guessDebtType("Student loan")).toBe("student-loan");
    expect(guessDebtType("Mum")).toBe("other");
  });
});

test.describe("calculator handoff: applying to the ledger", () => {
  test("adds debts, sets the plan and updates rather than duplicates on a second save", () => {
    const ledger = createInitialState("GB");
    const handoff = parseCalcHandoff(
      { v: 1, at: NOW, view: "allocate", debts: [{ name: "Barclaycard", balance: 2500, apr: 22.9, minPayment: 75 }], extra: 100, priority: "interest" },
      NOW,
    )!;
    const first = applyCalcHandoff(ledger, handoff);
    expect(first.debtsAdded).toBe(1);
    const card = first.ledger.accounts.find((account) => account.name === "Barclaycard")!;
    expect(card).toMatchObject({ accountClass: "debt", type: "credit-card", balance: 2500, rate: 22.9, minimumPayment: 75 });
    expect(first.ledger.allocation.monthlyExtraOverride).toBe(100);
    expect(first.ledger.allocation.priority).toBe("interest");
    expect(describeCalcHandoff(first)).toBe("Saved 1 debt from the calculator");

    const again = applyCalcHandoff(first.ledger, { ...handoff, debts: [{ ...handoff.debts[0], name: "barclaycard ", balance: 2000 }] });
    expect(again.debtsAdded).toBe(0);
    expect(again.debtsUpdated).toBe(1);
    expect(again.ledger.accounts.filter((account) => account.accountClass === "debt")).toHaveLength(1);
    expect(again.ledger.accounts.find((account) => account.name === "Barclaycard")!.balance).toBe(2000);
  });

  test("a goal on a new ledger brings its monthly amount as the goal surplus; a salary goes to Pay", () => {
    const ledger = createInitialState("GB");
    const goal = applyCalcHandoff(ledger, parseCalcHandoff({ v: 1, at: NOW, view: "goals", goals: [{ name: "Emergency fund", target: 4500, saved: 400, monthly: 150 }] }, NOW)!);
    expect(goal.goalsAdded).toBe(1);
    expect(goal.ledger.goals[0]).toMatchObject({ name: "Emergency fund", target: 4500, saved: 400, monthlyAmount: 150, fundingMode: "fixed" });
    expect(goal.ledger.goalPlannerSurplus).toBe(150);

    const pay = applyCalcHandoff(ledger, parseCalcHandoff({ v: 1, at: NOW, view: "pay", grossSalary: 18000 }, NOW)!);
    expect(pay.salarySet).toBe(true);
    expect(pay.ledger.taxProfile.grossAnnualSalary).toBe(18000);
    expect(describeCalcHandoff(pay)).toBe("Saved your salary from the calculator");
  });
});

test.describe("calculator handoff: end to end", () => {
  test.slow();

  test("debts typed into the snowball calculator open in Allocate", async ({ page }) => {
    await page.goto(
      "/tools/debt-snowball-vs-avalanche-calculator.html?n1=Barclaycard&b1=2500&r1=22.9&p1=75&n2=Car%20finance&b2=6000&r2=8.9&p2=150&extra=100",
    );
    const save = page.locator("#calc-save");
    await expect(save).toHaveText(/Save these debts to my plan/);
    await save.click();
    await expect(page).toHaveURL(/\/allocate$/, { timeout: 20_000 });
    await expect(page.getByText("Saved 2 debts from the calculator")).toBeVisible();
    await expect(page.getByLabel("Spare each month", { exact: true })).toHaveValue("100");
    const table = page.locator(".payoffTable").first();
    await expect(table).toContainText("Barclaycard");
    await expect(table).toContainText("Car finance");
  });

  test("an empty calculator still opens the matching app page, with nothing saved", async ({ page }) => {
    await page.goto("/tools/how-long-to-save-10000-for-a-car.html");
    const save = page.locator("#calc-save");
    await expect(save).toHaveText(/Open my goals/);
    await save.click();
    await expect(page).toHaveURL(/\/goals/, { timeout: 20_000 });
    expect(await page.evaluate(() => localStorage.getItem("it_calc_handoff"))).toBeNull();
  });
});
