import { colors, getMonthKey } from "./finance";
import type { CategoryRule, CategorySource, LedgerState, TransactionKind } from "./types";

export type CsvImportRow = {
  id: string;
  rowNumber: number;
  date: string;
  monthKey: string;
  description: string;
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
};

type ParseBankCsvOptions = {
  text: string;
  fileName: string;
  state: LedgerState;
  fallbackMonthKey?: string;
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
const AMOUNT_HEADERS = ["amount", "value", "transaction amount", "net amount"];
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

export function parseBankCsv({ text, fileName, state, fallbackMonthKey }: ParseBankCsvOptions): CsvImportResult {
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

  const rows = nonEmptyRows.slice(1).flatMap((cells, index) => {
    const rowNumber = index + 2;
    const description = getCell(cells, columns.description).trim();
    const parsedAmount = readAmount(cells, columns);
    const isoDate = parseDateValue(getCell(cells, columns.date)) ?? monthStartDate(fallbackMonth);

    if (!description || parsedAmount === null) return [];

    const bankCategory = columns.category === undefined ? "" : getCell(cells, columns.category).trim();
    return [buildImportRow({ rowNumber, date: isoDate, description, amount: parsedAmount, bankCategory, state, existingHashes })];
  });

  return {
    rows: sortImportRows(rows),
    errors: rows.length ? [] : ["No importable transactions were found in this CSV."],
    detectedColumns: buildDetectedColumns(headerRow, columns),
    totalRows: Math.max(0, nonEmptyRows.length - 1),
  };
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
  return {
    date: findColumn(headers, DATE_HEADERS),
    description: findColumn(headers, DESCRIPTION_HEADERS),
    amount: optionalColumn(headers, AMOUNT_HEADERS),
    debit: optionalColumn(headers, DEBIT_HEADERS),
    credit: optionalColumn(headers, CREDIT_HEADERS),
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
  return headers.findIndex((header) => aliases.some((alias) => header.includes(alias)));
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

function parseDateValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
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

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
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

// ─── Multi-format entry point ────────────────────────────────────────────────
// Every text-shaped capture path (file upload, clipboard paste) lands here. The
// format is sniffed from content first, extension second, so a pasted OFX block
// or a renamed export still parses.

export function parseBankText({
  text,
  fileName,
  state,
  fallbackMonthKey,
}: ParseBankCsvOptions): CsvImportResult {
  const trimmed = text.trimStart();
  const lowerName = fileName.toLowerCase();

  if (/^ofxheader/i.test(trimmed) || /<OFX>/i.test(trimmed) || lowerName.endsWith(".ofx")) {
    return withTransferPairs(parseOfx({ text, fileName, state, fallbackMonthKey }));
  }
  if (/^!type:/i.test(trimmed) || lowerName.endsWith(".qif")) {
    return withTransferPairs(parseQif({ text, fileName, state, fallbackMonthKey }));
  }

  const csvResult = parseBankCsv({ text, fileName, state, fallbackMonthKey });
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

  let date: string | null = null;
  let dateIndex = -1;
  for (let index = 0; index < tokens.length; index += 1) {
    if (index === amountIndex) continue;
    const candidate = parseDateValue(tokens[index]);
    if (candidate) {
      date = candidate;
      dateIndex = index;
      break;
    }
    // "13 Jun" / "Jun 13" style two-token dates.
    if (index + 1 < tokens.length && index + 1 !== amountIndex) {
      const pair = parseDateValue(`${tokens[index]} ${tokens[index + 1]}`);
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
