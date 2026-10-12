// Sync v2 client engine (docs/ANDROID_APP_SPEC.md §4.3). Framework-free: the app
// supplies a transport (Supabase), a store for sync bookkeeping (IndexedDB) and a
// host that owns the ledger on screen (React state).
//
// The engine keeps `base`, the last state it knows the server holds, and its
// revision. Pushes are compare-and-swap against that revision. When another device
// got there first, the engine three-way merges (base, this device, server) and tries
// again, so nobody's edits are overwritten. Remote changes arrive via a realtime poke,
// on returning to the tab, on reconnect, or by polling when realtime is down.

import { CURRENT_SCHEMA_VERSION } from "../finance";
import { hasLocalData, normalizeState, sameEntities } from "../ledgerState";
import type { LedgerState } from "../types";
import { sameContent } from "./canonical";
import { mergeLedgerStates } from "./merge";

export type PushStatus = "ok" | "conflict" | "schema_too_old" | "missing";

export type PushOutcome = {
  status: PushStatus;
  revision: number;
  state: LedgerState | null;
  updatedBy: string | null;
};

export type LedgerRow = {
  state: LedgerState;
  revision: number;
  updatedBy: string | null;
};

export interface SyncTransport {
  push(state: LedgerState, baseRevision: number, deviceId: string): Promise<PushOutcome>;
  fetchRow(): Promise<LedgerRow | null>;
  fetchRevision(): Promise<number | null>;
}

export type SyncMeta = {
  userId: string;
  baseRevision: number;
  base: LedgerState | null;
};

export interface SyncMetaStore {
  load(userId: string): Promise<SyncMeta | null>;
  save(meta: SyncMeta): Promise<void>;
  clear(): Promise<void>;
}

export type EngineStatus = "loading" | "saving" | "saved" | "offline" | "update-required";

export interface SyncHost {
  // The ledger currently on screen (may lag a queued edit by one render).
  getLocal(): LedgerState;
  // Show `next`, computed from `expected`. If the user changed the ledger after
  // `expected` was read, the host must rebase those changes onto `next`
  // (see rebaseOnto) instead of discarding them.
  replaceLocal(expected: LedgerState, next: LedgerState): void;
  onStatus(status: EngineStatus): void;
  // A remote change was folded into the ledger on screen.
  onRemoteApplied?(): void;
  // First sync on a device with its own data: ask the user (then call resolveFirstSync).
  // Also raised when a start that began offline reaches the server later.
  onChoiceNeeded(local: LedgerState, cloud: LedgerState): void;
}

export type StartOutcome =
  | { kind: "ready" }
  | { kind: "update-required" }
  | { kind: "offline" }
  // This device has its own data and has never synced with this account: the host's
  // onChoiceNeeded has been called and the user picks.
  | { kind: "choose"; local: LedgerState; cloud: LedgerState };

export type FirstSyncChoice = "combine" | "cloud" | "local";

const MAX_PUSH_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000, 60_000];
const COMMIT_WAIT_MS = 50;

// Fold edits the user made after `expected` was read onto `next`.
export function rebaseOnto(expected: LedgerState, current: LedgerState, next: LedgerState): LedgerState {
  if (current === expected) return next;
  return normalizeState(mergeLedgerStates(expected, current, next));
}

export class SyncEngine {
  private userId: string | null = null;
  private base: LedgerState | null = null;
  // `base` as this client normalises it. "Unsaved changes" means the ledger differs
  // from this, not from the raw server JSON: other clients serialise the same ledger
  // a little differently (a null here, a missing key there), and comparing raw would
  // make devices re-push each other's formatting forever.
  private baseNormalized: LedgerState | null = null;
  private baseRevision = 0;
  private ready = false;
  private readOnly = false;
  private queue: Promise<unknown> = Promise.resolve();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private pushRequested = false;
  // The ledger object the engine replaced last; until the host renders the
  // replacement, getLocal() can still return it and must not be pushed.
  private replaced: LedgerState | null = null;
  private generation = 0;

  constructor(
    private readonly transport: SyncTransport,
    private readonly store: SyncMetaStore,
    private readonly host: SyncHost,
    readonly deviceId: string,
  ) {}

  get revision(): number {
    return this.baseRevision;
  }

  get isReadOnly(): boolean {
    return this.readOnly;
  }

