import { expect, test, type Page } from "@playwright/test";
import { useFullDashboard } from "./helpers/dashboard";

// The Subscriptions page end to end: a year of bank rows comes in through the CSV importer, the
// page finds the subscriptions, bills and renewals in them, and the user's decisions (cancel,
// reactivate, delete, restore) stick. Also the Dashboard widget that leads here and the page URL.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("gettingStartedDismissed", "1");
    localStorage.setItem("tutorialSeenPages", JSON.stringify(["ledger", "dashboard", "accounts", "goals", "subscriptions", "settings"]));
  });
});

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// UK bank CSVs are day-first.
function uk(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function monthsAgo(months: number, day: number): Date {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() - months, day);
  return date;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// A year of statements: two subscriptions, one with a price rise; a 4-weekly gym; a weekly shop;
// an annual renewal; a subscription that stopped; rent; and a salary.
function buildCsv(): string {
  const today = new Date();
  const rows: string[] = ["Date,Description,Amount"];
  const push = (date: Date, description: string, amount: number) => {
    if (date > today) return;
    rows.push(`${uk(iso(date))},${description},${amount.toFixed(2)}`);
  };
  for (let index = 11; index >= 0; index -= 1) {
    push(monthsAgo(index, 17), "NETFLIX.COM", index >= 4 ? -10.99 : -12.99);
    push(monthsAgo(index, 19), "SPOTIFY UK", -10.99);
    push(monthsAgo(index, 1), "RENT - J SMITH LANDLORD", -950);
    push(monthsAgo(index, 28), "ACME LTD SALARY", 2875);
    if (index >= 5) push(monthsAgo(index, 3), "DISNEY PLUS", -7.99);
  }
  for (let index = 0; index < 13; index += 1) push(daysAgo(5 + index * 28), "PUREGYM LTD", -24.99);
  for (let index = 0; index < 30; index += 1) push(daysAgo(2 + index * 7), "TESCO STORES 2041", -(38 + ((index * 23) % 41)));
  push(monthsAgo(11, 14), "AMZNPRIME", -95);
  push(new Date(monthsAgo(11, 14).getFullYear() - 1, monthsAgo(11, 14).getMonth(), 14), "AMZNPRIME", -95);
  return rows.join("\n");
}

// On the mobile viewport, scroll-into-view can park a control under the sticky app bar or the
// fixed bottom rail and make hit-testing flaky; centring it first keeps taps reliable.
async function tap(target: ReturnType<Page["locator"]>) {
  await target.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  await target.click();
}

// Opens a row's detail panel (a row that moved between tabs may already be open).
async function expand(row: ReturnType<Page["locator"]>) {
  const main = row.locator(".subsRowMain");
  if ((await main.getAttribute("aria-expanded")) !== "true") await tap(main);
  await expect(main).toHaveAttribute("aria-expanded", "true");
}

// Saving is debounced; anything that reloads the page must wait for the chip to say "Saved".
async function waitForSave(page: Page) {
  await page.waitForTimeout(400);
  await expect(page.locator(".saveStatusChip")).toContainText("Saved", { timeout: 10_000 });
}

async function importStatement(page: Page) {
  await page.goto("/ledger");
  await expect(page.getByRole("heading", { name: "Ledger", exact: true })).toBeVisible({ timeout: 10_000 });
  await page.locator('input[accept*=".csv"]').setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from(buildCsv()) });
  const confirm = page.locator(".importModalFooter .navCta");
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.locator(".importModalFooter")).toHaveCount(0);
  await waitForSave(page);
}

