import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { UI_VERSION } from "../src/uiVersion.mjs";
import { buildIncomeGroups } from "../src/ledgerGroups";
import { buildCsvExport } from "../src/finance";
import { scrubErrorMessage } from "../src/errorScrub";
import type { IncomeEntry, LedgerState } from "../src/types";

// The frame-and-canvas release: drop-anywhere import, undo, the transaction peek and the
// command bar over it, income categories, the add-row fields, the homepage hero, and the
// analytics context that lets the redesign be measured.

const INCOME_SOURCE = ".panel.income .addRow input[placeholder='Income source, e.g. Salary']";
const INCOME_AMOUNT = ".panel.income .addRow .moneyInput input";
const EXPENSE_NAME = ".panel.expense .addRow input[placeholder='What did you spend on?']";
const EXPENSE_AMOUNT = ".panel.expense .addRow .moneyInput input";

async function startApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
  });
  await page.goto("/ledger");
  await expect(page.locator(INCOME_SOURCE)).toBeVisible();
}

async function addIncome(page: Page, source: string, amount: number) {
  await page.locator(INCOME_SOURCE).fill(source);
  await page.locator(INCOME_AMOUNT).fill(String(amount));
  await page.locator(INCOME_AMOUNT).press("Enter");
  await expect(page.locator(`.incomeRow input[aria-label='Income source'][value='${source}']`).first()).toBeVisible();
}

async function addExpense(page: Page, name: string, amount: number) {
  await page.locator(EXPENSE_NAME).fill(name);
  await page.locator(EXPENSE_AMOUNT).fill(String(amount));
  await page.locator(EXPENSE_AMOUNT).press("Enter");
  await expect(page.locator(`.expenseRow[data-expense-name='${name}']`)).toBeVisible();
}

const incomeRow = (page: Page, source: string) => page.locator(".incomeRow").filter({ has: page.locator(`input[aria-label='Income source'][value='${source}']`) });
const incomeSources = (page: Page) => page.locator(".incomeRow input[aria-label='Income source']").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

async function settle(page: Page) {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)));
}

// A native drag is timing-sensitive under load, so the gesture is repeated until it takes.
async function dragUntil(page: Page, source: Locator, target: Locator, position: "middle" | "top", done: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await settle(page);
    const box = await target.boundingBox();
    const y = position === "middle" ? (box?.height ?? 40) / 2 : 4;
    await source.locator(".dragHandle").dragTo(target, { targetPosition: { x: 200, y } });
    if (await done()) return;
  }
  expect(await done()).toBe(true);
}

// A statement file dragged in from the desktop, as the browser would deliver it.
async function dropStatement(page: Page, target: Locator) {
  const csv = "Date,Description,Amount\n01/11/2026,TESCO STORES,-42.61\n02/11/2026,COSTA,-4.35\n";
  const transfer = await page.evaluateHandle((text) => {
    const data = new DataTransfer();
    data.items.add(new File([text], "statement.csv", { type: "text/csv" }));
    return data;
  }, csv);
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(page.locator(".dropOverlay")).toBeVisible();
  await target.dispatchEvent("drop", { dataTransfer: transfer });
}

test.describe("Drop a statement anywhere", () => {
  test("a file dropped on an expense row or a category imports, and the overlay goes", async ({ page }) => {
    await startApp(page);
    await addExpense(page, "Rent", 950);
    await dropStatement(page, page.locator(".expenseRow").first());
    await expect(page.locator(".dropOverlay")).toHaveCount(0);
    await expect(page.getByText("TESCO STORES").first()).toBeVisible();
  });

  test("dragging a row between categories never shows the file overlay", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "HTML5 drag and drop is a pointer feature.");
    await startApp(page);
    await addExpense(page, "Coffee", 3);
    await addExpense(page, "Lunch", 9);
    await page.locator(".expenseRow").first().locator(".dragHandle").hover();
    await page.mouse.down();
    await page.locator(".expenseRow").nth(1).hover();
    await expect(page.locator(".dropOverlay")).toHaveCount(0);
    await page.mouse.up();
  });
});

