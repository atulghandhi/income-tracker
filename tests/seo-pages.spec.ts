import { expect, test } from "@playwright/test";
import { primaryNav } from "./helpers/shell";

// The static SEO pages are served straight from /public by the dev server, so
// these run against the same pages that ship to production.

test.describe("Static content pages", () => {
  test("calculator renders an answer, prefills from the query string and updates on input", async ({ page }) => {
    await page.goto("/tools/50-30-20-budget-calculator-uk.html?income=3000");
    await expect(page.locator("h1")).toHaveText("50/30/20 budget calculator");
    await expect(page.locator("#calc-out")).toContainText("£600.00");
    await page.fill("#income", "2000");
    await expect(page.locator("#calc-out")).toContainText("£400.00");
    await expect(page.locator("#calc-share")).toBeVisible();
    await expect(page.locator('a[data-track="cta_click"]').first()).toHaveAttribute("href", /ref=/);
  });

  test("snowball vs avalanche simulation reports both orders", async ({ page }) => {
    await page.goto("/tools/debt-snowball-vs-avalanche-calculator.html");
    await expect(page.locator("#calc-out")).toContainText("Avalanche");
    await expect(page.locator("#calc-out")).toContainText("Snowball");
    // Starve every debt of payments: interest outruns the minimums, so neither order ever clears.
    await page.fill("#extra", "0");
    for (const id of ["#p1", "#p2", "#p3"]) await page.fill(id, "1");
    await expect(page.locator("#calc-out")).toContainText("never clear");
  });

  test("bank guide, comparison and template pages carry structured data and a site nav", async ({ page }) => {
    for (const path of ["/import/nationwide-csv.html", "/compare/moneyhub-alternative.html", "/templates/monthly-budget-planner-template.html"]) {
      await page.goto(path);
      await expect(page.locator("header.site nav.sitenav a", { hasText: "Compare" })).toBeVisible();
      const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
      const graph = JSON.parse(ld ?? "{}");
      expect(graph["@graph"].some((node: { "@type": string }) => node["@type"] === "BreadcrumbList")).toBe(true);
      expect(await page.locator("h1").count()).toBe(1);
    }
  });

  test("template CSV downloads are real files with the importer's headers", async ({ request }) => {
    const response = await request.get("/templates/monthly-budget-planner-template.csv");
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text.split("\n")[0].trim()).toBe("Date,Description,Category,Money in,Money out,Notes");
  });

  test("budget planner, rent affordability, overdraft and pro rata calculators compute the worked examples", async ({ page }) => {
    await page.goto("/tools/budget-planner-uk.html");
    await expect(page.locator("h1")).toHaveText("Budget planner (UK)");
    await expect(page.locator("#calc-out")).toContainText("£240.00");
    await expect(page.locator("#calc-out")).toContainText("10%");
    await page.fill("#income", "2000");
    await expect(page.locator("#calc-out")).toContainText("short each month");

    await page.goto("/tools/rent-affordability-calculator-uk.html");
    await expect(page.locator("#calc-out")).toContainText("43.2%");
    await expect(page.locator("#calc-out")).toContainText("£660.00");
    await expect(page.locator("#calc-out")).toContainText("passes");

    await page.goto("/tools/overdraft-cost-calculator-uk.html");
    await expect(page.locator("#calc-out")).toContainText("£6.4");
    await page.fill("#days", "0");
    await expect(page.locator("#calc-out")).toContainText("Enter a valid non-negative number");

    await page.goto("/tools/pro-rata-salary-calculator-uk.html?salary=30000&fthours=37.5&hours=22.5");
    await expect(page.locator("#calc-out")).toContainText("£18,000.00");
    await expect(page.locator("#calc-out")).toContainText("126 hours");
  });

  test("PDF-only bank pages never promise a CSV and the hub labels them", async ({ page, request }) => {
    await page.goto("/import/zopa-csv.html");
    await expect(page.locator("h1")).toContainText("download your Zopa statement");
    await expect(page.locator(".tldr")).toContainText("does not offer a CSV export");
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    const graph = JSON.parse(ld ?? "{}");
    const howto = graph["@graph"].find((node: { "@type": string }) => node["@type"] === "HowTo");
    expect(howto.name).toContain("download your Zopa statement");
    const hub = await (await request.get("/import/")).text();
    expect(hub).toContain("Zopa &rarr; PDF");
    expect(hub).toContain("Tesco Bank &rarr; CSV");
    for (const path of ["/templates/weekly-budget-planner-template.csv", "/templates/student-budget-template.csv"]) {
      const csv = await (await request.get(path)).text();
      expect(csv.split("\n")[0]).toMatch(/^Date,Description,Category,Money in,Money out,/);
    }
  });

  test("sitemap, feed and llms files list the new sections", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/import/halifax-csv.html", "/compare/best-free-budgeting-apps-uk.html", "/templates/", "/guides/self-employed-income-tracker-uk.html", "/tools/emergency-fund-calculator-uk.html", "/about.html", "/whats-new.html"]) {
      expect(sitemap).toContain(`https://www.theincometracker.com${path}`);
    }
    const feed = await (await request.get("/feed.xml")).text();
    expect(feed).toContain("<rss");
    expect(feed).toContain("<item>");
    const llms = await (await request.get("/llms-full.txt")).text();
    expect(llms).toContain("/compare/moneyhub-alternative.html");
  });
});

