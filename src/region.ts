import type { AccountClass, AccountType, ContributionSource, CountryCode, CurrencyCode, TaxTreatment } from "./types";

// ─── Country and region ──────────────────────────────────────────────────────
//
// The app has two "experiences": the original UK-geared one, and a US one with American account
// types, language and tools. Every other country gets the UK experience with its own currency —
// the country still changes the currency symbol, nothing else.

export type RegionKey = "US" | "GB";

export type CountryOption = {
  code: CountryCode;
  label: string;
  // The currency picked when the country is chosen. null = keep whatever is set.
  currency: CurrencyCode | null;
  region: RegionKey;
};

// US first: it is the only country besides the UK with its own experience, so it leads the list.
export const countryOptions: CountryOption[] = [
  { code: "US", label: "United States", currency: "USD", region: "US" },
  { code: "GB", label: "United Kingdom", currency: "GBP", region: "GB" },
  { code: "IE", label: "Ireland", currency: "EUR", region: "GB" },
  { code: "CA", label: "Canada", currency: "CAD", region: "GB" },
  { code: "AU", label: "Australia", currency: "AUD", region: "GB" },
  { code: "IN", label: "India", currency: "INR", region: "GB" },
  { code: "JP", label: "Japan", currency: "JPY", region: "GB" },
  { code: "OTHER", label: "Other", currency: null, region: "GB" },
];

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && countryOptions.some((option) => option.code === value);
}

export function countryOption(code: CountryCode): CountryOption {
  return countryOptions.find((option) => option.code === code) ?? countryOptions[1];
}

export function regionOf(country: CountryCode): RegionKey {
  return countryOption(country).region;
}

// Ledgers saved before the country existed only know their currency. USD means the US experience;
// every other currency maps to the country that uses it, which keeps the UK-geared app they had.
export function countryFromCurrency(currency: CurrencyCode | undefined): CountryCode {
  switch (currency) {
    case "USD":
      return "US";
    case "EUR":
      return "IE";
    case "CAD":
      return "CA";
    case "AUD":
      return "AU";
    case "INR":
      return "IN";
    case "JPY":
      return "JP";
    default:
      return "GB";
  }
}

// ─── Detection ───────────────────────────────────────────────────────────────

const US_TIMEZONE_PATTERN =
  /^(America\/(New_York|Detroit|Kentucky\/|Indiana\/|Chicago|Menominee|North_Dakota\/|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Metlakatla|Yakutat|Nome|Adak)|Pacific\/Honolulu|US\/)/;
