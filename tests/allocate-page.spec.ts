import { expect, test } from "@playwright/test";

// The Allocate page end to end: the sidebar entry and URL, the plan built from the sample ledger,
// switching priorities (and having the choice survive a reload), including a debt that is left out
// by default, and the Debt payoff plan widget on Insights and in the Dashboard tray.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("gettingStartedDismissed", "1");
  });
});

test.describe("Allocate page", () => {
  test.slow();

  test("builds a payoff plan from the sample ledger and lets the user switch priorities", async ({ page }) => {
    await page.goto("/allocate?sample=uk");
    await expect(page.getByLabel("One-off lump sum", { exact: true })).toHaveValue("2500", { timeout: 20_000 });
    await expect(page).toHaveURL(/\/allocate$/);
    const view = page.getByLabel("Allocate", { exact: true });
    await expect(view.getByRole("heading", { name: "Allocate debt and savings", exact: true })).toBeVisible();
    // Explanatory copy sits behind the "i": hover opens it, moving away closes it.
    await page.getByRole("button", { name: "About these figures" }).hover();
    await expect(page.getByRole("tooltip")).toContainText("Not financial advice");
    await page.mouse.move(10, 10);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    await expect(page.locator(".sideNav").getByRole("button", { name: "Allocate", exact: true })).toHaveAttribute("aria-pressed", "true");

    // The sample carries a £2,500 bonus and the ledger's spare-per-month figure.
    await expect(page.getByLabel("Spare each month", { exact: true })).not.toHaveValue("");
    await expect(view.getByText("From your ledger's recurring surplus.")).toBeVisible();

    // Default priority: least interest (avalanche). The 0% Barclaycard gets what its minimums
    // will not cover before the promo ends; the rest of the lump sum goes to the dearest debt.
    const headline = page.locator(".allocateHeadline");
    await expect(headline).toContainText("Least interest");
    await expect(headline).toContainText("Avalanche");
    await expect(headline).toContainText("Debt-free");
    const table = page.locator(".payoffTable").first();
    await expect(table).toContainText("Barclaycard");
    await expect(table).toContainText("Car finance");
    await expect(table.locator("tr.isExcluded")).toContainText("Student loan");
    await expect(page.getByLabel("Include Student loan in the plan")).not.toBeChecked();
    await expect(page.locator(".splitBar").first()).toContainText("Barclaycard");

    // Compare table: the minimums-only baseline plus every strategy, with the current one marked.
    const compare = page.locator(".compareTable").first();
    await expect(compare).toContainText("Minimums only");
    await expect(compare.locator("tr.isSelected")).toContainText("Least interest");
    await expect(compare.locator("tbody tr")).toHaveCount(8);

    // Switch to the snowball; the headline, the table and the persisted plan follow.
    await page.getByRole("radio", { name: /Quick wins/ }).click();
    await expect(headline).toContainText("Quick wins");
    await expect(headline).toContainText("Snowball");
    await expect(compare.locator("tr.isSelected")).toContainText("Quick wins");
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.locator(".allocateHeadline")).toContainText("Quick wins");

    // A compare row is clickable too.
    await page.locator(".compareTable tbody tr", { hasText: "Credit score recovery" }).first().click();
    await expect(page.locator(".allocateHeadline")).toContainText("Credit score recovery");
    await expect(page.locator(".allocateHeadline")).toContainText("Utilisation");
  });

  test("monthly spare can be overridden and reset, and a left-out debt can be brought into the plan", async ({ page }) => {
    await page.goto("/allocate?sample=uk");
    await expect(page.getByLabel("One-off lump sum", { exact: true })).toHaveValue("2500", { timeout: 20_000 });
    const view = page.getByLabel("Allocate", { exact: true });

    await page.getByLabel("Spare each month", { exact: true }).fill("500");
    await expect(view.getByText(/Overridden/)).toBeVisible();
    await page.getByRole("button", { name: /reset to ledger/ }).click();
    await expect(view.getByText("From your ledger's recurring surplus.")).toBeVisible();

    // Bringing the student loan in: it gets a place in the order and the debt-free date moves out.
    const before = await page.locator(".allocateHeadline .allocateMetrics > div").first().locator("strong").textContent();
    await page.getByLabel("Include Student loan in the plan").check();
    await expect(page.locator(".payoffTable").first().locator("tr.isExcluded")).toHaveCount(0);
    await expect(page.locator(".payoffTable").first()).toContainText("Student loan");
    const after = await page.locator(".allocateHeadline .allocateMetrics > div").first().locator("strong").textContent();
    expect(after).not.toBe(before);
    await page.getByLabel("Include Student loan in the plan").uncheck();
    await expect(page.locator(".payoffTable").first().locator("tr.isExcluded")).toHaveCount(1);

    // A tax bill reveals the due-in field, and "Tax bill first" funds it from the lump sum.
    await page.getByLabel("Tax bill to set aside", { exact: true }).fill("1200");
    await expect(page.getByLabel("Tax bill due in months")).toBeVisible();
    await page.getByRole("radio", { name: /Tax bill first/ }).click();
    await expect(page.locator(".splitBar").first()).toContainText("Tax reserve");

    // Custom split exposes the percentage fields.
    await page.getByRole("radio", { name: /Custom split/ }).click();
    await expect(page.getByLabel("Debts share")).toHaveValue("60");
    await expect(page.getByLabel("Debt order for the custom split")).toHaveValue("avalanche");

    // The notice and free help are always there.
    await expect(view.getByText("Information, not advice")).toBeVisible();
    await expect(view.getByRole("link", { name: /StepChange/ })).toHaveAttribute("href", /stepchange/);
  });

  test("the Debt payoff plan widget sits on Insights by default and can be added to the Dashboard", async ({ page }) => {
    await page.goto("/insights?sample=uk");
    const widget = page.locator(".payoffPanel");
    await expect(widget).toContainText("Debt payoff plan", { timeout: 20_000 });
    await expect(widget).toContainText("Least interest");
    await expect(widget).toContainText("Interest saved");
    await expect(widget).toContainText("Today: split the £2,500 lump sum");
    await expect(widget.locator(".compareTable")).toContainText("Quick wins");
    await widget.getByRole("button", { name: "Open Allocate" }).click();
    await expect(page).toHaveURL(/\/allocate$/);

    await page.locator(".sideNav").getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(page.locator(".payoffPanel")).toHaveCount(0);
    await page.getByRole("button", { name: "Customise the dashboard layout" }).click();
    await page.getByRole("button", { name: "Add Debt payoff plan widget" }).click();
    await page.getByRole("button", { name: "Finish customising the dashboard" }).click();
    await expect(page.locator(".payoffPanel")).toContainText("Debt-free");
  });

  test("a UK lump sum can be marked taxable and the tax held back is worked out from the salary band", async ({ page }) => {
    await page.goto("/allocate?sample=uk");
    await expect(page.getByLabel("One-off lump sum", { exact: true })).toHaveValue("2500", { timeout: 20_000 });
    const taxable = page.getByLabel("This lump sum is taxable");
    await expect(taxable).not.toBeChecked();
    await expect(page.getByLabel("Source of the lump sum")).toHaveCount(0);
    await page.getByRole("button", { name: "What taxable means" }).hover();
    await expect(page.getByRole("tooltip")).toContainText("Not taxable");
    await page.mouse.move(10, 10);

    await taxable.check();
    await page.getByLabel("Source of the lump sum").selectOption("other-income");
    await page.getByLabel("Monthly salary before tax").fill("2500");
    // The sample's tax profile repays a Plan 2 loan, so that is pre-filled: 20% of £2,500 in
    // income tax plus 9% of it for the loan (a £30,000 salary is already over the threshold).
    const result = page.locator(".lumpTaxResult");
    await expect(page.getByLabel("Repaying a student loan")).toBeChecked();
    await expect(page.getByLabel("Student loan Plan 2")).toBeChecked();
    await expect(result).toContainText("Set aside for tax and loan");
    await expect(result.locator(".lumpTaxHeadline strong").first()).toHaveText("£725");
    await expect(result).toContainText("Student loan (Plan 2)");
    // Ticking Plan 1 swaps the plan; adding a postgraduate loan adds 6% of £2,500.
    await page.getByLabel("Student loan Plan 1").check();
    await expect(page.getByLabel("Student loan Plan 2")).not.toBeChecked();
    await page.getByLabel("Postgraduate loan").check();
    await expect(result.locator(".lumpTaxHeadline strong").first()).toHaveText("£875");
    // Not repaying one: just the income tax.
    await page.getByLabel("Repaying a student loan").uncheck();
    await expect(page.getByLabel("Student loan Plan 1")).toHaveCount(0);
    await expect(result).toContainText("Set aside for tax");
    await expect(result.locator(".lumpTaxHeadline strong").first()).toHaveText("£500");
    await expect(result.locator(".lumpTaxHeadline strong").nth(1)).toHaveText("£2,000");
    await expect(result).toContainText("Income tax at basic rate");
    await expect(page.locator(".splitBar").first()).toContainText("Tax on the lump sum");
    await expect(page.locator(".splitBar").first()).toContainText("£500");

    // No double counting with "Tax bill first": the separate bill field says so, and the headline
    // explains that the lump-sum tax is already held back.
    await expect(page.getByText("Other tax bill to set aside")).toBeVisible();
    await page.getByRole("radio", { name: /Tax bill first/ }).click();
    await expect(page.locator(".allocateHeadline")).toContainText("already held back before anything is allocated");
    await expect(page.locator(".splitBar").first()).not.toContainText("Tax reserve");
    await page.getByRole("radio", { name: /Least interest/ }).click();

    // A higher-rate salary and earlier income move the band.
    await page.getByLabel("Monthly salary before tax").fill("5000");
    await expect(result.locator(".lumpTaxHeadline strong").first()).toHaveText("£1,000");
    await page.getByLabel("Source of the lump sum").selectOption("capital-gain");
    // £2,500 gain is inside the £3,000 exempt amount: nothing to set aside.
    await expect(result.locator(".lumpTaxHeadline strong").first()).toHaveText("£0");
    await page.getByLabel("Already received this tax year from this source").fill("3000");
    await expect(result.locator(".lumpTaxHeadline strong").first()).toHaveText("£600");

    // The choice survives a reload.
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByLabel("This lump sum is taxable")).toBeChecked();
    await expect(page.locator(".lumpTaxResult .lumpTaxHeadline strong").first()).toHaveText("£600");
  });

  test("on a touch screen a tap opens a hint and a tap anywhere else closes it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Touch behaviour only matters on the mobile project.");
    await page.goto("/allocate?sample=uk");
    await expect(page.getByLabel("One-off lump sum", { exact: true })).toHaveValue("2500", { timeout: 20_000 });
    const hint = page.getByRole("button", { name: "About these figures" });
    await hint.scrollIntoViewIfNeeded();
    await hint.tap();
    await expect(page.getByRole("tooltip")).toContainText("Not financial advice");
    // The bubble stays inside the screen.
    const box = await page.getByRole("tooltip").boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    await page.touchscreen.tap(10, (viewport?.height ?? 800) - 10);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("the US experience speaks American and points to American help", async ({ page }) => {
    await page.goto("/allocate?sample=us");
    const view = page.getByLabel("Allocate", { exact: true });
    await expect(page.getByLabel("One-off lump sum", { exact: true })).toHaveValue("4000", { timeout: 20_000 });
    await expect(page.locator(".allocateHeadline")).toContainText("Card utilization");
    await expect(view.getByRole("link", { name: /NFCC/ })).toBeVisible();
    // The deposit-protection note sits behind the destinations hint.
    await page.getByRole("button", { name: "About these destinations" }).hover();
    await expect(page.getByRole("tooltip")).toContainText(/FDIC/);
    // The taxable-lump-sum question is UK only.
    await expect(page.getByLabel("This lump sum is taxable")).toHaveCount(0);
    // The mortgage is left out by default; the card and loans are in.
    await expect(page.getByLabel("Include Mortgage in the plan")).not.toBeChecked();
    await expect(page.getByLabel("Include Federal student loan in the plan")).toBeChecked();
  });
});
