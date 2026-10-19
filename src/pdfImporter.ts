// PDF bank statements. A PDF has no rows or columns, only text placed at
// coordinates, so the parser rebuilds the table from geometry: text items are
// grouped into lines by their y position, the header row ("Date … Money out …
// Balance") fixes the x position of every column, and each figure below is
// assigned to the nearest column. That one idea covers most UK and US current
// account and card statements without a parser per bank; the bank name is
// only detected to label the review and the error message.
//
// Statements differ in the details, and those are handled generically:
//   - dates with no year ("15 Dec") take it from the statement period
//   - a date or balance printed once per day is carried to the rows beneath
//   - "Ref:" / "On 14 Dec" / town lines are folded into the description
//   - one signed Amount column or separate Money out / Money in columns
//   - the running balance, when present, settles the sign of every amount
//     (arithmetic beats column guessing) and validates the parse
//
// The pure functions here take plain text items, so the tests can feed in
// fixture PDFs read with pdf.js in Node and the app can do the same in a
// worker. Everything ends up in buildImportRow, the same funnel CSV, OFX,
// QIF and pasted lines go through, so the review step is identical.

import { getMonthKey } from "./finance";
import {
  buildImportRow,
  collectExistingTransactionHashes,
  detectLikelySignInversion,
  markTransferPairs,
  sortImportRows,
  type CsvImportResult,
  type CsvImportRow,
  type DateOrder,
} from "./importer";
import { dateOrderFor, regionOf } from "./region";
import type { LedgerState } from "./types";

export type PdfTextItem = {
  text: string;
  // PDF user-space coordinates: origin bottom-left, y grows upwards.
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPageText = {
  pageNumber: number;
  items: PdfTextItem[];
};

export type PdfStatementResult = CsvImportResult & {
  // Recognised issuer ("Barclays", "HSBC", …) when the text names one.
  bank?: string;
  pageCount: number;
  // How the rows were found: a column header, a line-by-line fallback, or not at all.
  layout: "columns" | "lines" | "none";
  // Per page: lines of text seen, whether a column header was found, rows read.
  // Surfaced in the console so a statement that reads short can be diagnosed.
  diagnostics: PdfPageDiagnostics[];
};

export type ParsePdfStatementOptions = {
  pages: PdfPageText[];
  fileName: string;
  state: LedgerState;
  fallbackMonthKey?: string;
  // Negate single-amount-column values (credit-card statements). Ignored for
  // money in / money out layouts, which are already unambiguous.
  flipSigns?: boolean;
  dateOrder?: DateOrder;
};

// Banks the importer has been shaped around. Shown in the unsupported-file
// message so people know what to expect; the parser itself is layout-driven.
export const PDF_SUPPORTED_BANKS = [
  "Barclays",
  "HSBC",
  "Lloyds",
  "Halifax",
  "NatWest",
  "Santander",
  "Nationwide",
  "TSB",
  "Monzo",
  "Starling",
  "Revolut",
  "Chase",
  "first direct",
  "Metro Bank",
  "Virgin Money",
  "American Express",
];

// ─── Reading a PDF with pdf.js ───────────────────────────────────────────────
// The pdf.js module is passed in rather than imported so this file stays free of
// the (large) library: the app lazy-loads the browser build, the tests use the
// Node build, and both hand the same text items to the parser.

type PdfjsTextContent = { items: unknown[] };
type PdfjsPage = { getTextContent(): Promise<PdfjsTextContent> };
type PdfjsDocument = { numPages: number; getPage(pageNumber: number): Promise<PdfjsPage>; destroy?: () => Promise<void> | void };
export type PdfjsLike = {
  getDocument(source: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): { promise: Promise<PdfjsDocument> };
};

export class PdfImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfImportError";
  }
}

export async function readPdfPages(pdfjs: PdfjsLike, data: ArrayBuffer | Uint8Array): Promise<PdfPageText[]> {
  // A fresh copy: pdf.js rejects Node Buffers and transfers the bytes it is given
  // to its worker, which would leave the caller's buffer detached.
  const bytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data));
  let document: PdfjsDocument;
  try {
    document = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
  } catch (error) {
    throw new PdfImportError(describePdfjsError(error));
  }
  try {
    const pages: PdfPageText[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const raw of content.items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown };
        if (typeof item.str !== "string" || !Array.isArray(item.transform)) continue;
        const transform = item.transform as number[];
        items.push({
          text: item.str,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
          width: Number(item.width) || 0,
          height: Number(item.height) || Math.abs(Number(transform[3])) || 0,
        });
      }
      pages.push({ pageNumber, items });
    }
    return pages;
  } finally {
    await document.destroy?.();
  }
}

function describePdfjsError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") {
    return "This PDF is password-protected. Open it in a PDF viewer, save a copy without the password, and import that.";
  }
  if (name === "InvalidPDFException" || name === "MissingPDFException" || name === "FormatError") {
    return "This file isn’t a readable PDF. Download the statement again from your bank and try once more.";
  }
  return "The PDF couldn’t be opened. Download the statement again from your bank and try once more.";
}

// ─── Lines and cells ─────────────────────────────────────────────────────────

type Cell = { text: string; x0: number; x1: number };
type Line = { page: number; y: number; height: number; cells: Cell[] };

// Groups positioned text into lines (same baseline) and cells (runs separated
// by a gap wider than a word space). Exported for the tests.
export function groupTextLines(page: PdfPageText): Line[] {
  const items = page.items
    .filter((item) => item.text.trim())
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, " "), height: item.height > 0 ? item.height : 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: Array<{ y: number; height: number; items: PdfTextItem[] }> = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    const tolerance = Math.max(2, Math.min(item.height, last?.height ?? item.height) * 0.5);
    if (last && Math.abs(last.y - item.y) <= tolerance) last.items.push(item);
    else rows.push({ y: item.y, height: item.height, items: [item] });
  }

  return rows.map((row) => {
    const sorted = [...row.items].sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const item of sorted) {
      const last = cells[cells.length - 1];
      const gap = last ? item.x - last.x1 : Infinity;
      const wordGap = Math.max(1.5, row.height * 0.75);
      if (last && gap < wordGap) {
        const joiner = gap > row.height * 0.12 && !last.text.endsWith(" ") && !item.text.startsWith(" ") ? " " : "";
        last.text = `${last.text}${joiner}${item.text}`.replace(/\s+/g, " ");
        last.x1 = Math.max(last.x1, item.x + item.width);
      } else {
        cells.push({ text: item.text.trim(), x0: item.x, x1: item.x + item.width });
      }
    }
    return { page: page.pageNumber, y: row.y, height: row.height, cells: cells.filter((cell) => cell.text) };
  });
}

