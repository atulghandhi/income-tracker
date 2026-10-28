import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInitialState } from "../src/finance";
import { createTransactionHash } from "../src/importer";
import {
  detectStatementBank,
  detectStatementPeriod,
  groupTextLines,
  looksLikePdf,
  parsePdfStatement,
  parsePdfStatementWithDetection,
  readPdfPages,
  type PdfPageText,
  type PdfTextItem,
  type PdfjsLike,
} from "../src/pdfImporter";

// The fixture statements are built by scripts/build-statement-fixtures.mjs and
// read here with the same pdf.js text extraction the app uses, so these tests
// cover the whole path from PDF bytes to review rows.
const FIXTURES = fileURLToPath(new URL("./fixtures/statements/", import.meta.url));
const pageCache = new Map<string, Promise<PdfPageText[]>>();

function fixturePages(name: string): Promise<PdfPageText[]> {
  let pages = pageCache.get(name);
  if (!pages) {
    pages = (async () => {
      const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsLike;
      return readPdfPages(pdfjs, readFileSync(`${FIXTURES}${name}`));
    })();
    pageCache.set(name, pages);
  }
  return pages;
}

async function parseFixture(name: string, state = createInitialState(), fallbackMonthKey = "2026-01") {
  return parsePdfStatement({ pages: await fixturePages(name), fileName: name, state, fallbackMonthKey });
}

// Lays out a statement from cells at x positions (right-aligned when marked "r"),
// one row per line, the way a PDF's text layer presents them.
type Cell = [x: number, text: string, align?: "r"];
function layout(rows: Cell[][], pageNumber = 1): PdfPageText {
  const items: PdfTextItem[] = [];
  rows.forEach((cells, row) => {
    for (const [x, text, align] of cells) {
      const width = text.length * 4.5;
      items.push({ text, x: align === "r" ? x - width : x, y: 800 - row * 12, width, height: 9 });
    }
  });
  return { pageNumber, items };
}

