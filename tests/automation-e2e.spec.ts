import { expect, test, type Page } from "@playwright/test";

// End-to-end smoke coverage for the transaction-automation features
// (docs/AUTOMATION_PLAN.md stages A–B): quick add, recurring auto-seed,
// merchant memory, and the triaged import review.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("tutorialSeenPages", JSON.stringify(["ledger", "dashboard", "accounts", "goals", "insights", "settings"]));
  });
});

async function openLedger(page: Page) {
  await page.goto("/");
  // The app opens on the dashboard now; the ledger is one nav click away.
  await page.getByRole("button", { name: "Ledger" }).click();
  await expect(page.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible({ timeout: 10_000 });
}

test("quick add parses a one-line expense and files it under the suggested category", async ({ page }) => {
  await openLedger(page);

  const quickAdd = page.getByLabel("Quick add transaction");
  await quickAdd.fill("costa coffee 4.35");

  const preview = page.locator(".quickAddPreview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Costa coffee");
  await expect(preview).toContainText("Food"); // system rule: coffee → Food

  await quickAdd.press("Enter");
  await expect(page.locator("input[aria-label='Expense name']").first()).toHaveValue("Costa coffee");
});

test("recurring entries auto-seed the next month and deleting a seeded row stops the repeat", async ({ page }) => {
  await openLedger(page);

  // Add a recurring income (manual adds default to recurring).
  await page.locator("#add-income-source").fill("Salary");
  await page.getByLabel("Income amount").fill("2400");
  await page.getByLabel("Income amount").press("Enter");
  await expect(page.locator("input[aria-label='Income source']").first()).toHaveValue("Salary");

  // Forward a month: the salary should be there, with the seeded banner.
  await page.getByLabel("Next month").click();
  await expect(page.locator(".seededBanner")).toBeVisible();
  await expect(page.locator(".seededBanner")).toContainText("added automatically");
  await expect(page.locator("input[aria-label='Income source']").first()).toHaveValue("Salary");

  // Delete the seeded copy — the origin stops repeating.
  await page.locator("button[aria-label='Remove income']").first().click();
  await expect(page.locator("input[aria-label='Income source']")).toHaveCount(0);

  // A fresh month after that must not seed the stopped item.
  await page.getByLabel("Next month").click();
  await expect(page.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible();
  await expect(page.locator("input[aria-label='Income source']")).toHaveCount(0);

  // And the origin month's entry is now flagged one-off (recurring toggle off).
  await page.getByLabel("Previous month").click();
  await page.getByLabel("Previous month").click();
  await expect(page.locator("input[aria-label='Income source']").first()).toHaveValue("Salary");
  await expect(page.locator(".recurToggle.active")).toHaveCount(0);
});

test("CSV import triages rows into confidence buckets and imports them", async ({ page }) => {
  await openLedger(page);

  // Dates inside the currently-open month so the imported rows are visible
  // in the ledger without navigating.
  const monthPart = await page.evaluate(() => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  });
  await page.locator('input[accept*=".csv"]').setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Date,Description,Debit,Credit",
        `05/${monthPart},TESCO EXTRA 4261,42.61,`,
        `06/${monthPart},ACME PAYROLL,,2500.00`,
        `07/${monthPart},ZZQ UNKNOWN VENDOR 91,13.37,`,
      ].join("\n"),
    ),
  });

  // Triage buckets: Tesco (0.88) + payroll (0.92 → auto), unknown vendor lands in "need you".
  await expect(page.locator(".importBucket.auto")).toBeVisible();
  await expect(page.locator(".importBucket.auto .importBucketHeader")).toContainText("imported as-is");
  await expect(page.locator(".importBucket.needs")).toBeVisible();
  await expect(page.locator(".importBucket.needs")).toContainText("ZZQ UNKNOWN VENDOR 91");

  // The confirm button reports the review split.
  const confirm = page.locator(".importModalFooter .navCta");
  await expect(confirm).toContainText("review");
  await confirm.click();

  await expect(page.locator("input[aria-label='Expense name']").first()).toBeVisible();
  const names = await page.locator("input[aria-label='Expense name']").evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(names.join(" ")).toContain("TESCO");
});
