import { colors, getMonthKey } from "./finance";
import type { CategoryRule, LedgerState, TransactionKind } from "./types";

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
    const suggestion = suggestCategory(description, parsedAmount, state.categoryRules, bankCategory);
    const hash = createTransactionHash(isoDate, description, parsedAmount);
    const duplicate = existingHashes.has(hash);
    const kind = suggestion.kind;

    return [
      {
        id: `draft-${rowNumber}-${hash}`,
        rowNumber,
        date: isoDate,
        monthKey: isoDate.slice(0, 7),
        description,
        amount: parsedAmount,
        rawAmount: parsedAmount.toFixed(2),
        kind,
        suggestedKind: kind,
        category: suggestion.category,
        suggestedCategory: suggestion.category,
        color: categoryColor(suggestion.category),
        include: !duplicate && kind !== "transfer",
        duplicate,
        confidence: suggestion.confidence,
        note: duplicate ? "Possible duplicate" : suggestion.note,
        hash,
        debtAccountId: suggestion.debtAccountId,
      },
    ];
  });

  return {
    rows: sortImportRows(rows),
    errors: rows.length ? [] : ["No importable transactions were found in this CSV."],
    detectedColumns: buildDetectedColumns(headerRow, columns),
    totalRows: Math.max(0, nonEmptyRows.length - 1),
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

function suggestCategory(description: string, amount: number, rules: CategoryRule[], bankCategory: string): CategorySuggestion {
  const normalized = normalizeMerchant(description);
  const learnedRule = rules.find((rule) => descriptionMatchesPattern(normalized, rule.pattern));
  if (learnedRule) {
    return {
      kind: learnedRule.kind,
      category: learnedRule.category,
      confidence: 0.96,
      note: "Matched your saved rule",
      debtAccountId: learnedRule.kind === "debt-payment" ? learnedRule.debtAccountId : undefined,
    };
  }

  const systemRule = SYSTEM_RULES.find((rule) => rule.pattern.test(description));
  if (systemRule) {
    return {
      kind: systemRule.kind ?? (amount >= 0 ? "income" : "expense"),
      category: systemRule.category,
      confidence: systemRule.confidence,
      note: systemRule.note,
    };
  }

  if (bankCategory.trim()) {
    return {
      kind: amount >= 0 ? "income" : "expense",
      category: toTitleCase(bankCategory),
      confidence: 0.72,
      note: "Used category from bank export",
    };
  }

  if (amount >= 0) {
    return {
      kind: "income",
      category: "Income",
      confidence: 0.48,
      note: "Positive amount treated as income",
    };
  }

  return {
    kind: "expense",
    category: "Unsorted",
    confidence: 0.32,
    note: "Needs review",
  };
}

function collectExistingTransactionHashes(state: LedgerState): Set<string> {
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

function normalizeMerchant(description: string): string {
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