test.describe("Undo", () => {
  test("Ctrl+Z brings back a removed expense, and the toast offers it", async ({ page }) => {
    await startApp(page);
    await addExpense(page, "Gym", 32);
    await addExpense(page, "Books", 12);
    await page.locator(".expenseRow[data-expense-name='Gym']").getByRole("button", { name: "Remove expense" }).click();
    await expect(page.locator(".expenseRow[data-expense-name='Gym']")).toHaveCount(0);
    await expect(page.locator(".undoToast")).toContainText("Undo");
    await page.locator("body").press("Control+z");
    await expect(page.locator(".expenseRow[data-expense-name='Gym']")).toBeVisible();
    await expect(page.locator(".expenseRow[data-expense-name='Books']")).toBeVisible();
  });

  test("the offer lapses once something else changes the ledger", async ({ page }) => {
    await startApp(page);
    await addExpense(page, "Gym", 32);
    await page.locator(".expenseRow[data-expense-name='Gym']").getByRole("button", { name: "Remove expense" }).click();
    await addExpense(page, "Books", 12);
    await expect(page.locator(".undoToast")).toHaveCount(0);
    await page.locator("body").press("Control+z");
    await expect(page.locator(".expenseRow[data-expense-name='Gym']")).toHaveCount(0);
    await expect(page.locator(".expenseRow[data-expense-name='Books']")).toBeVisible();
  });
});

test.describe("Transaction peek", () => {
  test("keeps focus where the person put it, keeps Tab inside, and Esc returns focus", async ({ page }) => {
    await startApp(page);
    await addIncome(page, "Salary", 2400);
    const trigger = incomeRow(page, "Salary").getByRole("button", { name: "Details for Salary" });
    await trigger.click();
    const peek = page.getByRole("dialog", { name: "Salary details" });
    await expect(peek).toBeVisible();
    await expect(peek.getByRole("button", { name: "Close details" })).toBeFocused();

    await page.keyboard.press("Tab");
    const showInLedger = peek.getByRole("button", { name: /Show in ledger/ });
    await expect(showInLedger).toBeFocused();
    // Anything that re-renders the app behind the peek (here the privacy toggle) must not move focus.
    await page.evaluate(() => (document.querySelector("button[aria-label*='amounts' i], button[aria-label*='privacy' i]") as HTMLButtonElement | null)?.click());
    await page.waitForTimeout(300);
    await expect(showInLedger).toBeFocused();

    // Tab cycles inside the dialog: Close, Show in ledger, Remove, then back to Close.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(peek.getByRole("button", { name: "Close details" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(peek.getByRole("button", { name: /Remove/ })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(peek).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Esc closes the command bar opened over a peek, and leaves the peek open", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "The command bar is a keyboard feature for wide screens.");
    await startApp(page);
    await addIncome(page, "Salary", 2400);
    await incomeRow(page, "Salary").getByRole("button", { name: "Details for Salary" }).click();
    const peek = page.getByRole("dialog", { name: "Salary details" });
    await expect(peek).toBeVisible();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command bar" });
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(peek).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(peek).toHaveCount(0);
  });

  test("a peek opened from the command bar hands focus back to the command bar button", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "The command bar is a keyboard feature for wide screens.");
    await startApp(page);
    await addExpense(page, "Groceries", 61);
    await page.keyboard.press("Control+k");
    await page.keyboard.type("groc");
    await page.keyboard.press("Enter");
    const peek = page.getByRole("dialog", { name: "Groceries details" });
    await expect(peek).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(peek).toHaveCount(0);
    await expect(page.locator(".paletteButton")).toBeFocused();
  });
});

test.describe("Add rows", () => {
  test("the amount field is one filled box, with no second fill inside it", async ({ page }) => {
    await startApp(page);
    for (const selector of [INCOME_AMOUNT, EXPENSE_AMOUNT]) {
      await page.locator(selector).focus();
      await page.waitForTimeout(400); // past the focus-ring transition
      const inner = await page.locator(selector).evaluate((input) => ({ bg: getComputedStyle(input).backgroundColor, shadow: getComputedStyle(input).boxShadow }));
      expect(inner.bg).toBe("rgba(0, 0, 0, 0)");
      // No ring of its own: either none at all or a fully transparent one.
      expect(inner.shadow === "none" || inner.shadow.startsWith("rgba(0, 0, 0, 0)")).toBe(true);
    }
  });
});