  // Signed in (or the app opened signed in): reconcile this device with the cloud.
  async start(userId: string): Promise<StartOutcome> {
    this.stop();
    const generation = this.generation;
    this.userId = userId;
    this.host.onStatus("loading");

    return this.enqueue(async () => {
      const meta = await this.store.load(userId).catch(() => null);
      if (meta && meta.userId === userId) {
        this.setBase(meta.base, meta.baseRevision);
      }

      let row: LedgerRow | null;
      try {
        row = await this.transport.fetchRow();
      } catch {
        if (generation !== this.generation) return { kind: "offline" } as const;
        // Work offline against what we knew; pushes retry when the network returns.
        this.ready = this.baseRevision > 0;
        this.host.onStatus("offline");
        this.scheduleRetry();
        return { kind: "offline" } as const;
      }
      if (generation !== this.generation) return { kind: "offline" } as const;

      const local = this.host.getLocal();

      if (!row) {
        // Nothing in the cloud yet: this device's data becomes the account's.
        this.setBase(null, 0);
        this.ready = true;
        await this.pushLoop();
        return { kind: "ready" } as const;
      }

      if (isTooNew(row.state)) {
        this.enterReadOnly();
        return { kind: "update-required" } as const;
      }

      if (this.baseRevision > 0) {
        // A device that has synced before: merge whatever happened on either side.
        if (row.revision !== this.baseRevision) await this.integrate(row);
        this.ready = true;
        this.requestPush();
        return { kind: "ready" } as const;
      }

      const cloud = normalizeState(row.state);
      if (!hasLocalData(local) || sameContent(local, cloud) || sameEntities(local, cloud)) {
        this.setBase(row.state, row.revision);
        this.replace(local, cloud);
        this.ready = true;
        this.host.onStatus("saved");
        return { kind: "ready" } as const;
      }

      // Both sides hold different real data and there is no common history: ask.
      this.pendingChoiceRow = row;
      this.host.onStatus("saved");
      this.host.onChoiceNeeded(local, cloud);
      return { kind: "choose", local, cloud } as const;
    });
  }

  private pendingChoiceRow: LedgerRow | null = null;

  async resolveFirstSync(choice: FirstSyncChoice): Promise<void> {
    const row = this.pendingChoiceRow;
    this.pendingChoiceRow = null;
    if (!row) return;
    await this.enqueue(async () => {
      const local = this.host.getLocal();
      const cloud = normalizeState(row.state);
      this.setBase(row.state, row.revision);
      if (choice === "cloud") {
        this.replace(local, cloud);
      } else if (choice === "combine") {
        this.replace(local, normalizeState(mergeLedgerStates(null, local, cloud)));
      }
      // "local": keep the ledger as is; the push below overwrites the cloud.
      this.ready = true;
    });
    this.requestPush();
  }

  stop(): void {
    this.generation += 1;
    this.ready = false;
    this.readOnly = false;
    this.userId = null;
    this.setBase(null, 0);
    this.pendingChoiceRow = null;
    this.replaced = null;
    this.pushRequested = false;
    this.clearRetry();
  }

  // Sign-out: forget everything this device knew about the account.
  async reset(): Promise<void> {
    this.stop();
    await this.store.clear().catch(() => undefined);
  }

  // The ledger changed on this device (already debounced by the caller).
  requestPush(): void {
    if (!this.ready || this.readOnly) return;
    if (this.pushRequested) return;
    this.pushRequested = true;
    void this.enqueue(async () => {
      this.pushRequested = false;
      await this.pushLoop();
    });
  }

  // Something may have changed on the server.
  requestPull(): void {
    if (!this.ready || this.readOnly) return;
    void this.enqueue(() => this.pull());
  }

  // Realtime poke from the database trigger.
  onPoke(payload: { revision?: unknown; updated_by?: unknown; schema_version?: unknown }): void {
    const revision = Number(payload.revision);
    if (!Number.isFinite(revision) || revision <= this.baseRevision) return;
    if (Number(payload.schema_version) > CURRENT_SCHEMA_VERSION) {
      this.enterReadOnly();
      return;
    }
    this.requestPull();
  }

