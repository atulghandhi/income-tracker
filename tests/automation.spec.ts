import { expect, test } from "@playwright/test";
import { createInitialState, seedMonthFromPrevious } from "../src/finance";
import { canonicalizeMerchant, parseBankText, parseLooseLines, parseOfx, parseQif, suggestCategory } from "../src/importer";
import { buildMerchantMemory } from "../src/merchantMemory";
import { parseQuickAdd } from "../src/quickAdd";
import { detectRecurringCandidates, findMissedRecurring, reconcileSeededEntries, suggestRecurringFlags } from "../src/recurrence";
import type { ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "../src/types";

function income(overrides: Partial<IncomeEntry>): IncomeEntry {
  return {
    id: `income-${Math.random()}`,
    source: "Salary",
    amount: 2400,
    color: "#2f7fdd",
    recurring: true,
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseEntry>): ExpenseEntry {
  return {
    id: `expense-${Math.random()}`,
    name: "Rent",
    category: "Home",
    amount: 950,
    color: "#1baf7a",
    recurring: true,
    ...overrides,
  };
}

function month(incomes: IncomeEntry[], expenses: ExpenseEntry[]): MonthBudget {
  return { incomes, expenses, note: "" };
}

// ─── A1: recurring auto-seed ─────────────────────────────────────────────────

test.describe("seedMonthFromPrevious", () => {
  test("copies recurring entries forward with fresh ids, clamped dates, and seededFrom refs", () => {
    const previous = month(
      [income({ id: "inc-1", date: "2026-05-31" })],
      [expense({ id: "exp-1", date: "2026-05-01" }), expense({ id: "exp-2", name: "One-off gig", recurring: false })],
    );

    const seeded = seedMonthFromPrevious(previous, { fromMonthKey: "2026-05", toMonthKey: "2026-06" });

    expect(seeded.incomes).toHaveLength(1);
    expect(seeded.expenses).toHaveLength(1); // one-off stays behind
    expect(seeded.incomes[0].id).not.toBe("inc-1");
    expect(seeded.incomes[0].date).toBe("2026-06-30"); // 31st clamps to June's 30
    expect(seeded.incomes[0].seededFrom).toEqual({ monthKey: "2026-05", entryId: "inc-1" });
    expect(seeded.expenses[0].date).toBe("2026-06-01");
    expect(seeded.expenses[0].recurring).toBe(true);
  });

  test("does not seed when navigating backwards, and stays empty without context", () => {
    const previous = month([income({})], [expense({})]);
    const backwards = seedMonthFromPrevious(previous, { fromMonthKey: "2026-05", toMonthKey: "2026-04" });
    expect(backwards.incomes).toHaveLength(0);
    expect(backwards.expenses).toHaveLength(0);

    const noContext = seedMonthFromPrevious(previous);
    expect(noContext.incomes).toHaveLength(0);
  });

  test("drops imported metadata on seeded copies", () => {
    const previous = month(
      [],
      [
        expense({
          id: "exp-1",
          date: "2026-05-15",
          imported: {
            batchId: "b",
            fileName: "f.csv",
            rowNumber: 1,
            hash: "h",
            originalDescription: "RENT",
            importedAt: "2026-05-15T00:00:00Z",
          },
        }),
      ],
    );
    const seeded = seedMonthFromPrevious(previous, { fromMonthKey: "2026-05", toMonthKey: "2026-06" });
    expect(seeded.expenses[0].imported).toBeUndefined();
  });
});

// ─── A2: merchant memory ─────────────────────────────────────────────────────

test.describe("merchant memory", () => {
  function stateWithHistory(): LedgerState {
    const state = createInitialState();
    state.months["2026-04"] = month([], [expense({ name: "Netflix", category: "Subscriptions", amount: 10.99, recurring: false })]);
    state.months["2026-05"] = month(
      [income({ source: "Acme Payroll", amount: 2400 })],
      [expense({ name: "NETFLIX.COM", category: "Subscriptions", amount: 10.99, recurring: false })],
    );
    return state;
  }

  test("groups descriptor variants, remembers category and stable amount", () => {
    const memory = buildMerchantMemory(stateWithHistory());
    const netflix = memory.find("expense", "Netflix");
    expect(netflix).toBeTruthy();
    expect(netflix!.category).toBe("Subscriptions");
    expect(netflix!.stableAmount).toBe(10.99);
    expect(netflix!.count).toBe(2);
  });

  test("suggests by substring and ranks by frequency", () => {
    const memory = buildMerchantMemory(stateWithHistory());
    const hits = memory.suggest("expense", "net");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].label.toLowerCase()).toContain("netflix");
  });
});

// ─── A3: quick add parser ────────────────────────────────────────────────────