const lineText = (line: Line) => line.cells.map((cell) => cell.text).join(" ");

// ─── Header detection ────────────────────────────────────────────────────────

type ColumnRole = "date" | "description" | "type" | "debit" | "credit" | "amount" | "balance";
type Column = { role: ColumnRole; label: string; x0: number; x1: number };

const HEADER_ROLES: Array<{ role: ColumnRole; patterns: RegExp[] }> = [
  {
    role: "date",
    patterns: [/^(?:transaction |trans |posting |posted |booking |completed |value |entry |process(?:ed|ing) )?date$/, /^date (?:posted|completed|of transaction)$/, /^posted$/, /^date ?\/ ?time$/],
  },
  { role: "balance", patterns: [/^(?:running |closing |account |new )?balance$/, /^bal$/] },
  {
    role: "debit",
    patterns: [/^(?:money|paid|payments|amount|total|cash|paid \/ transferred) out$/, /^withdrawals?$/, /^withdrawn$/, /^debits?$/, /^debit amount$/, /^out$/, /^spent$/, /^payments?$/, /^dr$/, /^charges$/],
  },
  {
    role: "credit",
    patterns: [/^(?:money|paid|payments|amount|cash) in$/, /^deposits?$/, /^credits?$/, /^credit amount$/, /^in$/, /^received$/, /^receipts$/, /^cr$/, /^additions$/],
  },
  { role: "amount", patterns: [/^(?:transaction |trans |net |total )?amount$/, /^value$/, /^sum$/] },
  { role: "type", patterns: [/^(?:payment |pay |transaction |trans )?type$/, /^type of transaction$/, /^code$/, /^method$/] },
  {
    role: "description",
    patterns: [
      /^description$/,
      /^details$/,
      /^payment type and details$/,
      /^transactions?(?: details| description)?$/,
      /^transaction details and description$/,
      /^description of transaction$/,
      /^narrative$/,
      /^particulars$/,
      /^counter ?party$/,
      /^reference$/,
      /^merchant$/,
      /^payee$/,
      /^name$/,
      /^memo$/,
      /^notes?$/,
      /^category$/,
      /^activity$/,
    ],
  },
];

// "Money out £", "Amount (GBP)", "£ In", "Balance (£)" → "money out", "amount", "in", "balance".
function normalizeHeaderLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/\((?:gbp|usd|eur|£|\$|€)\)/g, " ")
    .replace(/\b(?:gbp|usd|eur)\b/g, " ")
    .replace(/[£$€()*:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerRole(text: string): ColumnRole | null {
  const label = normalizeHeaderLabel(text);
  if (!label) return null;
  for (const { role, patterns } of HEADER_ROLES) {
    if (patterns.some((pattern) => pattern.test(label))) return role;
  }
  return null;
}

const MONEY_ROLES = new Set<ColumnRole>(["debit", "credit", "amount", "balance"]);

// "Paid in Withdrawn Balance" as one run of text: split it back into headers,
// placing each by its share of the run's width.
function splitHeaderCell(cell: Cell): Column[] | null {
  const words = cell.text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const found: Array<{ role: ColumnRole; label: string; start: number; end: number }> = [];
  let index = 0;
  while (index < words.length) {
    let matched = false;
    for (let length = Math.min(4, words.length - index); length >= 1; length -= 1) {
      const label = words.slice(index, index + length).join(" ");
      const role = headerRole(label);
      if (role) {
        found.push({ role, label, start: index, end: index + length });
        index += length;
        matched = true;
        break;
      }
    }
    if (!matched) return null;
  }
  if (found.length < 2) return null;
  const offsets: number[] = [];
  let position = 0;
  for (const word of words) {
    offsets.push(position);
    position += word.length + 1;
  }
  const total = Math.max(1, position - 1);
  const width = cell.x1 - cell.x0;
  return found.map((item) => ({
    role: item.role,
    label: item.label,
    x0: cell.x0 + (offsets[item.start] / total) * width,
    x1: cell.x0 + ((offsets[item.end - 1] + words[item.end - 1].length) / total) * width,
  }));
}

function columnsFromLine(line: Line): Column[] | null {
  const columns: Column[] = [];
  for (const cell of line.cells) {
    const role = headerRole(cell.text);
    if (role) columns.push({ role, label: cell.text, x0: cell.x0, x1: cell.x1 });
    else columns.push(...(splitHeaderCell(cell) ?? []));
  }
  const hasDate = columns.some((column) => column.role === "date");
  const hasMoney = columns.some((column) => column.role === "debit" || column.role === "credit" || column.role === "amount");
  // A header also needs more matched cells than strays: "Date" alone in a letter is not a table.
  if (!hasDate || !hasMoney || columns.length < 3) return null;
  // Without a description column, everything that is not a date or money reads as description.
  if (!columns.some((column) => column.role === "description" || column.role === "type")) {
    const date = columns.find((column) => column.role === "date")!;
    const firstMoney = columns.filter((column) => MONEY_ROLES.has(column.role)).sort((a, b) => a.x0 - b.x0)[0];
    columns.push({ role: "description", label: "", x0: date.x1 + 4, x1: Math.max(date.x1 + 8, firstMoney.x0 - 4) });
  }
  return columns.sort((a, b) => a.x0 - b.x0);
}

// A header split across two lines ("Money" / "out £") only matches once the
// pieces are stacked back together, so a line with a date header but no money
// header borrows the money headers from the line beneath it.
function detectHeader(lines: Line[], startIndex: number): { columns: Column[]; index: number } | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const direct = columnsFromLine(line);
    if (direct) return { columns: direct, index };
    const next = lines[index + 1];
    if (next && next.page === line.page && line.y - next.y < line.height * 2.2 && line.cells.some((cell) => headerRole(cell.text) === "date")) {
      const merged = columnsFromLine({ ...line, cells: [...line.cells, ...next.cells] });
      if (merged) return { columns: merged, index: index + 1 };
    }
  }
  return null;
}

