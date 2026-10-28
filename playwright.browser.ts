import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Which Chromium to launch.
//
// On a normal machine `npx playwright install` puts the exact build this Playwright
// version wants in its browsers folder and nothing here applies. Remote sandboxes instead
// ship a handful of pinned builds (usually older than the one wanted) and cannot download,
// so every browser test would fail with "Executable doesn't exist". When the wanted build
// is missing, fall back to the newest pinned Chromium that is present — or to
// PW_CHROMIUM_PATH when it is set explicitly.

const browsersRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");

function wantedRevision(): string | null {
  try {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "node_modules", "playwright-core", "browsers.json"), "utf8")) as {
      browsers: Array<{ name: string; revision: string }>;
    };
    return manifest.browsers.find((browser) => browser.name === "chromium")?.revision ?? null;
  } catch {
    return null;
  }
}

function wantedBuildInstalled(): boolean {
  const revision = wantedRevision();
  if (!revision) return true;
  return ["chromium", "chromium_headless_shell"].some((name) => existsSync(join(browsersRoot, `${name}-${revision}`)));
}

const EXECUTABLES = [
  join("chrome-linux64", "chrome"),
  join("chrome-linux", "chrome"),
  join("chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
  join("chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
  join("chrome-win", "chrome.exe"),
];

function newestPinnedChromium(): string | null {
  if (!existsSync(browsersRoot)) return null;
  const builds = readdirSync(browsersRoot)
    .map((name) => ({ name, revision: Number(/^chromium-(\d+)$/.exec(name)?.[1]) }))
    .filter((build) => Number.isFinite(build.revision))
    .sort((a, b) => b.revision - a.revision);
  for (const build of builds) {
    for (const executable of EXECUTABLES) {
      const candidate = join(browsersRoot, build.name, executable);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function sandboxChromiumPath(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  if (wantedBuildInstalled()) return undefined;
  return newestPinnedChromium() ?? undefined;
}

// Spread into `use` in a Playwright config.
export function sandboxLaunchOptions(): { launchOptions?: { executablePath: string } } {
  const executablePath = sandboxChromiumPath();
  return executablePath ? { launchOptions: { executablePath } } : {};
}
