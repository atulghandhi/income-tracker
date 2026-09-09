// Retention helpers: the monthly "import your statement" reminder, the
// new-month nudge, and the remembered bank. All pure and dependency-free so
// they can be unit tested; the components in RetentionPanels.tsx render them.

import { BANK_GUIDES } from "./generated/bankGuides";

export const SITE_URL = "https://www.theincometracker.com";
export const BANK_KEY = "it_bank";
export const NUDGE_DISMISSED_KEY = "it_nudge_dismissed_month";
export const INSTALL_DISMISSED_KEY = "it_install_dismissed";
export const VISITS_KEY = "it_visits";

export function readBankSlug(): string {
  try {
    const stored = localStorage.getItem(BANK_KEY) ?? "";
    return BANK_GUIDES.some((bank) => bank.slug === stored) ? stored : "";
  } catch {
    return "";
  }
}

export function writeBankSlug(slug: string) {
  try {
    if (slug) localStorage.setItem(BANK_KEY, slug);
    else localStorage.removeItem(BANK_KEY);
  } catch {
    // Storage unavailable; the choice simply will not persist.
  }
}

export function bankGuideUrl(slug: string): string {
  return slug ? `${SITE_URL}/import/${slug}.html` : `${SITE_URL}/import/`;
}

export function bankName(slug: string): string {
  return BANK_GUIDES.find((bank) => bank.slug === slug)?.name ?? "your bank";
}

// Counts visits (one per calendar day) so nudges can wait for a returning user.
export function recordVisit(today = new Date()): number {
  try {
    const key = today.toISOString().slice(0, 10);
    const raw = localStorage.getItem(VISITS_KEY);
    const parsed = raw ? (JSON.parse(raw) as { count: number; last: string }) : { count: 0, last: "" };
    if (parsed.last === key) return parsed.count;
    const next = { count: parsed.count + 1, last: key };
    localStorage.setItem(VISITS_KEY, JSON.stringify(next));
    return next.count;
  } catch {
    return 1;
  }
}

// ── New-month nudge ──────────────────────────────────────────────────────────

export function shouldShowNewMonthNudge({
  today,
  previousMonthHasImports,
  hasImportedBefore,
  hasBank,
  dismissedMonth,
}: {
  today: Date;
  previousMonthHasImports: boolean;
  hasImportedBefore: boolean;
  hasBank: boolean;
  dismissedMonth: string | null;
}): boolean {
  if (today.getDate() < 2) return false; // statements for last month are rarely complete on the 1st
  if (previousMonthHasImports) return false;
  if (!hasImportedBefore && !hasBank) return false; // manual-entry users are not nagged about CSVs
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return dismissedMonth !== monthKey;
}

// ── Calendar reminder ────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

// First occurrence on or after tomorrow, on the chosen day of the month.
export function nextReminderDate(dayOfMonth: number, today = new Date()): Date {
  const day = Math.min(Math.max(1, Math.round(dayOfMonth)), 28);
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate <= today) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

function reminderText(bankSlug: string) {
  const bank = bankName(bankSlug);
  return {
    summary: `Import last month's ${bank === "your bank" ? "bank" : bank} statement into The Income Tracker`,
    description: `Export last month's transactions as a CSV from ${bank} and import them into The Income Tracker. Ten minutes, once a month.\nExport guide: ${bankGuideUrl(bankSlug)}\nOpen the tracker: ${SITE_URL}/?ref=reminder`,
  };
}

// RFC 5545: escape text values and fold lines longer than 75 octets.
function icsEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsFold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildReminderIcs({ dayOfMonth, bankSlug, today = new Date(), uid }: { dayOfMonth: number; bankSlug: string; today?: Date; uid?: string }): string {
  const start = nextReminderDate(dayOfMonth, today);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const { summary, description } = reminderText(bankSlug);
  const stamp = `${ymd(new Date(today.getTime() - today.getTimezoneOffset() * 60000))}T${pad(today.getUTCHours())}${pad(today.getUTCMinutes())}00Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Income Tracker//Monthly statement reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid ?? `${start.getTime()}-${Math.random().toString(36).slice(2)}`}@theincometracker.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Math.min(Math.max(1, Math.round(dayOfMonth)), 28)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${SITE_URL}/?ref=reminder`,
    "BEGIN:VALARM",
    "TRIGGER:PT9H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(icsFold).join("\r\n")}\r\n`;
}

export function googleCalendarReminderUrl({ dayOfMonth, bankSlug, today = new Date() }: { dayOfMonth: number; bankSlug: string; today?: Date }): string {
  const start = nextReminderDate(dayOfMonth, today);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const { summary, description } = reminderText(bankSlug);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: summary,
    details: description,
    dates: `${ymd(start)}/${ymd(end)}`,
    recur: `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Math.min(Math.max(1, Math.round(dayOfMonth)), 28)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// ── Install prompt ───────────────────────────────────────────────────────────

export function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && safari;
}
