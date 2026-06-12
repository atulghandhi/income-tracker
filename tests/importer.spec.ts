import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/finance";
import { buildRulePattern, createTransactionHash, parseBankCsv } from "../src/importer";

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