// Column whose edges or centre sit closest to the cell. Right-aligned figures
// share a right edge with their header, left-aligned text a left edge, and
// centred headers a centre, so the nearest of the three distances is used.
function nearestColumn(columns: Column[], cell: Cell): Column {
  let best = columns[0];
  let bestDistance = Infinity;
  for (const column of columns) {
    const centreGap = Math.abs((cell.x0 + cell.x1) / 2 - (column.x0 + column.x1) / 2);
    const distance = Math.min(Math.abs(cell.x1 - column.x1), Math.abs(cell.x0 - column.x0), centreGap);
    if (distance < bestDistance) {
      best = column;
      bestDistance = distance;
    }
  }
  return best;
}

// ─── Money and dates ─────────────────────────────────────────────────────────

// "85.00", "-1,234.56", "£2,500.00", "(23.50)", "34.99 CR", "12.00-", "+0.42".
const MONEY_CELL = /^(?<sign>[-+−–])?\s*(?<cur>[£$€])?\s*(?<sign2>[-+−–])?\s*(?<open>\()?\s*(?<cur2>[£$€])?(?<num>\d{1,3}(?:,\d{3})+(?:\.\d{2})|\d+\.\d{2})\s*(?<close>\))?\s*(?<trail>-|CR|DR|DB|D|C)?$/i;

type MoneyToken = { value: number; signed: boolean; creditMarker: boolean };

function parseMoneyCell(text: string): MoneyToken | null {
  const match = text.trim().match(MONEY_CELL);
  if (!match?.groups) return null;
  const value = Number(match.groups.num.replaceAll(",", ""));
  if (!Number.isFinite(value)) return null;
  const trail = (match.groups.trail ?? "").toUpperCase();
  const negative = Boolean(match.groups.sign || match.groups.sign2 || match.groups.open || trail === "-" || trail === "DR" || trail === "DB" || trail === "D");
  const positiveMark = match.groups.sign === "+" || match.groups.sign2 === "+";
  const creditMarker = trail === "CR" || trail === "C";
  const signed = negative || positiveMark || creditMarker;
  const explicitNegative = negative && !(match.groups.sign === "+" || match.groups.sign2 === "+");
  return { value: explicitNegative ? -value : value, signed, creditMarker };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (name: string) => {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : null;
};

type DateParts = { year: number; month: number; day: number };
type Period = { start: DateParts; end: DateParts };

const partsToIso = ({ year, month, day }: DateParts): string | null => {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const partsKey = ({ year, month, day }: DateParts) => year * 10000 + month * 100 + day;
const normalizeYear = (year: number) => (year < 100 ? 2000 + year : year);

const WEEKDAY_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i;
const ORDINAL = /(\d)(?:st|nd|rd|th)\b/gi;

// Splits a leading date off a cell ("15 Dec", "02 Jan 26", "02/01/2026", "02JAN26",
// "Jan 2, 2026"; optionally followed by more text) and returns the remainder.
function splitLeadingDate(
  text: string,
  context: { period: Period | null; fallbackMonth: string; dateOrder: DateOrder },
): { iso: string; rest: string } | null {
  const cleaned = text.trim().replace(WEEKDAY_PREFIX, "").replace(ORDINAL, "$1");
  const attempts: Array<{ pattern: RegExp; build: (m: RegExpMatchArray) => DateParts | null }> = [
    {
      pattern: /^(\d{1,2})[ \-/]?([A-Za-z]{3,9})\.?[ \-/,]*(\d{4}|\d{2})(?=\s|$)/,
      build: (m) => {
        const month = monthIndex(m[2]);
        return month ? { year: normalizeYear(Number(m[3])), month, day: Number(m[1]) } : null;
      },
    },
    {
      pattern: /^(\d{1,2})[ \-/]?([A-Za-z]{3,9})\.?(?=\s|$)/,
      build: (m) => {
        const month = monthIndex(m[2]);
        return month ? { year: yearFor(month, Number(m[1]), context), month, day: Number(m[1]) } : null;
      },
    },
    {
      pattern: /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?=\s|$)/,
      build: (m) => {
        const month = monthIndex(m[1]);
        return month ? { year: Number(m[3]), month, day: Number(m[2]) } : null;
      },
    },
    {
      pattern: /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?=\s|$)/,
      build: (m) => {
        const month = monthIndex(m[1]);
        return month ? { year: yearFor(month, Number(m[2]), context), month, day: Number(m[2]) } : null;
      },
    },
    {
      pattern: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?=\s|$)/,
      build: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }),
    },
    {
      pattern: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?=\s|$)/,
      build: (m) => {
        const first = Number(m[1]);
        const second = Number(m[2]);
        const monthFirst = first > 12 ? false : second > 12 ? true : context.dateOrder === "mdy";
        return { year: normalizeYear(Number(m[3])), month: monthFirst ? first : second, day: monthFirst ? second : first };
      },
    },
    {
      pattern: /^(\d{1,2})[-/.](\d{1,2})(?=\s|$)/,
      build: (m) => {
        const first = Number(m[1]);
        const second = Number(m[2]);
        const monthFirst = first > 12 ? false : second > 12 ? true : context.dateOrder === "mdy";
        const month = monthFirst ? first : second;
        const day = monthFirst ? second : first;
        return { year: yearFor(month, day, context), month, day };
      },
    },
  ];
  for (const { pattern, build } of attempts) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    const parts = build(match);
    const iso = parts ? partsToIso(parts) : null;
    if (!iso) continue;
    return { iso, rest: cleaned.slice(match[0].length).trim() };
  }
  return null;
}

