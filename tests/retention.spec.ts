import { expect, test } from "@playwright/test";
import { buildReminderIcs, googleCalendarReminderUrl, nextReminderDate, shouldShowNewMonthNudge } from "../src/retention";

test.describe("Monthly reminder", () => {
  test("picks the next occurrence of the chosen day", () => {
    const today = new Date(2026, 8, 9); // 9 September 2026
    expect(nextReminderDate(2, today).toISOString().slice(0, 10)).toBe("2026-10-02");
    expect(nextReminderDate(15, today).toISOString().slice(0, 10)).toBe("2026-09-15");
    // Days past the 28th are clamped so every month has the date.
    expect(nextReminderDate(31, today).getDate()).toBe(28);
  });

  test("builds a valid repeating all-day ICS event", () => {
    const ics = buildReminderIcs({ dayOfMonth: 2, bankSlug: "monzo-csv", today: new Date(2026, 8, 9, 10, 30), uid: "test" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=2");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261002");
    expect(ics).toContain("DTEND;VALUE=DATE:20261003");
    expect(ics).toContain("UID:test@theincometracker.com");
    expect(ics).toContain("SUMMARY:Import last month's Monzo statement into The Income Tracker");
    // The bank guide link survives escaping and folding.
    expect(ics.replace(/\r\n /g, "")).toContain("https://www.theincometracker.com/import/monzo-csv.html");
    // Every line is folded to 75 octets or fewer.
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  test("builds a Google Calendar template link with the recurrence", () => {
    const url = new URL(googleCalendarReminderUrl({ dayOfMonth: 5, bankSlug: "", today: new Date(2026, 8, 9) }));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("recur")).toBe("RRULE:FREQ=MONTHLY;BYMONTHDAY=5");
    expect(url.searchParams.get("dates")).toBe("20261005/20261006");
    expect(url.searchParams.get("details")).toContain("https://www.theincometracker.com/import/");
  });
});

test.describe("New-month nudge", () => {
  const base = { today: new Date(2026, 8, 9), previousMonthHasImports: false, hasImportedBefore: true, hasBank: false, dismissedMonth: null };

  test("shows once last month is importable and nothing has been imported", () => {
    expect(shouldShowNewMonthNudge(base)).toBe(true);
  });

  test("stays quiet on the 1st, after an import, for manual-only users, and once dismissed", () => {
    expect(shouldShowNewMonthNudge({ ...base, today: new Date(2026, 8, 1) })).toBe(false);
    expect(shouldShowNewMonthNudge({ ...base, previousMonthHasImports: true })).toBe(false);
    expect(shouldShowNewMonthNudge({ ...base, hasImportedBefore: false })).toBe(false);
    expect(shouldShowNewMonthNudge({ ...base, hasImportedBefore: false, hasBank: true })).toBe(true);
    expect(shouldShowNewMonthNudge({ ...base, dismissedMonth: "2026-09" })).toBe(false);
    expect(shouldShowNewMonthNudge({ ...base, dismissedMonth: "2026-08" })).toBe(true);
  });
});
