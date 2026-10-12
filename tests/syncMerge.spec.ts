import { expect, test } from "@playwright/test";
import { createInitialState } from "../src/finance";
import { normalizeState } from "../src/ledgerState";
import { contentHash, sameContent } from "../src/sync/canonical";
import { mergeLedgerStates } from "../src/sync/merge";
import type { Account, ExpenseEntry, IncomeEntry, LedgerState } from "../src/types";

const MONTH = "2026-10";
const NOW = "2026-10-12T10:00:00.000Z";

function expense(id: string, overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return { id, name: `Item ${id}`, category: "Food", amount: 10, color: "#2f7fdd", recurring: false, date: `${MONTH}-05`, ...overrides };
}

function income(id: string, overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return { id, source: `Income ${id}`, amount: 100, color: "#1baf7a", recurring: true, ...overrides };
}

function account(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    name: `Account ${id}`,
    accountClass: "cash",
    type: "current",
    balance: 1000,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    promoAsOf: MONTH,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: MONTH,
    balanceSetOn: `${MONTH}-01`,
    ledgerOffset: 0,
    includeInNetWorth: true,
    color: "#2f7fdd",
    note: "",
    ...overrides,
  };
}

function ledger(expenses: ExpenseEntry[] = [], incomes: IncomeEntry[] = [], extra: Partial<LedgerState> = {}): LedgerState {
  const state = createInitialState();
  return {
    ...state,
    selectedMonth: MONTH,
    months: { [MONTH]: { incomes, expenses, note: "" } },
    ...extra,
  };
}

function withMonth(state: LedgerState, monthKey: string, patch: Partial<LedgerState["months"][string]>): LedgerState {
  const month = state.months[monthKey] ?? { incomes: [], expenses: [], note: "" };
  return { ...state, months: { ...state.months, [monthKey]: { ...month, ...patch } } };
}

function allExpenses(state: LedgerState): ExpenseEntry[] {
  return Object.values(state.months).flatMap((month) => month.expenses);
}

