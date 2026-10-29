import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Info,
  Repeat,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  CADENCE_LABEL,
  CADENCE_SHORT,
  DEFAULT_TOLERANCE_DAYS,
  TOLERANCE_OPTIONS,
  formatDate,
  formatShortDate,
  type Subscription,
  type SubscriptionKind,
  type SubscriptionReport,
} from "./subscriptions";
import { EmptyState } from "./ui";

// The Subscriptions page: everything the ledger shows being paid for repeatedly, what it costs a
// year, what went up, what is due, what stopped — and the user's say over all of it.

type Tab = "subscriptions" | "bills" | "cancelled";

export interface SubscriptionsViewProps {
  report: SubscriptionReport;
  // Whole units for totals; the precise one keeps the pence, for prices.
  formatter: Intl.NumberFormat;
  preciseFormatter: Intl.NumberFormat;
  privacy: boolean;
  t?: (text: string) => string;
  onCancel: (subscription: Subscription, cancelledAt: string) => void;
  onReactivate: (subscription: Subscription) => void;
  onDelete: (subscription: Subscription) => void;
  // "Yes, track it" on a possible subscription (one only seen twice).
  onConfirm: (subscription: Subscription) => void;
  onRestoreDeleted: () => void;
  onSetKind: (subscription: Subscription, kind: SubscriptionKind | null) => void;
  onSetTolerance: (subscription: Subscription, days: number | null) => void;
  onMarkRecurring: (subscription: Subscription) => void;
  onOpenLedger: (monthKey: string) => void;
  onImport: () => void;
}

