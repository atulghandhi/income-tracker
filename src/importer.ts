import { colors, getMonthKey } from "./finance";
import type { CategoryRule, CategorySource, LedgerState, MonthBudget, TransactionKind } from "./types";

export type CsvImportRow = {
  id: string;
  rowNumber: number;
  date: string;
  monthKey: string;
  description: string;
  // Short, human label shown in review and saved as the entry name. `description`
  // keeps the raw bank text for dedupe, rules and AI categorisation.
  name: string;
  amount: number;
  rawAmount: string;
  kind: TransactionKind;
  suggestedKind: TransactionKind;
  category: string;
  suggestedCategory: string;
  color: string;
  include: boolean;
  duplicate: boolean;
  confidence: number;
  note: string;
  hash: string;
  // Which layer produced the current category — flips to "user" on manual edit so
  // downstream automation (retroactive rules, AI upgrades) never overrides it.
  categorySource: CategorySource;
  // For debt-payment rows: which debt account this payment reduces. Optional — unlinked
  // debt payments still import as expenses, they just don't feed the balance roll-forward.
  debtAccountId?: string;
};

export type CsvImportResult = {
  rows: CsvImportRow[];
  errors: string[];
  detectedColumns: {
    date?: string;
    description?: string;
    amount?: string;
    debit?: string;
    credit?: string;
    category?: string;
  };
  totalRows: number;
  // True when amounts were negated because the file follows the credit-card
  // statement convention (charges positive, refunds/payments negative).
  signInverted?: boolean;
};

type ParseBankCsvOptions = {
  text: string;
  fileName: string;
  state: LedgerState;
  fallbackMonthKey?: string;
  // Negate single-amount-column values (credit-card statements). Ignored for
  // files with separate debit/credit columns — those are already unambiguous.
  flipSigns?: boolean;
};

type ColumnMap = {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  category?: number;
};

type CategorySuggestion = {
  kind: TransactionKind;
  category: string;
  confidence: number;
  note: string;
  source: CategorySource;
  debtAccountId?: string;
};

const DATE_HEADERS = ["date", "transaction date", "posted date", "booking date", "completed date", "value date"];
const DESCRIPTION_HEADERS = ["description", "details", "narrative", "merchant", "name", "transaction", "reference", "payee", "memo"];
const AMOUNT_HEADERS = ["amount", "value", "transaction amount", "net amount", "money in/out", "in/out", "paid in/out"];
const DEBIT_HEADERS = ["debit", "withdrawal", "withdrawals", "paid out", "money out", "out", "debits"];
const CREDIT_HEADERS = ["credit", "deposit", "deposits", "paid in", "money in", "in", "credits"];
const CATEGORY_HEADERS = ["category", "type", "classification"];

const SYSTEM_RULES: Array<{ pattern: RegExp; category: string; kind?: TransactionKind; confidence: number; note: string }> = [
  { pattern: /\b(salary|payroll|wages?|employer|pay\s?slip)\b/i, category: "Income", kind: "income", confidence: 0.92, note: "Matched income wording" },
  { pattern: /\b(rent|mortgage|letting|landlord)\b/i, category: "Home", confidence: 0.88, note: "Matched housing wording" },
  { pattern: /\b(council tax|electric|electricity|gas|water|broadband|internet|mobile|phone|utility)\b/i, category: "Bills", confidence: 0.86, note: "Matched bill wording" },
  { pattern: /\b(tesco|sainsbury|asda|aldi|lidl|waitrose|morrisons|coop|co-op|grocery|supermarket)\b/i, category: "Food", confidence: 0.88, note: "Matched grocery merchant" },
  { pattern: /\b(restaurant|cafe|coffee|deliveroo|ubereats|just eat|pret|starbucks|costa)\b/i, category: "Food", confidence: 0.82, note: "Matched food merchant" },
  { pattern: /\b(tfl|uber|bolt|train|rail|petrol|fuel|parking|bus|tube|transport)\b/i, category: "Travel", confidence: 0.85, note: "Matched travel wording" },
  { pattern: /\b(netflix|spotify|prime|apple\.com|google|microsoft|disney|subscription)\b/i, category: "Subscriptions", confidence: 0.86, note: "Matched subscription merchant" },
  { pattern: /\b(pharmacy|chemist|dentist|doctor|hospital|optician|health)\b/i, category: "Health", confidence: 0.82, note: "Matched health wording" },
  { pattern: /\b(hmrc|tax|national insurance)\b/i, category: "Tax", confidence: 0.84, note: "Matched tax wording" },
  { pattern: /\b(amex|barclaycard|capital one|credit card|mastercard|visa payment|card payment)\b/i, category: "Debt payments", kind: "debt-payment", confidence: 0.86, note: "Matched debt payment wording" },
  { pattern: /\b(transfer|internal|savings?|standing order to self)\b/i, category: "Transfers", kind: "transfer", confidence: 0.78, note: "Matched transfer wording" },
];

