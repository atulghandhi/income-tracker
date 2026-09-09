// User-facing release notes, newest first. Dates are ISO. Keep entries to the
// things a person using the app would notice; internal refactors stay out.
// The first 15 entries are also published in /feed.xml.

export const CHANGELOG = [
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
