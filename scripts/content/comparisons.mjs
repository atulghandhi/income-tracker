// Honest comparison pages. Every page says where the other product wins.
// Facts were checked on `checked` against the sources listed; prices are the
// UK list prices seen on that date. Closed products get an "alternative" page
// because people still search for them.
//
// Row shape: [feature, The Income Tracker, competitor].

const US_ROWS_COMMON = {
  price: ["Price", "Free. No tiers, no trial clock.", null],
  bank: ["Bank connection", "None needed. Import a CSV you download yourself; open banking is opt-in and off by default.", null],
  csv: ["Manual entry and CSV import", "Yes, free. CSV, OFX, QIF and pasted text.", null],
  data: ["Where your data lives", "In your browser on your device. Optional sign-in to sync.", null],
  platforms: ["Platforms", "Web, installable on phone and desktop. iOS app in development.", null],
};

function rows(spec) {
  return spec.map(([key, them, usOverride]) => {
    const base = US_ROWS_COMMON[key];
    if (base) return [base[0], usOverride || base[1], them];
    return [key, usOverride, them];
  });
}

const CHECKED = "2026-09-08";

export const COMPARISONS = [
  {
    slug: "emma-alternative",
    name: "Emma",
    card: "vs Emma",
    cardD: "Emma's polish and feeds, or free CSV import",
    crumb: "vs Emma",
    title: "Emma vs The Income Tracker: free, and no bank login",
    description:
      "Emma's tiers cost £4.99 to £14.99 a month and lock CSV import behind Pro. The Income Tracker is free, needs no bank connection and keeps data in your browser.",
    h1: "The Income Tracker vs Emma",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "Emma is the slicker app, with automatic bank feeds, strong subscription detection and a free tier that connects two accounts. The Income Tracker is free with no tiers, never asks for a bank login, and imports CSV files for nothing, which Emma only allows on its £9.99-a-month Pro plan and above. Pick on that trade.",
    rows: rows([
      ["price", "Free tier; Plus £4.99, Pro £9.99, Ultimate £14.99 a month (about 30% less paid yearly)"],
      ["bank", "Built around open banking. Free tier connects 2 accounts, Plus 4, Pro and Ultimate unlimited."],
      ["csv", "Offline accounts, manual transactions and CSV import only on Pro and Ultimate."],
      ["data", "On Emma's servers, pulled from your banks."],
      ["platforms", "iOS, Android; web app in beta for paying customers."],
      ["Subscription and bill detection", "Yes, one of its strengths.", "Recurring payments detected on import and seeded into the next month."],
      ["Categorisation", "Automatic from the feed, custom categories on paid tiers.", "Rules that remember each merchant; built-in rules for common cases; optional AI for the leftovers."],
    ]),
    pickThem: [
      "You want your accounts to update themselves every day without lifting a finger.",
      "You like the analytics, the bill-switching prompts and a polished mobile app.",
      "Two connected accounts on the free tier is enough for you.",
    ],
    pickUs: [
      "You do not want to hand any company an open banking connection to your accounts.",
      "You want CSV or manual entry without paying £9.99 a month for the privilege.",
      "You want it free, with nothing to cancel later.",
    ],
    sections: [
      {
        h: "Where Emma genuinely wins",
        p: [
          "Automation. Connect your banks and Emma does the collecting, the categorising and the nagging about bills. Its subscription detection is good and its interface is among the best in the category. If you are happy with open banking and you would rather never export a file, that is a real advantage and we will not pretend otherwise.",
        ],
      },
      {
        h: "Where The Income Tracker wins",
        p: [
          "Control and cost. There is no bank connection to grant, break or renew. You download a CSV once a month, drop it in, and the app does the rest: duplicates skipped, transfers skipped, merchants remembered. It is free for everyone rather than free up to a limit, and the one feature Emma charges Pro prices for, importing your own files, is the default way in.",
        ],
      },
      {
        h: "Moving from Emma",
        p: [
          "You do not need to export anything from Emma. Download a CSV from each bank you had connected, import them, and categorise once. Emma's own CSV export is a paid feature, so the bank route is usually simpler anyway.",
        ],
      },
    ],
    sources: [
      { t: "Emma: how much does Emma Plus, Pro and Ultimate cost", href: "https://help.emma-app.com/en/article/how-much-does-emma-plusproultimate-cost-1ywhulq/" },
      { t: "Emma: compare plans", href: "https://emma-app.com/plans/compare-emma-plans" },
      { t: "Emma: CSV imports (Pro and Ultimate only)", href: "https://help.emma-app.com/en-us/article/csv-imports-pi8hfd/" },
    ],
    faqs: [
      { q: "Is there a free alternative to Emma that does not need open banking?", a: "Yes. The Income Tracker is free and works from a CSV you download from your bank, with no account connection. Emma's core product depends on open banking." },
      { q: "Can I import CSV files into Emma?", a: "Only on the Pro (£9.99 a month) and Ultimate tiers. The Income Tracker imports CSV, OFX, QIF and pasted text for free." },
      { q: "Is Emma free?", a: "Emma has a free tier limited to two bank connections, with paid tiers from £4.99 to £14.99 a month." },
    ],
    related: ["best-free-budgeting-apps-uk", "budget-app-without-open-banking", "import", "snoop-alternative"],
  },
  {
    slug: "snoop-alternative",
    name: "Snoop",
    card: "vs Snoop",
    cardD: "Snoop's money-saving nudges, or a private ledger",
    crumb: "vs Snoop",
    title: "Snoop vs The Income Tracker: budgeting without a bank link",
    description:
      "Snoop is free but does little until you connect a bank, and manual accounts need Snoop Plus at £5.99 a month. The Income Tracker is free, CSV-based and private.",
    h1: "The Income Tracker vs Snoop",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "Snoop is a free open-banking app whose whole value is the nudges it generates from your connected accounts; without a connection it offers only basic tips. The Income Tracker is the opposite shape: no connection, a CSV import, and a ledger you control. Snoop has no web app and no CSV import; we have no automatic feed.",
    rows: rows([
      ["price", "Free; Snoop Plus £5.99 a month or £47.99 a year"],
      ["bank", "Required for anything useful. Snoop's own help: without a connected account you get only basic Snoops and switching services."],
      ["csv", "No CSV import. Manual accounts are balance-only and need Snoop Plus."],
      ["data", "On Snoop's servers, pulled from your banks."],
      ["platforms", "iOS and Android only; no web app."],
      ["Money-saving prompts", "Its core feature: bill and subscription nudges, switching offers.", "A recurring list you review monthly, plus calculators and guides."],
      ["Custom categories and export", "Paid (Snoop Plus).", "Free."],
    ]),
    pickThem: [
      "You want an app that watches your accounts and tells you where to save.",
      "You are comfortable connecting every account via open banking.",
      "You only ever budget on your phone.",
    ],
    pickUs: [
      "You want to budget without connecting anything.",
      "You want to import files, use a computer, or keep the data on your own device.",
      "You would rather review your own recurring list than be sent nudges.",
    ],
    sections: [
      {
        h: "Where Snoop wins",
        p: [
          "Effort. Connect your accounts and Snoop reads them daily, spots the bill that went up, and points you at a cheaper deal. For someone who wants prompting rather than a ledger, that is a good fit, and the core is free.",
        ],
      },
      {
        h: "Where The Income Tracker wins",
        p: [
          "Privacy and flexibility. No open banking, no app-only limitation, no paywall on custom categories or export. The recurring view does the subscription-spotting from your CSV, and the guides cover cancelling properly. It runs on a laptop as happily as a phone, and installs as an app on both.",
        ],
      },
    ],
    sources: [
      { t: "Snoop: how much does it cost", href: "https://snoopadmin.zendesk.com/hc/en-gb/articles/4584733957661-How-much-does-it-cost" },
      { t: "Snoop: do I have to connect an account", href: "https://snoopadmin.zendesk.com/hc/en-gb/articles/360003718218-Do-I-have-to-connect-an-account" },
      { t: "Snoop: can I create manual accounts", href: "https://snoopadmin.zendesk.com/hc/en-gb/articles/360003758197-Can-I-create-manual-accounts" },
    ],
    faqs: [
      { q: "Does Snoop work without connecting a bank account?", a: "Barely. Snoop's own help says an unconnected account is limited to basic Snoops and switching services. The Income Tracker works entirely from a CSV you download." },
      { q: "Can I import a CSV into Snoop?", a: "No. Snoop has no CSV import. Manual accounts exist on Snoop Plus but only hold a balance you update yourself." },
      { q: "Is there a Snoop web app?", a: "No, Snoop is iOS and Android only. The Income Tracker runs in any browser and can be installed on phone or desktop." },
    ],
    related: ["best-free-budgeting-apps-uk", "find-and-cancel-unused-subscriptions", "emma-alternative", "budget-app-without-open-banking"],
  },
  {
    slug: "vs-ynab",
    name: "YNAB",
    card: "vs YNAB",
    cardD: "The full envelope method, or a free simple ledger",
    crumb: "vs YNAB",
    title: "YNAB vs The Income Tracker: the full method or the picture?",
    description:
      "YNAB costs about £99 a year and teaches a rigorous zero-based method. The Income Tracker is free and simpler: a monthly ledger built from your bank CSV.",
    h1: "The Income Tracker vs YNAB",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "YNAB is the best-known zero-based budgeting tool and it is good at it: every pound gets a job, manual entry and file import are first-class, and it does not need a bank link. It costs around £99 a year in the UK. The Income Tracker is free and deliberately simpler: a month-by-month ledger from your bank CSV with categories, recurring items, goals and a surplus figure. If you want the method, pay for YNAB. If you want the picture, we are free.",
    rows: rows([
      ["price", "£12.99 a month or £99 a year on the UK App Store ($14.99 / $109 on ynab.com). 34-day free trial."],
      ["bank", "Optional. Direct import for selected UK banks via a third party; manual entry and file import work fully without it."],
      ["csv", "Yes. Manual entry and file-based import are core features."],
      ["data", "On YNAB's servers (synced across devices)."],
      ["platforms", "Web, iOS, Android, Apple Watch."],
      ["Method", "Zero-based envelope budgeting with goals per category and a proper learning curve.", "A monthly ledger: income, categorised spending, recurring items, goals, annual projection. Zero-based if you want; not enforced."],
      ["Sharing", "Up to six people on one plan.", "One ledger per device or sign-in; import both partners' CSVs into it."],
    ]),
    pickThem: [
      "You want the full zero-based method with goals per category and the discipline that comes with it.",
      "You want to share one budget with a partner or family across devices.",
      "£99 a year is worth it to you for the structure.",
    ],
    pickUs: [
      "You want to see income, spending and surplus month by month without learning a system.",
      "You want it free, with no bank link and data on your own device.",
      "You want bank CSV import to do the recording, not manual entry.",
    ],
    sections: [
      {
        h: "Where YNAB wins",
        p: [
          "The method. YNAB's four rules and its envelope workflow change how people think about money, and its manual-first design means it works in the UK regardless of which banks link. It is mature software with a large community. None of that is available for free, and that is the honest trade.",
        ],
      },
      {
        h: "Where The Income Tracker wins",
        p: [
          "Simplicity, price and the import. Drop in a bank CSV and the month builds itself: merchants remembered, transfers skipped, recurring bills seeded forward. There is nothing to learn beyond drag a row into a category. It is free, it runs in the browser, and the data stays on your device unless you choose to sync.",
        ],
      },
      {
        h: "Can you do zero-based budgeting here?",
        p: [
          "Yes, in a lighter form: set category amounts from last month's actuals and assign the surplus until it reads zero. The zero-based budgeting guide walks through it. What you will not get is YNAB's per-category goal tracking and its enforced envelope discipline.",
        ],
      },
    ],
    sources: [
      { t: "YNAB: pricing", href: "https://www.ynab.com/pricing" },
      { t: "YNAB on the UK App Store (in-app purchase prices)", href: "https://apps.apple.com/gb/app/ynab/id1010865877" },
      { t: "Finder UK: YNAB review", href: "https://www.finder.com/uk/budgeting/ynab-review" },
    ],
    faqs: [
      { q: "How much does YNAB cost in the UK?", a: "About £12.99 a month or £99 a year through the UK App Store; ynab.com lists $14.99 a month or $109 a year in US dollars. There is a 34-day free trial." },
      { q: "Does YNAB work without linking a bank?", a: "Yes. Manual entry and file import are fully supported, which is one reason it works well in the UK." },
      { q: "Is The Income Tracker a free YNAB alternative?", a: "For the monthly picture, yes: free, no bank login, CSV import. It does not replicate YNAB's full envelope method." },
    ],
    related: ["free-ynab-alternative-uk", "zero-based-budgeting-uk", "best-free-budgeting-apps-uk", "import"],
  },
  {
    slug: "plum-alternative",
    name: "Plum",
    card: "vs Plum",
    cardD: "Automatic saving, or a budget you can see",
    crumb: "vs Plum",
    title: "Plum vs The Income Tracker: autopilot saving or a real budget",
    description:
      "Plum links your bank to save and invest automatically, with paid tiers from £3.99 a month and no manual mode. The Income Tracker is a free CSV budget with no bank link.",
    h1: "The Income Tracker vs Plum",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "Plum is a saving and investing app first and a budgeting tool second: it reads your bank through open banking, skims money into pots and offers ISAs and investments, with paid tiers from £3.99 a month. The Income Tracker does none of that. It shows you where the money goes, for free, from a CSV, with no bank link. Different jobs; many people use one of each.",
    rows: rows([
      ["price", "Basic free; Plus £3.99, Boost £7.99, Max £14.99 a month"],
      ["bank", "Required. Plum links your bank read-only via open banking to analyse spending and auto-save."],
      ["csv", "No manual mode and no CSV import."],
      ["data", "On Plum's servers, pulled from your bank."],
      ["platforms", "iOS and Android."],
      ["Saving and investing", "Its core: automatic saving rules, pots, ISAs, investments, a card on higher tiers.", "Savings goals with a projected date; the saving itself happens at your bank."],
      ["Spending insight", "Spending analysis from the feed.", "A categorised monthly ledger you review and correct."],
    ]),
    pickThem: [
      "You want money moved into savings or investments automatically, without deciding each month.",
      "You want savings pots, an ISA and investing inside one app.",
      "You are comfortable with a read-only open banking link.",
    ],
    pickUs: [
      "You want to understand your spending before automating anything.",
      "You will not connect your bank to a third party.",
      "You want it free and on your own device.",
    ],
    sections: [
      {
        h: "Where Plum wins",
        p: [
          "Doing the saving for you. Plum's rules move money before you can spend it, and the pots and investment options are genuinely useful for people who never get round to it. If your problem is discipline rather than visibility, Plum's approach can work.",
        ],
      },
      {
        h: "Where The Income Tracker wins",
        p: [
          "Visibility and consent. You see every transaction, categorised, month after month, and decide what to do with the surplus. Nothing reads your account and nothing moves your money. For many people that understanding is what makes the saving stick.",
        ],
      },
    ],
    sources: [
      { t: "Plum: subscriptions comparison table", href: "https://help.withplum.com/en/articles/11721138-new-subscriptions-comparison-table" },
      { t: "Plum: open banking", href: "https://help.withplum.com/en/articles/8861509-open-banking" },
      { t: "Up the Gains: Plum review (August 2026)", href: "https://upthegains.co.uk/blog/plum-app-review" },
    ],
    faqs: [
      { q: "Does Plum work without linking a bank account?", a: "No. Plum needs a read-only open banking connection to analyse your spending and move money into savings." },
      { q: "Is Plum a budgeting app?", a: "Partly. It shows spending analysis, but its core is automatic saving and investing. For a budget you control, a ledger such as The Income Tracker is the better fit." },
      { q: "Is Plum free?", a: "There is a free Basic tier. Plus, Boost and Max cost £3.99, £7.99 and £14.99 a month." },
    ],
    related: ["how-long-to-save-10000-for-a-car", "emergency-fund-calculator-uk", "best-free-budgeting-apps-uk", "budget-app-without-open-banking"],
  },
  {
    slug: "monzo-trends-alternative",
    name: "Monzo Trends",
    card: "vs Monzo Trends",
    cardD: "Budgeting inside Monzo, or across every bank",
    crumb: "vs Monzo Trends",
    title: "Monzo Trends vs The Income Tracker: one bank or all of them",
    description:
      "Trends is free inside Monzo and adds one other bank free, more on paid plans. The Income Tracker is free, works with every UK bank via CSV and needs no Monzo account.",
    h1: "The Income Tracker vs Monzo Trends",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "If you bank with Monzo, Trends is free, automatic and already on your phone, and you can connect one other bank or card for nothing. The catch is the ceiling: more connections need a paid plan, there is no CSV or manual entry, and it only exists inside Monzo. The Income Tracker works with every bank, needs no Monzo account, and is free with no ceiling.",
    rows: rows([
      ["price", "Included with a free Monzo account. Paid plans: Extra £3, Perks £9, Max £19 a month."],
      ["bank", "Needs a Monzo current account. One external bank or card connects free; unlimited on Extra, Perks and Max."],
      ["csv", "No CSV import and no manual entry."],
      ["data", "Inside Monzo."],
      ["platforms", "The Monzo app (iOS, Android)."],
      ["Categories", "Monzo's categories; custom categories on paid plans.", "Your own categories, free, with merchant memory."],
      ["Coverage", "Monzo plus connected accounts.", "Any UK bank that exports a file, all in one ledger."],
    ]),
    pickThem: [
      "Monzo is your main account and most of your spending is already there.",
      "One extra connected account covers your other bank.",
      "You want it automatic and you never want to export a file.",
    ],
    pickUs: [
      "You use several banks or a non-Monzo main account.",
      "You want custom categories, CSV import or a computer-sized view for free.",
      "You want your budget to outlive any one bank.",
    ],
    sections: [
      {
        h: "Where Monzo Trends wins",
        p: [
          "Zero effort for Monzo customers. The data is already there, the categories are applied at the point of purchase, and the free external connection covers a lot of two-bank households. As a built-in feature it is better than most banks offer.",
        ],
      },
      {
        h: "Where The Income Tracker wins",
        p: [
          "Independence. It does not care which bank you use, how many you have, or whether you keep them. Export a CSV from each, import them into one ledger, and your history stays with you if you switch banks. Custom categories, recurring detection and goals are free rather than tied to a plan.",
        ],
      },
      {
        h: "Use both",
        p: [
          "Plenty of people do. Trends for the day-to-day glance inside Monzo, and a monthly CSV import here for the full picture across every account. The Monzo CSV export guide takes about a minute.",
        ],
      },
    ],
    sources: [
      { t: "Monzo: connected bank accounts", href: "https://monzo.com/help/app-help/connected-bank-accounts-monzo-enabled" },
      { t: "Monzo: plan fee information", href: "https://monzo.com/legal/plans/fee-information" },
      { t: "Monzo: plan price change", href: "https://monzo.com/help/monzo-max/monzo-plan-price-change" },
    ],
    faqs: [
      { q: "Is Monzo Trends free?", a: "Yes, Trends is included with a free Monzo account. Connecting one other bank or card is free; unlimited connections and custom categories need a paid plan (Extra, Perks or Max)." },
      { q: "Can I use Monzo Trends without a Monzo account?", a: "No. Trends lives inside the Monzo app. The Income Tracker works with any bank via CSV." },
      { q: "Can I import a CSV into Monzo Trends?", a: "No. Trends has no CSV import or manual entry. You can export a CSV from Monzo and import it into The Income Tracker." },
    ],
    related: ["monzo-csv", "monzo-csv-expense-tracker", "best-free-budgeting-apps-uk", "import"],
  },
  {
    slug: "moneyhub-alternative",
    name: "Moneyhub",
    card: "Moneyhub alternative",
    cardD: "The consumer app closed in July 2026. What to use now.",
    crumb: "Moneyhub alternative",
    title: "Moneyhub alternative (2026): what to use now the app has closed",
    description:
      "Moneyhub's consumer app was sunsetted on 31 July 2026. The Income Tracker is a free Moneyhub alternative with no bank connection and data kept on your own device.",
    h1: "Moneyhub alternative: what to use now the app has closed",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "Moneyhub exited direct-to-consumer in 2025 and its help centre confirms the app was sunsetted on 31 July 2026, with remaining accounts deleted. Its business behind the scenes continues. If you used it to see all your accounts in one place, the free replacement that needs no bank connection is a CSV-based ledger: The Income Tracker.",
    rows: rows([
      ["price", "Was £1.49 a month or £14.99 a year after a free trial. Now closed to consumers."],
      ["bank", "Was built on open banking connections."],
      ["csv", "Had manual accounts; offered a CSV export at closure."],
      ["data", "Was on Moneyhub's servers; deleted at closure unless migrated."],
      ["platforms", "Was iOS, Android and web."],
      ["What replaces the all-accounts view", "Nothing inside Moneyhub any more.", "Import a CSV from each bank into one ledger. Accounts, goals and net worth in one place."],
    ]),
    pickThem: [
      "You cannot: the consumer app has closed. Moneyhub pointed users to a partner app or to exporting their data.",
    ],
    pickUs: [
      "You want the multi-account picture back without connecting every bank to a new company.",
      "You want something free that cannot be shut down between you and your data, because the data is on your device.",
      "You have a Moneyhub CSV export and want somewhere to put it.",
    ],
    sections: [
      {
        h: "What happened",
        p: [
          "In February 2025 Moneyhub announced it was exiting the direct-to-consumer app and migrating users to a partner. By June 2026 its help centre said the app would be officially sunsetted from 31 July 2026, with remaining accounts and data automatically deleted. Some blogs quote mid-August; the company's own help centre says 31 July. Moneyhub's business, providing open banking technology to other firms, carries on.",
        ],
      },
      {
        h: "If you exported your Moneyhub data",
        p: [
          "A Moneyhub transaction export is a CSV with dates, descriptions and amounts, which is exactly what The Income Tracker imports. Drop the file in, check the review screen, and your history is back. Going forward, export a CSV from each bank once a month; every major UK bank is covered in the guides.",
        ],
      },
      {
        h: "The lesson worth keeping",
        p: [
          "An app that holds your financial history on its servers can close, and two well-known UK ones have in three years (Money Dashboard in 2023, Moneyhub in 2026). A local-first tool keeps the data on your device and lets you export it at any time. Whatever you choose next, choose something you can leave with your data intact.",
        ],
      },
    ],
    sources: [
      { t: "Moneyhub help centre: app closure and your account options", href: "https://moneyhubhelp.zendesk.com/hc/en-gb/articles/48275693667217-Moneyhub-App-Closure-and-Your-Account-Options" },
      { t: "Moneyhub help centre: announcement, service migration (February 2025)", href: "https://moneyhubhelp.zendesk.com/hc/en-gb/articles/32678215458833-Announcement-Service-Migration" },
      { t: "Moneyhub press release: continuing service of the Moneyhub app", href: "https://moneyhub.com/press-releases/continuing-service-of-the-moneyhub-app/" },
    ],
    faqs: [
      { q: "Has Moneyhub closed?", a: "The consumer app has. Moneyhub announced its exit from direct-to-consumer in February 2025 and its help centre states the app was sunsetted on 31 July 2026. The company's business-to-business open banking services continue." },
      { q: "What is the best Moneyhub alternative?", a: "It depends what you used it for. For an all-accounts view without connecting banks to a new company, The Income Tracker is free and works from CSV exports. For automatic feeds, Emma and Snoop are the open-banking options." },
      { q: "Can I import my Moneyhub export?", a: "Yes. A Moneyhub CSV has dates, descriptions and amounts, which The Income Tracker reads directly." },
    ],
    related: ["money-dashboard-alternative", "best-free-budgeting-apps-uk", "import", "is-it-safe-to-upload-bank-statements"],
  },
  {
    slug: "money-dashboard-alternative",
    name: "Money Dashboard",
    card: "Money Dashboard alternative",
    cardD: "Closed in October 2023. The free replacement.",
    crumb: "Money Dashboard alternative",
    title: "Money Dashboard alternative (UK): a free replacement",
    description:
      "Money Dashboard shut down on 31 October 2023. The Income Tracker is a free alternative: the multi-account monthly view with no bank connection and data on your device.",
    h1: "Money Dashboard alternative: a free replacement",
    published: "2026-09-08",
    checked: CHECKED,
    tldr:
      "Money Dashboard, owned by ClearScore, closed its Neon and Classic apps on 31 October 2023 after saying it could not find a sustainable business model. Users could export a CSV before the date and nothing after. The free replacement that does not depend on a company staying in business is a local-first ledger fed by your own bank CSVs: The Income Tracker.",
    rows: rows([
      ["price", "Was free. Closed 31 October 2023."],
      ["bank", "Was built on open banking connections."],
      ["csv", "Offered a CSV export before closure."],
      ["data", "Was on Money Dashboard's servers; deleted or anonymised after closure."],
      ["platforms", "Was iOS, Android and web."],
      ["Monthly overview across accounts", "Gone.", "One ledger, every bank, month by month, with an annual view."],
    ]),
    pickThem: [
      "You cannot. The apps and accounts were shut down and cannot be reopened.",
    ],
    pickUs: [
      "You want the multi-account monthly view back, for free.",
      "You would rather not connect your banks to another company that might close.",
      "You still have your Money Dashboard CSV export and want to keep the history.",
    ],
    sections: [
      {
        h: "What users were told",
        p: [
          "In early October 2023 Money Dashboard emailed its roughly half a million users to say the Neon and Classic apps would close at the end of the month, that bank connections would be removed and accounts deleted, and that data could be exported as a CSV until 31 October. The company said it would focus on business-to-business open banking instead.",
        ],
      },
      {
        h: "Bringing the history back",
        p: [
          "If you kept the CSV export, import it into The Income Tracker; dates, descriptions and amounts are read directly. If you did not, most banks let you export at least a year of history, and the bank CSV guides show where. From then on, a monthly export from each bank keeps the picture complete.",
        ],
      },
      {
        h: "Choosing something that will not close on you",
        p: [
          "Free apps built on open banking need a business model, and two UK ones (Money Dashboard in 2023, Moneyhub's consumer app in 2026) have not found one. A local-first tool has no such problem: the data lives on your device, the CSV is a format every spreadsheet reads, and you can leave any time with everything intact.",
        ],
      },
    ],
    sources: [
      { t: "YourMoney: Money Dashboard to close at the end of October", href: "https://www.yourmoney.com/saving-banking/money-dashboard-to-close-at-the-end-of-october-what-users-need-to-know/" },
      { t: "Be Clever With Your Cash: Money Dashboard closing, the alternatives", href: "https://becleverwithyourcash.com/money-dashboard-closing-what-are-the-alternatives/" },
    ],
    faqs: [
      { q: "Why did Money Dashboard close?", a: "Its owner said it could not find a sustainable business model for the consumer app and would focus on business-to-business open banking services. The apps closed on 31 October 2023." },
      { q: "What is the best free alternative to Money Dashboard?", a: "For a multi-account monthly view without bank connections, The Income Tracker is free and CSV-based. For automatic feeds, Emma and Snoop are the main open-banking options, each with a free tier and paid upgrades." },
      { q: "Can I still get my Money Dashboard data?", a: "No. Exports were only available until 31 October 2023. Your banks can export their own history, usually at least a year." },
    ],
    related: ["moneyhub-alternative", "best-free-budgeting-apps-uk", "import", "budget-app-without-open-banking"],
  },
];