export function parseBankCsv({ text, fileName, state, fallbackMonthKey, flipSigns }: ParseBankCsvOptions): CsvImportResult {
  const table = parseCsvTable(text);
  const nonEmptyRows = table.filter((row) => row.some((cell) => cell.trim()));
  const fallbackMonth = fallbackMonthKey ?? state.selectedMonth ?? getMonthKey();

  if (nonEmptyRows.length < 2) {
    return {
      rows: [],
      errors: ["The CSV needs a header row and at least one transaction row."],
      detectedColumns: {},
      totalRows: 0,
    };
  }

  const headerRow = nonEmptyRows[0];
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const columns = detectColumns(normalizedHeaders);
  const errors = validateColumns(columns);
  const existingHashes = collectExistingTransactionHashes(state);

  if (errors.length) {
    return {
      rows: [],
      errors,
      detectedColumns: buildDetectedColumns(headerRow, columns),
      totalRows: Math.max(0, nonEmptyRows.length - 1),
    };
  }

  // Sign flipping only applies to single-amount files; debit/credit columns
  // already carry unambiguous direction.
  const applyFlip = Boolean(flipSigns) && columns.amount !== undefined && columns.debit === undefined && columns.credit === undefined;

  const rows = nonEmptyRows.slice(1).flatMap((cells, index) => {
    const rowNumber = index + 2;
    const description = getCell(cells, columns.description).trim();
    const parsedAmount = readAmount(cells, columns);
    const isoDate = parseDateValue(getCell(cells, columns.date), fallbackMonth) ?? monthStartDate(fallbackMonth);

    if (!description || parsedAmount === null) return [];

    const amount = applyFlip ? Number((-parsedAmount).toFixed(2)) : parsedAmount;
    const bankCategory = columns.category === undefined ? "" : getCell(cells, columns.category).trim();
    return [buildImportRow({ rowNumber, date: isoDate, description, amount, bankCategory, state, existingHashes })];
  });

  return {
    rows: sortImportRows(rows),
    errors: rows.length ? [] : ["No importable transactions were found in this CSV."],
    detectedColumns: buildDetectedColumns(headerRow, columns),
    totalRows: Math.max(0, nonEmptyRows.length - 1),
    signInverted: applyFlip,
  };
}

// Credit-card statements invert the sign convention: charges are positive,
// refunds/payments negative. The tell: "positive" rows whose descriptions match
// spending merchants (groceries, coffee, travel…) — real income never looks
// like that. Only single-amount files qualify; debit/credit files are explicit.
const SPENDING_CATEGORIES = new Set(["Home", "Bills", "Food", "Travel", "Subscriptions", "Health"]);

export function detectLikelySignInversion(result: CsvImportResult): boolean {
  if (!result.detectedColumns.amount || result.detectedColumns.debit || result.detectedColumns.credit) return false;
  const rows = result.rows.filter((row) => row.amount !== 0);
  if (rows.length < 3) return false;

  const positiveRows = rows.filter((row) => row.amount > 0);
  if (positiveRows.length / rows.length < 0.6) return false;

  const spendingShapedIncome = positiveRows.filter(
    (row) => row.kind === "income" && SPENDING_CATEGORIES.has(row.category),
  ).length;
  return spendingShapedIncome >= 2;
}

type BuildImportRowOptions = {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  bankCategory: string;
  state: LedgerState;
  existingHashes: Set<string>;
  // Stable provider transaction ID (OFX FITID, FinanceKit/feed transaction ID). When
  // present it becomes the dedupe key — stronger than date|description|amount.
  externalId?: string;
  noteOverride?: string;
};

// Single point every capture path funnels through — CSV rows, pasted lines, OFX/QIF
// records, and staged bank-feed transactions all become the same reviewable row.
export function buildImportRow({
  rowNumber,
  date,
  description,
  amount,
  bankCategory,
  state,
  existingHashes,
  externalId,
  noteOverride,
}: BuildImportRowOptions): CsvImportRow {
  const suggestion = suggestCategory(description, amount, state.categoryRules, bankCategory);
  const hash = externalId ? `ext-${externalId.replace(/[^a-zA-Z0-9_-]/g, "")}` : createTransactionHash(date, description, amount);
  const fallbackHash = createTransactionHash(date, description, amount);
  const duplicate = existingHashes.has(hash) || existingHashes.has(fallbackHash);
  const kind = suggestion.kind;

  return {
    id: `draft-${rowNumber}-${hash}`,
    rowNumber,
    date,
    monthKey: date.slice(0, 7),
    description,
    name: cleanMerchantName(description) || description,
    amount,
    rawAmount: amount.toFixed(2),
    kind,
    suggestedKind: kind,
    category: suggestion.category,
    suggestedCategory: suggestion.category,
    color: categoryColor(suggestion.category),
    include: !duplicate && kind !== "transfer",
    duplicate,
    confidence: suggestion.confidence,
    note: duplicate ? "Possible duplicate" : noteOverride ?? suggestion.note,
    hash,
    categorySource: suggestion.source,
    debtAccountId: suggestion.debtAccountId,
  };
}

// A saved rule matches when every word in its pattern appears in the description (as a
// token substring). This survives stop-words like "to"/"from" that buildRulePattern strips,
// so a pattern of "transfer savings" still matches "Transfer to Savings".
export function descriptionMatchesPattern(normalizedDescription: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim().toLowerCase();
  if (!normalizedPattern) return false;
  const descTokens = normalizedDescription.split(" ").filter(Boolean);
  const patternTokens = normalizedPattern.split(" ").filter(Boolean);
  if (!patternTokens.length) return false;
  return patternTokens.every((patternToken) => descTokens.some((descToken) => descToken.includes(patternToken)));
}

// True when a description matches any saved transfer rule — used to skip inter-account
// transfers on import and to retroactively sweep them out of the ledger.
export function isTransferDescription(description: string, rules: CategoryRule[]): boolean {
  const normalized = normalizeMerchant(description);
  if (!normalized) return false;
  return rules.some((rule) => rule.kind === "transfer" && descriptionMatchesPattern(normalized, rule.pattern));
}