const GB_TIMEZONE_PATTERN = /^(Europe\/(London|Belfast)|GB)/;
const TIMEZONE_COUNTRIES: Array<{ pattern: RegExp; country: CountryCode }> = [
  { pattern: US_TIMEZONE_PATTERN, country: "US" },
  { pattern: GB_TIMEZONE_PATTERN, country: "GB" },
  { pattern: /^Europe\/Dublin/, country: "IE" },
  { pattern: /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Yellowknife|Whitehorse|Iqaluit)|^Canada\//, country: "CA" },
  { pattern: /^Australia\//, country: "AU" },
  { pattern: /^Asia\/(Kolkata|Calcutta)/, country: "IN" },
  { pattern: /^Asia\/Tokyo|^Japan/, country: "JP" },
];

function countryFromLanguage(language: string): CountryCode | null {
  const region = language.split(/[-_]/)[1]?.toUpperCase();
  if (!region) return null;
  if (region === "UK") return "GB";
  return isCountryCode(region) && region !== "OTHER" ? region : null;
}

// Best guess at the user's country from what the browser exposes. The time zone is the stronger
// signal: "en-US" is the default language of many browsers the world over, so on its own it only
// points to the US when the clock agrees (a US zone) and nothing says otherwise. A language with
// any other region tag is taken at face value. With nothing to go on, the app's original UK
// default stands.
export function detectCountry({ languages = [], timeZone = "" }: { languages?: readonly string[]; timeZone?: string }): CountryCode {
  const zoneMatch = TIMEZONE_COUNTRIES.find(({ pattern }) => pattern.test(timeZone))?.country ?? null;
  for (const language of languages) {
    const fromLanguage = countryFromLanguage(language);
    if (!fromLanguage) continue;
    if (fromLanguage === "US") {
      if (zoneMatch === "US" || (zoneMatch === null && /^America\//.test(timeZone))) return "US";
      continue;
    }
    return fromLanguage;
  }
  return zoneMatch ?? "GB";
}

export function detectCountryFromBrowser(): CountryCode {
  try {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return detectCountry({ languages, timeZone });
  } catch {
    return "GB";
  }
}

// ─── Language ────────────────────────────────────────────────────────────────

// UK → US spellings and terms, applied to visible copy when the US experience is on. Each entry is
// [pattern, replacement]; capitalised forms are handled by the case-preserving replacer below.
const US_TERMS: Array<[RegExp, string]> = [
  [/\bcurrent accounts\b/g, "checking accounts"],
  [/\bcurrent account\b/g, "checking account"],
  [/\bcouncil tax\b/g, "property tax"],
  [/\bsavings account or ISA\b/g, "savings account or HYSA"],
  [/\butilisation\b/g, "utilization"],
  [/\butilis(e|ed|es|ing)\b/g, "utiliz$1"],
  [/\bcategoris(e|ed|es|ing|ation)\b/g, "categoriz$1"],
  [/\buncategoris(e|ed|es|ing|ation)\b/g, "uncategoriz$1"],
  [/\brecognis(e|ed|es|ing|able)\b/g, "recogniz$1"],
  [/\borganis(e|ed|es|ing|ation)\b/g, "organiz$1"],
  [/\bprioritis(e|ed|es|ing)\b/g, "prioritiz$1"],
  [/\banalys(e|ed|es|ing)\b/g, "analyz$1"],
  [/\bcolour(s|ed|ful)?\b/g, "color$1"],
  [/\bfavourite(s)?\b/g, "favorite$1"],
  [/\bcheque(s)?\b/g, "check$1"],
  [/\blicence(s)?\b/g, "license$1"],
  [/\bprogramme(s)?\b/g, "program$1"],
  [/\bamortis(e|ed|es|ing|ation)\b/g, "amortiz$1"],
  [/\benrol(s|ment)?\b/g, "enroll$1"],
  [/\bcustomis(e|ed|es|ing|ation)\b/g, "customiz$1"],
  [/\bpetrol\b/g, "gas"],
  [/\bmobile phone\b/g, "cell phone"],
];

function preserveCase(source: string, replacement: string): string {
  if (source === source.toUpperCase() && source.length > 1) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function americanize(text: string): string {
  let result = text;
  for (const [pattern, replacement] of US_TERMS) {
    result = result.replace(new RegExp(pattern.source, "gi"), (match, ...groups) => {
      const resolved = replacement.replace(/\$(\d)/g, (_, index) => groups[Number(index) - 1] ?? "");
      return preserveCase(match, resolved);
    });
  }
  return result;
}

export type Localizer = (text: string) => string;

// Copy written for the UK app reads naturally to a US user once the spellings and a handful of
// terms are swapped. Every other region keeps the original text.
export function textLocalizer(region: RegionKey): Localizer {
  return region === "US" ? americanize : (text) => text;
}

// ─── Account types ───────────────────────────────────────────────────────────

export type AccountTypeOption = {
  value: AccountType;
  label: string;
  // One-paragraph explanation for the "i" icon: what it is, how it is taxed, when you can take
  // money out. Written for people who have never had one.
  info: string;
  taxTreatment?: TaxTreatment;
  // Contributions normally come out of pay before take-home.
  payroll?: boolean;
};

export type AccountClassOption = { value: AccountClass; label: string };

type TypeTable = Record<AccountClass, AccountTypeOption[]>;

const GB_TYPES: TypeTable = {
  cash: [
    { value: "current", label: "Current account", info: "Your everyday account: pay lands here and bills leave from it. Usually pays little or no interest." },
    { value: "other-asset", label: "Other cash", info: "Cash held anywhere else, such as a prepaid card or money set aside at home." },
  ],
  savings: [
    {
      value: "savings",
      label: "Savings",
      info: "An easy-access or notice savings account earning interest. Interest above your Personal Savings Allowance (£1,000 for basic-rate taxpayers, £500 for higher-rate) is taxable.",
      taxTreatment: "taxable",
    },
    {
      value: "isa",
      label: "Cash ISA",
      info: "Cash savings where the interest is completely tax-free. You can pay up to £20,000 a year into ISAs in total, shared across cash, stocks & shares and lifetime ISAs.",
      taxTreatment: "tax-free",
    },
    {
      value: "lisa",
      label: "Lifetime ISA",
      info: "Save up to £4,000 a year (part of the £20,000 ISA allowance) and the government adds a 25% bonus. Withdraw for a first home up to £450,000 or from age 60; any other withdrawal loses 25%.",
      taxTreatment: "tax-free",
    },
    { value: "other-asset", label: "Other", info: "Any other savings pot, such as Premium Bonds or a credit-union account." },
  ],
  investment: [
    {
      value: "investment",
      label: "General investment account",
      info: "Investments held outside any tax wrapper, with no limit on what you pay in. Gains above the £3,000 annual capital-gains exemption and dividends above £500 are taxable.",
      taxTreatment: "taxable",
    },
    {
      value: "isa",
      label: "Stocks & shares ISA",
      info: "Investments inside an ISA wrapper: no tax on growth, dividends or withdrawals, and you can take money out whenever you like. Shares the £20,000 annual ISA allowance.",
      taxTreatment: "tax-free",
    },
    {
      value: "pension",
      label: "Workplace pension",
      info: "Your employer enrols you and must pay in at least 3% of qualifying earnings (you pay at least 5%, including tax relief). Contributions come out of pay before tax, and up to £60,000 a year can go into all your pensions. You can take money from age 55 (57 from 2028); 25% is usually tax-free.",
      taxTreatment: "pre-tax",
      payroll: true,
    },
    {
      value: "sipp",
      label: "SIPP",
      info: "A self-invested personal pension you open and manage yourself. Pay in £80 and the provider claims £20 basic-rate tax relief on top (higher-rate taxpayers reclaim more). Same £60,000 annual allowance and age-55/57 access as a workplace pension.",
      taxTreatment: "pre-tax",
    },
    { value: "other-asset", label: "Other", info: "Any other investment, such as property, crypto or a business stake." },
  ],
  debt: [
    {
      value: "credit-card",
      label: "Credit card",
      info: "Revolving credit. Pay the statement balance in full to avoid interest — the minimum payment mostly covers interest. Keeping the balance under 30% of the limit helps your credit score.",
    },
    { value: "loan", label: "Loan", info: "A fixed-term personal loan: equal monthly payments until it is cleared." },
    {
      value: "mortgage",
      label: "Mortgage",
      info: "Secured on your home. Track the outstanding balance, rate and remaining term. When a fixed deal ends, the rate moves to the lender's standard variable rate unless you remortgage.",
    },
    { value: "auto-loan", label: "Car finance", info: "A car loan, HP or PCP agreement. Equal monthly payments over a fixed term; PCP deals end with an optional balloon payment." },
    {
      value: "student-loan",
      label: "Student loan",
      info: "Repaid through payroll as a percentage of pay above your plan's threshold — 9% for Plans 1, 2, 4 and 5, 6% for postgraduate loans — so it behaves like an extra tax rather than a normal loan. Any balance left is written off after 25 to 40 years depending on the plan.",
    },
    { value: "overdraft", label: "Overdraft", info: "An arranged overdraft on a current account: a flexible borrowing limit, usually charged at a high APR." },
    { value: "other", label: "Other", info: "Any other money you owe." },
  ],
};

const US_TYPES: TypeTable = {
  cash: [
    { value: "current", label: "Checking account", info: "Your everyday account: paychecks land here and bills leave from it. Usually pays little or no interest." },
    { value: "other-asset", label: "Other cash", info: "Cash held anywhere else, such as a prepaid card or money set aside at home." },
  ],
  savings: [
    {
      value: "savings",
      label: "Savings",
      info: "A standard bank savings account. Interest is taxed as ordinary income. FDIC or NCUA insured up to $250,000 per depositor.",
      taxTreatment: "taxable",
    },
    {
      value: "hysa",
      label: "High-yield savings (HYSA)",
      info: "An online savings account paying well above the typical bank rate. Rates are variable and interest is taxable. FDIC insured up to $250,000 and usually no fees or minimums.",
      taxTreatment: "taxable",
    },
    {
      value: "cd",
      label: "Certificate of deposit (CD)",
      info: "You lock money away for a fixed term (3 months to 5 years) at a fixed rate. Withdrawing before the term ends usually forfeits some interest. Interest is taxable in the year it is earned.",
      taxTreatment: "taxable",
    },
    {
      value: "money-market",
      label: "Money market account",
      info: "A savings account that usually pays more than standard savings and may come with checks or a debit card, sometimes with a minimum balance. FDIC insured; interest is taxable.",
      taxTreatment: "taxable",
    },
    {
      value: "hsa",
      label: "Health savings account (HSA)",
      info: "Only available with a high-deductible health plan. Triple tax advantage: contributions are pre-tax, growth is tax-free, and withdrawals for qualified medical expenses are tax-free. The balance rolls over every year, can be invested, and after 65 works like a traditional IRA for non-medical spending.",
      taxTreatment: "triple",
      payroll: true,
    },
    {
      value: "fsa",
      label: "Flexible spending account (FSA)",
      info: "Pre-tax payroll money set aside for medical costs (or dependent care). Use-it-or-lose-it: most plans forfeit what is unspent at year end, though some allow a small carryover or a grace period. You cannot hold a health FSA alongside an HSA.",
      taxTreatment: "pre-tax",
      payroll: true,
    },
    { value: "other-asset", label: "Other", info: "Any other savings pot, such as savings bonds or a credit-union share account." },
  ],
  investment: [
    {
      value: "investment",
      label: "Taxable brokerage",
      info: "Investments with no tax wrapper and no contribution limit. Dividends and realized gains are taxed each year (long-term gains at 0%, 15% or 20%). Withdraw any time.",
      taxTreatment: "taxable",
    },
    {
      value: "401k",
      label: "401(k)",
      info: "An employer retirement plan funded from your paycheck. Traditional contributions skip income tax now and grow tax-deferred; Roth contributions are after-tax but come out tax-free. Many employers match part of what you put in. Employee limit $23,500 in 2025 (+$7,500 catch-up from age 50). Withdrawals before 59½ usually owe income tax plus a 10% penalty.",
      taxTreatment: "pre-tax",
      payroll: true,
    },
    {
      value: "403b",
      label: "403(b)",
      info: "The 401(k) equivalent for public schools, hospitals, non-profits and churches. Same $23,500 employee limit and catch-up rules as a 401(k), pre-tax or Roth depending on the plan, and the same 59½ rule for withdrawals.",
      taxTreatment: "pre-tax",
      payroll: true,
    },
    {
      value: "traditional-ira",
      label: "Traditional IRA",
      info: "A retirement account you open yourself. Contributions may be tax-deductible (depending on income and whether you have a workplace plan), growth is tax-deferred, and withdrawals are taxed as income. $7,000 limit in 2025 (+$1,000 from age 50), shared with any Roth IRA. Required minimum distributions start at 73.",
      taxTreatment: "pre-tax",
    },
    {
      value: "roth-ira",
      label: "Roth IRA",
      info: "After-tax contributions, tax-free growth and tax-free withdrawals once the account is 5 years old and you are 59½. Contributions (not earnings) can be withdrawn any time without penalty. $7,000 limit in 2025 (+$1,000 from age 50), shared with a traditional IRA; income limits apply.",
      taxTreatment: "roth",
    },
    {
      value: "529",
      label: "529 college savings plan",
      info: "A state-sponsored education savings plan. Contributions are after-tax (many states give a deduction), and growth and withdrawals for qualified education costs — tuition, fees, books, up to $10,000 a year of K-12 tuition — are tax-free. Non-qualified withdrawals owe income tax and a 10% penalty on earnings. No federal annual limit; gifts above $19,000 a year count against the gift-tax exclusion.",
      taxTreatment: "tax-free",
    },
    { value: "other-asset", label: "Other", info: "Any other investment, such as real estate, crypto or a business stake." },
  ],
  debt: [
    {
      value: "credit-card",
      label: "Credit card",
      info: "Revolving credit. Pay the statement balance in full to avoid interest — the minimum payment mostly covers interest. Keeping utilization under 30% helps your FICO score.",
    },
    { value: "loan", label: "Personal loan", info: "A fixed-term installment loan: equal monthly payments until it is paid off." },
    {
      value: "mortgage",
      label: "Mortgage",
      info: "Track the principal balance, rate and remaining term. Property tax, homeowners insurance and HOA dues are separate recurring costs — add them as expenses and the Housing widget totals them alongside the payment.",
    },
    { value: "auto-loan", label: "Auto loan", info: "A car loan: equal monthly payments over a fixed term, usually 36 to 72 months." },
    {
      value: "student-loan",
      label: "Student loan",
      info: "Federal loans have fixed rates set by Congress, income-driven repayment plans, deferment and forgiveness programs; the standard plan repays over 10 years. Private loans have lender-set rates and terms and fewer protections. Interest up to $2,500 a year may be tax-deductible.",
    },
    { value: "overdraft", label: "Line of credit", info: "A personal or home-equity line of credit: borrow up to a limit and pay interest only on what you use." },
    { value: "other", label: "Other", info: "Any other money you owe." },
  ],
};

const TYPE_TABLES: Record<RegionKey, TypeTable> = { GB: GB_TYPES, US: US_TYPES };

export const ACCOUNT_CLASSES: AccountClass[] = ["cash", "savings", "investment", "debt"];

// Every type a class may carry, whatever the country. Used to validate stored accounts so that a
// 401(k) survives a switch to the UK experience and a Cash ISA survives a switch to the US one.
export function allAccountTypesForClass(accountClass: AccountClass): AccountType[] {
  const values = new Set<AccountType>();
  for (const table of Object.values(TYPE_TABLES)) table[accountClass].forEach((option) => values.add(option.value));
  return Array.from(values);
}

export function accountTypeOptions(region: RegionKey, accountClass: AccountClass): AccountTypeOption[] {
  return TYPE_TABLES[region][accountClass];
}

// The option describing an account's type: the region's own entry, else the other region's (the
// account was created under a different country), else a generic fallback.
export function accountTypeOption(region: RegionKey, accountClass: AccountClass, type: AccountType): AccountTypeOption {
  const own = TYPE_TABLES[region][accountClass].find((option) => option.value === type);
  if (own) return own;
  const other = TYPE_TABLES[region === "US" ? "GB" : "US"][accountClass].find((option) => option.value === type);
  if (other) return other;
  return { value: type, label: "Account", info: "" };
}

// Options for an account's type select: the region's list, plus the account's current type when it
// came from the other region so the select never shows a blank.
export function accountTypeOptionsFor(region: RegionKey, accountClass: AccountClass, currentType: AccountType): AccountTypeOption[] {
  const options = accountTypeOptions(region, accountClass);
  return options.some((option) => option.value === currentType) ? options : [...options, accountTypeOption(region, accountClass, currentType)];
}

export function defaultTypeForClass(accountClass: AccountClass): AccountType {
  return accountClass === "debt" ? "credit-card" : accountClass === "cash" ? "current" : accountClass === "savings" ? "savings" : "investment";
}

export function accountClassOptions(region: RegionKey): AccountClassOption[] {
  return [
    { value: "savings", label: "Savings account" },
    { value: "cash", label: region === "US" ? "Checking account" : "Current account" },
    { value: "investment", label: region === "US" ? "Investment / retirement" : "Investment / pension" },
    { value: "debt", label: "Debt account" },
  ];
}

export function defaultTaxTreatment(region: RegionKey, accountClass: AccountClass, type: AccountType): TaxTreatment | undefined {
  return accountTypeOption(region, accountClass, type).taxTreatment;
}

export function defaultContributionSource(region: RegionKey, accountClass: AccountClass, type: AccountType): ContributionSource {
  return accountTypeOption(region, accountClass, type).payroll ? "payroll" : "personal";
}

// Types whose contributions, tax treatment and limits are worth a "plan details" section.
export const PLAN_DETAIL_TYPES = new Set<AccountType>(["pension", "sipp", "401k", "403b", "traditional-ira", "roth-ira", "529", "hsa", "fsa", "isa", "lisa", "cd"]);

export function supportsPlanDetails(accountClass: AccountClass, type: AccountType): boolean {
  return accountClass !== "debt" && PLAN_DETAIL_TYPES.has(type);
}

// Loan-shaped debts amortise over a term and have no credit limit.
export const LOAN_TYPES = new Set<AccountType>(["loan", "mortgage", "auto-loan", "student-loan"]);

export function isLoanType(type: AccountType): boolean {
  return LOAN_TYPES.has(type);
}

// Retirement accounts feed the retirement / contribution-limit widgets.
export const RETIREMENT_TYPES = new Set<AccountType>(["pension", "sipp", "401k", "403b", "traditional-ira", "roth-ira"]);

export function isRetirementType(type: AccountType): boolean {
  return RETIREMENT_TYPES.has(type);
}

export const TAX_TREATMENT_OPTIONS: Array<{ value: TaxTreatment; label: string; hint: string }> = [
  { value: "pre-tax", label: "Pre-tax (traditional)", hint: "Contributions skip income tax now; withdrawals are taxed as income later." },
  { value: "roth", label: "Roth (after-tax)", hint: "Contributions are taxed now; qualified withdrawals are tax-free." },
  { value: "tax-free", label: "Tax-free growth", hint: "After-tax money in, no tax on growth or qualified withdrawals." },
  { value: "triple", label: "Triple tax-advantaged", hint: "Pre-tax in, tax-free growth, tax-free out for qualified spending." },
  { value: "taxable", label: "Taxable", hint: "No wrapper: interest, dividends and gains are taxed as they arise." },
];

// ─── Onboarding presets ──────────────────────────────────────────────────────

export type BillPreset = { name: string; category: string };
export type AccountPreset = { key: string; label: string; hint: string; accountClass: AccountClass; type: AccountType };

const GB_BILL_PRESETS: BillPreset[] = [
  { name: "Rent / Mortgage", category: "Home" },
  { name: "Council tax", category: "Bills" },
  { name: "Energy", category: "Bills" },
  { name: "Water", category: "Bills" },
  { name: "Broadband", category: "Bills" },
  { name: "Phone", category: "Bills" },
  { name: "Groceries", category: "Food" },
  { name: "Transport / fuel", category: "Travel" },
  { name: "Subscriptions", category: "Subscriptions" },
  { name: "Gym", category: "Health" },
];

const US_BILL_PRESETS: BillPreset[] = [
  { name: "Rent / Mortgage", category: "Housing" },
  { name: "Property tax", category: "Housing" },
  { name: "HOA dues", category: "Housing" },
  { name: "Home insurance", category: "Housing" },
  { name: "Electric", category: "Utilities" },
  { name: "Gas", category: "Utilities" },
  { name: "Water", category: "Utilities" },
  { name: "Internet", category: "Utilities" },
  { name: "Cell phone", category: "Utilities" },
  { name: "Groceries", category: "Food" },
  { name: "Gas / transit", category: "Transportation" },
  { name: "Car insurance", category: "Transportation" },
  { name: "Health insurance", category: "Medical" },
  { name: "Student loan payment", category: "Debt payments" },
  { name: "Subscriptions", category: "Subscriptions" },
  { name: "Gym", category: "Health" },
];

const GB_ACCOUNT_PRESETS: AccountPreset[] = [
  { key: "current", label: "Current account", hint: "Everyday balance", accountClass: "cash", type: "current" },
  { key: "savings", label: "Savings", hint: "Cash set aside", accountClass: "savings", type: "savings" },
  { key: "credit-card", label: "Credit card", hint: "Amount owed", accountClass: "debt", type: "credit-card" },
  { key: "investment", label: "Investments", hint: "Stocks, ISA, pension", accountClass: "investment", type: "investment" },
  { key: "pension", label: "Workplace pension", hint: "Pot so far", accountClass: "investment", type: "pension" },
];

const US_ACCOUNT_PRESETS: AccountPreset[] = [
  { key: "checking", label: "Checking account", hint: "Everyday balance", accountClass: "cash", type: "current" },
  { key: "savings", label: "Savings / HYSA", hint: "Cash set aside", accountClass: "savings", type: "hysa" },
  { key: "credit-card", label: "Credit card", hint: "Amount owed", accountClass: "debt", type: "credit-card" },
  { key: "401k", label: "401(k) / 403(b)", hint: "Balance so far", accountClass: "investment", type: "401k" },
  { key: "roth-ira", label: "Roth IRA", hint: "Balance so far", accountClass: "investment", type: "roth-ira" },
  { key: "brokerage", label: "Brokerage", hint: "Taxable investments", accountClass: "investment", type: "investment" },
  { key: "hsa", label: "HSA", hint: "Health savings", accountClass: "savings", type: "hsa" },
];

export function billPresets(region: RegionKey): BillPreset[] {
  return region === "US" ? US_BILL_PRESETS : GB_BILL_PRESETS;
}

export function accountPresets(region: RegionKey): AccountPreset[] {
  return region === "US" ? US_ACCOUNT_PRESETS : GB_ACCOUNT_PRESETS;
}

// Bank statements write dates day-first in the UK and month-first in the US.
export function dateOrderFor(region: RegionKey): "dmy" | "mdy" {
  return region === "US" ? "mdy" : "dmy";
}

// Spending categories that count as medical for the US medical-spending tracker.
export const MEDICAL_CATEGORY_PATTERN = /\b(medical|health|doctor|dentist|dental|vision|pharmacy|prescription|hospital|clinic|copay|therapy)\b/i;

// Housing-cost categories and names (mortgage/rent plus the US extras) for the Housing widget.
export const HOUSING_PATTERN = /\b(rent|mortgage|property tax|hoa|homeowner|home insurance|council tax|escrow|ground rent|service charge)\b/i;
