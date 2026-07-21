import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  Plus,
  ReceiptText,
  Sparkles,
  Target,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { currencyOptions, getCurrencySymbol } from "./finance";
import type { AccountClass, AccountType, CurrencyCode } from "./types";

// First-run setup wizard. Collects rough numbers only — the promise made on
// every step is "estimates are fine, everything can be edited later". The
// wizard never touches the ledger itself; it hands a plain result object back
// to App, which writes the entries with the normal creation paths.

export type OnboardingIncome = { source: string; amount: number };
export type OnboardingExpense = { name: string; amount: number; category: string };
export type OnboardingAccount = {
  name: string;
  accountClass: AccountClass;
  type: AccountType;
  balance: number;
};
export type OnboardingGoal = { name: string; target: number; saved: number };

export type OnboardingResult = {
  currency: CurrencyCode;
  incomes: OnboardingIncome[];
  expenses: OnboardingExpense[];
  accounts: OnboardingAccount[];
  goal: OnboardingGoal | null;
};

type BillPreset = { name: string; category: string };

// Common UK regular outgoings — tapping a chip adds an editable row.
const BILL_PRESETS: BillPreset[] = [
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

type AccountPreset = {
  key: string;
  label: string;
  hint: string;
  accountClass: AccountClass;
  type: AccountType;
};

const ACCOUNT_PRESETS: AccountPreset[] = [
  { key: "current", label: "Current account", hint: "Everyday balance", accountClass: "cash", type: "current" },
  { key: "savings", label: "Savings", hint: "Cash set aside", accountClass: "savings", type: "savings" },
  { key: "credit-card", label: "Credit card", hint: "Amount owed", accountClass: "debt", type: "credit-card" },
  { key: "investment", label: "Investments", hint: "Stocks, ISA, pension", accountClass: "investment", type: "investment" },
];

type IncomeRowDraft = { id: number; source: string; amount: string };
type BillRowDraft = { id: number; name: string; amount: string; category: string };
type AccountRowDraft = { id: number; preset: AccountPreset; balance: string };

const STEPS = ["Income", "Bills", "Accounts", "Goal"] as const;

function toAmount(value: string): number {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

let draftId = 0;
function nextId() {
  draftId += 1;
  return draftId;
}

export default function Onboarding({
  initialCurrency,
  onFinish,
}: {
  initialCurrency: CurrencyCode;
  onFinish: (result: OnboardingResult, meta: { completed: boolean; skippedSteps: number }) => void;
}) {
  // step -1 = welcome, 0-3 = the four setup steps, 4 = summary.
  const [step, setStep] = useState(-1);
  const [skippedSteps, setSkippedSteps] = useState(0);
  const [currency, setCurrency] = useState<CurrencyCode>(initialCurrency);
  const [incomeRows, setIncomeRows] = useState<IncomeRowDraft[]>([{ id: nextId(), source: "Salary (take-home)", amount: "" }]);
  const [billRows, setBillRows] = useState<BillRowDraft[]>([]);
  const [accountRows, setAccountRows] = useState<AccountRowDraft[]>([]);
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalSaved, setGoalSaved] = useState("");

  const symbol = useMemo(() => getCurrencySymbol(currency), [currency]);

  const result: OnboardingResult = useMemo(
    () => ({
      currency,
      incomes: incomeRows
        .map((row) => ({ source: row.source.trim(), amount: toAmount(row.amount) }))
        .filter((row) => row.source && row.amount > 0),
      expenses: billRows
        .map((row) => ({ name: row.name.trim(), amount: toAmount(row.amount), category: row.category }))
        .filter((row) => row.name && row.amount > 0),
      accounts: accountRows
        .map((row) => ({
          name: row.preset.label,
          accountClass: row.preset.accountClass,
          type: row.preset.type,
          balance: toAmount(row.balance),
        }))
        .filter((row) => row.balance > 0),
      goal:
        goalName.trim() && toAmount(goalTarget) > 0
          ? { name: goalName.trim(), target: toAmount(goalTarget), saved: toAmount(goalSaved) }
          : null,
    }),
    [currency, incomeRows, billRows, accountRows, goalName, goalTarget, goalSaved],
  );

  const addedCount = result.incomes.length + result.expenses.length + result.accounts.length + (result.goal ? 1 : 0);

  function finish(completed: boolean) {
    onFinish(result, { completed, skippedSteps });
  }

  function goNext() {
    setStep((current) => Math.min(current + 1, 4));
  }

  function skipStep() {
    setSkippedSteps((count) => count + 1);
    goNext();
  }

  function toggleBillPreset(preset: BillPreset) {
    setBillRows((rows) => {
      const existing = rows.find((row) => row.name === preset.name);
      if (existing) return rows.filter((row) => row.id !== existing.id);
      return [...rows, { id: nextId(), name: preset.name, amount: "", category: preset.category }];
    });
  }

  function toggleAccountPreset(preset: AccountPreset) {
    setAccountRows((rows) => {
      const existing = rows.find((row) => row.preset.key === preset.key);
      if (existing) return rows.filter((row) => row.id !== existing.id);
      return [...rows, { id: nextId(), preset, balance: "" }];
    });
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  if (step === -1) {
    return (
      <Shell onClose={() => finish(false)} closeLabel="Skip setup">
        <div className="obWelcome">
          <span className="obBadge">
            <Sparkles size={13} />
            Quick setup · about 2 minutes
          </span>
          <h2>Let&rsquo;s sketch out your money</h2>
          <p>
            Answer a few quick questions — rough numbers are fine — and your dashboard starts working straight away.
            Every step is optional and everything can be changed later.
          </p>
          <ul className="obWelcomeList">
            <li><Wallet size={16} /> Your monthly take-home income</li>
            <li><ReceiptText size={16} /> Regular bills and spending</li>
            <li><PiggyBank size={16} /> Savings, cards and balances</li>
            <li><Target size={16} /> Something you&rsquo;re saving for</li>
          </ul>
          <div className="obActions obActionsCenter">
            <button className="obPrimary" type="button" onClick={() => setStep(0)}>
              Get started
              <ArrowRight size={16} />
            </button>
            <button className="obGhost" type="button" onClick={() => finish(false)}>
              Skip — I&rsquo;ll explore on my own
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (step === 4) {
    return (
      <Shell onClose={() => finish(true)} closeLabel="Close setup">
        <div className="obWelcome">
          <span className="obBadge obBadgeDone">
            <Check size={13} />
            Setup complete
          </span>
          <h2>{addedCount > 0 ? "Your dashboard is ready" : "You're all set"}</h2>
          <p>
            {addedCount > 0
              ? summaryLine(result)
              : "You skipped the questions — no problem. The getting-started checklist on your dashboard picks up where this left off."}
          </p>
          <div className="obActions obActionsCenter">
            <button className="obPrimary" type="button" onClick={() => finish(true)}>
              <LayoutDashboard size={16} />
              Open my dashboard
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      onClose={() => finish(false)}
      closeLabel="Skip the rest of setup"
      progress={
        <div className="obProgress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((label, index) => (
            <span key={label} className={index === step ? "active" : index < step ? "done" : ""}>
              {label}
            </span>
          ))}
        </div>
      }
    >
      {step === 0 && (
        <StepFrame
          title="What comes in each month?"
          lede="Your take-home pay after tax. A rough figure is fine — it powers your surplus and forecasts."
        >
          <label className="obField obCurrencyField">
            <span>Currency</span>
            <select value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} aria-label="Currency">
              {currencyOptions.map((option) => (
                <option value={option.code} key={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="obRows">
            {incomeRows.map((row) => (
              <div className="obRow" key={row.id}>
                <input
                  value={row.source}
                  aria-label="Income source"
                  placeholder="e.g. Salary"
                  onChange={(event) =>
                    setIncomeRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, source: event.target.value } : r)))
                  }
                />
                <label className="obAmount">
                  <span>{symbol}</span>
                  <input
                    value={row.amount}
                    inputMode="decimal"
                    aria-label={`${row.source || "Income"} monthly amount`}
                    placeholder="0"
                    onChange={(event) =>
                      setIncomeRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, amount: event.target.value } : r)))
                    }
                  />
                </label>
                {incomeRows.length > 1 && (
                  <button
                    className="obRemove"
                    type="button"
                    aria-label={`Remove ${row.source || "income"}`}
                    onClick={() => setIncomeRows((rows) => rows.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            className="obAddAnother"
            type="button"
            onClick={() => setIncomeRows((rows) => [...rows, { id: nextId(), source: "", amount: "" }])}
          >
            <Plus size={14} />
            Add another income
          </button>
        </StepFrame>
      )}

      {step === 1 && (
        <StepFrame
          title="What goes out regularly?"
          lede="Tap the bills you pay each month, then put a rough amount on each. They'll repeat automatically every month."
        >
          <div className="obChips" role="group" aria-label="Common bills">
            {BILL_PRESETS.map((preset) => {
              const selected = billRows.some((row) => row.name === preset.name);
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={selected ? "obChip selected" : "obChip"}
                  aria-pressed={selected}
                  onClick={() => toggleBillPreset(preset)}
                >
                  {selected ? <Check size={13} /> : <Plus size={13} />}
                  {preset.name}
                </button>
              );
            })}
          </div>
          {billRows.length > 0 && (
            <div className="obRows">
              {billRows.map((row) => (
                <div className="obRow" key={row.id}>
                  <input
                    value={row.name}
                    aria-label="Bill name"
                    onChange={(event) =>
                      setBillRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, name: event.target.value } : r)))
                    }
                  />
                  <label className="obAmount">
                    <span>{symbol}</span>
                    <input
                      value={row.amount}
                      inputMode="decimal"
                      aria-label={`${row.name} monthly amount`}
                      placeholder="0"
                      onChange={(event) =>
                        setBillRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, amount: event.target.value } : r)))
                      }
                    />
                  </label>
                  <button
                    className="obRemove"
                    type="button"
                    aria-label={`Remove ${row.name}`}
                    onClick={() => setBillRows((rows) => rows.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            className="obAddAnother"
            type="button"
            onClick={() => setBillRows((rows) => [...rows, { id: nextId(), name: "", amount: "", category: "Bills" }])}
          >
            <Plus size={14} />
            Add something else
          </button>
        </StepFrame>
      )}

      {step === 2 && (
        <StepFrame
          title="Where does your money live?"
          lede="Add rough balances to see your net worth. Credit cards count the amount you owe."
        >
          <div className="obChips" role="group" aria-label="Account types">
            {ACCOUNT_PRESETS.map((preset) => {
              const selected = accountRows.some((row) => row.preset.key === preset.key);
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={selected ? "obChip selected" : "obChip"}
                  aria-pressed={selected}
                  onClick={() => toggleAccountPreset(preset)}
                >
                  {selected ? <Check size={13} /> : preset.accountClass === "debt" ? <CreditCard size={13} /> : <PiggyBank size={13} />}
                  {preset.label}
                </button>
              );
            })}
          </div>
          {accountRows.length > 0 && (
            <div className="obRows">
              {accountRows.map((row) => (
                <div className="obRow" key={row.id}>
                  <div className="obRowLabel">
                    <strong>{row.preset.label}</strong>
                    <em>{row.preset.hint}</em>
                  </div>
                  <label className="obAmount">
                    <span>{symbol}</span>
                    <input
                      value={row.balance}
                      inputMode="decimal"
                      aria-label={`${row.preset.label} balance`}
                      placeholder="0"
                      onChange={(event) =>
                        setAccountRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, balance: event.target.value } : r)))
                      }
                    />
                  </label>
                  <button
                    className="obRemove"
                    type="button"
                    aria-label={`Remove ${row.preset.label}`}
                    onClick={() => setAccountRows((rows) => rows.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </StepFrame>
      )}

      {step === 3 && (
        <StepFrame
          title="Saving for something?"
          lede="A holiday, an emergency fund, a deposit — the app will work out when you'll get there from your monthly surplus."
        >
          <div className="obRows">
            <div className="obRow">
              <input
                value={goalName}
                aria-label="Goal name"
                placeholder="e.g. Emergency fund"
                onChange={(event) => setGoalName(event.target.value)}
              />
              <label className="obAmount">
                <span>{symbol}</span>
                <input
                  value={goalTarget}
                  inputMode="decimal"
                  aria-label="Goal target amount"
                  placeholder="Target"
                  onChange={(event) => setGoalTarget(event.target.value)}
                />
              </label>
            </div>
            <div className="obRow obRowSub">
              <span className="obRowNote">Already saved towards it (optional)</span>
              <label className="obAmount">
                <span>{symbol}</span>
                <input
                  value={goalSaved}
                  inputMode="decimal"
                  aria-label="Amount already saved"
                  placeholder="0"
                  onChange={(event) => setGoalSaved(event.target.value)}
                />
              </label>
            </div>
          </div>
        </StepFrame>
      )}

      <div className="obActions">
        {step > 0 ? (
          <button className="obGhost" type="button" onClick={() => setStep((current) => current - 1)}>
            <ArrowLeft size={14} />
            Back
          </button>
        ) : (
          <span />
        )}
        <div className="obActionsRight">
          <button className="obGhost" type="button" onClick={skipStep}>
            Skip this step
          </button>
          <button className="obPrimary" type="button" onClick={goNext}>
            Continue
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </Shell>
  );
}

function summaryLine(result: OnboardingResult): string {
  const parts: string[] = [];
  if (result.incomes.length) parts.push(`${result.incomes.length} income ${result.incomes.length === 1 ? "source" : "sources"}`);
  if (result.expenses.length) parts.push(`${result.expenses.length} regular ${result.expenses.length === 1 ? "bill" : "bills"}`);
  if (result.accounts.length) parts.push(`${result.accounts.length} ${result.accounts.length === 1 ? "account" : "accounts"}`);
  if (result.goal) parts.push("a savings goal");
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
  return `We've added ${joined}. Your dashboard, forecasts and insights are already using them — refine anything later in the Ledger.`;
}

function Shell({
  children,
  progress,
  onClose,
  closeLabel,
}: {
  children: ReactNode;
  progress?: ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="onboardingBackdrop" role="dialog" aria-modal="true" aria-label="First-time setup">
      <div className="onboardingCard">
        <div className="obTopBar">
          {progress ?? <span />}
          <button className="obClose" type="button" onClick={onClose} aria-label={closeLabel} data-tip={closeLabel}>
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StepFrame({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <div className="obStep">
      <h2>{title}</h2>
      <p className="obLede">{lede}</p>
      {children}
    </div>
  );
}