const byDate = (rows: { rowNumber: number }[]) => [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
const sum = (values: number[]) => Number(values.reduce((total, value) => total + value, 0).toFixed(2));

test.describe("PDF statement importer", () => {
  test("reads a Barclays statement: money out / in columns, dates with no year across a year end, two pages", async () => {
    const result = await parseFixture("barclays-current-account.pdf");

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ bank: "Barclays", layout: "columns", pageCount: 2, totalRows: 17, signInverted: false });
    expect(result.detectedColumns).toMatchObject({ date: "Date", description: "Description", debit: "Money out £", credit: "Money in £" });
    expect(result.rows).toHaveLength(17);

    // "15 Dec" belongs to 2025 and "2 Jan" to 2026 because the statement period runs 13 Dec 2025 – 12 Jan 2026.
    expect(result.rows.find((row) => row.description.startsWith("Direct Debit to British Gas"))).toMatchObject({
      date: "2025-12-15",
      amount: -85,
      kind: "expense",
      category: "Bills",
      name: "British Gas",
      description: "Direct Debit to British Gas Ref: 601234567890",
    });
    expect(result.rows.find((row) => row.description.startsWith("Direct Debit to Thames Water"))).toMatchObject({ date: "2026-01-02", amount: -32 });
    // The "Ref:" / "On 14 Dec" lines beneath a row fold into its description; the name stays short.
    expect(result.rows.find((row) => row.description.includes("Tesco Stores"))).toMatchObject({
      description: "Card Payment to Tesco Stores 2423 On 14 Dec",
      name: "Tesco Stores",
      category: "Food",
      amount: -23.5,
    });
    expect(result.rows.find((row) => row.description.startsWith("Received From Acme"))).toMatchObject({
      date: "2025-12-18",
      amount: 2500,
      kind: "income",
      name: "Acme",
      include: true,
    });
    expect(result.rows.find((row) => row.description.includes("Mr J Smith"))).toMatchObject({ kind: "transfer", include: false });
    // Page two, read with the repeated header.
    expect(result.rows.find((row) => row.description === "Interest Paid")).toMatchObject({ date: "2026-01-12", amount: 0.42, kind: "income" });
    // Balance rows and page furniture never become transactions.
    const descriptions = result.rows.map((row) => row.description.toLowerCase());
    for (const furniture of ["start balance", "end balance", "continued", "page 1", "barclays bank uk plc"]) {
      expect(descriptions.some((description) => description.includes(furniture)), furniture).toBe(false);
    }
    // Every amount reconciles with the printed balances: 1,234.56 → 2,183.57.
    expect(sum(result.rows.map((row) => row.amount))).toBe(Number((2183.57 - 1234.56).toFixed(2)));
  });

  test("reads an HSBC statement: type codes, the date once per day and the balance once per day", async () => {
    const result = await parseFixture("hsbc-bank-account.pdf");

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ bank: "HSBC", layout: "columns", pageCount: 1 });
    expect(result.detectedColumns).toMatchObject({ date: "Date", description: "Payment type and details", debit: "Paid out", credit: "Paid in" });
    expect(result.rows).toHaveLength(16);

    const rows = byDate(result.rows);
    // Rows without a printed date take the date of the row above.
    expect(rows.slice(0, 3).map((row) => row.date)).toEqual(["2026-01-02", "2026-01-02", "2026-01-03"]);
    expect(rows.filter((row) => row.date === "2026-01-10").map((row) => row.name)).toEqual(["Sainsbury's", "Amazon"]);
    // The payment-type code moves behind the details, where the name cleaner drops it; ")))" is dropped outright.
    expect(rows[0]).toMatchObject({ description: "BRITISH GAS DD", name: "British Gas", amount: -85, category: "Bills" });
    expect(rows[1]).toMatchObject({ description: "TESCO STORES 2423 LONDON VIS", name: "Tesco Stores", amount: -23.5 });
    expect(rows[2]).toMatchObject({ description: "PRET A MANGER LONDON", amount: -6.45 });
    expect(rows.find((row) => row.description.startsWith("ACME LTD"))).toMatchObject({
      date: "2026-01-05",
      description: "ACME LTD SALARY JAN 26 CR",
      amount: 2500,
      kind: "income",
      name: "Acme Salary Jan 26",
    });
    expect(rows.find((row) => row.description.startsWith("J SMITH SAVINGS"))).toMatchObject({ kind: "transfer", include: false });
    expect(rows.find((row) => row.description.startsWith("BARCLAYCARD"))).toMatchObject({ kind: "debt-payment", amount: -120 });
    expect(result.rows.some((row) => /forward/i.test(row.description))).toBe(false);
    expect(sum(result.rows.map((row) => row.amount))).toBe(Number((2971.5 - 1234.56).toFixed(2)));
  });

  test("reads a Monzo statement: one signed amount column, dd/mm/yyyy dates and notes on a second line", async () => {
    const result = await parseFixture("monzo-personal-account.pdf");

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ bank: "Monzo", layout: "columns", signInverted: false });
    expect(result.detectedColumns).toMatchObject({ date: "Date", description: "Description", amount: "Amount (GBP)" });
    expect(result.detectedColumns.debit).toBeUndefined();
    expect(result.rows).toHaveLength(16);
    expect(result.rows.every((row) => row.date.startsWith("2026-01"))).toBe(true);

    expect(result.rows.find((row) => row.description.startsWith("British Gas"))).toMatchObject({
      date: "2026-01-02",
      description: "British Gas Direct Debit",
      name: "British Gas",
      amount: -85,
    });
    expect(result.rows.find((row) => row.description.startsWith("ACME"))).toMatchObject({
      description: "ACME LTD Faster Payment: SALARY JAN 26",
      name: "Acme",
      amount: 2500,
      kind: "income",
    });
    expect(result.rows.find((row) => row.description.startsWith("Savings Pot"))).toMatchObject({ kind: "transfer", include: false, amount: -200 });
    expect(result.rows.find((row) => row.description === "Amazon Refund")).toMatchObject({ amount: 34.99, name: "Amazon" });
    // The summary block above the table (balances, total deposits) is not read as rows.
    expect(result.rows.some((row) => Math.abs(row.amount) === 1234.56 || Math.abs(row.amount) === 2534.99)).toBe(false);
    expect(sum(result.rows.map((row) => row.amount))).toBe(Number((2971.5 - 1234.56).toFixed(2)));
  });

  test("reads a NatWest statement: one-, two- and three-row transactions, the date once per day, three pages", async () => {
    const result = await parseFixture("natwest-select-account.pdf", createInitialState(), "2026-08");

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ bank: "NatWest", layout: "columns", pageCount: 3 });
    expect(result.detectedColumns).toMatchObject({ credit: "Paid in (£)", debit: "Withdrawn (£)" });
    expect(result.diagnostics.map((page) => [page.header, page.rows])).toEqual([
      [true, 7],
      [true, 8],
      [true, 6],
    ]);
    expect(result.rows).toHaveLength(21);

    // One row (salary), two rows (a Faster Payment with its reference wrapped) and
    // three rows (Robinhood, with a second reference line) are each one transaction;
    // the figures on the last row settle where each one ends.
    expect(result.rows.find((row) => row.description.startsWith("Automated Credit ACME"))).toMatchObject({ date: "2026-07-31", amount: 2500, name: "Acme Salary Jul 26" });
    expect(byDate(result.rows).filter((row) => row.date === "2026-08-12").map((row) => [row.amount, row.name, row.description])).toEqual([
      [-100, "Robinhood Europe UAB", "Automated Debit ROBINHOOD EUROPE UAB ROBINHOOD TOP UP FP 12/08/26 10 11223344556677889900 FPO"],
      [40, "Robinhood Europe UAB", "Automated Credit ROBINHOOD EUROPE UAB ROBINHOOD WITHDRAWAL FP 12/08/26 16 99887766554433221100 BGC"],
    ]);
    expect(result.rows.find((row) => row.description.includes("AMAZON.CO.UK , AMAZON"))?.description).toBe("4332 09AUG26 CD , AMAZON.CO.UK , AMAZON.CO.UK GB CPM");

    // A two-row transaction: type and payee on the first line, the rest of the
    // reference and the figures on the second. The payee names the row, not the ID.
    expect(result.rows.find((row) => row.description.includes("MANGOPAY") && row.amount === 12.5)).toMatchObject({
      date: "2026-08-28",
      description: "Automated Credit MANGOPAY S.A. MGP VINTED FP 28/08/26 12 34567890123456789012 BGC",
      name: "Mangopay S.A. Mgp Vinted",
      kind: "income",
    });
    // Three more rows share that date without printing it, including two-row ones.
    expect(byDate(result.rows).filter((row) => row.date === "2026-08-28").map((row) => [row.amount, row.name])).toEqual([
      [12.5, "Mangopay S.A. Mgp Vinted"],
      [8, "Mangopay S.A. Mgp Vinted"],
      [-950, "Hometown Lettings Rent Flat"],
      [-6.45, "Pret A Manger"],
    ]);
    expect(result.rows.some((row) => /^\d{10,}/.test(row.name))).toBe(false);
    // "28 AUG" sits a day past the period printed on the statement and stays in 2026.
    expect(result.rows.every((row) => row.date.startsWith("2026-0"))).toBe(true);
    expect(result.rows.find((row) => row.description.includes("JANE DOE"))).toMatchObject({ amount: -25, name: "Jane Doe Dinner" });
    expect(result.rows.find((row) => row.description.includes("TESCO"))).toMatchObject({ date: "2026-07-29", amount: -23.5, name: "Tesco Stores" });
    expect(result.rows.some((row) => /forward/i.test(row.description))).toBe(false);
    expect(sum(result.rows.map((row) => row.amount))).toBe(Number((1982.0 - 1234.56).toFixed(2)));
  });

  test("flags duplicates against the ledger exactly as a CSV import would", async () => {
    const state = createInitialState();
    state.months["2026-01"] = {
      incomes: [],
      expenses: [
        {
          id: "expense-existing",
          name: "Tesco Stores",
          amount: 23.5,
          category: "Food",
          color: "#12b886",
          date: "2026-01-02",
          imported: {
            batchId: "batch-existing",
            fileName: "hsbc.csv",
            rowNumber: 2,
            hash: createTransactionHash("2026-01-02", "TESCO STORES 2423 LONDON VIS", -23.5),
            originalDescription: "TESCO STORES 2423 LONDON VIS",
            importedAt: "2026-01-03T00:00:00.000Z",
          },
        },
      ],
      note: "",
    };
    const result = await parseFixture("hsbc-bank-account.pdf", state);
    expect(result.rows.find((row) => row.description.startsWith("TESCO"))).toMatchObject({ duplicate: true, include: false, note: "Possible duplicate" });
    expect(result.rows.filter((row) => row.duplicate)).toHaveLength(1);
  });

  test("explains unsupported PDFs: a letter with no table, and a scan with no text", async () => {
    const letter = await parseFixture("unsupported-letter.pdf");
    expect(letter.rows).toEqual([]);
    expect(letter).toMatchObject({ bank: "Barclays", layout: "none", totalRows: 0 });
    expect(letter.errors).toHaveLength(1);
    expect(letter.errors[0]).toContain("Couldn’t find a transaction table in this Barclays PDF");
    expect(letter.errors[0]).toContain("Paste");

    const scan = await parseFixture("unsupported-scan.pdf");
    expect(scan.rows).toEqual([]);
    expect(scan.layout).toBe("none");
    expect(scan.errors[0]).toContain("no selectable text");
  });

  test("re-parses with flipped signs for the review's card-statement toggle, single-amount layouts only", async () => {
    const monzo = await fixturePages("monzo-personal-account.pdf");
    const flipped = parsePdfStatement({ pages: monzo, fileName: "monzo.pdf", state: createInitialState(), fallbackMonthKey: "2026-01", flipSigns: true });
    expect(flipped.signInverted).toBe(true);
    expect(flipped.rows.find((row) => row.description.startsWith("British Gas"))?.amount).toBe(85);

    // Money out / money in columns are unambiguous, so the flip is ignored.
    const hsbc = await fixturePages("hsbc-bank-account.pdf");
    const unflipped = parsePdfStatement({ pages: hsbc, fileName: "hsbc.pdf", state: createInitialState(), fallbackMonthKey: "2026-01", flipSigns: true });
    expect(unflipped.signInverted).toBe(false);
    expect(unflipped.rows.find((row) => row.description.startsWith("BRITISH GAS"))?.amount).toBe(-85);
  });
});

