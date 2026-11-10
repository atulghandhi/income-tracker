import { expect, test } from "@playwright/test";
import { findLedgerDuplicates, keepDuplicateGroupApart, keepRowApart, matchLedgerEntries, mergeDuplicateGroup } from "../src/dedupe";
import { createInitialState, seedMonthFromPrevious } from "../src/finance";
import { parseBankText, type CsvImportRow } from "../src/importer";
import type { ExpenseEntry, ImportedTransactionMeta, IncomeEntry, LedgerState } from "../src/types";

const MONTH = "2026-11";

function income(overrides: Partial<IncomeEntry>): IncomeEntry {
  return { id: `income-${Math.random()}`, source: "Salary", amount: 2850, color: "#2f7fdd", recurring: true, ...overrides };
}

function expense(overrides: Partial<ExpenseEntry>): ExpenseEntry {
  return { id: `expense-${Math.random()}`, name: "Rent", category: "Home", amount: 1200, color: "#1baf7a", recurring: true, ...overrides };
}

function imported(description: string, overrides: Partial<ImportedTransactionMeta> = {}): ImportedTransactionMeta {
  return { batchId: "batch-1", fileName: "bank.csv", rowNumber: 1, hash: `hash-${description}`, originalDescription: description, importedAt: "2026-11-05T00:00:00Z", ...overrides };
}

function ledger(incomes: IncomeEntry[], expenses: ExpenseEntry[] = [], monthKey = MONTH): LedgerState {
  const state = createInitialState();
  state.selectedMonth = monthKey;
  state.months = { [monthKey]: { incomes, expenses, note: "" } };
  return state;
}

// Parse a debit/credit CSV and run it through the matcher, as the import review does.
function review(state: LedgerState, lines: string[]): CsvImportRow[] {
  const result = parseBankText({ text: ["Date,Description,Debit,Credit", ...lines].join("\n"), fileName: "bank.csv", state });
  return matchLedgerEntries(result.rows, state);
}

function rowFor(rows: CsvImportRow[], text: string): CsvImportRow {
  const row = rows.find((candidate) => candidate.description.includes(text));
  if (!row) throw new Error(`No row for ${text}`);
  return row;
}

