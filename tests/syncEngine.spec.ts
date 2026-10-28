import { expect, test } from "@playwright/test";
import { CURRENT_SCHEMA_VERSION, createInitialState } from "../src/finance";
import { normalizeState } from "../src/ledgerState";
import { sameContent } from "../src/sync/canonical";
import {
  rebaseOnto,
  SyncEngine,
  type EngineStatus,
  type LedgerRow,
  type PushOutcome,
  type SyncMeta,
  type SyncMetaStore,
  type SyncTransport,
} from "../src/sync/engine";
import type { ExpenseEntry, LedgerState } from "../src/types";

// ─── Fakes ───────────────────────────────────────────────────────────────────

class FakeServer {
  row: LedgerRow | null = null;
  online = true;
  pushes = 0;
  listeners: Array<(payload: { revision: number; updated_by: string | null; schema_version: number }) => void> = [];

  transport(): SyncTransport {
    return {
      push: async (state, baseRevision, deviceId): Promise<PushOutcome> => {
        await tick();
        if (!this.online) throw new Error("offline");
        this.pushes += 1;
        const current = this.row;
        if (current && current.state.schemaVersion > state.schemaVersion) {
          return { status: "schema_too_old", revision: current.revision, state: current.state, updatedBy: current.updatedBy };
        }
        if ((current?.revision ?? 0) !== baseRevision) {
          if (!current) return { status: "missing", revision: 0, state: null, updatedBy: null };
          return { status: "conflict", revision: current.revision, state: current.state, updatedBy: current.updatedBy };
        }
        // Stored as JSON, like Postgres would.
        this.row = { state: JSON.parse(JSON.stringify(state)), revision: baseRevision + 1, updatedBy: deviceId };
        const poke = { revision: this.row.revision, updated_by: deviceId, schema_version: state.schemaVersion };
        setTimeout(() => this.listeners.forEach((listener) => listener(poke)), 0);
        return { status: "ok", revision: this.row.revision, state: null, updatedBy: deviceId };
      },
      fetchRow: async () => {
        await tick();
        if (!this.online) throw new Error("offline");
        return this.row ? { ...this.row, state: JSON.parse(JSON.stringify(this.row.state)) } : null;
      },
      fetchRevision: async () => {
        await tick();
        if (!this.online) throw new Error("offline");
        return this.row?.revision ?? null;
      },
    };
  }
}

class MemoryMetaStore implements SyncMetaStore {
  meta: SyncMeta | null = null;
  async load(userId: string) {
    return this.meta?.userId === userId ? this.meta : null;
  }
  async save(meta: SyncMeta) {
    this.meta = meta;
  }
  async clear() {
    this.meta = null;
  }
}

// Behaves like React state: replacements land on a later tick, and edits made in
// between are rebased, exactly as App.tsx's host does.
class FakeDevice {
  local: LedgerState;
  statuses: EngineStatus[] = [];
  choice: { local: LedgerState; cloud: LedgerState } | null = null;
  engine: SyncEngine;
  store = new MemoryMetaStore();

  constructor(readonly name: string, server: FakeServer, initial: LedgerState) {
    this.local = initial;
    this.engine = new SyncEngine(
      server.transport(),
      this.store,
      {
        getLocal: () => this.local,
        replaceLocal: (expected, next) => {
          setTimeout(() => {
            this.local = rebaseOnto(expected, this.local, next);
          }, 5);
        },
        onStatus: (status) => this.statuses.push(status),
        onChoiceNeeded: (local, cloud) => {
          this.choice = { local, cloud };
        },
      },
      `device-${name}`,
    );
    server.listeners.push((payload) => this.engine.onPoke(payload));
  }

  edit(update: (state: LedgerState) => LedgerState) {
    this.local = { ...update(this.local), lastSavedAt: new Date().toISOString() };
    this.engine.requestPush();
  }

  get status() {
    return this.statuses[this.statuses.length - 1];
  }
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 1));
}

