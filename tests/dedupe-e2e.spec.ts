import { expect, test, type Page } from "@playwright/test";

// The duplicate scenarios end to end: a recurring row the user keeps, then the bank statement
// that contains the same money.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("tutorialSeenPages", JSON.stringify(["ledger", "dashboard", "accounts", "goals", "settings"]));
  });
  await page.clock.install({ time: new Date(2026, 10, 10) });
  await page.goto("/");
  await page.getByRole("button", { name: "Ledger" }).click();
  await expect(page.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible({ timeout: 10_000 });
});

async function addIncome(page: Page, source: string, amount: number) {
  const before = await page.locator("input[aria-label='Income source']").count();
  await page.locator("#add-income-source").fill(source);
  await page.locator(".panel.income .addRow .moneyInput input").fill(String(amount));
  await page.locator(".panel.income .addRow .moneyInput input").press("Enter");
  await expect(page.locator("input[aria-label='Income source']")).toHaveCount(before + 1);
  await expect(page.locator("#add-income-source")).toBeFocused();
}

async function uploadCsv(page: Page, lines: string[]) {
  await page.getByLabel("Import a bank statement file").setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["Date,Description,Debit,Credit", ...lines].join("\r\n")),
  });
}

const incomeSources = (page: Page) => page.locator("input[aria-label='Income source']").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

const STATEMENT = ["05/11/2026,BGC ACME CORP LTD,,2861.20", "03/11/2026,TESCO STORES 3412,23.50,"];

test("importing a statement replaces the recurring salary instead of adding a second one, and undo puts it back", async ({ page }) => {
  await addIncome(page, "Salary", 2850);
  await expect.poll(() => incomeSources(page)).toEqual(["Salary"]);

  await uploadCsv(page, STATEMENT);
  const dialog = page.getByRole("dialog", { name: "bank.csv" });
  await expect(dialog.getByText(/Close to your planned “Salary”/)).toBeVisible();
  await expect(dialog.getByText("Replacing")).toBeVisible();
  await dialog.getByRole("button", { name: /^Import \d/ }).click();
  await expect(dialog).toHaveCount(0);

  // One salary, at the amount the bank paid, still repeating into next month.
  await expect.poll(() => incomeSources(page)).toEqual(["Salary"]);
  await expect(page.getByLabel("Income amount").first()).toHaveValue("2861.2");
  await expect(page.locator(".duplicateBanner")).toHaveCount(0);
  await page.getByLabel("Next month").click();
  await expect.poll(() => incomeSources(page)).toEqual(["Salary"]);
  await page.getByLabel("Previous month").click();

  await page.getByRole("button", { name: "Undo import" }).click();
  await expect.poll(() => incomeSources(page)).toEqual(["Salary"]);
  await expect(page.getByLabel("Income amount").first()).toHaveValue("2850");
  await expect(page.locator("input[aria-label='Expense name']")).toHaveCount(0);
});

test("keep both imports the bank row beside the planned one and the ledger does not nag about it", async ({ page }) => {
  await addIncome(page, "Salary", 2850);
  await uploadCsv(page, STATEMENT);
  const dialog = page.getByRole("dialog", { name: "bank.csv" });
  await dialog.getByRole("button", { name: /Keep BGC ACME CORP LTD and Salary as two entries/ }).click();
  await expect(dialog.getByText("Replacing")).toHaveCount(0);
  await dialog.getByRole("button", { name: /^Import \d/ }).click();

  await expect.poll(async () => (await incomeSources(page)).sort()).toEqual(["Bgc Acme Corp", "Salary"]);
  await expect(page.locator(".duplicateBanner")).toHaveCount(0);
});

test("a double already in the ledger is raised and merges into one", async ({ page }) => {
  await addIncome(page, "Salary", 2850);
  await addIncome(page, "Salary", 2850);
  const banner = page.locator(".duplicateBanner");
  await expect(banner).toContainText("is in this month twice");
  await banner.getByRole("button", { name: "Remove one" }).click();
  await expect.poll(() => incomeSources(page)).toEqual(["Salary"]);
  await expect(banner).toHaveCount(0);
});