test.describe("PDF layouts from other banks", () => {
  const state = createInitialState();
  const parse = (pages: PdfPageText[], overrides: Partial<Parameters<typeof parsePdfStatementWithDetection>[0]> = {}) =>
    parsePdfStatementWithDetection({ pages, fileName: "statement.pdf", state, fallbackMonthKey: "2026-01", ...overrides });

  test("money in before money out (Santander) with ordinal dates and an opening balance row", () => {
    const result = parse([
      layout([
        [[40, "Santander UK plc"], [300, "Statement period: 1st January 2026 to 31st January 2026"]],
        [[40, "Date"], [110, "Description"], [400, "Money in", "r"], [470, "Money out", "r"], [550, "Balance", "r"]],
        [[110, "Balance brought forward from statement 11"], [550, "500.00", "r"]],
        [[40, "2nd Jan 2026"], [110, "CARD PAYMENT TO TESCO STORES 2423,23.50 GBP, RATE 1.00/GBP ON 01-01-2026"], [470, "23.50", "r"], [550, "476.50", "r"]],
        [[40, "5th Jan 2026"], [110, "BANK GIRO CREDIT REF ACME LTD SALARY, ACME LTD"], [400, "2,100.00", "r"], [550, "2,576.50", "r"]],
        [[40, "6th Jan 2026"], [110, "DIRECT DEBIT PAYMENT TO OCTOPUS ENERGY REF 123456, MANDATE NO 0012"], [470, "85.00", "r"], [550, "2,491.50", "r"]],
      ]),
    ]);
    expect(result.bank).toBe("Santander");
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.name])).toEqual([
      ["2026-01-02", -23.5, "Tesco Stores"],
      ["2026-01-05", 2100, "Acme"],
      ["2026-01-06", -85, "Octopus Energy"],
    ]);
  });

  test("several text columns and signed amounts (Starling)", () => {
    const result = parse([
      layout([
        [[40, "Starling Bank Limited"], [300, "Statement 01/01/2026 - 31/01/2026"]],
        [[40, "Date"], [110, "Counter Party"], [230, "Reference"], [340, "Type"], [470, "Amount (GBP)", "r"], [550, "Balance (GBP)", "r"]],
        [[40, "02/01/2026"], [110, "Tesco Stores"], [230, "TESCO STORES 2423"], [340, "CONTACTLESS"], [470, "-23.50", "r"], [550, "476.50", "r"]],
        [[40, "05/01/2026"], [110, "Acme Ltd"], [230, "SALARY JAN"], [340, "FASTER PAYMENT"], [470, "2,100.00", "r"], [550, "2,576.50", "r"]],
      ]),
    ]);
    expect(result.bank).toBe("Starling");
    expect(byDate(result.rows).map((row) => [row.amount, row.description])).toEqual([
      [-23.5, "Tesco Stores TESCO STORES 2423 CONTACTLESS"],
      [2100, "Acme Ltd SALARY JAN FASTER PAYMENT"],
    ]);
  });

  test("settles the sign of an unsigned Amount column from the running balance", () => {
    const result = parse([
      layout([
        [[40, "Nationwide Building Society"], [300, "Statement date 31 January 2026"]],
        [[40, "Date"], [110, "Description"], [470, "Amount", "r"], [550, "Balance", "r"]],
        [[110, "Opening balance"], [550, "500.00", "r"]],
        [[40, "02 Jan 2026"], [110, "Tesco Stores"], [470, "23.50", "r"], [550, "476.50", "r"]],
        [[40, "05 Jan 2026"], [110, "Acme Ltd Salary"], [470, "2,100.00", "r"], [550, "2,576.50", "r"]],
        [[40, "06 Jan 2026"], [110, "Octopus Energy"], [470, "85.00", "r"], [550, "2,491.50", "r"]],
      ]),
    ]);
    expect(byDate(result.rows).map((row) => row.amount)).toEqual([-23.5, 2100, -85]);
    expect(result.rows.every((row) => row.note !== "Assumed spending — flip to income if wrong")).toBe(true);
  });

  test("card statements with unsigned purchases and CR payments, and no balance to check against", () => {
    const result = parse([
      layout([
        [[40, "American Express Services Europe Limited"], [300, "Statement date 15 January 2026"]],
        [[40, "Date"], [120, "Description"], [550, "Amount £", "r"]],
        [[40, "02 Jan"], [120, "TESCO STORES 2423 LONDON"], [550, "23.50", "r"]],
        [[40, "03 Jan"], [120, "PRET A MANGER LONDON"], [550, "6.45", "r"]],
        [[40, "10 Jan"], [120, "PAYMENT RECEIVED - THANK YOU"], [550, "250.00 CR", "r"]],
      ]),
    ]);
    expect(result.bank).toBe("American Express");
    // With no running balance to prove direction, unsigned figures read as spending and say so.
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.category, row.note])).toEqual([
      ["2026-01-02", -23.5, "Food", "Assumed spending — flip to income if wrong"],
      ["2026-01-03", -6.45, "Food", "Assumed spending — flip to income if wrong"],
      ["2026-01-10", 250, "Income", "Positive amount treated as income"],
    ]);
  });

  test("US statements: deposits / withdrawals columns and month-first dates with no year", () => {
    const result = parse(
      [
        layout([
          [[40, "JPMorgan Chase Bank, N.A."], [300, "January 1, 2026 through January 31, 2026"]],
          [[40, "Date"], [110, "Description"], [400, "Deposits", "r"], [470, "Withdrawals", "r"], [550, "Balance", "r"]],
          [[110, "Beginning Balance"], [550, "1,000.00", "r"]],
          [[40, "01/15"], [110, "Zelle payment from Jane Doe"], [400, "50.00", "r"], [550, "1,050.00", "r"]],
          [[40, "01/16"], [110, "Card Purchase Whole Foods"], [470, "62.10", "r"], [550, "987.90", "r"]],
        ]),
      ],
      { state: createInitialState("US") },
    );
    expect(result.bank).toBe("Chase");
    expect(byDate(result.rows).map((row) => [row.date, row.amount])).toEqual([
      ["2026-01-15", 50],
      ["2026-01-16", -62.1],
    ]);
  });

  test("a header split over two lines, and a payment-type column (Lloyds)", () => {
    const result = parse([
      layout([
        [[40, "Lloyds Bank"], [300, "13 December 2025 to 12 January 2026"]],
        [[40, "Date"], [100, "Pay type"], [160, "Details"], [420, "Money", "r"], [490, "Money", "r"], [555, "Balance", "r"]],
        [[420, "out (£)", "r"], [490, "in (£)", "r"], [555, "(£)", "r"]],
        [[40, "15 Dec"], [100, "DEB"], [160, "TESCO STORES 2423"], [420, "23.50", "r"], [555, "476.50", "r"]],
        [[40, "18 Dec"], [100, "FPI"], [160, "ACME LTD SALARY"], [490, "2,100.00", "r"], [555, "2,576.50", "r"]],
        [[40, "2 Jan"], [100, "DD"], [160, "OCTOPUS ENERGY"], [420, "85.00", "r"], [555, "2,491.50", "r"]],
      ]),
    ]);
    expect(result.layout).toBe("columns");
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.description])).toEqual([
      ["2025-12-15", -23.5, "TESCO STORES 2423 DEB"],
      ["2025-12-18", 2100, "ACME LTD SALARY FPI"],
      ["2026-01-02", -85, "OCTOPUS ENERGY DD"],
    ]);
  });

  test("the description on one line and the figures on the next (Metro Bank)", () => {
    const result = parse([
      layout([
        [[40, "Metro Bank"], [300, "1 January 2026 to 31 January 2026"]],
        [[40, "Date"], [110, "Transaction"], [440, "Money Out", "r"], [500, "Money In", "r"], [555, "Balance", "r"]],
        [[40, "02 Jan 2026"], [110, "Card purchase TESCO STORES"]],
        [[110, "2423 LONDON"], [440, "23.50", "r"], [555, "476.50", "r"]],
        [[40, "05 Jan 2026"], [110, "Inward payment ACME LTD"]],
        [[110, "SALARY"], [500, "2,100.00", "r"], [555, "2,576.50", "r"]],
      ]),
    ]);
    expect(byDate(result.rows).map((row) => [row.amount, row.description])).toEqual([
      [-23.5, "Card purchase TESCO STORES 2423 LONDON"],
      [2100, "Inward payment ACME LTD SALARY"],
    ]);
  });

  test("two-row transactions with the date on the figures line, and same-day rows with no date at all", () => {
    const result = parse([
      layout([
        [[40, "Royal Bank of Scotland"], [300, "Statement period 28 July to 27 August 2026"]],
        [[40, "Date"], [92, "Description"], [420, "Paid in", "r"], [488, "Withdrawn", "r"], [555, "Balance", "r"]],
        [[92, "BROUGHT FORWARD"], [555, "1,234.56", "r"]],
        [[92, "Automated Credit MANGOPAY S.A. MGP VINTED FP 28/08/26 12"]],
        [[40, "28 AUG"], [92, "34567890123456789012 BGC"], [420, "12.50", "r"], [555, "1,247.06", "r"]],
        [[92, "Automated Debit HOMETOWN LETTINGS RENT FP 28/08/26 07"]],
        [[92, "24681357924681357924 FPO"], [488, "950.00", "r"], [555, "297.06", "r"]],
        [[92, "Direct Debit NETFLIX.COM DDR"], [488, "10.99", "r"], [555, "286.07", "r"]],
      ]),
    ]);
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.name])).toEqual([
      ["2026-08-28", 12.5, "Mangopay S.A. Mgp Vinted"],
      ["2026-08-28", -950, "Hometown Lettings Rent"],
      ["2026-08-28", -10.99, "Netflix"],
    ]);
  });

  test("names a two-row transaction after its first line, whatever the second line holds", () => {
    const secondLines = ["34567890123456789012 BGC", "34567890123456789012", "FP 28/08/26 12 34567890123456789012", "BGC"];
    for (const secondLine of secondLines) {
      const result = parse([
        layout([
          [[40, "NatWest"], [300, "Statement period 28 July to 27 August 2026"]],
          [[40, "Date"], [92, "Description"], [420, "Paid in", "r"], [488, "Withdrawn", "r"], [555, "Balance", "r"]],
          [[92, "BROUGHT FORWARD"], [555, "1,234.56", "r"]],
          [[40, "28 AUG"], [92, "Direct Debit NETFLIX.COM DDR"], [488, "10.99", "r"], [555, "1,223.57", "r"]],
          [[92, "Automated Credit MANGOPAY S.A. MGP VINTED FP 28/08/26 12"]],
          [[92, secondLine], [420, "12.50", "r"], [555, "1,236.07", "r"]],
        ]),
      ]);
      expect(byDate(result.rows).map((row) => [row.date, row.amount, row.name]), secondLine).toEqual([
        ["2026-08-28", -10.99, "Netflix"],
        ["2026-08-28", 12.5, "Mangopay S.A. Mgp Vinted"],
      ]);
      // The row above keeps its own description; nothing from the new row leaks into it.
      expect(result.rows.find((row) => row.name === "Netflix")?.description).toBe("Direct Debit NETFLIX.COM DDR");
    }
  });

  test("figures-last statements: transactions of one, two and three rows in any mix, dated or not", () => {
    const result = parse([
      layout([
        [[40, "NatWest"], [300, "Statement period 28 July to 27 August 2026"]],
        [[40, "Date"], [92, "Description"], [420, "Paid in", "r"], [488, "Withdrawn", "r"], [555, "Balance", "r"]],
        [[92, "BROUGHT FORWARD"], [555, "1,000.00", "r"]],
        // one row, dated
        [[40, "11 AUG"], [92, "Direct Debit NETFLIX.COM DDR"], [488, "10.99", "r"], [555, "989.01", "r"]],
        // three rows, dated on the first, payee text on every row including the figures row
        [[40, "12 AUG"], [92, "Automated Debit ROBINHOOD EUROPE UAB"]],
        [[92, "ROBINHOOD TOP UP FP 12/08/26 10"]],
        [[92, "ROBINHOOD EUROPE 11223344556677889900 FPO"], [488, "100.00", "r"], [555, "889.01", "r"]],
        // two rows, same day, no date
        [[92, "Automated Credit MANGOPAY S.A. MGP VINTED FP 12/08/26 12"]],
        [[92, "34567890123456789012 BGC"], [420, "12.50", "r"], [555, "901.51", "r"]],
        // three rows, same day, no date
        [[92, "Automated Credit ROBINHOOD EUROPE UAB"]],
        [[92, "ROBINHOOD WITHDRAWAL FP 12/08/26 16"]],
        [[92, "99887766554433221100 BGC"], [420, "40.00", "r"], [555, "941.51", "r"]],
        // one row, same day, no date
        [[92, "4332 11AUG26 CD , PRET A MANGER , LONDON GB CPM"], [488, "6.45", "r"], [555, "935.06", "r"]],
        [[92, "CARRIED FORWARD"], [555, "935.06", "r"]],
      ]),
    ]);
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.name, row.description])).toEqual([
      ["2026-08-11", -10.99, "Netflix", "Direct Debit NETFLIX.COM DDR"],
      ["2026-08-12", -100, "Robinhood Europe UAB", "Automated Debit ROBINHOOD EUROPE UAB ROBINHOOD TOP UP FP 12/08/26 10 ROBINHOOD EUROPE 11223344556677889900 FPO"],
      ["2026-08-12", 12.5, "Mangopay S.A. Mgp Vinted", "Automated Credit MANGOPAY S.A. MGP VINTED FP 12/08/26 12 34567890123456789012 BGC"],
      ["2026-08-12", 40, "Robinhood Europe UAB", "Automated Credit ROBINHOOD EUROPE UAB ROBINHOOD WITHDRAWAL FP 12/08/26 16 99887766554433221100 BGC"],
      ["2026-08-12", -6.45, "Pret A Manger", "4332 11AUG26 CD , PRET A MANGER , LONDON GB CPM"],
    ]);
  });

  test("figures-first statements: several reference lines under a row stay with it (HSBC)", () => {
    const result = parse([
      layout([
        [[40, "HSBC UK"], [300, "2 January to 31 January 2026"]],
        [[40, "Date"], [96, "Payment type and details"], [405, "Paid out", "r"], [478, "Paid in", "r"], [555, "Balance", "r"]],
        [[126, "BALANCE BROUGHT FORWARD"], [555, "1,234.56", "r"]],
        [[40, "10 Jan 26"], [96, "VIS"], [126, "TESCO STORES 2423"], [405, "23.50", "r"]],
        [[126, "LONDON"]],
        [[126, "GB"]],
        [[96, "VIS"], [126, "AMAZON.CO.UK"], [405, "34.99", "r"]],
        [[126, "AMAZON.CO.UK"]],
        [[96, "CR"], [126, "ACME LTD"], [478, "2,500.00", "r"], [555, "3,676.07", "r"]],
        [[126, "SALARY JAN 26"]],
      ]),
    ]);
    expect(byDate(result.rows).map((row) => [row.amount, row.description])).toEqual([
      [-23.5, "TESCO STORES 2423 LONDON GB VIS"],
      [-34.99, "AMAZON.CO.UK AMAZON.CO.UK VIS"],
      [2500, "ACME LTD SALARY JAN 26 CR"],
    ]);
  });

  test("keeps a plain continuation line with its row when the next row has a payee of its own (HSBC)", () => {
    const result = parse([
      layout([
        [[40, "HSBC UK"], [300, "2 January to 31 January 2026"]],
        [[40, "Date"], [96, "Payment type and details"], [405, "Paid out", "r"], [478, "Paid in", "r"], [555, "Balance", "r"]],
        [[126, "BALANCE BROUGHT FORWARD"], [555, "1,234.56", "r"]],
        [[40, "10 Jan 26"], [96, "VIS"], [126, "SAINSBURYS S/MKTS"], [405, "46.12", "r"]],
        [[126, "LONDON"]],
        [[96, "VIS"], [126, "AMAZON.CO.UK"], [405, "34.99", "r"], [555, "1,153.45", "r"]],
      ]),
    ]);
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.description])).toEqual([
      ["2026-01-10", -46.12, "SAINSBURYS S/MKTS LONDON VIS"],
      ["2026-01-10", -34.99, "AMAZON.CO.UK VIS"],
    ]);
  });

  test("headers and figures the PDF ran together into single strings", () => {
    const result = parse([
      layout([
        [[40, "Nationwide Building Society"], [300, "Statement date 31 January 2026"]],
        [[40, "Date"], [110, "Description"], [555, "Paid in Withdrawn Balance", "r"]],
        [[110, "Opening balance"], [555, "500.00", "r"]],
        [[40, "02 Jan 2026"], [110, "Tesco Stores"], [555, "23.50 476.50", "r"]],
        [[40, "05 Jan 2026"], [110, "Acme Ltd Salary"], [555, "2,100.00 2,576.50", "r"]],
      ]),
    ]);
    expect(result.layout).toBe("columns");
    expect(result.detectedColumns).toMatchObject({ credit: "Paid in", debit: "Withdrawn" });
    expect(byDate(result.rows).map((row) => [row.date, row.amount])).toEqual([
      ["2026-01-02", -23.5],
      ["2026-01-05", 2100],
    ]);
  });

  test("falls back to reading whole lines when the PDF merges each row into one string", () => {
    const lines = [
      "Barclays Bank UK PLC                 Statement period 13 December 2025 to 12 January 2026",
      "Date     Description                                    Money out £   Money in £     Balance £",
      "         Start balance                                                               1,234.56",
      "15 Dec   Direct Debit to British Gas                         85.00                   1,149.56",
      "         Ref: 601234567890",
      "15 Dec   Card Payment to Tesco Stores 2423                   23.50                   1,126.06",
      "18 Dec   Received From Acme Ltd                                          2,500.00    3,626.06",
      "         End balance                                                                 3,626.06",
      "Page 1 of 1",
    ];
    const result = parse([{ pageNumber: 1, items: lines.map((text, index) => ({ text, x: 40, y: 800 - index * 12, width: text.length * 4.5, height: 9 })) }]);
    expect(result.layout).toBe("lines");
    expect(byDate(result.rows).map((row) => [row.date, row.amount, row.name])).toEqual([
      ["2025-12-15", -85, "British Gas"],
      ["2025-12-15", -23.5, "Tesco Stores"],
      ["2025-12-18", 2500, "Acme"],
    ]);
  });
});