// Year for a date printed without one: whichever of the period's end year and
// the year before puts the date nearest the statement period (inside it, ideally).
// A December row on a statement ending in January goes to the earlier year; a
// row dated the day after the period closes stays in the later one. With no
// period, the month being imported into decides.
function yearFor(month: number, day: number, context: { period: Period | null; fallbackMonth: string }): number {
  if (context.period) {
    const { start, end } = context.period;
    const dayNumber = (parts: DateParts) => Math.round(new Date(parts.year, parts.month - 1, parts.day).getTime() / 86_400_000);
    const from = dayNumber(start);
    const to = dayNumber(end);
    const distance = (year: number) => {
      const value = dayNumber({ year, month, day });
      return value < from ? from - value : value > to ? value - to : 0;
    };
    return distance(end.year) <= distance(end.year - 1) ? end.year : end.year - 1;
  }
  const year = Number(context.fallbackMonth.slice(0, 4));
  const fallbackMonthNumber = Number(context.fallbackMonth.slice(5, 7));
  return month > fallbackMonthNumber + 1 ? year - 1 : year;
}

const SEP = String.raw`\s*(?:to|-|–|—|until|through|thru)\s*`;
const LONG_DATE = String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})`;
const SHORT_DATE = String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?`;
const SLASH_DATE = String.raw`(\d{1,2})[/.](\d{1,2})[/.](\d{4})`;
const US_DATE = String.raw`([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})`;

// Finds "13 December 2025 to 12 January 2026", "2 January to 31 January 2026",
// "01/01/2026 – 31/01/2026" or "January 1, 2026 - January 31, 2026"; failing
// that, a statement date, so rows with no year can still be placed.
export function detectStatementPeriod(text: string, dateOrder: DateOrder = "dmy"): Period | null {
  const full = text.match(new RegExp(`${LONG_DATE}${SEP}${LONG_DATE}`, "i"));
  if (full) {
    const start = monthIndex(full[2]);
    const end = monthIndex(full[5]);
    if (start && end) return { start: { year: Number(full[3]), month: start, day: Number(full[1]) }, end: { year: Number(full[6]), month: end, day: Number(full[4]) } };
  }
  const shortStart = text.match(new RegExp(`${SHORT_DATE}${SEP}${LONG_DATE}`, "i"));
  if (shortStart) {
    const start = monthIndex(shortStart[2]);
    const end = monthIndex(shortStart[4]);
    if (start && end) {
      const endYear = Number(shortStart[5]);
      return { start: { year: start > end ? endYear - 1 : endYear, month: start, day: Number(shortStart[1]) }, end: { year: endYear, month: end, day: Number(shortStart[3]) } };
    }
  }
  const slashes = text.match(new RegExp(`${SLASH_DATE}${SEP}${SLASH_DATE}`));
  if (slashes) {
    const read = (a: string, b: string, year: string): DateParts => {
      const first = Number(a);
      const second = Number(b);
      const monthFirst = first > 12 ? false : second > 12 ? true : dateOrder === "mdy";
      return { year: Number(year), month: monthFirst ? first : second, day: monthFirst ? second : first };
    };
    return { start: read(slashes[1], slashes[2], slashes[3]), end: read(slashes[4], slashes[5], slashes[6]) };
  }
  const us = text.match(new RegExp(`${US_DATE}${SEP}${US_DATE}`, "i"));
  if (us) {
    const start = monthIndex(us[1]);
    const end = monthIndex(us[4]);
    if (start && end) return { start: { year: Number(us[3]), month: start, day: Number(us[2]) }, end: { year: Number(us[6]), month: end, day: Number(us[5]) } };
  }

  const single =
    text.match(new RegExp(String.raw`(?:statement (?:date|period ending|ending|as at)|issued(?: on)?|as at|as of|date of statement)[:\s]*${LONG_DATE}`, "i")) ??
    text.match(new RegExp(String.raw`(?:statement (?:date|period ending|ending|as at)|issued(?: on)?|as at|as of|date of statement)[:\s]*${US_DATE}`, "i"));
  if (single) {
    const named = /^\d/.test(single[1]) ? { day: single[1], month: single[2] } : { day: single[2], month: single[1] };
    const month = monthIndex(named.month);
    if (month) {
      const end = { year: Number(single[3]), month, day: Number(named.day) };
      return { start: { year: end.year - 1, month: end.month, day: end.day }, end };
    }
  }
  const slashSingle = text.match(new RegExp(String.raw`(?:statement (?:date|period ending|ending|as at)|issued(?: on)?|as at|as of)[:\s]*${SLASH_DATE}`, "i"));
  if (slashSingle) {
    const first = Number(slashSingle[1]);
    const second = Number(slashSingle[2]);
    const monthFirst = first > 12 ? false : second > 12 ? true : dateOrder === "mdy";
    const end = { year: Number(slashSingle[3]), month: monthFirst ? first : second, day: monthFirst ? second : first };
    return { start: { year: end.year - 1, month: end.month, day: end.day }, end };
  }
  return null;
}

// ─── Bank recognition ────────────────────────────────────────────────────────