test.describe("Landing page and attribution", () => {
  test("home page shows the bank grid, resources and FAQ for crawlers and people", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Track income and spending");
    await expect(page.locator(".lp-bank-grid a", { hasText: "Nationwide" })).toHaveAttribute("href", "/import/nationwide-csv.html");
    await expect(page.locator(".lp-faq-item dt").first()).toHaveText("Is The Income Tracker free?");
    await expect(page.locator(".lp-res-card", { hasText: "Compare apps" })).toBeVisible();
  });

  test("#ref= is recorded and stripped from the address bar", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hasSeenLanding", "1");
      localStorage.setItem("onboardingComplete", "1");
    });
    await page.goto("/#ref=guide-import-pdf-bank-statement");
    await page.waitForFunction(() => !window.location.hash.includes("ref="));
    expect(await page.evaluate(() => localStorage.getItem("it_first_ref"))).toBe("guide-import-pdf-bank-statement");
  });

  test("the old ?ref= links still record attribution", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hasSeenLanding", "1");
      localStorage.setItem("onboardingComplete", "1");
    });
    await page.goto("/?ref=guide-legacy-link");
    await page.waitForFunction(() => !window.location.search.includes("ref="));
    expect(await page.evaluate(() => localStorage.getItem("it_first_ref"))).toBe("guide-legacy-link");
  });

  test("static pages link into the app without query strings", async ({ page }) => {
    await page.goto("/guides/import-pdf-bank-statement.html");
    for (const href of await page.locator('a[href^="/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")))) {
      expect(href, "a /?… link is a separate URL to a crawler").not.toMatch(/^\/\?/);
    }
  });

  test("the US homepage is prerendered with its own language, canonical and copy", async ({ request }) => {
    const html = await (await request.get("/us/")).text();
    expect(html).toContain('<html lang="en-US">');
    expect(html).toContain('<link rel="canonical" href="https://www.theincometracker.com/us/" />');
    expect(html).toContain('hreflang="en-GB" href="https://www.theincometracker.com/"');
    expect(html).toContain("Import from any US bank");
    expect(html).toContain("Chase");
    expect(html).not.toContain("Barclays");
    expect(html).not.toContain("£");
    const home = await (await request.get("/")).text();
    expect(home).toContain('hreflang="en-US" href="https://www.theincometracker.com/us/"');
    expect(home).toContain('href="/us/"');
  });

  test("a visitor in the US sees the US homepage on /, and can choose the UK one", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "America/Chicago", locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Import from any US bank" })).toBeVisible();
    await expect(page.locator(".lp-faq-item dt", { hasText: "Plaid" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
    await page.locator("footer").getByRole("link", { name: "UK version" }).click();
    await expect(page.getByRole("heading", { name: "Import from any UK bank" })).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Import from any UK bank" })).toBeVisible();
    await context.close();
  });

  test("a visitor in the UK sees the UK homepage", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "Europe/London", locale: "en-GB" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Import from any UK bank" })).toBeVisible();
    await context.close();
  });

  test("entering the app from the US homepage starts a US ledger", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "Europe/London", locale: "en-GB" });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem("onboardingComplete", "1"));
    await page.goto("/us/");
    await expect(page.getByRole("heading", { name: "Import from any US bank" })).toBeVisible();
    await page.getByRole("button", { name: /Open the ledger/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByLabel("Country", { exact: true })).toHaveValue("US");
    expect(await page.evaluate(() => document.title)).toBe("Dashboard · The Income Tracker");
    await context.close();
  });

  test("settings offers a monthly reminder that downloads a calendar file", async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hasSeenLanding", "1");
      localStorage.setItem("onboardingComplete", "1");
      localStorage.setItem("gettingStartedDismissed", "1");
    });
    await page.goto("/");
    await (await primaryNav(page)).locator("nav.navStack").getByRole("button", { name: "Settings" }).click();
    const panel = page.getByLabel("Monthly reminder");
    await expect(panel).toBeVisible();
    await panel.locator("#reminder-bank").selectOption("monzo-csv");
    expect(await page.evaluate(() => localStorage.getItem("it_bank"))).toBe("monzo-csv");
    await expect(panel.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com.*BYMONTHDAY(?:%3D|=)2/);
    // Emulated mobile contexts do not surface Blob downloads to Playwright; the same
    // download helper is exercised on desktop.
    if (isMobile) return;
    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Add to calendar" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("income-tracker-monthly-reminder.ics");
  });
});