test.describe("Statement text helpers", () => {
  test("finds the statement period in the wordings banks use", () => {
    expect(detectStatementPeriod("Statement period 13 December 2025 to 12 January 2026")).toEqual({
      start: { year: 2025, month: 12, day: 13 },
      end: { year: 2026, month: 1, day: 12 },
    });
    // HSBC leaves the year off the first date.
    expect(detectStatementPeriod("2 January to 31 January 2026")).toMatchObject({ start: { year: 2026, month: 1, day: 2 }, end: { year: 2026, month: 1, day: 31 } });
    expect(detectStatementPeriod("15 December to 14 January 2026")).toMatchObject({ start: { year: 2025, month: 12, day: 15 } });
    expect(detectStatementPeriod("01/01/2026 – 31/01/2026")).toEqual({ start: { year: 2026, month: 1, day: 1 }, end: { year: 2026, month: 1, day: 31 } });
    expect(detectStatementPeriod("January 1, 2026 through January 31, 2026")).toMatchObject({ end: { year: 2026, month: 1, day: 31 } });
    // A statement date alone anchors the year of the rows above it.
    expect(detectStatementPeriod("Statement date: 12 January 2026")).toMatchObject({ end: { year: 2026, month: 1, day: 12 } });
    expect(detectStatementPeriod("Your transactions")).toBeNull();
  });

  test("gives a date with no year the year that puts it nearest the statement period", () => {
    const period = "Statement period 13 December 2025 to 12 January 2026";
    const parse = (text: string) =>
      parsePdfStatementWithDetection({
        pages: [
          layout([
            [[40, "Barclays"], [300, period]],
            [[40, "Date"], [110, "Description"], [470, "Money out", "r"], [555, "Balance", "r"]],
            [[40, text], [110, "Tesco Stores"], [470, "23.50", "r"], [555, "476.50", "r"]],
          ]),
        ],
        fileName: "x.pdf",
        state: createInitialState(),
        fallbackMonthKey: "2026-01",
      }).rows[0]?.date;
    expect(parse("15 Dec")).toBe("2025-12-15");
    expect(parse("2 Jan")).toBe("2026-01-02");
    // The day after the period closes is still the later year, not eleven months earlier.
    expect(parse("13 Jan")).toBe("2026-01-13");
    expect(parse("30 Nov")).toBe("2025-11-30");
    // Well past the end but much nearer to it than to the start: later year.
    expect(parse("1 Feb")).toBe("2026-02-01");
    // A printed year always beats inference.
    expect(parse("15 Dec 24")).toBe("2024-12-15");
    expect(parse("15/12/2024")).toBe("2024-12-15");
  });

  test("without a statement period, a date with no year takes the month being imported into", () => {
    const pages = [
      layout([
        [[40, "Some Bank"], [300, "Your transactions"]],
        [[40, "Date"], [110, "Description"], [470, "Money out", "r"], [555, "Balance", "r"]],
        [[40, "15 Dec"], [110, "Tesco Stores"], [470, "23.50", "r"], [555, "476.50", "r"]],
        [[40, "3 Jan"], [110, "Costa Coffee"], [470, "4.35", "r"], [555, "472.15", "r"]],
      ]),
    ];
    const dates = (fallbackMonthKey: string) =>
      byDate(parsePdfStatementWithDetection({ pages, fileName: "x.pdf", state: createInitialState(), fallbackMonthKey }).rows).map((row) => row.date);
    expect(dates("2026-01")).toEqual(["2025-12-15", "2026-01-03"]);
    expect(dates("2025-12")).toEqual(["2025-12-15", "2025-01-03"]);
  });

  test("names the issuer from the letterhead, not from the transactions", async () => {
    expect(detectStatementBank("Barclays Bank UK PLC")).toBe("Barclays");
    expect(detectStatementBank("Barclaycard Platinum")).toBe("Barclaycard");
    expect(detectStatementBank("first direct is a division of HSBC UK Bank plc")).toBe("first direct");
    expect(detectStatementBank("Monzo Bank Limited")).toBe("Monzo");
    expect(detectStatementBank("Dear customer")).toBeUndefined();
    // Every fixture pays a Barclaycard bill; only the Barclays one is a Barclays statement.
    expect((await parseFixture("hsbc-bank-account.pdf")).bank).toBe("HSBC");
    expect((await parseFixture("monzo-personal-account.pdf")).bank).toBe("Monzo");
  });

  test("groups positioned text into lines and cells", () => {
    const page = layout([[[40, "02 Jan 26"], [96, "DD"], [126, "BRITISH GAS"], [405, "85.00", "r"]]]);
    // A word-sized gap keeps a cell together; a column-sized gap splits it.
    page.items.push({ text: "LTD", x: 126 + "BRITISH GAS".length * 4.5 + 3, y: 800, width: 13.5, height: 9 });
    const [line] = groupTextLines(page);
    expect(line.cells.map((cell) => cell.text)).toEqual(["02 Jan 26", "DD", "BRITISH GAS LTD", "85.00"]);
  });

  test("recognises a PDF by its bytes, whatever the file is called", () => {
    expect(looksLikePdf(new TextEncoder().encode("%PDF-1.4\n%âãÏÓ"), "statement.dat")).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("Date,Description,Amount"), "statement.pdf")).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("Date,Description,Amount"), "statement.csv")).toBe(false);
  });
});
