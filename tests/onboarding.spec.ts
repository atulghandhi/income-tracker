import { expect, test, type Locator, type Page } from "@playwright/test";

// First-run experience: the skippable setup wizard and the dashboard
// getting-started checklist.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Past the marketing landing, but never onboarded.
    localStorage.setItem("hasSeenLanding", "1");
  });
});

function wizard(page: Page): Locator {
  return page.getByRole("dialog", { name: "First-time setup" });
}

function dashboardHeading(page: Page): Locator {
  return page.getByLabel("Dashboard").getByRole("heading", { name: "Dashboard" });
}

test("wizard opens for a fresh user, applies entered data, and lands on a filled dashboard", async ({ page }) => {
  await page.goto("/");
  const dialog = wizard(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.getByRole("button", { name: "Get started" }).click();

  // Step 1 — income.
  await dialog.getByLabel("Salary (take-home) monthly amount").fill("2500");
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Step 2 — bills: pick two presets and price them.
  await dialog.getByRole("button", { name: "Rent / Mortgage" }).click();
  await dialog.getByRole("button", { name: "Groceries" }).click();
  await dialog.getByLabel("Rent / Mortgage monthly amount").fill("900");
  await dialog.getByLabel("Groceries monthly amount").fill("300");
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Step 3 — accounts: a savings balance.
  await dialog.getByRole("button", { name: "Savings", exact: true }).click();
  await dialog.getByLabel("Savings balance").fill("4000");
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Step 4 — goal.
  await dialog.getByLabel("Goal name").fill("Emergency fund");
  await dialog.getByLabel("Goal target amount").fill("6000");
  await dialog.getByRole("button", { name: "Continue" }).click();

  // Summary → dashboard.
  await expect(dialog.getByText("Your dashboard is ready")).toBeVisible();
  await dialog.getByRole("button", { name: "Open my dashboard" }).click();

  await expect(dashboardHeading(page)).toBeVisible();
  await expect(dialog).toBeHidden();

  // The metrics reflect the wizard's numbers: 2500 in, 1200 out.
  await expect(page.locator(".summaryStrip")).toContainText("£2,500");
  await expect(page.locator(".summaryStrip")).toContainText("£1,200");

  // Checklist ticked off everything except importing a statement.
  await expect(page.locator(".gettingStarted")).toContainText("4 of 5 done");

  // The entries landed in the ledger as editable rows.
  await page.getByRole("button", { name: "Ledger" }).click();
  await expect(page.locator("input[aria-label='Income source']").first()).toHaveValue("Salary (take-home)");
  await expect
    .poll(async () =>
      page.locator("input[aria-label='Expense name']").evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value)),
    )
    .toContain("Groceries");

  // The account and goal exist too.
  await page.getByRole("button", { name: "Accounts" }).click();
  await expect(page.getByLabel("Accounts", { exact: true }).getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(page.locator(".accountsGrid")).toContainText("Savings");

  // Reload: the wizard must not reappear.
  await page.reload();
  await expect(dashboardHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(wizard(page)).toBeHidden();
});

test("wizard can be skipped entirely and every step is individually skippable", async ({ page }) => {
  await page.goto("/");
  const dialog = wizard(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // Walk through skipping each step without entering anything.
  await dialog.getByRole("button", { name: "Get started" }).click();
  for (let i = 0; i < 4; i++) {
    await dialog.getByRole("button", { name: "Skip this step" }).click();
  }
  await expect(dialog.getByText("You're all set")).toBeVisible();
  await dialog.getByRole("button", { name: "Open my dashboard" }).click();

  // Lands on an empty dashboard with the getting-started checklist showing.
  await expect(dashboardHeading(page)).toBeVisible();
  await expect(page.locator(".gettingStarted")).toContainText("0 of 5 done");

  // Reload: still no wizard.
  await page.reload();
  await expect(dashboardHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(wizard(page)).toBeHidden();
});

test("the close button exits setup immediately and the checklist links into the app", async ({ page }) => {
  await page.goto("/");
  const dialog = wizard(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.getByRole("button", { name: "Skip setup" }).click();
  await expect(dialog).toBeHidden();
  await expect(dashboardHeading(page)).toBeVisible();

  // Checklist "Add your income" jumps to the ledger and focuses the income input.
  await page.locator(".gsItem", { hasText: "Add your income" }).click();
  await expect(page.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible();
  await expect(page.locator("#add-income-source")).toBeFocused();

  // Adding income ticks the checklist item off.
  await page.locator("#add-income-source").fill("Salary");
  await page.getByLabel("Income amount").fill("2000");
  await page.getByLabel("Income amount").press("Enter");
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.locator(".gettingStarted")).toContainText("1 of 5 done");
  await expect(page.locator(".gsItem", { hasText: "Add your income" })).toBeDisabled();

  // Dismissing the checklist hides it and it stays hidden after reload.
  // dispatchEvent instead of click: on the mobile viewport, scroll-into-view can
  // park the button under the sticky app bar / fixed bottom rail, which makes
  // hit-testing flaky even though a real user can tap it fine mid-viewport.
  await page.getByLabel("Hide getting started checklist").dispatchEvent("click");
  await expect(page.locator(".gettingStarted")).toBeHidden();
  await page.reload();
  await expect(dashboardHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".gettingStarted")).toBeHidden();
});

test("a user who already completed onboarding never sees the wizard", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("onboardingComplete", "1");
  });
  await page.goto("/");
  await expect(dashboardHeading(page)).toBeVisible({ timeout: 10_000 });
  await expect(wizard(page)).toBeHidden();
});
