// Runs before `npm test`: makes sure Playwright's Chromium is present, and says plainly what to
// do when it is not, instead of every browser test failing with the same error.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.PW_CHROMIUM_PATH) {
  if (existsSync(process.env.PW_CHROMIUM_PATH)) process.exit(0);
  console.error(`PW_CHROMIUM_PATH points at ${process.env.PW_CHROMIUM_PATH}, which does not exist.`);
  process.exit(1);
}

const { chromium } = await import("playwright-core");
const executable = chromium.executablePath();
if (existsSync(executable)) process.exit(0);

console.log("Playwright's Chromium is not installed yet — downloading it (npx playwright install chromium)…");
const install = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "install", "chromium"], { stdio: "inherit" });
if (install.status === 0 && existsSync(chromium.executablePath())) process.exit(0);

// No download possible, but a sandbox may still ship older pinned builds: playwright.browser.ts
// falls back to the newest of those, so the run can go ahead.
const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
if (existsSync(browsersRoot) && readdirSync(browsersRoot).some((name) => /^chromium-\d+$/.test(name))) {
  console.log(`Using the newest pinned Chromium in ${browsersRoot} instead (see playwright.browser.ts).`);
  process.exit(0);
}

console.error(
  [
    "",
    "Could not install Playwright's Chromium (no access to the browser CDN?).",
    "Either run `npx playwright install chromium` on a machine with access, or point",
    "PW_CHROMIUM_PATH at any Chromium / Chrome binary and run `npm test` again.",
    "",
  ].join("\n"),
);
process.exit(1);
