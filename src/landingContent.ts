import type { CountryCode } from "./types";
import { detectCountryFromBrowser, regionOf, type RegionKey } from "./region";

// ─── The two public homepages ────────────────────────────────────────────────
//
// "/" is the UK homepage and "/us/" the US one. Both are prerendered at build time from the same
// component (scripts/prerender-home.mjs), so search engines get a complete page for each, tied
// together with hreflang. People in the US who arrive at "/" see the US copy in place; the URL
// stays "/" so a shared link still means what the sender saw.

export const SITE = "https://www.theincometracker.com";

export const LANDING_PATHS: Record<RegionKey, string> = { GB: "/", US: "/us/" };

const PREF_KEY = "it_landing_region";

export function landingRegionFromPath(pathname: string): RegionKey | null {
  if (/^\/us\/?$/i.test(pathname)) return "US";
  if (pathname === "/" || pathname === "") return "GB";
  return null;
}

export function isLandingPath(pathname: string): boolean {
  return landingRegionFromPath(pathname) !== null;
}

function storedPreference(): RegionKey | null {
  try {
    const value = localStorage.getItem(PREF_KEY);
    return value === "US" || value === "GB" ? value : null;
  } catch {
    return null;
  }
}

// Called when someone picks "US version" or "UK version" by hand. That choice outranks detection.
export function rememberLandingRegion(region: RegionKey) {
  try {
    localStorage.setItem(PREF_KEY, region);
  } catch {
    // Storage unavailable: the link still takes them to the page they picked.
  }
}

