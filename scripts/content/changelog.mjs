// User-facing release notes, newest first. Dates are ISO. Keep entries to the
// things a person using the app would notice; internal refactors stay out.
// The first 15 entries are also published in /feed.xml.

export const CHANGELOG = [
  {
    date: "2026-10-19",
    title: "Insights moves onto the Dashboard",
    body:
      "Insights and the Dashboard showed the same kind of thing, so they are now one page. Everything Insights had (the money flow, health score, trends, categories, anomalies, spending pace and the rest) sits on the Dashboard, and Customise arranges all of it together; if you had arranged both pages, your two layouts are combined. Widgets that were on both pages appear once, the Accounts and imports card gives way to Credit & debt, which shows the same debt figures card by card, and an old Insights bookmark opens the Dashboard. Anomaly flags can now be dismissed, and the Debt payoff plan compares every strategy when you make it wide.",
  },
  {
    date: "2026-10-18",
    title: "Allocate: debt payoff strategies and lump-sum planning",
    body:
      "A new Allocate page in the sidebar splits your spare money each month, and any one-off lump sum, between the debts on Accounts, a cash buffer, a tax bill and savings. Pick the priority — least interest (avalanche), lower payments soonest, quick wins (snowball), credit-score recovery, cash buffer first, tax bill first, balanced or your own percentages — and choose where savings go: highest safe rate, highest expected return, tax wrappers first or your goals. Every strategy is simulated month by month against paying minimums only and compared on interest, debt-free date, monthly payments, card utilisation, buffer and net position, with a 0% promo guard and payment rollover. UK users can mark a lump sum as taxable — freelance income, rental profit, interest, dividends or a capital gain — and the tax to set aside is worked out from your salary band and held back before anything is allocated. A Debt payoff plan widget joins Insights and the Dashboard tray. Illustrations from your own figures, not advice, with free debt help linked on the page.",
  },
  {
    date: "2026-10-15",
    title: "A Subscriptions page",
    body:
      "Everything you pay for repeatedly, found in your own ledger with nothing to set up: subscriptions, bills and yearly renewals, each with its cost per year. Payments every 4 weeks count 13 times a year, not 12. Price rises are flagged with the extra cost per year, while charges billed in another currency are left alone when they only wobble with the exchange rate. Yearly renewals show their next date, several plans with one company are kept apart, and a direct debit nudged by a weekend or bank holiday still counts as on time. Anything that stops being paid moves to a Cancelled list; you can mark a subscription cancelled yourself, bring it back, or delete it from the list for good. Also on Insights and the Dashboard as a widget.",
  },
  {
    date: "2026-10-15",
    title: "Import PDF bank statements directly",
    body:
      "Choose the PDF statement your bank gives you from Import data in Settings and review its transactions on the same screen as a CSV: categories suggested, duplicates unticked, transfers skipped, one-click undo. The statement's table is read in your browser and never uploaded. Built around Barclays, HSBC, Lloyds, Halifax, NatWest, Santander, Nationwide, TSB, Monzo, Starling, Revolut, Chase, first direct, Metro Bank, Virgin Money and American Express layouts, and it copes with most other UK and US banks. Dates printed without a year take it from the statement period, and the running balance is checked against every amount. A PDF it cannot read (a scanned image, say) gets a clear message and the paste route still works.",
    href: "/guides/import-pdf-bank-statement.html",
    hrefLabel: "How to import a PDF statement",
  },
  {
    date: "2026-10-12",
    title: "A US experience, customisable pages and page URLs",
    body:
      "Pick your country from the top bar. United States users get American account types — checking, HYSA, CDs, HSA and FSA, 401(k) and 403(b), traditional and Roth IRA, 529 plans, auto and student loans — with plan details for contributions, employer match, tax treatment and annual limits, a gross-to-net paycheck estimate on its own Pay & tax page, federal student-loan repayment plans, medical spending against your deductible, and FICO and VantageScore credit bands. UK users gain workplace pensions and SIPPs with employer contributions, ISA and pension allowance tracking, and a PAYE, National Insurance and student-loan take-home estimate. The Dashboard and Insights pages can now be rearranged, resized and trimmed, and every page has its own address so a refresh stays where you were.",
  },
  {
    date: "2026-09-16",
    title: "Seven more bank guides, four calculators, four templates and six guides",
    body:
      "Export guides now cover 27 UK banks and card providers, adding Tesco Bank, Barclaycard, Monzo Business, Starling Business, and honest PDF-only pages for Zopa, Kroo and Marcus. New calculators: a UK budget planner, rent affordability, overdraft cost and pro rata salary. New CSV templates for weekly pay, savings goals, debt payoff and student budgets. New guides on the income and expenditure form, whether an app needs your bank login, what open banking shares, a Self Assessment countdown, budgeting for beginners, and checking a statement for errors.",
    href: "/guides/",
    hrefLabel: "Browse the guides",
  },
  {
    date: "2026-09-14",
    title: "Three new budget tools",
    body: "Convert weekly and four-weekly amounts into a monthly budget, compare income-based bill splitting with 50/50, and plan Christmas savings by payday. Each tool includes worked examples and runs in your browser without an account.",
  },
  {
    date: "2026-09-08",
    title: "Bigger help library, calculators, templates and comparisons",
    body:
      "CSV export guides now cover 20 UK banks and card providers, plus a guide for PDF-only statements. New calculators for the 50/30/20 split, emergency funds, spend-per-day until payday, snowball versus avalanche and subscription costs. Free CSV budget templates that import in one step. Honest comparisons with Emma, Snoop, Moneyhub, YNAB, Plum and Monzo Trends. A site-wide menu, an RSS feed and a What's new page.",
    href: "/guides/",
    hrefLabel: "Browse the guides",
  },
  {
    date: "2026-09-08",
    title: "Install it, and get a monthly nudge",
    body:
      "The web app can now be installed to your phone or desktop and opens offline. A one-tap calendar reminder prompts you to import last month's statement, and the dashboard points you to your bank's export guide when a new month starts empty.",
  },
  {
    date: "2026-07-21",
    title: "Skippable setup wizard and a getting-started checklist",
    body:
      "First-run setup asks for the basics in under a minute and can be skipped entirely. The dashboard checklist ticks itself off as you add income, spending, an account, a goal and your first import.",
  },
  {
    date: "2026-07-13",
    title: "Credit card CSVs no longer import back to front",
    body:
      "Card statements that list spending as positive numbers are detected and flipped automatically, with a one-click undo in the review screen. The AI categorisation toggle now explains itself when the backend is unavailable.",
  },
  {
    date: "2026-07-12",
    title: "Clearer imports, tidier rules, transfer pairing",
    body:
      "Every import shows a visible summary toast, category rules can be reviewed and pruned, and money moved between your own accounts is paired up and skipped so it never counts as spending. The iOS app gained the same behaviour.",
  },
  {
    date: "2026-07-09",
    title: "Recurring months, merchant memory and multi-format imports",
    body:
      "Recurring income and bills seed the next month on their own. The app remembers how you categorised each merchant. Quick add turns one line of text into an entry. OFX and QIF files and pasted transaction lists import alongside CSV, and repeating payments are detected and suggested as recurring.",
  },
  {
    date: "2026-07-09",
    title: "Optional AI categorisation for the leftovers",
    body:
      "Turn it on and low-confidence rows get a suggested category from a shared merchant cache. Off by default, and never sent anything the rules already handled.",
  },
  {
    date: "2026-07-07",
    title: "Debt balances roll forward automatically",
    body: "Loans and cards reduce by each month's payment, with a manual override when the statement says otherwise.",
  },
  {
    date: "2026-07-06",
    title: "New look and the right month on open",
    body: "A layered light theme with a proper dark mode, cash-flow style reports, and the app now opens on the real current month.",
  },
  {
    date: "2026-07-02",
    title: "iOS: sign in with Apple or email, quick add, duplicate review",
    body: "The iOS app syncs reliably, supports Apple and email sign-in alongside Google, and reviews CSV duplicates before committing.",
  },
  {
    date: "2026-06-18",
    title: "Work begins on a native iOS app",
    body: "A SwiftUI app sharing the same ledger engine, with home-screen widgets and private cloud sync for people who sign in.",
  },
  {
    date: "2026-06-17",
    title: "Free money calculators and use-case pages",
    body: "0% card payoff, credit utilisation, savings goal, monthly surplus and loan repayment calculators, each with the answer at the top of the page.",
    href: "/tools/",
    hrefLabel: "See the calculators",
  },
  {
    date: "2026-06-16",
    title: "Bank CSV export guides and a feedback form",
    body: "Step-by-step CSV export guides for Barclays, HSBC, Monzo, Starling, Lloyds, NatWest, Santander and Revolut. A contact form inside the app and in every page footer.",
    href: "/import/",
    hrefLabel: "Find your bank",
  },
  {
    date: "2026-06-15",
    title: "Home page demos and the annual chart",
    body: "The landing page shows the ledger, the CSV import and the annual picture in motion. The annual chart scrolls a full year without snapping back.",
  },
  {
    date: "2026-06-14",
    title: "Transfers auto-skipped, tutorials, responsive accounts",
    body: "Money moved between your own accounts is remembered and skipped on future imports. Per-page tutorials explain each view. The accounts view fits on a phone.",
  },
];