export const ROUNDUP = {
  slug: "best-free-budgeting-apps-uk",
  card: "Best free budgeting apps (UK, 2026)",
  cardD: "Ten apps, honest verdicts, including where we lose",
  crumb: "Best free budgeting apps",
  title: "Best free budgeting apps in the UK (2026): honest verdicts",
  description:
    "Ten free budgeting apps for UK users compared on price, open banking, manual or CSV entry and who each suits. Prices checked September 2026. Our own weaknesses included.",
  h1: "The best free budgeting apps in the UK (2026)",
  published: "2026-09-08",
  checked: CHECKED,
  tldr:
    "There is no single best. If you want automatic bank feeds, Emma's and Snoop's free tiers are the strongest, with paid upgrades waiting. If you want to budget without connecting a bank, the free options are The Income Tracker (CSV import, no login), Goodbudget (envelopes, manual) and Spendee (manual with paid sync). Monzo Trends is the best built-in option if you bank with Monzo. Everything below says what each one is bad at, including ours.",
  intro: [
    {
      h: "How we picked and what we checked",
      p: [
        "Every app here has a usable free tier in the UK as of September 2026. We checked the list price of paid tiers, whether the app needs an open banking connection to be useful, whether you can enter transactions by hand or import a file, and which platforms it runs on, against each company's own pricing and help pages. We make The Income Tracker, so read our entry with that in mind; we have tried to be as blunt about it as about the others.",
      ],
    },
  ],
  apps: [
    {
      name: "The Income Tracker",
      us: true,
      free: "Everything free",
      openBanking: "No (opt-in only)",
      manual: "Yes: CSV, OFX, QIF, paste, manual",
      bestFor: "Private, no-login budgeting from bank CSVs",
      summary:
        "A month-by-month ledger fed by the CSV you download from your bank. Categories with merchant memory, recurring items, goals, an annual view, and data kept in your browser. Free with no tiers.",
      pros: ["No bank connection and no account needed; import a file or type entries.", "Free for everything, including CSV import, custom categories and export.", "Guides for exporting a CSV from 27 UK banks and card providers."],
      cons: ["No automatic daily feed: you export once a month yourself.", "Simpler than YNAB's method; no per-category envelope goals.", "The iOS app is still in development, so on a phone you install the web app."],
      url: "https://www.theincometracker.com/",
      href: "/?ref=roundup",
      hrefLabel: "Open The Income Tracker",
    },
    {
      name: "Monzo Trends",
      free: "Included with a Monzo account",
      openBanking: "For other banks (one free)",
      manual: "No",
      bestFor: "Monzo customers who want it automatic",
      summary:
        "Monzo's built-in budgeting view. Free with the account, categorises at the point of purchase, and one external bank or card can be connected free; unlimited connections and custom categories need a paid plan (Extra £3, Perks £9, Max £19 a month).",
      pros: ["Zero effort if Monzo is your main account.", "One free external connection covers many two-bank households.", "Good spending and balance views."],
      cons: ["Needs a Monzo current account.", "No CSV import or manual entry.", "Custom categories and more connections are paid."],
      url: "https://monzo.com/",
      href: "/compare/monzo-trends-alternative.html",
    },
    {
      name: "Emma",
      free: "Free tier (2 bank connections)",
      openBanking: "Yes",
      manual: "Only on Pro (£9.99/mo) and Ultimate",
      bestFor: "Polished automatic budgeting with feeds",
      summary:
        "The most polished open-banking budgeting app in the UK, with strong subscription detection and analytics. The free tier connects two accounts; Plus is £4.99, Pro £9.99 and Ultimate £14.99 a month, with roughly 30% off paid yearly.",
      pros: ["Excellent interface and subscription tracking.", "Household budgeting controls.", "Web app for paying customers."],
      cons: ["Free tier capped at two connections.", "Manual accounts and CSV import locked behind Pro.", "Persistent upselling."],
      url: "https://emma-app.com/",
      href: "/compare/emma-alternative.html",
    },
    {
      name: "Snoop",
      free: "Free core; Plus £5.99/mo",
      openBanking: "Yes, required for anything useful",
      manual: "Balance-only manual accounts on Plus; no CSV",
      bestFor: "Money-saving nudges from your feed",
      summary:
        "Connect your accounts and Snoop generates prompts: a bill that went up, a cheaper deal, a subscription to review. The core is free; Snoop Plus (£5.99 a month or £47.99 a year) adds custom categories, manual accounts and export.",
      pros: ["Genuinely useful nudges.", "Free core with 50-plus UK banks supported.", "Good at spotting rising bills."],
      cons: ["Near-useless without a connected account, by Snoop's own description.", "No web app and no CSV import.", "Custom categories and export are paid."],
      url: "https://www.snoop.app/",
      href: "/compare/snoop-alternative.html",
    },
    {
      name: "Goodbudget",
      free: "Free (20 envelopes, 1 account, 1 year history)",
      openBanking: "No (US bank sync only)",
      manual: "Yes, including CSV, OFX and QFX import on the free plan",
      bestFor: "Envelope budgeting with no bank access",
      summary:
        "A classic envelope budgeting app that is manual by design. The free plan allows 20 envelopes and one account; the paid plan is listed in US dollars ($10 a month or $80 a year) with UK App Store prices that vary, so check before paying.",
      pros: ["True envelope method with zero bank access.", "Web, iOS and Android, shared across devices.", "File import on the free plan."],
      cons: ["No UK bank sync at all, even paid.", "Dated interface.", "Free plan limited to one account."],
      url: "https://goodbudget.com/",
    },
    {
      name: "Spendee",
      free: "Free (one manual wallet)",
      openBanking: "Only on Premium",
      manual: "Yes; file import via the web app",
      bestFor: "Cheap manual tracking with optional sync",
      summary:
        "A manual-first tracker with shared wallets and multi-currency support. The free plan gives one cash wallet; Plus and Premium are priced in US dollars (about $1.99 and $5.99 a month, £5.99 for Premium on the UK App Store), and bank sync is Premium-only.",
      pros: ["Inexpensive.", "Shared wallets for couples or households.", "Receipt scanning and multi-currency."],
      cons: ["File import is web-only and only into manual wallets.", "Free plan limited to a single wallet.", "UK pricing is opaque."],
      url: "https://www.spendee.com/",
    },
    {
      name: "Plum",
      free: "Basic free; paid from £3.99/mo",
      openBanking: "Yes, required",
      manual: "No",
      bestFor: "Automatic saving and investing",
      summary:
        "More a saving and investing app than a budget. Plum reads your bank through open banking, skims money into pots by rules, and offers ISAs and investments. Plus, Boost and Max are £3.99, £7.99 and £14.99 a month.",
      pros: ["Saving happens without you deciding each month.", "Pots, ISA and investing in one place.", "Spending analysis included."],
      cons: ["Not a budget you control; a feed you react to.", "No manual mode or CSV.", "Best features on paid tiers."],
      url: "https://withplum.com/",
      href: "/compare/plum-alternative.html",
    },
    {
      name: "HyperJar",
      free: "No monthly fee (some transaction fees)",
      openBanking: "No",
      manual: "No (you load real money into jars)",
      bestFor: "Spending from jars with a card",
      summary:
        "A prepaid account with a Mastercard and spending jars. There is no monthly fee; the physical card is a one-off £4.99 and there are limits on free loads and transfers before per-transaction fees apply. It does not read your other accounts.",
      pros: ["Jar budgeting with a real card, no monthly fee.", "No FX fees abroad.", "Free kids' cards."],
      cons: ["It is an account you fund, not a tracker of your existing accounts.", "E-money, not FSCS-protected.", "No ATM withdrawals; fees beyond the free allowances."],
      url: "https://hyperjar.com/",
    },
    {
      name: "Lumio",
      free: "Free individual tier",
      openBanking: "Yes",
      manual: "Offline accounts on paid tiers; no CSV",
      bestFor: "Couples who want private and shared views",
      summary:
        "Built for couples: private spaces plus a shared one. The free individual tier allows unlimited connections with three months of history; Pro is £3 a month for one person or £4.49 for a couple, paid yearly cheaper.",
      pros: ["Shared-and-private model suits couples.", "Free tier with unlimited connections.", "Net worth tracking."],
      cons: ["Three-month history on free.", "Offline accounts paywalled; no CSV import.", "No web app."],
      url: "https://www.lumio-app.com/",
    },
    {
      name: "YNAB (paid, for comparison)",
      free: "34-day trial, then about £99/yr",
      openBanking: "Optional",
      manual: "Yes, and file import",
      bestFor: "The full zero-based method",
      summary:
        "Not free, but it is the benchmark people compare free apps against. Manual entry and file import are first-class, it works with or without a bank link, and it teaches a rigorous method. About £12.99 a month or £99 a year on the UK App Store.",
      pros: ["The best implementation of zero-based budgeting.", "Works fully without a bank connection.", "Web plus mobile, shareable with up to six people."],
      cons: ["One of the most expensive.", "Billed in US dollars on the website.", "A real learning curve."],
      url: "https://www.ynab.com/",
      href: "/compare/vs-ynab.html",
    },
  ],
  sections: [
    {
      h: "Budgeting without connecting a bank: your real options",
      p: [
        "Fully manual and free: The Income Tracker (CSV import plus manual entry), Goodbudget (manual, file import on the free plan) and Spendee (manual wallets; sync is paid). Paid but excellent: YNAB. Possible but paywalled: Emma (Pro tier) and Lumio (offline accounts on paid tiers). Not possible: Plum, Snoop in any useful form, Cleo and Monzo Trends, all of which depend on a feed.",
      ],
    },
    {
      h: "Apps that have closed",
      p: [
        "Money Dashboard shut down on 31 October 2023 and Moneyhub's consumer app was sunsetted on 31 July 2026. Mint never operated in the UK and closed in March 2024. If you are searching for any of them, the alternative pages explain what happened and what to use instead.",
      ],
    },
  ],
  sources: [
    { t: "Emma: plan prices", href: "https://help.emma-app.com/en/article/how-much-does-emma-plusproultimate-cost-1ywhulq/" },
    { t: "Snoop: how much does it cost", href: "https://snoopadmin.zendesk.com/hc/en-gb/articles/4584733957661-How-much-does-it-cost" },
    { t: "Monzo: connected bank accounts", href: "https://monzo.com/help/app-help/connected-bank-accounts-monzo-enabled" },
    { t: "Monzo: plan fee information", href: "https://monzo.com/legal/plans/fee-information" },
    { t: "Goodbudget: sign up and plans", href: "https://goodbudget.com/signup" },
    { t: "Spendee: pricing", href: "https://www.spendee.com/pricing" },
    { t: "Plum: subscriptions comparison table", href: "https://help.withplum.com/en/articles/11721138-new-subscriptions-comparison-table" },
    { t: "HyperJar: fees and limits", href: "https://hyperjar.com/fees-limits" },
    { t: "Lumio: pricing", href: "https://www.lumio-app.com/pricing" },
    { t: "YNAB: pricing", href: "https://www.ynab.com/pricing" },
    { t: "Moneyhub help centre: app closure", href: "https://moneyhubhelp.zendesk.com/hc/en-gb/articles/48275693667217-Moneyhub-App-Closure-and-Your-Account-Options" },
  ],
  faqs: [
    { q: "What is the best free budgeting app in the UK?", a: "For automatic feeds, Emma's or Snoop's free tier. For budgeting without connecting a bank, The Income Tracker (CSV import, no login) or Goodbudget (manual envelopes). For Monzo customers, Trends is built in." },
    { q: "Which budgeting apps work without open banking?", a: "The Income Tracker, Goodbudget and Spendee work fully without a bank connection on their free tiers. YNAB does too but is paid. Emma allows it only on paid tiers." },
    { q: "Is there a free alternative to YNAB in the UK?", a: "The Income Tracker gives you the monthly picture for free without YNAB's full method. Goodbudget offers free envelope budgeting with limits." },
    { q: "Are Money Dashboard and Moneyhub still available?", a: "No. Money Dashboard closed in October 2023 and Moneyhub's consumer app in July 2026." },
  ],
  related: ["budget-app-without-open-banking", "free-ynab-alternative-uk", "import", "is-it-safe-to-upload-bank-statements"],
};