// Crawlers get the page the URL names. Swapping "/" to US copy for a bot that happens to render
// with a US clock would leave search engines unsure which page "/" is.
function isCrawler(): boolean {
  try {
    return /bot|crawler|spider|slurp|bingpreview|mediapartners|lighthouse/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

// Which homepage to show. "/us/" always means US. On "/", an explicit choice wins, then the same
// browser-based detection the app uses for its country.
export function chooseLandingRegion(pathname: string, detect: () => CountryCode = detectCountryFromBrowser): RegionKey {
  if (/^\/us\/?$/i.test(pathname)) return "US";
  if (isCrawler()) return "GB";
  return storedPreference() ?? regionOf(detect());
}

// The country a brand-new ledger starts in. Someone who came through the US homepage gets the US
// app even if their browser clock says otherwise; someone who picked the UK site keeps it.
export function initialCountry(pathname: string, detected: CountryCode): CountryCode {
  if (/^\/us\/?$/i.test(pathname)) return "US";
  const preference = storedPreference();
  if (preference === "US") return "US";
  if (preference === "GB" && detected === "US") return "GB";
  return detected;
}

// ─── Copy ────────────────────────────────────────────────────────────────────

type Row = { name: string; amt: string };

export type LandingCopy = {
  region: RegionKey;
  lang: string;
  locale: string;
  currency: string;
  meta: { title: string; description: string; socialDescription: string; keywords: string };
  nav: Array<{ href: string; label: string }>;
  heroSub: string;
  salaryLabel: string;
  heroIncome: Row;
  heroExpenses: [Row, Row];
  strip: string;
  csvRows: ReadonlyArray<{ date: string; desc: string; amt: string; cat: string }>;
  csvHeading: string;
  csvBody: string;
  miniIncomeLabel: string;
  miniFood: { label: string; merchant: string; amt: string };
  miniRows: Row[];
  banksEyebrow: string;
  banksHeading: string;
  banksBody: string;
  // UK banks link to their export guides; the US list is names only until US guides exist.
  bankNames: string[] | null;
  resourcesNote: string | null;
  resources: ReadonlyArray<{ href: string; t: string; d: string }>;
  faq: ReadonlyArray<{ q: string; a: string }>;
  switchTo: { href: string; label: string; region: RegionKey };
};

const GB: LandingCopy = {
  region: "GB",
  lang: "en-GB",
  locale: "en-GB",
  currency: "£",
  meta: {
    title: "Free Income & Expense Tracker UK | The Income Tracker",
    description: "Track income, expenses and your monthly budget free. Import a UK bank CSV or add spending manually. No sign-up or bank connection required.",
    socialDescription: "A free, private income and expense tracker for the UK. Import a CSV from any of 27 UK banks. No account, no bank login. Your data stays in your browser.",
    keywords: "income tracker, expense tracker, budget tracker UK, free budgeting app UK, budget app without open banking, CSV budget tracker, money dashboard alternative, moneyhub alternative, free YNAB alternative, self employed income tracker",
  },
  nav: [
    { href: "/import/", label: "Bank guides" },
    { href: "/guides/", label: "Guides" },
    { href: "/tools/", label: "Calculators" },
    { href: "/compare/", label: "Compare" },
  ],
  heroSub: "A month-by-month ledger for your income and expenses. Download a CSV from Barclays, HSBC, Monzo or Starling and import it in seconds. No account connection needed.",
  salaryLabel: "Salary",
  heroIncome: { name: "Interest", amt: "78.00" },
  heroExpenses: [{ name: "Costa Coffee", amt: "4.20" }, { name: "Work commute", amt: "120.00" }],
  strip: "No open banking. No Plaid. No third-party access to your accounts. Just a CSV file you download yourself.",
  csvRows: [
    { date: "13 Jun", desc: "TESCO EXTRA 4261", amt: "42.61", cat: "Food" },
    { date: "12 Jun", desc: "SOUTHERN RAIL", amt: "12.40", cat: "Transport" },
    { date: "11 Jun", desc: "COSTA COFFEE", amt: "4.35", cat: "Eating out" },
    { date: "09 Jun", desc: "BUPA DENTAL PLAN", amt: "75.00", cat: "Health" },
  ],
  csvHeading: "Import from any UK bank",
  csvBody: "Download a statement from Barclays, HSBC, Monzo or Starling. Drop the CSV into the app. Dates, descriptions and amounts are read automatically.",
  miniIncomeLabel: "Salary (BACS)",
  miniFood: { label: "Food", merchant: "Tesco Extra", amt: "42.61" },
  miniRows: [
    { name: "Southern Rail", amt: "12.40" },
    { name: "Costa Coffee", amt: "4.35" },
    { name: "Dentist (Bupa)", amt: "75.00" },
  ],
  banksEyebrow: "Works with your bank",
  banksHeading: "CSV export guides for UK banks",
  banksBody: "Every major UK bank lets you download your own transactions. Pick yours for the exact steps, then import the file here.",
  bankNames: null,
  resourcesNote: null,
  resources: [
    { href: "/tools/budget-planner-uk.html", t: "Budget planner (UK)", d: "Surplus, savings rate and the 50/30/20 check" },
    { href: "/tools/rent-affordability-calculator-uk.html", t: "Rent affordability", d: "The 30% rule and the letting-agent income check" },
    { href: "/guides/income-and-expenditure-form-uk.html", t: "Income and expenditure form", d: "Fill in the Standard Financial Statement from real statements" },
    { href: "/tools/weekly-to-monthly-budget-calculator.html", t: "Weekly to monthly calculator", d: "Convert pay and bills to the same budget period" },
    { href: "/tools/split-bills-by-income-calculator.html", t: "Split bills by income", d: "Compare proportional contributions with 50/50" },
    { href: "/tools/christmas-budget-savings-calculator.html", t: "Christmas savings planner", d: "Work out how much to put aside each payday" },
    { href: "/import/", t: "Bank CSV guides", d: "Export from 27 UK banks, step by step" },
    { href: "/guides/", t: "Budgeting guides", d: "Answer-first, no jargon, no bank login" },
    { href: "/tools/", t: "Free calculators", d: "50/30/20, emergency fund, payoff, surplus" },
    { href: "/templates/", t: "Budget templates", d: "Free CSVs that import in one step" },
    { href: "/compare/", t: "Compare apps", d: "Honest side-by-sides, including where we lose" },
    { href: "/whats-new.html", t: "What’s new", d: "Release notes, newest first" },
  ],
  faq: [
    { q: "Is The Income Tracker free?", a: "Yes. Completely free: no credit card, no subscription, no sign-up. Open it and start." },
    { q: "Do I need to connect or log in to my bank?", a: "No. Download a CSV from your bank and drop it in. There is no open banking connection and you never enter bank credentials." },
    { q: "Which UK banks does it work with?", a: "Any bank that exports CSV, OFX, QIF or a PDF statement: Barclays, HSBC, Lloyds, NatWest, Santander, Nationwide, Halifax, TSB, Monzo, Starling, Revolut, Chase, Amex and more. Step-by-step export guides cover 27 banks, and PDF statements import directly." },
    { q: "Where is my financial data stored?", a: "In your browser, on your device. Nothing is uploaded unless you choose to sign in to sync across devices, and you can export everything at any time." },
    { q: "Is it an alternative to YNAB, Emma or Money Dashboard?", a: "For a free, private monthly picture of income, spending and surplus, yes. The comparison pages say plainly where each of those wins." },
    { q: "Does it work on a phone?", a: "Yes. It runs in any browser, installs to your home screen like an app, and works offline once loaded." },
  ],
  switchTo: { href: "/us/", label: "US version", region: "US" },
};

const US: LandingCopy = {
  region: "US",
  lang: "en-US",
  locale: "en-US",
  currency: "$",
  meta: {
    title: "Free Income & Expense Tracker (US) | The Income Tracker",
    description: "Track income, expenses and your monthly budget free. Import a CSV or QFX file from Chase, Bank of America or any US bank. No Plaid and no sign-up.",
    socialDescription: "A free, private income and expense tracker. Import a CSV or QFX file from your US bank. No Plaid, no bank login, no account. Your data stays in your browser.",
    keywords: "income tracker, expense tracker, free budget app, budget app without Plaid, budget app without linking bank, CSV budget tracker, Mint alternative, free YNAB alternative, Monarch alternative, paycheck budget",
  },
  nav: [
    { href: "/compare/vs-ynab.html", label: "vs YNAB" },
    { href: "/templates/", label: "Templates" },
  ],
  heroSub: "A month-by-month ledger for your income and expenses. Download a CSV from Chase, Bank of America or Wells Fargo and import it in seconds. Nothing connects to your bank.",
  salaryLabel: "Paycheck",
  heroIncome: { name: "Interest", amt: "78.00" },
  heroExpenses: [{ name: "Starbucks", amt: "5.45" }, { name: "Gas", amt: "45.00" }],
  strip: "No Plaid, no bank passwords and no third-party access to your accounts. You download a file from your bank and import it yourself.",
  csvRows: [
    { date: "Jun 13", desc: "WHOLEFDS MKT 10234", amt: "42.61", cat: "Food" },
    { date: "Jun 12", desc: "SHELL OIL 5744", amt: "38.20", cat: "Transportation" },
    { date: "Jun 11", desc: "STARBUCKS STORE 1182", amt: "5.45", cat: "Eating out" },
    { date: "Jun 09", desc: "CVS/PHARMACY 0412", amt: "24.99", cat: "Medical" },
  ],
  csvHeading: "Import from any US bank",
  csvBody: "Download your transactions from Chase, Bank of America or Capital One as a CSV or QFX file. Drop it into the app and the dates, descriptions and amounts are read automatically.",
  miniIncomeLabel: "Paycheck (direct deposit)",
  miniFood: { label: "Food", merchant: "Whole Foods", amt: "42.61" },
  miniRows: [
    { name: "Shell", amt: "38.20" },
    { name: "Starbucks", amt: "5.45" },
    { name: "CVS Pharmacy", amt: "24.99" },
  ],
  banksEyebrow: "Works with your bank",
  banksHeading: "Download a file from your bank, then import it",
  banksBody: "Most US banks and card issuers let you download transactions from their website as CSV, QFX or OFX. Pick the date range, save the file and drop it in.",
  bankNames: ["Chase", "Bank of America", "Wells Fargo", "Capital One", "Citi", "U.S. Bank", "PNC", "Ally", "Discover", "American Express"],
  resourcesNote: "Our guides and calculators are written for the UK for now. These two work anywhere.",
  resources: [
    { href: "/compare/vs-ynab.html", t: "The Income Tracker vs YNAB", d: "Where YNAB does more, and when a free ledger is enough" },
    { href: "/templates/", t: "Budget templates", d: "Free CSV templates that import in one step" },
  ],
  faq: [
    { q: "Is The Income Tracker free?", a: "Yes. Completely free: no credit card, no subscription, no sign-up. Open it and start." },
    { q: "Do I need to connect my bank or use Plaid?", a: "No. Download a CSV or QFX file from your bank's website and drop it in. There is no Plaid connection and you never enter bank credentials." },
    { q: "Which US banks does it work with?", a: "Any bank or card that exports CSV, OFX, QFX or QIF files, or a PDF statement: Chase, Bank of America, Wells Fargo, Capital One, Citi, U.S. Bank, PNC, Ally, Discover, American Express and more." },
    { q: "Where is my financial data stored?", a: "In your browser, on your device. Nothing is uploaded unless you choose to sign in to sync across devices, and you can export everything at any time." },
    { q: "Is it an alternative to Mint, YNAB or Monarch?", a: "For a free, private monthly picture of income, spending and surplus, yes. Mint closed in 2024, and YNAB and Monarch are paid subscriptions that connect to your bank. If you want automatic bank sync, they do more." },
    { q: "Does it handle US paychecks and taxes?", a: "Yes. The app switches to US accounts and terms, and its pay calculator works out take-home pay after federal and state income tax and FICA." },
    { q: "Does it work on a phone?", a: "Yes. It runs in any browser, installs to your home screen like an app, and works offline once loaded." },
  ],
  switchTo: { href: "/", label: "UK version", region: "GB" },
};

export const LANDING_COPY: Record<RegionKey, LandingCopy> = { GB, US };
