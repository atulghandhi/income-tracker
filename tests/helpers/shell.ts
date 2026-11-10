import type { Locator, Page } from "@playwright/test";

// On phones and folded foldables the sidebar is a sheet that slides up from the tab bar's More
// button; on wider screens it is always on show. Returns the sidebar, opened if it needed opening,
// so a test can reach any page or sidebar control the same way at every screen size.
export async function primaryNav(page: Page): Promise<Locator> {
  const nav = page.locator(".sideNav");
  const more = page.locator(".tabBarMore");
  // Straight after a load neither is there yet; the top bar shows at every size once the app is up.
  await page.locator(".appBar").waitFor({ state: "visible" });
  if ((await more.isVisible()) && (await more.getAttribute("aria-expanded")) !== "true") {
    await more.click();
    await nav.locator(".navStack").waitFor({ state: "visible" });
  }
  return nav;
}
