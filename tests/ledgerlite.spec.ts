import { expect, test, type Page } from "@playwright/test";

// Core ledger behaviour in the app shell: keyboard-first entry, quick add,
// grouping, CSV review, accounts and insights. Skips the marketing landing and
// the first-run wizard so each test starts on an empty dashboard.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
  });
});

const INCOME_SOURCE = ".panel.income .addRow input[placeholder='Income source, e.g. Salary']";
const INCOME_AMOUNT = ".panel.income .addRow .moneyInput input";
const EXPENSE_NAME = ".panel.expense .addRow input[placeholder='What did you spend on?']";
const EXPENSE_AMOUNT = ".panel.expense .addRow .moneyInput input";

async function inputValues(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function openView(page: Page, name: "Dashboard" | "Ledger" | "Accounts" | "Goals" | "Insights" | "Settings") {
  await page.locator(".sideNav").getByRole("button", { name, exact: true }).click();
}

async function openLedger(page: Page) {
  await page.goto("/");
  await openView(page, "Ledger");
  await expect(page.locator(INCOME_SOURCE)).toBeVisible();
}

async function addIncome(page: Page, source: string, amount: number) {
  await page.locator(INCOME_SOURCE).fill(source);
  await page.locator(INCOME_AMOUNT).fill(String(amount));
  await page.locator(INCOME_AMOUNT).press("Enter");
  await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain(source);
}

async function addExpense(page: Page, name: string, amount: number) {
  await page.locator(EXPENSE_NAME).fill(name);
  await page.locator(EXPENSE_AMOUNT).fill(String(amount));
  await page.locator(EXPENSE_AMOUNT).press("Enter");
  await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain(name);
}

async function groupExpenses(page: Page, first: string, second: string, category: string) {
  await page.getByRole("button", { name: `Select ${first} for grouping` }).click();
  await page.getByRole("button", { name: `Select ${second} for grouping` }).click();
  const nameInput = page.locator("input[aria-label='Category name']").first();
  await nameInput.fill(category);
  await nameInput.blur();
  await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toContain(category);
}

async function uploadCsv(page: Page, csv: string) {
  await page.locator('input[accept="text/csv,.csv,.ofx,.qif,.txt"]').setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
}

async function addDebtAccount(
  page: Page,
  account: { name: string; balance: number; limit: number; apr: number; promoMonths: number; payment: number; dueDay: number },
) {
  await openView(page, "Accounts");
  await page.getByLabel("Account kind").selectOption("debt");
  await page.getByLabel("Account name").fill(account.name);
  await page.getByLabel("Current balance").fill(String(account.balance));
  await page.getByLabel("Credit limit").fill(String(account.limit));
  await page.getByLabel("Interest rate (APR) %").fill(String(account.apr));
  await page.getByLabel("Promo months").fill(String(account.promoMonths));
  await page.getByLabel("Monthly payment").fill(String(account.payment));
  await page.getByLabel("Payment due day").fill(String(account.dueDay));
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByLabel(`Balance for ${account.name}`)).toHaveValue(String(account.balance));
}

