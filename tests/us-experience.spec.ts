import { expect, test, type Page } from "@playwright/test";

// The US experience end to end: country switch, American account types with plan details,
// employer match and contribution limits, the gross-to-net estimate, loans and medical tracking —
// plus the page URLs and the customisable dashboard that every region gets.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("gettingStartedDismissed", "1");
  });
});

async function openView(page: Page, name: "Dashboard" | "Ledger" | "Accounts" | "Pay & tax" | "Paycheck & tax" | "Goals" | "Settings") {
  await page.locator(".sideNav").getByRole("button", { name, exact: true }).click();
}

async function switchToUs(page: Page) {
  await page.goto("/");
  await page.getByLabel("Country", { exact: true }).selectOption("US");
  await expect(page.locator(".statusToast")).toContainText("US experience");
}

async function addAccount(page: Page, kind: "cash" | "savings" | "investment" | "debt", type: string, name: string, balance: number, extra?: (editor: ReturnType<Page["locator"]>) => Promise<void>) {
  const editor = page.locator(".accountEditorPanel");
  await editor.getByLabel("Account kind").selectOption(kind);
  await editor.getByLabel("Account type").selectOption(type);
  await editor.getByLabel("Account name").fill(name);
  await editor.getByLabel("Current balance").fill(String(balance));
  if (extra) await extra(editor);
  await editor.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByLabel(`Balance for ${name}`)).toHaveValue(String(balance));
}

