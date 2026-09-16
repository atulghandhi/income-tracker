// Cornerstone guides. Answer-first articles targeting the questions people
// actually type. Optional per-guide fields: `published`, `related`.

export const GUIDES = [
  {
    slug: "budget-without-linking-bank",
    topic: "Budgeting basics",
    cardD: "Track spending privately from a bank CSV",
    published: "2026-06-16",
    title: "How to budget without linking your bank account (2026)",
    description:
      "You do not need open banking to budget. Here is how to track your income and spending privately in 2026 using a bank CSV. No account connection, no credentials shared.",
    h1: "How to budget without linking your bank account",
    tldr:
      "Yes, you can budget without open banking. Download a CSV of your transactions from your bank, import it into a local-first tool like The Income Tracker, and you are done. Nothing connects to your bank. No credentials shared. Your data stays in your browser.",
    sections: [
      {
        h: "Why skip the bank connection?",
        p: [
          "Most budgeting apps want to plug into your bank through open banking (Plaid, TrueLayer and the like). That hands a third party an ongoing feed of everything you spend. Plenty of people are not comfortable with that, and fair enough.",
          "Here is the good news. You do not need it. Every UK bank lets you download your own transactions as a CSV, and a CSV is all a good budgeting tool actually needs.",
        ],
      },
      {
        h: "The method, start to finish",
        p: ["Two minutes, tops."],
        ol: [
          "Download a CSV of your transactions from your bank's app or website.",
          "Import it into The Income Tracker. It reads the dates, descriptions and amounts for you.",
          "Drag transactions into categories and watch your monthly surplus update live.",
        ],
      },
      {
        h: "What you give up",
        p: [
          "Honestly? Very little. You download a file once a month instead of letting it sync on its own. In return, no third party can see your accounts, there is no connection to break or renew, and it works across every bank you use. For most people that trade is a no-brainer.",
        ],
      },
    ],
    faqs: [
      {
        q: "Can you budget without open banking?",
        a: "Yes. Download a CSV of your transactions from your bank and import it into a budgeting tool such as The Income Tracker. No open-banking connection or bank login is required.",
      },
      {
        q: "Is it safe to budget with a CSV instead of connecting my bank?",
        a: "It is safer in the sense that no third party gets ongoing access to your accounts. You export the file yourself, and with a local-first tool like The Income Tracker the data stays in your own browser.",
      },
      {
        q: "Which UK banks let you export a CSV?",
        a: "All the major ones, including Barclays, HSBC, Monzo, Starling, Lloyds, NatWest, Santander and Revolut. The Income Tracker has a step-by-step CSV guide for each.",
      },
    ],
    related: ["import", "tools", "is-it-safe-to-upload-bank-statements", "free-ynab-alternative-uk"],
  },
  {
    slug: "free-ynab-alternative-uk",
    topic: "Choosing an app",
    cardD: "YNAB's clarity without the fee",
    published: "2026-06-16",
    title: "The best free YNAB alternative in the UK (no subscription)",
    description:
      "Looking for a free YNAB alternative in the UK? The Income Tracker is free, needs no sign-up, and imports your bank CSV. No account and no bank login needed.",
    h1: "A free YNAB alternative for the UK",
    tldr:
      "Want YNAB's clarity without the monthly fee? The Income Tracker is free, needs no sign-up, and is built for the UK. Import a CSV from any UK bank, track income and spending month by month, and keep your data private in your browser.",
    sections: [
      {
        h: "What people actually want",
        p: [
          "YNAB is genuinely good. But it costs money, and its method can feel like a lot when all you want is to see your income, your spending and what is left. The usual wish list for an alternative is short: free, no subscription, works in the UK, and ideally no bank linking.",
        ],
      },
      {
        h: "How The Income Tracker compares",
        p: [
          "It is free, with no account required. It is built around UK banks, so you download a CSV from Barclays, HSBC, Monzo, Starling and others and import it in seconds. You get a month-by-month ledger, drag-and-drop categories, recurring items and an annual savings projection. No envelope system to learn.",
          "The trade-off is honest. This is not a full zero-based budgeting system like YNAB, and it will not auto-sync over open banking. If you want a simple, private, free way to see where your money goes, that is the whole point.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is there a free alternative to YNAB?",
        a: "Yes. The Income Tracker is a free, no-subscription budgeting tool for the UK. You import a CSV from your bank and track income and spending month by month, with no account or bank login required.",
      },
      {
        q: "Does the free YNAB alternative work with UK banks?",
        a: "Yes. The Income Tracker imports standard CSV exports from UK banks including Barclays, HSBC, Monzo, Starling, Lloyds, NatWest and Santander.",
      },
      {
        q: "Do I have to pay or subscribe?",
        a: "No. The Income Tracker is completely free. No credit card, no subscription, no sign-up.",
      },
    ],
    related: ["import", "tools", "spreadsheet-alternative-income-expense-tracker", "budget-without-linking-bank"],
  },
  {
    slug: "is-it-safe-to-upload-bank-statements",
    topic: "Privacy and safety",
    cardD: "What to check before you upload anything",
    published: "2026-06-16",
    title: "Is it safe to upload your bank statement to a budgeting app?",
    description:
      "Is it safe to upload a bank statement or CSV to a budgeting app? It depends on where the data goes. Here is what to check, and how a local-first tool keeps it private.",
    h1: "Is it safe to upload your bank statement to a budgeting app?",
    tldr:
      "It depends on where the file goes. The safest setup is a local-first tool that reads your CSV in your browser and never uploads it. That is exactly how The Income Tracker works. Steer clear of tools that quietly send your statement to their servers.",
    sections: [
      {
        h: "The one question that matters",
        p: [
          "Before you upload a statement anywhere, ask one thing. Does this file leave my device? There are two ways a tool can read a CSV. It can process it entirely in your browser, so the file goes nowhere. Or it can upload it to a server to be processed and maybe stored.",
          "The first is private by design. The second asks you to trust a company with a full record of your finances.",
        ],
      },
      {
        h: "Check these three things first",
        ol: [
          "Does it say the file is processed locally, in your browser? Local-first is safest.",
          "If it uploads, does the privacy policy spell out what is stored and for how long?",
          "Does it demand your bank login or open banking? You should never have to share credentials just to read a CSV.",
        ],
      },
      {
        h: "How The Income Tracker handles it",
        p: [
          "It reads your CSV directly in your browser. Your transactions sit in local storage on your device and are never sent to a server, unless you choose to sign in to sync across devices. There is no open-banking connection and you never share bank credentials.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is it safe to upload a bank statement to a budgeting app?",
        a: "It is safe if the app processes the file locally in your browser and does not upload it to a server. The Income Tracker reads your CSV in your browser and keeps the data on your device.",
      },
      {
        q: "Can a budgeting app see my bank login?",
        a: "Only if you connect your bank via open banking, and you do not need to. Importing a CSV needs no credentials. The Income Tracker never asks for your bank login.",
      },
      {
        q: "Where does The Income Tracker store my data?",
        a: "In your own browser's local storage. Nothing is uploaded unless you choose to sign in to sync across devices.",
      },
    ],
    related: ["budget-without-linking-bank", "import", "tools", "free-ynab-alternative-uk"],
  },

  // ── Added September 2026 ────────────────────────────────────────────────────
  {
    slug: "import-pdf-bank-statement",
    topic: "Importing your bank data",
    cardD: "Copy, paste, done. No converter needed.",
    published: "2026-09-08",
    readMinutes: 4,
    title: "How to import a PDF bank statement (free, no converter)",
    description:
      "Bank only gives you a PDF? You do not need a converter. Copy the transaction rows out of the PDF and paste them in. The app reads the dates, descriptions and amounts.",
    h1: "How to import a PDF bank statement",
    tldr:
      "Open the PDF, select the transaction rows, copy them, and paste them into The Income Tracker. Each line needs a date, a description and an amount, which is exactly what a statement row is. No PDF converter, no upload to a stranger's server, nothing typed by hand.",
    sections: [
      {
        h: "Why paste beats a PDF converter",
        p: [
          "Search for \"PDF bank statement to CSV\" and you will find a dozen sites offering to convert it for you. Every one of them needs you to upload a document that lists your name, your account number and everything you spent. Some are fine. You cannot tell which from the outside.",
          "Copy and paste sidesteps the whole question. The text never leaves your computer. The Income Tracker reads it in your browser, shows you every row it found, and lets you fix anything it misread before a single entry is saved.",
        ],
      },
      {
        h: "Step by step",
        ol: [
          "Open the PDF statement in any viewer: your browser, Preview on a Mac, Adobe Reader, whatever you have.",
          "Click at the start of the first transaction row and drag to the end of the last one. Do not worry about grabbing headers or the balance column; extra text is ignored.",
          "Copy (Ctrl+C on Windows, Cmd+C on a Mac).",
          "Open The Income Tracker, go to Settings, then Import data, and click Paste. On a phone, long-press in the paste box instead.",
          "Check the review screen. Each row shows the date, description and amount it found. Flip any row that landed as spending when it was income, then confirm.",
        ],
      },
      {
        h: "What the app does with each line",
        ul: [
          "It looks for a date anywhere on the line. Day and month without a year (\"13 Jun\") get the year of the month you are importing into.",
          "It takes the last money-looking number as the amount. If a line ends with two such numbers, the pattern of a statement with a running balance, it uses the first of them and ignores the balance.",
          "Amounts with no sign are treated as spending, because that is what most rows are. Salary and refund wording flips them to income automatically, and you can flip the rest with one click.",
          "Lines with no amount at all (page headers, \"Balance brought forward\", addresses) are skipped.",
          "Rows you have already imported are flagged as duplicates and unticked, so overlapping statements are safe.",
        ],
      },
      {
        h: "When the text will not copy",
        p: [
          "If you select the rows and get nothing, the PDF is a scanned image rather than text. Two options. Use the bank's app or website to export a CSV instead, which every bank in our guides can do for current accounts. Or, for a short statement, type the handful of lines into the paste box yourself: a date, a description and an amount per line is all it needs.",
        ],
      },
      {
        h: "Where this matters most",
        ul: [
          "Savings accounts that only offer PDF statements, such as some Nationwide savings products.",
          "Virgin Money accounts where the CSV export is not offered.",
          "Older months at banks that keep a short CSV window but years of PDFs.",
          "Credit card statements older than the export limit, such as Amex beyond two years.",
        ],
      },
    ],
    howto: {
      name: "How to import a PDF bank statement",
      steps: [
        "Open the PDF statement in any viewer.",
        "Select the transaction rows and copy them.",
        "In The Income Tracker open Settings, then Import data, then Paste.",
        "Review the parsed rows, flip any wrong signs, and confirm.",
      ],
    },
    faqs: [
      { q: "Can I import a PDF bank statement directly?", a: "Not as a file, and you do not need to. Copy the transaction rows from the PDF and paste them into The Income Tracker. It reads the date, description and amount from each line." },
      { q: "Is it safe to use an online PDF to CSV converter for a bank statement?", a: "Only if you trust the site with a document that lists your name, account number and every transaction. Copy and paste keeps the text on your own computer, which is why we recommend it." },
      { q: "What if my statement has a running balance column?", a: "The importer notices a line ending in two amounts and takes the first as the transaction, ignoring the balance." },
      { q: "The dates only show the day and month. Which year is used?", a: "The year of the month you are importing into. Switch to the right month first if you are pasting an older statement." },
    ],
    related: ["import", "how-to-read-a-bank-statement-csv", "is-it-safe-to-upload-bank-statements", "nationwide-csv"],
  },
  {
    slug: "how-to-read-a-bank-statement-csv",
    topic: "Importing your bank data",
    cardD: "Every column and code, explained",
    published: "2026-09-08",
    readMinutes: 5,
    title: "How to read a bank statement CSV (UK columns and codes)",
    description:
      "What the columns in a UK bank CSV mean, what codes like DD, SO, FPI, BGC and DEB stand for, and why some banks split money in and money out into two columns.",
    h1: "How to read a bank statement CSV",
    tldr:
      "A bank CSV is a plain table: one row per transaction, with a date, a description, an amount (either one signed column or separate money in and money out columns) and usually a running balance. The cryptic two or three letter codes are the payment type. DD is a Direct Debit, SO a standing order, FPI a Faster Payment in, DEB a debit card purchase.",
    sections: [
      {
        h: "The columns you will see",
        table: {
          head: ["Column", "What it holds", "Notes"],
          rows: [
            ["Transaction date", "When the payment was made or posted", "Some banks add a separate value date. The tracker uses the transaction date."],
            ["Description or narrative", "Who was paid, in the bank's shorthand", "Card payments often carry a location and a partial card number. Ignore those."],
            ["Amount", "One column, negative for money out", "Used by Monzo, Starling, Revolut and most fintechs."],
            ["Money out / money in (debit / credit)", "Two columns, both positive", "Used by Lloyds, Halifax, Nationwide, HSBC and most high street banks."],
            ["Balance", "Running balance after the row", "Useful for checking, not for budgeting. The importer ignores it."],
            ["Type", "The payment method code", "See the code table below."],
            ["Category", "The bank's own guess at a category", "Monzo and Starling include one. The tracker reads it as a hint."],
          ],
        },
      },
      {
        h: "Transaction type codes",
        p: [
          "High street banks label each row with a code. Lloyds, Halifax and Bank of Scotland use most of these; other banks use similar ones. They tell you how the money moved, which is handy when a description is unhelpful.",
        ],
        table: {
          head: ["Code", "Meaning", "Typically"],
          rows: [
            ["DD", "Direct Debit", "Bills, subscriptions, council tax"],
            ["SO", "Standing order", "Rent, savings transfers, regular payments you set up"],
            ["FPI", "Faster Payment in", "Salary from some employers, money from friends"],
            ["FPO", "Faster Payment out", "Payments you sent by bank transfer"],
            ["BGC", "Bank giro credit", "Salary, benefits, refunds paid in"],
            ["TFR", "Transfer", "Between your own accounts"],
            ["DEB", "Debit card payment", "Shops, online purchases"],
            ["CPT", "Cashpoint", "ATM withdrawals"],
            ["CHG", "Charge", "Bank fees"],
            ["INT", "Interest", "Paid or charged"],
            ["BP", "Bill payment", "One-off payments to a company"],
          ],
        },
      },
      {
        h: "Why amounts look wrong on credit cards",
        p: [
          "Credit card exports usually list purchases as positive numbers and payments to the card as negative, the opposite of a current account. If you import one and everything looks upside down, that is why. The Income Tracker detects the pattern and flips it, and the import review has a one-click undo if it guessed wrong.",
        ],
      },
      {
        h: "Dates and other traps",
        ul: [
          "UK banks write dates day first (12/09/2026). Spreadsheets sometimes flip them to month first when you open and re-save the file. Import the original download rather than a re-saved copy.",
          "Some exports include a time stamp with the date. Harmless; it is stripped.",
          "Large amounts may contain thousands separators (1,234.56). Also handled.",
          "A row with money in AND money out is almost always a reversal. Check it rather than trusting it.",
        ],
      },
      {
        h: "Do you need to clean the file first?",
        p: [
          "No. Download it, import it. The tracker finds the date, description and amount columns by their headers, whatever order they are in, and shows you the result before anything is saved. If you like, open the file in a spreadsheet first just to see what is in it; then import the original.",
        ],
      },
    ],
    faqs: [
      { q: "What does DD mean on a bank statement?", a: "Direct Debit: a payment a company collects from your account on an agreed date, covered by the Direct Debit Guarantee." },
      { q: "What is the difference between FPI and FPO?", a: "FPI is a Faster Payment coming in; FPO is one going out. Both are ordinary bank transfers." },
      { q: "What does BGC mean?", a: "Bank giro credit, an older label for money paid into your account, often salary or a refund." },
      { q: "Do I need to edit the CSV before importing it?", a: "No. The Income Tracker reads standard bank exports as they come. Import the original download rather than a copy re-saved from a spreadsheet." },
    ],
    related: ["import", "import-pdf-bank-statement", "how-to-categorise-bank-transactions", "lloyds-csv"],
  },
  {
    slug: "how-to-categorise-bank-transactions",
    topic: "Importing your bank data",
    cardD: "A category list that you will actually keep up",
    published: "2026-09-08",
    readMinutes: 5,
    title: "How to categorise bank transactions (a list that sticks)",
    description:
      "How to categorise bank transactions for a budget: the ten categories that cover most UK households, rules that stop overthinking, and how to make sorting automatic.",
    h1: "How to categorise bank transactions",
    tldr:
      "Use about ten categories, decide them once, and let rules do the repeat work. Housing, Bills, Groceries, Transport, Eating out, Subscriptions, Health, Shopping, Fun and Savings cover almost everyone. Transfers between your own accounts are not spending at all, so keep them out.",
    sections: [
      {
        h: "Start with ten, not thirty",
        p: [
          "The urge is to be precise: coffee separate from lunch, petrol separate from parking. Precision is what kills budgets. By week three there are forty categories and a growing pile of unsorted rows. Ten coarse buckets show you where the money goes and take seconds to maintain. You can always split one later when a specific question comes up.",
        ],
        table: {
          head: ["Category", "What goes in", "Needs or wants"],
          rows: [
            ["Housing", "Rent or mortgage, council tax, home insurance", "Need"],
            ["Bills", "Energy, water, broadband, mobile, TV licence", "Need"],
            ["Groceries", "Supermarkets, the corner shop, the milk", "Need"],
            ["Transport", "Fuel, fares, parking, car insurance and tax", "Need"],
            ["Health", "Prescriptions, dentist, gym, glasses", "Mostly need"],
            ["Eating out", "Restaurants, takeaways, coffee, the pub", "Want"],
            ["Subscriptions", "Streaming, apps, memberships, cloud storage", "Want"],
            ["Shopping", "Clothes, home, gadgets, gifts", "Want"],
            ["Fun", "Days out, holidays, hobbies, tickets", "Want"],
            ["Savings and debt", "Transfers to savings, extra debt payments", "Savings"],
          ],
        },
      },
      {
        h: "Four rules that settle every argument",
        ul: [
          "Transfers are not spending. Money moved to your own savings, your credit card or a joint account is a transfer, not an expense. The tracker skips them so they never double-count.",
          "Refunds go back to the category they came from, not into income.",
          "A supermarket trip is Groceries even if it included a birthday card. Do not split rows unless the non-grocery part is big.",
          "When you cannot decide in three seconds, pick the coarser category and move on. Consistency beats accuracy.",
        ],
      },
      {
        h: "Make it automatic",
        p: [
          "The first month is the only one that takes effort. Categorise a merchant once and The Income Tracker remembers it: the next Tesco row, the next TfL row, the next Netflix row land in the right place on import. Unknown merchants get a suggestion from built-in rules (payroll wording is income, a known card issuer is a debt payment), and anything low-confidence is queued for you to confirm. Most people are down to a handful of decisions per month by the second import.",
        ],
      },
      {
        h: "Needs, wants, savings",
        p: [
          "The needs and wants column above is the one that makes the categories useful. Add up the needs and compare them with your take-home pay. If needs are eating more than half, no amount of cutting takeaways will fix the month. That is a housing or bills problem, and it is better to know.",
        ],
      },
    ],
    faqs: [
      { q: "How many budget categories should I have?", a: "Around ten. Enough to see the shape of your spending, few enough to keep up with. Split a category only when a specific question needs it." },
      { q: "Should transfers to savings count as spending?", a: "No. They are money moving between your own accounts. Track them as savings, and keep them out of your expenses total." },
      { q: "How do I categorise a refund?", a: "Put it back in the category the original purchase came from. It reduces that category's total rather than adding to income." },
      { q: "Can categorisation be automatic?", a: "Yes. The Income Tracker remembers how you categorised each merchant and applies it on the next import. Built-in rules cover common cases like salary and card payments." },
    ],
    related: ["how-to-read-a-bank-statement-csv", "50-30-20-budget-calculator-uk", "import", "monthly-money-review-checklist"],
  },
  {
    slug: "monthly-money-review-checklist",
    topic: "Saving money",
    cardD: "A ten-minute routine that keeps the budget alive",
    published: "2026-09-08",
    readMinutes: 4,
    title: "The 10-minute monthly money review checklist",
    description:
      "A ten-minute monthly money review: export last month's statement, import it, sort the strays, check recurring bills, compare with last month, move the surplus.",
    h1: "The 10-minute monthly money review",
    tldr:
      "Once a month, right after payday: export last month's transactions, import them, categorise the few strays, check nothing recurring has crept up, compare the month with the one before, move the surplus somewhere useful, and make one decision. Ten minutes. The tracker can put the reminder in your calendar.",
    sections: [
      {
        h: "The checklist",
        ol: [
          "Export last month from your bank as a CSV. Your bank's steps are in the CSV guides; most take under a minute.",
          "Import it. Duplicates are skipped, transfers between your accounts are skipped, known merchants land in their categories.",
          "Sort the strays. Usually five to ten rows the app was not sure about. Drag each into a category; it remembers for next time.",
          "Check the recurring list. Anything new? Anything that went up at renewal? Anything you meant to cancel?",
          "Compare with last month. Income, spending, surplus. Which category moved, and why?",
          "Move the surplus. Savings, the emergency fund, an extra debt payment. Money left in the current account gets spent.",
          "Make one decision for next month. One. Cancel a thing, cap a category, or raise the savings transfer. More than one and none of them happen.",
        ],
      },
      {
        h: "Why once a month, and why after payday",
        p: [
          "Daily tracking is a hobby, not a habit; almost nobody keeps it up. Monthly is often enough to catch problems while they are small, and it lines up with how your bills and pay already arrive. Doing it just after payday means the whole previous month is in the statement and you still have the surplus in hand to move.",
        ],
      },
      {
        h: "Put it in the calendar",
        p: [
          "Good intentions do not survive a busy week. Inside The Income Tracker, Settings has an Add a monthly reminder button that drops a repeating event into Google Calendar, Apple Calendar or Outlook, with a link back to your bank's export guide. Set it for the day after payday and let the calendar nag you.",
        ],
      },
    ],
    howto: {
      name: "Monthly money review",
      steps: [
        "Export last month's transactions from your bank as a CSV.",
        "Import the file into The Income Tracker.",
        "Categorise the rows the app was unsure about.",
        "Check recurring bills for changes.",
        "Compare income, spending and surplus with last month.",
        "Move the surplus to savings or debt.",
        "Decide one change for next month.",
      ],
    },
    faqs: [
      { q: "How often should I review my budget?", a: "Monthly, just after payday, when the previous month is complete and the surplus is still in your account. Ten minutes is enough if the import is doing the heavy lifting." },
      { q: "What should a monthly budget review include?", a: "Import the month, sort the unknown rows, check recurring bills, compare with last month, move the surplus and pick one change for next month." },
      { q: "Can the app remind me?", a: "Yes. Settings has an Add a monthly reminder button that creates a repeating calendar event with a link to your bank's export guide." },
    ],
    related: ["import", "find-and-cancel-unused-subscriptions", "monthly-surplus-calculator", "how-to-categorise-bank-transactions"],
  },
  {
    slug: "find-and-cancel-unused-subscriptions",
    topic: "Saving money",
    cardD: "Find them in your statement, then cancel the right way",
    published: "2026-09-08",
    readMinutes: 5,
    title: "Find and cancel unused subscriptions from your bank statement",
    description:
      "How to spot forgotten subscriptions in a UK bank statement and cancel each type properly: Direct Debits, standing orders, card continuous payments and app stores.",
    h1: "How to find and cancel unused subscriptions",
    tldr:
      "Export three months of transactions, import them, and look for the same amount from the same name every month. That list is your subscriptions. Cancel the ones you do not use with the company first, then, if it is a card payment, tell your bank to block the continuous payment authority. Banks must stop a CPA when you ask.",
    sections: [
      {
        h: "Find them in three minutes",
        ol: [
          "Export the last three months from your bank as a CSV and import it into The Income Tracker. Three months catches quarterly and annual charges too.",
          "Open the recurring view. The app flags anything that repeats with the same name and a similar amount, which is the definition of a subscription.",
          "Read the list slowly. Two streaming services doing the same job? A gym from a different life? An app you tried once? A charity you meant to review? Note each one.",
          "Check the card statements as well as the current account. Card subscriptions are the ones people forget, because they never appear in the bank's Direct Debit list.",
        ],
      },
      {
        h: "The usual culprits",
        ul: [
          "Streaming: video, music, audiobooks, and the second video service you got for one show.",
          "Phone extras: cloud storage, insurance, add-ons sold at the upgrade.",
          "App subscriptions billed through Apple or Google, which show up as a single unhelpful line.",
          "Free trials that quietly converted.",
          "Memberships: gym, clubs, magazines, premium versions of free apps.",
          "Old insurance or breakdown cover on a car you no longer own.",
        ],
      },
      {
        h: "Cancel the right way for each type",
        table: {
          head: ["How it is paid", "How to cancel", "Notes"],
          rows: [
            ["Direct Debit", "Tell the company, then cancel the Direct Debit in your banking app", "Covered by the Direct Debit Guarantee: mistaken collections are refunded by your bank."],
            ["Standing order", "Cancel it yourself in your banking app", "It is your instruction to the bank, so you control it. Tell the recipient if there is a contract."],
            ["Card continuous payment (CPA)", "Cancel with the company; if they will not, tell your bank or card issuer to stop it", "Under UK payment rules your bank must cancel a CPA when you ask. Keep a note of the date."],
            ["App store subscription", "Cancel in your Apple ID or Google Play subscriptions screen", "Cancelling the app or deleting it does not cancel the subscription."],
          ],
        },
      },
      {
        h: "Two rights worth knowing",
        p: [
          "Under the Direct Debit Guarantee, if a company takes a payment in error your bank refunds it and sorts it out with the company. And for most things bought online or over the phone you have a 14-day cooling-off period under the Consumer Contracts Regulations, so a subscription you signed up for last week can usually be cancelled for a full refund.",
        ],
      },
      {
        h: "Stop it happening again",
        p: [
          "Keep the recurring list in the tracker up to date and look at it during your monthly review. New subscriptions show up as new recurring rows within a month or two of starting, while they are still cheap to kill. The subscription cost calculator turns a few pounds a month into the five-year number, which is usually the push you need.",
        ],
      },
    ],
    howto: {
      name: "Find unused subscriptions in a bank statement",
      steps: [
        "Export three months of transactions from your bank as a CSV.",
        "Import the file into The Income Tracker and open the recurring view.",
        "List every repeating payment you do not use.",
        "Cancel each one with the company, then with your bank or card issuer if needed.",
      ],
    },
    sources: [
      { t: "MoneyHelper: Direct Debits and standing orders", href: "https://www.moneyhelper.org.uk/en/everyday-money/banking/direct-debits-and-standing-orders" },
      { t: "Which?: Direct Debits and standing orders explained", href: "https://www.which.co.uk/money/banking/banking-security-and-payment-methods/direct-debits-and-standing-orders-explained-aU1tE5d00CI5" },
      { t: "The Consumer Contracts Regulations 2013 (legislation.gov.uk)", href: "https://www.legislation.gov.uk/uksi/2013/3134/contents/made" },
    ],
    faqs: [
      { q: "How do I find subscriptions on my bank statement?", a: "Look for the same name and a similar amount repeating every month or year. Importing three months into The Income Tracker flags them automatically in the recurring view." },
      { q: "Can my bank cancel a subscription for me?", a: "For a Direct Debit, yes, you can cancel it in your banking app. For a card payment (a continuous payment authority), your bank or card issuer must stop it when you ask, though you should also tell the company." },
      { q: "Does deleting an app cancel the subscription?", a: "No. Cancel it in your Apple ID or Google Play subscriptions settings, otherwise it keeps billing." },
      { q: "What is the Direct Debit Guarantee?", a: "A protection on every Direct Debit: if a payment is taken in error, your bank refunds it immediately and takes it up with the company." },
    ],
    related: ["subscription-cost-calculator", "household-bills-tracker-template", "monthly-money-review-checklist", "how-to-read-a-bank-statement-csv"],
  },
  {
    slug: "budgeting-for-couples-separate-accounts-uk",
    updated: "2026-09-14",
    topic: "Budgeting basics",
    cardD: "One picture from two banks, without a shared login",
    published: "2026-09-08",
    readMinutes: 5,
    title: "Budgeting as a couple with separate accounts (UK)",
    description:
      "How UK couples with separate accounts budget together: the 50/50 split, the proportional split and yours-mine-ours, plus one ledger for both banks without shared logins.",
    h1: "Budgeting as a couple with separate accounts",
    tldr:
      "You do not need a joint account or a shared banking login to budget as a couple. Pick a split for the shared costs (equal, proportional to income, or a joint bills pot), then import each person's bank CSV into one ledger. Transfers between you are skipped automatically, so nothing double-counts.",
    sections: [
      {
        h: "Three models, pick one",
        table: {
          head: ["Model", "How it works", "Best when"],
          rows: [
            ["50/50", "Shared bills split down the middle; everything else is personal", "Incomes are similar"],
            ["Proportional", "Each pays the share of bills that matches their share of income (earn 60% of the total, pay 60% of the bills)", "Incomes differ a lot"],
            ["Yours, mine, ours", "Both pay an agreed amount into a joint account that covers bills; personal accounts stay personal", "You want one place to watch the bills and privacy everywhere else"],
          ],
        },
        p: [
          "Proportional is the fairest and the least used, because it needs a quick calculation. Do it once: add both take-home pays, work out each share, apply it to the monthly bills total. Revisit when a pay packet changes.",
        ],
      },
      {
        h: "See both banks without sharing a login",
        p: [
          "Budgeting apps built on open banking want both of you to connect your accounts to the same app, which means both of you trusting the same company with everything. A CSV does the same job with none of that. Each person exports their own statement from their own bank, and the files go into one ledger on one device.",
        ],
        ol: [
          "Each partner exports last month as a CSV from their own bank. The CSV guides cover every major UK bank.",
          "Import both files into the same ledger in The Income Tracker.",
          "Money sent between you (the monthly bills contribution, paying each other back) is recognised as a transfer and skipped, so it never shows as spending.",
          "Categorise once; the app remembers merchants for both of you.",
        ],
      },
      {
        h: "What to look at together",
        ul: [
          "The shared bills total, and whether the split still feels fair.",
          "The surplus, and where it should go: joint savings, a shared goal, or a split.",
          "One category each that surprised you. Not to argue about it; to notice it.",
        ],
      },
      {
        h: "Keep the personal stuff personal",
        p: [
          "The point of separate accounts is that nobody audits the other's coffee. Keep personal spending in one coarse category per person if you like, and spend the review time on the joint numbers. A budget that feels like surveillance does not last.",
        ],
      },
    ],
    faqs: [
      { q: "Do couples need a joint account to budget together?", a: "No. Agree a split for the shared bills and track both accounts in one ledger. A joint bills account is convenient, not essential." },
      { q: "How should couples split bills when one earns more?", a: "One option is an income-based split: each pays the same share of the bills as their share of combined take-home income. Compare it with 50/50 and agree what works for your circumstances, including caring responsibilities and personal commitments." },
      { q: "Can we track two different banks in one app without sharing logins?", a: "Yes. Each of you exports a CSV from your own bank and both files go into one ledger in The Income Tracker. Nothing connects to either bank." },
    ],
    related: ["split-bills-by-income-calculator", "import", "monthly-surplus-calculator", "budget-without-linking-bank", "how-to-categorise-bank-transactions"],
  },
  {
    slug: "zero-based-budgeting-uk",
    topic: "Budgeting basics",
    cardD: "Give every pound a job, without the spreadsheet purgatory",
    published: "2026-09-08",
    readMinutes: 5,
    title: "Zero-based budgeting in the UK: the simple version",
    description:
      "What zero-based budgeting is, a lighter UK version built around payday and monthly bills, how to set it up from last month's bank CSV, and where it goes wrong.",
    h1: "Zero-based budgeting, the simple version",
    tldr:
      "Zero-based budgeting means every pound of take-home pay is assigned a job before the month starts: bills, food, transport, fun, savings, until income minus assignments equals zero. The simple UK version uses last month's real transactions as the starting point, so you are adjusting numbers rather than inventing them.",
    sections: [
      {
        h: "The idea in one line",
        p: [
          "Income minus every planned use of it equals zero. Not zero in the bank; zero unassigned. Savings and debt payments are jobs like any other, which is why the method works: the money for them is allocated before it can be spent.",
        ],
      },
      {
        h: "Set it up from a bank CSV, not from scratch",
        ol: [
          "Export last month from your bank and import it into The Income Tracker. Now you have real category totals rather than guesses.",
          "Copy the recurring rows forward. Rent, council tax, energy, broadband and the rest seed the new month automatically.",
          "Set an amount for each variable category, starting from last month's actual and nudging it up or down.",
          "Assign what is left. Savings, emergency fund, an extra debt payment, a sinking fund for the car or Christmas. Keep going until the surplus reads zero.",
          "During the month, spend from the categories. When one runs dry, move money from another rather than overspending; that is the whole discipline.",
        ],
      },
      {
        h: "Where it goes wrong, and the fix",
        table: {
          head: ["Problem", "Fix"],
          rows: [
            ["Forty categories and constant tinkering", "Ten categories. Coarse is fine."],
            ["Irregular bills wreck the month (car tax, insurance, Christmas)", "Sinking funds: assign a twelfth of each annual cost every month."],
            ["Variable income", "Budget on the lowest recent month and treat the rest as bonus. See the variable income guide."],
            ["It becomes a second job", "Do it once a month, after payday, in ten minutes. Let the import do the recording."],
          ],
        },
      },
      {
        h: "Do you need YNAB for this?",
        p: [
          "YNAB is the best-known zero-based tool and it is genuinely good at it, with a price to match. You do not need it to use the method. A monthly ledger with categories, recurring items and a surplus figure does the job, and The Income Tracker does that for free without a bank login. If you want the full envelope workflow with goals per category, YNAB earns its fee.",
        ],
      },
    ],
    faqs: [
      { q: "What is zero-based budgeting?", a: "A method where every pound of income is assigned to a category, including savings and debt payments, until nothing is left unassigned. Income minus planned uses equals zero." },
      { q: "Does zero-based budgeting mean spending everything?", a: "No. It means allocating everything. Savings and debt payments count as allocations, so money is set aside on purpose rather than left over by accident." },
      { q: "What is a sinking fund?", a: "A monthly set-aside for a cost that arrives once or twice a year, such as car insurance, so the bill is already covered when it lands." },
      { q: "Is there a free zero-based budgeting app in the UK?", a: "The Income Tracker gives you categories, recurring items and a surplus figure for free with no bank login, which is enough to run the method. YNAB is the paid, fuller version." },
    ],
    related: ["free-ynab-alternative-uk", "budget-on-a-variable-income-uk", "50-30-20-budget-calculator-uk", "monthly-budget-planner-template"],
  },
  {
    slug: "budget-on-a-variable-income-uk",
    updated: "2026-09-14",
    topic: "Budgeting basics",
    cardD: "Freelance, shifts, commission: budget on the low month",
    published: "2026-09-08",
    readMinutes: 5,
    title: "How to budget on a variable income (UK guide)",
    description:
      "A budgeting method for irregular income in the UK: find your baseline month, pay yourself a fixed amount, build a buffer, and keep a tax pot if self-employed.",
    h1: "How to budget on a variable income",
    tldr:
      "Budget on your lowest recent month, not your average. Pay yourself a fixed amount from a buffer account on the same day each month, and let the good months fill the buffer. If you are self-employed, skim a fixed share of every payment into a tax pot before it touches anything else.",
    sections: [
      {
        h: "Find the baseline",
        ol: [
          "Export the last six months from your bank and import them into The Income Tracker.",
          "Read the income figure for each month. The lowest one is your baseline. Not the average; averages hide the bad months.",
          "Build the monthly budget on the baseline. If it covers the essentials, the method works. If it does not, the problem is the essentials, and that needs a separate look.",
        ],
      },
      {
        h: "Pay yourself a salary",
        p: [
          "Send everything you earn into one holding account (a separate current account or a savings account with easy access). On a fixed date each month, transfer the baseline amount to the account you spend from. That transfer is your salary. In a good month the holding account grows; in a thin month it carries you. After a few good months you will have a buffer of one or two months' salary, and the anxiety mostly goes.",
        ],
      },
      {
        h: "If you are self-employed, add the tax pot",
        p: [
          "Before any money reaches the holding account, move a fixed share of each payment into a tax pot. Many sole traders use 20 to 30 percent, adjusting once they know their actual bill. Log the transfer as \"Set aside for tax\" so it never looks spendable. The self-employed guide covers the deadlines and the digital record rules that start applying from April 2026.",
        ],
      },
      {
        h: "What to do with the good months",
        ul: [
          "First, fill the buffer to two months of the baseline.",
          "Then the emergency fund, three to six months of essential outgoings.",
          "Then raise the salary, cautiously. A pay rise you give yourself is easy to cut if the work dips.",
        ],
      },
      {
        h: "Track the range, not just the number",
        p: [
          "The month-by-month view is the whole point for irregular earners. Twelve months side by side show the seasonality (quiet January, busy autumn) that a single monthly total hides. Once you can see the pattern you can plan for it rather than being surprised by it every year.",
        ],
      },
    ],
    faqs: [
      { q: "How do you budget with an irregular income?", a: "Budget on your lowest recent month, pay yourself that amount on a fixed date from a holding account, and let better months build a buffer in the holding account." },
      { q: "How big should the buffer be?", a: "Aim for two months of your baseline salary in the holding account, then build a separate emergency fund of three to six months of essential outgoings." },
      { q: "How much should a self-employed person set aside for tax?", a: "A fixed share of every payment, commonly 20 to 30 percent, adjusted once you know your actual bill. Keep it in a separate pot." },
    ],
    related: ["weekly-to-monthly-budget-calculator", "self-employed-income-tracker-uk", "emergency-fund-calculator-uk", "zero-based-budgeting-uk", "import"],
  },
  {
    slug: "self-employed-income-tracker-uk",
    topic: "Self-employed",
    cardD: "Records, deadlines and MTD, in plain English",
    published: "2026-09-08",
    checked: "2026-09-08",
    readMinutes: 7,
    title: "Self-employed income tracking for Self Assessment (UK, 2026)",
    description:
      "For UK sole traders: what records to keep, the 2025/26 Self Assessment deadlines, the £1,000 trading allowance, and what Making Tax Digital means from April 2026.",
    h1: "Track self-employed income and expenses for Self Assessment",
    tldr:
      "Keep a dated record of every payment in and every business cost out, with a category that matches the expense headings on the self-employment pages of the tax return, and a tax pot. Import your business account's CSV each month and the record builds itself. If your gross self-employed and property income is over £50,000 you are in Making Tax Digital from April 2026, which adds quarterly updates through HMRC-recognised software.",
    sections: [
      {
        h: "What HMRC expects you to keep",
        ul: [
          "A record of all sales and income, and all business expenses, with dates.",
          "Evidence: invoices, receipts, bank statements. Digital copies are fine.",
          "Records kept for at least five years after the 31 January submission deadline of the tax year they relate to.",
          "If you are in Making Tax Digital: digital records of each transaction's amount, date and category, kept in compatible software.",
        ],
      },
      {
        h: "Deadlines for the 2025/26 tax year (6 April 2025 to 5 April 2026)",
        table: {
          head: ["What", "When"],
          rows: [
            ["Register for Self Assessment if you are new", "5 October 2026"],
            ["Paper return", "31 October 2026"],
            ["Online return and payment of tax owed", "31 January 2027"],
            ["Payments on account (if they apply)", "31 January and 31 July, each usually half of last year's bill"],
          ],
        },
        p: [
          "Payments on account catch people out in year two. If last year's bill was over £1,000 and mostly not collected at source, HMRC asks for half of it again in advance, twice a year. The tax pot is how you avoid the January shock.",
        ],
      },
      {
        h: "The £1,000 trading allowance",
        p: [
          "If your gross trading income for the year is £1,000 or less you can use the trading allowance and do not need to report it. Above that, you register and file, and you choose between deducting the £1,000 allowance or your actual expenses, whichever is higher. The government has announced that the reporting threshold will rise to £3,000 within this Parliament, with a simpler online service for people between £1,000 and £3,000, but no start date has been confirmed, so plan on the £1,000 rule until GOV.UK says otherwise.",
        ],
      },
      {
        h: "Making Tax Digital for Income Tax: who, and when",
        table: {
          head: ["From", "Qualifying income over"],
          rows: [
            ["6 April 2026", "£50,000"],
            ["6 April 2027", "£30,000"],
            ["6 April 2028", "£20,000"],
          ],
        },
        p: [
          "Qualifying income is your gross income (turnover, before expenses) from self-employment and property combined, judged on the tax return two years earlier. PAYE employment, dividends and pensions do not count towards it. If you are in, you keep digital records in HMRC-recognised software, send four quarterly updates a year (deadlines 7 August, 7 November, 7 February and 7 May) and still submit a year-end return through the software.",
          "Be clear about what The Income Tracker is and is not. It is a free way to see your income, expenses and surplus month by month from a bank CSV, with categories that mirror the tax return headings. It is not MTD-recognised software and does not submit anything to HMRC. If you are inside MTD you will need recognised software for the submissions; the tracker still earns its place for the day-to-day picture, and the categorised export goes into whatever you file with.",
        ],
      },
      {
        h: "A monthly routine that keeps January boring",
        ol: [
          "On the first working day of the month, export last month from your business account as a CSV.",
          "Import it. Categorise anything new under the Self Assessment headings; the app remembers each client and supplier afterwards.",
          "Move your tax share of last month's income into the tax pot and log it.",
          "Save the receipts for anything over a few pounds to one folder, named by date.",
          "Glance at the year-to-date totals. Income, expenses, tax set aside. If the tax pot is short, fix it now, not in January.",
        ],
      },
    ],
    howto: {
      name: "Track self-employed income and expenses monthly",
      steps: [
        "Export last month's transactions from your business bank account as a CSV.",
        "Import the file into The Income Tracker and categorise new rows under the Self Assessment expense headings.",
        "Transfer a fixed share of income to a tax pot and record it.",
        "File receipts by date and check the year-to-date totals.",
      ],
    },
    sources: [
      { t: "GOV.UK: check if you're eligible for Making Tax Digital for Income Tax", href: "https://www.gov.uk/guidance/check-if-youre-eligible-for-making-tax-digital-for-income-tax" },
      { t: "GOV.UK: work out your qualifying income for Making Tax Digital", href: "https://www.gov.uk/guidance/work-out-your-qualifying-income-for-making-tax-digital-for-income-tax" },
      { t: "GOV.UK: Self Assessment deadlines", href: "https://www.gov.uk/self-assessment-tax-returns/deadlines" },
      { t: "GOV.UK: payments on account", href: "https://www.gov.uk/understand-self-assessment-bill/payments-on-account" },
      { t: "GOV.UK: tax-free allowances on property and trading income", href: "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income" },
      { t: "GOV.UK: 300,000 people to be taken out of tax returns (reporting threshold announcement)", href: "https://www.gov.uk/government/news/boost-for-side-hustlers-as-300000-people-to-be-taken-out-of-tax-returns-government-announces" },
    ],
    faqs: [
      { q: "What records do I need to keep as a sole trader?", a: "Dated records of all income and business expenses, with invoices, receipts and bank statements as evidence, kept for at least five years after the filing deadline. Inside Making Tax Digital, the records must be digital and kept in compatible software." },
      { q: "When is the Self Assessment deadline for 2025/26?", a: "Online returns and payment are due by 31 January 2027. Paper returns by 31 October 2026. New filers must register by 5 October 2026." },
      { q: "Do I need Making Tax Digital software?", a: "Only if your gross self-employed and property income is over the threshold: £50,000 from April 2026, £30,000 from April 2027 and £20,000 from April 2028. Below that, you file a normal Self Assessment return. The Income Tracker is not MTD software; it is for tracking, not submitting." },
      { q: "How much should I set aside for tax?", a: "A fixed share of every payment, commonly 20 to 30 percent, adjusted once you have seen a real bill. Keep it in a separate pot and remember payments on account." },
    ],
    related: ["self-employed-income-tracker-template", "budget-on-a-variable-income-uk", "tide-csv", "import"],
  },
  {
    slug: "how-much-should-i-save-each-month-uk",
    updated: "2026-09-14",
    topic: "Saving money",
    cardD: "A target you can defend, and the order to save in",
    published: "2026-09-08",
    checked: "2026-09-08",
    readMinutes: 5,
    title: "How much should I save each month? (UK guide)",
    description:
      "How much to save each month in the UK: the 20% guideline, why the first £1,000 matters most, the three-to-six-month emergency fund, and how to find your own number.",
    h1: "How much should you save each month?",
    tldr:
      "The common guideline is 20% of take-home pay, from the 50/30/20 rule. The more useful answer is an order: first £1,000 in instant-access savings, then three to six months of essential outgoings as an emergency fund, then the percentage. Around three in ten UK adults have under £1,000 saved, so the first milestone is a real one.",
    sections: [
      {
        h: "The guideline and where it comes from",
        p: [
          "The 50/30/20 rule, popularised by Elizabeth Warren and Amelia Warren Tyagi in All Your Worth (2005), puts 50% of take-home pay on needs, 30% on wants and 20% on savings and debt repayment. Twenty percent is a good long-run target. It is also more than many people can manage this month, which is where the order below comes in.",
        ],
      },
      {
        h: "Save in this order",
        ol: [
          "A £1,000 starter fund in an instant-access account. Enough to absorb a boiler part or a car repair without a credit card. The FCA's 2024 Financial Lives survey found 10% of UK adults had no cash savings and another 21% had under £1,000, so getting here already puts you ahead of a large share of the country.",
          "Clear expensive debt. Anything on a credit card or overdraft at 20% or more costs far more than savings earn; the snowball versus avalanche calculator shows the order.",
          "An emergency fund of three to six months of essential outgoings. MoneyHelper's rule of thumb. Essential means rent, bills, food and transport, not your full spending.",
          "Then the percentage. Push towards 20% of take-home pay, split between long-term savings, a pension top-up if you have one, and specific goals.",
        ],
      },
      {
        h: "Work out your own number",
        p: [
          "Import last month's bank CSV into The Income Tracker and read two figures: your surplus (income minus spending) and your essential outgoings (Housing, Bills, Groceries, Transport, Health). The surplus is what you can save now. The essentials, multiplied by three to six, is your emergency fund target. The emergency fund calculator turns those into a monthly amount and a date.",
        ],
      },
      {
        h: "A note on where to keep it",
        p: [
          "Emergency money belongs in an instant-access account, not investments. The Personal Savings Allowance lets basic-rate taxpayers earn £1,000 of interest a year tax-free (£500 for higher-rate), and a cash ISA shelters interest beyond that. The overall ISA allowance is £20,000 for 2026/27; from April 2027 the cash portion for under-65s is due to be capped at £12,000 within that total.",
        ],
      },
    ],
    sources: [
      { t: "MoneyHelper: emergency savings, how much is enough", href: "https://www.moneyhelper.org.uk/en/savings/types-of-savings/emergency-savings-how-much-is-enough" },
      { t: "FCA: Financial Lives 2024 survey, key findings", href: "https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-key-findings.pdf" },
      { t: "GOV.UK: tax on savings interest (Personal Savings Allowance)", href: "https://www.gov.uk/apply-tax-free-interest-on-savings" },
      { t: "GOV.UK: Individual Savings Accounts", href: "https://www.gov.uk/individual-savings-accounts" },
      { t: "GOV.UK: ISA reform 2027 factsheet", href: "https://www.gov.uk/government/publications/fiscal-events-2026-factsheets/isa-reform-2027-anti-circumvention-rules-factsheet" },
    ],
    faqs: [
      { q: "What percentage of my salary should I save?", a: "The common guideline is 20% of take-home pay. If that is out of reach, start with whatever your surplus allows and build a £1,000 starter fund first." },
      { q: "How big should an emergency fund be in the UK?", a: "MoneyHelper suggests three to six months of essential outgoings in an instant-access account. Essential means rent, bills, food and transport." },
      { q: "Should I save or pay off debt first?", a: "Build a small starter fund, then clear expensive debt, then build the full emergency fund. Interest on cards and overdrafts is usually far higher than savings rates." },
      { q: "How do I know what I can afford to save?", a: "Import your bank CSV into The Income Tracker and read the surplus. That figure, month after month, is your real saving capacity." },
    ],
    related: ["christmas-budget-savings-calculator", "emergency-fund-calculator-uk", "50-30-20-budget-calculator-uk", "debt-snowball-vs-avalanche-calculator", "monthly-surplus-calculator"],
  },
  // Added 16 September 2026.
  {
    slug: "income-and-expenditure-form-uk",
    topic: "Budgeting basics",
    cardD: "The Standard Financial Statement, filled in from real statements",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    readMinutes: 7,
    title: "How to fill in an income and expenditure form (UK, 2026)",
    description:
      "What an income and expenditure form is, who asks for one (creditors, debt advisers, courts, lenders), the Standard Financial Statement categories, and how to fill it in accurately from your bank statements.",
    h1: "How to fill in an income and expenditure form",
    tldr:
      "An income and expenditure form lists everything coming in and everything going out each month, so a creditor, adviser, lender or court can see what you can genuinely afford. Most UK creditors and advice charities now use one shared layout, the Standard Financial Statement. Fill it in from three months of real bank statements rather than memory, convert every figure to a monthly amount, include the irregular costs, and keep the evidence.",
    sections: [
      {
        h: "Who asks for one, and why",
        p: [
          "You will meet this form when you ask a creditor for a payment arrangement, when a debt adviser at StepChange, Citizens Advice or National Debtline sets up a plan, when a mortgage lender discusses arrears, when a court considers how much you can pay towards a judgment, and sometimes when a landlord or lender checks affordability. In every case the question is the same: after essential costs, what is left?",
          "The form is not a test you pass or fail. A realistic form that shows a small surplus, or none, is more useful to everyone than an optimistic one that falls apart in month two.",
        ],
      },
      {
        h: "The Standard Financial Statement",
        p: [
          "Since 2017 the UK debt advice sector has used the Standard Financial Statement, overseen by the Money and Pensions Service. Creditors who sign up to it agree to accept the same layout and the same spending guidelines, so you fill it in once and everyone works from the same numbers. It also has a savings line, so you can set aside a small amount each month (the guideline allows up to £20) without a creditor objecting.",
          "If a creditor sends their own form, the categories will be close enough that a completed Standard Financial Statement transfers across in minutes.",
        ],
      },
      {
        h: "What counts as income",
        ul: [
          "Take-home pay from every job, after tax, National Insurance and pension. Use the amount that actually lands.",
          "Benefits and tax credits: Universal Credit, Child Benefit, PIP, State Pension and so on.",
          "Pension income, maintenance received, rent from a lodger, and any regular money from family.",
          "Irregular income (overtime, self-employed earnings): average the last three to six months rather than picking a good one.",
        ],
      },
      {
        h: "What counts as expenditure",
        table: {
          head: ["Group", "Typical lines", "Where the number comes from"],
          rows: [
            ["Fixed costs", "Rent or mortgage, council tax, gas and electricity, water, insurance, TV licence, broadband, phones", "Direct debits and standing orders on the statement"],
            ["Living costs", "Food and household shopping, travel, car costs, childcare, school costs, clothing, health", "Card spending, averaged over three months"],
            ["Flexible costs", "Subscriptions, entertainment, eating out, gifts, hobbies", "Card spending, averaged; be honest"],
            ["Priority debts", "Rent or mortgage arrears, council tax arrears, energy arrears, court fines, child maintenance, tax", "Letters and statements from each creditor"],
            ["Non-priority debts", "Credit cards, loans, overdrafts, catalogues, buy-now-pay-later", "Current balances and minimum payments"],
          ],
        },
      },
      {
        h: "Fill it in from your bank statements, not from memory",
        p: [
          "People underestimate their spending by a wide margin when they guess. The fix is mechanical. Download the last three months of transactions from each account as a CSV, import them into The Income Tracker, and let it group them by category. The monthly average for each category goes straight onto the form. A quarter is long enough to catch the annual car insurance, the dentist and the school trip that a single month misses.",
          "Anything paid yearly or quarterly gets divided into a monthly figure. Anything paid weekly is multiplied by 52 and divided by 12, not by four. The weekly to monthly calculator on this site does that conversion.",
        ],
      },
      {
        h: "Mistakes that get forms sent back",
        ul: [
          "Leaving out costs because they feel embarrassing. Put them in. An adviser has seen it all and a creditor would rather see the real picture.",
          "Forgetting priority debts. Rent, council tax, energy, fines and child maintenance come before credit cards, and the form must show that order.",
          "Counting the same money twice, for example a savings transfer that also appears as a bill.",
          "Using what you plan to spend instead of what you did spend. Fill it in from the statements first, then note what you intend to cut.",
          "Not keeping evidence. Keep the statements, payslips and benefit letters the figures came from.",
        ],
      },
    ],
    howto: {
      name: "Fill in an income and expenditure form from your bank statements",
      steps: [
        "Download the last three months of transactions from every account as CSV files.",
        "Import them into The Income Tracker and check each merchant is in the right category.",
        "Read the average monthly total for each category and enter it on the form under the matching heading.",
        "Add income lines from payslips and benefit letters, and priority debts from creditor letters.",
        "Subtract total expenditure from total income. The result is the amount available for non-priority creditors.",
      ],
    },
    sources: [
      { t: "Standard Financial Statement: about the SFS", href: "https://sfs.moneyadviceservice.org.uk/en/what-is-the-sfs" },
      { t: "MoneyHelper: budget planner", href: "https://www.moneyhelper.org.uk/en/everyday-money/budgeting/budget-planner" },
      { t: "StepChange: how to make a budget", href: "https://www.stepchange.org/debt-info/how-to-make-a-budget.aspx" },
      { t: "National Debtline: your budget", href: "https://nationaldebtline.org/get-information/guides/your-budget-ew/" },
      { t: "Citizens Advice: work out your budget", href: "https://www.citizensadvice.org.uk/debt-and-money/budgeting/budgeting/work-out-your-budget/" },
    ],
    faqs: [
      { q: "What is an income and expenditure form?", a: "A monthly statement of all your income and all your outgoings, used by creditors, debt advisers, lenders and courts to see what you can afford to pay. In the UK most of them use the Standard Financial Statement layout." },
      { q: "Is there a free income and expenditure form template?", a: "Yes. This site has a free CSV income and expenditure template with the standard headings, and MoneyHelper offers an online budget planner. Both are free and need no sign-up." },
      { q: "Should I include irregular costs like car repairs?", a: "Yes. Average them over the year and enter a monthly figure. A form with no allowance for repairs, birthdays or the dentist is not realistic and will not last." },
      { q: "What if my expenditure is higher than my income?", a: "Say so on the form. That is exactly the situation the advice charities exist for. Contact StepChange, Citizens Advice or National Debtline, all free, before agreeing payments you cannot make." },
    ],
    related: ["income-and-expenditure-form-template", "monthly-surplus-calculator", "weekly-to-monthly-budget-calculator", "how-to-categorise-bank-transactions", "import"],
  },
  {
    slug: "does-a-budgeting-app-need-my-bank-login",
    topic: "Privacy and safety",
    cardD: "What 'connect your bank' really means, and the alternative",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    readMinutes: 5,
    title: "Does a budgeting app need your bank login? (UK, 2026)",
    description:
      "No budgeting app needs your online banking password. Here is how UK apps actually get your transactions (open banking or a file you download), what each one means for your privacy, and the one warning sign to never ignore.",
    h1: "Does a budgeting app need your bank login?",
    tldr:
      "No. A budgeting app needs your transactions, not your login. UK apps that connect to your bank use open banking, a regulated consent you grant on your bank's own site or app, never by typing your password into the budgeting app. Apps that avoid connections altogether work from a CSV you download yourself. If any app asks for your online banking password or your card PIN, close it.",
    sections: [
      {
        h: "The three ways an app can get your transactions",
        table: {
          head: ["Method", "What you hand over", "Status in the UK"],
          rows: [
            ["Screen scraping", "Your actual online banking username and password", "Largely gone since the 2019 rules on strong customer authentication. Treat any app still asking as a red flag."],
            ["Open banking", "A consent, given on your bank's own login page, to share account data with a regulated provider", "The standard route for Emma, Snoop, Plum and most connected apps"],
            ["File import", "A CSV, OFX or QIF you download from your bank and open in the app", "How The Income Tracker works. Nothing connects to the bank at all."],
          ],
        },
      },
      {
        h: "What happens when you tap 'connect your bank'",
        p: [
          "The app sends you to your bank. You log in there, with your bank, and approve a list of what can be shared: account details, balances and transactions. The bank issues the app a token that lets it read that data. The app never sees your password. The provider must be authorised by the Financial Conduct Authority, or be an agent of one, and it has to ask you to reconfirm the consent every 90 days.",
          "That is a genuinely safer design than the old scraping approach. It is still an ongoing feed of everything you spend to a company you have to trust with it, and it is worth reading what that company does with the data before you approve.",
        ],
      },
      {
        h: "Warning signs",
        ul: [
          "A form inside the app asking for your online banking password, memorable word or card PIN.",
          "A 'connect' flow that does not send you to your bank's own website or app.",
          "No mention of FCA authorisation, and no entry for the company on the FCA register.",
          "A privacy policy that allows selling transaction data to third parties.",
        ],
      },
      {
        h: "The route that needs no login at all",
        p: [
          "Every UK bank lets you download your own transactions. You export a CSV, drop it into The Income Tracker, and the file is read in your browser. No credentials, no consent to manage, no company holding a live feed of your account. It costs you a minute a month. For most people that is the right trade, and it is why the bank export guides on this site exist.",
        ],
      },
    ],
    sources: [
      { t: "FCA: open banking", href: "https://www.fca.org.uk/firms/open-banking" },
      { t: "Open Banking Limited: what is open banking?", href: "https://www.openbanking.org.uk/what-is-open-banking/" },
      { t: "FCA: the Financial Services Register", href: "https://register.fca.org.uk/" },
      { t: "Take Five to Stop Fraud: advice", href: "https://www.takefive-stopfraud.org.uk/advice/" },
    ],
    faqs: [
      { q: "Is it safe to give a budgeting app my bank login?", a: "You should never need to. Regulated UK apps use open banking, where you log in with your bank rather than the app. An app that asks for your password directly is not following the rules." },
      { q: "Can an open banking app move my money?", a: "Not with a data-sharing consent. Payment initiation is a separate consent you would have to approve each time. Account information access is read-only." },
      { q: "How do I budget without connecting my bank?", a: "Download a CSV from your bank and import it into a tool that reads files locally, such as The Income Tracker. There is a step-by-step export guide for every major UK bank on this site." },
    ],
    related: ["what-does-open-banking-share", "is-it-safe-to-upload-bank-statements", "budget-app-without-open-banking", "import"],
  },
  {
    slug: "what-does-open-banking-share",
    topic: "Privacy and safety",
    cardD: "Exactly what a connected app can see, and how to switch it off",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    readMinutes: 5,
    title: "What does open banking share about you? (and how to revoke it)",
    description:
      "Exactly what data a UK open banking app can read once you consent (balances, 12 months of transactions, direct debits, standing orders), how often it refreshes, how long it can keep it, and how to revoke access at the app or at your bank.",
    h1: "What does open banking share about you?",
    tldr:
      "With your consent, an account information provider can read your account name and numbers, balances, up to 12 months of transaction history, and your standing orders, direct debits and saved payees. It can refresh that data several times a day for 90 days, after which it must ask you to reconfirm. It cannot move money unless you approve a separate payment consent. You can revoke access in the app's settings or from your bank's list of connected apps at any time.",
    sections: [
      {
        h: "The data an app can read",
        ul: [
          "Account details: the account name, sort code and account number, and the type of account.",
          "Balances: current and available, including any overdraft.",
          "Transactions: typically up to 12 months of history at the first connection, then new items as they arrive. Each row carries the date, amount, merchant or payee name and the bank's own description.",
          "Regular payments: your standing orders and direct debits, plus saved beneficiaries.",
          "What it does not get: your login details, your card PIN, and the ability to move money without a separate, explicit payment consent.",
        ],
      },
      {
        h: "How often, and for how long",
        p: [
          "The connection can pull fresh data up to four times a day without you doing anything. Consent lasts 90 days, then the app must ask you to confirm it again. Deleting the app does not by itself revoke the consent, which is the bit people miss. Revoke it explicitly.",
          "How long the company keeps the data after you disconnect is set by its own privacy policy under UK GDPR, not by the open banking rules. Some delete on disconnection, some keep it for years. Read the policy before you connect, not after.",
        ],
      },
      {
        h: "How to revoke access",
        ol: [
          "In the budgeting app: find the connected accounts screen and choose disconnect or revoke for each bank.",
          "At your bank: most banking apps have a page called something like Connected apps, Third-party access or Manage open banking. Barclays, Monzo, Starling, NatWest and Lloyds all list every active consent there, with a button to remove it.",
          "Check the app is authorised: search the FCA register for the company name. If it is not there, and not listed as an agent of a firm that is, revoke immediately.",
        ],
      },
      {
        h: "If you would rather share nothing",
        p: [
          "The zero-consent route is a file. Download a CSV from your bank once a month and import it into The Income Tracker. It reads the file in your browser, no company gets a live feed, and there is nothing to revoke later.",
        ],
      },
    ],
    sources: [
      { t: "Open Banking Limited: what is open banking?", href: "https://www.openbanking.org.uk/what-is-open-banking/" },
      { t: "FCA: open banking", href: "https://www.fca.org.uk/firms/open-banking" },
      { t: "FCA: the Financial Services Register", href: "https://register.fca.org.uk/" },
      { t: "ICO: your right to get your data deleted", href: "https://ico.org.uk/for-the-public/your-right-to-get-your-data-deleted/" },
    ],
    faqs: [
      { q: "Can open banking apps see my password?", a: "No. You log in on your bank's own page and the bank issues the app a token. The app never sees your credentials." },
      { q: "How much transaction history does open banking share?", a: "Usually up to 12 months at the first connection, then ongoing. Some banks share less; the consent screen at your bank states the range." },
      { q: "Does deleting the app stop it accessing my account?", a: "Not necessarily. Revoke the consent in the app or from your bank's connected apps page. Consents also expire after 90 days if not reconfirmed." },
      { q: "Is there a budgeting app that does not use open banking?", a: "Yes. The Income Tracker works from a CSV you download yourself, so no consent is ever granted." },
    ],
    related: ["does-a-budgeting-app-need-my-bank-login", "budget-app-without-open-banking", "is-it-safe-to-upload-bank-statements", "budget-without-linking-bank"],
  },
  {
    slug: "self-assessment-countdown-checklist",
    topic: "Self-employed",
    cardD: "Six weeks of small jobs so 31 January is boring",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    readMinutes: 6,
    title: "Self Assessment countdown: get your records ready before 31 January",
    description:
      "A six-week plan for the 2025/26 Self Assessment return: register by 5 October, find your UTR, export a year of business transactions, total them under HMRC's expense headings, check payments on account, and file before 31 January 2027.",
    h1: "Self Assessment countdown: a six-week plan",
    tldr:
      "The online return for the 2025/26 tax year (6 April 2025 to 5 April 2026) is due by 31 January 2027, and any tax owed is due the same day. Six jobs, one a week: register if you are new (deadline 5 October 2026), find your UTR and Government Gateway login, export twelve months of business bank transactions, total income and expenses under HMRC's headings, check whether payments on account apply, and set the money aside. Start in November and January is boring.",
    sections: [
      {
        h: "The dates that matter",
        table: {
          head: ["What", "When"],
          rows: [
            ["Register for Self Assessment if this is your first return", "5 October 2026"],
            ["Paper return", "31 October 2026"],
            ["Online return, and payment of tax owed", "31 January 2027"],
            ["First payment on account for 2026/27, if it applies", "31 January 2027"],
            ["Second payment on account", "31 July 2027"],
          ],
        },
        p: [
          "Miss the filing date and there is an automatic £100 penalty, even if you owe nothing. After three months it becomes £10 a day for up to 90 days, with further penalties at six and twelve months. Late tax attracts interest from 1 February and a 5% surcharge once it is 30 days late.",
        ],
      },
      {
        h: "Week by week",
        ol: [
          "Week 1: register, or find your login. New to Self Assessment? Register on GOV.UK now; the Unique Taxpayer Reference arrives by post and takes up to ten working days. Already registered? Confirm your Government Gateway login works and note your UTR.",
          "Week 2: export the year. Download transactions from 6 April 2025 to 5 April 2026 from every business account as CSV files. Most banks let you set a custom range; some cap it at 12 or 18 months, so do it now rather than in January.",
          "Week 3: categorise. Import the files into The Income Tracker and put every business row under one of HMRC's expense headings (below). The app remembers each supplier, so the second pass is fast.",
          "Week 4: gather the rest. P60 or P45 from any employment, bank interest, dividends, rental income, pension contributions, Gift Aid donations, student loan plan, and any Child Benefit if income is over £60,000.",
          "Week 5: check payments on account. If last year's bill was over £1,000 and less than 80% of it was collected at source, HMRC expects two advance payments for the next year. Your January payment may be the balance plus half of next year's estimate.",
          "Week 6: file. Do it in December or early January rather than on the 31st, when the site is slow and mistakes are expensive. Pay by bank transfer, debit card or Direct Debit; card payments take time to clear.",
        ],
      },
      {
        h: "HMRC's expense headings",
        p: [
          "The self-employment pages group expenses under fixed headings. Use the same names as categories in your tracker and the return fills itself in.",
        ],
        ul: [
          "Cost of goods bought for resale or goods used",
          "Car, van and travel expenses",
          "Wages, salaries and other staff costs",
          "Rent, rates, power and insurance costs",
          "Repairs and maintenance of property and equipment",
          "Phone, fax, stationery and other office costs",
          "Advertising and business entertainment costs (entertainment is not allowable)",
          "Interest on bank and other loans",
          "Bank, credit card and other financial charges",
          "Accountancy, legal and other professional fees",
          "Other business expenses",
        ],
      },
      {
        h: "Simplified expenses: sometimes easier",
        p: [
          "Sole traders can use flat rates instead of actual costs for three things: vehicles (45p a mile for the first 10,000 business miles, 25p after), working from home (£10, £18 or £26 a month depending on hours), and living at your business premises. Flat rates save receipts but are not always the cheaper choice, so work both out once.",
        ],
      },
    ],
    howto: {
      name: "Prepare a Self Assessment return in six weeks",
      steps: [
        "Register for Self Assessment or confirm your Government Gateway login and UTR.",
        "Export transactions for 6 April to 5 April from every business account as CSV.",
        "Import the files and categorise each row under HMRC's expense headings.",
        "Collect P60s, interest, dividend and pension figures.",
        "Estimate the bill, including any payments on account, and set the money aside.",
        "File online before 31 January and pay by a method that clears in time.",
      ],
    },
    sources: [
      { t: "GOV.UK: Self Assessment deadlines", href: "https://www.gov.uk/self-assessment-tax-returns/deadlines" },
      { t: "GOV.UK: Self Assessment penalties", href: "https://www.gov.uk/self-assessment-tax-returns/penalties" },
      { t: "GOV.UK: register for Self Assessment", href: "https://www.gov.uk/register-for-self-assessment" },
      { t: "GOV.UK: payments on account", href: "https://www.gov.uk/understand-self-assessment-bill/payments-on-account" },
      { t: "GOV.UK: expenses if you're self-employed", href: "https://www.gov.uk/expenses-if-youre-self-employed" },
      { t: "GOV.UK: simplified expenses", href: "https://www.gov.uk/simpler-income-tax-simplified-expenses" },
    ],
    faqs: [
      { q: "When is the Self Assessment deadline for the 2025/26 tax year?", a: "Online returns and payment are due by 31 January 2027. Paper returns by 31 October 2026. First-time filers must register by 5 October 2026." },
      { q: "What is the penalty for filing late?", a: "£100 immediately, then £10 a day after three months for up to 90 days, with further penalties at six and twelve months. Late payment adds interest and a 5% surcharge after 30 days." },
      { q: "What records do I need for Self Assessment?", a: "Dated records of all business income and expenses with receipts and bank statements, plus P60s, interest, dividend and pension figures. Keep them for at least five years after the filing deadline." },
      { q: "Can The Income Tracker submit my return?", a: "No. It is a free tracker for seeing income, expenses and what to set aside. You file through HMRC's website or recognised software; the categorised totals from the tracker go straight into the boxes." },
    ],
    related: ["self-employed-income-tracker-uk", "self-employed-income-tracker-template", "monzo-business-csv", "starling-business-csv", "tide-csv"],
  },
  {
    slug: "how-to-budget-for-beginners-uk",
    topic: "Budgeting basics",
    cardD: "Twenty minutes, one bank statement, three numbers",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    readMinutes: 6,
    title: "How to budget: a beginner's guide for the UK (2026)",
    description:
      "How to make a budget for the first time in the UK: find your take-home pay, pull one month of real transactions, sort them into ten categories, read your three numbers, pick a method, and check it monthly.",
    h1: "How to budget: a beginner's guide",
    tldr:
      "A budget is your income minus your spending, planned before the month starts and checked after it ends. Start with one month of real bank transactions, not estimates. Sort them into about ten categories and you will know your essentials, your flexible spending and your surplus (or deficit) inside twenty minutes. Then decide three things: what to cut, what to save, and when you will look again.",
    sections: [
      {
        h: "Step 1: know what actually lands",
        p: [
          "Use take-home pay, after tax, National Insurance, pension and student loan. Add benefits and any regular extra income. If you are paid weekly or four-weekly, convert to a monthly average (weekly times 52, divided by 12) and remember some months will have an extra payday.",
        ],
      },
      {
        h: "Step 2: get one month of real transactions",
        p: [
          "Guessing is where budgets die. Download last month's transactions from your bank as a CSV. Every UK bank can do it and this site has a guide for each. Import the file into The Income Tracker and every line is on screen with its date and amount. Only got a PDF? Copy the rows and paste them in.",
        ],
      },
      {
        h: "Step 3: ten categories, no more",
        p: [
          "Housing, Bills, Groceries, Transport, Debt, Subscriptions, Eating out, Shopping, Health, Savings. Drag each transaction into one. Thirty categories look thorough and get abandoned by week three; ten is enough to see where the money goes.",
        ],
      },
      {
        h: "Step 4: read your three numbers",
        table: {
          head: ["Number", "How to get it", "What it tells you"],
          rows: [
            ["Essentials", "Housing + Bills + Groceries + Transport + minimum debt payments", "What the month costs before any choices"],
            ["Flexible spending", "Everything else except savings", "Where cuts are possible"],
            ["Surplus", "Income minus everything", "What you can save, or the size of the problem"],
          ],
        },
      },
      {
        h: "Step 5: pick a method you will keep",
        table: {
          head: ["Method", "In one line", "Suits"],
          rows: [
            ["50/30/20", "Half on needs, 30% on wants, 20% to savings and debt", "A simple target with room to move"],
            ["Zero-based", "Every pound gets a job before the month starts", "People who like control"],
            ["Pay yourself first", "Move savings on payday, spend what remains", "People who hate tracking"],
          ],
        },
        p: [
          "None is better in general. The best method is the one you are still doing in March.",
        ],
      },
      {
        h: "Step 6: the ten-minute monthly check",
        p: [
          "On the first weekend of the month, import the new statement, categorise what is new (the app remembers the rest), and compare the three numbers with last month. Adjust one thing. That habit, repeated, is the entire skill.",
        ],
      },
      {
        h: "If the surplus is negative",
        p: [
          "First, pay the priority bills: rent or mortgage, council tax, energy, and anything with a court or licence behind it. Then cut flexible spending and look at subscriptions. If it still does not balance, talk to a free advice service such as StepChange, Citizens Advice or National Debtline before it becomes arrears. A negative number on a budget is information, not a verdict.",
        ],
      },
    ],
    howto: {
      name: "Make your first monthly budget",
      steps: [
        "Write down your monthly take-home pay and any benefits.",
        "Download last month's transactions from your bank as a CSV and import them.",
        "Sort every transaction into one of ten categories.",
        "Add up essentials, flexible spending and the surplus.",
        "Choose a method (50/30/20, zero-based or pay yourself first) and set next month's numbers.",
        "Repeat the check on the first weekend of each month.",
      ],
    },
    sources: [
      { t: "MoneyHelper: budget planner", href: "https://www.moneyhelper.org.uk/en/everyday-money/budgeting/budget-planner" },
      { t: "MoneyHelper: beginner's guide to managing your money", href: "https://www.moneyhelper.org.uk/en/everyday-money/budgeting/beginners-guide-to-managing-your-money" },
      { t: "Citizens Advice: work out your budget", href: "https://www.citizensadvice.org.uk/debt-and-money/budgeting/budgeting/work-out-your-budget/" },
    ],
    faqs: [
      { q: "How do I start a budget with no experience?", a: "Get one month of real bank transactions, sort them into ten categories, and read three numbers: essentials, flexible spending and surplus. That takes about twenty minutes and tells you exactly where you stand." },
      { q: "What is the easiest budgeting method?", a: "Pay yourself first is the least effort: move savings on payday and spend the rest. 50/30/20 gives a target to aim for. Zero-based is the most control and the most work." },
      { q: "Do I need an app to budget?", a: "No, but it saves typing. A free tool that reads your bank CSV, such as The Income Tracker, does the sorting and totals so the monthly check takes minutes." },
      { q: "How often should I check my budget?", a: "Once a month, on a set day, is enough for most people. Weekly checks help in the first two months while the habit forms." },
    ],
    related: ["budget-planner-uk", "50-30-20-budget-calculator-uk", "zero-based-budgeting-uk", "monthly-money-review-checklist", "how-to-categorise-bank-transactions"],
  },
  {
    slug: "check-bank-statement-for-errors-and-unknown-charges",
    topic: "Privacy and safety",
    cardD: "The monthly sweep, and your rights when something is wrong",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    readMinutes: 6,
    title: "How to check your bank statement for errors and unknown charges (UK)",
    description:
      "A monthly routine for spotting unknown payments, wrong amounts and forgotten subscriptions on a UK bank statement, plus your rights: the Direct Debit Guarantee, chargeback, Section 75, and refunds for unauthorised payments.",
    h1: "How to check your bank statement for errors and unknown charges",
    tldr:
      "Once a month, run down every transaction and ask three questions: do I recognise it, is the amount right, and do I still want it? Unknown card payments can be disputed through your bank by chargeback, credit card purchases over £100 are also covered by Section 75, direct debits are protected by the Direct Debit Guarantee, and a payment you did not authorise must normally be refunded by the end of the next business day unless the bank can show you acted fraudulently or with gross negligence.",
    sections: [
      {
        h: "The monthly sweep",
        ol: [
          "Import last month's CSV into The Income Tracker so every transaction is in one list.",
          "Sort by merchant. New merchants you have not categorised before are the ones to look at first.",
          "Check the recurring payments against the amount you expect. A subscription that quietly went up is the most common find.",
          "Look for duplicates on the same day with the same amount, and for small test payments of a pound or two from unfamiliar names.",
          "Flag anything you cannot place. Do not guess; find out.",
        ],
      },
      {
        h: "Decoding names you do not recognise",
        p: [
          "Statement descriptions are the merchant's legal or processor name, not the shop sign. A restaurant might appear under its holding company, and a lot of online spending shows as PayPal, Amazon, Apple or Google with the real seller hidden. Search the exact descriptor text; it usually resolves in seconds. Check with anyone else who uses the account. Check the date against your calendar. If it still does not fit, it is a dispute.",
        ],
      },
      {
        h: "Your protections, in one table",
        table: {
          head: ["Situation", "Protection", "What to do"],
          rows: [
            ["A direct debit taken in error, or the wrong amount", "Direct Debit Guarantee: immediate refund from your bank", "Contact your bank; you do not need to go to the company first"],
            ["A card payment you did not make", "Payment Services Regulations: refund by the end of the next business day, unless the bank shows fraud or gross negligence", "Report it to the bank immediately and ask for the refund"],
            ["Goods or services paid by debit or credit card that did not arrive or were not as described", "Chargeback through the card scheme, normally within 120 days", "Ask the bank or card issuer to raise a chargeback"],
            ["Credit card purchase between £100 and £30,000 that went wrong", "Section 75 of the Consumer Credit Act: the card issuer is jointly liable", "Claim from the card issuer in writing"],
            ["Tricked into sending a bank transfer (authorised push payment fraud)", "Mandatory reimbursement rules since October 2024, up to £85,000 in most cases", "Report to the bank within 13 months; most claims are settled within five business days"],
          ],
        },
      },
      {
        h: "What to do, step by step",
        ol: [
          "Ring the number on the back of your card or use the in-app chat. Say clearly whether the payment was unauthorised, wrong, or a purchase that failed.",
          "Ask the bank to block the card if the details may be compromised, and to stop any continuous payment authority you did not agree to.",
          "Write down the date, the person you spoke to and what was agreed.",
          "If the bank refuses and you disagree, ask for a final response, then take it to the Financial Ombudsman Service, which is free.",
        ],
      },
    ],
    sources: [
      { t: "Bacs: the Direct Debit Guarantee", href: "https://www.directdebit.co.uk/direct-debit-guarantee/" },
      { t: "MoneyHelper: how to get your money back after a scam or unauthorised transaction", href: "https://www.moneyhelper.org.uk/en/money-troubles/scams/how-to-get-your-money-back-after-a-scam" },
      { t: "Which?: Section 75 and chargeback", href: "https://www.which.co.uk/consumer-rights/advice/how-do-i-use-chargeback-abZ2d4z3nT8q" },
      { t: "Payment Systems Regulator: APP fraud reimbursement", href: "https://www.psr.org.uk/our-work/app-scams/" },
      { t: "Financial Ombudsman Service: disputed transactions", href: "https://www.financial-ombudsman.org.uk/consumers/complaints-can-help/banking-payments/disputed-transactions" },
    ],
    faqs: [
      { q: "What should I do if I see a payment I do not recognise?", a: "Search the exact descriptor and check with anyone else on the account. If it is still unknown, report it to your bank straight away as unauthorised. The bank must normally refund by the end of the next business day unless it can show you were at fault." },
      { q: "How far back can I dispute a card payment?", a: "Chargeback claims usually need to be raised within 120 days of the payment or the date goods were due. Section 75 claims on credit cards can go back six years." },
      { q: "Can my bank refund a direct debit?", a: "Yes. Under the Direct Debit Guarantee your bank refunds an incorrect direct debit immediately, and you do not need the company's permission." },
      { q: "How often should I check my statement?", a: "Once a month is the minimum. Importing the CSV into a tracker and sorting by merchant makes it a ten-minute job." },
    ],
    related: ["find-and-cancel-unused-subscriptions", "monthly-money-review-checklist", "how-to-categorise-bank-transactions", "how-to-read-a-bank-statement-csv"],
  },
];