export function createTransactionHash(date: string, description: string, amount: number): string {
  const key = `${date}|${normalizeMerchant(description)}|${amount.toFixed(2)}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(31, hash) + key.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function buildRulePattern(description: string): string {
  return normalizeMerchant(description)
    .split(" ")
    .filter((part) => part.length > 2 && !/^\d+$/.test(part))
    .slice(0, 3)
    .join(" ");
}

export function sortImportRows(rows: CsvImportRow[]): CsvImportRow[] {
  return [...rows].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.kind.localeCompare(b.kind) ||
      a.category.localeCompare(b.category) ||
      Math.abs(b.amount) - Math.abs(a.amount) ||
      a.rowNumber - b.rowNumber,
  );
}

function parseCsvTable(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field);
  rows.push(row);

  return rows;
}

function detectDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, score: parseCsvLine(sample, delimiter).length }))
    .sort((a, b) => b.score - a.score)[0].delimiter;
}

function parseCsvLine(line: string, delimiter: "," | ";" | "\t"): string[] {
  const rows = parseCsvTableWithDelimiter(line, delimiter);
  return rows[0] ?? [];
}

function parseCsvTableWithDelimiter(text: string, delimiter: "," | ";" | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function detectColumns(headers: string[]): ColumnMap {
  let amount = optionalColumn(headers, AMOUNT_HEADERS);
  let debit = optionalColumn(headers, DEBIT_HEADERS);
  let credit = optionalColumn(headers, CREDIT_HEADERS);
  // One column matched both "money in" and "money out": it is a signed amount.
  if (debit !== undefined && debit === credit) {
    amount = amount ?? debit;
    debit = undefined;
    credit = undefined;
  }
  // "Debit Amount" + "Credit Amount": keep the pair, not one of them as the amount.
  if (debit !== undefined && credit !== undefined && (amount === debit || amount === credit)) {
    amount = undefined;
  }
  return {
    date: findColumn(headers, DATE_HEADERS),
    description: findColumn(headers, DESCRIPTION_HEADERS),
    amount,
    debit,
    credit,
    category: optionalColumn(headers, CATEGORY_HEADERS),
  };
}

function validateColumns(columns: ColumnMap): string[] {
  const errors: string[] = [];
  if (columns.date < 0) errors.push("Could not find a transaction date column.");
  if (columns.description < 0) errors.push("Could not find a description, merchant, or payee column.");
  if (columns.amount === undefined && columns.debit === undefined && columns.credit === undefined) {
    errors.push("Could not find either an amount column or debit/credit columns.");
  }
  return errors;
}

function findColumn(headers: string[], aliases: string[]): number {
  const exact = headers.findIndex((header) => aliases.includes(header));
  if (exact >= 0) return exact;
  return headers.findIndex((header) => aliases.some((alias) => containsAliasWords(header, alias)));
}

// Whole-word containment, so "in" does not match "booking date" and "out"
// does not match "checkout". "/" and "_" count as separators.
function headerWords(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9%£$]+/).filter(Boolean);
}

function containsAliasWords(header: string, alias: string): boolean {
  const words = headerWords(header);
  const needle = headerWords(alias);
  if (!needle.length) return false;
  for (let start = 0; start + needle.length <= words.length; start += 1) {
    if (needle.every((word, offset) => words[start + offset] === word)) return true;
  }
  return false;
}

function optionalColumn(headers: string[], aliases: string[]): number | undefined {
  const index = findColumn(headers, aliases);
  return index >= 0 ? index : undefined;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
}

function getCell(cells: string[], index: number | undefined): string {
  if (index === undefined || index < 0) return "";
  return cells[index] ?? "";
}

function readAmount(cells: string[], columns: ColumnMap): number | null {
  if (columns.amount !== undefined) {
    return parseAmount(getCell(cells, columns.amount));
  }

  const debit = Math.abs(parseAmount(getCell(cells, columns.debit)) ?? 0);
  const credit = Math.abs(parseAmount(getCell(cells, columns.credit)) ?? 0);
  if (debit === 0 && credit === 0) return null;
  return Number((credit - debit).toFixed(2));
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  let normalized = trimmed.replace(/[()]/g, "").replace(/[^0-9.,-]/g, "");
  if (!normalized) return null;

  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.replaceAll(",", "");
  } else if (normalized.includes(",") && /,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(",", ".");
  } else {
    normalized = normalized.replaceAll(",", "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Number((negativeByParentheses ? -Math.abs(parsed) : parsed).toFixed(2));
}

function parseDateValue(value: string, fallbackMonth?: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dayMonthOnly = trimmed.match(/^(\d{1,2})[ \-/]([A-Za-z]{3,9})\.?$/) ?? trimmed.match(/^([A-Za-z]{3,9})\.?[ \-/]+(\d{1,2})$/);
  if (dayMonthOnly) {
    const dayMonth = parseDayMonth(dayMonthOnly[1], dayMonthOnly[2]);
    if (dayMonth) {
      const year = fallbackMonth ? yearForDayMonth(dayMonth.month, fallbackMonth) : new Date().getFullYear();
      return formatDateParts(year, dayMonth.month, dayMonth.day);
    }
  }
  const iso = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return formatDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = normalizeYear(Number(slash[3]));
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    return formatDateParts(year, month, day);
  }

  const named = trimmed.match(/^(\d{1,2})[ \-/]([A-Za-z]{3,9})\.?[ \-/,]+(\d{2,4})$/);
  if (named) {
    const month = monthFromName(named[2]);
    if (month) return formatDateParts(normalizeYear(Number(named[3])), month, Number(named[1]));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthFromName(name: string): number | null {
  const index = MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : null;
}

// "13 Jun" / "Jun 13" with no year: statement PDFs and app screens drop the year
// constantly. Returns day and month so the caller can supply the year.
function parseDayMonth(first: string, second: string): { day: number; month: number } | null {
  const a = first.replace(/[.,]$/, "");
  const b = second.replace(/[.,]$/, "");
  if (/^\d{1,2}$/.test(a) && /^[A-Za-z]{3,9}$/.test(b)) {
    const month = monthFromName(b);
    return month ? { day: Number(a), month } : null;
  }
  if (/^[A-Za-z]{3,9}$/.test(a) && /^\d{1,2}$/.test(b)) {
    const month = monthFromName(a);
    return month ? { day: Number(b), month } : null;
  }
  return null;
}

// Pick the year for a day-month date: the month being imported into, unless
// that would put the transaction more than a month into the future (a December
// statement pasted in January), in which case the previous year.
function yearForDayMonth(month: number, fallbackMonth: string): number {
  const year = Number(fallbackMonth.slice(0, 4));
  const fallbackMonthNumber = Number(fallbackMonth.slice(5, 7));
  return month > fallbackMonthNumber + 1 ? year - 1 : year;
}

function normalizeYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthStartDate(monthKey: string): string {
  return `${monthKey}-01`;
}

export function suggestCategory(description: string, amount: number, rules: CategoryRule[], bankCategory: string): CategorySuggestion {
  const canonical = canonicalizeMerchant(description);
  const learnedRule = rules.find((rule) => descriptionMatchesPattern(canonical, rule.pattern));
  if (learnedRule) {
    return {
      kind: learnedRule.kind,
      category: learnedRule.category,
      confidence: 0.96,
      note: "Matched your saved rule",
      source: "rule",
      debtAccountId: learnedRule.kind === "debt-payment" ? learnedRule.debtAccountId : undefined,
    };
  }

  // Near-miss recovery: "AMZN MKTP GB" should still hit an "amazon" rule. Token-set
  // similarity is a weaker signal than an exact token match, so it scores below the
  // exact tier and the fired rule is named so a wrong hit is one correction away.
  const fuzzyRule = rules
    .filter((rule) => rule.kind !== "transfer")
    .map((rule) => ({ rule, score: tokenSetSimilarity(canonical, rule.pattern) }))
    .filter((match) => match.score >= 0.6)
    .sort((a, b) => b.score - a.score)[0];
  if (fuzzyRule) {
    return {
      kind: fuzzyRule.rule.kind,
      category: fuzzyRule.rule.category,
      confidence: 0.85,
      note: `Close match to your rule “${fuzzyRule.rule.pattern}”`,
      source: "rule",
      debtAccountId: fuzzyRule.rule.kind === "debt-payment" ? fuzzyRule.rule.debtAccountId : undefined,
    };
  }

  const systemRule = SYSTEM_RULES.find((rule) => rule.pattern.test(description) || rule.pattern.test(canonical));
  if (systemRule) {
    return {
      kind: systemRule.kind ?? (amount >= 0 ? "income" : "expense"),
      category: systemRule.category,
      confidence: systemRule.confidence,
      note: systemRule.note,
      source: "system",
    };
  }

  if (bankCategory.trim()) {
    return {
      kind: amount >= 0 ? "income" : "expense",
      category: toTitleCase(bankCategory),
      confidence: 0.72,
      note: "Used category from bank export",
      source: "bank",
    };
  }

  if (amount >= 0) {
    return {
      kind: "income",
      category: "Income",
      confidence: 0.48,
      note: "Positive amount treated as income",
      source: "heuristic",
    };
  }

  return {
    kind: "expense",
    category: "Unsorted",
    confidence: 0.32,
    note: "Needs review",
    source: "heuristic",
  };
}

// UK bank descriptors abbreviate merchants in predictable ways. Expanding the common
// variants before rule matching lets one saved rule cover them all. Applied only to
// matching (never to the dedupe hash, which must stay stable across app versions).
const MERCHANT_ALIASES: Array<[RegExp, string]> = [
  [/\bamzn(?:\s+mktp)?\b/g, "amazon"],
  [/\bamz\b/g, "amazon"],
  [/\bsbux\b/g, "starbucks"],
  [/\bmcd(?:onalds)?\b/g, "mcdonalds"],
  [/\btfl(?:\s+travel(?:\s+ch(?:arge)?)?)?\b/g, "tfl"],
  [/\bsainsburys?\s*s\/?mkts?\b/g, "sainsburys"],
  [/\bm\s*&\s*s\b/g, "marks and spencer"],
  [/\bwm\s+morrisons?\b/g, "morrisons"],
  [/\bb\s*&\s*q\b/g, "b and q"],
  [/\bpaypal\s*\*/g, "paypal "],
  [/\bsumup\s*\*/g, "sumup "],
  [/\bzettle\b[_ ]*/g, "zettle "],
  [/\bsq\s*\*/g, "square "],
  [/\bcrv\b/g, ""],
  [/\bgoogle\s*\*/g, "google "],
  [/\bapple\.com\/bill\b/g, "apple"],
  [/\bamznprime\b/g, "amazon prime"],
];

export function canonicalizeMerchant(description: string): string {
  let canonical = normalizeMerchant(description);
  for (const [pattern, replacement] of MERCHANT_ALIASES) {
    canonical = canonical.replace(pattern, replacement);
  }
  // Domain suffixes survive normalization as bare tokens ("NETFLIX.COM" → "netflix com");
  // stripping them lets web and card descriptors of the same merchant group together.
  canonical = canonical.replace(/\b(?:www|com|net|org|co uk|couk)\b/g, " ");
  return canonical.replace(/\s+/g, " ").trim();
}

// Jaccard similarity over token sets, with substring token credit so "sainsbury"
// still counts against "sainsburys".
function tokenSetSimilarity(description: string, pattern: string): number {
  const descTokens = new Set(description.split(" ").filter((token) => token.length > 1));
  const patternTokens = new Set(
    pattern
      .toLowerCase()
      .split(" ")
      .filter((token) => token.length > 1),
  );
  if (!descTokens.size || !patternTokens.size) return 0;

  let overlap = 0;
  for (const patternToken of patternTokens) {
    for (const descToken of descTokens) {
      if (descToken === patternToken || descToken.includes(patternToken) || patternToken.includes(descToken)) {
        overlap += 1;
        break;
      }
    }
  }
  const unionSize = descTokens.size + patternTokens.size - overlap;
  return unionSize > 0 ? overlap / unionSize : 0;
}

export function collectExistingTransactionHashes(state: LedgerState): Set<string> {
  const hashes = new Set<string>();
  Object.values(state.months).forEach((month) => {
    month.incomes.forEach((income) => {
      if (income.imported?.hash) hashes.add(income.imported.hash);
      if (income.date) hashes.add(createTransactionHash(income.date, income.source, income.amount));
    });
    month.expenses.forEach((expense) => {
      if (expense.imported?.hash) hashes.add(expense.imported.hash);
      if (expense.date) hashes.add(createTransactionHash(expense.date, expense.name, -Math.abs(expense.amount)));
    });
  });
  return hashes;
}

function buildDetectedColumns(headers: string[], columns: Partial<ColumnMap>): CsvImportResult["detectedColumns"] {
  return {
    date: columns.date !== undefined && columns.date >= 0 ? headers[columns.date] : undefined,
    description: columns.description !== undefined && columns.description >= 0 ? headers[columns.description] : undefined,
    amount: columns.amount !== undefined ? headers[columns.amount] : undefined,
    debit: columns.debit !== undefined ? headers[columns.debit] : undefined,
    credit: columns.credit !== undefined ? headers[columns.credit] : undefined,
    category: columns.category !== undefined ? headers[columns.category] : undefined,
  };
}

export function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(card|payment|purchase|direct debit|dd|pos|online|faster payments?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryColor(category: string): string {
  const normalized = category.trim().toLowerCase();
  const categoryIndex = ["home", "food", "bills", "travel", "health", "personal", "work", "subscriptions", "income", "debt payments", "transfers", "unsorted"].indexOf(normalized);
  return colors[(categoryIndex >= 0 ? categoryIndex : normalized.length) % colors.length];
}

// ─── Display names ───────────────────────────────────────────────────────────
// Bank descriptors are written for the bank: card numbers, dates, branch towns,
// store numbers and transaction-type codes. cleanMerchantName keeps the part a
// person recognises ("4332 07OCT26 , BARCLAYCARD , LONDON GB" → "Barclaycard").
// It only shapes the label; the raw text stays on the row (and on
// imported.originalDescription) for dedupe, rules and recurrence matching.

const DISPLAY_NAME_MAX_LENGTH = 28;

// Card number + transaction date that Barclays, NatWest and RBS lead with ("4332 07OCT26", "4332 07OCT26 CD").
const CARD_DATE_PREFIX = /^\d{4}\s+\d{1,2}[a-z]{3}\d{2,4}(?:\s+(?:c|cd|d))?(?:\s+|$)/i;
const LEADING_TYPE_WORDS =
  /^(?:card payment to|card purchase(?: at)?|contactless payment(?: to)?|contactless|direct debit(?: payment)?(?: to)?|standing order(?: to)?|bill payment(?: to)?|faster payments?(?: receipt| payment)?(?: from| to)?|payment (?:to|from)|debit card(?: payment)?(?: to)?|purchase at|pos|visa)\b[\s:-]*/i;
const TRAILING_ON_DATE = /\s+on\s+\d{1,2}(?:[\s-]?[a-z]{3}|[-/.]\d{1,2})\b.*$/i;
const TRAILING_REFERENCE = /\s+(?:ref|reference|mandate(?: no)?)\b.*$/i;
const TRAILING_TYPE_CODE = /\s+(?:bcc|cpm|clp|ddr|bgc|dd|ft|so|sto|deb|tfr|chg|obp|bbp|fpi|fpo|bac|vis|pymts?|payments?)$/i;
const TRAILING_SUFFIX = /\s+(?:gb|gbr|uk|irl|ie|usa|us|ltd|limited|plc|llp|inc|llc)\.?$/i;
const LOCATION_SEGMENT = /^[a-z .'-]+\s(?:gb|gbr|uk|irl|ie|us|usa|fr|de|es|nl|lu)$/i;
const NOISE_SEGMENT = /^(?:[\d\s.,/-]*(?:gbp|eur|usd)?|rate\b.*|mandate\b.*|ref\b.*|reference\b.*)$/i;
// Card processors that prefix the real merchant: "SQ *COFFEE SHOP", "PAYPAL *EBAY".
const PROCESSOR_PREFIX = /^(?:paypal|pp|sq|sumup|zettle|ztl|iz|izettle|sp|crv|tst|lul|nyx)$/i;

// Descriptors that title-casing alone would leave cryptic, tested against the
// normalized merchant ("amzn mktp uk ab12cd", "sainsburys s mkts").
const DISPLAY_BRANDS: [RegExp, string][] = [
  [/^(?:amzn ?prime|amazon prime|prime video)\b/, "Amazon Prime"],
  [/^(?:amzn|amazon)\b/, "Amazon"],
  [/^sainsbury/, "Sainsbury's"],
  [/^mcdonald/, "McDonald's"],
  [/^(?:m s|marks (?:and )?spencer)\b/, "M&S"],
  [/^tfl\b/, "TfL"],
  [/^apple com\b/, "Apple"],
  [/^uber ?eats\b/, "Uber Eats"],
  [/^uber\b/, "Uber"],
  [/^(?:google )?youtube\b/, "YouTube"],
];

const DISPLAY_CASING: Record<string, string> = {
  paypal: "PayPal",
  ebay: "eBay",
  ikea: "IKEA",
  youtube: "YouTube",
  tfl: "TfL",
  hmrc: "HMRC",
  dvla: "DVLA",
  nhs: "NHS",
  bt: "BT",
  ee: "EE",
  o2: "O2",
  atm: "ATM",
  kfc: "KFC",
  hsbc: "HSBC",
  tsb: "TSB",
  rac: "RAC",
  aa: "AA",
  bp: "BP",
  tv: "TV",
  uk: "UK",
  sse: "SSE",
  edf: "EDF",
  dpd: "DPD",
  dhl: "DHL",
  ups: "UPS",
  jd: "JD",
  asos: "ASOS",
  sa: "SA",
};
const DISPLAY_SMALL_WORDS = new Set(["and", "of", "the", "to", "for", "at", "on", "in", "by"]);

export function cleanMerchantName(description: string): string {
  const raw = description.replace(/\s+/g, " ").trim();
  if (!raw) return "";

  let name = pickMerchantSegment(raw.replace(CARD_DATE_PREFIX, (match) => `${match.trim()} , `));
  name = stripRepeatedly(name, [LEADING_TYPE_WORDS], "");
  const segmentKey = normalizeMerchant(name);
  name = name.replace(TRAILING_ON_DATE, "").replace(TRAILING_REFERENCE, "");
  name = stripRepeatedly(name, [TRAILING_TYPE_CODE, TRAILING_SUFFIX], "");
  name = resolveProcessorStar(name);
  // A store number or reference ends the merchant name: "TESCO STORES 3412 LONDON".
  name = name.replace(/^(.*?[a-z].*?)\s+#?\d{4,}\b.*$/i, "$1");
  name = name.replace(/\s+(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{6,}$/i, "");
  name = name.replace(/\s+gov\.uk\b/gi, "").replace(/\.(?:com|co\.uk|org\.uk|net|org|io)\b/gi, "");
  name = name.replace(/\b(?:ltd|limited|plc)\b\.?/gi, " ");
  name = stripRepeatedly(name.replace(/\s+/g, " ").trim(), [TRAILING_TYPE_CODE, TRAILING_SUFFIX], "");
  name = name.replace(/^[\s,*.:/-]+|[\s,*.:/-]+$/g, "");

  if (!/[a-z].*[a-z]/i.test(name)) name = raw;

  const nameKey = normalizeMerchant(name);
  const brand = DISPLAY_BRANDS.find(([pattern]) => pattern.test(nameKey) || pattern.test(segmentKey));
  if (brand) return brand[1];

  return truncateWords(recaseShouting(name), DISPLAY_NAME_MAX_LENGTH);
}

// Retroactive tidy for entries imported before display names existed. Only
// entries still carrying the raw bank text are renamed: an imported row whose
// name equals its originalDescription, or a recurring copy seeded from one.
// Anything the user renamed is left alone, and a second pass is a no-op.
export function tidyImportedNames(months: Record<string, MonthBudget>): Record<string, MonthBudget> {
  const rawLabels = new Set<string>();
  for (const month of Object.values(months)) {
    for (const income of month.incomes) {
      if (income.imported?.originalDescription && income.source === income.imported.originalDescription) rawLabels.add(income.source);
    }
    for (const expense of month.expenses) {
      if (expense.imported?.originalDescription && expense.name === expense.imported.originalDescription) rawLabels.add(expense.name);
    }
  }
  if (!rawLabels.size) return months;

  const cleaned = new Map<string, string>();
  for (const label of rawLabels) {
    const name = cleanMerchantName(label);
    if (name && name !== label) cleaned.set(label, name);
  }
  if (!cleaned.size) return months;

  const rename = (label: string, eligible: boolean) => (eligible ? cleaned.get(label) : undefined);
  return Object.fromEntries(
    Object.entries(months).map(([monthKey, month]) => {
      let changed = false;
      const incomes = month.incomes.map((income) => {
        const eligible = Boolean(income.seededFrom || income.imported?.originalDescription === income.source);
        const source = rename(income.source, eligible);
        if (!source) return income;
        changed = true;
        return { ...income, source };
      });
      const expenses = month.expenses.map((expense) => {
        const eligible = Boolean(expense.seededFrom || expense.imported?.originalDescription === expense.name);
        const name = rename(expense.name, eligible);
        if (!name) return expense;
        changed = true;
        return { ...expense, name };
      });
      return [monthKey, changed ? { ...month, incomes, expenses } : month];
    }),
  );
}

function pickMerchantSegment(value: string): string {
  if (!value.includes(",")) return value;
  const segments = value.split(/\s*,\s*/).filter(Boolean);
  // "4332 07OCT26 , MERCHANT , TOWN GB" — the merchant always follows the card/date block.
  if (segments.length > 1 && CARD_DATE_PREFIX.test(`${segments[0]} `)) {
    const merchant = segments.slice(1).find((segment) => !NOISE_SEGMENT.test(segment));
    return merchant ?? value;
  }
  const meaningful = segments.filter((segment) => !NOISE_SEGMENT.test(segment));
  if (meaningful.length > 1 && LOCATION_SEGMENT.test(meaningful[meaningful.length - 1])) meaningful.pop();
  return meaningful.length ? meaningful.join(", ") : value;
}

function stripRepeatedly(value: string, patterns: RegExp[], replacement: string): string {
  let current = value;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = patterns.reduce((text, pattern) => text.replace(pattern, replacement).trim(), current);
    if (next === current || !next) return next || current;
    current = next;
  }
  return current;
}

function resolveProcessorStar(value: string): string {
  const match = value.match(/^([^*]+?)\s*\*\s*(.+)$/);
  if (!match) return value;
  const [, left, right] = match;
  if (PROCESSOR_PREFIX.test(left.trim())) return right;
  // "AMZN MKTP UK*AB12CD3": the right side is an order reference, not a name.
  if (!/\s/.test(right) && /\d/.test(right)) return left;
  return `${left} ${right}`;
}

// Bank exports shout ("TESCO STORES"); mixed-case text already carries the
// merchant's own casing ("Pret A Manger") and is left as written.
function recaseShouting(value: string): string {
  if (/[a-z]/.test(value)) return value;
  return value
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (DISPLAY_CASING[word]) return DISPLAY_CASING[word];
      if (word.includes("&") && word.length <= 4) return word.toUpperCase();
      if (index > 0 && DISPLAY_SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function truncateWords(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : value.slice(0, maxLength)).replace(/[\s,&-]+$/, "");
}

// ─── Multi-format entry point ────────────────────────────────────────────────
// Every text-shaped capture path (file upload, clipboard paste) lands here. The
// format is sniffed from content first, extension second, so a pasted OFX block
// or a renamed export still parses.

export function parseBankText({
  text,
  fileName,
  state,
  fallbackMonthKey,
  flipSigns,
}: ParseBankCsvOptions): CsvImportResult {
  const trimmed = text.trimStart();
  const lowerName = fileName.toLowerCase();

  if (/^ofxheader/i.test(trimmed) || /<OFX>/i.test(trimmed) || lowerName.endsWith(".ofx")) {
    return withTransferPairs(parseOfx({ text, fileName, state, fallbackMonthKey }));
  }
  if (/^!type:/i.test(trimmed) || lowerName.endsWith(".qif")) {
    return withTransferPairs(parseQif({ text, fileName, state, fallbackMonthKey }));
  }

  let csvResult = parseBankCsv({ text, fileName, state, fallbackMonthKey, flipSigns });
  // Auto-flip credit-card statements — unless the caller chose explicitly
  // (the review modal's "flip in/out" toggle passes flipSigns either way).
  if (flipSigns === undefined && detectLikelySignInversion(csvResult)) {
    csvResult = parseBankCsv({ text, fileName, state, fallbackMonthKey, flipSigns: true });
  }
  if (csvResult.rows.length) return withTransferPairs(csvResult);

  // No recognizable header row — pasted blocks from bank apps and spreadsheets
  // usually aren't CSV. Fall back to per-line parsing before giving up.
  const looseResult = parseLooseLines({ text, fileName, state, fallbackMonthKey });
  return looseResult.rows.length ? withTransferPairs(looseResult) : csvResult;
}

function withTransferPairs(result: CsvImportResult): CsvImportResult {
  return { ...result, rows: markTransferPairs(result.rows) };
}

// Two rows with opposite equal amounts a couple of days apart are almost always
// the two legs of a transfer between the user's own accounts — money that is
// neither income nor spending. Both legs get re-classified as transfers (still
// visible in review, one tap to override). Same-merchant pairs are skipped:
// a charge followed by an equal credit from the same merchant is a refund.
export function markTransferPairs(rows: CsvImportRow[]): CsvImportRow[] {
  const byAmount = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = Math.abs(row.amount).toFixed(2);
    byAmount.set(key, [...(byAmount.get(key) ?? []), index]);
  });

  const pairedIndexes = new Set<number>();
  for (const indexes of byAmount.values()) {
    if (indexes.length < 2) continue;
    for (const outIndex of indexes) {
      if (pairedIndexes.has(outIndex) || rows[outIndex].amount >= 0) continue;
      for (const inIndex of indexes) {
        if (inIndex === outIndex || pairedIndexes.has(inIndex)) continue;
        const candidate = rows[inIndex];
        if (candidate.amount <= 0) continue;
        const dayGap = Math.abs(Date.parse(rows[outIndex].date) - Date.parse(candidate.date)) / 86_400_000;
        if (dayGap > 2) continue;
        if (canonicalizeMerchant(rows[outIndex].description) === canonicalizeMerchant(candidate.description)) continue; // refund shape
        pairedIndexes.add(outIndex);
        pairedIndexes.add(inIndex);
        break;
      }
    }
  }

  if (!pairedIndexes.size) return rows;
  // A leg the transfer wording rule already classified stays as-is; its
  // counterpart is what pairing adds. User-edited rows are never touched.
  return rows.map((row, index) =>
    pairedIndexes.has(index) && row.categorySource !== "user" && row.kind !== "transfer"
      ? {
          ...row,
          kind: "transfer" as const,
          category: "Transfers",
          include: false,
          confidence: Math.max(row.confidence, 0.8),
          note: "Opposite amounts days apart — looks like a transfer between your accounts",
        }
      : row,
  );
}

// ─── OFX (Open Financial Exchange 1.x SGML and 2.x XML) ─────────────────────

export function parseOfx({ text, state, fallbackMonthKey }: ParseBankCsvOptions): CsvImportResult {
  const existingHashes = collectExistingTransactionHashes(state);
  const fallbackMonth = fallbackMonthKey ?? state.selectedMonth ?? getMonthKey();
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows: CsvImportRow[] = [];

  blocks.forEach((block, index) => {
    const body = block.split(/<\/STMTTRN>/i)[0];
    const amountText = readOfxTag(body, "TRNAMT");
    const name = readOfxTag(body, "NAME") || readOfxTag(body, "MEMO");
    const memo = readOfxTag(body, "MEMO");
    const posted = readOfxTag(body, "DTPOSTED");
    const fitId = readOfxTag(body, "FITID");

    const amount = amountText ? Number(amountText.replace(/[^0-9.-]/g, "")) : NaN;
    const description = (name && memo && memo !== name ? `${name} ${memo}` : name || memo).trim();
    if (!description || !Number.isFinite(amount)) return;

    const isoDate = parseOfxDate(posted) ?? monthStartDate(fallbackMonth);
    rows.push(
      buildImportRow({
        rowNumber: index + 1,
        date: isoDate,
        description,
        amount: Number(amount.toFixed(2)),
        bankCategory: "",
        state,
        existingHashes,
        externalId: fitId || undefined,
      }),
    );
  });

  return {
    rows: sortImportRows(rows),
    errors: rows.length ? [] : ["No transactions were found in this OFX file."],
    detectedColumns: {},
    totalRows: blocks.length,
  };
}

// OFX 1.x is SGML: values often run to end-of-line with no closing tag.
function readOfxTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return match ? match[1].trim() : "";
}

function parseOfxDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

// ─── QIF (Quicken Interchange Format) ────────────────────────────────────────

export function parseQif({ text, state, fallbackMonthKey }: ParseBankCsvOptions): CsvImportResult {
  const existingHashes = collectExistingTransactionHashes(state);
  const fallbackMonth = fallbackMonthKey ?? state.selectedMonth ?? getMonthKey();
  const rows: CsvImportRow[] = [];
  let record: { date?: string; amount?: number; payee?: string; memo?: string; category?: string } = {};
  let recordCount = 0;

  const flush = () => {
    recordCount += 1;
    const description = (record.payee || record.memo || "").trim();
    if (description && record.amount !== undefined && Number.isFinite(record.amount)) {
      rows.push(
        buildImportRow({
          rowNumber: recordCount,
          date: record.date ?? monthStartDate(fallbackMonth),
          description,
          amount: Number(record.amount.toFixed(2)),
          bankCategory: record.category ?? "",
          state,
          existingHashes,
        }),
      );
    }
    record = {};
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("!")) continue;
    const code = line[0];
    const value = line.slice(1).trim();
    if (code === "^") flush();
    else if (code === "D") record.date = parseDateValue(value) ?? record.date;
    else if (code === "T" || code === "U") record.amount = parseAmount(value) ?? record.amount;
    else if (code === "P") record.payee = value;
    else if (code === "M") record.memo = value;
    else if (code === "L") record.category = value.replace(/[[\]]/g, "");
  }
  if (record.date || record.amount !== undefined || record.payee) flush();

  return {
    rows: sortImportRows(rows),
    errors: rows.length ? [] : ["No transactions were found in this QIF file."],
    detectedColumns: {},
    totalRows: recordCount,
  };
}

// ─── Loose lines (clipboard paste from bank apps / spreadsheets) ─────────────
// No header row to detect, so each line is parsed independently: a date anywhere,
// a trailing signed amount, everything else is the description. Unsigned amounts
// default to spending — the common case when copying a transaction list — and the
// rule/category pipeline can still flip a row to income (salary wording etc.).

export function parseLooseLines({ text, state, fallbackMonthKey }: ParseBankCsvOptions): CsvImportResult {
  const existingHashes = collectExistingTransactionHashes(state);
  const fallbackMonth = fallbackMonthKey ?? state.selectedMonth ?? getMonthKey();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: CsvImportRow[] = [];

  lines.forEach((line, index) => {
    const parsed = parseLooseLine(line, fallbackMonth);
    if (!parsed) return;
    rows.push(
      buildImportRow({
        rowNumber: index + 1,
        date: parsed.date,
        description: parsed.description,
        amount: parsed.amount,
        bankCategory: "",
        state,
        existingHashes,
        noteOverride: parsed.signed ? undefined : "Assumed spending — flip to income if wrong",
      }),
    );
  });

  return {
    rows: sortImportRows(rows),
    errors: rows.length ? [] : ["Couldn’t find lines that look like transactions. Each line needs a description and an amount."],
    detectedColumns: {},
    totalRows: lines.length,
  };
}

function parseLooseLine(line: string, fallbackMonth: string): { date: string; description: string; amount: number; signed: boolean } | null {
  // Cells first: tab, 2+ spaces, or comma separated (spreadsheet / bank web page copies).
  // Thousands separators are collapsed before the comma split so "1,234.56" stays whole.
  const collapsed = line.replace(/(\d),(\d{3})/g, "$1$2");
  const cells = collapsed.split(/\t|\s{2,}|,/).map((cell) => cell.trim()).filter(Boolean);
  const tokens = cells.length >= 2 ? cells : collapsed.split(/\s+/);
  if (tokens.length < 2) return null;

  let amount: number | null = null;
  let amountIndex = -1;
  let signed = false;
  // Prefer the last amount-looking token — descriptions can contain digits.
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!/^[-+(]?[£$€]?\d[\d,]*(?:\.\d{1,2})?\)?$/.test(token)) continue;
    const parsed = parseAmount(token);
    if (parsed === null) continue;
    amount = parsed;
    amountIndex = index;
    signed = /^[-+(]/.test(token) || /\)$/.test(token);
    break;
  }
  if (amount === null) return null;

  // "… 42.61 1,234.56": a transaction amount followed by a running balance. Only
  // treat it that way when both tokens carry pence, so "REF 12345 42.61" is left alone.
  const money = /^[-+(]?[£$€]?\d[\d,]*\.\d{2}\)?$/;
  if (amountIndex > 0 && money.test(tokens[amountIndex]) && money.test(tokens[amountIndex - 1])) {
    const previous = parseAmount(tokens[amountIndex - 1]);
    if (previous !== null) {
      tokens.splice(amountIndex, 1);
      amountIndex -= 1;
      amount = previous;
      signed = /^[-+(]/.test(tokens[amountIndex]) || /\)$/.test(tokens[amountIndex]);
    }
  }

  let date: string | null = null;
  let dateIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (index === amountIndex) continue;
    const candidate = parseDateValue(tokens[index], fallbackMonth);
    if (candidate) {
      date = candidate;
      dateIndex = index;
      break;
    }
    // "13 Jun" / "Jun 13" style two-token dates, with the year taken from the
    // month being imported into (new Date("13 Jun") would say 2001).
    if (index + 1 < tokens.length && index + 1 !== amountIndex) {
      const dayMonth = parseDayMonth(tokens[index], tokens[index + 1]);
      const pair = dayMonth
        ? formatDateParts(yearForDayMonth(dayMonth.month, fallbackMonth), dayMonth.month, dayMonth.day)
        : parseDateValue(`${tokens[index]} ${tokens[index + 1]}`, fallbackMonth);
      if (pair) {
        date = pair;
        dateIndex = index;
        tokens.splice(index + 1, 1);
        if (amountIndex > index + 1) amountIndex -= 1;
        break;
      }
    }
  }

  const description = tokens
    .filter((_, index) => index !== amountIndex && index !== dateIndex)
    .join(" ")
    .trim();
  if (!description || /^\d+$/.test(description)) return null;

  // Unsigned amounts read as money out; signed tokens keep their sign.
  const finalAmount = signed ? amount : -Math.abs(amount);
  return { date: date ?? monthStartDate(fallbackMonth), description, amount: finalAmount, signed };
}