test.describe("US experience", () => {
  // Several page loads and reloads per test on a dev server: give them room.
  test.slow();

  test("switching country swaps currency, labels and account types, and each page keeps its URL on refresh", async ({ page }) => {
    await switchToUs(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await openView(page, "Accounts");
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByLabel("Accounts", { exact: true }).getByText("checking accounts")).toBeVisible();
    const editor = page.locator(".accountEditorPanel");
    await expect(editor.getByLabel("Account kind").locator("option")).toContainText(["Checking account", "Investment / retirement"]);
    await editor.getByLabel("Account kind").selectOption("investment");
    await expect(editor.getByLabel("Account type").locator("option")).toContainText(["Taxable brokerage", "401(k)", "403(b)", "Traditional IRA", "Roth IRA", "529 college savings plan"]);
    await editor.getByLabel("Account kind").selectOption("savings");
    await expect(editor.getByLabel("Account type").locator("option")).toContainText(["High-yield savings (HYSA)", "Certificate of deposit (CD)", "Health savings account (HSA)"]);
    await editor.getByLabel("Account kind").selectOption("debt");
    await expect(editor.getByLabel("Account type").locator("option")).toContainText(["Mortgage", "Auto loan", "Student loan", "Line of credit"]);
    // The "i" beside the type explains it.
    await editor.getByLabel("Account type").selectOption("student-loan");
    await editor.getByLabel("What is a Student loan?").hover();
    // Hints open at the document root so they are never clipped by the panel they sit in.
    await expect(page.getByRole("tooltip")).toContainText(/Federal loans have fixed rates/);

    // A refresh stays on the Accounts page, still in the US experience.
    await page.waitForTimeout(1000);
    await page.reload();
    await expect(page.getByLabel("Accounts", { exact: true }).getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("US");
    await openView(page, "Ledger");
    await expect(page).toHaveURL(/\/ledger$/);
    await expect(page.locator(".panel.income .panelHeader")).toContainText("$0");
    // Browser back returns to the previous page.
    await page.goBack();
    await expect(page).toHaveURL(/\/accounts$/);
    await expect(page.getByLabel("Accounts", { exact: true }).getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    // A deep link opens the page directly.
    await page.goto("/goals");
    await expect(page.getByLabel("Goals", { exact: true }).getByRole("heading", { name: "Goals", exact: true })).toBeVisible();
    // Insights is part of the Dashboard now: an old link lands there and the address follows.
    await page.goto("/insights");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByLabel("Dashboard", { exact: true }).getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.locator(".sideNav").getByRole("button", { name: "Insights", exact: true })).toHaveCount(0);
  });

  test("a 401(k) with an employer match feeds the gross-to-net estimate, the retirement widget and the forecast", async ({ page }) => {
    await switchToUs(page);
    await openView(page, "Accounts");
    await addAccount(page, "investment", "401k", "Fidelity 401k", 25000, async (editor) => {
      await editor.getByLabel("Monthly contribution").fill("500");
    });
    // Plan details open with the type's explanation and the tax/contribution defaults.
    await page.getByRole("button", { name: "Show plan details for Fidelity 401k" }).click();
    await expect(page.getByLabel("Tax treatment for Fidelity 401k", { exact: true })).toHaveValue("pre-tax");
    await expect(page.getByLabel("Contribution source for Fidelity 401k", { exact: true })).toHaveValue("payroll");
    await expect(page.locator(".planNote")).toContainText("An employer retirement plan funded from your paycheck");
    await page.getByLabel("Employer match percent for Fidelity 401k", { exact: true }).fill("50");
    await page.getByLabel("Employer match cap for Fidelity 401k", { exact: true }).fill("6");
    // Without a salary the % of pay field waits for one.
    await expect(page.getByLabel("Contribution percent for Fidelity 401k", { exact: true })).toBeDisabled();

    // The estimator on its own page: $85,000 in Texas, paid every two weeks.
    await openView(page, "Paycheck & tax");
    await expect(page).toHaveURL(/\/pay$/);
    const estimator = page.getByLabel("Take-home pay estimator");
    await estimator.getByLabel("Gross annual salary", { exact: true }).fill("85000");
    await estimator.getByLabel("State", { exact: true }).selectOption("TX");
    await estimator.getByLabel("Pay frequency", { exact: true }).selectOption("biweekly");
    // 2026 tables: $85,000 less $6,000 of 401(k) and the $16,100 standard deduction.
    await expect(estimator.getByRole("row", { name: /Federal income tax/ })).toContainText("$8,550");
    await expect(estimator.getByRole("row", { name: /Social Security/ })).toContainText("$5,270");
    await expect(estimator.getByRole("row", { name: /Pre-tax retirement/ })).toContainText("-$6,000");
    await expect(estimator.getByRole("row", { name: /Take-home pay/ })).toContainText("$63,948");
    await expect(estimator.getByText("Per paycheck")).toBeVisible();
    await expect(estimator.getByText(/Estimate · 2026/)).toBeVisible();
    // One click turns the net figure into the month's recurring income.
    await estimator.getByRole("button", { name: /as monthly income/ }).click();
    await openView(page, "Ledger");
    await expect(page.locator("input[aria-label='Income source']").first()).toHaveValue("Salary (take-home)");
    await expect(page.locator(".panel.income .panelHeader")).toContainText("$5,329");

    // Now the salary is known: 6% of pay is $425 a month and the match is worked out.
    await openView(page, "Accounts");
    await page.getByRole("button", { name: "Show plan details for Fidelity 401k" }).click();
    await page.getByLabel("Contribution percent for Fidelity 401k", { exact: true }).fill("6");
    await expect(page.getByLabel("Monthly contribution for Fidelity 401k", { exact: true })).toHaveValue("425");
    await expect(page.getByLabel("Employer monthly contribution for Fidelity 401k", { exact: true })).toHaveValue("212.5");
    await expect(page.getByText(/You add \$425\/mo, your employer adds \$213\/mo/)).toBeVisible();
    await expect(page.getByText(/\$5,100 of \$24,500 planned this year/)).toBeVisible();
    await expect(page.locator(".summaryStrip")).toContainText("$638");

    // The dashboard widget shows the limit and the employer's share.
    await openView(page, "Dashboard");
    const retirement = page.locator(".retirementPanel");
    await expect(retirement.getByText("From your employer")).toBeVisible();
    await expect(retirement).toContainText("$213");
    await expect(retirement).toContainText("401(k) / 403(b) employee limit");
    await expect(retirement).toContainText("$5,100 / $24,500");
    // Contributing under the match cap would have been flagged; at 6% nothing is left behind.
    await expect(retirement.getByText(/free money left behind/)).toHaveCount(0);
    // The credit estimate reads on the FICO scale, and the Dashboard charts where the paycheck goes.
    await openView(page, "Dashboard");
    await expect(page.locator(".healthPanel")).toContainText("FICO");
    await expect(page.locator(".creditPanel")).toContainText("VantageScore");
    await expect(page.locator(".paycheckPanel")).toContainText("Federal income tax");
    await expect(page.locator(".paycheckPanel")).toContainText("Take-home pay");
  });

  test("federal student loans get repayment-plan estimates and medical spending tracks the deductible", async ({ page }) => {
    await switchToUs(page);
    await openView(page, "Paycheck & tax");
    await page.getByLabel("Take-home pay estimator").getByLabel("Gross annual salary", { exact: true }).fill("60000");

    await openView(page, "Accounts");
    await addAccount(page, "debt", "student-loan", "Federal loan", 18000, async (editor) => {
      await editor.getByLabel("Interest rate (APR) %").fill("5.5");
      await editor.getByLabel("Monthly payment").fill("100");
    });
    await expect(page.getByLabel("Credit limit for Federal loan")).toHaveCount(0);
    await page.getByRole("button", { name: "Show loan details for Federal loan" }).click();
    await expect(page.getByLabel("Student loan type for Federal loan", { exact: true })).toHaveValue("federal");
    // Standard plan: ten years.
    await expect(page.getByText(/Suggested payment/)).toContainText("$195");
    await page.getByLabel("Repayment plan for Federal loan", { exact: true }).selectOption("income-driven");
    await expect(page.getByText(/Suggested payment/)).toContainText("$304");
    await page.getByRole("button", { name: "Use as monthly payment" }).click();
    await expect(page.getByLabel("Monthly payment for Federal loan", { exact: true })).toHaveValue("304.38");

    // Medical: a plan with a deductible and a doctor's visit in the ledger.
    await openView(page, "Dashboard");
    const medical = page.locator(".medicalPanel");
    await medical.getByLabel("Health plan type", { exact: true }).selectOption("hdhp");
    await medical.getByLabel("Health plan deductible", { exact: true }).fill("1500");
    await medical.getByLabel("Out-of-pocket maximum", { exact: true }).fill("4000");
    await openView(page, "Ledger");
    await page.locator(".panel.expense .addRow input[placeholder='What did you spend on?']").fill("Doctor visit");
    await page.locator(".panel.expense .addRow .moneyInput input").fill("300");
    await page.locator(".panel.expense .addRow .moneyInput input").press("Enter");
    await openView(page, "Dashboard");
    await expect(medical).toContainText("$300 / $1,500");
    await expect(medical).toContainText("$1,200 to go before insurance pays its share");
    await expect(page.locator(".loansPanel")).toContainText("Federal · Income-driven");
  });

  test("the dashboard layout can be rearranged, resized, trimmed and extended, and survives a reload", async ({ page }) => {
    await switchToUs(page);
    const grid = page.getByLabel("dashboard widgets");
    const defaults = [
      "snapshot",
      "cash-flow",
      "health",
      "spending-pace",
      "savings-rate",
      "net-worth",
      "chart",
      "categories",
      "anomalies",
      "debt-overview",
      "retirement",
      "paycheck",
      "credit",
      "payoff",
      "medical",
      "loans",
      "subscriptions",
      "annual",
    ];
    const ids = () => grid.locator(".widgetCell").evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).dataset.widgetId));
    await expect.poll(ids).toEqual(defaults);

    await page.getByRole("button", { name: "Customize the dashboard layout" }).click();
    await page.getByRole("button", { name: "Remove Net worth outlook" }).click();
    await page.getByRole("button", { name: "Make Monthly snapshot narrower" }).click();
    await page.getByRole("button", { name: "Move Loans & student loans earlier" }).click();
    await page.getByRole("button", { name: "Add Goals widget" }).click();
    await page.getByRole("button", { name: "Finish customizing the dashboard" }).click();

    const edited = [...defaults.filter((id) => id !== "net-worth" && id !== "loans")];
    edited.splice(edited.indexOf("medical"), 0, "loans");
    edited.push("goals");
    await expect.poll(ids).toEqual(edited);
    await expect(grid.locator('[data-widget-id="snapshot"]')).toHaveClass(/size-l/);

    await page.reload();
    await expect.poll(ids).toEqual(edited);
    await expect(grid.locator('[data-widget-id="snapshot"]')).toHaveClass(/size-l/);

    // Reset puts the default back.
    await page.getByRole("button", { name: "Customize the dashboard layout" }).click();
    await page.getByRole("button", { name: "Reset layout" }).click();
    await expect.poll(ids).toEqual(defaults);
  });

  test("layouts saved for the old Dashboard and Insights pages are merged into one", async ({ page }) => {
    await switchToUs(page);
    // The ledger saves 240ms after a change; let the US choice land before reloading.
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("US");
    await page.evaluate(() => {
      localStorage.setItem("it_layout_dashboard_us", JSON.stringify({ version: 1, widgets: [{ id: "net-worth", size: "m" }, { id: "accounts-imports", size: "xl" }] }));
      localStorage.setItem("it_layout_insights_us", JSON.stringify({ version: 1, widgets: [{ id: "summary", size: "xl" }, { id: "health", size: "s" }, { id: "limits", size: "m" }] }));
    });
    await page.reload();
    const grid = page.getByLabel("dashboard widgets");
    const ids = () => grid.locator(".widgetCell").evaluateAll((cells) => cells.map((cell) => (cell as HTMLElement).dataset.widgetId));
    await expect.poll(ids).toEqual(["net-worth", "debt-overview", "snapshot", "health", "retirement"]);
    expect(await page.evaluate(() => localStorage.getItem("it_layout_insights_us"))).toBeNull();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem("it_layout_dashboard_us"))) ?? "{}").version).toBe(2);
  });
});

