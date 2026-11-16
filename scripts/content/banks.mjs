// Bank CSV import guides. One high-intent long-tail page per UK bank.
// `steps` are sourced from each bank's current export flow. Each entry may
// carry `published` (ISO date) so the sitemap/schema keep the original
// publish date; anything without it falls back to the site-wide default.

const BASE_BANKS = [
  {
    slug: "barclays-csv",
    group: "High street banks",
    published: "2026-06-16",
    landing: "barclays-csv-budget-planner",
    name: "Barclays",
    where: "Barclays Online Banking on a computer (the app cannot export CSV)",
    steps: [
      "Log in to Barclays Online Banking on a computer.",
      "Choose the account you want and click <em>Show recent transactions</em>.",
      "Scroll down and click <em>View all transactions</em>.",
      "Pick a start and end date, then click <em>Search</em>.",
      "Scroll to the bottom, click <em>Export all</em>, then choose <em>CSV (Excel)</em>.",
      "Save the file and drop it into The Income Tracker.",
    ],
    note: "Barclays only offers CSV export on the desktop Online Banking site. The mobile app cannot do it.",
  },
  {
    slug: "hsbc-csv",
    group: "High street banks",
    published: "2026-06-16",
    name: "HSBC UK",
    where: "HSBC Online Banking on desktop, from the transactions list rather than the PDF statement",
    steps: [
      "Log on to HSBC UK Online Banking in a browser. The mobile app only downloads PDF statements.",
      "Choose the account you want to export.",
      "Select <em>Search and filter</em> above the transactions list and set your date range, then select <em>Search</em>.",
      "Scroll to the bottom of the results and click <em>Download</em>.",
      "Choose <em>CSV</em> as the format (Excel is offered too) and select <em>Continue</em>.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "HSBC's official statements are PDF only and go back six years. The CSV comes from the transactions list instead, so if a long search returns less than you expected, run it again in shorter date ranges and import each file. Overlaps are safe.",
  },
  {
    slug: "monzo-csv",
    group: "App-based banks and fintechs",
    published: "2026-06-16",
    landing: "monzo-csv-expense-tracker",
    name: "Monzo",
    where: "the Monzo app (iOS or Android)",
    steps: [
      "Open the Monzo app and find your transaction feed.",
      "Tap <em>Manage</em> next to the account (or the three dots on a business card).",
      "Tap <em>Bank statements</em>.",
      "Choose the date range you want.",
      "Select <em>CSV</em> as the format and generate the statement.",
      "Share or save the file, then import it into The Income Tracker.",
    ],
    note: "Monzo also offers PDF and QIF. Pick CSV for the cleanest import.",
  },
  {
    slug: "starling-csv",
    group: "App-based banks and fintechs",
    published: "2026-06-16",
    landing: "starling-csv-budget-tracker",
    name: "Starling Bank",
    where: "the Starling app or web banking",
    steps: [
      "Open the Starling app and go to the account you want.",
      "Tap the account name, then <em>Account</em> or <em>Account information</em>.",
      "Tap <em>Statements</em> (or <em>Export statement</em>).",
      "Choose your date range and select <em>CSV</em> as the format.",
      "Save the file and drop it into The Income Tracker.",
    ],
    note: "Starling lets you export specific date ranges as CSV, which is handy for filling one month at a time.",
  },
  {
    slug: "lloyds-csv",
    group: "High street banks",
    published: "2026-06-16",
    name: "Lloyds Bank",
    where: "Lloyds Internet Banking on a computer (the app cannot export CSV)",
    steps: [
      "Log in to Lloyds Internet Banking on a computer.",
      "Open the account and find the <em>Statement options</em> box above the transactions.",
      "Click it and choose <em>Export transactions (CSV, QIF)</em>.",
      "Set your date range and choose <em>CSV</em>.",
      "The file downloads as <em>exportStatements-xx.csv</em>, ready to import into The Income Tracker.",
    ],
    note: "Lloyds caps each export at the last 12 months and 150 transactions. Hit the cap? Export again with a narrower date range and import each file.",
  },
  {
    slug: "natwest-csv",
    group: "High street banks",
    published: "2026-06-16",
    name: "NatWest",
    where: "NatWest Online Banking on desktop",
    steps: [
      "Log in to NatWest Online Banking on a computer.",
      "Select <em>Statements &amp; transactions</em> from the main menu.",
      "Choose <em>View transactions</em>, pick the account and set your date range.",
      "Click <em>View transactions</em>, then choose to export.",
      "From the format drop-down, select <em>Excel, Lotus, 123, Text (CSV file)</em>.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Always set the date range before exporting so you capture the full period you want.",
  },
  {
    slug: "santander-csv",
    group: "High street banks",
    published: "2026-06-16",
    name: "Santander UK",
    where: "Santander Online Banking on desktop",
    steps: [
      "Log in to Santander Online Banking on a computer.",
      "From <em>My accounts and transactions</em>, choose the account.",
      "Click <em>Download transactions</em> above the transactions table.",
      "In the <em>Download to</em> drop-down, choose <em>midata (CSV)</em>.",
      "Click <em>Download</em>, confirm the details and click <em>Continue</em>. The file saves as a CSV.",
      "Import the file into The Income Tracker.",
    ],
    note: "Santander's midata file covers 12 months of transactions. It leaves out your name, address and account number and masks some sensitive transactions. That is by design, and the file still imports fine.",
  },
  {
    slug: "revolut-csv",
    group: "App-based banks and fintechs",
    published: "2026-06-16",
    name: "Revolut",
    where: "the Revolut app or web app",
    steps: [
      "Open Revolut and go to <em>Accounts</em>.",
      "Tap <em>Statements</em> (under the account or in <em>Documents</em>).",
      "Choose your account or currency and date range.",
      "Select <em>Excel/CSV</em> as the format and generate it.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Revolut's CSV can include multi-currency columns. If a file looks messy, export one currency per file for the cleanest import.",
  },

  // ── Added September 2026. Steps verified against the provider's own help pages
  // where they exist, otherwise against accountancy import guides and consistent
  // user reports (see each entry's sources). Labels can drift; readers can flag it.
  {
    slug: "nationwide-csv",
    name: "Nationwide",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "the Nationwide Internet Bank on a computer (the Banking app only offers PDF statements)",
    formats: "CSV, OFX, midata (a CSV-style file) and PDF",
    steps: [
      "Log in to the Nationwide Internet Bank in a desktop browser, not the Banking app.",
      "Select the current account you want to export.",
      "Set the date range above the transaction list. The Internet Bank shows around 15 months.",
      "Click <em>Download transactions</em> at the top right of the transactions list.",
      "Choose <em>Download CSV file</em>. OFX and midata are offered too.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Download transactions appears on current accounts and credit cards. Some savings accounts only offer PDF statements, which import directly too. Older months live under Documents, then Statements, as PDFs going back 36 months.",
    faqs: [
      { q: "Can I export a CSV from the Nationwide app?", a: "No. The Banking app only produces PDF statements. Use the Internet Bank in a browser for CSV, OFX or midata files. On an iPhone or iPad the browser can show the option but may not download it, so a computer is the reliable route." },
    ],
    sources: [
      { t: "Nationwide: about midata downloads", href: "https://www.nationwide.co.uk/help/online-banking-help/about-midata" },
      { t: "Dead Simple Accounting: downloading a Nationwide statement (January 2026)", href: "https://www.deadsimpleaccounting.co.uk/how-to-download-a-bank-statement-from-nationwide-for-accounting/" },
      { t: "MoneySavingExpert forum: Nationwide download transactions", href: "https://forums.moneysavingexpert.com/discussion/6408564/cannot-download-transactions-for-nationwide-esavings-account" },
    ],
  },
  {
    slug: "halifax-csv",
    name: "Halifax",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "Halifax Online Banking in a web browser (the app only offers PDF statements)",
    formats: "CSV, QIF, PDF and a 12-month midata export",
    steps: [
      "Log in to Halifax Online Banking in a browser and open the account.",
      "Click <em>Search</em>, next to <em>All transactions</em>.",
      "Click <em>Edit date range</em> and enter your from and to dates. Each search covers up to 12 months, going back seven years. Click <em>Continue</em>.",
      "Leave the description and amount boxes blank, keep <em>All transaction types</em>, and run the search.",
      "Scroll to the bottom of the results and choose <em>Export .CSV</em>. <em>Export .QIF</em> sits next to it.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Each export covers at most 12 months, so a longer history means a few files. Overlaps are fine: the tracker drops duplicates. Credit card statements are not downloadable in Online Banking, only in the app as PDFs.",
    faqs: [
      { q: "Why can't I find the CSV export in the Halifax app?", a: "Because it is not there. The app's three-dot menu offers Download or print statement, which gives a PDF. CSV and QIF exports live on the website under Search transactions." },
    ],
    sources: [
      { t: "Halifax: download or print statements", href: "https://www.halifax.co.uk/helpcentre/everyday-banking/statements/download-statements.html" },
      { t: "Max Tax Back: exporting a Halifax statement (screenshots)", href: "https://maxtaxback.co.uk/business-banking-support-hub/export-a-halifax-statement/" },
      { t: "MoneySavingExpert forum: CSV transaction downloads by card", href: "https://forums.moneysavingexpert.com/discussion/6477826/which-credit-cards-offer-csv-transaction-downloads-and-for-how-many-months-years" },
    ],
  },
  {
    slug: "bank-of-scotland-csv",
    name: "Bank of Scotland",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "Bank of Scotland Internet Banking in a web browser (the app only offers PDF statements)",
    formats: "CSV, QIF and PDF",
    steps: [
      "Log in to Internet Banking in a browser and open the account.",
      "Open <em>Search transactions</em> and use <em>Edit date range</em> to set from and to dates, up to 12 months at a time.",
      "Leave the description and amount boxes blank and run the search.",
      "At the bottom of the results choose <em>Export .CSV</em> or <em>Export .QIF</em>.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Bank of Scotland shares its online platform with Halifax and Lloyds, so the screens match those guides. Business Internet Banking has the export under Statement options, then Export transactions (CSV, QIF), with a cap of 1,000 lines per file.",
    faqs: [
      { q: "Does the Bank of Scotland app export CSV?", a: "No. The app offers PDF statements only. Use Internet Banking in a browser for CSV or QIF." },
    ],
    sources: [
      { t: "Bank of Scotland: download or order a statement", href: "https://www.bankofscotland.co.uk/helpcentre/everyday-banking/statements/download-or-order-statement.html" },
      { t: "Bank of Scotland Business: view your bank statement", href: "https://business.bankofscotland.co.uk/help/account-management/view-your-bank-statement.html" },
      { t: "MoneySavingExpert forum: credit card export format", href: "https://forums.moneysavingexpert.com/discussion/6608740/credit-card-export-format" },
    ],
  },
  {
    slug: "tsb-csv",
    name: "TSB",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "TSB Internet Banking on a computer (the app only offers PDF statements in your Inbox)",
    formats: "CSV, QIF and PDF",
    steps: [
      "Log in to TSB Internet Banking on a computer.",
      "Click the account name to open its transactions.",
      "Scroll to the bottom of the list and click <em>Export</em>.",
      "Choose <em>Date Range</em> and enter start and end dates. Each file covers up to 90 days or 150 transactions.",
      "Pick <em>CSV</em> and click <em>Export</em>. The file is named exportStatements-xx.csv.",
      "Repeat with new dates for a longer period, then import each file into The Income Tracker.",
    ],
    note: "The 90-day, 150-transaction cap means a full year takes four or five files. Overlapping ranges are safe because the tracker drops duplicates. TSB's CSV dates carry a time stamp, which the importer strips.",
    faqs: [
      { q: "Can I export more than 90 days from TSB at once?", a: "Not in one file. Run the export several times with consecutive date ranges. Users report being able to go back at least five years this way." },
    ],
    sources: [
      { t: "TSB: view and download statements", href: "https://www.tsb.co.uk/help-and-support/how-to/view-and-download-statements.html" },
      { t: "EN Accounting: downloading a CSV from TSB", href: "https://enaccounting.com/download-csv-lloyds-tsb/" },
      { t: "MoneySavingExpert forum: TSB QIF download", href: "https://forums.moneysavingexpert.com/discussion/6318176/tsb-qif-file-download" },
    ],
  },
  {
    slug: "chase-uk-csv",
    name: "Chase UK",
    group: "App-based banks and fintechs",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "the Chase app (Chase has no web banking)",
    formats: "CSV and PDF",
    steps: [
      "Open the Chase app and tap your profile icon.",
      "Tap <em>Statements</em>.",
      "Pick a monthly statement, or create a custom statement with a date range of up to 90 days.",
      "Choose <em>CSV</em> as the format. PDF is the other option.",
      "Save or share the file to your computer or cloud drive, then import it into The Income Tracker.",
    ],
    note: "Custom statements are capped at 90 days each. Monthly statements appear on the 2nd of the following month (the 3rd for the credit card) and stay available for six years, even after you close the account.",
    faqs: [
      { q: "Is Chase UK PDF only?", a: "Not any more. Chase's own support page says statements can be exported as PDF or CSV, and that a custom statement can cover up to 90 days. Older third-party guides that say PDF only are out of date." },
    ],
    sources: [
      { t: "Chase UK: statements", href: "https://www.chase.co.uk/gb/en/support/statements/" },
      { t: "MoneySavingExpert forum: Chase statements thread (2023, PDF only at the time)", href: "https://forums.moneysavingexpert.com/discussion/6476698/chase-account-statements-pdf-only" },
    ],
  },
  {
    slug: "first-direct-csv",
    name: "first direct",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "first direct Online Banking in a desktop browser (the app only offers PDF statements)",
    formats: "CSV, QIF (Quicken and Microsoft Money flavours), JSON and PDF",
    steps: [
      "Log on to Online Banking in a desktop browser. The download option does not show in the app and is often hidden on phones.",
      "Select the account to open its transactions page.",
      "Use the download option on the transactions page and set a date range of up to one year.",
      "Choose <em>CSV</em>. QIF and JSON are also offered.",
      "Download, then repeat for each earlier year you need. Current accounts go back up to six years.",
      "Import each file into The Income Tracker.",
    ],
    note: "first direct's own help pages only describe PDF statements, so the label on the download option may differ from what you expect. Look on the transactions page rather than under Statements. Credit card exports cover a shorter period, around six months.",
    faqs: [
      { q: "Does first direct still offer QIF?", a: "Users report it disappeared in one redesign and came back later. CSV has been consistently available on the desktop site, which is the format the tracker prefers anyway." },
    ],
    sources: [
      { t: "first direct: statements and balances", href: "https://www.firstdirect.com/help/bank-accounts/statements-and-balances/" },
      { t: "MoneySavingExpert forum: accounts that export a year in one go", href: "https://forums.moneysavingexpert.com/discussion/6658217/current-account-with-ability-to-export-annual-transactions-in-1-go" },
      { t: "PistonHeads: first direct transaction downloads", href: "https://www.pistonheads.com/gassing/topic.asp?h=0&f=206&t=2040689" },
    ],
  },
  {
    slug: "amex-csv",
    name: "American Express",
    group: "Credit cards and business accounts",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "your American Express online account in a desktop browser (the app shows PDF statements only)",
    formats: "CSV, Excel and PDF (QIF and OFX have been withdrawn)",
    steps: [
      "Log in to your American Express online account in a desktop browser.",
      "Open <em>Statements &amp; Activity</em>.",
      "Pick a statement period, or choose <em>Custom Date Range</em>, enter your dates and search.",
      "Click the download icon above the transaction list.",
      "Choose <em>CSV</em>. Tick the option to include all additional transaction details if you want the extra columns.",
      "Download the file and import it into The Income Tracker.",
    ],
    note: "Card statements list spending as positive numbers. The tracker spots this and flips the signs so purchases land as expenses, with a one-click undo if it guesses wrong. Roughly two years of transactions are downloadable; older periods are PDF only.",
    faqs: [
      { q: "Why do my Amex purchases import as income?", a: "Credit card exports show purchases as positive amounts. The Income Tracker detects that pattern and flips the signs automatically. If a file slips through, use the flip button in the import review." },
      { q: "Can I get a QIF or OFX file from Amex UK?", a: "Not any more. Amex removed the Quicken and Money formats; CSV, Excel and PDF remain. CSV imports directly." },
    ],
    sources: [
      { t: "American Express UK: receiving card statements", href: "https://www.americanexpress.com/en-gb/customer-service/payments-and-billings/faq.receive-card-statements.html" },
      { t: "Dead Simple Accounting: downloading an American Express statement", href: "https://www.deadsimpleaccounting.co.uk/how-to-download-a-bank-statement-from-american-express/" },
      { t: "Finaloop: uploading American Express CSV statements", href: "https://help.finaloop.com/en/articles/9582937-american-express-how-to-upload-your-csv-bank-statements" },
    ],
  },
  {
    slug: "virgin-money-csv",
    name: "Virgin Money",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "Virgin Money Internet Banking in a desktop browser (the app offers PDF statements only)",
    formats: "CSV (basic or detailed) and PDF",
    steps: [
      "Sign in to Virgin Money Internet Banking in a desktop browser, not the app.",
      "Click the account you want to export.",
      "Find the download or print option above the transaction list.",
      "Set the date range.",
      "Choose <em>CSV</em>, picking the detailed version if offered, and click <em>Export transactions</em>.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Virgin Money says the export is not available on every account type. If yours only shows PDF statements, import the PDF directly instead.",
    faqs: [
      { q: "Can I export a CSV from the Virgin Money app?", a: "No. The app produces PDF statements. CSV export is on Internet Banking in a browser, and only for some account types." },
    ],
    sources: [
      { t: "Virgin Money: downloading business transactions", href: "https://uk.virginmoney.com/service/guides/business-banking/downloading-business-transactions/" },
      { t: "Virgin Money: view and download a statement", href: "https://support.virginmoney.com/subtopic/pagecontent/article/KA-01602" },
      { t: "Dead Simple Accounting: Virgin Money statements", href: "https://www.deadsimpleaccounting.co.uk/how-to-download-bank-statements-from-virgin-money-for-accounting/" },
    ],
  },
  {
    slug: "co-operative-bank-csv",
    name: "Co-operative Bank",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "Co-operative Bank online banking in a desktop browser",
    formats: "CSV (personal); CSV, PDF, TXT and XLS (business)",
    steps: [
      "Log in to online banking in a desktop browser.",
      "Open the account and go to its transactions.",
      "Run a transaction search for the date range you want. The download option only appears after a search.",
      "Click <em>Download</em> (labelled <em>Download CSV</em> on some accounts) and choose CSV.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "The export is easy to miss because it only shows once you have searched. Personal exports include Date, Description, Type, Money In, Money Out and Balance columns, which the tracker reads directly. Business online banking keeps 25 months of transactions.",
    faqs: [
      { q: "Can I export a whole year from the Co-operative Bank in one go?", a: "Users report yes: run one search for the full date range and download a single CSV." },
    ],
    sources: [
      { t: "The Co-operative Bank Business: can I export transaction information?", href: "https://www.co-operativebank.co.uk/business/faqs/ways-to-bank/online-banking/statements-and-transactions/can-I-export-transaction-information/prod-11451" },
      { t: "ExpensePlus: downloading a Co-op statement as CSV", href: "https://support.expenseplus.co.uk/article/522-how-do-i-download-my-coop-statement-as-csv" },
      { t: "MoneySavingExpert forum: exporting annual transactions", href: "https://forums.moneysavingexpert.com/discussion/6658217/current-account-with-ability-to-export-annual-transactions-in-1-go" },
    ],
  },
  {
    slug: "metro-bank-csv",
    name: "Metro Bank",
    group: "High street banks",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "Metro Bank Internet Banking in a desktop browser (the app offers PDF statements only)",
    formats: "CSV and PDF",
    steps: [
      "Log in to Internet Banking in a desktop browser and allow pop-ups for the site. The export opens in a pop-up and fails silently if it is blocked.",
      "Click the account to open its <em>Transaction Summary</em>. By default it shows the last 32 days.",
      "For a longer period click <em>Advanced Search</em>, enter your dates and click <em>Search</em>.",
      "Click <em>Export</em> to download a CSV. <em>Download</em> gives a PDF instead.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Advanced Search reaches back to when the account opened. Metro's CSV writes dates like 12-Sep-26 and puts commas in large amounts; the importer handles both.",
    faqs: [
      { q: "Why does nothing happen when I click Export in Metro Bank?", a: "Almost always a pop-up blocker. Allow pop-ups for the Metro Bank site and try again." },
    ],
    sources: [
      { t: "Metro Bank: exporting transaction data (user guide)", href: "https://www.metrobankonline.co.uk/globalassets/documents/customer_documents/business-and-commercial/user-guide-exporting-transaction-data.pdf" },
      { t: "Clear Books: Metro Bank statement import guide", href: "https://support.clearbooks.co.uk/support/solutions/articles/33000274569-metro-bank-statement-import-guide" },
      { t: "Max Tax Back: export a Metro statement", href: "https://maxtaxback.co.uk/business-banking-support-hub/export-a-metro-statement/" },
    ],
  },
  {
    slug: "wise-csv",
    name: "Wise",
    group: "App-based banks and fintechs",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "the Wise app or wise.com",
    formats: "CSV, Excel, PDF, QIF, MT940 and CAMT.053",
    steps: [
      "Log in at wise.com or open the app.",
      "Open the balance you want, tap the three dots, then <em>Statements and reports</em>.",
      "Choose <em>Create a statement</em> and pick the balance. On the web you can select several at once.",
      "Set the period, up to 365 days per statement.",
      "Choose <em>CSV</em> as the format.",
      "Confirm with your password, download, and import the file into The Income Tracker.",
    ],
    note: "One statement per currency balance, 365 days each. Payments made straight from an external card do not appear in statements, only on the Transactions page, so check that page if something is missing.",
    faqs: [
      { q: "Can I export all my Wise currencies in one file?", a: "On the web you can select several balances when creating a statement. Multi-currency files import, but one currency per file gives the cleanest result." },
    ],
    sources: [
      { t: "Wise: how do I download a statement?", href: "https://www.wise.com/help/articles/2736049/how-do-i-download-a-statement" },
      { t: "StatementBridge: downloading a Wise bank statement", href: "https://www.statementbridge.nl/en/blog/download-bank-statement-wise" },
    ],
  },
  {
    slug: "tide-csv",
    name: "Tide",
    group: "Credit cards and business accounts",
    published: "2026-09-08",
    checked: "2026-09-08",
    where: "the Tide app or web app",
    formats: "CSV (standard and accounting-package layouts) and PDF statements",
    steps: [
      "For a CSV of transactions in the Tide app: tap <em>Pay</em>, then <em>View more</em> under the transactions list, and filter by date.",
      "Tap the share icon, choose the <em>Standard</em> CSV type and tap <em>Export</em>. Save or share the file.",
      "On the web instead: go to <em>Accounts</em>, choose the account, click the funnel icon, set your filters, click <em>Apply Filter</em>, then <em>Export</em> and pick a CSV type.",
      "For an official PDF statement in the app: tap your profile icon, then <em>Bank account</em>, then <em>Account statements</em>. Select the month or months and tap <em>Share</em> to save the PDF.",
      "For a PDF covering your own dates, choose <em>Custom date range</em> in the same place. On the web it is under <em>Account details</em> (the i icon), then <em>Statements</em>.",
      "Import the CSV or the PDF into The Income Tracker.",
    ],
    note: "Monthly PDF statements are issued in the app on the 4th of the following month. A custom-range statement can cover up to six months and its end date has to be at least three days ago. The Standard CSV leaves out pending transactions, so export once the month has settled.",
    faqs: [
      { q: "Can I track my Tide business account alongside personal spending?", a: "Yes. Import the Tide CSV and give the business rows their own categories, or keep a separate ledger for the business. The self-employed template on this site uses Self Assessment expense headings." },
    ],
    sources: [
      { t: "Tide: download account statements and transactions", href: "https://www.tide.co/help-centre/download-tide-account-statements-and-transactions/" },
      { t: "Husa Accountants: Tide bank instructions", href: "https://husaaccountants.com/tide-bank-instructions/" },
    ],
  },
  // Added 16 September 2026. Steps checked against each provider's help pages
  // and recent customer reports on that date.
  {
    slug: "tesco-bank-csv",
    name: "Tesco Bank",
    group: "Credit cards and business accounts",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    where: "Tesco Bank Online Banking in a browser (credit cards and savings accounts)",
    formats: "CSV, TSV and QIF",
    steps: [
      "Log in to Tesco Bank Online Banking in a browser. The app shows transactions but does not export them.",
      "On the overview, click the arrow next to the credit card or savings account to expand it.",
      "Credit card: open the <em>Transactions</em> tab and click <em>Download all</em>. Savings: choose <em>Manage Account</em>, then <em>Manage Payments</em>, then the <em>Your Transactions</em> tab, then <em>Download</em>.",
      "Choose <em>CSV</em> (the Excel-compatible option). TSV and QIF are offered too.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Tesco Bank no longer runs current accounts, so this covers credit cards and savings. Card downloads list spending as positive numbers; the importer spots that and flips the signs, with a one-click undo. Tesco Bank's banking business is now owned by Barclays, but the login, app and export flow still carry the Tesco Bank name.",
    faqs: [
      { q: "Does the Tesco Bank app export transactions?", a: "No. Use Online Banking in a browser on a computer or phone. The download appears under the Transactions tab for cards and under Manage Payments for savings." },
      { q: "Can I import a Tesco Bank QIF file?", a: "Yes. The Income Tracker reads QIF as well as CSV. CSV is the simplest choice if you want to open the file in a spreadsheet first." },
    ],
    sources: [
      { t: "Tesco Bank Community: can I export or download my transaction data?", href: "https://yourcommunity.tescobank.com/content/3075-Can-I-exportdownload-my-transaction-data" },
      { t: "Tesco Bank Community: downloading credit card transactions in CSV format", href: "https://community.tescobank.com/threads/13797-Downloading-credit-card-transactions-in-CSV-format" },
      { t: "Tesco Bank: help and FAQs", href: "https://www.tescobank.com/help/faqs/" },
    ],
  },
  {
    slug: "barclaycard-csv",
    name: "Barclaycard",
    group: "Credit cards and business accounts",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    where: "Barclays Online Banking on a computer, once your Barclaycard is linked to it (the Barclaycard site and app give PDF statements)",
    formats: "CSV (Excel), OFX and QIF through Barclays Online Banking; PDF statements from Barclaycard directly",
    steps: [
      "If you also have a Barclays current account, add your Barclaycard to Barclays Online Banking. Barclaycard's help pages walk through linking the card.",
      "Log in to Barclays Online Banking on a computer, not the app. Select the Barclaycard and click <em>Show recent transactions</em>, then <em>View all transactions</em>.",
      "Pick a start and end date and click <em>Search</em>.",
      "Scroll to the bottom, click <em>Export all</em> and choose <em>CSV (Excel)</em>.",
      "No Barclays current account? Log in at barclaycard.co.uk, open <em>Statements</em>, download the PDF for the month, and import it directly.",
      "Business and corporate cards: in Barclaycard online servicing choose <em>Reports</em>, run the <em>Custom General Transaction Report</em> for your date range, and download the spreadsheet when it appears under Complete.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "The Barclays app cannot export files, and Barclays' web export only covers recent months, while PDFs go back years. Card spending exports as positive numbers; the importer flips the signs automatically and lets you undo it.",
    pdfOnlyNote: "Barclaycard's own site and app only issue PDF statements.",
    faqs: [
      { q: "Can I download a CSV from the Barclaycard app?", a: "No. The Barclaycard app and website provide PDF statements. CSV export is only available through Barclays Online Banking on a computer, after the card is linked to a Barclays login, or through the corporate reporting portal for business cards." },
      { q: "Why do my Barclaycard purchases import as income?", a: "Card exports often list purchases as positive amounts. The Income Tracker detects that pattern and flips the signs so purchases show as spending. If a file is flipped the wrong way, undo it in the review screen." },
    ],
    sources: [
      { t: "ExpensePlus: how do I download my Barclaycard statement as CSV?", href: "https://support.expenseplus.co.uk/article/275-can-i-download-my-barclaycard-statement-as-csv" },
      { t: "ExpensePlus: how do I download my Barclays statement as CSV?", href: "https://support.expenseplus.co.uk/article/523-how-do-i-download-my-barclays-statement-as-csv" },
      { t: "Barclaycard Business: can I download the results?", href: "https://www.barclaycard.co.uk/business/help/online-services/can-i-download-the-results" },
      { t: "Head for Points forum: downloading Barclays transactions in Excel or CSV", href: "https://www.headforpoints.com/forums/topic/barclays-statement-possible-to-download-transactions-in-excel-csv/" },
    ],
  },
  {
    slug: "monzo-business-csv",
    name: "Monzo Business",
    group: "Credit cards and business accounts",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    where: "the Monzo app, the same route as a personal account",
    formats: "CSV, PDF and QIF; Pro and Team plans can auto-export a monthly statement to Google Drive or OneDrive",
    steps: [
      "Open the Monzo app and switch to your business account.",
      "Tap the three dots on the business card (or <em>Manage</em>), then <em>Bank statements</em>.",
      "Choose the month or set a custom date range.",
      "Pick <em>CSV</em> and generate the statement. Save it or share it to yourself.",
      "Optional, on Pro and Team plans: from Home, swipe down, tap <em>Auto-export documents</em> and connect Google Drive or OneDrive. Monzo places last month's statement in a Monzo Business folder on the 1st of each month, as PDF, CSV or QIF.",
      "Import the file into The Income Tracker.",
    ],
    note: "Business CSVs end with a running Balance and Balance currency column, which the importer ignores. The Insights tab also offers an Export cash flow file, but that is category totals rather than transactions. Use Bank statements for a row-per-transaction file.",
    faqs: [
      { q: "Can I keep Monzo Business separate from my personal spending?", a: "Yes. Import the business CSV into its own ledger, or give the rows business categories that match the Self Assessment expense headings. The self-employed template on this site uses those headings." },
      { q: "Does the auto-export replace the manual download?", a: "It can, on Pro and Team plans. The file lands in your cloud drive each month and you import it from there. Free business accounts use the manual Bank statements route." },
    ],
    sources: [
      { t: "Monzo Help: automatically export business documents to Google or Microsoft", href: "https://monzo.com/help/business-accounts/auto-export-business-documents-web" },
      { t: "Monzo Community: running balance added to Monzo Business CSV exports", href: "https://community.monzo.com/t/we-ve-added-a-running-balance-to-monzo-business-csv-exports/164885" },
      { t: "Monzo Help: Monzo Business, exporting your data", href: "https://monzo.com/ie/help/monzo-for-business/help-export-data" },
    ],
  },
  {
    slug: "starling-business-csv",
    name: "Starling Business",
    group: "Credit cards and business accounts",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    where: "the Starling app or Starling Online Banking in a browser",
    formats: "CSV and PDF, including certified PDF statements for proof of income",
    steps: [
      "Open the Starling app and switch to the business account.",
      "Tap the account icon at the top right, then <em>Statements</em>.",
      "Choose <em>Statement history</em> for a month, or set a custom date range.",
      "Select <em>CSV</em> as the format and download or share the file.",
      "Prefer a bigger screen? Log in to Starling Online Banking, open the business account, go to <em>Statements</em> and download the CSV for the period you want.",
      "Import the file into The Income Tracker.",
    ],
    note: "Starling's CSV is one of the cleanest around: date, counterparty, reference, type, amount, balance and Starling's own category. Bookkeeping integrations with Xero, FreeAgent or QuickBooks are separate and not needed for this.",
    faqs: [
      { q: "Can I export more than a year of Starling Business transactions?", a: "Yes. Set a custom date range in Statements and export the period you need. For very long ranges, export a year at a time so each file stays easy to check." },
      { q: "Will Starling's categories carry over?", a: "The Starling category column is imported as a hint. Your own rules in The Income Tracker take precedence once you have categorised a merchant." },
    ],
    sources: [
      { t: "Starling Bank: statements, view or download bank statements online", href: "https://www.starlingbank.com/features/statements/" },
      { t: "Starling Bank help: how do I share my bookkeeping information with my accountant?", href: "https://help.starlingbank.com/business/topics/bookkeeping/how-do-i-share-my-bookkeeping-information-with-my-accountant/" },
      { t: "Starling on X: digital statements downloadable as PDF or CSV", href: "https://twitter.com/StarlingBank/status/1168010408390582273" },
    ],
  },
  {
    slug: "zopa-csv",
    name: "Zopa",
    group: "App-based banks and fintechs",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    pdfOnly: true,
    where: "the Zopa app",
    formats: "PDF monthly statements only",
    steps: [
      "Savings (Smart Savings Hub pots and the Cash ISA): open the Zopa app, go to the <em>Save &amp; Invest</em> tab and tap the three dots next to <em>Withdraw</em>.",
      "Current account: tap the account, then the three dots next to <em>Send</em>.",
      "Tap <em>Statements</em>. They are organised by year and month, so pick the one you want.",
      "The statement opens as a PDF. Download it or share it to yourself.",
      "Import the PDF into The Income Tracker. No retyping needed.",
    ],
    note: "Savings statements appear on the first calendar day of each month and show every deposit, withdrawal, interest payment and move between pots for the month before. Current account statements are issued on the 8th and cover everything since the last one. There is no CSV option on either, so import the PDF itself, a month at a time, and check the totals against the statement.",
    pdfOnlyNote: "Zopa statements are PDF only.",
    faqs: [
      { q: "Where is my Zopa Smart Savings Hub monthly statement?", a: "In the app, open the Save & Invest tab, tap the three dots next to Withdraw, then Statements. A new monthly statement appears on the first calendar day of each month. Cash ISA statements sit in the same place." },
      { q: "What does a Zopa statement show?", a: "A savings statement lists every deposit, withdrawal, interest payment and movement between pots for that month. A current account statement lists each transaction since the previous statement. Both are PDFs with a dated row per transaction, which is the layout the tracker reads." },
      { q: "Is the Zopa certificate of interest the same as a statement?", a: "No. The certificate of interest is a yearly document for tax purposes, generated at the start of each tax year on 6 April. Find it under the profile icon, then Statements and Documents, then Certificate of Interest. Monthly statements are the ones to import for tracking." },
    ],
    sources: [
      { t: "Zopa help: can I download a statement? (Smart Savings Hub)", href: "https://www.zopa.com/help/article/can-i-download-a-tax-statement" },
      { t: "Zopa help: how do I find my bank account statements and transaction history?", href: "https://www.zopa.com/help/article/how-do-i-find-statements-and-transaction-history" },
      { t: "Zopa help: how can I download my certificate of interest?", href: "https://www.zopa.com/help/article/download-certificate-interest-smart-saver" },
      { t: "MoneySavingExpert forum: Zopa Smart Saver and downloading statements", href: "https://forums.moneysavingexpert.com/discussion/6392050/zopa-smart-saver-and-downloading-statements" },
    ],
  },
  {
    slug: "kroo-csv",
    name: "Kroo",
    group: "App-based banks and fintechs",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    pdfOnly: true,
    where: "the Kroo app",
    formats: "PDF monthly statements only",
    steps: [
      "Open the Kroo app and tap <em>Account</em> at the bottom right.",
      "Scroll to <em>Statements</em> and tap <em>View statement history</em>.",
      "Choose the month and tap download, then save or share the PDF.",
      "Import the PDF directly from Settings, then Import data, in The Income Tracker.",
    ],
    note: "Kroo statements are monthly PDFs. The in-app feed can differ slightly from the statement because pending payments show in the feed but only settled transactions appear on the statement, so treat the statement as the record.",
    pdfOnlyNote: "Kroo statements are PDF only.",
    faqs: [
      { q: "Why does my Kroo statement not match the app?", a: "The statement shows settled transactions for the month. Pending card payments and anything that settled after month end appear in the app feed but not on that statement. Kroo's help centre explains the difference." },
    ],
    sources: [
      { t: "Kroo help centre: do you provide bank statements?", href: "https://help.kroo.com/hc/en-gb/articles/9284162289169-Do-you-provide-bank-statements" },
      { t: "Kroo help centre: why does my bank statement differ from my in-app transactions?", href: "https://help.kroo.com/hc/en-gb/articles/10369054167185-Why-does-my-bank-statement-differ-from-my-in-app-transactions" },
    ],
  },
  {
    slug: "marcus-csv",
    name: "Marcus by Goldman Sachs",
    group: "App-based banks and fintechs",
    published: "2026-09-16",
    updated: "2026-09-16",
    checked: "2026-09-16",
    pdfOnly: true,
    where: "the Marcus website or app, under Documents",
    formats: "PDF statements only",
    steps: [
      "Log in at marcus.co.uk or open the Marcus app.",
      "Select the savings account, then <em>Documents</em> (labelled Statements and documents on some screens).",
      "Choose the statement period and download the PDF.",
      "Import the PDF directly from Settings, then Import data, in The Income Tracker. Savings statements are short: deposits, withdrawals and interest.",
    ],
    note: "Marcus offers no CSV, OFX or QIF download and no accounting-software connection. For a savings account you mostly want the interest and transfer lines, which is a quick PDF import once a month or once a quarter.",
    pdfOnlyNote: "Marcus statements are PDF only.",
    faqs: [
      { q: "Do I need to track a savings account at all?", a: "Only the movements. Log transfers in and out so they pair with the matching transfer in your current account and are skipped as internal moves, and log interest as income if you want the full picture." },
    ],
    sources: [
      { t: "Marcus by Goldman Sachs UK: FAQs", href: "https://www.marcus.co.uk/uk/en/faqs" },
      { t: "DocuClipper: converting a Marcus statement (notes the lack of CSV export)", href: "https://www.docuclipper.com/blog/convert-marcus-bank-statement-to-excel/" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Search answers
//
// What people actually type into Bing is a question: "can I export CSV from
// Revolut", "Santander download CSV from app", "export all Wise transactions
// greater than a year". The work is split in two:
//
//   The search listing PROMISES exactly what they searched for and stops there.
//   "Step-by-step guide to downloading your Santander transactions as a CSV:
//   whether the app can do it and how far back it goes." It names the question,
//   including the awkward variant (app, past a year, instead of a PDF), and does
//   not answer it. A listing that gives the steps away has made the click
//   unnecessary.
//
//   The page DELIVERS, fast: the answer and the two usual follow-ups sit in the
//   first screen, then the steps, then the reason to stay.
//
// Per bank:
//   title, description  the search listing. A promise in the searcher's words.
//                       Title 70 characters at most, description 50 to 160.
//                       Never promise a CSV from a bank that only issues PDFs.
//   app                 on the page: "Can I do it from the mobile app?"
//   history             on the page: "How far back does it go?"
//   faqs, sources       added to the entry's own.
//   sections            extra h2 blocks for a follow-up that needs more than a line.
//   checked             set when the facts were re-read against the bank's help pages.
//
// Only state what the entry's sources support. A bank with no `app` or `history`
// simply gets fewer rows in its at-a-glance box.
// ─────────────────────────────────────────────────────────────────────────────

const ANSWERS = {
  "barclays-csv": {
    title: "How to export Barclays transactions to CSV: step-by-step",
    description: "A step-by-step guide to downloading your Barclays transactions as a CSV file: where the export is, whether the app can do it, and what to do with the file.",
    app: "No. The Barclays app cannot export a file. Use Online Banking on a computer.",
  },
  "hsbc-csv": {
    title: "How to download HSBC statements as CSV: step-by-step guide",
    description: "A step-by-step guide to downloading your HSBC transactions as a CSV: where the download option is, whether the app has it, and how far back you can go.",
    app: "No. The app downloads statements as PDFs only. CSV and Excel come from the transactions list in Online Banking.",
    history: "PDF statements go back six years. The CSV covers whatever your transaction search returns.",
    checked: "2026-11-16",
    faqs: [
      { q: "Can I download an HSBC statement as a CSV?", a: "Not the statement itself, which is PDF only. HSBC says other formats such as Excel or CSV have to come from your transactions list: choose the account, select Search and filter, set the dates, search, then Download at the bottom and pick CSV." },
      { q: "Can the HSBC app download a CSV?", a: "No. The mobile banking app downloads statements in PDF format. For a CSV, log on to Online Banking in a browser. If a PDF is all you have, The Income Tracker imports that directly too." },
    ],
    sources: [{ t: "HSBC UK: how to get a bank statement online", href: "https://www.hsbc.co.uk/help/banking-made-easy/online-statements/" }],
  },
  "monzo-csv": {
    title: "How to export Monzo transactions to CSV: step-by-step guide",
    description: "A step-by-step guide to exporting your Monzo transactions as a CSV file: where to tap, which format to pick, and how to turn the file into a budget.",
    app: "Yes. The export lives in the Monzo app on iOS and Android.",
  },
  "starling-csv": {
    title: "How to export a Starling statement to CSV: step-by-step",
    description: "A step-by-step guide to downloading your Starling Bank statement as a CSV: where to find it in the app and online, and what to do with the file next.",
    app: "Yes, from the app or from web banking.",
    history: "Any date range you choose.",
  },
  "lloyds-csv": {
    title: "How to export Lloyds transactions to CSV: step-by-step guide",
    description: "A step-by-step guide to downloading your Lloyds Bank transactions as a CSV, including how to get past the export limit when one file is not enough.",
    app: "No. The Lloyds app cannot export CSV. Use Internet Banking on a computer.",
    history: "The last 12 months, 150 transactions per file. Narrow the dates and export again for more.",
  },
  "natwest-csv": {
    title: "How to export NatWest transactions to CSV: step-by-step",
    description: "A step-by-step guide to downloading your NatWest transactions as a CSV file: which menu to use, which format to choose, and what to do with the file.",
  },
  "santander-csv": {
    title: "Download a Santander CSV, app or online: step-by-step guide",
    description: "A step-by-step guide to downloading your Santander transactions as a CSV: where the option is, whether the mobile app can do it, and how far back it goes.",
    app: "Santander documents the CSV for Online Banking in a browser, not for the mobile app. On a phone, log on to Online Banking in the browser, or import a PDF statement instead.",
    history: "12 months of transactions per midata file.",
    checked: "2026-11-16",
    faqs: [
      { q: "Can I download a Santander CSV from the mobile app?", a: "Santander's instructions for the CSV are for Online Banking: choose the account, click Download transactions above the transactions table and pick midata (CSV). If you only have your phone, open Online Banking in the phone's browser, or import a PDF statement, which The Income Tracker also reads." },
      { q: "Why is my name and account number missing from the Santander CSV?", a: "The midata file is built that way. Santander says it will not contain personal information such as your name, address or account number, and that potentially sensitive transactions are masked. Dates, descriptions and amounts are all there, which is what a budget needs." },
      { q: "How far back does the Santander CSV go?", a: "Twelve months. For anything older, download the PDF statements for those months and import them alongside the CSV. Duplicates are caught, so overlapping dates are safe." },
    ],
    sources: [{ t: "Santander UK: midata, including how to download the CSV", href: "https://www.santander.co.uk/personal/support/understanding-our-services/midata" }],
  },
  "revolut-csv": {
    title: "How to export a CSV from Revolut: step-by-step guide (2026)",
    description: "Can you export a CSV from Revolut? A step-by-step guide to downloading your Revolut statement, handling several currencies, and using the file afterwards.",
    app: "Yes. Statements export from the Revolut app and the web app.",
    faqs: [
      { q: "Can I export a CSV from Revolut?", a: "Yes. Open Accounts, tap Statements, choose the account or currency and the date range, and pick the Excel/CSV format. Each currency has its own statement, so export one file per currency." },
    ],
  },
  "nationwide-csv": {
    title: "Nationwide CSV download, app or browser: step-by-step guide",
    description: "A step-by-step guide to downloading your Nationwide transactions as a CSV: whether the Banking app can do it, where the option really is, and how far back.",
    app: "No. The Banking app only produces PDF statements. Use the Internet Bank in a desktop browser.",
    history: "Around 15 months as CSV. PDF statements go back 36 months.",
  },
  "halifax-csv": {
    title: "How to export Halifax transactions to CSV: step-by-step",
    description: "A step-by-step guide to downloading your Halifax transactions as a CSV file: where the export is, whether the app has it, and how many years you can get.",
    app: "No. The app only offers PDF statements. Use Online Banking in a browser.",
    history: "Up to 12 months per search, going back seven years.",
  },
  "bank-of-scotland-csv": {
    title: "Bank of Scotland CSV download: step-by-step export guide",
    description: "A step-by-step guide to downloading your Bank of Scotland transactions as a CSV: where the export is, whether the app can do it, and what comes next.",
    app: "No. The app offers PDF statements only. Use Internet Banking in a browser.",
    history: "Up to 12 months per search.",
  },
  "tsb-csv": {
    title: "How to export TSB transactions to CSV: step-by-step guide",
    description: "A step-by-step guide to downloading your TSB transactions as a CSV, including how to export a full year when each file only covers part of it.",
    app: "No. The app only offers PDF statements in your Inbox. Use Internet Banking on a computer.",
    history: "90 days or 150 transactions per file. Repeat with consecutive dates for longer.",
  },
  "chase-uk-csv": {
    title: "How to export Chase UK statements to CSV: step-by-step",
    description: "Can Chase UK export a CSV? A step-by-step guide to downloading your Chase statements, choosing custom dates, and turning the file into a budget.",
    app: "Yes. The app is the only route, because Chase UK has no web banking.",
    history: "Custom statements cover up to 90 days each. Monthly statements stay available for six years.",
  },
  "first-direct-csv": {
    title: "first direct CSV download: step-by-step export guide (2026)",
    description: "A step-by-step guide to downloading your first direct transactions as a CSV: where the option is hiding, whether the app has it, and how far back it goes.",
    app: "No. The app only offers PDF statements, and the option is often hidden on phone browsers.",
    history: "One year per download, going back up to six years on current accounts.",
  },
  "amex-csv": {
    title: "How to download an Amex statement as CSV: step-by-step (UK)",
    description: "Can you download a CSV of your American Express statement? A step-by-step UK guide: where the download is, how far back it goes, and how to import it.",
    app: "No. The Amex app shows PDF statements only. Use the website in a desktop browser.",
    history: "Roughly two years as CSV. Older periods are PDF only.",
    faqs: [
      { q: "Can I download a CSV of my American Express statement?", a: "Yes. Log in to your online account in a desktop browser, open Statements & Activity, pick a statement period or a custom date range, click the download icon above the transactions and choose CSV. The app only shows PDFs." },
    ],
  },
  "virgin-money-csv": {
    title: "How to export Virgin Money transactions to CSV: step-by-step",
    description: "A step-by-step guide to downloading your Virgin Money transactions as a CSV: where the export is, which accounts have it, and what to do if yours does not.",
    app: "No. The app produces PDF statements only. Use Internet Banking in a desktop browser.",
  },
  "co-operative-bank-csv": {
    title: "Co-operative Bank CSV download: step-by-step export guide",
    description: "A step-by-step guide to downloading your Co-operative Bank transactions as a CSV, including the one step that makes the download button appear.",
  },
  "metro-bank-csv": {
    title: "How to export Metro Bank transactions to CSV: step-by-step",
    description: "A step-by-step guide to downloading your Metro Bank transactions as a CSV, covering longer date ranges and what to check when Export does nothing.",
    app: "No. The app offers PDF statements only. Use Internet Banking in a desktop browser.",
    history: "Back to when the account opened, using Advanced Search.",
  },
  "wise-csv": {
    title: "How to export all your Wise transactions, even past a year",
    description: "A step-by-step guide to exporting all your Wise transactions as CSV, including how to get more than a year of history and several currencies at once.",
    app: "Yes. The app exports CSV, Excel and PDF. The website adds QIF, MT940 and CAMT.053.",
    history: "365 days per statement. For longer, create one statement per year. There is no single all-time file.",
    checked: "2026-11-16",
    sections: [
      {
        h: "Export more than a year of Wise transactions",
        p: [
          "Wise will not put more than 365 days in one statement. Its help centre says that for a longer period you need to download several statements, each covering a maximum of 365 days. So the way to export everything is one file per year.",
        ],
        ol: [
          "Create a statement for the most recent 365 days and download it as CSV.",
          "Create the next one ending the day before the first one starts, and keep going back until you reach the day you opened the account.",
          "Repeat for each currency balance and jar you want to track. On the web and on Android you can select several currencies for one statement.",
          "Import every file into The Income Tracker. If two files overlap by a few days the duplicates are dropped, so you do not have to line the dates up exactly.",
        ],
        after: [
          "Three years across two currencies is six files and about ten minutes. After that you only need the latest month each time.",
        ],
      },
    ],
    faqs: [
      { q: "How do I export all my Wise transactions?", a: "Create statements in Statements and reports, one for each 365-day period back to when you opened the account, and choose CSV each time. Wise limits a single statement to 365 days, so a full history is one file per year, per currency." },
      { q: "Can I export Wise transactions for more than a year at once?", a: "No. Wise says a statement covers a maximum of 365 days and that longer periods need multiple statements. Download one per year and import them together. Overlapping dates are safe because duplicates are dropped." },
      { q: "Can I download an old Wise statement again?", a: "Yes. In Statements and reports you choose the period yourself, so you can create a statement for any past dates, up to 365 days at a time, as often as you need." },
    ],
  },
  "tide-csv": {
    title: "Tide statements download: step-by-step guide (PDF and CSV)",
    description: "A step-by-step guide to downloading Tide statements and exporting transactions as a CSV: where each one is in the app and on the web, and which to use.",
    app: "Yes. PDF statements and the CSV export are both in the app and on the web.",
    history: "Monthly PDFs are issued on the 4th of the following month. A custom-range statement covers up to six months.",
    checked: "2026-11-16",
    faqs: [
      { q: "Where do I download Tide statements?", a: "In the app, tap your profile icon, then Bank account, then Account statements, select the month or months and tap Share to save the PDF. On the web, open Account details (the i icon) and choose Statements. Statements are issued on the 4th of each following month." },
      { q: "Should I download the Tide PDF statement or the CSV?", a: "The PDF is the official document, which is what a lender or accountant asks for. The CSV is the one to use for tracking and bookkeeping, because every transaction is a row you can sort and categorise. The Income Tracker imports either." },
    ],
  },
  "tesco-bank-csv": {
    title: "Tesco Bank CSV download: step-by-step guide (card, savings)",
    description: "A step-by-step guide to downloading your Tesco Bank credit card or savings transactions as a CSV: where the download is and whether the app can do it.",
    app: "No. The app shows transactions but does not export them. Use Online Banking in a browser, on a computer or a phone.",
  },
  "barclaycard-csv": {
    title: "How to download Barclaycard transactions as CSV, not PDF",
    description: "Want your Barclaycard transactions as a CSV instead of a PDF statement? A step-by-step guide to the routes that work, with or without a Barclays account.",
    app: "No. The Barclaycard app and website give PDF statements, and the Barclays app cannot export files either.",
    history: "Recent months as CSV through Barclays Online Banking. PDF statements go back years.",
    faqs: [
      { q: "How can I download Barclaycard transactions as a CSV instead of a PDF?", a: "Link your Barclaycard to Barclays Online Banking, log in on a computer, open the card's transactions, choose View all transactions, set your dates, then Export all and pick CSV (Excel). If you have no Barclays login, skip the conversion: The Income Tracker imports the Barclaycard PDF statement directly." },
    ],
  },
  "monzo-business-csv": {
    title: "Monzo Business CSV export: step-by-step guide (2026)",
    description: "A step-by-step guide to exporting Monzo Business statements as a CSV for bookkeeping, including the monthly auto-export and what to do with the file.",
    app: "Yes. The export is in the Monzo app, the same route as a personal account.",
  },
  "starling-business-csv": {
    title: "Starling Business CSV export: step-by-step guide (2026)",
    description: "A step-by-step guide to downloading Starling Business statements as a CSV, in the app or online, for any date range, and using the file for bookkeeping.",
    app: "Yes, from the app or from Online Banking in a browser.",
    history: "Any date range you choose.",
  },
  "zopa-csv": {
    title: "Zopa statements: how to find, download and read them",
    description: "A step-by-step guide to your Zopa monthly statements: where they are for savings and the current account, when they arrive, what they show, and how to use them.",
    app: "Yes, and the app is the only place. Statements open as PDFs you can download or share.",
    history: "One PDF per month, organised by year and month.",
    checked: "2026-11-16",
  },
  "kroo-csv": {
    title: "Kroo statement download: step-by-step guide (2026)",
    description: "A step-by-step guide to downloading your Kroo statements: where they are in the app, which formats Kroo offers, and how to track the transactions free.",
    app: "Yes, and the app is the only place. Statements download as PDFs.",
  },
  "marcus-csv": {
    title: "Marcus statement download: step-by-step guide (2026)",
    description: "A step-by-step guide to downloading your Marcus by Goldman Sachs statements: where they are, which formats are offered, and how to track your savings.",
    app: "Yes, as PDFs, on the website or in the app under Documents.",
  },
};

// Every bank page changed on this date: answer-first listing, at-a-glance box,
// and the drop-your-file handoff into the tracker.
const ANSWERS_UPDATED = "2026-11-16";

export const BANKS = BASE_BANKS.map((bank) => {
  const answer = ANSWERS[bank.slug] || {};
  return {
    ...bank,
    ...answer,
    updated: ANSWERS_UPDATED,
    // The entry's own questions first where the answer adds none, otherwise the
    // search questions lead: they are the ones the visitor arrived with.
    faqs: [...(answer.faqs || []), ...(bank.faqs || [])],
    sources: [...(answer.sources || []), ...(bank.sources || [])],
  };
});