test.describe("quick add parser", () => {
  const state = createInitialState();
  state.months["2026-05"] = month([], [expense({ name: "Costa Coffee", category: "Eating out", amount: 4.35, recurring: false })]);
  const memory = buildMerchantMemory(state);
  const options = { state, memory, monthKey: "2026-06", today: new Date("2026-06-15T12:00:00") };

  test("parses merchant + amount and reuses the remembered category", () => {
    const result = parseQuickAdd("costa coffee 4.35", options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.kind).toBe("expense");
    expect(result.draft.amount).toBe(4.35);
    expect(result.draft.category).toBe("Eating out");
  });

  test("parses recurring keyword and income wording", () => {
    const result = parseQuickAdd("salary 2400 recurring", options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.kind).toBe("income");
    expect(result.draft.recurring).toBe(true);
  });

  test("parses date hints", () => {
    const yesterday = parseQuickAdd("tesco 42.61 yesterday", options);
    expect(yesterday.ok).toBe(true);
    if (yesterday.ok) expect(yesterday.draft.date).toBe("2026-06-14");

    const ordinal = parseQuickAdd("rent 950 on 1st", options);
    expect(ordinal.ok).toBe(true);
    if (ordinal.ok) expect(ordinal.draft.date).toBe("2026-06-01");
  });

  test("rejects input without an amount", () => {
    const result = parseQuickAdd("just words", options);
    expect(result.ok).toBe(false);
  });
});

// ─── B3: canonicalization + fuzzy rule matching ──────────────────────────────