test.describe("UK parity", () => {
  test.slow();

  test("workplace pensions, ISA allowances and student-loan plans work for UK users without changing the default dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("GB");
    // The UK dashboard carries no US panels and no pension panel by default; those wait in the tray.
    const grid = page.getByLabel("dashboard widgets");
    await expect(grid.locator(".widgetCell")).toHaveCount(13);
    await expect(grid.locator('[data-widget-id="retirement"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Customise the dashboard layout" }).click();
    await expect(page.getByRole("button", { name: "Add Pensions & ISAs widget" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Medical spending widget" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add Pensions & ISAs widget" }).click();
    await page.getByRole("button", { name: "Finish customising the dashboard" }).click();

    await openView(page, "Pay & tax");
    const estimator = page.getByLabel("Take-home pay estimator");
    await estimator.getByLabel("Gross annual salary", { exact: true }).fill("40000");
    await estimator.getByLabel("Student loan plan", { exact: true }).selectOption("plan2");
    await expect(estimator.getByRole("row", { name: /Income tax/ })).toContainText("£5,486");
    await expect(estimator.getByRole("row", { name: /National Insurance/ })).toContainText("£2,194");
    await expect(estimator.getByRole("row", { name: /Student loan \(Plan 2\)/ })).toContainText("£955");
    await expect(estimator.getByRole("row", { name: /Take-home pay/ })).toContainText("£31,364");

    await openView(page, "Accounts");
    await addAccount(page, "investment", "pension", "Nest pension", 12000);
    await page.getByRole("button", { name: "Show plan details for Nest pension" }).click();
    await page.getByLabel("Contribution percent for Nest pension", { exact: true }).fill("5");
    await page.getByLabel("Employer fixed contribution percent for Nest pension", { exact: true }).fill("3");
    await expect(page.getByLabel("Monthly contribution for Nest pension", { exact: true })).toHaveValue("166.67");
    await expect(page.getByLabel("Employer monthly contribution for Nest pension", { exact: true })).toHaveValue("100");
    await expect(page.getByText(/Pension annual allowance \(2026\/27\)/)).toBeVisible();

    await addAccount(page, "debt", "student-loan", "SLC loan", 30000, async (editor) => {
      await editor.getByLabel("Interest rate (APR) %").fill("4.3");
    });
    await page.getByRole("button", { name: "Show loan details for SLC loan" }).click();
    await page.getByLabel("Student loan plan for SLC loan", { exact: true }).selectOption("plan2");
    await expect(page.getByText(/Suggested payment/)).toContainText("£80");
    await expect(page.getByText(/9% of pay above £29,385/)).toBeVisible();

    await openView(page, "Dashboard");
    const pensions = page.locator(".retirementPanel");
    await expect(pensions).toContainText("Pension annual allowance");
    await expect(pensions).toContainText("£3,200 / £60,000");
  });
});

test.describe("sample data and tutorials", () => {
  test.slow();

  test("?sample=us loads an American ledger that fills every US widget; ?sample=uk loads the British one", async ({ page }) => {
    await page.goto("/dashboard?sample=us");
    await expect(page.locator(".statusToast")).toContainText("US sample data loaded");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("US");
    const retirement = page.locator(".retirementPanel");
    await expect(retirement).toContainText("Fidelity 401(k)");
    await expect(retirement).toContainText("HSA limit");
    await expect(page.locator(".medicalPanel")).toContainText("Deductible");
    await expect(page.locator(".loansPanel")).toContainText("Mortgage");
    await expect(page.locator(".loansPanel")).toContainText("Federal student loan");
    await expect(page.locator(".paycheckPanel")).toContainText("Take-home pay");
    await expect(page.locator(".summaryStrip")).toContainText("$5,450");
    await openView(page, "Accounts");
    await expect(page.getByLabel("Balance for Chase Sapphire Visa", { exact: true })).toHaveValue("1850");
    await expect(page.getByLabel("Type for Vanguard Roth IRA", { exact: true })).toHaveValue("roth-ira");

    await page.goto("/dashboard?sample=uk");
    await expect(page.locator(".statusToast")).toContainText("UK sample data loaded");
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("GB");
    await expect(page.locator(".summaryStrip")).toContainText("£2,875");
    await openView(page, "Accounts");
    await expect(page.getByLabel("Type for Nest workplace pension", { exact: true })).toHaveValue("pension");
    await expect(page.getByLabel("Type for Cash ISA", { exact: true })).toHaveValue("isa");
    await expect(page.getByLabel("Student loan plan for Student loan", { exact: true })).toHaveCount(0);
  });

  test("the tutorial speaks to the country: US pages explain 401(k)s and FICO, UK pages stay as they were", async ({ page }) => {
    await switchToUs(page);
    await openView(page, "Accounts");
    await page.locator(".sideNav").getByRole("button", { name: /Tutorial/ }).click();
    const tutorial = page.getByRole("dialog", { name: /tutorial/ });
    await expect(tutorial).toContainText("401(k), Roth IRA, HSA, 529");
    await expect(tutorial).toContainText("Plan details");
    await tutorial.getByRole("button", { name: "Skip tutorial" }).click();
    await openView(page, "Dashboard");
    await page.locator(".sideNav").getByRole("button", { name: /Tutorial/ }).click();
    await expect(tutorial).toContainText("FICO and VantageScore");
    await tutorial.getByRole("button", { name: "Skip tutorial" }).click();

    await page.getByLabel("Country", { exact: true }).selectOption("GB");
    await openView(page, "Accounts");
    await page.locator(".sideNav").getByRole("button", { name: /Tutorial/ }).click();
    await expect(tutorial).toContainText("Add savings, current and investment accounts as assets.");
    await expect(tutorial).not.toContainText("401(k)");
  });
});
