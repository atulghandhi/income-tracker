import { useEffect, useRef } from "react";
import { ArrowUpRight, CalendarDays, FileText, Repeat, Tag, Trash2, Wallet, X } from "lucide-react";
import type { Account, ExpenseEntry, IncomeEntry } from "./types";

export type PeekTarget = { kind: "income" | "expense"; id: string; monthKey: string };

type Props = {
  kind: "income" | "expense";
  entry: IncomeEntry | ExpenseEntry;
  monthLabel: string;
  account?: Account;
  formatter: Intl.NumberFormat;
  privacy: boolean;
  onClose: () => void;
  onShowInLedger: () => void;
  /** Absent when the transaction is in another month: removing happens from its own ledger. */
  onRemove?: () => void;
};

// A quick look at one transaction, over the page instead of instead of it.
// Esc or a click outside closes it; "Show in ledger" takes you to the row.
export default function TransactionPeek({ kind, entry, monthLabel, account, formatter, privacy, onClose, onShowInLedger, onRemove }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = "source" in entry ? entry.source : entry.name;
  const raw = entry.imported?.originalDescription?.trim();
  const amount = privacy ? "•••" : formatter.format(kind === "income" ? entry.amount : -entry.amount);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="peekLayer" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="peek" role="dialog" aria-modal="true" aria-label={`${name || "Transaction"} details`}>
        <header className="peekHead">
          <span className={kind === "income" ? "peekKind in" : "peekKind out"}>{kind === "income" ? "Money in" : "Money out"}</span>
          <button ref={closeRef} className="iconButton" type="button" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>
        <h2 className="peekName">{name || "(no name)"}</h2>
        {raw && raw.toLowerCase() !== name.toLowerCase() && (
          <p className="peekRaw">
            <span>On your statement</span>
            <code>{raw}</code>
          </p>
        )}
        <p className={`peekAmount ${kind === "income" ? "positiveText" : ""} ${privacy ? "masked" : ""}`}>{amount}</p>

        <dl className="peekFacts">
          <div>
            <dt><CalendarDays size={15} aria-hidden="true" /> When</dt>
            <dd>{entry.date ? new Date(entry.date + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : monthLabel}</dd>
          </div>
          {"category" in entry && (
            <div>
              <dt><Tag size={15} aria-hidden="true" /> Category</dt>
              <dd>{entry.category || "Not grouped"}</dd>
            </div>
          )}
          <div>
            <dt><Wallet size={15} aria-hidden="true" /> Account</dt>
            <dd>
              {account ? (
                <>
                  <span className="accountDot static" style={{ background: account.color }} aria-hidden="true" /> {account.name}
                </>
              ) : (
                "None"
              )}
            </dd>
          </div>
          <div>
            <dt><Repeat size={15} aria-hidden="true" /> Repeats</dt>
            <dd>{entry.recurring ? "Every month" : "Just this once"}</dd>
          </div>
          {entry.imported && (
            <div>
              <dt><FileText size={15} aria-hidden="true" /> Imported from</dt>
              <dd>
                {entry.imported.fileName}, row {entry.imported.rowNumber}
              </dd>
            </div>
          )}
        </dl>

        <footer className="peekActions">
          <button className="commandButton peekPromote" type="button" onClick={onShowInLedger}>
            Show in ledger <ArrowUpRight size={16} />
          </button>
          {onRemove && (
            <button className="quietButton peekRemove" type="button" onClick={onRemove}>
              <Trash2 size={16} /> Remove
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
