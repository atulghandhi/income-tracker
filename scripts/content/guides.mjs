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
      { q: "How should couples split bills when one earns more?", a: "Proportionally. Each pays the same percentage of the bills as their percentage of the combined income. It keeps the same amount of disposable income in proportion for each of you." },
      { q: "Can we track two different banks in one app without sharing logins?", a: "Yes. Each of you exports a CSV from your own bank and both files go into one ledger in The Income Tracker. Nothing connects to either bank." },
    ],
    related: ["import", "monthly-surplus-calculator", "budget-without-linking-bank", "how-to-categorise-bank-transactions"],
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
    related: ["self-employed-income-tracker-uk", "emergency-fund-calculator-uk", "zero-based-budgeting-uk", "import"],
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
    related: ["emergency-fund-calculator-uk", "50-30-20-budget-calculator-uk", "debt-snowball-vs-avalanche-calculator", "monthly-surplus-calculator"],
  },
];