test.describe("subscriptions page", () => {
  test.slow();

  test("finds subscriptions, bills and renewals in imported statements and lets the user manage them", async ({ page }) => {
    await importStatement(page);

    // An everyday page: in every sidebar, with its own URL.
    await tap(page.locator(".sideNav").getByRole("button", { name: "Subscriptions", exact: true }));
    await expect(page).toHaveURL(/\/subscriptions$/);
    const view = page.getByLabel("Subscriptions", { exact: true });
    await expect(view.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();

    const list = page.locator(".subsList");
    // Monthly subscriptions with yearly costs.
    const netflix = list.locator(".subsRow", { hasText: "Netflix" });
    await expect(netflix).toBeVisible();
    await expect(netflix).toContainText("Monthly");
    await expect(netflix).toContainText("£12.99/mo");
    await expect(netflix).toContainText("£155.88");
    await expect(netflix).toContainText("Price up +18%");
    const spotify = list.locator(".subsRow", { hasText: "Spotify" });
    await expect(spotify).toContainText("£131.88");
    // 4-weekly: 13 payments a year.
    const gym = list.locator(".subsRow", { hasText: "Puregym" });
    await expect(gym).toContainText("Every 4 weeks");
    await expect(gym).toContainText("£324.87");
    // Annual renewal with its next date.
    const prime = list.locator(".subsRow", { hasText: "Amazon Prime" });
    await expect(prime).toContainText("Yearly");
    await expect(prime).toContainText("£95.00/yr");
    await expect(prime).toContainText(/Next|Renews/);
    // The weekly shop and the salary are nowhere on the page.
    await expect(page.locator(".subsRow", { hasText: "Tesco" })).toHaveCount(0);
    await expect(page.locator(".subsRow", { hasText: "Salary" })).toHaveCount(0);

    // The price rise is called out with its yearly impact.
    const alerts = page.locator(".subsAlerts");
    await expect(alerts).toContainText("Netflix went up £10.99 → £12.99");
    await expect(alerts).toContainText("£24.00 a year");

    // Rent is a bill, not a subscription.
    await tap(page.getByRole("tab", { name: /Bills & regular payments/ }));
    await expect(list.locator(".subsRow", { hasText: "Rent" })).toContainText("£11,400");

    // Disney+ stopped being paid months ago: on the cancelled list, detected.
    await tap(page.getByRole("tab", { name: /Cancelled/ }));
    const disney = list.locator(".subsRow", { hasText: "Disney" });
    await expect(disney).toContainText("Stopped");

    // The user cancels Netflix: it moves to the cancelled list and stops auto-repeating.
    await tap(page.getByRole("tab", { name: /^Subscriptions/ }));
    await expand(netflix);
    await tap(netflix.getByRole("button", { name: "Mark cancelled" }));
    await expect(page.locator(".statusToast")).toContainText("Netflix marked cancelled");
    await expect(list.locator(".subsRow", { hasText: "Netflix" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Cancelled/ })).toContainText("2");
    await tap(page.getByRole("tab", { name: /Cancelled/ }));
    await expect(list.locator(".subsRow", { hasText: "Netflix" })).toContainText("Cancelled");

    // ...and can bring it back.
    await expand(list.locator(".subsRow", { hasText: "Netflix" }));
    await tap(list.locator(".subsRow", { hasText: "Netflix" }).getByRole("button", { name: "Still active" }));
    await expect(list.locator(".subsRow", { hasText: "Netflix" })).toHaveCount(0);
    await tap(page.getByRole("tab", { name: /^Subscriptions/ }));
    await expect(list.locator(".subsRow", { hasText: "Netflix" })).toBeVisible();

    // Deleting from the cancelled list removes it from the page entirely; restore brings it back.
    await tap(page.getByRole("tab", { name: /Cancelled/ }));
    await expand(disney);
    await tap(disney.getByRole("button", { name: "Delete" }));
    await tap(disney.getByRole("button", { name: "Remove" }));
    await expect(list.locator(".subsRow", { hasText: "Disney" })).toHaveCount(0);
    await expect(page.locator(".subsDeletedNote")).toContainText("1 subscription was removed");
    await tap(page.locator(".subsDeletedNote").getByRole("button", { name: "Restore" }));
    await expect(list.locator(".subsRow", { hasText: "Disney" })).toBeVisible();

    // Decisions survive a reload, and the URL stays put.
    await expand(disney);
    await tap(disney.getByRole("button", { name: "Yes, cancelled" }));
    await waitForSave(page);
    await page.reload();
    await expect(page).toHaveURL(/\/subscriptions$/);
    await tap(page.getByRole("tab", { name: /Cancelled/ }));
    await expect(page.locator(".subsList .subsRow", { hasText: "Disney" })).toContainText("Cancelled");
  });

  test("the Dashboard widget summarises the same report and opens the page", async ({ page }) => {
    await useFullDashboard(page);
    await importStatement(page);
    await tap(page.locator(".sideNav").getByRole("button", { name: "Dashboard", exact: true }));
    const widget = page.locator('[data-widget-id="subscriptions"]');
    await expect(widget).toContainText("Subscriptions & regular payments");
    await expect(widget).toContainText("Netflix went up £10.99 → £12.99");
    await expect(widget.locator(".subsWidgetRow", { hasText: "Netflix" })).toContainText("£12.99/mo");
    await tap(widget.getByRole("button", { name: /View all/ }));
    await expect(page).toHaveURL(/\/subscriptions$/);
    await expect(page.getByLabel("Subscriptions", { exact: true }).getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();
  });

  test("an empty ledger shows an empty state that leads to importing", async ({ page }) => {
    await page.goto("/subscriptions");
    await expect(page.getByText("No repeating payments found yet")).toBeVisible();
  });
});
