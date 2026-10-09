import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/finance";
import { buildRulePattern, cleanMerchantName, createTransactionHash, parseBankCsv, parseLooseLines, tidyImportedNames } from "../src/importer";

test.describe("CSV bank importer", () => {
  test("parses quoted debit and credit rows, categorizes them, and warns on duplicates", () => {
    const state = createInitialState();
    const duplicateHash = createTransactionHash("2026-05-21", "Tesco, Express", -23.5);
    state.months["2026-05"] = {
      incomes: [],
      expenses: [
        {
          id: "expense-existing",
          name: "Tesco, Express",
          amount: 23.5,
          category: "Food",
          color: "#12b886",
          date: "2026-05-21",
          imported: {
            batchId: "batch-existing",
            fileName: "old.csv",
            rowNumber: 2,
            hash: duplicateHash,
            originalDescription: "Tesco, Express",
            importedAt: "2026-05-21T00:00:00.000Z",
          },
        },
      ],
      note: "",
    };

    const result = parseBankCsv({
      fileName: "bank.csv",
      state,
      text: [
        "Date,Description,Debit,Credit",
        "21/05/2026,\"Tesco, Express\",23.50,",
        "22/05/2026,ACME Payroll,,2500.00",
        "23/05/2026,Transfer to savings,200.00,",
      ].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.detectedColumns).toMatchObject({
      date: "Date",
      description: "Description",
      debit: "Debit",
      credit: "Credit",
    });
    expect(result.rows).toHaveLength(3);
    expect(result.rows.find((row) => row.description === "Tesco, Express")).toMatchObject({
      amount: -23.5,
      category: "Food",
      kind: "expense",
      duplicate: true,
      include: false,
    });
    expect(result.rows.find((row) => row.description === "ACME Payroll")).toMatchObject({
      amount: 2500,
      category: "Income",
      kind: "income",
      include: true,
    });
    expect(result.rows.find((row) => row.description === "Transfer to savings")).toMatchObject({
      category: "Transfers",
      kind: "transfer",
      include: false,
    });
  });

  test("uses saved category rules before generic system rules", () => {
    const state = createInitialState();
    state.categoryRules = [
      {
        id: "rule-1",
        pattern: "pret",
        category: "Work lunch",
        kind: "expense",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    const result = parseBankCsv({
      fileName: "bank.csv",
      state,
      text: ["Transaction Date,Payee,Amount", "2026-05-21,PRET A MANGER,-8.40"].join("\n"),
    });

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      category: "Work lunch",
      kind: "expense",
      confidence: 0.96,
      include: true,
    });
    expect(buildRulePattern("PRET A MANGER 1234")).toBe("pret manger");
  });
});

test.describe("Pasted statement lines (PDF copy and paste)", () => {
  test("ignores a running balance column and keeps the transaction amount", () => {
    const state = createInitialState();
    const result = parseLooseLines({
      text: ["12 Jun 2026  TESCO STORES 3241  42.61  1,234.56", "15 Jun 2026  ACME PAYROLL  +2,500.00  3,734.56"].join("\n"),
      fileName: "Pasted transactions",
      state,
      fallbackMonthKey: "2026-06",
    });

    expect(result.errors).toEqual([]);
    expect(result.rows.find((row) => row.description.includes("TESCO"))).toMatchObject({ amount: -42.61, date: "2026-06-12" });
    expect(result.rows.find((row) => row.description.includes("PAYROLL"))).toMatchObject({ amount: 2500, date: "2026-06-15" });
  });

  test("gives day-month dates the year of the month being imported into", () => {
    const state = createInitialState();
    const june = parseLooseLines({ text: "13 Jun  COSTA COFFEE  4.35", fileName: "Pasted transactions", state, fallbackMonthKey: "2026-06" });
    expect(june.rows[0]).toMatchObject({ amount: -4.35, date: "2026-06-13" });

    // A December statement pasted while looking at January belongs to the previous year.
    const december = parseLooseLines({ text: "28 Dec  RENT  950.00", fileName: "Pasted transactions", state, fallbackMonthKey: "2027-01" });
    expect(december.rows[0]).toMatchObject({ amount: -950, date: "2026-12-28" });
  });

  test("reads month-name dates like 12-Sep-26 in CSV files", () => {
    const state = createInitialState();
    const result = parseBankCsv({
      fileName: "metro.csv",
      state,
      text: ["Booking Date,Transaction Reference,Money In/Out", "12-Sep-26,PRET A MANGER,-8.40", "01 Sep 2026,SALARY,\"2,100.00\""].join("\n"),
    });
    expect(result.errors).toEqual([]);
    expect(result.rows.find((row) => row.description.includes("PRET"))).toMatchObject({ amount: -8.4, date: "2026-09-12" });
    expect(result.rows.find((row) => row.description.includes("SALARY"))).toMatchObject({ amount: 2100, date: "2026-09-01" });
  });
});

test.describe("Display names for bank descriptors", () => {
  test("shortens raw bank text to the merchant a person recognises", () => {
    const cases: [string, string][] = [
      ["4332 07OCT26 , BARCLAYCARD , LONDON GB", "Barclaycard"],
      ["BARCLAYS BANK UK", "Barclays Bank"],
      ["4332 07OCT26 CD , TESCO STORES 3412 , LONDON GB", "Tesco Stores"],
      ["SAINSBURYS S/MKTS ON 12 MAR CLP", "Sainsbury's"],
      ["NETFLIX.COM ON 01 MAY BCC", "Netflix"],
      ["BRITISH GAS 23876281 DDR", "British Gas"],
      ["CARD PAYMENT TO TESCO STORES 3412,12.34 GBP, RATE 1.00/GBP ON 02-10-2026", "Tesco Stores"],
      ["DIRECT DEBIT PAYMENT TO OCTOPUS ENERGY REF 123456, MANDATE NO 0012", "Octopus Energy"],
      ["AMZN MKTP UK*AB12CD3", "Amazon"],
      ["PAYPAL *EBAY", "eBay"],
      ["4332 07OCT26 , SQ *FLAT WHITE COFFEE , MANCHESTER GB", "Flat White Coffee"],
      ["HMRC GOV.UK SA", "HMRC SA"],
    ];
    for (const [raw, expected] of cases) expect(cleanMerchantName(raw), raw).toBe(expected);
  });

  test("leaves names that already read well untouched", () => {
    for (const name of ["Pret A Manger", "ACME Payroll", "Transfer to savings", "Tesco, Express"]) {
      expect(cleanMerchantName(name)).toBe(name);
    }
  });

  test("keeps the raw description for matching while the row carries the short name", () => {
    const result = parseBankCsv({
      fileName: "barclays.csv",
      state: createInitialState(),
      text: ["Date,Memo,Amount", "07/10/2026,\"4332 07OCT26 , BARCLAYCARD , LONDON GB\",-120.00"].join("\n"),
    });
    expect(result.rows[0]).toMatchObject({
      description: "4332 07OCT26 , BARCLAYCARD , LONDON GB",
      name: "Barclaycard",
    });
  });

  test("retroactively renames untouched imports and their seeded copies, not user edits", () => {
    const raw = "4332 07OCT26 , BARCLAYCARD , LONDON GB";
    const imported = (originalDescription: string) => ({
      batchId: "b",
      fileName: "f.csv",
      rowNumber: 1,
      hash: "h",
      originalDescription,
      importedAt: "2026-10-07T00:00:00.000Z",
    });
    const months = {
      "2026-10": {
        incomes: [{ id: "i1", source: "ACME LTD SALARY BGC", amount: 2500, color: "#000", date: "2026-10-01", imported: imported("ACME LTD SALARY BGC") }],
        expenses: [
          { id: "e1", name: raw, amount: 120, category: "Debt payments", color: "#000", date: "2026-10-07", imported: imported(raw) },
          { id: "e2", name: "My card bill", amount: 50, category: "Bills", color: "#000", date: "2026-10-08", imported: imported("BARCLAYS BANK UK") },
          { id: "e3", name: "BARCLAYS BANK UK", amount: 9, category: "Bills", color: "#000" },
        ],
        note: "",
      },
      "2026-11": {
        incomes: [],
        expenses: [{ id: "e4", name: raw, amount: 120, category: "Debt payments", color: "#000", seededFrom: { monthKey: "2026-10", entryId: "e1" } }],
        note: "",
      },
    };

    const tidied = tidyImportedNames(months);
    expect(tidied["2026-10"].incomes[0].source).toBe("Acme Salary");
    expect(tidied["2026-10"].expenses.map((expense) => expense.name)).toEqual(["Barclaycard", "My card bill", "BARCLAYS BANK UK"]);
    expect(tidied["2026-10"].expenses[0].imported?.originalDescription).toBe(raw);
    expect(tidied["2026-11"].expenses[0].name).toBe("Barclaycard");
    expect(tidyImportedNames(tidied)).toEqual(tidied);
  });
});