export function SubscriptionsView({
  report,
  formatter,
  preciseFormatter,
  privacy,
  t = (text) => text,
  onCancel,
  onReactivate,
  onDelete,
  onConfirm,
  onRestoreDeleted,
  onSetKind,
  onSetTolerance,
  onMarkRecurring,
  onOpenLedger,
  onImport,
}: SubscriptionsViewProps) {
  const [tab, setTab] = useState<Tab>("subscriptions");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Set by "View" on an alert: once the row is on screen (possibly on another tab), scroll to it.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const masked = privacy ? "masked" : "";

  const rows = tab === "subscriptions" ? report.subscriptions : tab === "bills" ? report.bills : report.cancelled;
  const nothingAtAll = !report.subscriptions.length && !report.bills.length && !report.cancelled.length;

  // First visit with no subscriptions but some bills: open on the tab that has something to show.
  useEffect(() => {
    if (!report.subscriptions.length && report.bills.length) setTab((current) => (current === "subscriptions" ? "bills" : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alerts = useMemo(() => buildAlerts(report, preciseFormatter, t), [report, preciseFormatter, t]);

  useEffect(() => {
    if (!scrollTarget) return;
    const element = document.getElementById(`subscription-${cssId(scrollTarget)}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollTarget(null);
  }, [scrollTarget, tab, openId]);

  function jumpTo(subscription: Subscription) {
    const target: Tab = subscription.status === "cancelled" || subscription.status === "stopped" ? "cancelled" : subscription.kind === "bill" ? "bills" : "subscriptions";
    setTab(target);
    setOpenId(subscription.id);
    setScrollTarget(subscription.id);
  }

  return (
    <section className="viewStack subscriptionsView" aria-label="Subscriptions">
      <div className="pageHeader compactHeader">
        <div>
          <h2>Subscriptions</h2>
          <p>{t("Everything you pay for repeatedly — what it costs a year, what went up, what is due, and what has stopped.")}</p>
        </div>
        <div className="pageHeaderSide">
          {report.dataEnd && (
            <span className="subsAsOf" title={t("Detected locally from your own ledger. Nothing leaves this device.")}>
              <Clock3 size={13} />
              Transactions up to {formatDate(report.dataEnd)}
            </span>
          )}
        </div>
      </div>

      {nothingAtAll ? (
        <article className="panel subsEmptyPanel">
          <EmptyState
            icon={<Repeat size={18} />}
            title={t("No repeating payments found yet")}
            text={t("Import a few months of bank statements, or add your regular bills to the ledger, and every subscription, bill and renewal shows up here automatically.")}
            onAction={onImport}
          />
        </article>
      ) : (
        <>
          <div className="summaryStrip subsSummary">
            <article className="metricCard amber">
              <span>{t("Subscriptions per year")}</span>
              <strong className={masked}>{formatter.format(report.totals.subscriptionsYearly)}</strong>
              <small className={masked}>
                {report.subscriptions.length} active · {formatter.format(report.totals.subscriptionsYearly / 12)} a month
              </small>
            </article>
            <article className="metricCard amber">
              <span>{t("Bills & regular payments per year")}</span>
              <strong className={masked}>{formatter.format(report.totals.billsYearly)}</strong>
              <small className={masked}>
                {report.bills.length} active · {formatter.format(report.totals.billsYearly / 12)} a month
              </small>
            </article>
            <article className={`metricCard ${report.totals.increasesCount ? "red" : "green"}`}>
              <span>{t("Price rises, last 12 months")}</span>
              <strong className={masked}>{report.totals.increasesCount ? `+${formatter.format(report.totals.increasesYearlyImpact)}` : formatter.format(0)}</strong>
              <small>{report.totals.increasesCount ? `${report.totals.increasesCount} ${report.totals.increasesCount === 1 ? "subscription" : "subscriptions"} went up · extra per year` : t("Nothing has gone up")}</small>
            </article>
            <article className="metricCard green">
              <span>{t("Cancelled or stopped")}</span>
              <strong className={masked}>{formatter.format(report.totals.cancelledYearlySaving)}</strong>
              <small>{report.cancelled.length ? `${report.cancelled.length} no longer paid · saved per year` : t("Nothing cancelled yet")}</small>
            </article>
          </div>

          {(alerts.length > 0 || report.dataStale) && (
            <article className="panel subsAlerts" aria-label="Needs attention">
              <div className="sectionHeading">
                <div>
                  <h2>{t("Needs a look")}</h2>
                  <p>{t("Price rises, renewals coming up, payments not seen, and charges after cancelling.")}</p>
                </div>
              </div>
              <div className="subsAlertList">
                {report.dataStale && report.dataEnd && (
                  <div className="subsAlert info">
                    <Info size={15} />
                    <div>
                      <strong>{t("Your ledger stops at")} {formatDate(report.dataEnd)}</strong>
                      <span>{t("Import recent statements to keep renewals and missed payments accurate. Until then, nothing is judged against today's date.")}</span>
                    </div>
                    <button className="commandButton" type="button" onClick={onImport}>
                      <Upload size={13} />
                      {t("Import")}
                    </button>
                  </div>
                )}
                {alerts.map((alert) => (
                  <div className={`subsAlert ${alert.tone}`} key={alert.id}>
                    {alert.icon}
                    <div>
                      <strong className={alert.sensitive ? masked : ""}>{alert.title}</strong>
                      <span className={alert.sensitive ? masked : ""}>{alert.detail}</span>
                    </div>
                    <button className="commandButton" type="button" onClick={() => jumpTo(alert.subscription)}>
                      {t("View")}
                    </button>
                  </div>
                ))}
              </div>
            </article>
          )}

          {report.possible.length > 0 && (
            <article className="miniPanel subsPossible" aria-label="Possible subscriptions">
              <div className="subsPossibleHead">
                <h3>{t("Possibly subscriptions?")}</h3>
                <p>{t("Each has only been paid twice, so it could be a coincidence. They are not in your totals until you say yes.")}</p>
              </div>
              <ul>
                {report.possible.map((subscription) => (
                  <li key={subscription.id}>
                    <div className="subsPossibleText">
                      <strong>{subscription.label}</strong>
                      <small>
                        {CADENCE_LABEL[subscription.cadence]} · <span className={masked}>{preciseFormatter.format(subscription.currentPrice)}</span> · {t("paid")}{" "}
                        {subscription.payments.map((payment) => formatShortDate(payment.date)).join(t(" and "))}
                      </small>
                    </div>
                    <button className="commandButton subsPossibleYes" type="button" onClick={() => onConfirm(subscription)} aria-label={`${subscription.label} is a subscription — track it`}>
                      <Check size={14} />
                      {t("Yes, track it")}
                    </button>
                    <button className="commandButton" type="button" onClick={() => onDelete(subscription)} aria-label={`${subscription.label} is not a subscription`}>
                      {t("No")}
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          )}

          <article className="panel subsListPanel">
            <div className="sectionHeading subsListHeading">
              <div className="tabs" role="tablist" aria-label="Subscription lists">
                <button className={tab === "subscriptions" ? "selected" : ""} type="button" role="tab" aria-selected={tab === "subscriptions"} onClick={() => setTab("subscriptions")}>
                  {t("Subscriptions")} <b>{report.subscriptions.length}</b>
                </button>
                <button className={tab === "bills" ? "selected" : ""} type="button" role="tab" aria-selected={tab === "bills"} onClick={() => setTab("bills")}>
                  {t("Bills & regular payments")} <b>{report.bills.length}</b>
                </button>
                <button className={tab === "cancelled" ? "selected" : ""} type="button" role="tab" aria-selected={tab === "cancelled"} onClick={() => setTab("cancelled")}>
                  {t("Cancelled")} <b>{report.cancelled.length}</b>
                </button>
              </div>
              <p className="subsListTotal">
                {tab === "cancelled" ? (
                  <>
                    {t("No longer costing")} <strong className={masked}>{formatter.format(report.totals.cancelledYearlySaving)}</strong> {t("a year")}
                  </>
                ) : (
                  <>
                    <strong className={masked}>{formatter.format(tab === "bills" ? report.totals.billsYearly : report.totals.subscriptionsYearly)}</strong> {t("a year")} ·{" "}
                    <strong className={masked}>{formatter.format((tab === "bills" ? report.totals.billsYearly : report.totals.subscriptionsYearly) / 12)}</strong> {t("a month")}
                  </>
                )}
              </p>
            </div>

            {rows.length ? (
              <div className="subsList" role="list">
                {rows.map((subscription) => (
                  <SubscriptionRow
                    key={subscription.id}
                    subscription={subscription}
                    report={report}
                    open={openId === subscription.id}
                    onToggle={() => setOpenId((current) => (current === subscription.id ? null : subscription.id))}
                    preciseFormatter={preciseFormatter}
                    privacy={privacy}
                    t={t}
                    confirmDelete={confirmDelete === subscription.id}
                    onAskDelete={() => setConfirmDelete(subscription.id)}
                    onCancelDelete={() => setConfirmDelete(null)}
                    onDelete={() => {
                      setConfirmDelete(null);
                      onDelete(subscription);
                    }}
                    onCancel={() => onCancel(subscription, subscription.status === "stopped" ? subscription.lastSeen : report.today)}
                    onReactivate={() => onReactivate(subscription)}
                    onSetKind={(kind) => onSetKind(subscription, kind)}
                    onSetTolerance={(days) => onSetTolerance(subscription, days)}
                    onMarkRecurring={() => onMarkRecurring(subscription)}
                    onOpenLedger={onOpenLedger}
                  />
                ))}
              </div>
            ) : (
              <p className="subsListEmpty">
                {tab === "subscriptions"
                  ? t("No subscriptions detected. Streaming, software, memberships and the like appear here once they have been paid a few times.")
                  : tab === "bills"
                    ? t("No regular bills detected yet. Rent, utilities, insurance and other repeating payments appear here.")
                    : t("Nothing cancelled. Subscriptions you mark cancelled, and ones that simply stop being paid, are kept here.")}
              </p>
            )}

            {report.deletedCount > 0 && tab === "cancelled" && (
              <p className="subsDeletedNote">
                {report.deletedCount} {report.deletedCount === 1 ? t("subscription was") : t("subscriptions were")} {t("removed from this page")} ·{" "}
                <button className="inlineLinkBtn" type="button" onClick={onRestoreDeleted}>
                  <RotateCcw size={11} /> {t("Restore")}
                </button>
              </p>
            )}
          </article>

          <p className="subsFootnote">
            <Info size={13} />
            {t(
              "Detected from your own ledger, on this device: the same payee on a steady cadence. Weekly, 4-weekly (13 a year), monthly, quarterly and yearly cycles are recognised; a few days' drift for weekends and bank holidays is allowed. Amounts billed in another currency wobble with the exchange rate and are not treated as price changes.",
            )}
          </p>
        </>
      )}
    </section>
  );
}

// ─── Widget (Dashboard) ──────────────────────────────────────────────────────
// A glance at the same report: yearly and monthly totals, what needs a look, and the biggest
// items. Everything in it leads to the Subscriptions page.

export function SubscriptionsWidget({
  report,
  formatter,
  preciseFormatter,
  privacy,
  t = (text) => text,
  onOpen,
}: {
  report: SubscriptionReport;
  formatter: Intl.NumberFormat;
  preciseFormatter: Intl.NumberFormat;
  privacy: boolean;
  t?: (text: string) => string;
  onOpen: () => void;
}) {
  const masked = privacy ? "masked" : "";
  // Subscriptions first (each list already runs from dearest to cheapest), then bills.
  const live = [...report.subscriptions, ...report.bills];
  const alerts = buildAlerts(report, preciseFormatter, t).slice(0, 3);
  const nothing = !live.length && !report.cancelled.length;

  return (
    <article className="miniPanel subscriptionsPanel subsWidget" aria-label="Subscriptions">
      <PanelTitleLink title={t("Subscriptions & regular payments")} onOpen={onOpen} t={t} />
      {nothing ? (
        <EmptyState
          icon={<Repeat size={18} />}
          title={t("No repeating payments detected yet")}
          text={t("Import a few months of transactions and every subscription, bill and renewal shows up here automatically.")}
          onAction={onOpen}
        />
      ) : (
        <>
          <div className="debtMiniGrid subsWidgetStats">
            <div>
              <span>{t("Per year")}</span>
              <strong className={masked}>{formatter.format(report.totals.yearly)}</strong>
            </div>
            <div>
              <span>{t("Per month")}</span>
              <strong className={masked}>{formatter.format(report.totals.monthly)}</strong>
            </div>
            <div>
              <span>{t("Subscriptions")}</span>
              <strong className={masked}>{formatter.format(report.totals.subscriptionsYearly)}</strong>
            </div>
            <div className={report.totals.increasesCount ? "alert" : ""}>
              <span>{t("Price rises")}</span>
              <strong className={masked}>{report.totals.increasesCount ? `+${formatter.format(report.totals.increasesYearlyImpact)}/yr` : t("None")}</strong>
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="subsWidgetAlerts">
              {alerts.map((alert) => (
                <button className={`subsWidgetAlert ${alert.tone}`} type="button" key={alert.id} onClick={onOpen}>
                  {alert.icon}
                  <span className={alert.sensitive ? masked : ""}>{alert.title}</span>
                </button>
              ))}
            </div>
          )}
          <div className="subscriptionList">
            {live.slice(0, 6).map((subscription) => {
              const badge = rowBadges(subscription, report, t)[0];
              return (
                <button className="subscriptionRow subsWidgetRow" type="button" key={subscription.id} onClick={onOpen}>
                  <span className="swatch small" style={{ background: subscription.color }} />
                  <span className="subscriptionName">
                    <strong>{subscription.label}</strong>
                    <em>
                      {CADENCE_LABEL[subscription.cadence]}
                      {subscription.category ? ` · ${subscription.category}` : ""}
                      {subscription.status === "due" ? ` · ${t("not seen yet")}` : ""}
                    </em>
                  </span>
                  {badge && <span className={`subsBadge ${badge.tone}`}>{badge.label}</span>}
                  <strong className={masked}>
                    {preciseFormatter.format(subscription.currentPrice)}/{CADENCE_SHORT[subscription.cadence]}
                  </strong>
                  <em className={`subsWidgetYear ${masked}`}>{formatter.format(subscription.yearlyCost)}/yr</em>
                </button>
              );
            })}
          </div>
          <button className="quietButton subsWidgetMore" type="button" onClick={onOpen}>
            {t("View all")} {live.length} {live.length === 1 ? t("payment") : t("payments")}
            {report.cancelled.length ? ` · ${report.cancelled.length} ${t("cancelled")}` : ""}
            <ChevronRight size={14} />
          </button>
        </>
      )}
    </article>
  );
}

function PanelTitleLink({ title, onOpen, t }: { title: string; onOpen: () => void; t: (text: string) => string }) {
  return (
    <div className="panelTitle">
      <h3>{title}</h3>
      <div className="panelTitleActions">
        <button className="inlineLinkBtn subsWidgetOpen" type="button" onClick={onOpen}>
          {t("Open")} <ChevronRight size={12} />
        </button>
        <Repeat size={16} />
      </div>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function SubscriptionRow({
  subscription,
  report,
  open,
  onToggle,
  preciseFormatter,
  privacy,
  t,
  confirmDelete,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onCancel,
  onReactivate,
  onSetKind,
  onSetTolerance,
  onMarkRecurring,
  onOpenLedger,
}: {
  subscription: Subscription;
  report: SubscriptionReport;
  open: boolean;
  onToggle: () => void;
  preciseFormatter: Intl.NumberFormat;
  privacy: boolean;
  t: (text: string) => string;
  confirmDelete: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onReactivate: () => void;
  onSetKind: (kind: SubscriptionKind | null) => void;
  onSetTolerance: (days: number | null) => void;
  onMarkRecurring: () => void;
  onOpenLedger: (monthKey: string) => void;
}) {
  const masked = privacy ? "masked" : "";
  const live = subscription.status === "active" || subscription.status === "due";
  const badges = rowBadges(subscription, report, t);
  const perCycle = `${preciseFormatter.format(subscription.currentPrice)}/${CADENCE_SHORT[subscription.cadence]}`;
  const history = [...subscription.payments].reverse().slice(0, 12);
  const changeByDate = new Map(subscription.priceChanges.map((change) => [change.date, change]));
  const defaultTolerance = DEFAULT_TOLERANCE_DAYS[subscription.cadence];

  return (
    <div className={`subsRow ${open ? "open" : ""} status-${subscription.status}`} role="listitem" id={`subscription-${cssId(subscription.id)}`}>
      <button className="subsRowMain" type="button" onClick={onToggle} aria-expanded={open}>
        <span className="swatch small" style={{ background: subscription.color }} />
        <span className="subsRowName">
          <strong>{subscription.label}</strong>
          <em>
            {CADENCE_LABEL[subscription.cadence]}
            {subscription.scheduleHint ? ` · ${subscription.scheduleHint}` : ""}
            {subscription.category ? ` · ${subscription.category}` : ""}
            {subscription.siblings > 0 ? ` · ${t("one of")} ${subscription.siblings + 1} ${t("to this payee")}` : ""}
          </em>
        </span>
        <span className="subsRowBadges">
          {badges.map((badge) => (
            <span className={`subsBadge ${badge.tone}`} key={badge.label}>
              {badge.icon}
              {badge.label}
            </span>
          ))}
        </span>
        <span className="subsRowPrice">
          <strong className={masked}>{subscription.amountPattern === "variable" ? `~${perCycle}` : perCycle}</strong>
          <em>{live ? subscription.statusDetail : subscription.status === "cancelled" ? `${t("Cancelled")} ${formatShortDate(subscription.cancelledAt ?? subscription.lastSeen)}` : `${t("Last paid")} ${formatShortDate(subscription.lastSeen)}`}</em>
        </span>
        <span className="subsRowYear">
          <strong className={masked}>{preciseFormatter.format(subscription.yearlyCost)}</strong>
          <em>{live ? t("per year") : t("a year, no longer paid")}</em>
        </span>
        <span className="subsRowChevron">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>

      {open && (
        <div className="subsDetail">
          <div className="subsDetailHistory">
            <h4>{t("Payments")}</h4>
            {history.length ? (
              <ul className="subsHistory">
                {history.map((payment) => {
                  const change = changeByDate.get(payment.date);
                  const afterCancel = subscription.cancelledAt ? payment.date > subscription.cancelledAt : false;
                  return (
                    <li key={`${payment.monthKey}:${payment.entryId}`} className={afterCancel ? "afterCancel" : ""}>
                      <button className="subsHistoryDate" type="button" onClick={() => onOpenLedger(payment.monthKey)} title={t("Open this month in the ledger")}>
                        {payment.dated ? formatDate(payment.date) : `${formatShortDate(payment.date).replace(/^\d+ /, "")} ${payment.date.slice(0, 4)}`}
                      </button>
                      <span className={masked}>{preciseFormatter.format(payment.amount)}</span>
                      {change && (
                        <em className={change.to > change.from ? "up" : "down"}>
                          {change.to > change.from ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {formatPercent(change.percent)}
                          {!change.confirmed ? ` · ${t("first time at this price")}` : ""}
                        </em>
                      )}
                      {afterCancel && <em className="up">{t("after cancelling")}</em>}
                    </li>
                  );
                })}
                {subscription.payments.length > history.length && <li className="subsHistoryMore">{subscription.payments.length - history.length} {t("earlier payments")}</li>}
              </ul>
            ) : (
              <p className="subsMuted">{t("No payments in the ledger any more.")}</p>
            )}
          </div>

          <div className="subsDetailFacts">
            <h4>{t("Details")}</h4>
            <dl className="subsFacts">
              <div>
                <dt>{t("Status")}</dt>
                <dd>{live ? (subscription.status === "due" ? subscription.statusDetail : t("Active")) : subscription.statusDetail}</dd>
              </div>
              {subscription.nextExpected && live && (
                <div>
                  <dt>{t("Next expected")}</dt>
                  <dd>
                    {formatDate(subscription.nextExpected)}
                    {subscription.daysUntilNext !== null && subscription.daysUntilNext > 0
                      ? ` · ${t("in")} ${subscription.daysUntilNext} ${subscription.daysUntilNext === 1 ? t("day") : t("days")}`
                      : subscription.daysUntilNext !== null && subscription.daysUntilNext <= 0
                        ? ` · ${t("due now")}`
                        : ""}
                  </dd>
                </div>
              )}
              {subscription.occurrences > 0 && (
                <div>
                  <dt>{t("Seen")}</dt>
                  <dd>
                    {subscription.occurrences}× {t("since")} {formatDate(subscription.firstSeen)}
                    {subscription.missedCycles > 0 ? ` · ${subscription.missedCycles} ${t("missing")}` : ""}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t("Amount")}</dt>
                <dd className={masked}>
                  {subscription.amountPattern === "fixed"
                    ? t("Fixed price")
                    : subscription.amountPattern === "fluctuating"
                      ? `${t("Wobbles slightly")} (${preciseFormatter.format(subscription.amountRange.min)}–${preciseFormatter.format(subscription.amountRange.max)})`
                      : `${t("Varies")} (${preciseFormatter.format(subscription.amountRange.min)}–${preciseFormatter.format(subscription.amountRange.max)})`}
                </dd>
              </div>
              {subscription.priceChanges.length > 0 && (
                <div>
                  <dt>{t("Price history")}</dt>
                  <dd className={masked}>
                    {[subscription.priceChanges[0].from, ...subscription.priceChanges.map((change) => change.to)].map((price) => preciseFormatter.format(price)).join(" → ")}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t("Counted as")}</dt>
                <dd>
                  <div className="subsChoice" role="group" aria-label="Counted as">
                    <button type="button" className={subscription.kind === "subscription" ? "selected" : ""} onClick={() => onSetKind(subscription.kind === "subscription" ? null : "subscription")}>
                      {t("Subscription")}
                    </button>
                    <button type="button" className={subscription.kind === "bill" ? "selected" : ""} onClick={() => onSetKind(subscription.kind === "bill" ? null : "bill")}>
                      {t("Bill")}
                    </button>
                  </div>
                </dd>
              </div>
              <div>
                <dt>{t("On-time window")}</dt>
                <dd>
                  <label className="subsToleranceField">
                    <select
                      value={subscription.toleranceSource === "user" ? String(subscription.toleranceDays) : "auto"}
                      onChange={(event) => onSetTolerance(event.target.value === "auto" ? null : Number(event.target.value))}
                      aria-label={t("Days early or late a payment may land")}
                    >
                      <option value="auto">
                        {t("Automatic")} (±{defaultTolerance} {t("days")})
                      </option>
                      {TOLERANCE_OPTIONS.map((days) => (
                        <option value={days} key={days}>
                          ±{days} {t("days")}
                        </option>
                      ))}
                    </select>
                    <span>{t("for weekends and bank holidays")}</span>
                  </label>
                </dd>
              </div>
            </dl>
            {subscription.notes.length > 0 && (
              <ul className="subsNotes">
                {subscription.notes.map((note) => (
                  <li key={note}>{t(note)}</li>
                ))}
              </ul>
            )}

            <div className="subsActions">
              {live && (
                <>
                  <button className="commandButton" type="button" onClick={onCancel}>
                    <Ban size={13} />
                    {t("Mark cancelled")}
                  </button>
                  {!subscription.alreadyRecurring && subscription.entryRefs.length > 0 && (
                    <button className="commandButton" type="button" onClick={onMarkRecurring} title={t("Flag its ledger entries as recurring so they feed the forecast and copy into new months")}>
                      <Repeat size={13} />
                      {t("Mark recurring")}
                    </button>
                  )}
                </>
              )}
              {subscription.status === "stopped" && (
                <button className="commandButton" type="button" onClick={onCancel}>
                  <CheckCircle2 size={13} />
                  {t("Yes, cancelled")}
                </button>
              )}
              {subscription.status === "cancelled" && (
                <button className="commandButton" type="button" onClick={onReactivate}>
                  <RotateCcw size={13} />
                  {t("Still active")}
                </button>
              )}
              {confirmDelete ? (
                <span className="subsConfirm">
                  <span>{live ? t("Remove from this page?") : t("Delete for good?")}</span>
                  <button className="dangerButton" type="button" onClick={onDelete}>
                    {t("Remove")}
                  </button>
                  <button className="quietButton" type="button" onClick={onCancelDelete}>
                    {t("Keep")}
                  </button>
                </span>
              ) : (
                <button className="quietButton subsRemove" type="button" onClick={onAskDelete} title={live ? t("Not a subscription — hide it from this page") : t("Delete from the cancelled list")}>
                  <Trash2 size={13} />
                  {live ? t("Not a subscription") : t("Delete")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Badges & alerts ─────────────────────────────────────────────────────────

type Badge = { label: string; tone: "red" | "amber" | "mint" | "blue" | "muted"; icon?: React.ReactNode };

function rowBadges(subscription: Subscription, report: SubscriptionReport, t: (text: string) => string): Badge[] {
  const badges: Badge[] = [];
  const yearAgo = shiftYear(report.today);
  if (subscription.flaggedIncrease && subscription.flaggedIncrease.date >= yearAgo) {
    badges.push({
      label: subscription.flaggedIncrease.confirmed ? `${t("Price up")} ${formatPercent(subscription.flaggedIncrease.percent)}` : `${t("Price up?")} ${formatPercent(subscription.flaggedIncrease.percent)}`,
      tone: subscription.flaggedIncrease.confirmed ? "red" : "amber",
      icon: <ArrowUpRight size={12} />,
    });
  } else if (subscription.latestChange && subscription.latestChange.to < subscription.latestChange.from && subscription.latestChange.date >= yearAgo) {
    badges.push({ label: `${t("Price down")} ${formatPercent(subscription.latestChange.percent)}`, tone: "mint", icon: <ArrowDownRight size={12} /> });
  }
  if (subscription.status === "due") badges.push({ label: t("Not seen yet"), tone: "amber", icon: <Clock3 size={12} /> });
  if (subscription.status === "active" && subscription.cyclesPerYear <= 4 && subscription.daysUntilNext !== null && subscription.daysUntilNext <= 30) {
    badges.push({ label: subscription.daysUntilNext <= 0 ? t("Renews now") : `${t("Renews in")} ${subscription.daysUntilNext}d`, tone: "blue", icon: <CalendarClock size={12} /> });
  }
  if (subscription.chargedAfterCancel.length) badges.push({ label: t("Charged after cancelling"), tone: "red", icon: <AlertTriangle size={12} /> });
  if (subscription.status === "stopped") badges.push({ label: t("Stopped"), tone: "muted" });
  if (subscription.amountPattern === "variable") badges.push({ label: t("Varies"), tone: "muted" });
  return badges;
}

type Alert = { id: string; tone: "danger" | "warning" | "info" | "good"; icon: React.ReactNode; title: string; detail: string; sensitive: boolean; subscription: Subscription };

function buildAlerts(report: SubscriptionReport, formatter: Intl.NumberFormat, t: (text: string) => string): Alert[] {
  const alerts: Alert[] = [];
  const yearAgo = shiftYear(report.today);
  for (const subscription of report.totals.chargedAfterCancel) {
    const latest = subscription.chargedAfterCancel[subscription.chargedAfterCancel.length - 1];
    alerts.push({
      id: `after-${subscription.id}`,
      tone: "danger",
      icon: <AlertTriangle size={15} />,
      title: `${subscription.label} ${t("charged")} ${formatter.format(latest.amount)} ${t("on")} ${formatShortDate(latest.date)}`,
      detail: `${t("You marked it cancelled on")} ${formatDate(subscription.cancelledAt ?? latest.date)}. ${t("Worth checking the cancellation went through.")}`,
      sensitive: true,
      subscription,
    });
  }
  for (const subscription of [...report.subscriptions, ...report.bills]) {
    const change = subscription.flaggedIncrease;
    if (!change || change.date < yearAgo) continue;
    alerts.push({
      id: `rise-${subscription.id}`,
      tone: change.confirmed ? "warning" : "info",
      icon: <ArrowUpRight size={15} />,
      title: `${subscription.label} ${t("went up")} ${formatter.format(change.from)} → ${formatter.format(change.to)} (${formatPercent(change.percent)})`,
      detail: `${t("From")} ${formatDate(change.date)} · ${t("an extra")} ${formatter.format(change.yearlyImpact)} ${t("a year")}${change.confirmed ? "" : ` · ${t("seen once so far — could be a one-off")}`}`,
      sensitive: true,
      subscription,
    });
  }
  for (const subscription of report.totals.renewalsSoon) {
    alerts.push({
      id: `renew-${subscription.id}`,
      tone: "info",
      icon: <CalendarClock size={15} />,
      title: `${subscription.label} ${t("renews")} ${subscription.daysUntilNext !== null && subscription.daysUntilNext <= 0 ? t("now") : `${t("in")} ${subscription.daysUntilNext} ${t("days")}`}`,
      detail: `${formatter.format(subscription.currentPrice)} ${t("expected around")} ${formatDate(subscription.nextExpected ?? report.today)} · ${CADENCE_LABEL[subscription.cadence].toLowerCase()}`,
      sensitive: true,
      subscription,
    });
  }
  for (const subscription of report.cancelled) {
    // Only recently stopped ones: after a few months the user has surely noticed.
    if (subscription.status !== "stopped" || daysBetween(subscription.lastSeen, report.today) > 120) continue;
    alerts.push({
      id: `stopped-${subscription.id}`,
      tone: "good",
      icon: <CheckCircle2 size={15} />,
      title: `${subscription.label} ${t("looks cancelled")}`,
      detail: `${t("No payment since")} ${formatDate(subscription.lastSeen)} · ${t("saving")} ${formatter.format(subscription.yearlyCost)} ${t("a year")}. ${t("Confirm it on the Cancelled tab, or it stays there as detected.")}`,
      sensitive: true,
      subscription,
    });
  }
  for (const subscription of [...report.subscriptions, ...report.bills]) {
    if (subscription.status !== "due") continue;
    alerts.push({
      id: `due-${subscription.id}`,
      tone: "info",
      icon: <Clock3 size={15} />,
      title: `${subscription.label} ${t("not seen this cycle")}`,
      detail: `${t("Usually lands")} ${subscription.scheduleHint} · ${t("expected")} ${formatDate(subscription.nextExpected ?? report.today)}. ${t("If you cancelled it, mark it cancelled.")}`,
      sensitive: false,
      subscription,
    });
  }
  return alerts.slice(0, 8);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatPercent(percent: number): string {
  const rounded = Math.abs(percent) >= 10 ? Math.round(percent) : Number(percent.toFixed(1));
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function shiftYear(iso: string): string {
  return `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
}

function cssId(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, "-");
}
