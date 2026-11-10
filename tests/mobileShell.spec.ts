import { expect, test } from "@playwright/test";

// The phone and foldable shell: a tab bar (a side rail once there is width), the rest of the
// sidebar in a sheet under More, and no page that scrolls sideways — down to the 280px cover
// screen of a folded Galaxy Fold and up to the same phone unfolded.

const VIEWS = ["dashboard", "ledger", "accounts", "pay", "goals", "allocate", "subscriptions", "settings"];
const SCREENS = [
  { name: "folded Galaxy Fold cover screen", width: 280, height: 653 },
  { name: "folded Galaxy Z Fold", width: 344, height: 882 },
  { name: "phone", width: 390, height: 844 },
  { name: "unfolded Galaxy Z Fold", width: 768, height: 923 },
  { name: "unfolded Galaxy Z Fold, wide", width: 884, height: 1104 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("it_pdf_import_notice", "1");
    localStorage.setItem("tutorialSeenPages", JSON.stringify(["dashboard", "ledger", "accounts", "pay", "goals", "allocate", "subscriptions", "settings"]));
  });
});

for (const screen of SCREENS) {
  test(`no page scrolls sideways on a ${screen.name} (${screen.width}px)`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: screen.width, height: screen.height });
    for (const view of VIEWS) {
      await page.goto(`/${view}?sample=uk`);
      await expect(page.locator(".appBar")).toBeVisible();
      await expect(page.locator(".tabBar")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${view} is wider than the screen` })
        .toBeLessThanOrEqual(0);
    }
  });
}

test("a phone gets a tab bar, with the rest of the sidebar in a sheet under More", async ({ page }) => {
  await page.setViewportSize({ width: 344, height: 882 });
  await page.goto("/dashboard");
  const tabs = page.getByRole("navigation", { name: "Quick navigation" });
  const sheet = page.locator(".sideNav");
  await expect(tabs).toBeVisible();
  await expect(sheet).toBeHidden();

  await tabs.getByRole("button", { name: "Ledger", exact: true }).click();
  await expect(page).toHaveURL(/\/ledger$/);
  await expect(tabs.getByRole("button", { name: "Ledger", exact: true })).toHaveAttribute("aria-current", "page");

  // Settings is not a tab: it lives in the sheet, and picking it puts the sheet away.
  await page.locator(".tabBarMore").click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(sheet).toBeHidden();
  await expect(page.locator(".tabBarMore")).toHaveClass(/active/);

  // Escape and a tap outside both close it without going anywhere.
  await page.locator(".tabBarMore").click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.locator(".tabBarMore").click();
  await page.locator(".navSheetBackdrop").click({ position: { x: 20, y: 20 } });
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/settings$/);
});

test("an unfolded foldable gets a side rail, and a desktop keeps the full sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 923 });
  await page.goto("/dashboard");
  const rail = page.locator(".tabBar");
  await expect(rail).toBeVisible();
  const box = await rail.boundingBox();
  expect(box!.x).toBe(0);
  expect(box!.width).toBeLessThan(120);
  expect(box!.height).toBeGreaterThan(800);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(rail).toBeHidden();
  await expect(page.locator(".sideNav").getByRole("button", { name: "Dashboard", exact: true })).toBeVisible();
});
