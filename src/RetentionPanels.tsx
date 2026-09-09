import { useState } from "react";
import { CalendarPlus, ChevronRight, Landmark, Smartphone, X } from "lucide-react";
import { BANK_GUIDES } from "./generated/bankGuides";
import { bankGuideUrl, bankName, buildReminderIcs, googleCalendarReminderUrl } from "./retention";

const GROUPS = [...new Set(BANK_GUIDES.map((bank) => bank.group))];

export function BankSelect({ value, onChange, id = "bank-select" }: { value: string; onChange: (slug: string) => void; id?: string }) {
  return (
    <label className="selectField">
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-label="Your bank">
        <option value="">Choose your bank…</option>
        {GROUPS.map((group) => (
          <optgroup label={group} key={group}>
            {BANK_GUIDES.filter((bank) => bank.group === group).map((bank) => (
              <option value={bank.slug} key={bank.slug}>
                {bank.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

// Settings panel: pick a bank and a day of the month, then add a repeating
// calendar event (ICS download or Google Calendar). No backend, no emails.
export function MonthlyReminderPanel({
  bankSlug,
  onBankChange,
  onDownloadIcs,
  onReminderAdded,
}: {
  bankSlug: string;
  onBankChange: (slug: string) => void;
  onDownloadIcs: (fileName: string, contents: string) => void;
  onReminderAdded: (method: "ics" | "google") => void;
}) {
  const [day, setDay] = useState(2);

  return (
    <article className="settingsPanel compactSetting reminderPanel" aria-label="Monthly reminder">
      <div className="panelTitleRow">
        <CalendarPlus size={17} />
        <h3>Monthly reminder</h3>
      </div>
      <p>Put a repeating event in your calendar to import last month&rsquo;s statement. Ten minutes, once a month, and the budget stays alive.</p>
      <BankSelect value={bankSlug} onChange={onBankChange} id="reminder-bank" />
      <label className="selectField">
        <select value={day} onChange={(event) => setDay(Number(event.target.value))} aria-label="Day of the month">
          {Array.from({ length: 28 }, (_, index) => index + 1).map((value) => (
            <option value={value} key={value}>
              On the {value}
              {value === 1 || value === 21 ? "st" : value === 2 || value === 22 ? "nd" : value === 3 || value === 23 ? "rd" : "th"} of each month
            </option>
          ))}
        </select>
      </label>
      <div className="buttonRow">
        <button
          className="commandButton"
          type="button"
          onClick={() => {
            onDownloadIcs("income-tracker-monthly-reminder.ics", buildReminderIcs({ dayOfMonth: day, bankSlug }));
            onReminderAdded("ics");
          }}
        >
          <CalendarPlus size={16} />
          Add to calendar
        </button>
        <a
          className="commandButton"
          href={googleCalendarReminderUrl({ dayOfMonth: day, bankSlug })}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onReminderAdded("google")}
        >
          Google Calendar
        </a>
      </div>
      <small className="panelHint">
        The event links to the {bankSlug ? `${bankName(bankSlug)} export guide` : "bank export guides"}. Works with Apple Calendar, Outlook and Google.
      </small>
    </article>
  );
}

// Dashboard card shown when a new month has started and last month's statement
// has not been imported yet.
export function NewMonthNudge({
  bankSlug,
  previousMonthLabel,
  onBankChange,
  onImport,
  onDismiss,
  onGuideOpened,
}: {
  bankSlug: string;
  previousMonthLabel: string;
  onBankChange: (slug: string) => void;
  onImport: () => void;
  onDismiss: () => void;
  onGuideOpened: () => void;
}) {
  return (
    <article className="nudgeCard" aria-label="New month reminder">
      <div className="nudgeIcon" aria-hidden="true">
        <Landmark size={18} />
      </div>
      <div className="nudgeBody">
        <strong>New month. Import {previousMonthLabel}&rsquo;s statement.</strong>
        <p>
          Export {previousMonthLabel} from {bankSlug ? bankName(bankSlug) : "your bank"} as a CSV and drop it in. Duplicates and transfers are skipped
          automatically.
        </p>
        {!bankSlug && <BankSelect value={bankSlug} onChange={onBankChange} id="nudge-bank" />}
        <div className="buttonRow">
          <button className="commandButton" type="button" onClick={onImport}>
            Import CSV
          </button>
          <a className="quietButton" href={bankGuideUrl(bankSlug)} target="_blank" rel="noopener noreferrer" onClick={onGuideOpened}>
            Export guide
            <ChevronRight size={14} />
          </a>
        </div>
      </div>
      <button className="iconButton" type="button" onClick={onDismiss} aria-label="Dismiss for this month" data-tip="Not this month">
        <X size={15} />
      </button>
    </article>
  );
}

// Install banner: uses the browser's install prompt where available, and falls
// back to Add to Home Screen instructions on iOS Safari.
export function InstallBanner({ mode, onInstall, onDismiss }: { mode: "prompt" | "ios"; onInstall: () => void; onDismiss: () => void }) {
  return (
    <article className="nudgeCard installCard" aria-label="Install the app">
      <div className="nudgeIcon" aria-hidden="true">
        <Smartphone size={18} />
      </div>
      <div className="nudgeBody">
        <strong>Keep it one tap away.</strong>
        {mode === "prompt" ? (
          <p>Install The Income Tracker as an app. It opens instantly, works offline, and your ledger stays on this device.</p>
        ) : (
          <p>
            Add it to your Home Screen: tap the Share button in Safari, then <em>Add to Home Screen</em>. It opens like an app and works offline.
          </p>
        )}
        {mode === "prompt" && (
          <div className="buttonRow">
            <button className="commandButton" type="button" onClick={onInstall}>
              <Smartphone size={16} />
              Install app
            </button>
          </div>
        )}
      </div>
      <button className="iconButton" type="button" onClick={onDismiss} aria-label="Dismiss install suggestion" data-tip="Not now">
        <X size={15} />
      </button>
    </article>
  );
}