test.describe("mergeLedgerStates", () => {
  test("keeps transactions added on both sides", () => {
    const base = ledger([expense("a")]);
    const local = ledger([expense("a"), expense("l1")]);
    const remote = ledger([expense("a"), expense("r1")]);
    const merged = mergeLedgerStates(base, local, remote, NOW);
    expect(allExpenses(merged).map((e) => e.id).sort()).toEqual(["a", "l1", "r1"]);
  });

  test("a delete on one side and no change on the other deletes", () => {
    const base = ledger([expense("a"), expense("b")]);
    expect(allExpenses(mergeLedgerStates(base, ledger([expense("b")]), base, NOW)).map((e) => e.id)).toEqual(["b"]);
    expect(allExpenses(mergeLedgerStates(base, base, ledger([expense("a")]), NOW)).map((e) => e.id)).toEqual(["a"]);
  });

  test("an edit beats a delete, whichever side made it", () => {
    const base = ledger([expense("a")]);
    const edited = ledger([expense("a", { amount: 42 })]);
    const deleted = ledger([]);
    expect(allExpenses(mergeLedgerStates(base, deleted, edited, NOW))).toEqual([expense("a", { amount: 42 })]);
    expect(allExpenses(mergeLedgerStates(base, edited, deleted, NOW))).toEqual([expense("a", { amount: 42 })]);
  });

  test("merges different fields of the same transaction", () => {
    const base = ledger([expense("a")]);
    const local = ledger([expense("a", { name: "Costa" })]);
    const remote = ledger([expense("a", { category: "Coffee" })]);
    expect(allExpenses(mergeLedgerStates(base, local, remote, NOW))[0]).toMatchObject({ name: "Costa", category: "Coffee" });
  });

  test("local wins when both sides changed the same field", () => {
    const base = ledger([expense("a")]);
    const merged = mergeLedgerStates(base, ledger([expense("a", { amount: 5 })]), ledger([expense("a", { amount: 7 })]), NOW);
    expect(allExpenses(merged)[0].amount).toBe(5);
  });

  test("a date change moves the entry between months while other edits still merge", () => {
    const base = ledger([expense("a")]);
    const local = ledger([expense("a", { amount: 99 })]);
    const remote = withMonth(ledger([]), "2026-09", { expenses: [expense("a", { date: "2026-09-28" })] });
    const merged = mergeLedgerStates(base, local, remote, NOW);
    expect(merged.months[MONTH].expenses).toEqual([]);
    expect(merged.months["2026-09"].expenses).toEqual([expense("a", { date: "2026-09-28", amount: 99 })]);
  });

  test("account balance fields move together, never mixed between sides", () => {
    const base = ledger([], [], { accounts: [account("acc")] });
    const local = ledger([], [], { accounts: [account("acc", { balance: 500, balanceSetOn: "2026-10-10" })] });
    const remote = ledger([], [], { accounts: [account("acc", { ledgerOffset: -20, name: "Monzo" })] });
    const merged = mergeLedgerStates(base, local, remote, NOW);
    expect(merged.accounts[0]).toMatchObject({ balance: 500, balanceSetOn: "2026-10-10", ledgerOffset: 0, name: "Monzo" });
  });

  test("skipped payment months merge as a set", () => {
    const base = ledger([], [], { accounts: [account("d", { accountClass: "debt", skippedPaymentMonths: ["2026-08"] })] });
    const local = ledger([], [], { accounts: [account("d", { accountClass: "debt", skippedPaymentMonths: ["2026-09"] })] });
    const remote = ledger([], [], { accounts: [account("d", { accountClass: "debt", skippedPaymentMonths: ["2026-08", "2026-10"] })] });
    expect(mergeLedgerStates(base, local, remote, NOW).accounts[0].skippedPaymentMonths).toEqual(["2026-09", "2026-10"]);
  });

  test("a remote-only item lands right after its predecessor", () => {
    const base = ledger([], [income("a"), income("b")]);
    const local = ledger([], [income("b"), income("a"), income("l")]);
    const remote = ledger([], [income("a"), income("r"), income("b")]);
    expect(mergeLedgerStates(base, local, remote, NOW).months[MONTH].incomes.map((i) => i.id)).toEqual(["b", "a", "r", "l"]);
  });

  test("two devices seeding the same recurring entry keep one copy, the remote one", () => {
    const seededFrom = { monthKey: "2026-09", entryId: "rent" };
    const base = ledger([]);
    const local = ledger([expense("local-copy", { seededFrom, recurring: true })]);
    const remote = ledger([expense("remote-copy", { seededFrom, recurring: true })]);
    expect(allExpenses(mergeLedgerStates(base, local, remote, NOW)).map((e) => e.id)).toEqual(["remote-copy"]);
  });

  test("the same statement imported on two devices keeps one copy, but genuine repeats survive", () => {
    const imported = (batchId: string, hash: string) => ({ batchId, fileName: "monzo.csv", rowNumber: 1, hash, originalDescription: "COSTA", importedAt: NOW });
    const base = ledger([]);
    const local = ledger([
      expense("l1", { imported: imported("bl", "coffee") }),
      expense("l2", { imported: imported("bl", "coffee") }),
    ], [], {
      importBatches: [{ id: "bl", fileName: "monzo.csv", importedAt: "2026-10-11T09:00:00.000Z", totalRows: 2, importedRows: 2, skippedRows: 0, transactionRefs: [{ monthKey: MONTH, entryId: "l1", kind: "expense" }, { monthKey: MONTH, entryId: "l2", kind: "expense" }] }],
    });
    const remote = ledger([expense("r1", { imported: imported("br", "coffee") })]);
    const merged = mergeLedgerStates(base, local, remote, NOW);
    // One local coffee pairs with the remote one; the second was a real second coffee.
    expect(allExpenses(merged).map((e) => e.id).sort()).toEqual(["l2", "r1"]);
    expect(merged.importBatches[0].transactionRefs.map((ref) => ref.entryId).sort()).toEqual(["l2", "r1"]);
  });

  test("keeps fields this build does not know about", () => {
    const base = ledger([{ ...expense("a"), futureTag: "x" } as ExpenseEntry], [], { futureRoot: 1 } as Partial<LedgerState>);
    const local = ledger([{ ...expense("a"), futureTag: "x" } as ExpenseEntry], [], { futureRoot: 1 } as Partial<LedgerState>);
    const remote = ledger([{ ...expense("a"), futureTag: "y" } as ExpenseEntry], [], { futureRoot: 2, other: true } as Partial<LedgerState>);
    const merged = mergeLedgerStates(base, local, remote, NOW) as unknown as Record<string, unknown>;
    expect(merged.futureRoot).toBe(2);
    expect(merged.other).toBe(true);
    expect((allExpenses(merged as unknown as LedgerState)[0] as unknown as Record<string, unknown>).futureTag).toBe("y");
  });

  test("root fields: selected month stays local, schema is the max, stamp is now", () => {
    const base = ledger([], [], { currency: "GBP" });
    const local = ledger([], [], { selectedMonth: "2026-01", schemaVersion: 8 });
    const remote = ledger([], [], { selectedMonth: "2026-05", schemaVersion: 9, currency: "EUR" });
    const merged = mergeLedgerStates(base, local, remote, NOW);
    expect(merged).toMatchObject({ selectedMonth: "2026-01", schemaVersion: 9, currency: "EUR", lastSavedAt: NOW });
  });

  test("first sign-in combine (no base) is a union", () => {
    const local = ledger([expense("l")], [], { accounts: [account("a1")] });
    const cloud = ledger([expense("c")], [], { accounts: [account("a2")] });
    const merged = mergeLedgerStates(null, local, cloud, NOW);
    expect(allExpenses(merged).map((e) => e.id).sort()).toEqual(["c", "l"]);
    expect(merged.accounts.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  test("merging identical states changes nothing but the stamp", () => {
    const state = ledger([expense("a"), expense("b")], [income("i")], { accounts: [account("x")] });
    expect(sameContent(mergeLedgerStates(state, state, state, NOW), state)).toBe(true);
  });
});

test.describe("normalizeState keeps data it does not understand", () => {
  test("unknown keys survive at every level and legacy keys are dropped", () => {
    const raw = {
      ...ledger([{ ...expense("a"), futureTag: 1 } as ExpenseEntry], [], {
        accounts: [{ ...account("acc"), futureAccountField: "keep", apr: 9 } as unknown as Account],
        goals: [{ id: "g", name: "Trip", target: 100, saved: 0, color: "#000", priority: 1, fundingMode: "fixed", monthlyAmount: 0, deadlineMonths: 0, interestRate: 0, note: "", createdAt: NOW, accountId: "acc", futureGoalField: [1, 2] } as never],
        categoryRules: [{ id: "r", pattern: "costa", category: "Coffee", kind: "expense", createdAt: NOW, updatedAt: NOW, futureRuleField: true } as never],
        nameRules: [{ id: "n", kind: "expense", from: "COSTA", to: "Costa", createdAt: NOW, updatedAt: NOW, futureNameField: "x" } as never],
      }),
      futureRoot: { nested: true },
      goal: { name: "legacy" },
    } as unknown as LedgerState;
    const normalized = normalizeState(raw) as unknown as Record<string, any>;
    expect(normalized.futureRoot).toEqual({ nested: true });
    expect(normalized.goal).toBeUndefined();
    expect(normalized.accounts[0].futureAccountField).toBe("keep");
    expect(normalized.accounts[0].apr).toBeUndefined();
    expect(normalized.goals[0].futureGoalField).toEqual([1, 2]);
    expect(normalized.categoryRules[0].futureRuleField).toBe(true);
    expect(normalized.nameRules[0].futureNameField).toBe("x");
    expect(normalized.months[MONTH].expenses[0].futureTag).toBe(1);
  });

  test("a goal keeps the account it is linked to across a reload", () => {
    const raw = ledger([], [], {
      accounts: [account("savings", { accountClass: "savings", type: "savings" })],
      goals: [{ id: "g", name: "House", target: 1000, saved: 0, color: "#000", priority: 1, fundingMode: "fixed", monthlyAmount: 0, deadlineMonths: 0, interestRate: 0, note: "", createdAt: NOW, accountId: "savings" }],
    });
    expect(normalizeState(raw).goals[0].accountId).toBe("savings");
  });
});

// ─── Three devices against a compare-and-swap server ─────────────────────────

type Device = { name: string; local: LedgerState; base: LedgerState | null; baseRevision: number };
type Server = { state: LedgerState | null; revision: number };

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return value / 0x100000000;
  };
}

function push(device: Device, server: Server) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (device.base && sameContent(device.local, device.base) && device.baseRevision === server.revision) return;
    if (device.baseRevision === server.revision) {
      server.state = device.local;
      server.revision += 1;
      device.base = device.local;
      device.baseRevision = server.revision;
      return;
    }
    // Lost the race: merge onto what the server has and try again.
    device.local = normalizeState(mergeLedgerStates(device.base, device.local, server.state!));
    device.base = server.state;
    device.baseRevision = server.revision;
  }
  throw new Error(`${device.name} could not push`);
}