async function settle(ms = 400) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const month = () => Object.keys(normalizeState(createInitialState()).months)[0];

function expense(id: string, amount = 10): ExpenseEntry {
  return { id, name: id, category: "Food", amount, color: "#2f7fdd", recurring: false, date: `${month()}-05` };
}

function addExpense(entry: ExpenseEntry) {
  return (state: LedgerState): LedgerState => {
    const key = month();
    const current = state.months[key] ?? { incomes: [], expenses: [], note: "" };
    return { ...state, months: { ...state.months, [key]: { ...current, expenses: [...current.expenses, entry] } } };
  };
}

function ids(state: LedgerState | undefined | null): string[] {
  return state ? state.months[month()]?.expenses.map((e) => e.id).sort() ?? [] : [];
}

function fresh(): LedgerState {
  return normalizeState(createInitialState());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("SyncEngine", () => {
  test("an empty account takes this device's data on first sign-in", async () => {
    const server = new FakeServer();
    const device = new FakeDevice("web", server, normalizeState(addExpense(expense("coffee"))(fresh())));
    const outcome = await device.engine.start("user-1");
    await settle();
    expect(outcome.kind).toBe("ready");
    expect(server.row?.revision).toBe(1);
    expect(ids(server.row?.state)).toEqual(["coffee"]);
    expect(device.store.meta?.baseRevision).toBe(1);
    expect(device.status).toBe("saved");
  });

  test("a device starting from an un-normalised ledger pushes once, not in a loop", async () => {
    const server = new FakeServer();
    // A brand-new browser holds createInitialState() as is, before any normalisation.
    const web = new FakeDevice("web", server, createInitialState());
    await web.engine.start("u");
    await settle();
    expect(server.row?.revision).toBe(1);
    web.engine.requestPush();
    await settle();
    expect(server.pushes).toBe(1);
  });

  test("a transaction added on one device appears on the others", async () => {
    const server = new FakeServer();
    const web = new FakeDevice("web", server, fresh());
    const ios = new FakeDevice("ios", server, fresh());
    const android = new FakeDevice("android", server, fresh());
    await web.engine.start("u");
    await settle();
    await ios.engine.start("u");
    await android.engine.start("u");
    await settle();

    android.edit(addExpense(expense("from-android")));
    await settle();

    for (const device of [web, ios, android]) expect(ids(device.local)).toEqual(["from-android"]);
  });

  test("edits made offline on two devices both survive", async () => {
    const server = new FakeServer();
    const web = new FakeDevice("web", server, fresh());
    const android = new FakeDevice("android", server, fresh());
    await web.engine.start("u");
    await settle();
    await android.engine.start("u");
    await settle();

    server.online = false;
    web.edit(addExpense(expense("web-offline")));
    android.edit(addExpense(expense("android-offline")));
    await settle(100);
    expect(web.status).toBe("offline");

    server.online = true;
    web.engine.requestPush();
    android.engine.requestPush();
    await settle(800);

    expect(ids(server.row?.state)).toEqual(["android-offline", "web-offline"]);
    expect(ids(web.local)).toEqual(["android-offline", "web-offline"]);
    expect(ids(android.local)).toEqual(["android-offline", "web-offline"]);
  });

  test("an edit typed while a push is in flight is not lost", async () => {
    const server = new FakeServer();
    const web = new FakeDevice("web", server, fresh());
    await web.engine.start("u");
    await settle();

    web.edit(addExpense(expense("first")));
    // Before the push resolves:
    web.edit(addExpense(expense("second")));
    await settle();

    expect(ids(server.row?.state)).toEqual(["first", "second"]);
    expect(sameContent(server.row!.state, web.local)).toBe(true);
  });

  test("a cloud on a newer schema switches the device to read-only", async () => {
    const server = new FakeServer();
    const newer = { ...fresh(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    server.row = { state: newer, revision: 3, updatedBy: "future" };
    const web = new FakeDevice("web", server, fresh());
    const outcome = await web.engine.start("u");
    expect(outcome.kind).toBe("update-required");
    web.edit(addExpense(expense("blocked")));
    await settle();
    expect(server.pushes).toBe(0);
    expect(web.status).toBe("update-required");
  });

  test("first sign-in with different data asks, and combine keeps both", async () => {
    const server = new FakeServer();
    const ios = new FakeDevice("ios", server, normalizeState(addExpense(expense("from-ios"))(fresh())));
    await ios.engine.start("u");
    await settle();

    const web = new FakeDevice("web", server, normalizeState(addExpense(expense("from-web"))(fresh())));
    const outcome = await web.engine.start("u");
    expect(outcome.kind).toBe("choose");
    expect(web.choice).not.toBeNull();
    expect(server.pushes).toBe(1);

    await web.engine.resolveFirstSync("combine");
    await settle();
    expect(ids(server.row?.state)).toEqual(["from-ios", "from-web"]);
    expect(ids(ios.local)).toEqual(["from-ios", "from-web"]);
  });

  test("first sign-in with identical data adopts the cloud without asking", async () => {
    const server = new FakeServer();
    const shared = normalizeState(addExpense(expense("same"))(fresh()));
    const ios = new FakeDevice("ios", server, shared);
    await ios.engine.start("u");
    await settle();
    const web = new FakeDevice("web", server, shared);
    expect((await web.engine.start("u")).kind).toBe("ready");
    expect(web.choice).toBeNull();
  });

  test("a device that synced before merges on launch instead of asking", async () => {
    const server = new FakeServer();
    const web = new FakeDevice("web", server, fresh());
    const ios = new FakeDevice("ios", server, fresh());
    await web.engine.start("u");
    await settle();
    await ios.engine.start("u");
    await settle();

    // Web closes, edits offline (stored locally), iOS edits meanwhile.
    web.engine.stop();
    web.local = { ...addExpense(expense("web-while-closed"))(web.local) };
    ios.edit(addExpense(expense("ios-meanwhile")));
    await settle();

    // Web reopens.
    const outcome = await web.engine.start("u");
    await settle(600);
    expect(outcome.kind).toBe("ready");
    expect(web.choice).toBeNull();
    expect(ids(server.row?.state)).toEqual(["ios-meanwhile", "web-while-closed"]);
    expect(ids(ios.local)).toEqual(["ios-meanwhile", "web-while-closed"]);
  });

  test("a write from a client that formats JSON differently is not echoed back", async () => {
    const server = new FakeServer();
    const web = new FakeDevice("web", server, fresh());
    await web.engine.start("u");
    await settle();
    const pushesBefore = server.pushes;

    // Another client (say iOS) saves the same kind of ledger, omitting keys the web writes.
    const foreign = JSON.parse(JSON.stringify(addExpense(expense("from-ios"))(web.local)));
    delete foreign.defaultAccountId;
    delete foreign.aiCategorizationEnabled;
    for (const account of foreign.accounts) delete account.skippedPaymentMonths;
    server.row = { state: foreign, revision: server.row!.revision + 1, updatedBy: "device-ios" };
    server.listeners.forEach((listener) => listener({ revision: server.row!.revision, updated_by: "device-ios", schema_version: CURRENT_SCHEMA_VERSION }));
    await settle();

    expect(ids(web.local)).toEqual(["from-ios"]);
    expect(server.pushes).toBe(pushesBefore);
  });

  test("polling picks up changes when realtime is down", async () => {
    const server = new FakeServer();
    const web = new FakeDevice("web", server, fresh());
    const ios = new FakeDevice("ios", server, fresh());
    await web.engine.start("u");
    await settle();
    await ios.engine.start("u");
    await settle();
    server.listeners = [];

    ios.edit(addExpense(expense("silent")));
    await settle();
    expect(ids(web.local)).toEqual([]);
    await web.engine.checkRevision();
    await settle();
    expect(ids(web.local)).toEqual(["silent"]);
  });
});