test.describe("fuzzy merchant matching", () => {
  test("canonicalizes UK descriptor variants", () => {
    expect(canonicalizeMerchant("AMZN MKTP GB*AB12CD")).toContain("amazon");
    expect(canonicalizeMerchant("SBUX 4421 LONDON")).toContain("starbucks");
  });

  test("a saved amazon rule catches AMZN MKTP at reduced confidence", () => {
    const rules = [
      {
        id: "r1",
        pattern: "amazon",
        category: "Shopping",
        kind: "expense" as const,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const suggestion = suggestCategory("AMZN MKTP GB*AB12CD", -25, rules, "");
    expect(suggestion.category).toBe("Shopping");
    expect(suggestion.confidence).toBeGreaterThanOrEqual(0.85);
    expect(suggestion.source).toBe("rule");
  });
});

// ─── A4/B4: paste + OFX/QIF formats ─────────────────────────────────────────

test.describe("multi-format parsing", () => {
  test("loose pasted lines parse with assumed-spending sign", () => {
    const state = createInitialState();
    const result = parseLooseLines({
      text: ["13/06/2026  TESCO EXTRA 4261  42.61", "12/06/2026  SOUTHERN RAIL  12.40"].join("\n"),
      fileName: "paste",
      state,
      fallbackMonthKey: "2026-06",
    });
    expect(result.rows).toHaveLength(2);
    const tesco = result.rows.find((row) => row.description.includes("TESCO"));
    expect(tesco).toBeTruthy();
    expect(tesco!.amount).toBe(-42.61);
    expect(tesco!.date).toBe("2026-06-13");
    expect(tesco!.category).toBe("Food");
  });

  test("OFX statements parse with FITID-backed dedupe hashes", () => {
    const state = createInitialState();
    const ofx = [
      "OFXHEADER:100",
      "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>",
      "<STMTTRN>",
      "<TRNTYPE>DEBIT",
      "<DTPOSTED>20260610",
      "<TRNAMT>-23.50",
      "<FITID>TXN-001",
      "<NAME>TESCO STORES",
      "</STMTTRN>",
      "<STMTTRN>",
      "<TRNTYPE>CREDIT",
      "<DTPOSTED>20260612",
      "<TRNAMT>2500.00",
      "<FITID>TXN-002",
      "<NAME>ACME PAYROLL",
      "</STMTTRN>",
      "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
    ].join("\n");

    const result = parseOfx({ text: ofx, fileName: "statement.ofx", state });
    expect(result.rows).toHaveLength(2);
    const payroll = result.rows.find((row) => row.description.includes("PAYROLL"));
    expect(payroll!.kind).toBe("income");
    expect(payroll!.hash).toBe("ext-TXN-002");
    expect(result.rows.find((row) => row.description.includes("TESCO"))!.amount).toBe(-23.5);
  });

  test("QIF records parse dates, payees, and amounts", () => {
    const state = createInitialState();
    const qif = ["!Type:Bank", "D12/06/2026", "T-9.99", "PSpotify", "^", "D13/06/2026", "T2500.00", "PACME PAYROLL", "^"].join("\n");
    const result = parseQif({ text: qif, fileName: "export.qif", state });
    expect(result.rows).toHaveLength(2);
    const spotify = result.rows.find((row) => row.description === "Spotify");
    expect(spotify!.amount).toBe(-9.99);
    expect(spotify!.category).toBe("Subscriptions");
  });

  test("parseBankText sniffs format from content", () => {
    const state = createInitialState();
    const qif = ["!Type:Bank", "D12/06/2026", "T-9.99", "PSpotify", "^"].join("\n");
    expect(parseBankText({ text: qif, fileName: "mystery.txt", state }).rows).toHaveLength(1);

    const csv = ["Date,Description,Amount", "12/06/2026,COSTA COFFEE,-4.35"].join("\n");
    expect(parseBankText({ text: csv, fileName: "bank.csv", state }).rows).toHaveLength(1);
  });
});

// ─── B5: recurrence detection ────────────────────────────────────────────────

test.describe("recurrence detection", () => {
  function subscriptionState(): LedgerState {
    const state = createInitialState();
    state.months["2026-01"] = month([], [
      expense({ id: "n1", name: "Netflix", category: "Subscriptions", amount: 10.99, recurring: false, date: "2026-01-15" }),
      expense({ id: "g1", name: "Corner Cafe", category: "", amount: 8.4, recurring: false, date: "2026-01-03" }),
    ]);
    state.months["2026-02"] = month([], [
      expense({ id: "n2", name: "NETFLIX.COM", category: "Subscriptions", amount: 10.99, recurring: false, date: "2026-02-15" }),
    ]);
    state.months["2026-03"] = month([], [
      expense({ id: "n3", name: "Netflix", category: "Subscriptions", amount: 12.99, recurring: false, date: "2026-03-15" }),
    ]);
    return state;
  }

  test("detects a monthly subscription across descriptor variants", () => {
    const candidates = detectRecurringCandidates(subscriptionState());
    const netflix = candidates.find((candidate) => candidate.key.includes("netflix"));
    expect(netflix).toBeTruthy();
    expect(netflix!.cadence).toBe("monthly");
    expect(netflix!.occurrences).toBe(3);
    expect(netflix!.alreadyRecurring).toBe(false);
    expect(netflix!.nextExpected).toBeTruthy();
  });

  test("one-off merchants are not flagged", () => {
    const candidates = detectRecurringCandidates(subscriptionState());
    expect(candidates.find((candidate) => candidate.key.includes("corner"))).toBeUndefined();
  });

  test("suggests marking detected-but-unflagged patterns as recurring", () => {
    const suggestions = suggestRecurringFlags(subscriptionState());
    expect(suggestions.some((candidate) => candidate.key.includes("netflix"))).toBe(true);
  });

  test("flags a missed cycle after the grace window", () => {
    const missed = findMissedRecurring(subscriptionState(), "2026-04-25");
    expect(missed.some((candidate) => candidate.key.includes("netflix"))).toBe(true);
    // Within grace — nothing flagged.
    expect(findMissedRecurring(subscriptionState(), "2026-04-16").some((candidate) => candidate.key.includes("netflix"))).toBe(false);
  });

  test("detects undated manual entries appearing in consecutive months", () => {
    const state = createInitialState();
    state.months["2026-01"] = month([], [expense({ id: "m1", name: "Gym", category: "Health", amount: 30, recurring: false })]);
    state.months["2026-02"] = month([], [expense({ id: "m2", name: "Gym", category: "Health", amount: 30, recurring: false })]);
    state.months["2026-03"] = month([], [expense({ id: "m3", name: "Gym", category: "Health", amount: 30, recurring: false })]);
    const candidates = detectRecurringCandidates(state);
    expect(candidates.find((candidate) => candidate.key === "gym")?.cadence).toBe("monthly");
  });
});

// ─── B5c: seeded ↔ imported reconciliation ───────────────────────────────────

test.describe("reconcileSeededEntries", () => {
  test("merges a seeded recurring row into the imported actual for the same merchant", () => {
    const budget = month(
      [],
      [
        expense({
          id: "seeded",
          name: "British Gas",
          category: "Bills",
          amount: 80,
          seededFrom: { monthKey: "2026-05", entryId: "orig" },
        }),
        expense({
          id: "real",
          name: "BRITISH GAS",
          category: "Unsorted",
          amount: 84.2,
          recurring: false,
          imported: {
            batchId: "b",
            fileName: "f.csv",
            rowNumber: 3,
            hash: "h",
            originalDescription: "BRITISH GAS",
            importedAt: "2026-06-05T00:00:00Z",
          },
        }),
      ],
    );

    const { month: reconciled, merged } = reconcileSeededEntries(budget);
    expect(merged).toBe(1);
    expect(reconciled.expenses).toHaveLength(1);
    const survivor = reconciled.expenses[0];
    expect(survivor.id).toBe("real"); // the import wins
    expect(survivor.amount).toBe(84.2); // real amount kept
    expect(survivor.recurring).toBe(true); // inherits the recurring role
    expect(survivor.category).toBe("Bills"); // inherits the seeded category over Unsorted
  });

  test("leaves unrelated seeded rows alone", () => {
    const budget = month([], [
      expense({ id: "seeded", name: "Rent", seededFrom: { monthKey: "2026-05", entryId: "orig" } }),
      expense({ id: "other", name: "Tesco", category: "Food", imported: { batchId: "b", fileName: "f", rowNumber: 1, hash: "h", originalDescription: "TESCO", importedAt: "" } }),
    ]);
    const { month: reconciled, merged } = reconcileSeededEntries(budget);
    expect(merged).toBe(0);
    expect(reconciled.expenses).toHaveLength(2);
  });
});