test.describe("matchLedgerEntries: a bank row against the user's own entry", () => {
  test("a typed recurring salary is replaced by the bank's salary, whatever the bank calls it", () => {
    const salary = income({ id: "salary", source: "Salary", amount: 2850 });
    const rows = review(ledger([salary]), ["28/11/2026,BGC ACME CORP LTD,,2861.20", "03/11/2026,TESCO STORES 3412,23.50,"]);

    const row = rowFor(rows, "ACME");
    expect(row.replaces).toMatchObject({ entryId: "salary", kind: "income", basis: "amount", label: "Salary" });
    expect(row.name).toBe("Salary");
    expect(row.include).toBe(true);
    expect(row.note).toContain("replaces it");
    // An amount-only match is surfaced for a glance, never hidden with the rule matches.
    expect(row.confidence).toBeLessThan(0.9);
    expect(rowFor(rows, "TESCO").replaces).toBeUndefined();
  });

  test("the pay estimator's row is matched on the word it shares with the bank text", () => {
    const salary = income({ id: "salary", source: "Salary (take-home)", amount: 3000 });
    const rows = review(ledger([salary]), ["28/11/2026,ACME LTD SALARY NOV,,3420.00"]);
    expect(rowFor(rows, "ACME").replaces).toMatchObject({ entryId: "salary", basis: "name" });
  });

  test("an income far from the planned amount and unrelated by name is left alone", () => {
    const rows = review(ledger([income({ source: "Salary", amount: 2850 })]), ["12/11/2026,MR J SMITH,,40.00"]);
    expect(rowFor(rows, "SMITH").replaces).toBeUndefined();
  });

  test("bank text folded into a name once is recognised the next month, even in a bonus month", () => {
    const state = ledger([income({ id: "seeded", source: "Salary", amount: 2861.2, seededFrom: { monthKey: "2026-10", entryId: "october" } })]);
    state.months["2026-10"] = {
      incomes: [income({ id: "october", source: "Salary", amount: 2861.2, date: "2026-10-28", imported: imported("BGC ACME CORP LTD") })],
      expenses: [],
      note: "",
    };
    const rows = review(state, ["27/11/2026,BGC ACME CORP LTD,,4100.00"]);
    expect(rowFor(rows, "ACME").replaces).toMatchObject({ entryId: "seeded", basis: "name" });
  });

  test("a planned bill is matched by exact amount when the names differ", () => {
    const rent = expense({ id: "rent", name: "Rent", category: "Home", amount: 1200 });
    const rows = review(ledger([], [rent]), ["01/11/2026,MR J SMITH LETTINGS REF 4471,1200.00,"]);
    const row = rowFor(rows, "SMITH");
    expect(row.replaces).toMatchObject({ entryId: "rent", basis: "amount" });
    expect(row.name).toBe("Rent");
    expect(row.category).toBe("Home");
  });

  test("a planned bill is matched by name when the amount moved", () => {
    const gas = expense({ id: "gas", name: "British Gas", category: "Bills", amount: 80, seededFrom: { monthKey: "2026-10", entryId: "x" } });
    const rows = review(ledger([], [gas]), ["04/11/2026,BRITISH GAS DD 8841,84.20,"]);
    expect(rowFor(rows, "BRITISH").replaces).toMatchObject({ entryId: "gas", basis: "name" });
  });

  test("a name match needs money of about the same size", () => {
    const car = expense({ id: "car", name: "Car", category: "Travel", amount: 250 });
    const rows = review(ledger([], [car]), ["04/11/2026,CAR PARK NCP,4.50,"]);
    expect(rowFor(rows, "CAR PARK").replaces).toBeUndefined();
  });

  test("an expense that differs in both name and amount is not guessed at", () => {
    const power = expense({ id: "power", name: "Electricity", category: "Bills", amount: 85 });
    const rows = review(ledger([], [power]), ["04/11/2026,OCTOPUS ENERGY,91.20,"]);
    expect(rowFor(rows, "OCTOPUS").replaces).toBeUndefined();
  });

  test("several bank rows can stand for one planned row", () => {
    const wages = income({ id: "wages", source: "Wages", amount: 1600 });
    const rows = review(ledger([wages]), [
      "06/11/2026,ACME WAGES WK45,,400.00",
      "13/11/2026,ACME WAGES WK46,,400.00",
      "20/11/2026,ACME WAGES WK47,,400.00",
      "27/11/2026,ACME WAGES WK48,,400.00",
    ]);
    expect(rows.filter((row) => row.replaces?.entryId === "wages")).toHaveLength(4);
  });

  test("two planned rows of one name take a bank row each, and one row replaces only one", () => {
    const first = income({ id: "job-a", source: "Acme salary", amount: 2000 });
    const second = income({ id: "job-b", source: "Acme expenses", amount: 150 });
    const both = review(ledger([first, second]), ["27/11/2026,ACME LTD,,2000.00", "28/11/2026,ACME LTD,,141.10"]);
    expect(both.find((row) => row.amount === 2000)?.replaces?.entryId).toBe("job-a");
    expect(both.find((row) => row.amount === 141.1)?.replaces?.entryId).toBe("job-b");

    const twins = [income({ id: "one", source: "Salary", amount: 2000 }), income({ id: "two", source: "Salary", amount: 2000 })];
    const single = review(ledger(twins), ["27/11/2026,ACME SALARY,,2000.00"]);
    expect(single.filter((row) => row.replaces)).toHaveLength(1);
  });

  test("a one-off typed by hand is matched by amount within a few days only", () => {
    const coffee = expense({ id: "coffee", name: "Coffee", category: "Food", amount: 3.5, recurring: false, date: "2026-11-03" });
    const near = review(ledger([], [coffee]), ["04/11/2026,PRET A MANGER,3.50,"]);
    expect(rowFor(near, "PRET").replaces).toMatchObject({ entryId: "coffee", basis: "amount" });
    expect(rowFor(near, "PRET").note).toContain("added by hand");

    const far = review(ledger([], [coffee]), ["20/11/2026,PRET A MANGER,3.50,"]);
    expect(rowFor(far, "PRET").replaces).toBeUndefined();
  });

  test("rows in other months, transfers and linked debt payments are left to their own logic", () => {
    const state = ledger([income({ id: "salary", amount: 2850 })], [expense({ id: "planned", name: "Visa payment", amount: 100, debtAccountId: "card", scheduledPayment: true })]);
    const rows = review(state, ["28/10/2026,BGC ACME CORP LTD,,2850.00", "12/11/2026,SOMETHING ELSE,100.00,"]);
    expect(rows.every((row) => !row.replaces)).toBe(true);
  });

  test("keep both puts the row back as parsed and remembers the entry", () => {
    const rent = expense({ id: "rent", name: "Rent", category: "Home", amount: 1200 });
    const [row] = review(ledger([], [rent]), ["01/11/2026,MR J SMITH,1200.00,"]);
    const apart = keepRowApart(row);
    expect(apart.replaces).toBeUndefined();
    expect(apart.name).toBe("Mr J Smith");
    expect(apart.category).toBe("Unsorted");
    expect(apart.keptApartFrom).toBe("rent");
  });
});