const BANK_SIGNATURES: Array<[RegExp, string]> = [
  [/barclaycard/i, "Barclaycard"],
  [/barclays/i, "Barclays"],
  [/first direct/i, "first direct"],
  [/m&s bank|marks (?:&|and) spencer financial/i, "M&S Bank"],
  [/hsbc/i, "HSBC"],
  [/halifax/i, "Halifax"],
  [/bank of scotland/i, "Bank of Scotland"],
  [/lloyds/i, "Lloyds"],
  [/ulster bank/i, "Ulster Bank"],
  [/natwest|national westminster/i, "NatWest"],
  [/royal bank of scotland|\brbs\b/i, "RBS"],
  [/santander/i, "Santander"],
  [/nationwide/i, "Nationwide"],
  [/\btsb\b/i, "TSB"],
  [/monzo/i, "Monzo"],
  [/starling/i, "Starling"],
  [/revolut/i, "Revolut"],
  [/metro bank/i, "Metro Bank"],
  [/virgin money|clydesdale|yorkshire bank/i, "Virgin Money"],
  [/co-?operative bank|smile\b/i, "The Co-operative Bank"],
  [/tesco bank/i, "Tesco Bank"],
  [/sainsbury'?s bank/i, "Sainsbury's Bank"],
  [/american express|\bamex\b/i, "American Express"],
  [/capital one/i, "Capital One"],
  [/\bzopa\b/i, "Zopa"],
  [/\bkroo\b/i, "Kroo"],
  [/marcus by goldman sachs|\bmarcus\b/i, "Marcus"],
  [/\bwise\b.*(?:payments|europe|account)|transferwise/i, "Wise"],
  [/\btide\b.*(?:platform|business)/i, "Tide"],
  [/triodos/i, "Triodos"],
  [/\bchase\b|jpmorgan|j\.p\. morgan/i, "Chase"],
  [/bank of america/i, "Bank of America"],
  [/wells fargo/i, "Wells Fargo"],
  [/citibank|\bciti\b/i, "Citi"],
  [/u\.?s\.? bank\b/i, "U.S. Bank"],
  [/\bpnc\b/i, "PNC"],
  [/td bank/i, "TD Bank"],
  [/truist/i, "Truist"],
  [/\bally\b/i, "Ally"],
  [/discover/i, "Discover"],
  [/charles schwab|\bschwab\b/i, "Charles Schwab"],
  [/\bsofi\b/i, "SoFi"],
];

export function detectStatementBank(text: string): string | undefined {
  return BANK_SIGNATURES.find(([pattern]) => pattern.test(text))?.[1];
}

// ─── Row assembly ────────────────────────────────────────────────────────────

type Draft = {
  page: number;
  y: number;
  height: number;
  date: string;
  parts: string[];
  typeCode: string;
  amount: number | null;
  // "debit"/"credit" when a column fixed the direction, "amount" when a single column
  // carried a sign, "unsigned" when the figure had no sign information at all.
  signSource: "debit" | "credit" | "amount" | "unsigned";
  balance: number | null;
  continuations: number;
};

// Rows that are part of the table furniture rather than transactions.
const BALANCE_ROW = /^(?:(?:opening|closing|start|starting|end|ending|previous|new|current|available|running|statement) balance|balance (?:brought|carried) forward|balance b\/?f|balance c\/?f|brought forward|carried forward|b\/f|c\/f|total(?:s| payments| receipts| money (?:in|out)| paid (?:in|out)| in| out)?|sub-?total|payments (?:in|out)|money (?:in|out))\b/i;
const FURNITURE_LINE = /^(?:page \d+(?: of \d+)?|continued(?: on| from)?\b|sheet (?:number|no\.?)?\s*\d+|your (?:transactions|statement)|statement (?:continued|period|date|number)|end of (?:statement|transactions)|\*{3,}|-{3,}|this is the end\b)/i;

// Type codes banks print beside or in front of the details (HSBC "VIS", Lloyds
// "DEB", NatWest "POS" …). Moved to the end of the description so the merchant
// leads, matching how the same banks' CSV exports read.
const TYPE_CODE = /^(?:ATM|BP|CR|DD|DR|SO|STO|TFR|VIS|CHQ|CSH|CDM|DEB|DEP|FPI|FPO|FPS|BGC|DDR|CPT|CLP|CPM|BBP|OBP|BAC|POS|INT|CHG|COR|MPI|MPO|PAY|\)\)\))$/i;

function isTypeCode(text: string): boolean {
  return TYPE_CODE.test(text.trim());
}

export function parsePdfStatement({ pages, state, fallbackMonthKey, flipSigns, dateOrder }: ParsePdfStatementOptions): PdfStatementResult {
  const fallbackMonth = fallbackMonthKey ?? state.selectedMonth ?? getMonthKey();
  const order = dateOrder ?? (state.country ? dateOrderFor(regionOf(state.country)) : "dmy");
  const lines = pages.flatMap((page) => groupTextLines(page));
  const fullText = lines.map(lineText).join("\n");
  // The issuer is named in the letterhead and the footer, not in the rows: a
  // Barclaycard payment on an HSBC statement must not make it a Barclaycard PDF.
  const firstHeader = detectHeader(lines, 0)?.index ?? lines.length;
  const masthead = lines.slice(0, firstHeader).map(lineText).join("\n");
  const footer = lines.slice(-3).map(lineText).join("\n");
  const bank = detectStatementBank(masthead) ?? detectStatementBank(footer) ?? detectStatementBank(fullText);
  const period = detectStatementPeriod(masthead, order) ?? detectStatementPeriod(fullText, order);
  const context = { period, fallbackMonth, dateOrder: order };
  const existingHashes = collectExistingTransactionHashes(state);

  const empty = (errors: string[], layout: PdfStatementResult["layout"]): PdfStatementResult => ({
    rows: [],
    errors,
    detectedColumns: {},
    totalRows: 0,
    bank,
    pageCount: pages.length,
    layout,
    diagnostics: pages.map((page) => ({ page: page.pageNumber, lines: lines.filter((line) => line.page === page.pageNumber).length, header: false, rows: 0 })),
  });

  if (!lines.length) {
    return empty(
      [
        "This PDF has no selectable text, so it is probably a scanned image of a statement. Download a CSV from your bank instead, or type the lines in using Paste.",
      ],
      "none",
    );
  }

  const diagnostics: PdfPageDiagnostics[] = [];
  const columnar = classifyDocument(lines, context, diagnostics);
  let drafts = columnar.columns ? settleSigns(assemble(columnar.classified, diagnostics)) : [];
  let columns = columnar.columns;
  if (!drafts.length) {
    // No usable header: read each line by its shape instead.
    diagnostics.length = 0;
    for (const page of new Set(lines.map((line) => line.page))) diagnostics.push({ page, lines: lines.filter((line) => line.page === page).length, header: false, rows: 0 });
    drafts = settleSigns(assemble(lines.map((line) => classifyByShape(line, context)), diagnostics));
    columns = null;
  }

  if (!drafts.length) {
    const issuer = bank ? `this ${bank} PDF` : "this PDF";
    return empty(
      [
        `Couldn’t find a transaction table in ${issuer}. PDF import reads statements from ${PDF_SUPPORTED_BANKS.slice(0, 6).join(", ")} and most other UK and US banks, with a Date column and either Money out / Money in or Amount columns. If this is a statement in another layout, copy the transaction rows and use Paste instead.`,
      ],
      "none",
    );
  }

  const singleAmount = Boolean(columns?.some((column) => column.role === "amount")) && !columns?.some((column) => column.role === "debit" || column.role === "credit");
  const applyFlip = Boolean(flipSigns) && (columns ? singleAmount : true);

  const rows: CsvImportRow[] = drafts.map((draft, index) => {
    const description = [...draft.parts, draft.typeCode].join(" ").replace(/\s+/g, " ").trim();
    const amount = applyFlip ? Number((-(draft.amount ?? 0)).toFixed(2)) : Number((draft.amount ?? 0).toFixed(2));
    return buildImportRow({
      rowNumber: index + 1,
      date: draft.date,
      description,
      amount,
      bankCategory: "",
      state,
      existingHashes,
      noteOverride: draft.signSource === "unsigned" ? "Assumed spending — flip to income if wrong" : undefined,
    });
  });

  const detectedColumns: CsvImportResult["detectedColumns"] = columns
    ? {
        date: columns.find((column) => column.role === "date")?.label,
        description: columns.find((column) => column.role === "description")?.label || undefined,
        amount: columns.find((column) => column.role === "amount")?.label,
        debit: columns.find((column) => column.role === "debit")?.label,
        credit: columns.find((column) => column.role === "credit")?.label,
      }
    : { date: "Date", description: "Description", amount: "Amount" };

  return {
    rows: markTransferPairs(sortImportRows(rows)),
    errors: [],
    detectedColumns,
    totalRows: rows.length,
    signInverted: applyFlip,
    bank,
    pageCount: pages.length,
    layout: columns ? "columns" : "lines",
    diagnostics,
  };
}

