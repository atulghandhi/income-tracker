// Value comparison and content hashing for sync. Both work on parsed values with
// sorted keys and undefined dropped, so key order, `undefined` vs missing, and the
// way a platform prints numbers (2400 vs 2400.0) never count as a change.

import type { LedgerState } from "../types";

// Fields that change without the ledger's content changing: the save stamp and the
// month this device happens to have on screen.
const VOLATILE_ROOT_KEYS = new Set(["lastSavedAt", "selectedMonth"]);

export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) return "null";
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return canonicalJson(a) === canonicalJson(b);
}

// Canonical form of a ledger's content, ignoring the volatile root keys.
export function ledgerContent(state: LedgerState): string {
  const record = state as unknown as Record<string, unknown>;
  const content: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (!VOLATILE_ROOT_KEYS.has(key)) content[key] = record[key];
  }
  return canonicalJson(content);
}

// Two independent 32-bit lanes (FNV-1a and a murmur-style mix) over the canonical
// content, as 16 hex characters. Only ever compared on the same device (this
// device's state vs the last state it synced), never sent.
export function contentHash(state: LedgerState): string {
  const text = ledgerContent(state);
  let a = 0x811c9dc5;
  let b = 0x9747b28c ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export function sameContent(a: LedgerState | null | undefined, b: LedgerState | null | undefined): boolean {
  if (!a || !b) return a === b;
  return ledgerContent(a) === ledgerContent(b);
}