test.describe("matchLedgerEntries: the same bank transaction from another export", () => {
  test("same day, same amount and similar wording is a duplicate even when the hash differs", () => {
    const tesco = expense({ id: "t", name: "Tesco", category: "Food", amount: 23.5, recurring: false, date: "2026-11-03", imported: imported("TESCO STORES 3412 LONDON GB") });
    const rows = review(ledger([], [tesco]), ["03/11/2026,CARD PAYMENT TO TESCO STORES 3412,23.50,", "03/11/2026,BOOTS 1182,23.50,"]);
    expect(rowFor(rows, "TESCO")).toMatchObject({ duplicate: true, include: false });
    expect(rowFor(rows, "TESCO").note).toContain("Already imported");
    expect(rowFor(rows, "BOOTS").duplicate).toBe(false);
  });

  test("one ledger entry accounts for one row: a second equal row still imports", () => {
    const fare = expense({ id: "f", name: "TfL", category: "Travel", amount: 1.75, recurring: false, date: "2026-11-03", imported: imported("TFL TRAVEL CH LONDON") });
    const rows = review(ledger([], [fare]), ["03/11/2026,TFL TRAVEL CHARGE TFL.GOV.UK/CP,1.75,", "03/11/2026,TFL TRAVEL CHARGE TFL.GOV.UK/CP,1.75,"]);
    expect(rows.filter((row) => row.duplicate)).toHaveLength(1);
  });
});

test.describe("findLedgerDuplicates: doubles already in the ledger", () => {
  const bankSalary = () => income({ id: "bank", source: "Acme Corp", amount: 2861.2, recurring: false, date: "2026-11-28", imported: imported("BGC ACME CORP LTD") });

  test("a planned salary beside its imported twin is raised, and merging leaves one that still repeats", () => {
    const state = ledger([income({ id: "typed", source: "Salary", amount: 2850 }), bankSalary()]);
    const groups = findLedgerDuplicates(state, MONTH);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reason: "planned", kind: "income", remove: { entryId: "typed" }, keep: [{ entryId: "bank" }] });

    const merged = mergeDuplicateGroup(state, groups[0]);
    expect(merged.months[MONTH].incomes).toHaveLength(1);
    expect(merged.months[MONTH].incomes[0]).toMatchObject({ id: "bank", source: "Salary", amount: 2861.2, recurring: true });
    expect(findLedgerDuplicates(merged, MONTH)).toHaveLength(0);

    // Next month carries one salary forward, not two.
    const next = seedMonthFromPrevious(merged.months[MONTH], { fromMonthKey: MONTH, toMonthKey: "2026-12" });
    expect(next.incomes).toHaveLength(1);
  });

  test("keep both is remembered", () => {
    const state = ledger([income({ id: "typed", source: "Salary", amount: 2850 }), bankSalary()]);
    const kept = keepDuplicateGroupApart(state, findLedgerDuplicates(state, MONTH)[0]);
    expect(kept.months[MONTH].incomes).toHaveLength(2);
    expect(findLedgerDuplicates(kept, MONTH)).toHaveLength(0);
  });

  test("the same typed row twice is raised; removing one keeps the first", () => {
    const state = ledger([], [expense({ id: "a", name: "Gym", amount: 30 }), expense({ id: "b", name: "gym", amount: 30 }), expense({ id: "c", name: "Gym", amount: 45 })]);
    const groups = findLedgerDuplicates(state, MONTH);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reason: "repeat", remove: { entryId: "b" } });
    expect(mergeDuplicateGroup(state, groups[0]).months[MONTH].expenses.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  test("a statement imported twice is raised, but twins inside one statement are not", () => {
    const fare = (id: string, batchId: string) =>
      expense({ id, name: "TfL", category: "Travel", amount: 1.75, recurring: false, date: "2026-11-03", imported: imported("TFL TRAVEL CH", { batchId }) });
    expect(findLedgerDuplicates(ledger([], [fare("a", "one"), fare("b", "one")]), MONTH)).toHaveLength(0);
    const groups = findLedgerDuplicates(ledger([], [fare("a", "one"), fare("b", "two")]), MONTH);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ reason: "repeat", remove: { entryId: "b", imported: true } });
  });

  test("an ordinary month raises nothing", () => {
    const state = ledger(
      [bankSalary()],
      [
        expense({ id: "rent", name: "Rent", amount: 1200 }),
        expense({ id: "t1", name: "Tesco", category: "Food", amount: 23.5, recurring: false, date: "2026-11-03", imported: imported("TESCO STORES 3412") }),
        expense({ id: "t2", name: "Tesco", category: "Food", amount: 41.1, recurring: false, date: "2026-11-10", imported: imported("TESCO STORES 3412 B") }),
      ],
    );
    expect(findLedgerDuplicates(state, MONTH)).toHaveLength(0);
  });
});
