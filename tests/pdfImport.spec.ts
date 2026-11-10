import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { primaryNav } from "./helpers/shell";

// PDF statements in the app shell: the same file picker and review screen as a
// CSV, a clear message for PDFs the importer cannot read, and the one-off
// "PDF imports are new" card for people who were already using the app.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
  });
});

const FIXTURES = fileURLToPath(new URL("./fixtures/statements/", import.meta.url));
const EXPENSE_NAME = ".panel.expense .addRow input[placeholder='What did you spend on?']";
const EXPENSE_AMOUNT = ".panel.expense .addRow .moneyInput input";
const NOTICE_TITLE = "PDF statements now import directly";

async function inputValues(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

async function openView(page: Page, name: "Dashboard" | "Ledger" | "Settings") {
  await (await primaryNav(page)).getByRole("button", { name, exact: true }).click();
}

async function uploadPdf(page: Page, name: string) {
  await page.getByLabel("Import a bank statement file").setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: readFileSync(`${FIXTURES}${name}`),
  });
}

// Makes this browser profile look like someone who used the app before PDF
// import shipped: a saved ledger with an entry, and no record of the notice.
async function becomeReturningUser(page: Page) {
  await page.goto("/");
  await openView(page, "Ledger");
  await page.locator(EXPENSE_NAME).fill("QA rent");
  await page.locator(EXPENSE_AMOUNT).fill("900");
  await page.locator(EXPENSE_AMOUNT).press("Enter");
  await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain("QA rent");
  // The ledger saves on a debounce; give it a moment before the reload.
  await page.waitForTimeout(1000);
  await page.evaluate(() => localStorage.removeItem("it_pdf_import_notice"));
  await page.reload({ waitUntil: "domcontentloaded" });
}

