import { test } from "@playwright/test";

// Not an assertion suite: renders the sign-in and merge dialogs for a visual check.
test.skip(!process.env.SCREENSHOT_DIR, "visual check only");

for (const [label, size] of [["desktop", { width: 1280, height: 860 }], ["fold-cover-landscape", { width: 701, height: 444 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`sign-in dialog ${label}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size });
    await context.addInitScript(() => {
      localStorage.setItem("hasSeenLanding", "1");
      localStorage.setItem("onboardingComplete", "1");
      localStorage.setItem("gettingStartedDismissed", "1");
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.locator(".sideSignInBtn, button:has-text('Sign in')").first().click();
    await page.getByRole("dialog", { name: "Sync your data" }).waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/signin-${label}.png` });
  });
}