  // Cheap check used while realtime is unavailable.
  async checkRevision(): Promise<void> {
    if (!this.ready || this.readOnly) return;
    try {
      const revision = await this.transport.fetchRevision();
      if (revision !== null && revision !== this.baseRevision) this.requestPull();
    } catch {
      // Still offline; the retry timer or the next tick will try again.
    }
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async pull(): Promise<void> {
    const generation = this.generation;
    let row: LedgerRow | null;
    try {
      row = await this.transport.fetchRow();
    } catch {
      this.host.onStatus("offline");
      this.scheduleRetry();
      return;
    }
    if (generation !== this.generation || !row) return;
    if (row.revision === this.baseRevision) return;
    if (isTooNew(row.state)) {
      this.enterReadOnly();
      return;
    }
    await this.integrate(row);
    this.host.onRemoteApplied?.();
    this.requestPush();
  }

  // Fold a server row into the ledger on screen and make it the new base.
  private async integrate(row: LedgerRow): Promise<void> {
    const local = this.host.getLocal();
    const remote = normalizeState(row.state);
    const pending = this.hasPendingChanges(local);
    const next = pending ? normalizeState(mergeLedgerStates(this.base, local, remote)) : remote;
    this.setBase(row.state, row.revision);
    await this.saveMeta();
    this.replace(local, next);
  }

  private async pushLoop(): Promise<void> {
    const generation = this.generation;
    for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt += 1) {
      if (generation !== this.generation || this.readOnly) return;

      const local = this.host.getLocal();
      if (this.replaced && local === this.replaced) {
        // The host has not rendered our last replacement yet; push that, not this.
        setTimeout(() => this.requestPush(), COMMIT_WAIT_MS);
        return;
      }
      this.replaced = null;

      if (this.baseRevision > 0 && !this.hasPendingChanges(local)) {
        this.retryIndex = 0;
        this.host.onStatus("saved");
        return;
      }

      this.host.onStatus("saving");
      let outcome: PushOutcome;
      try {
        outcome = await this.transport.push(local, this.baseRevision, this.deviceId);
      } catch {
        if (generation !== this.generation) return;
        this.host.onStatus("offline");
        this.scheduleRetry();
        return;
      }
      if (generation !== this.generation) return;

      switch (outcome.status) {
        case "ok":
          this.setBase(local, outcome.revision);
          this.retryIndex = 0;
          this.clearRetry();
          await this.saveMeta();
          // Loop: the user may have edited while the request was in flight.
          continue;
        case "missing":
          this.setBase(null, 0);
          continue;
        case "schema_too_old":
          this.enterReadOnly();
          return;
        case "conflict":
          if (!outcome.state || isTooNew(outcome.state)) {
            this.enterReadOnly();
            return;
          }
          await this.integrate({ state: outcome.state, revision: outcome.revision, updatedBy: outcome.updatedBy });
          this.host.onRemoteApplied?.();
          // Wait for the host to render the merged ledger, then push it.
          setTimeout(() => this.requestPush(), COMMIT_WAIT_MS);
          return;
      }
    }
    // Five lost races in a row: back off rather than hammer the server.
    this.scheduleRetry();
  }

  private replace(expected: LedgerState, next: LedgerState): void {
    this.replaced = expected;
    this.host.replaceLocal(expected, next);
  }

  private setBase(state: LedgerState | null, revision: number): void {
    this.base = state;
    this.baseNormalized = state ? normalizeState(state) : null;
    this.baseRevision = revision;
  }

  // Unchanged means equal to the server copy either as stored (this device just pushed
  // it) or as this client normalises it (another client wrote it).
  private hasPendingChanges(local: LedgerState): boolean {
    if (!this.base || !this.baseNormalized) return true;
    return !sameContent(local, this.base) && !sameContent(local, this.baseNormalized);
  }

  private async saveMeta(): Promise<void> {
    if (!this.userId) return;
    await this.store.save({ userId: this.userId, base: this.base, baseRevision: this.baseRevision }).catch(() => undefined);
  }

  private enterReadOnly(): void {
    this.readOnly = true;
    this.clearRetry();
    this.host.onStatus("update-required");
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)];
    this.retryIndex += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.userId) return;
      if (!this.ready) {
        void this.start(this.userId);
        return;
      }
      void this.enqueue(async () => {
        await this.pull();
        await this.pushLoop();
      });
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  // One sync operation at a time, so base and revision never race.
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function isTooNew(state: LedgerState): boolean {
  return Number(state?.schemaVersion) > CURRENT_SCHEMA_VERSION;
}