test.describe("PDF import", () => {
  test("imports a PDF statement through the same review as a CSV, then undoes it", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 0, 20) });
    await page.goto("/");
    await openView(page, "Settings");
    await expect(page.getByRole("button", { name: "Import CSV / OFX / QIF / PDF" })).toBeVisible();
    await expect(page.getByLabel("Import a bank statement file")).toHaveAttribute("accept", /\.pdf/);

    await uploadPdf(page, "monzo-personal-account.pdf");
    const dialog = page.getByRole("dialog", { name: "monzo-personal-account.pdf" });
    // pdf.js is fetched on first use, so the review can take a moment to appear.
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText("PDF statement review · Monzo");
    await expect(dialog.locator(".importStats")).toContainText("Rows 16");
    await expect(page.getByLabel("Import Tesco")).toBeChecked();
    await expect(page.getByLabel("Import Savings Pot")).not.toBeChecked();
    await page.getByLabel("Category for Pret A Manger").fill("Work lunch");
    await dialog.getByRole("button", { name: /^Import \d/ }).click();
    await expect(dialog).toHaveCount(0);

    await openView(page, "Ledger");
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).toContain("Acme");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toEqual(
      expect.arrayContaining(["Tesco", "British Gas", "Pret A Manger", "Netflix"]),
    );
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).not.toContain("Savings Pot");
    await expect.poll(() => inputValues(page, "input[aria-label='Category name']")).toEqual(expect.arrayContaining(["Food", "Work lunch"]));

    await openView(page, "Settings");
    await expect(page.locator(".importHistoryRow").first()).toContainText("monzo-personal-account.pdf");

    await openView(page, "Ledger");
    await page.getByRole("button", { name: "Undo import" }).click();
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).not.toContain("Tesco");
    await expect.poll(() => inputValues(page, "input[aria-label='Income source']")).not.toContain("Acme");
  });

  test("reads a two-page statement and places rows before the year end in the earlier year", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 0, 20) });
    await page.goto("/");
    await uploadPdf(page, "barclays-current-account.pdf");
    const dialog = page.getByRole("dialog", { name: "barclays-current-account.pdf" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText("PDF statement review · Barclays");
    await expect(dialog.locator(".importStats")).toContainText("Rows 17");
    await expect(dialog.locator(".importTable tr", { hasText: "Thames Water" })).toContainText("Jan 02, 2026");
    await expect(dialog.locator(".importTable tr", { hasText: "British Gas" })).toContainText("Dec 15, 2025");
    await dialog.getByRole("button", { name: "Close CSV review" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("explains why a PDF cannot be imported instead of importing nothing", async ({ page }) => {
    await page.goto("/");
    await openView(page, "Settings");

    await uploadPdf(page, "unsupported-letter.pdf");
    const letter = page.getByRole("dialog", { name: "unsupported-letter.pdf" });
    await expect(letter).toBeVisible({ timeout: 20_000 });
    await expect(letter.getByRole("alert")).toContainText("Couldn’t find a transaction table in this Barclays PDF");
    await expect(letter.getByRole("alert")).toContainText("Paste");
    await expect(letter.getByRole("button", { name: /^Import \d/ })).toBeDisabled();
    await letter.getByRole("button", { name: "Cancel" }).click();
    await expect(letter).toHaveCount(0);

    await uploadPdf(page, "unsupported-scan.pdf");
    const scan = page.getByRole("dialog", { name: "unsupported-scan.pdf" });
    await expect(scan).toBeVisible();
    await expect(scan.getByRole("alert")).toContainText("no selectable text");
    await expect(scan.getByRole("button", { name: /^Import \d/ })).toBeDisabled();
  });
});

test.describe("PDF import announcement", () => {
  test("tells returning users once, with an X to dismiss", async ({ page }) => {
    await becomeReturningUser(page);
    const notice = page.getByRole("dialog", { name: NOTICE_TITLE });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Barclays");
    await expect(notice).toContainText("never uploaded");

    await notice.getByRole("button", { name: "Close" }).click();
    await expect(notice).toHaveCount(0);
    // The app behind it is usable straight away.
    await openView(page, "Settings");
    await expect(page.getByRole("button", { name: "Import CSV / OFX / QIF / PDF" })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await openView(page, "Ledger");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain("QA rent");
    await expect(notice).toHaveCount(0);
  });

  test("closes when clicking outside it or pressing Escape", async ({ page }) => {
    await becomeReturningUser(page);
    const notice = page.getByRole("dialog", { name: NOTICE_TITLE });
    await expect(notice).toBeVisible();
    await page.locator(".noticeBackdrop").click({ position: { x: 8, y: 8 } });
    await expect(notice).toHaveCount(0);

    await page.evaluate(() => localStorage.removeItem("it_pdf_import_notice"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(notice).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notice).toHaveCount(0);
  });

  test("its Import a PDF button opens the statement file picker", async ({ page }) => {
    await becomeReturningUser(page);
    const notice = page.getByRole("dialog", { name: NOTICE_TITLE });
    await expect(notice).toBeVisible();
    const chooser = page.waitForEvent("filechooser");
    await notice.getByRole("button", { name: "Import a PDF" }).click();
    expect(await (await chooser).element().getAttribute("accept")).toContain(".pdf");
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import CSV / OFX / QIF / PDF" })).toBeVisible();
  });

  test("never shows for someone new to the app", async ({ page }) => {
    await page.goto("/");
    await openView(page, "Ledger");
    await expect(page.getByText("Start with income")).toBeVisible();
    await expect(page.getByRole("dialog", { name: NOTICE_TITLE })).toHaveCount(0);
    // Their first visit is recorded as "already seen", so adding data later does not trigger it.
    await expect.poll(() => page.evaluate(() => localStorage.getItem("it_pdf_import_notice"))).toBe("1");
    await page.locator(EXPENSE_NAME).fill("QA coffee");
    await page.locator(EXPENSE_AMOUNT).fill("3");
    await page.locator(EXPENSE_AMOUNT).press("Enter");
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openView(page, "Ledger");
    await expect.poll(() => inputValues(page, "input[aria-label='Expense name']")).toContain("QA coffee");
    await expect(page.getByRole("dialog", { name: NOTICE_TITLE })).toHaveCount(0);
  });
});
