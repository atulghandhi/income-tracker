import { expect, test, type Page } from "@playwright/test";

// The suggested-widgets banner's first-visit rule, Peach as the default frame, the Health score's
// next steps and entered credit score, and the canvas's top corners while the page scrolls.

async function openSampleDashboard(page: Page) {
  await page.goto("/dashboard?sample=uk");
  await expect(page.locator(".healthPanel")).toContainText("Health score", { timeout: 20_000 });
  await page.keyboard.press("Escape");
}

test.describe("Dashboard and Settings polish", () => {
  test.slow();

  test("the suggested widgets banner shows on a new user's first visit only", async ({ page }) => {
    await openSampleDashboard(page);
    const banner = page.getByRole("region", { name: "Suggested widgets" });
    await expect(banner).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.locator(".healthPanel")).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveCount(0);
  });

  test("someone already using the app never sees the suggested widgets banner again", async ({ page }) => {
    await openSampleDashboard(page);
    // An existing user from before the rule: data saved, no record of the banner.
    await page.evaluate(() => localStorage.removeItem("it_widget_recs_seen"));
    await page.goto("/dashboard");
    await expect(page.locator(".healthPanel")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Suggested widgets" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("it_widget_recs_seen"))).toBe("1");
  });

  test("Peach is the default frame, teal users move to it once, and Teal can still be chosen", async ({ page }) => {
    await openSampleDashboard(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("it_hue"))).toBe("22");

    await page.evaluate(() => {
      localStorage.setItem("it_hue", "172");
      localStorage.removeItem("it_hue_peach_move");
    });
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Peach" })).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });

    await page.getByRole("button", { name: "Teal" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Teal" })).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  });

  test("Health score offers next steps that open the right page, and takes a real credit score", async ({ page }) => {
    await openSampleDashboard(page);
    const panel = page.locator(".healthPanel");
    await expect(panel.getByText("Next steps")).toBeVisible();
    await expect(panel.locator(".healthSteps button").first()).toContainText(/\+\d\.\d/);
    await expect(panel).toContainText("Estimated credit score");

    await panel.getByRole("button", { name: "Enter your real credit score" }).click();
    await panel.getByLabel("Your Experian score").fill("520");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.locator(".creditEstimate")).toContainText("Your credit score");
    await expect(panel.locator(".creditEstimate")).toContainText("520 Experian · Very poor");

    // Saved with the ledger: still there after a reload.
    await page.waitForTimeout(800);
    await page.goto("/dashboard");
    await expect(page.locator(".healthPanel .creditEstimate")).toContainText("520", { timeout: 20_000 });

    await page.locator(".healthPanel .healthSteps button").first().click();
    await expect(page).toHaveURL(/\/(ledger|accounts|allocate|goals)$/);
  });

  test("no scrolling content shows through the canvas's top corners", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The inset canvas is the desktop layout");
    await page.setViewportSize({ width: 1400, height: 900 });
    await openSampleDashboard(page);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(400);
    // Black content under a solid white bar: the frame and the bar are both light, so any dark
    // pixel on the curve is content leaking past the corner.
    await page.addStyleTag({ content: ".workspace{background:#000 !important} .appBar{background:#fff !important;backdrop-filter:none !important}" });
    const { left, right } = await page.evaluate(() => document.querySelector(".workspace")!.getBoundingClientRect());
    for (const x of [left - 1, right - 19]) {
      const shot = await page.screenshot({ clip: { x, y: 6, width: 20, height: 16 } });
      const darkest = await page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        let min = 255;
        for (let i = 0; i < pixels.length; i += 4) min = Math.min(min, pixels[i]);
        return min;
      }, shot.toString("base64"));
      expect(darkest, `corner at x=${Math.round(x)}`).toBeGreaterThan(235);
    }
  });
});