test.describe("Ledger", () => {
  test("Enter adds an entry and puts the cursor back in the first field", async ({ page }) => {
    await openLedger(page);
    await expect(page.getByText("Start with income")).toBeVisible();

    // Enter on the name with no amount moves to the amount field.
    await page.locator(INCOME_SOURCE).fill("QA bonus");
    await page.locator(INCOME_SOURCE).press("Enter");
    await expect(page.locator(INCOME_AMOUNT)).toBeFocused();

    // Enter on the amount adds the entry and returns focus to the name, cleared.
    await page.locator(INCOME_AMOUNT).fill("250");
    await page.locator(INCOME_AMOUNT).press("Enter");
    await expect(page.locator(INCOME_SOURCE)).toBeFocused();
    await expect(page.locator(INCOME_SOURCE)).toHaveValue("");
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("QA bonus");

    // Same rhythm for expenses, several in a row without touching the mouse.
    for (const [name, amount] of [["QA coffee", "45"], ["QA lunch", "18"], ["QA hosting", "12"]] as const) {
      await page.locator(EXPENSE_NAME).fill(name);
      await page.locator(EXPENSE_NAME).press("Enter");
      await expect(page.locator(EXPENSE_AMOUNT)).toBeFocused();
      await page.locator(EXPENSE_AMOUNT).fill(amount);
      await page.locator(EXPENSE_AMOUNT).press("Enter");
      await expect(page.locator(EXPENSE_NAME)).toBeFocused();
      await expect(page.locator(EXPENSE_NAME)).toHaveValue("");
    }
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["QA coffee", "QA lunch", "QA hosting"]),
    );

    // The name field is a plain Enter-to-add when both fields are filled.
    await page.locator(EXPENSE_NAME).fill("QA taxi");
    await page.locator(EXPENSE_AMOUNT).fill("7");
    await page.locator(EXPENSE_NAME).press("Enter");
    await expect(page.locator(EXPENSE_NAME)).toBeFocused();
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain("QA taxi");

    // Quick add: one line, Enter, cursor stays for the next line.
    const quickAdd = page.getByLabel("Quick add transaction");
    await quickAdd.fill("costa 4.35");
    await quickAdd.press("Enter");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain("Costa");
    await expect(quickAdd).toBeFocused();
    await expect(quickAdd).toHaveValue("");
    await quickAdd.fill("salary 1200 recurring");
    await quickAdd.press("Enter");
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("Salary");

    // Privacy mode and everything else survive a reload.
    await page.getByRole("button", { name: "Hide amounts" }).click();
    await expect(page.getByRole("button", { name: "Show amounts" })).toBeVisible();
    await page.waitForTimeout(700);
    // domcontentloaded: the app renders from localStorage immediately, and the dev
    // server's `load` event can lag under a full-suite run.
    await page.reload({ waitUntil: "domcontentloaded" });
    await openView(page, "Ledger");
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toEqual(expect.arrayContaining(["QA bonus", "Salary"]));
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["QA coffee", "QA lunch", "QA hosting", "QA taxi", "Costa"]),
    );
    await expect(page.getByRole("button", { name: "Show amounts" })).toBeVisible();
  });

  test("changes currency from settings and reflects it in the ledger totals", async ({ page }) => {
    await openLedger(page);
    await expect(page.locator(".panel.income .panelHeader")).toContainText("£0");
    await openView(page, "Settings");
    await page.getByLabel("Settings currency").selectOption("USD");
    await openView(page, "Ledger");
    await expect(page.locator(".panel.income .panelHeader")).toContainText("$0");
    // The ledger saves on a debounce; give it a moment before the reload.
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openView(page, "Ledger");
    await expect(page.locator(".panel.income .panelHeader")).toContainText("$0");
  });

  test("groups expenses into a category, collapses it, moves rows in, and deletes it", async ({ page }) => {
    await openLedger(page);
    await addExpense(page, "QA coffee", 45);
    await addExpense(page, "QA lunch", 18);
    await addExpense(page, "QA hosting", 12);
    await addExpense(page, "QA taxi", 7);

    await groupExpenses(page, "QA lunch", "QA coffee", "Food");
    await expect(page.getByText("2 expenses")).toBeVisible();

    await page.getByRole("button", { name: "Collapse Food category" }).click();
    await expect(page.getByRole("button", { name: "Expand Food category" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-expense-name="QA coffee"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Expand Food category" }).click();
    await expect(page.locator('[data-expense-name="QA coffee"]')).toHaveCount(1);

    await page.locator('[data-expense-name="QA taxi"]').click({ button: "right" });
    await expect(page.getByRole("menu", { name: "Move QA taxi to category" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Move to Food" }).click();
    await expect(page.getByText("3 expenses")).toBeVisible();

    await page.getByRole("button", { name: "Delete Food category" }).click();
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toHaveLength(0);
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["QA coffee", "QA lunch", "QA hosting", "QA taxi"]),
    );
  });

  test("sorts category sections by total and category items by amount", async ({ page }) => {
    await openLedger(page);
    await addExpense(page, "Food low", 10);
    await addExpense(page, "Food high", 90);
    await addExpense(page, "Home rent", 300);
    await addExpense(page, "Home bills", 80);
    await addExpense(page, "Food snack", 120);

    await groupExpenses(page, "Food low", "Food high", "Food");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual([
      "Food high",
      "Food low",
      "Home rent",
      "Home bills",
      "Food snack",
    ]);

    await groupExpenses(page, "Home bills", "Home rent", "Home");
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toEqual(["Home", "Food"]);
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual([
      "Home rent",
      "Home bills",
      "Food high",
      "Food low",
      "Food snack",
    ]);

    await page.locator('[data-expense-name="Food snack"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to Food" }).click();
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toEqual(["Home", "Food"]);
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual([
      "Home rent",
      "Home bills",
      "Food snack",
      "Food high",
      "Food low",
    ]);
  });

  test("reviews CSV transactions, imports selected rows, and undoes the import", async ({ page }) => {
    await openLedger(page);
    const csvYearMonth = await page.evaluate(() => ({
      year: new Date().getFullYear(),
      month: String(new Date().getMonth() + 1).padStart(2, "0"),
    }));

    await uploadCsv(
      page,
      [
        "Date,Description,Debit,Credit",
        `21/${csvYearMonth.month}/${csvYearMonth.year},Tesco Express,23.50,`,
        `22/${csvYearMonth.month}/${csvYearMonth.year},Pret A Manger,8.40,`,
        `23/${csvYearMonth.month}/${csvYearMonth.year},ACME Payroll,,2500.00`,
        `24/${csvYearMonth.month}/${csvYearMonth.year},Transfer to savings,200.00,`,
      ].join("\r\n"),
    );

    const dialog = page.getByRole("dialog", { name: "bank.csv" });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel("Import Tesco Express")).toBeChecked();
    await expect(page.getByLabel("Import Transfer to savings")).not.toBeChecked();
    await page.getByLabel("Category for Pret A Manger").fill("Work lunch");
    await dialog.getByRole("button", { name: /^Import \d/ }).click();

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("ACME Payroll");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["Tesco Express", "Pret A Manger"]),
    );
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toEqual(expect.arrayContaining(["Food", "Work lunch"]));

    await page.getByRole("button", { name: "Undo import" }).click();
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).not.toContain("ACME Payroll");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).not.toContain("Tesco Express");
  });

  test("adds a credit card account and shows it on the dashboard outlook", async ({ page }) => {
    await page.goto("/");
    await addDebtAccount(page, { name: "Visa Classic", balance: 1200, limit: 3000, apr: 19.9, promoMonths: 12, payment: 75, dueDay: 12 });

    await expect(page.getByLabel("Promo months for Visa Classic")).toHaveValue("12");
    await expect(page.getByLabel("Monthly payment for Visa Classic")).toHaveValue("75");
    await expect(page.getByText(/40% used/)).toBeVisible();

    await openView(page, "Ledger");
    await expect(page.getByText("Start with income")).toBeVisible();

    await openView(page, "Dashboard");
    const outlook = page.locator(".flowPanel");
    await expect(outlook.getByRole("heading", { name: "Net worth outlook" })).toBeVisible();
    const horizon = outlook.getByRole("tablist", { name: "Net worth horizon" });
    await horizon.getByRole("button", { name: "5 years" }).click();
    await expect(horizon.getByRole("button", { name: "5 years" })).toHaveClass(/selected/);
    await horizon.getByRole("button", { name: "2 years" }).click();
    await expect(horizon.getByRole("button", { name: "2 years" })).toHaveClass(/selected/);
    await expect(page.getByRole("heading", { name: "Accounts and imports" })).toBeVisible();
    await expect(page.getByText("£1,200").first()).toBeVisible();
  });

  test("explains health score, flags financial anomalies, and switches insight charts", async ({ page }) => {
    await openLedger(page);
    await addIncome(page, "Salary", 2000);
    await addExpense(page, "Rent", 1700);
    await addExpense(page, "Food", 600);
    await addDebtAccount(page, { name: "Everyday Visa", balance: 2850, limit: 3000, apr: 24.9, promoMonths: 0, payment: 50, dueDay: 18 });

    await openView(page, "Insights");
    await expect(page.getByRole("heading", { name: "Health score" })).toBeVisible();
    await expect(page.getByText("Estimated credit score")).toBeVisible();
    await page.getByLabel("How health score is calculated").hover();
    await expect(page.getByText("Calculated from income cover")).toBeVisible();

    const charts = page.getByRole("group", { name: "Insight chart" });
    await charts.getByRole("button", { name: "Cash flow volatility" }).click();
    await expect(charts.getByRole("button", { name: "Cash flow volatility" })).toHaveAttribute("aria-pressed", "true");
    await charts.getByRole("button", { name: "Net worth outlook" }).click();
    await expect(charts.getByRole("button", { name: "Net worth outlook" })).toHaveAttribute("aria-pressed", "true");
    const horizon = page.getByRole("tablist", { name: "Net worth horizon" });
    await horizon.getByRole("button", { name: "5 years" }).click();
    await expect(horizon.getByRole("button", { name: "5 years" })).toHaveClass(/selected/);
    await charts.getByRole("button", { name: "Monthly cash flow" }).click();
    await expect(charts.getByRole("button", { name: "Monthly cash flow" })).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByText("Outflow is higher than income")).toBeVisible();
    await expect(page.getByText("Card utilisation over 90%")).toBeVisible();
    await expect(page.getByText("Overall credit utilisation over 80%")).toBeVisible();
    await page.getByLabel("Card utilisation over 90% context").hover();
    await expect(page.getByText("Very high utilisation can drag down")).toBeVisible();
  });
});