type ParseContext = { period: Period | null; fallbackMonth: string; dateOrder: DateOrder };

// One line, sorted into what it carries. Produced either from the column model
// (cells under headers) or, without one, from the line's shape (date at the
// start, figures at the end); the same assembler consumes both.
type Classified = {
  line: Line;
  date: string | null;
  // Text sat in the date column that was not a date: footers, addresses, headings.
  dateColumnText: boolean;
  parts: string[];
  typeCode: string;
  money: MoneyToken | null;
  value: number;
  signSource: Draft["signSource"];
  balance: MoneyToken | null;
  text: string;
  furniture: boolean;
  balanceRow: boolean;
};

function classifyWithColumns(line: Line, columns: Column[], context: ParseContext): Classified {
  let date: string | null = null;
  const parts: string[] = [];
  let typeCode = "";
  let debit: MoneyToken | null = null;
  let credit: MoneyToken | null = null;
  let amount: MoneyToken | null = null;
  let balance: MoneyToken | null = null;
  let dateColumnText = false;
  for (const cell of splitFigureRuns(line.cells)) {
    const column = nearestColumn(columns, cell);
    const money = MONEY_ROLES.has(column.role) ? parseMoneyCell(cell.text) : null;
    if (money) {
      // A figure has to sit under its column; one off to the right of every
      // money column is a running balance whose header was not recognised.
      const slack = Math.max(24, column.x1 - column.x0);
      const underColumn = cell.x0 < column.x1 + slack && cell.x1 > column.x0 - slack;
      const role = underColumn ? column.role : cell.x0 >= column.x1 ? "balance" : null;
      if (role === "debit") debit = money;
      else if (role === "credit") credit = money;
      else if (role === "amount") amount = money;
      else if (role === "balance") balance = money;
      else parts.push(cell.text);
      continue;
    }
    if (column.role === "date") {
      const split = splitLeadingDate(cell.text, context);
      if (split) {
        // With two date columns (started / completed) the later one wins.
        date = split.iso;
        if (split.rest) parts.push(split.rest);
        continue;
      }
      dateColumnText = true;
    }
    if ((column.role === "type" || (column.role === "description" && !parts.length)) && isTypeCode(cell.text) && line.cells.length > 1) {
      typeCode = cell.text.trim() === ")))" ? "" : cell.text.trim();
      continue;
    }
    parts.push(cell.text);
  }
  const money = debit ?? credit ?? amount;
  const text = parts.join(" ").trim();
  return {
    line,
    date,
    dateColumnText,
    parts,
    typeCode,
    money,
    value: debit ? -Math.abs(debit.value) : credit ? Math.abs(credit.value) : money ? (money.creditMarker ? Math.abs(money.value) : money.value) : 0,
    signSource: debit ? "debit" : credit ? "credit" : money?.signed ? "amount" : "unsigned",
    balance,
    text,
    furniture: FURNITURE_LINE.test(lineText(line)),
    balanceRow: BALANCE_ROW.test(text),
  };
}

// "23.50 1,126.06" as one run (tight columns): split it into one cell per figure,
// each taking its share of the run's width.
function splitFigureRuns(cells: Cell[]): Cell[] {
  const result: Cell[] = [];
  for (const cell of cells) {
    const tokens = cell.text.split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || !tokens.every((token) => parseMoneyCell(token))) {
      result.push(cell);
      continue;
    }
    const total = cell.text.length;
    const width = cell.x1 - cell.x0;
    let offset = 0;
    for (const token of tokens) {
      const start = cell.text.indexOf(token, offset);
      result.push({ text: token, x0: cell.x0 + (start / total) * width, x1: cell.x0 + ((start + token.length) / total) * width });
      offset = start + token.length;
    }
  }
  return result;
}

// Fallback shape reading: a date at the start, figures at the end (a trailing
// pair is amount + running balance), text in between.
const TRAILING_FIGURE = /(?:^|\s)([-+−(£$€]*\d[\d,]*\.\d{2}\)?(?:\s?(?:CR|DR|DB))?)$/i;

function classifyByShape(line: Line, context: ParseContext): Classified {
  const raw = lineText(line);
  const split = splitLeadingDate(raw, context);
  let rest = split ? split.rest : raw;
  const figures: MoneyToken[] = [];
  while (figures.length < 2) {
    const match = rest.match(TRAILING_FIGURE);
    const money = match ? parseMoneyCell(match[1]) : null;
    if (!match || !money) break;
    figures.unshift(money);
    rest = rest.slice(0, rest.length - match[0].length).trim();
  }
  const text = rest.trim();
  const balanceRow = BALANCE_ROW.test(text);
  // A lone trailing figure on a balance row is the balance, not an amount.
  const [money, balance] = figures.length === 2 ? figures : balanceRow ? [null, figures[0] ?? null] : [figures[0] ?? null, null];
  return {
    line,
    date: split?.iso ?? null,
    dateColumnText: false,
    parts: text ? [text] : [],
    typeCode: "",
    money,
    value: money ? (money.creditMarker ? Math.abs(money.value) : money.value) : 0,
    signSource: money?.signed ? "amount" : "unsigned",
    balance,
    text,
    furniture: FURNITURE_LINE.test(raw),
    balanceRow,
  };
}