function pull(device: Device, server: Server) {
  if (!server.state || server.revision === device.baseRevision) return;
  const pending = !device.base || !sameContent(device.local, device.base);
  device.local = pending ? normalizeState(mergeLedgerStates(device.base, device.local, server.state)) : normalizeState(server.state);
  device.base = server.state;
  device.baseRevision = server.revision;
}

test.describe("three devices converge", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`random edits, seed ${seed}`, () => {
      const random = rng(seed);
      const month = Object.keys(normalizeState(createInitialState()).months)[0];
      const start = normalizeState(ledger([], [], { selectedMonth: month, months: { [month]: { incomes: [], expenses: [expense("seed-1"), expense("seed-2")], note: "" } } }));
      const server: Server = { state: start, revision: 1 };
      const devices: Device[] = ["web", "ios", "android"].map((name) => ({ name, local: start, base: start, baseRevision: 1 }));
      const added = new Set<string>(["seed-1", "seed-2"]);
      const deleted = new Set<string>();
      let counter = 0;

      for (let step = 0; step < 120; step += 1) {
        const device = devices[Math.floor(random() * devices.length)];
        const roll = random();
        const expenses = device.local.months[month].expenses;
        if (roll < 0.35) {
          const id = `${device.name}-${(counter += 1)}`;
          added.add(id);
          device.local = withMonth(device.local, month, { expenses: [...expenses, expense(id, { date: `${month}-05` })] });
        } else if (roll < 0.55 && expenses.length) {
          const target = expenses[Math.floor(random() * expenses.length)];
          device.local = withMonth(device.local, month, {
            expenses: expenses.map((e) => (e.id === target.id ? { ...e, amount: Math.round(random() * 1000) / 10 } : e)),
          });
        } else if (roll < 0.65 && expenses.length) {
          const target = expenses[Math.floor(random() * expenses.length)];
          deleted.add(target.id);
          device.local = withMonth(device.local, month, { expenses: expenses.filter((e) => e.id !== target.id) });
        } else if (roll < 0.85) {
          push(device, server);
        } else {
          pull(device, server);
        }
      }

      // Everyone comes online: push and pull until nothing changes.
      for (let round = 0; round < 4; round += 1) {
        for (const device of devices) {
          pull(device, server);
          push(device, server);
        }
      }

      const hashes = devices.map((device) => contentHash(device.local));
      expect(new Set(hashes).size).toBe(1);
      expect(contentHash(server.state!)).toBe(hashes[0]);

      const finalIds = server.state!.months[month].expenses.map((e) => e.id);
      expect(new Set(finalIds).size).toBe(finalIds.length);
      for (const id of added) {
        if (!deleted.has(id)) expect(finalIds).toContain(id);
      }
      for (const id of finalIds) expect(added.has(id)).toBe(true);
    });
  }
});
