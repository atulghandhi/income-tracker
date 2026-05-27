import { expect, test, type Page } from "@playwright/test";

async function inputValues(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function addExpense(page: Page, name: string, amount: number) {
  await page.locator(".panel.expense .addRow input[placeholder='Expense name']").fill(name);
  await page.locator(".panel.expense .addRow .moneyInput input").fill(String(amount));
  await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
}

test.describe("FinanceTracker", () => {
  test("starts empty in GBP, changes currency, groups expenses by drag-drop, masks amounts, and persists after reload", async ({ page }, testInfo) => {
    await page.goto("/");

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
    await expect(page.getByText("June 2026")).toBeVisible();
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page.getByText("May 2026")).toBeVisible();

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
});