// Wording that opens a transaction rather than continuing one: the payment
// type NatWest, RBS, Santander and others print first on the line.
const ROW_START_PHRASE =
  /^(?:automated (?:credit|debit|pay(?:ment)?)|direct debit|standing order|(?:debit |credit )?card (?:payment|purchase|transaction)|contactless|faster payments?|(?:bank )?giro credit|bacs|chaps|cash withdrawal|cheque|online transaction|mobile payment|international payment|interest (?:paid|charged|received)|transfer (?:to|from)|payment (?:to|from)|bill payment|\d{4} \d{2}[a-z]{3}\d{2})\b/i;

// Letters that could be a payee, as opposed to a reference number and a code.
function hasMerchantText(text: string): boolean {
  return /[a-z]{3,}/i.test(text.replace(TYPE_CODE_TOKEN, " "));
}
const TYPE_CODE_TOKEN = /\b(?:ATM|BP|CR|DD|DR|SO|STO|TFR|VIS|CHQ|CSH|CDM|DEB|DEP|FPI|FPO|FPS|BGC|DDR|CPT|CLP|CPM|BBP|OBP|BAC|POS|INT|CHG|COR|MPI|MPO|PAY)\b/gi;

function isBeneath(above: { page: number; y: number; height: number }, below: { page: number; y: number; height: number }): boolean {
  return above.page === below.page && above.y - below.y < Math.max(above.height, below.height) * 2.6;
}

// Where a statement prints a transaction's figures relative to its text.
//   "first": figures on the transaction's first line, any further lines beneath are
//            references, towns, payment types (Barclays, HSBC, Monzo, Starling).
//   "last":  figures on the transaction's last line, the lines above are its type,
//            payee and reference (NatWest, RBS, Metro). A transaction is then one,
//            two or three lines depending on how much the bank has to say.
// The dates decide: a date printed on a line without figures means the figures
// come later. A single stray line does not flip a whole statement.
type FigureOrder = "first" | "last";

function detectFigureOrder(classified: Classified[]): FigureOrder {
  let datedWithFigures = 0;
  let datedWithoutFigures = 0;
  for (const item of classified) {
    if (!item.date || item.furniture || item.balanceRow) continue;
    if (item.money) datedWithFigures += 1;
    else datedWithoutFigures += 1;
  }
  return datedWithoutFigures > 0 && datedWithoutFigures >= (datedWithFigures + datedWithoutFigures) * 0.25 ? "last" : "first";
}

// The next line that is not plain text, provided every line on the way sits
// directly beneath the one before (no page break or gap between them).
function figuresAhead(classified: Classified[], index: number): Classified | null {
  let previous = classified[index];
  for (let ahead = index + 1; ahead < classified.length; ahead += 1) {
    const candidate = classified[ahead];
    if (candidate.furniture || !isBeneath(previous.line, candidate.line)) return null;
    if (candidate.money && !candidate.balanceRow) return candidate;
    if (candidate.balanceRow || candidate.date || !candidate.text || candidate.dateColumnText) return null;
    previous = candidate;
  }
  return null;
}

// Turns classified lines into transactions using the table's structure rather
// than line breaks: figures end a transaction, dates start one, and the
// statement's figure order says whether a text-only line belongs to the
// transaction above it or the one whose figures follow.
function assemble(classified: Classified[], diagnostics?: PdfPageDiagnostics[]): Draft[] {
  const drafts: Draft[] = [];
  const order = detectFigureOrder(classified);
  const cursor: { current: Draft | null; lastDate: string | null } = { current: null, lastDate: null };
  const count = (page: number) => {
    const entry = diagnostics?.find((item) => item.page === page);
    if (entry) entry.rows += 1;
  };
  const finish = () => {
    if (cursor.current && cursor.current.amount !== null) {
      drafts.push(cursor.current);
      count(cursor.current.page);
    }
    cursor.current = null;
  };
  const open = (line: Line, date: string, parts: string[], typeCode: string) => {
    cursor.current = { page: line.page, y: line.y, height: line.height, date, parts: [...parts], typeCode, amount: null, signSource: "unsigned", balance: null, continuations: 0 };
    cursor.lastDate = date;
  };

  for (let index = 0; index < classified.length; index += 1) {
    const item = classified[index];
    if (item.furniture) {
      finish();
      continue;
    }

    if (item.money && !item.balanceRow) {
      const pending = cursor.current;
      // The figures line completes a transaction that started above — also when the
      // date is printed down here rather than on the first line, provided this line
      // carries no payee of its own (a reference number and a code do not count).
      if (pending && pending.amount === null && (!item.date || !hasMerchantText(item.text))) {
        pending.parts.push(...item.parts);
        pending.amount = item.value;
        pending.signSource = item.signSource;
        pending.balance = item.balance?.value ?? null;
        if (item.typeCode) pending.typeCode = item.typeCode;
        if (item.date) {
          pending.date = item.date;
          cursor.lastDate = item.date;
        }
        pending.y = item.line.y;
        finish();
      } else {
        finish();
        const date = item.date ?? cursor.lastDate;
        if (date) {
          open(item.line, date, item.parts, item.typeCode);
          cursor.current!.amount = item.value;
          cursor.current!.signSource = item.signSource;
          cursor.current!.balance = item.balance?.value ?? null;
        }
      }
      continue;
    }

    if (item.balanceRow || (item.balance && !item.text)) {
      finish();
      if (item.balance) drafts.push({ page: item.line.page, y: item.line.y, height: item.line.height, date: "", parts: [], typeCode: "", amount: null, signSource: "unsigned", balance: item.balance.value, continuations: 0 });
      continue;
    }

    if (item.date) {
      // A date opens a transaction; its figures are on this line or below.
      finish();
      open(item.line, item.date, item.parts, item.typeCode);
      continue;
    }

    // Text only.
    if (!item.text || item.dateColumnText) {
      finish();
      continue;
    }
    const current = cursor.current;
    if (current && current.amount === null && isBeneath(current, item.line)) {
      // Still collecting the lines of a transaction whose figures have not arrived.
      current.parts.push(item.text);
      current.y = item.line.y;
      continue;
    }
    const ahead = figuresAhead(classified, index);
    // Figures-last statements: this text belongs to the transaction whose figures
    // follow. Figures-first statements: it is a continuation of the one above,
    // unless it plainly opens a new transaction (a payment-type phrase, or the
    // figures line ahead carries only a reference) whose figures come later.
    const startsRow =
      ahead !== null &&
      (!ahead.date || !hasMerchantText(ahead.text)) &&
      (order === "last" || ROW_START_PHRASE.test(item.text) || !hasMerchantText(ahead.text));
    if (startsRow && (cursor.lastDate || ahead.date)) {
      finish();
      open(item.line, cursor.lastDate ?? ahead.date!, [item.text], item.typeCode);
    } else if (current && order === "first" && isBeneath(current, item.line) && current.continuations < 4) {
      current.parts.push(item.text);
      current.continuations += 1;
      current.y = item.line.y;
      if (item.balance) current.balance = item.balance.value;
    } else {
      finish();
    }
  }
  finish();
  return drafts;
}