test.describe("Income categories", () => {
  test("drag one income onto another to group them, onto the group to join, beside a plain row to leave", async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), "HTML5 drag and drop is a pointer feature.");
    await startApp(page);
    await addIncome(page, "Salary", 2400);
    await addIncome(page, "Freelance", 500);
    await addIncome(page, "Interest", 20);
    await addIncome(page, "Gift", 50);

    const groups = page.locator(".incomeGroup");
    await dragUntil(page, incomeRow(page, "Freelance"), incomeRow(page, "Salary"), "middle", async () => (await groups.count()) === 1);
    await expect(groups).toHaveCount(1);
    await expect(groups.locator(".incomeRow")).toHaveCount(2);
    await expect(groups.getByLabel("Income category name")).toHaveValue("New category");
    await expect(groups.locator(".expenseGroupHeader b")).toContainText("2,900");

    // Onto the group: joins it.
    await dragUntil(page, incomeRow(page, "Interest"), groups.locator(".expenseGroupHeader"), "middle", async () => (await groups.locator(".incomeRow").count()) === 3);

    // Rename it.
    const name = groups.getByLabel("Income category name");
    await name.fill("Work");
    await name.press("Enter");
    await expect(groups.getByLabel("Income category name")).toHaveValue("Work");

    // Beside an ungrouped row (its top edge): leaves the group.
    await dragUntil(page, incomeRow(page, "Interest"), incomeRow(page, "Gift"), "top", async () => (await groups.locator(".incomeRow").count()) === 2);
    await expect(page.locator(".incomeRow:not(.incomeGroup .incomeRow)")).toHaveCount(2);

    // Groups survive a reload and show in search by name.
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.locator(".incomeGroup").getByLabel("Income category name")).toHaveValue("Work");
    await page.getByLabel("Search transactions").fill("work");
    await expect.poll(() => incomeSources(page)).toEqual(["Salary", "Freelance"]);
    await page.getByLabel("Search transactions").fill("");

    // Deleting the category ungroups its incomes; undo puts the group back.
    await page.locator(".incomeGroup .expenseGroupHeader").hover();
    await page.getByRole("button", { name: "Delete Work income category" }).click();
    await expect(page.locator(".incomeGroup")).toHaveCount(0);
    await expect(page.locator(".incomeRow")).toHaveCount(4);
    await page.locator(".undoToast").getByRole("button", { name: /Undo/ }).click();
    await expect(page.locator(".incomeGroup").getByLabel("Income category name")).toHaveValue("Work");
  });

  test("grouping follows the chosen order and keeps ungrouped rows in place", () => {
    const income = (id: string, amount: number, category?: string): IncomeEntry => ({ id, source: id, amount, color: "#123456", recurring: true, category });
    const groups = buildIncomeGroups([income("a", 10), income("b", 20, "Work"), income("c", 5), income("d", 7, "Work"), income("e", 1, " ")]);
    expect(groups.map((group) => [group.category, group.items.map((item) => item.id), group.total])).toEqual([
      ["", ["a"], 10],
      ["Work", ["b", "d"], 27],
      ["", ["c"], 5],
      ["", ["e"], 1],
    ]);
  });

  test("CSV export carries the income category", () => {
    const state = {
      currency: "GBP",
      months: { "2026-11": { incomes: [{ id: "i", source: "Salary", amount: 2400, color: "#000", recurring: true, category: "Work" }], expenses: [], note: "" } },
    } as unknown as LedgerState;
    expect(buildCsvExport(state)).toContain("income,,Salary,Work,2400");
  });
});

test.describe("Homepage hero", () => {
  test("the hero window's expense column always has spending in it", async ({ page }) => {
    await page.goto("/");
    const expenses = page.locator(".lp-mp--expense");
    await expect(expenses).toContainText("Rent");
    await expect(expenses).toContainText("Groceries");
    await expect(expenses.locator(".lp-mp-sub")).not.toHaveText("0 items");
    // Through the typing loop too: it never empties the column.
    await page.waitForTimeout(2500);
    await expect(expenses).toContainText("Rent");
  });

  test("each section carries a name for scroll-depth tracking", async ({ page }) => {
    await page.goto("/");
    const sections = await page.locator("[data-section]").evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.section));
    expect(sections).toEqual(["hero", "csv", "ledger", "annual", "privacy", "banks", "compare", "resources", "faq", "closing"]);
  });
});

test.describe("Analytics context", () => {
  test("static pages send the design version, the user agent and the section", () => {
    const html = readFileSync(new URL("../public/import/barclays-csv.html", import.meta.url), "utf8");
    expect(html).toContain(`UI=${JSON.stringify(UI_VERSION)}`);
    expect(html).toContain("o.$raw_user_agent=navigator.userAgent");
    expect(html).toContain("o.section=");
  });

  test("static pages report uncaught errors, scrubbed", () => {
    const html = readFileSync(new URL("../public/tools/budget-planner-uk.html", import.meta.url), "utf8");
    expect(html).toContain('track("client_error"');
    expect(html).toContain('addEventListener("unhandledrejection"');
  });

  test("error messages lose emails, quoted values and numbers before they are sent", () => {
    expect(scrubErrorMessage(`TypeError: Cannot read "Tesco Extra" of undefined at row 42 for jo@example.com (£1,234.56)`)).toBe(
      "TypeError: Cannot read <text> of undefined at row # for <email> (£#)",
    );
    expect(scrubErrorMessage("x".repeat(400))).toHaveLength(160);
  });
});
