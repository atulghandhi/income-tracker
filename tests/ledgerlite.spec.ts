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

  test("reorders income by drag, keyboard and the automatic orders", async ({ page }) => {
    await openLedger(page);
    await addIncome(page, "Amazon refund", 12);
    await addIncome(page, "Salary", 2400);
    await addIncome(page, "Amazon refund", 30);
    await addIncome(page, "Side gig", 50);
    const sources = () => inputValues(page, "input[aria-label='Income source']");
    const amounts = () => inputValues(page, ".incomeRow input[aria-label='Income amount']");

    await page.locator(".incomeRow").nth(1).locator(".dragHandle").dragTo(page.locator(".incomeRow").nth(0), { targetPosition: { x: 200, y: 4 } });
    await expect.poll(sources).toEqual(["Salary", "Amazon refund", "Amazon refund", "Side gig"]);

    await page.locator(".incomeRow").nth(3).locator(".dragHandle").focus();
    await page.keyboard.press("ArrowUp");
    await expect.poll(sources).toEqual(["Salary", "Amazon refund", "Side gig", "Amazon refund"]);
    await expect(page.locator(".incomeRow").nth(2).locator(".dragHandle")).toBeFocused();

    const order = page.getByLabel("Order income by");
    await order.selectOption("amount");
    await expect.poll(amounts).toEqual(["2400", "50", "30", "12"]);
    await order.selectOption("name");
    await expect.poll(sources).toEqual(["Salary", "Side gig", "Amazon refund", "Amazon refund"]);

    // Dragging from an automatic order keeps what was on screen, applies the move, and switches to custom.
    // Moved rows replay their entry animation; let them settle before dragging.
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
    const lastRow = page.locator(".incomeRow").nth(3);
    const lastBox = await lastRow.boundingBox();
    await page.locator(".incomeRow").nth(1).locator(".dragHandle").dragTo(lastRow, { targetPosition: { x: 200, y: (lastBox?.height ?? 40) - 4 } });
    await expect.poll(sources).toEqual(["Salary", "Amazon refund", "Amazon refund", "Side gig"]);
    await expect(order).toHaveValue("custom");
  });

  test("renaming one of several same-named transactions offers to rename them all", async ({ page }) => {
    await openLedger(page);
    await addExpense(page, "Coffee", 3);
    await addExpense(page, "Coffee", 4);
    await addExpense(page, "Lunch", 9);
    const expenseNames = () => inputValues(page, "input[aria-label='Expense name']");

    const first = page.locator("input[aria-label='Expense name']").first();
    await first.fill("Costa");
    await first.press("Enter");
    const prompt = page.getByRole("dialog", { name: "Rename every “Coffee”?" });
    await expect(prompt).toContainText("1 other expense across 1 month is also called “Coffee”.");
    await prompt.getByRole("button", { name: /Just this one/ }).click();
    await expect(prompt).toHaveCount(0);
    await expect.poll(expenseNames).toEqual(expect.arrayContaining(["Costa", "Coffee", "Lunch"]));

    const second = page.locator("input[aria-label='Expense name']").nth(1);
    await expect(second).toHaveValue("Coffee");
    await second.fill("Costa");
    await second.blur();
    // Only one other "Coffee" existed and it was renamed by hand, so nothing else to offer.
    await expect(page.getByRole("dialog", { name: /Rename every/ })).toHaveCount(0);

    await page.locator("input[aria-label='Expense name']").first().fill("Costa Coffee");
    await page.locator("input[aria-label='Expense name']").first().press("Enter");
    const again = page.getByRole("dialog", { name: "Rename every “Costa”?" });
    await again.getByRole("button", { name: /Rename all to “Costa Coffee”/ }).click();
    await expect.poll(expenseNames).toEqual(expect.arrayContaining(["Costa Coffee", "Costa Coffee", "Lunch"]));

    await openView(page, "Settings");
    await expect(page.getByRole("button", { name: "Remove rename rule Costa" })).toBeVisible();
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

  test("loans stay out of card utilization and 0% months count down as time passes", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 10) });
    await page.goto("/");
    await addDebtAccount(page, { name: "Visa Classic", balance: 1200, limit: 3000, apr: 19.9, promoMonths: 12, payment: 75, dueDay: 12 });

    const editor = page.locator(".accountEditorPanel");
    await editor.getByLabel("Account kind").selectOption("debt");
    await editor.getByLabel("Account type").selectOption("loan");
    // A loan has no limit to use up, so the editor does not ask for one.
    await expect(editor.getByLabel("Credit limit")).toHaveCount(0);
    await editor.getByLabel("Account name").fill("Car loan");
    await editor.getByLabel("Current balance").fill("8000");
    await editor.getByLabel("Interest rate (APR) %").fill("6.9");
    await editor.getByLabel("Monthly payment").fill("250");
    await editor.getByLabel("Payment due day").fill("5");
    await editor.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByLabel("Balance for Car loan")).toHaveValue("8000");
    await expect(page.getByLabel("Credit limit for Car loan")).toHaveCount(0);

    // Only the card counts: 1,200 / 3,000 = 40%, however large the loan is.
    await expect(page.locator(".summaryStrip").getByText("40%")).toBeVisible();
    await expect(page.getByText(/0% until October 2027/)).toBeVisible();
    await expect(page.getByText(/pay £100\/mo to clear it before then/)).toBeVisible();

    // Two months later the same card shows 10 months left without any edits, and the £150
    // already paid lowers what it takes to clear the rest in time: £1,050 / 10.
    await page.clock.runFor(2000); // let the debounced save land before reloading
    await page.clock.setSystemTime(new Date(2026, 11, 10));
    await page.reload();
    await openView(page, "Accounts");
    await expect(page.getByLabel("Promo months for Visa Classic")).toHaveValue("10");
    await expect(page.getByText(/pay £105\/mo to clear it before then/)).toBeVisible();
    // The end date stays put while the count falls.
    await expect(page.getByText(/0% until October 2027/)).toBeVisible();
    await expect(page.getByLabel("Credit limit for Car loan")).toHaveCount(0);
    await expect(page.locator(".summaryStrip").getByText("35%")).toBeVisible();
  });

  test("debt payments appear in the ledger and a statement import replaces them without duplicates", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 10) });
    await page.goto("/");
    await addDebtAccount(page, { name: "HSBC credit card", balance: 1200, limit: 3000, apr: 22.9, promoMonths: 0, payment: 100, dueDay: 12 });
    const editor = page.locator(".accountEditorPanel");
    await editor.getByLabel("Account kind").selectOption("debt");
    await editor.getByLabel("Account type").selectOption("loan");
    await editor.getByLabel("Account name").fill("Car loan");
    await editor.getByLabel("Current balance").fill("8000");
    await editor.getByLabel("Interest rate (APR) %").fill("6.9");
    await editor.getByLabel("Monthly payment").fill("500");
    await editor.getByLabel("Payment due day").fill("5");
    await editor.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByLabel("Balance for Car loan")).toHaveValue("8000");

    // Both reminders are offered from the accounts themselves.
    await expect(page.getByRole("link", { name: "Add Car loan to Google Calendar" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add HSBC credit card to Google Calendar" })).toBeVisible();

    await openView(page, "Ledger");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["HSBC credit card payment", "Car loan payment"]),
    );
    await expect(page.locator(".plannedBadge")).toHaveCount(2);

    await uploadCsv(
      page,
      [
        "Date,Description,Debit,Credit",
        "05/10/2026,BLACK HORSE FINANCE,500.00,",
        "13/10/2026,223231 HSBCBANKPLC,101.34,",
        "14/10/2026,Tesco Express,40.00,",
      ].join("\r\n"),
    );
    const dialog = page.getByRole("dialog", { name: "bank.csv" });
    await expect(dialog.getByText(/Your Car loan payment/)).toBeVisible();
    // Name, amount and due date all agree, so the card payment is confident enough to skip review.
    await dialog.getByRole("button", { name: /matched your rules/ }).click();
    await expect(dialog.getByText(/Your HSBC credit card payment/)).toBeVisible();
    await dialog.getByRole("button", { name: /^Import \d/ }).click();
    await expect(dialog).toHaveCount(0);

    // The planned rows gave way to the real payments: no doubles, and the card shows what was paid.
    await expect(page.locator(".plannedBadge")).toHaveCount(0);
    const names = await inputValues(page, "input[aria-label='Expense name']");
    expect(names).not.toContain("Car loan payment");
    expect(names).not.toContain("HSBC credit card payment");
    expect(names.length).toBe(3);
    await expect(page.getByLabel("Counts as a payment towards HSBC credit card")).toHaveCount(1);
    await expect(page.getByLabel("Counts as a payment towards Car loan")).toHaveCount(1);

    // Next month: the planned rows are back at the planned amounts, and the same bank text now
    // links by the rule the first import learned, even for a much bigger card payment.
    await page.clock.runFor(2000);
    await page.clock.setSystemTime(new Date(2026, 10, 10));
    await page.reload();
    await openView(page, "Ledger");
    await expect(page.locator(".plannedBadge")).toHaveCount(2);
    await uploadCsv(page, ["Date,Description,Debit,Credit", "12/11/2026,223231 HSBCBANKPLC,250.00,"].join("\r\n"));
    await page.getByRole("dialog", { name: "bank.csv" }).getByRole("button", { name: /^Import \d/ }).click();
    await expect(page.locator(".plannedBadge")).toHaveCount(1);
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain("Car loan payment");
    await expect.poll(async () => (await inputValues(page, "input[aria-label='Expense name']")).length).toBe(2);
  });

  test("goals follow their savings account and only share money not already going into accounts", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 10) });
    await openLedger(page);
    await addIncome(page, "Salary", 2000);

    await openView(page, "Accounts");
    const editor = page.locator(".accountEditorPanel");
    await editor.getByLabel("Account kind").selectOption("savings");
    await editor.getByLabel("Account name").fill("Vanguard ISA");
    await editor.getByLabel("Current balance").fill("4000");
    await editor.getByLabel("Monthly contribution").fill("300");
    await editor.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByLabel("Balance for Vanguard ISA")).toHaveValue("4000");

    await openView(page, "Goals");
    // £2,000 surplus, but £300 of it already goes into the ISA every month.
    await expect(page.getByLabel("Monthly surplus for goals")).toHaveValue("1700");
    await expect(page.getByText(/after £300\/mo already going into your accounts/)).toBeVisible();

    await page.getByRole("button", { name: "New goal" }).click();
    await page.getByLabel("Goal name").fill("House deposit");
    await page.getByLabel(/^Target/).fill("10000");
    await page.getByLabel("Saved in").selectOption({ label: "Vanguard ISA · £4,000" });
    // The saved amount now follows the account instead of a typed number.
    await expect(page.getByLabel(/^Already saved/)).toHaveValue("4000");
    await expect(page.getByLabel(/^Already saved/)).toHaveAttribute("readonly", "");
    await expect(page.locator(".goalCardStat").filter({ hasText: "From account" })).toContainText("£300/mo");
    // The ISA money now funds the goal, so it no longer counts as "going elsewhere".
    await expect(page.getByText(/already going into your accounts/)).toHaveCount(0);

    // Changing the balance on Accounts updates the goal.
    await openView(page, "Accounts");
    await page.getByLabel("Balance for Vanguard ISA").fill("4500");
    await openView(page, "Goals");
    await expect(page.locator(".goalCardStat").filter({ hasText: "Saved" }).first()).toContainText("£4,500");

    // A transfer row in the ledger is linked to the ISA rather than counted on top of it.
    await openView(page, "Ledger");
    await addExpense(page, "Transfer to Vanguard ISA", 300);
    await expect(page.getByLabel("Counts as money into Vanguard ISA")).toHaveCount(1);
    await openView(page, "Goals");
    await expect(page.getByLabel("Monthly surplus for goals")).toHaveValue("1700");
  });

  test("every transaction belongs to an account and moves its balance", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 10) });
    await page.goto("/");
    await openView(page, "Accounts");
    const editor = page.locator(".accountEditorPanel");
    await editor.getByLabel("Account kind").selectOption("cash");
    await editor.getByLabel("Account name").fill("Monzo");
    await editor.getByLabel("Current balance").fill("1000");
    await editor.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByLabel("Balance for Monzo")).toHaveValue("1000");
    await editor.getByLabel("Account kind").selectOption("debt");
    await editor.getByLabel("Account name").fill("Amex");
    await editor.getByLabel("Current balance").fill("0");
    await editor.getByLabel("Credit limit").fill("3000");
    await editor.getByRole("button", { name: "Add account" }).click();
    await expect(page.getByLabel("Balance for Amex")).toHaveValue("0");

    await openView(page, "Ledger");
    const panel = page.locator(".ledgerAccountsPanel");
    await addExpense(page, "Tesco", 40);
    // New spending goes to the default account, and its balance moves straight away.
    await expect(page.getByRole("button", { name: "Tesco is in Monzo. Move to the next account" })).toBeVisible();
    await expect(panel.getByRole("button", { name: /^Monzo/ })).toContainText("£960");

    // Clicking the dot moves it (and its money) to the card, with a short toast naming the account.
    await page.getByRole("button", { name: "Tesco is in Monzo. Move to the next account" }).click();
    await expect(page.locator(".accountToast")).toHaveText("Amex");
    await expect(page.locator(".accountToast")).toHaveCount(0, { timeout: 3000 });
    await expect(panel.getByRole("button", { name: /^Monzo/ })).toContainText("£1,000");
    await expect(panel.getByRole("button", { name: /^Amex/ })).toContainText("£40");

    // Statement rows all go to the account picked for the file. (Rows dated before a balance was
    // typed are already in it, so only ones from today on move it.)
    await uploadCsv(page, ["Date,Description,Debit,Credit", "10/10/2026,Pret A Manger,10.00,"].join("\r\n"));
    const dialog = page.getByRole("dialog", { name: "bank.csv" });
    await dialog.getByLabel("Account these transactions belong to").selectOption({ label: "Amex" });
    await dialog.getByRole("button", { name: /^Import \d/ }).click();
    await expect(panel.getByRole("button", { name: /^Amex/ })).toContainText("£50");

    // Category groups no longer carry a colour dot of their own.
    await expect(page.locator(".expenseGroupHeader .swatch")).toHaveCount(0);

    // Balances are read-only here: clicking one offers the Accounts page.
    await panel.getByRole("button", { name: /^Monzo/ }).click();
    await panel.getByRole("dialog", { name: "Go to accounts page?" }).getByRole("button", { name: "Go" }).click();
    await expect(page.getByLabel("Balance for Monzo")).toHaveValue("1000");
    await expect(page.getByLabel("Balance for Amex")).toHaveValue("50");
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