export type PdfPageDiagnostics = { page: number; lines: number; header: boolean; rows: number };

// Column mode: find the header on each page (pages without one keep the last
// columns; pages before the first header borrow it) and classify the rows.
function classifyDocument(lines: Line[], context: ParseContext, diagnostics: PdfPageDiagnostics[]): { classified: Classified[]; columns: Column[] | null } {
  const pages = [...new Set(lines.map((line) => line.page))];
  const headers = new Map<number, { columns: Column[]; index: number }>();
  let scanFrom = 0;
  for (const page of pages) {
    const first = lines.findIndex((line, index) => index >= scanFrom && line.page === page);
    const header = detectHeader(lines, first);
    if (header && lines[header.index].page === page) headers.set(page, header);
    scanFrom = lines.findIndex((line) => line.page > page);
    if (scanFrom < 0) break;
  }
  if (!headers.size) return { classified: [], columns: null };

  const classified: Classified[] = [];
  let columns: Column[] | null = null;
  let lastColumns: Column[] | null = null;
  for (const page of pages) {
    const header = headers.get(page);
    const entry = { page, lines: lines.filter((line) => line.page === page).length, header: Boolean(header), rows: 0 };
    diagnostics.push(entry);
    // Borrow the next page's header for a first page that lacks one.
    const borrowed: Column[] | null = !header && !lastColumns ? [...headers.values()][0].columns : null;
    columns = header?.columns ?? lastColumns ?? borrowed;
    if (!columns) continue;
    const startIndex = header ? header.index + 1 : lines.findIndex((line) => line.page === page);
    for (let index = startIndex; index < lines.length && lines[index].page === page; index += 1) {
      const line = lines[index];
      // A header repeated mid-page (a second account or card on the same page).
      const repeated = columnsFromLine(line);
      if (repeated) {
        columns = repeated;
        classified.push({ ...classifyWithColumns(line, columns, context), furniture: true });
        continue;
      }
      classified.push(classifyWithColumns(line, columns, context));
    }
    lastColumns = columns;
  }
  return { classified, columns: lastColumns };
}

// The running balance is the ground truth for direction. Between two printed
// balances the signed amounts must add up to the difference; when they do not,
// the combination of signs that does is applied (that settles unsigned single
// Amount columns and catches a figure that landed under the wrong header).
// Balance-only anchor rows are consumed here and never become transactions.
function settleSigns(drafts: Draft[]): Draft[] {
  const settled: Draft[] = [];
  let previousBalance: number | null = null;
  let group: Draft[] = [];

  const reconcile = (balance: number) => {
    if (previousBalance !== null && group.length) {
      const delta = Number((balance - previousBalance).toFixed(2));
      const sum = group.reduce((total, draft) => total + (draft.amount ?? 0), 0);
      if (Math.abs(sum - delta) > 0.005 && group.length <= 10) {
        const magnitudes = group.map((draft) => Math.abs(draft.amount ?? 0));
        let solution: number | null = null;
        let solutions = 0;
        for (let mask = 0; mask < 1 << group.length; mask += 1) {
          let total = 0;
          for (let bit = 0; bit < group.length; bit += 1) total += mask & (1 << bit) ? magnitudes[bit] : -magnitudes[bit];
          if (Math.abs(total - delta) < 0.005) {
            solutions += 1;
            solution = mask;
          }
        }
        if (solutions === 1 && solution !== null) {
          group.forEach((draft, bit) => {
            draft.amount = solution! & (1 << bit) ? magnitudes[bit] : -magnitudes[bit];
            if (draft.signSource === "unsigned") draft.signSource = "amount";
          });
        }
      } else if (Math.abs(sum - delta) <= 0.005) {
        group.forEach((draft) => {
          if (draft.signSource === "unsigned") draft.signSource = "amount";
        });
      }
    }
    previousBalance = balance;
    group = [];
  };

  for (const draft of drafts) {
    if (draft.amount === null) {
      if (draft.balance !== null) reconcile(draft.balance);
      continue;
    }
    settled.push(draft);
    group.push(draft);
    if (draft.balance !== null) reconcile(draft.balance);
  }
  // Amounts the arithmetic could not vouch for default to spending.
  for (const draft of settled) {
    if (draft.signSource === "unsigned" && draft.amount !== null) draft.amount = -Math.abs(draft.amount);
  }
  return settled.filter((draft) => draft.amount !== null && draft.amount !== 0 && draft.date);
}

// ─── Entry point used by the app ─────────────────────────────────────────────
// Mirrors parseBankText: auto-detects credit-card sign convention unless the
// caller (the review's flip toggle) decided already.

export function parsePdfStatementWithDetection(options: ParsePdfStatementOptions): PdfStatementResult {
  const result = parsePdfStatement(options);
  if (options.flipSigns === undefined && result.rows.length && detectLikelySignInversion(result)) {
    return parsePdfStatement({ ...options, flipSigns: true });
  }
  return result;
}

// True when the bytes start with the PDF magic number, whatever the file is called.
export function looksLikePdf(bytes: ArrayBuffer | Uint8Array, fileName = ""): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = Array.from(view.slice(0, 5), (byte) => String.fromCharCode(byte)).join("");
  return head === "%PDF-" || fileName.toLowerCase().endsWith(".pdf");
}
