// Search-intent landing pages: use-case first, cross-linking to the matching
// export guide so they do not cannibalise the /import/ pages.

export const LANDINGS = [
  {
    slug: "monzo-csv-expense-tracker",
    card: "Monzo CSV expense tracker",
    cardD: "Track Monzo spending free",
    crumb: "Monzo CSV expense tracker",
    title: "Monzo CSV expense tracker (free, no bank login)",
    description:
      "Turn your Monzo CSV export into a clear month-by-month expense tracker. Free, private, no account and no open banking. Import in seconds.",
    h1: "A free Monzo CSV expense tracker",
    tldr:
      "Export a CSV from Monzo, drop it into The Income Tracker, and every transaction lands in a clean month-by-month view you can categorise in seconds. Free, private, no bank login.",
    why: [
      "Free, with no account and no subscription.",
      "No open banking. You export the CSV yourself.",
      "Your data stays in your browser, not on our servers.",
      "Drag-and-drop categories and live totals.",
      "Works alongside your other banks too.",
    ],
    steps: [
      "In the Monzo app, tap Manage, then Bank statements, and export as CSV.",
      "Open The Income Tracker and import the file.",
      "Your spending sorts into a monthly ledger, ready to categorise.",
    ],
    exportNoteHtml: 'Need the exact export steps? See the <a href="/import/monzo-csv.html">Monzo CSV guide</a>.',
    faqs: [
      { q: "Is the Monzo expense tracker free?", a: "Yes. The Income Tracker is free with no account or subscription. Import your Monzo CSV and start tracking straight away." },
      { q: "Do I need to connect Monzo with open banking?", a: "No. You export a CSV from the Monzo app yourself, so nothing connects to your account." },
      { q: "Can I track Monzo alongside other banks?", a: "Yes. Import CSVs from as many banks as you like and see everything in one monthly view." },
    ],
    related: ["monzo-csv", "starling-csv-budget-tracker", "tools", "budget-without-linking-bank"],
  },
  {
    slug: "barclays-csv-budget-planner",
    card: "Barclays CSV budget planner",
    cardD: "Plan from your Barclays CSV",
    crumb: "Barclays CSV budget planner",
    title: "Barclays CSV budget planner (free)",
    description:
      "Plan your budget from your Barclays CSV export. Free and private, with no bank login. See income, spending and surplus month by month.",
    h1: "A free Barclays CSV budget planner",
    tldr:
      "Download a CSV from Barclays Online Banking, import it into The Income Tracker, and plan your month around real numbers. Income, spending and what is left, all in one view. Free, no bank login.",
    why: [
      "Free, with no account and no subscription.",
      "No open banking. You download the CSV yourself.",
      "Income, expenses and surplus in one clear month view.",
      "Drag transactions into categories in seconds.",
      "An annual projection so you can plan ahead.",
    ],
    steps: [
      "In Barclays Online Banking, export your transactions as CSV (Export all, then CSV).",
      "Open The Income Tracker and import the file.",
      "Your month builds itself, ready to plan and categorise.",
    ],
    exportNoteHtml: 'Need the exact export steps? See the <a href="/import/barclays-csv.html">Barclays CSV guide</a>.',
    faqs: [
      { q: "Is the Barclays budget planner free?", a: "Yes. The Income Tracker is free, with no account or subscription. Import your Barclays CSV and start planning." },
      { q: "Do I have to connect my Barclays account?", a: "No. You export a CSV from Barclays Online Banking yourself. Nothing connects to your account." },
      { q: "Can I see a full year, not just one month?", a: "Yes. The Income Tracker adds up every month you import and projects the year ahead." },
    ],
    related: ["barclays-csv", "monzo-csv-expense-tracker", "tools", "budget-without-linking-bank"],
  },
  {
    slug: "starling-csv-budget-tracker",
    card: "Starling CSV budget tracker",
    cardD: "Track Starling spending free",
    crumb: "Starling CSV budget tracker",
    title: "Starling CSV import budget tracker (free)",
    description:
      "Import your Starling CSV and track your budget month by month. Free and private, with no open banking and no bank login.",
    h1: "A free Starling CSV budget tracker",
    tldr:
      "Export a CSV from Starling, import it into The Income Tracker, and track your spending in a clean monthly ledger. Free, private, no open banking.",
    why: [
      "Free, with no account and no subscription.",
      "No open banking. You export the CSV yourself.",
      "Month-by-month ledger with live totals.",
      "Drag-and-drop categories that stick.",
      "Mix in CSVs from your other banks too.",
    ],
    steps: [
      "In the Starling app, open Account information and export a CSV statement.",
      "Open The Income Tracker and import the file.",
      "Your transactions land in a monthly view, ready to categorise.",
    ],
    exportNoteHtml: 'Need the exact export steps? See the <a href="/import/starling-csv.html">Starling CSV guide</a>.',
    faqs: [
      { q: "Is the Starling budget tracker free?", a: "Yes. The Income Tracker is free, with no account or subscription. Import your Starling CSV and go." },
      { q: "Do I need open banking for this?", a: "No. You export a CSV from the Starling app yourself, so nothing connects to your account." },
      { q: "Can I import several months at once?", a: "Yes. Export the date range you want from Starling and import it in one go." },
    ],
    related: ["starling-csv", "monzo-csv-expense-tracker", "tools", "budget-without-linking-bank"],
  },
  {
    slug: "budget-app-without-open-banking",
    card: "Budget app, no open banking",
    cardD: "Private by design",
    crumb: "Budget app without open banking",
    title: "UK budget app without open banking (free)",
    description:
      "A free UK budget app that never uses open banking. Import a CSV from your bank and track spending privately, with no credentials shared.",
    h1: "A UK budget app with no open banking",
    tldr:
      "The Income Tracker is a free UK budget app that does not use open banking. You import a CSV you download yourself, so no third party ever connects to your accounts. Private by design.",
    why: [
      "No open banking, ever. No Plaid, no TrueLayer.",
      "You stay in control. You choose what to import.",
      "Free, with no account or subscription.",
      "Data stays in your browser, not on a server.",
      "Works with every major UK bank via CSV.",
    ],
    steps: [
      "Download a CSV of your transactions from your bank.",
      "Import it into The Income Tracker.",
      "Track income, spending and surplus, month by month.",
    ],
    sections: [
      {
        h: "Why no open banking?",
        p: [
          "Open banking is convenient, but it means handing a third party an ongoing window into your accounts. That is a real trade, and not everyone wants to make it. A CSV gives you the same insight with none of the exposure. You download the file, you import it, and nothing else touches your bank.",
        ],
      },
    ],
    exportNoteHtml: 'Not sure how to export a CSV? Pick your bank in the <a href="/import/">bank CSV guides</a>.',
    faqs: [
      { q: "Is there a budget app that does not use open banking?", a: "Yes. The Income Tracker never uses open banking. You import a CSV you download from your bank, so no third party connects to your accounts." },
      { q: "How does it get my transactions then?", a: "You download a CSV from your bank and import it. The app reads the dates, descriptions and amounts automatically." },
      { q: "Is it really free?", a: "Yes. No account, no subscription, no credit card." },
    ],
    related: ["budget-without-linking-bank", "import", "tools", "is-it-safe-to-upload-bank-statements"],
  },
  {
    slug: "spreadsheet-alternative-income-expense-tracker",
    card: "Spreadsheet alternative",
    cardD: "CSV in, totals out",
    crumb: "Spreadsheet alternative",
    title: "Spreadsheet alternative for tracking income and expenses (free)",
    description:
      "Tired of fiddly budgeting spreadsheets? The Income Tracker imports your bank CSV and does the formulas for you. Free, private, nothing to maintain.",
    h1: "A spreadsheet alternative for tracking income and expenses",
    tldr:
      "Love the control of a spreadsheet but hate maintaining one? The Income Tracker keeps the control and drops the busywork. Import your bank CSV and it builds the totals, categories and projections for you. Free.",
    why: [
      "No formulas to write or accidentally break.",
      "Import a bank CSV instead of typing every row.",
      "Categories, recurring items and totals built in.",
      "An annual projection without a single SUM().",
      "Your data stays in your browser.",
    ],
    steps: [
      "Download a CSV from your bank.",
      "Import it into The Income Tracker.",
      "Get a tidy monthly ledger and a yearly view, no formulas required.",
    ],
    sections: [
      {
        h: "When a spreadsheet still wins",
        p: [
          "Credit where it is due. If you want total custom control, odd one-off calculations or your own bespoke layout, a spreadsheet is hard to beat. For everyone else who just wants to see income, spending and surplus without the upkeep, a purpose-built tracker is faster and far less fragile.",
        ],
      },
    ],
    exportNoteHtml: 'New to CSV exports? Start with the <a href="/import/">bank CSV guides</a>.',
    faqs: [
      { q: "Is this better than a budgeting spreadsheet?", a: "For most people, yes. You get the same clear view of income and expenses without writing or fixing formulas. Power users who want total custom control may still prefer a sheet." },
      { q: "Can I import my bank CSV?", a: "Yes, that is the point. Import a CSV from any UK bank and the app builds the totals for you." },
      { q: "Does it cost anything?", a: "No. It is free, with no sign-up." },
    ],
    related: ["free-ynab-alternative-uk", "import", "tools", "monthly-surplus-calculator"],
  },
  // Added 16 September 2026.
  {
    slug: "free-budget-planner-uk",
    published: "2026-09-16",
    updated: "2026-09-16",
    card: "Free budget planner (UK)",
    cardD: "Real transactions, not estimates",
    crumb: "Free budget planner",
    title: "Free budget planner UK (no sign-up, no bank login)",
    description:
      "A free UK budget planner that works from your real bank transactions. Import a CSV, see income, bills, spending and what is left month by month. No sign-up, no subscription, no bank login.",
    h1: "A free UK budget planner built on your real transactions",
    tldr:
      "Most budget planners ask you to type estimates into boxes. The Income Tracker builds the plan from what actually happened: import last month's bank CSV, sort it into categories, and your income, essentials, flexible spending and surplus are on screen. Free, private, and nothing connects to your bank.",
    why: [
      "Free, with no account, no subscription and no trial clock.",
      "Planned against real transactions, so the numbers are honest.",
      "Every UK bank via CSV, or paste a PDF statement.",
      "Categories that remember each merchant, so month two takes minutes.",
      "Your data stays in your browser. No bank login, no open banking.",
    ],
    steps: [
      "Download last month's transactions from your bank as a CSV.",
      "Import the file into The Income Tracker.",
      "Drag transactions into categories and read your surplus. Set next month's plan from it.",
    ],
    sections: [
      {
        h: "Prefer to plan first?",
        p: [
          "Use the free budget planner calculator to see your surplus and savings rate from figures you type, or download the monthly budget planner template as a CSV. Both are free and both import straight into the tracker when you are ready to switch from estimates to actuals.",
        ],
      },
    ],
    exportNoteHtml: 'Not sure how to export a CSV? Pick your bank in the <a href="/import/">bank CSV guides</a>.',
    faqs: [
      { q: "Is there a free budget planner for the UK?", a: "Yes. The Income Tracker is a free UK budget planner with no sign-up. Import a bank CSV or type entries, and it shows income, spending and surplus month by month." },
      { q: "Do I need to link my bank?", a: "No. You download a CSV from your bank yourself and import it. There is no open banking connection and no bank login." },
      { q: "Is it better than a spreadsheet budget planner?", a: "For most people, yes. It reads the bank file directly, remembers your categories and does the totals. A spreadsheet still wins if you want a fully custom layout." },
    ],
    related: ["budget-planner-uk", "monthly-budget-planner-template", "how-to-budget-for-beginners-uk", "import"],
  },
  {
    slug: "free-expense-tracker-uk",
    published: "2026-09-16",
    updated: "2026-09-16",
    card: "Free expense tracker (UK)",
    cardD: "Every card payment, sorted",
    crumb: "Free expense tracker",
    title: "Free expense tracker UK (private, no bank login)",
    description:
      "A free UK expense tracker that reads your bank CSV and sorts every payment into categories. See where the money goes each month. No sign-up, no subscription, no bank connection.",
    h1: "A free expense tracker for the UK",
    tldr:
      "Import your bank CSV and every expense lands in a monthly list, ready to sort into categories with a drag. Totals per category, recurring payments flagged, transfers between your own accounts skipped. Free, private, works with every UK bank, and nothing connects to your account.",
    why: [
      "Free, with no account and no subscription.",
      "Reads CSV, OFX and QIF from every UK bank, or pasted PDF text.",
      "Categories that stick: sort a merchant once and it is remembered.",
      "Recurring bills and subscriptions detected automatically.",
      "Local-first: your spending never leaves your browser.",
    ],
    steps: [
      "Export a CSV from your bank (there is a guide for each one).",
      "Import it into The Income Tracker.",
      "Sort the new merchants, and read the category totals for the month.",
    ],
    sections: [
      {
        h: "Expense tracking without the typing",
        p: [
          "Manual expense apps fail because typing every coffee gets old by week two. A bank CSV already has every payment with its date and amount. The tracker's job is the sorting, and it remembers each merchant so the second month is mostly done before you start. Cash spending is the one thing you still add by hand.",
        ],
      },
    ],
    exportNoteHtml: 'New to CSV exports? Start with the <a href="/import/">bank CSV guides</a>.',
    faqs: [
      { q: "Is there a free expense tracker that works with UK banks?", a: "Yes. The Income Tracker imports standard CSV exports from Barclays, HSBC, Lloyds, NatWest, Nationwide, Monzo, Starling, Revolut and the rest, and has an export guide for each." },
      { q: "Does it need my bank login?", a: "No. You download the CSV yourself. Nothing connects to your bank and no credentials are entered." },
      { q: "Can it track expenses across several accounts?", a: "Yes. Import a CSV from each account. Transfers between your own accounts are paired and skipped so they do not count as spending." },
    ],
    related: ["how-to-categorise-bank-transactions", "find-and-cancel-unused-subscriptions", "free-budget-planner-uk", "import"],
  },
];
