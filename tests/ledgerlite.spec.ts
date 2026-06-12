import { expect, test, type Page } from "@playwright/test";

async function inputValues(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function addExpense(page: Page, name: string, amount: number) {
  await page.locator(".panel.expense .addRow input[placeholder='Expense name']").fill(name);
  await page.locator(".panel.expense .addRow .moneyInput input").fill(String(amount));
  await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
  await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain(name);
}

async function uploadCsv(page: Page, csv: string) {
  await page.locator('input[accept="text/csv,.csv"]').setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
}

test.describe("FinanceTracker", () => {
  test("starts empty in GBP, changes currency, groups expenses by drag-drop, masks amounts, and persists after reload", async ({ page }, testInfo) => {
    await page.goto("/");
    const monthLabels = await page.evaluate(() => {
      const date = new Date();
      const formatter = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
      return {
        current: formatter.format(new Date(date.getFullYear(), date.getMonth(), 1)),
        next: formatter.format(new Date(date.getFullYear(), date.getMonth() + 1, 1)),
      };
    });

    await expect(page).toHaveTitle("FinanceTracker Local Ledger");
    await expect(page.getByRole("heading", { name: "FinanceTracker" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Income" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Annual projection" })).toBeVisible();
    await expect(page.getByText("Start with income")).toBeVisible();
    await expect(page.getByText("Add a few expenses")).toBeVisible();
    await expect(page.locator(".panel.income .panelHeader")).toContainText("£0");
    await expect(page.getByLabel("Currency")).toHaveValue("GBP");
    await page.getByLabel("Currency").selectOption("USD");
    await expect(page.locator(".panel.income .panelHeader")).toContainText("$0");
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toHaveLength(0);
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toHaveLength(0);

    await page.keyboard.press("/");
    await expect(page.getByLabel("Search transactions")).toBeFocused();
    await page.getByLabel("Search transactions").fill("empty search");
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Search transactions")).toHaveValue("");
    await page.locator(".pageHeader").click();
    await page.keyboard.press("n");
    await expect(page.locator(".panel.income .addRow input[placeholder='Add income source']")).toBeFocused();
    await page.locator(".pageHeader").click();
    await page.keyboard.press("Alt+ArrowRight");
    await expect(page.getByText(monthLabels.next)).toBeVisible();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.getByText(monthLabels.current)).toBeVisible();

    await page.locator(".panel.income .addRow input[placeholder='Add income source']").fill("QA bonus");
    await page.locator(".panel.income .addRow .moneyInput input").fill("250");
    await page.locator(".panel.income .addRow .moneyInput input").press("Enter");
    await expect(page.locator(".panel.income .addRow input[placeholder='Add income source']")).toBeFocused();
    await expect(page.locator(".panel.income .addRow input[placeholder='Add income source']")).toHaveValue("");

    await page.locator(".panel.expense .addRow input[placeholder='Expense name']").fill("QA coffee");
    await page.locator(".panel.expense .addRow .moneyInput input").fill("45");
    await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
    await expect(page.locator(".panel.expense .addRow input[placeholder='Expense name']")).toBeFocused();
    await expect(page.locator(".panel.expense .addRow input[placeholder='Expense name']")).toHaveValue("");

    await page.locator(".panel.expense .addRow input[placeholder='Expense name']").fill("QA lunch");
    await page.locator(".panel.expense .addRow .moneyInput input").fill("18");
    await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
    await expect(page.locator(".panel.expense .addRow input[placeholder='Expense name']")).toBeFocused();

    await page.locator(".panel.expense .addRow input[placeholder='Expense name']").fill("QA hosting");
    await page.locator(".panel.expense .addRow .moneyInput input").fill("12");
    await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
    await expect(page.locator(".panel.expense .addRow input[placeholder='Expense name']")).toBeFocused();

    await page.locator(".panel.expense .addRow input[placeholder='Expense name']").fill("QA taxi");
    await page.locator(".panel.expense .addRow .moneyInput input").fill("7");
    await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
    await expect(page.locator(".panel.expense .addRow input[placeholder='Expense name']")).toBeFocused();

    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("QA bonus");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["QA coffee", "QA lunch", "QA hosting", "QA taxi"]),
    );

    if (testInfo.project.name !== "mobile-chrome") {
      const hostingRow = page.locator('[data-expense-name="QA hosting"]');
      const coffeeRow = page.locator('[data-expense-name="QA coffee"]');
      const coffeeBox = await coffeeRow.boundingBox();
      expect(coffeeBox).not.toBeNull();
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await hostingRow.dispatchEvent("dragstart", { dataTransfer });
      await coffeeRow.dispatchEvent("dragover", { dataTransfer, clientY: coffeeBox!.y + 2 });
      await expect(coffeeRow).toHaveClass(/dropBefore/);
      await hostingRow.dispatchEvent("dragend", { dataTransfer });

      await page
        .locator('[data-expense-name="QA hosting"]')
        .dragTo(page.locator('[data-expense-name="QA coffee"]'), { targetPosition: { x: 20, y: 4 } });
      await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(["QA hosting", "QA coffee", "QA lunch", "QA taxi"]);
    }

    if (testInfo.project.name === "mobile-chrome") {
      await page.getByRole("button", { name: "Select QA lunch for grouping" }).click();
      await page.getByRole("button", { name: "Select QA coffee for grouping" }).click();
    } else {
      await page
        .getByRole("button", { name: "Select QA lunch for grouping" })
        .dragTo(page.getByRole("button", { name: "Select QA coffee for grouping" }));
    }
    await page.getByLabel("Category name").fill("Food");
    await page.getByLabel("Category name").blur();
    await expect(page.getByText("2 expenses")).toBeVisible();
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toContain("Food");

    await page.getByRole("button", { name: "Collapse Food category" }).click();
    await expect(page.getByRole("button", { name: "Expand Food category" })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-expense-name="QA coffee"]')).toHaveCount(0);
    await expect(page.getByText("2 expenses")).toBeVisible();
    await page.getByRole("button", { name: "Expand Food category" }).click();
    await expect(page.getByRole("button", { name: "Collapse Food category" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-expense-name="QA coffee"]')).toHaveCount(1);

    if (testInfo.project.name !== "mobile-chrome") {
      const hostingRow = page.locator('[data-expense-name="QA hosting"]');
      const coffeeRow = page.locator('[data-expense-name="QA coffee"]');
      const coffeeBox = await coffeeRow.boundingBox();
      expect(coffeeBox).not.toBeNull();
      const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
      await hostingRow.dispatchEvent("dragstart", { dataTransfer });
      await coffeeRow.dispatchEvent("dragover", { dataTransfer, clientY: coffeeBox!.y + 2 });
      await expect(coffeeRow).not.toHaveClass(/dropBefore|dropAfter/);
      await expect(page.locator(".expenseGroup.categoryDropTarget")).toHaveCount(1);
      await hostingRow.dispatchEvent("dragend", { dataTransfer });

      await hostingRow.dragTo(coffeeRow, { targetPosition: { x: 20, y: 4 } });
      await expect(page.getByText("3 expenses")).toBeVisible();
      await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(["QA coffee", "QA lunch", "QA hosting", "QA taxi"]);

      await page.locator('[data-expense-name="QA taxi"]').click({ button: "right" });
      await expect(page.getByRole("menu", { name: "Move QA taxi to category" })).toBeVisible();
      await page.getByRole("menuitem", { name: "Move to Food" }).click();
      await expect(page.getByText("4 expenses")).toBeVisible();
      await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(["QA coffee", "QA lunch", "QA hosting", "QA taxi"]);
    }

    await page.getByRole("button", { name: "Delete Food category" }).click();
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toHaveLength(0);
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["QA coffee", "QA lunch", "QA hosting", "QA taxi"]),
    );

    if (testInfo.project.name === "mobile-chrome") {
      await page.getByRole("button", { name: "Select QA lunch for grouping" }).click();
      await page.getByRole("button", { name: "Select QA coffee for grouping" }).click();
    } else {
      await page
        .getByRole("button", { name: "Select QA lunch for grouping" })
        .dragTo(page.getByRole("button", { name: "Select QA coffee for grouping" }));
    }
    await page.getByLabel("Category name").fill("Food");
    await page.getByLabel("Category name").blur();
    await expect(page.getByText("2 expenses")).toBeVisible();
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toContain("Food");

    await page.getByRole("button", { name: "Hide amounts" }).click();
    await expect(page.getByRole("button", { name: "Show amounts" })).toBeVisible();
    await page.waitForTimeout(700);

    await page.reload();
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("QA bonus");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["QA coffee", "QA lunch", "QA hosting", "QA taxi"]),
    );
    await expect(page.getByText("2 expenses")).toBeVisible();
    await expect(page.getByLabel("Currency")).toHaveValue("USD");
    await expect(page.getByRole("button", { name: "Show amounts" })).toBeVisible();
  });

  test("sorts category sections by total and category items by amount", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Desktop context menu and exact row ordering are covered here.");
    await page.goto("/");

    await addExpense(page, "Food low", 10);
    await addExpense(page, "Food high", 90);
    await addExpense(page, "Home rent", 300);
    await addExpense(page, "Home bills", 80);
    await addExpense(page, "Food snack", 120);

    await page.getByRole("button", { name: "Select Food low for grouping" }).click();
    await page.getByRole("button", { name: "Select Food high for grouping" }).click();
    await page.locator("input[aria-label='Category name']").fill("Food");
    await page.locator("input[aria-label='Category name']").blur();

    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual([
      "Food high",
      "Food low",
      "Home rent",
      "Home bills",
      "Food snack",
    ]);

    await page.getByRole("button", { name: "Select Home bills for grouping" }).click();
    await page.getByRole("button", { name: "Select Home rent for grouping" }).click();
    await page.locator("input[aria-label='Category name']").first().fill("Home");
    await page.locator("input[aria-label='Category name']").first().blur();

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

  test("caps the expenses list and keeps page scroll outside it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chrome", "Wheel routing is desktop-specific here.");
    await page.goto("/");

    for (let index = 1; index <= 12; index += 1) {
      await addExpense(page, `Long expense ${index}`, index * 5);
    }

    const expenseList = page.locator(".expenseGroups");
    await expect.poll(() =>
      expenseList.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
      })),
    ).toMatchObject({
      clientHeight: 640,
      overflowY: "auto",
    });
    await expect.poll(() => expenseList.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    const listBox = await expenseList.boundingBox();
    expect(listBox).not.toBeNull();
    await page.mouse.move(listBox!.x + listBox!.width / 2, listBox!.y + listBox!.height / 2);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => expenseList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    const listScrollTop = await expenseList.evaluate((element) => element.scrollTop);
    await page.mouse.move(Math.max(20, listBox!.x - 120), listBox!.y + 80);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await expect.poll(() => expenseList.evaluate((element) => element.scrollTop)).toBe(listScrollTop);
  });

  test("reviews CSV transactions, imports selected rows, and undoes the import", async ({ page }) => {
    await page.goto("/");
    const csvYearMonth = await page.evaluate(() => ({
      year: new Date().getFullYear(),
      month: String(new Date().getMonth() + 1).padStart(2, "0"),
    }));
    await page.getByRole("button", { name: "Settings" }).click();

    await uploadCsv(
      page,
      [
        "Date,Description,Debit,Credit",
        `21/${csvYearMonth.month}/${csvYearMonth.year},Tesco Express,23.50,`,
        `22/${csvYearMonth.month}/${csvYearMonth.year},Pret A Manger,8.40,`,
        `23/${csvYearMonth.month}/${csvYearMonth.year},ACME Payroll,,2500.00`,
        `24/${csvYearMonth.month}/${csvYearMonth.year},Transfer to savings,200.00,`,
      ].join("\n"),
    );

    await expect(page.getByRole("dialog", { name: "bank.csv" })).toBeVisible();
    await expect(page.getByLabel("Import Tesco Express")).toBeChecked();
    await expect(page.getByLabel("Import Transfer to savings")).not.toBeChecked();
    await page.getByLabel("Category for Pret A Manger").fill("Work lunch");
    await page.getByRole("button", { name: "Import selected" }).click();

    await expect(page.getByRole("dialog", { name: "bank.csv" })).toHaveCount(0);
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("ACME Payroll");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["Tesco Express", "Pret A Manger"]),
    );
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toEqual(expect.arrayContaining(["Food", "Work lunch"]));

    await page.getByRole("button", { name: "Undo import" }).click();
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).not.toContain("ACME Payroll");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).not.toContain("Tesco Express");
  });

  test("adds a credit card account without changing monthly income tracking", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Accounts" }).click();

    await page.getByLabel("Debt account name").fill("Visa Classic");
    await page.getByLabel("Debt balance").fill("1200");
    await page.getByLabel("Credit limit").fill("3000");
    await page.getByLabel("Debt APR").fill("19.9");
    await page.getByLabel("Interest-free months").fill("12");
    await page.getByLabel("Monthly payment").fill("75");
    await page.getByLabel("Payment due day").fill("12");
    await page.getByRole("button", { name: "Add account" }).click();

    await expect(page.getByLabel("Balance for Visa Classic")).toHaveValue("1200");
    await expect(page.getByLabel("Interest-free months for Visa Classic")).toHaveValue("12");
    await expect(page.getByLabel("Monthly payment for Visa Classic")).toHaveValue("75");
    await expect(page.getByText("40% used")).toBeVisible();
    await expect(page.locator(".accountsGrid").getByRole("heading", { name: "Net worth outlook" })).toHaveCount(0);
    await expect(page.locator(".panel.income .panelHeader")).toHaveCount(0);

    await page.getByRole("button", { name: "Ledger" }).click();
    await expect(page.getByRole("heading", { name: "Income" })).toBeVisible();
    await expect(page.getByText("Start with income")).toBeVisible();

    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.locator(".flowPanel").getByRole("heading", { name: "Net worth outlook" })).toBeVisible();
    await page.locator(".flowPanel").getByRole("button", { name: "5 years" }).click();
    await expect(page.locator(".flowPanel").getByRole("button", { name: "5 years" })).toHaveClass(/selected/);
    await page.locator(".flowPanel").getByRole("button", { name: "2 years" }).click();
    await expect(page.locator(".flowPanel").getByRole("button", { name: "2 years" })).toHaveClass(/selected/);
    await expect(page.getByRole("heading", { name: "Accounts and imports" })).toBeVisible();
    await expect(page.getByText("£1,200")).toBeVisible();
  });

  test("explains health score, flags financial anomalies, and switches insight charts", async ({ page }) => {
    await page.goto("/");

    await page.locator(".panel.income .addRow input[placeholder='Add income source']").fill("Salary");
    await page.locator(".panel.income .addRow .moneyInput input").fill("2000");
    await page.locator(".panel.income .addRow .moneyInput input").press("Enter");
    await addExpense(page, "Rent", 1700);
    await addExpense(page, "Food", 600);

    await page.getByRole("button", { name: "Accounts" }).click();
    await page.getByLabel("Debt account name").fill("Everyday Visa");
    await page.getByLabel("Debt balance").fill("2850");
    await page.getByLabel("Credit limit").fill("3000");
    await page.getByLabel("Debt APR").fill("24.9");
    await page.getByLabel("Interest-free months").fill("0");
    await page.getByLabel("Monthly payment").fill("50");
    await page.getByLabel("Payment due day").fill("18");
    await page.getByRole("button", { name: "Add account" }).click();

    await page.getByRole("button", { name: "Insights" }).click();
    await expect(page.getByRole("heading", { name: "Health score" })).toBeVisible();
    await expect(page.getByText("Estimated credit score")).toBeVisible();
    await page.getByLabel("How health score is calculated").hover();
    await expect(page.getByText("Calculated from income cover")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Inflows vs outflows" })).toBeVisible();
    await page.getByRole("button", { name: "Cash flow volatility" }).click();
    await expect(page.getByRole("heading", { name: "Cash flow volatility" })).toBeVisible();
    await page.getByRole("button", { name: "Net worth outlook" }).click();
    await expect(page.getByRole("heading", { name: "Net worth outlook" })).toBeVisible();
    await page.locator(".chartPanel").getByRole("button", { name: "5 years" }).click();
    await expect(page.locator(".chartPanel").getByRole("button", { name: "5 years" })).toHaveClass(/selected/);
    await page.getByRole("button", { name: "Inflows vs outflows" }).click();
    await expect(page.getByRole("heading", { name: "Inflows vs outflows" })).toBeVisible();

    await expect(page.getByText("Outflow is higher than income")).toBeVisible();
    await expect(page.getByText("Card utilisation over 90%")).toBeVisible();
    await expect(page.getByText("Overall credit utilisation over 80%")).toBeVisible();
    await expect(page.getByText("Grouping coverage")).toHaveCount(0);
    await page.getByLabel("Card utilisation over 90% context").hover();
    await expect(page.getByText("Very high utilisation can drag down")).toBeVisible();
  });
});
