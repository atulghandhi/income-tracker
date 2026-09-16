// Downloadable CSV templates. Each one opens in Excel / Google Sheets and also
// imports straight into the app: the importer recognises "Date", "Description",
// "Category", "Money in" and "Money out" headers (see src/importer.ts).
// Rows are emitted verbatim into public/templates/<file.name>.

const HOUSEHOLD_ROWS = [
  ["Date", "Description", "Category", "Money in", "Money out", "Notes"],
  ["2026-09-01", "Salary", "Income", "2450.00", "", "Take-home pay"],
  ["2026-09-01", "Rent", "Housing", "", "950.00", "Standing order, 1st of month"],
  ["2026-09-01", "Council tax", "Bills", "", "142.00", "Direct debit"],
  ["2026-09-03", "Energy (gas and electric)", "Bills", "", "118.00", "Direct debit"],
  ["2026-09-03", "Water", "Bills", "", "38.00", "Direct debit"],
  ["2026-09-05", "Broadband", "Bills", "", "29.99", ""],
  ["2026-09-05", "Mobile phone", "Bills", "", "15.00", "SIM only"],
  ["2026-09-06", "Weekly food shop", "Groceries", "", "72.40", ""],
  ["2026-09-08", "Train season ticket", "Transport", "", "164.00", ""],
  ["2026-09-10", "Car insurance", "Transport", "", "48.50", "Monthly instalment"],
  ["2026-09-12", "Streaming subscriptions", "Subscriptions", "", "23.98", "Two services"],
  ["2026-09-13", "Weekly food shop", "Groceries", "", "68.10", ""],
  ["2026-09-14", "Eating out", "Eating out", "", "42.00", ""],
  ["2026-09-15", "Gym", "Health", "", "24.99", ""],
  ["2026-09-20", "Weekly food shop", "Groceries", "", "75.25", ""],
  ["2026-09-25", "Transfer to savings", "Savings", "", "300.00", "Pay yourself first"],
  ["2026-09-27", "Weekly food shop", "Groceries", "", "70.90", ""],
  ["2026-09-28", "Birthday present", "Gifts", "", "35.00", ""],
];

const INCOME_EXPENDITURE_ROWS = [
  ["Date", "Description", "Category", "Money in", "Money out", "Frequency"],
  ["2026-09-01", "Wages or salary (take-home)", "Income", "2100.00", "", "Monthly"],
  ["2026-09-01", "Partner's wages (take-home)", "Income", "0.00", "", "Monthly"],
  ["2026-09-01", "Benefits and tax credits", "Income", "0.00", "", "Monthly"],
  ["2026-09-01", "Pension income", "Income", "0.00", "", "Monthly"],
  ["2026-09-01", "Other income (maintenance, lodger, side work)", "Income", "0.00", "", "Monthly"],
  ["2026-09-01", "Rent or mortgage", "Housing", "", "850.00", "Monthly"],
  ["2026-09-01", "Council tax", "Fixed costs", "", "130.00", "Monthly (10 or 12 instalments)"],
  ["2026-09-01", "Gas and electricity", "Fixed costs", "", "110.00", "Monthly"],
  ["2026-09-01", "Water", "Fixed costs", "", "35.00", "Monthly"],
  ["2026-09-01", "Home insurance", "Fixed costs", "", "18.00", "Monthly"],
  ["2026-09-01", "TV licence", "Fixed costs", "", "14.50", "Monthly"],
  ["2026-09-01", "Broadband and landline", "Fixed costs", "", "30.00", "Monthly"],
  ["2026-09-01", "Mobile phones", "Fixed costs", "", "20.00", "Monthly"],
  ["2026-09-01", "Food and household shopping", "Living costs", "", "320.00", "Monthly"],
  ["2026-09-01", "Travel (fuel, fares, parking)", "Living costs", "", "120.00", "Monthly"],
  ["2026-09-01", "Car costs (insurance, tax, maintenance)", "Living costs", "", "90.00", "Monthly"],
  ["2026-09-01", "Childcare and school costs", "Living costs", "", "0.00", "Monthly"],
  ["2026-09-01", "Clothing and footwear", "Living costs", "", "40.00", "Monthly"],
  ["2026-09-01", "Health (prescriptions, dentist, optician)", "Living costs", "", "15.00", "Monthly"],
  ["2026-09-01", "Subscriptions and entertainment", "Flexible costs", "", "45.00", "Monthly"],
  ["2026-09-01", "Eating out and takeaways", "Flexible costs", "", "60.00", "Monthly"],
  ["2026-09-01", "Gifts and celebrations", "Flexible costs", "", "25.00", "Monthly"],
  ["2026-09-01", "Credit card minimum payment", "Debts", "", "45.00", "Monthly"],
  ["2026-09-01", "Loan repayment", "Debts", "", "0.00", "Monthly"],
  ["2026-09-01", "Savings", "Savings", "", "50.00", "Monthly"],
];

const SELF_EMPLOYED_ROWS = [
  ["Date", "Description", "Category", "Money in", "Money out", "Reference"],
  ["2026-09-02", "Invoice 0041: website build", "Sales and income", "1800.00", "", "Client: Acme Ltd"],
  ["2026-09-04", "Laptop stand and cables", "Phone, stationery and office costs", "", "38.99", "Receipt saved"],
  ["2026-09-05", "Train to client meeting", "Car, van and travel expenses", "", "24.60", "Return ticket"],
  ["2026-09-06", "Accounting software subscription", "Phone, stationery and office costs", "", "12.00", "Monthly"],
  ["2026-09-09", "Invoice 0042: monthly retainer", "Sales and income", "650.00", "", "Client: Bloom Studio"],
  ["2026-09-10", "Public liability insurance", "Rent, rates, power and insurance costs", "", "9.50", "Monthly instalment"],
  ["2026-09-12", "Stock for resale", "Cost of goods bought for resale", "", "210.00", "Supplier invoice 8812"],
  ["2026-09-15", "Business bank account fee", "Bank, credit card and other financial charges", "", "5.00", ""],
  ["2026-09-18", "Online advert campaign", "Advertising and business entertainment costs", "", "60.00", ""],
  ["2026-09-22", "Accountant (quarterly)", "Accountancy, legal and other professional fees", "", "120.00", ""],
  ["2026-09-25", "Mobile phone (business share)", "Phone, stationery and office costs", "", "14.00", "50% business use"],
  ["2026-09-26", "Invoice 0043: brand refresh", "Sales and income", "950.00", "", "Client: Northgate Cafe"],
  ["2026-09-28", "Set aside for tax", "Tax savings", "", "700.00", "Transfer to tax pot"],
];

const BILLS_ROWS = [
  ["Date", "Description", "Category", "Money out", "Billing day", "How paid"],
  ["2026-09-01", "Rent or mortgage", "Housing", "950.00", "1", "Standing order"],
  ["2026-09-01", "Council tax", "Bills", "142.00", "1", "Direct debit"],
  ["2026-09-03", "Gas and electricity", "Bills", "118.00", "3", "Direct debit"],
  ["2026-09-03", "Water", "Bills", "38.00", "3", "Direct debit"],
  ["2026-09-05", "Broadband", "Bills", "29.99", "5", "Direct debit"],
  ["2026-09-05", "Mobile phone", "Bills", "15.00", "5", "Direct debit"],
  ["2026-09-08", "Home insurance", "Insurance", "18.00", "8", "Direct debit"],
  ["2026-09-10", "Car insurance", "Insurance", "48.50", "10", "Direct debit"],
  ["2026-09-12", "Streaming service", "Subscriptions", "10.99", "12", "Card (continuous payment)"],
  ["2026-09-12", "Music streaming", "Subscriptions", "11.99", "12", "Card (continuous payment)"],
  ["2026-09-15", "Gym", "Health", "24.99", "15", "Direct debit"],
  ["2026-09-15", "TV licence", "Bills", "14.50", "15", "Direct debit"],
  ["2026-09-20", "Cloud storage", "Subscriptions", "2.99", "20", "Card (continuous payment)"],
  ["2026-09-25", "Savings transfer", "Savings", "300.00", "25", "Standing order"],
];

const WEEKLY_ROWS = [
  ["Date", "Description", "Category", "Money in", "Money out", "Week"],
  ["2026-09-04", "Wages (weekly, take-home)", "Income", "480.00", "", "Week 1"],
  ["2026-09-04", "Rent (weekly share)", "Housing", "", "185.00", "Week 1"],
  ["2026-09-05", "Food shop", "Groceries", "", "58.40", "Week 1"],
  ["2026-09-07", "Bus pass (weekly)", "Transport", "", "22.00", "Week 1"],
  ["2026-09-08", "Phone (monthly, paid this week)", "Bills", "", "15.00", "Week 1"],
  ["2026-09-10", "Takeaway", "Eating out", "", "18.50", "Week 1"],
  ["2026-09-11", "Wages (weekly, take-home)", "Income", "480.00", "", "Week 2"],
  ["2026-09-11", "Rent (weekly share)", "Housing", "", "185.00", "Week 2"],
  ["2026-09-12", "Food shop", "Groceries", "", "61.20", "Week 2"],
  ["2026-09-14", "Bus pass (weekly)", "Transport", "", "22.00", "Week 2"],
  ["2026-09-15", "Energy (monthly, paid this week)", "Bills", "", "95.00", "Week 2"],
  ["2026-09-18", "Wages (weekly, take-home)", "Income", "480.00", "", "Week 3"],
  ["2026-09-18", "Rent (weekly share)", "Housing", "", "185.00", "Week 3"],
  ["2026-09-19", "Food shop", "Groceries", "", "55.90", "Week 3"],
  ["2026-09-21", "Bus pass (weekly)", "Transport", "", "22.00", "Week 3"],
  ["2026-09-22", "Savings transfer", "Savings", "", "40.00", "Week 3"],
  ["2026-09-25", "Wages (weekly, take-home)", "Income", "480.00", "", "Week 4"],
  ["2026-09-25", "Rent (weekly share)", "Housing", "", "185.00", "Week 4"],
  ["2026-09-26", "Food shop", "Groceries", "", "63.75", "Week 4"],
  ["2026-09-28", "Bus pass (weekly)", "Transport", "", "22.00", "Week 4"],
  ["2026-09-29", "Council tax (monthly, paid this week)", "Bills", "", "120.00", "Week 4"],
  ["2026-09-30", "Savings transfer", "Savings", "", "40.00", "Week 4"],
];

const SAVINGS_ROWS = [
  ["Date", "Description", "Category", "Money in", "Money out", "Goal"],
  ["2026-09-01", "Opening balance, emergency fund", "Savings", "1250.00", "", "Emergency fund (target 3000)"],
  ["2026-09-01", "Opening balance, holiday", "Savings", "320.00", "", "Holiday (target 1200)"],
  ["2026-09-25", "Payday transfer", "Savings", "200.00", "", "Emergency fund (target 3000)"],
  ["2026-09-25", "Payday transfer", "Savings", "100.00", "", "Holiday (target 1200)"],
  ["2026-09-30", "Interest", "Interest", "4.85", "", "Emergency fund (target 3000)"],
  ["2026-10-12", "Boiler repair, paid from fund", "Savings", "", "180.00", "Emergency fund (target 3000)"],
  ["2026-10-25", "Payday transfer", "Savings", "200.00", "", "Emergency fund (target 3000)"],
  ["2026-10-25", "Payday transfer", "Savings", "100.00", "", "Holiday (target 1200)"],
  ["2026-10-31", "Interest", "Interest", "4.92", "", "Emergency fund (target 3000)"],
  ["2026-11-25", "Payday transfer", "Savings", "200.00", "", "Emergency fund (target 3000)"],
  ["2026-11-25", "Payday transfer", "Savings", "150.00", "", "Holiday (target 1200)"],
];

const DEBT_ROWS = [
  ["Date", "Description", "Category", "Money out", "Balance after", "APR"],
  ["2026-09-01", "Credit card A, opening balance", "Debt", "0.00", "2400.00", "24.9"],
  ["2026-09-01", "Credit card B (0% until 2027-06), opening balance", "Debt", "0.00", "1800.00", "0"],
  ["2026-09-01", "Car loan, opening balance", "Debt", "0.00", "5200.00", "8.9"],
  ["2026-09-05", "Credit card A payment", "Debt", "250.00", "2199.80", "24.9"],
  ["2026-09-10", "Credit card B payment", "Debt", "100.00", "1700.00", "0"],
  ["2026-09-15", "Car loan repayment", "Debt", "180.00", "5058.55", "8.9"],
  ["2026-10-05", "Credit card A payment", "Debt", "250.00", "1995.44", "24.9"],
  ["2026-10-10", "Credit card B payment", "Debt", "100.00", "1600.00", "0"],
  ["2026-10-15", "Car loan repayment", "Debt", "180.00", "4916.06", "8.9"],
  ["2026-11-05", "Credit card A payment", "Debt", "250.00", "1786.85", "24.9"],
  ["2026-11-10", "Credit card B payment", "Debt", "100.00", "1500.00", "0"],
  ["2026-11-15", "Car loan repayment", "Debt", "180.00", "4772.52", "8.9"],
];

const STUDENT_ROWS = [
  ["Date", "Description", "Category", "Money in", "Money out", "Term"],
  ["2026-09-21", "Maintenance loan instalment", "Income", "3150.00", "", "Autumn"],
  ["2026-09-21", "Part-time job (monthly)", "Income", "320.00", "", "Autumn"],
  ["2026-09-22", "Halls rent (term)", "Housing", "", "2100.00", "Autumn"],
  ["2026-09-23", "Phone", "Bills", "", "12.00", "Autumn"],
  ["2026-09-24", "Food shop", "Groceries", "", "42.30", "Autumn"],
  ["2026-09-26", "Course books", "Study", "", "65.00", "Autumn"],
  ["2026-09-27", "Night out", "Going out", "", "35.00", "Autumn"],
  ["2026-10-01", "Food shop", "Groceries", "", "38.90", "Autumn"],
  ["2026-10-03", "Train home (railcard)", "Transport", "", "24.50", "Autumn"],
  ["2026-10-05", "Streaming (student plan)", "Subscriptions", "", "5.99", "Autumn"],
  ["2026-10-08", "Food shop", "Groceries", "", "44.10", "Autumn"],
  ["2026-10-10", "Sports club membership", "Health", "", "40.00", "Autumn"],
  ["2026-10-12", "Laundry", "Bills", "", "8.00", "Autumn"],
  ["2026-10-15", "Food shop", "Groceries", "", "41.60", "Autumn"],
  ["2026-10-21", "Part-time job (monthly)", "Income", "320.00", "", "Autumn"],
  ["2026-10-22", "Society membership", "Going out", "", "15.00", "Autumn"],
  ["2026-10-25", "Savings for January", "Savings", "", "100.00", "Autumn"],
];

export const TEMPLATES = [
  {
    slug: "monthly-budget-planner-template",
    card: "Monthly budget planner",
    cardD: "Income, bills, spending and savings in one sheet",
    crumb: "Monthly budget planner",
    title: "Free monthly budget planner template (UK, CSV)",
    description:
      "A free UK monthly budget planner template as a plain CSV. Open it in Excel or Google Sheets, or import it into The Income Tracker for live totals. No sign-up.",
    h1: "Free monthly budget planner template",
    tldr:
      "One sheet, one month: income at the top, then rent, bills, groceries, transport, subscriptions and savings. Download the CSV, swap the example rows for your own, and either total it in a spreadsheet or import it into The Income Tracker for live totals.",
    published: "2026-09-08",
    file: { name: "monthly-budget-planner-template.csv", rows: HOUSEHOLD_ROWS },
    columns: [
      { name: "Date", meaning: "When the money moved, in year-month-day form so it sorts correctly." },
      { name: "Description", meaning: "What it was. Keep it short and consistent (\"Weekly food shop\" every week, not five variations)." },
      { name: "Category", meaning: "One of about ten buckets. Housing, Bills, Groceries, Transport, Subscriptions, Eating out, Health, Gifts, Savings, Income." },
      { name: "Money in / Money out", meaning: "Two columns instead of one signed amount. Easier to read, and it imports cleanly." },
      { name: "Notes", meaning: "Optional. Billing day, who it was for, anything future-you will want." },
    ],
    howto: [
      "Download the CSV and open it in Excel, Google Sheets or Numbers.",
      "Delete the example rows and add your own income first, then every regular bill.",
      "Add spending as it happens, or once a week from your banking app.",
      "In a spreadsheet, put =SUM() under Money in and Money out and subtract. Or skip that step: import the file into The Income Tracker and the totals, categories and savings rate appear on their own.",
    ],
    sections: [
      {
        h: "Why a monthly planner beats an annual one",
        p: [
          "A year is too big to feel. A month is the unit your bills, your pay and your habits already run on. Plan one month properly, copy it forward, and adjust. That is the whole method, and it works because it is small enough to keep up.",
        ],
      },
      {
        h: "The categories, and why there are only ten",
        p: [
          "The template uses about ten categories on purpose. Thirty categories look thorough and get abandoned by week three. Ten is enough to see where the money goes and few enough that sorting takes seconds. If you import the file into the tracker, you can rename or merge them later without redoing anything.",
        ],
      },
      {
        h: "Stop typing: import your bank CSV instead",
        p: [
          "The template is a good way to plan a month. It is a slow way to record one. Every UK bank lets you download your real transactions as a CSV, and The Income Tracker reads that file directly, categorises the merchants it recognises, and remembers your choices next month. Start with the template if you like, then let the bank file do the typing.",
        ],
      },
    ],
    faqs: [
      { q: "Is the budget template really free?", a: "Yes. It is a plain CSV file with no sign-up, no macros and no locked cells. Use it in any spreadsheet or import it into The Income Tracker." },
      { q: "Does it work in Google Sheets and Excel?", a: "Yes. Both open CSV files directly. In Google Sheets use File, then Import, then Upload. In Excel just open the file." },
      { q: "Can I import the template into The Income Tracker?", a: "Yes. The column names match what the importer looks for (Date, Description, Category, Money in, Money out), so the file imports in one step with the categories already applied." },
      { q: "Should I use the template or a bank CSV?", a: "Use the template to plan and a bank CSV to record. The bank file is exact and takes no typing." },
    ],
    related: ["income-and-expenditure-form-template", "household-bills-tracker-template", "import", "monthly-surplus-calculator"],
  },
  {
    slug: "income-and-expenditure-form-template",
    card: "Income and expenditure form",
    cardD: "The budget sheet lenders and debt advisers ask for",
    crumb: "Income and expenditure form",
    title: "Free income and expenditure form template (UK, CSV)",
    description:
      "A free UK income and expenditure form template in the layout lenders and debt advisers expect: income, fixed costs, living costs, debts. CSV for Excel or Sheets.",
    h1: "Free income and expenditure form template",
    tldr:
      "An income and expenditure form is a one-page monthly budget: everything coming in, everything going out, grouped into fixed costs, living costs, flexible costs and debts. Download the template, fill in your monthly figures, and you have the sheet a mortgage lender, landlord or debt adviser will ask for.",
    published: "2026-09-08",
    file: { name: "income-and-expenditure-form-template.csv", rows: INCOME_EXPENDITURE_ROWS },
    columns: [
      { name: "Date", meaning: "Use the first of the month for every line. This is a monthly snapshot, not a transaction list." },
      { name: "Description", meaning: "The income source or cost, in the wording most forms use." },
      { name: "Category", meaning: "Income, Housing, Fixed costs, Living costs, Flexible costs, Debts, Savings. This grouping mirrors the layout debt advisers use." },
      { name: "Money in / Money out", meaning: "Monthly figures. Convert weekly amounts by multiplying by 52 and dividing by 12; annual amounts by dividing by 12." },
      { name: "Frequency", meaning: "A reminder of how the real bill lands, so you can check the monthly figure is right." },
    ],
    howto: [
      "Download the CSV and open it in a spreadsheet, or import it straight into The Income Tracker.",
      "Replace the example figures with your own monthly amounts. Zero is a valid answer; leave the row so nothing is forgotten.",
      "Convert anything weekly or annual to a monthly figure (weekly times 52, divided by 12).",
      "Total the income column, total the outgoings, and subtract. A positive number is your surplus; a negative one is the gap to close.",
    ],
    sections: [
      {
        h: "When you will be asked for one",
        ul: [
          "A mortgage or remortgage application, where lenders stress-test your outgoings.",
          "Renting through a letting agent, especially with a guarantor.",
          "Talking to a debt adviser or creditor about an affordable repayment plan.",
          "A budgeting conversation with yourself, which is the most useful of the four.",
        ],
      },
      {
        h: "Be honest with the flexible costs",
        p: [
          "Fixed costs are easy: the numbers are on your statements. The form falls apart in the flexible rows, where people guess low. Do not guess. Export three months of transactions from your bank, import them into the tracker, and read the real average for food, eating out and subscriptions. It is nearly always higher than the number you would have written down, and that is exactly why the form is worth doing.",
        ],
      },
    ],
    faqs: [
      { q: "What is an income and expenditure form?", a: "A one-page monthly budget listing all income and all outgoings, grouped so a lender or adviser can see fixed costs, living costs, flexible spending and debt payments at a glance." },
      { q: "Is this the same as the Standard Financial Statement?", a: "It follows the same structure of income, fixed and flexible costs and debts. Debt advisers use the official Standard Financial Statement; this template is the plain version you can fill in yourself and bring to that conversation." },
      { q: "How do I get accurate figures?", a: "Import three months of your bank CSV into The Income Tracker and use the monthly averages it shows for each category. Real numbers beat estimates every time." },
    ],
    related: ["monthly-budget-planner-template", "monthly-surplus-calculator", "loan-repayment-and-savings-goal-planner", "import"],
  },
  {
    slug: "self-employed-income-tracker-template",
    card: "Self-employed income tracker",
    cardD: "Income and expenses in Self Assessment categories",
    crumb: "Self-employed income tracker",
    title: "Self-employed income tracker template (free UK CSV)",
    description:
      "A free UK self-employed income and expense tracker CSV. Categories match the Self Assessment self-employment pages, so year-end figures fall out of the sheet.",
    h1: "Free self-employed income and expense tracker template",
    tldr:
      "Sole traders need three things on record: every invoice paid, every allowable expense with its category, and a tax pot. This template does all three, using the same expense categories as the self-employment pages of a Self Assessment return so nothing needs re-sorting in January.",
    published: "2026-09-08",
    file: { name: "self-employed-income-tracker-template.csv", rows: SELF_EMPLOYED_ROWS },
    columns: [
      { name: "Date", meaning: "The date money actually arrived or left, which is what most sole traders use (cash basis)." },
      { name: "Description", meaning: "Invoice number and job for income; what was bought for expenses." },
      { name: "Category", meaning: "Sales and income, plus the expense headings used on the self-employment pages of the tax return: cost of goods, travel, office costs, insurance, advertising, professional fees, bank charges and so on." },
      { name: "Money in / Money out", meaning: "Business money only. Personal spending stays in your personal ledger." },
      { name: "Reference", meaning: "Client name, receipt saved, business-use percentage. The things HMRC could ask about later." },
    ],
    howto: [
      "Download the CSV and open it in a spreadsheet, or import it into The Income Tracker as its own ledger.",
      "Delete the example rows. Add income as it is paid, with the invoice number in the description.",
      "Add expenses with the matching category. When in doubt, note the business-use share in the Reference column.",
      "Move a fixed share of every payment (many sole traders use 20 to 30 percent) into a separate tax pot and log it as \"Set aside for tax\" so it never looks like spendable money.",
    ],
    sections: [
      {
        h: "Why the categories match the tax return",
        p: [
          "At year end, the self-employment pages of a Self Assessment return ask for expenses under fixed headings: cost of goods, car and travel, staff, premises and insurance, repairs, office and phone, advertising, interest, bank charges, bad debts, professional fees, and other. Track under those headings from day one and the return is a copy job. Track under \"misc\" and January becomes a shoebox of receipts.",
        ],
      },
      {
        h: "Keep business and personal apart",
        p: [
          "If you use a separate business account, export its CSV each month and import that. If everything runs through one personal account, import the CSV, mark the business rows with these categories and leave the rest in your personal categories. The tracker remembers each merchant, so the second month is mostly automatic.",
        ],
      },
    ],
    faqs: [
      { q: "Does this replace accounting software?", a: "For a simple sole trader with a modest turnover, a clean record of income and categorised expenses is what you need for a Self Assessment return. If you are VAT registered, employ people or need digital quarterly submissions, you will want proper software on top." },
      { q: "Which expenses can I claim?", a: "Allowable expenses are the costs of running the business, such as stock, travel for work, tools, phone and office costs, insurance and professional fees. HMRC's guidance lists them in detail. Track everything with a category and decide at year end." },
      { q: "Can I import this into The Income Tracker?", a: "Yes. The headers match the importer, so the categories come across with the rows. Many people keep a separate ledger for the business." },
    ],
    related: ["self-employed-income-tracker-uk", "monthly-budget-planner-template", "import", "monthly-surplus-calculator"],
  },
  {
    slug: "household-bills-tracker-template",
    card: "Household bills tracker",
    cardD: "Every direct debit, standing order and subscription",
    crumb: "Household bills tracker",
    title: "Free household bills tracker template (UK, CSV)",
    description:
      "A free UK household bills tracker template: every direct debit, standing order and subscription with its billing day. Excel, Sheets, or import as recurring bills.",
    h1: "Free household bills tracker template",
    tldr:
      "List every regular payment once, with its billing day and how it is paid, and you will never be surprised by a direct debit again. Download the CSV, fill it in from your last statement, and import it into The Income Tracker to have the bills seed themselves every month.",
    published: "2026-09-08",
    file: { name: "household-bills-tracker-template.csv", rows: BILLS_ROWS },
    columns: [
      { name: "Date", meaning: "The date the payment lands in the current month." },
      { name: "Description", meaning: "The bill or subscription. Use the name that appears on your statement so it matches when you import a bank CSV later." },
      { name: "Category", meaning: "Housing, Bills, Insurance, Subscriptions, Health, Savings. Keep it coarse." },
      { name: "Money out", meaning: "The monthly amount. For annual bills paid monthly, the instalment." },
      { name: "Billing day", meaning: "The day of the month it is collected. Sort by this column and you can see the crunch days." },
      { name: "How paid", meaning: "Direct debit, standing order or a card continuous payment. It matters when you want to cancel something." },
    ],
    howto: [
      "Download the CSV and open your last full monthly bank statement next to it.",
      "Work down the statement and add every payment that repeats: rent, council tax, utilities, insurance, subscriptions, savings transfers.",
      "Sort by billing day. If most bills land before your pay does, that is your overdraft explained.",
      "Import the file into The Income Tracker and mark the rows as recurring. They will appear in every new month automatically, and the app will flag anything that changes amount.",
    ],
    sections: [
      {
        h: "The audit this template forces",
        p: [
          "Writing every bill down is boring. It is also the fastest way to find the subscription you forgot, the insurance that quietly went up at renewal, and the two streaming services doing the same job. Most people find something to cancel before they reach the bottom of the list.",
        ],
      },
      {
        h: "Direct debit, standing order, or card?",
        p: [
          "A direct debit is collected by the company and covered by the Direct Debit Guarantee. A standing order is an instruction you give your bank for a fixed amount. A card continuous payment authority is the one that catches people out, because it does not show up in your direct debit list. Note which is which, so cancelling is a two-minute job rather than a mystery.",
        ],
      },
    ],
    faqs: [
      { q: "Can the tracker seed these bills every month?", a: "Yes. Import the file, mark the rows as recurring, and each new month starts with them already in place. If a bill changes amount, the app flags it." },
      { q: "How do I cancel a subscription paid by card?", a: "Contact the company, and if that fails ask your bank or card issuer to stop the continuous payment authority. Note it in the How paid column so you know which route applies." },
      { q: "Is it free?", a: "Yes. A plain CSV with no sign-up, usable in any spreadsheet or in The Income Tracker." },
    ],
    related: ["find-and-cancel-unused-subscriptions", "monthly-budget-planner-template", "subscription-cost-calculator", "import"],
  },
  // Added 16 September 2026.
  {
    slug: "weekly-budget-planner-template",
    card: "Weekly budget planner",
    cardD: "For weekly pay, with the monthly bills spread across weeks",
    crumb: "Weekly budget planner",
    title: "Free weekly budget planner template (UK, CSV)",
    description:
      "A free UK weekly budget planner template for people paid weekly. Four weeks in one sheet, monthly bills placed in the week they fall, and a running view of what is left. Excel, Sheets, or import into the app.",
    h1: "Free weekly budget planner template",
    tldr:
      "If you are paid weekly, a monthly budget never quite fits. This template runs week by week: wages in, rent share and weekly food out, and the monthly bills placed in the week they are actually collected. Download the CSV, replace the example rows, and see which week is the tight one.",
    published: "2026-09-16",
    updated: "2026-09-16",
    file: { name: "weekly-budget-planner-template.csv", rows: WEEKLY_ROWS },
    columns: [
      { name: "Date", meaning: "The day the money moves. Keep it accurate; the whole point is seeing which week the bills land in." },
      { name: "Description", meaning: "What it was. Note monthly bills as monthly so you remember they do not repeat next week." },
      { name: "Category", meaning: "Income, Housing, Bills, Groceries, Transport, Eating out, Savings. Keep it short." },
      { name: "Money in / Money out", meaning: "Two columns, which import cleanly and are easy to total." },
      { name: "Week", meaning: "Week 1 to Week 4 (or 5). Filter by this column to see one week at a time." },
    ],
    howto: [
      "Download the CSV and open it in Excel, Google Sheets or Numbers.",
      "Put your weekly take-home on each payday and your rent share against it.",
      "Add the monthly bills in the week they are collected. Council tax, energy and phone rarely land in the same week.",
      "Add weekly food and transport, then filter by week. The week with the most bills is the one to plan around.",
      "Or import the file into The Income Tracker for totals and a monthly view alongside the weekly one.",
    ],
    sections: [
      {
        h: "Why weekly pay needs its own template",
        p: [
          "Fifty-two weekly paydays do not divide into twelve months. Some months have five paydays, and monthly bills hit in whichever week they like. A monthly budget hides that; a weekly one shows it. The trick is to spread monthly bills across the weeks so that no single payday is wiped out.",
        ],
      },
      {
        h: "The fifth payday",
        p: [
          "Four months a year have five Fridays. That fifth wage is the easiest savings you will ever make, because no bill is expecting it. Mark those weeks in advance and decide now where the money goes.",
        ],
      },
    ],
    faqs: [
      { q: "Can I use this if I am paid fortnightly?", a: "Yes. Put wages on every other week and keep the bills where they fall. The weekly to monthly calculator converts fortnightly pay to a monthly average if you need one." },
      { q: "Does it import into The Income Tracker?", a: "Yes. The column headers match the importer, so the file imports in one step and the Week column is kept as a note." },
      { q: "Is it free?", a: "Yes. A plain CSV with no sign-up, no macros and no locked cells." },
    ],
    related: ["weekly-to-monthly-budget-calculator", "spend-per-day-until-payday-calculator", "monthly-budget-planner-template", "budget-on-a-variable-income-uk"],
  },
  {
    slug: "savings-tracker-template",
    card: "Savings tracker",
    cardD: "Several goals in one sheet, with interest and withdrawals",
    crumb: "Savings tracker",
    title: "Free savings tracker template (UK, CSV)",
    description:
      "A free UK savings tracker template: log transfers, interest and withdrawals against named goals with targets. Open in Excel or Sheets, or import into The Income Tracker for projected dates.",
    h1: "Free savings tracker template",
    tldr:
      "One row per movement, one goal per name. Log every payday transfer, every bit of interest and every withdrawal, and the running total for each goal is one filter away. Import it into The Income Tracker and each goal gets a projected finish date.",
    published: "2026-09-16",
    updated: "2026-09-16",
    file: { name: "savings-tracker-template.csv", rows: SAVINGS_ROWS },
    columns: [
      { name: "Date", meaning: "When the money moved." },
      { name: "Description", meaning: "Payday transfer, interest, or what a withdrawal paid for." },
      { name: "Category", meaning: "Savings for transfers and withdrawals, Interest for interest. Keeping interest separate shows how much the account is earning." },
      { name: "Money in / Money out", meaning: "Money in for deposits and interest, money out for withdrawals." },
      { name: "Goal", meaning: "The goal name with its target in brackets, so filtering by goal gives the balance and the gap." },
    ],
    howto: [
      "Download the CSV and add an opening balance row for each goal you already have.",
      "Each payday, add a transfer row per goal. Set up standing orders and the rows write themselves from your statement.",
      "Add interest when it is paid and withdrawals when you use the money.",
      "Filter by goal and sum Money in minus Money out for the balance. Or import into The Income Tracker, where goals show a balance and a projected completion date.",
    ],
    sections: [
      {
        h: "Name the goals, and the order",
        p: [
          "An emergency fund first, then the specific goals. MoneyHelper's guideline is three to six months of essential outgoings for emergencies, and the emergency fund calculator on this site turns that into a monthly amount. Once it is there, the rest is choice: holiday, car, deposit, Christmas.",
        ],
      },
      {
        h: "Log the withdrawals too",
        p: [
          "Savings you spend are still savings that did their job. Logging the boiler repair against the emergency fund shows the fund working, and shows how much needs rebuilding. That is more motivating than a balance that only ever goes up until it suddenly does not.",
        ],
      },
    ],
    faqs: [
      { q: "Can I track more than one savings goal?", a: "Yes. Put the goal name in the Goal column and filter by it. The Income Tracker shows each goal separately with a projected date." },
      { q: "Should I include interest?", a: "Yes, as a separate Interest category. Over a year it shows what the account is actually paying, which is useful when comparing accounts." },
      { q: "Is it free?", a: "Yes. A plain CSV file with no sign-up." },
    ],
    related: ["emergency-fund-calculator-uk", "how-much-should-i-save-each-month-uk", "how-long-to-save-10000-for-a-car", "monthly-budget-planner-template"],
  },
  {
    slug: "debt-payoff-tracker-template",
    card: "Debt payoff tracker",
    cardD: "Every balance, payment and rate in one place",
    crumb: "Debt payoff tracker",
    title: "Free debt payoff tracker template (UK, CSV)",
    description:
      "A free UK debt payoff tracker template: list each card, loan and overdraft with its balance, rate and payments, and watch the balances fall. Works with the snowball or avalanche method.",
    h1: "Free debt payoff tracker template",
    tldr:
      "One row per payment, with the balance after it and the rate on that debt. Sort by APR for the avalanche order or by balance for the snowball, and the sheet shows which debt to overpay next. Download the CSV, list what you owe today, and update it every payday.",
    published: "2026-09-16",
    updated: "2026-09-16",
    file: { name: "debt-payoff-tracker-template.csv", rows: DEBT_ROWS },
    columns: [
      { name: "Date", meaning: "Payment date. Start with an opening balance row for each debt dated today." },
      { name: "Description", meaning: "Which debt. Note any 0% end date in the name so it is impossible to forget." },
      { name: "Category", meaning: "Debt. One category keeps the sheet simple; the description does the rest." },
      { name: "Money out", meaning: "The payment made." },
      { name: "Balance after", meaning: "What is left on that debt after the payment, from the statement. Interest is already in this number." },
      { name: "APR", meaning: "The rate on that debt. Sort by it to see the most expensive one." },
    ],
    howto: [
      "Download the CSV and replace the example rows with an opening balance for every debt you have, including overdrafts and buy-now-pay-later.",
      "Decide the order: highest APR first (avalanche) saves the most money; smallest balance first (snowball) gives the quickest wins. The calculator on this site compares them for your numbers.",
      "Pay minimums on everything and put every spare pound on the first debt in the order.",
      "Each payday, add a row per payment with the new balance. When one hits zero, its payment rolls onto the next.",
    ],
    sections: [
      {
        h: "The one rule for 0% cards",
        p: [
          "A 0% balance is free only until the promotional period ends. Put the end date in the description and work out the monthly payment that clears it in time. Below the minimum for that, the 0% card should still get its share, whatever the payoff order says.",
        ],
      },
      {
        h: "When the numbers do not work",
        p: [
          "If minimum payments alone are more than you can afford, the tracker has done its job by showing you that early. StepChange, Citizens Advice and National Debtline give free, confidential advice and can set up a plan with creditors. The income and expenditure form guide on this site explains what they will ask for.",
        ],
      },
    ],
    faqs: [
      { q: "Snowball or avalanche?", a: "Avalanche (highest rate first) costs less in interest. Snowball (smallest balance first) clears an account sooner, which many people find easier to stick to. The difference in pounds is often small; pick the one you will keep doing." },
      { q: "Does the template calculate interest?", a: "No. Take the balance after each payment from your statement, which already includes interest. The debt snowball vs avalanche calculator does the projections." },
      { q: "Is it free?", a: "Yes. A plain CSV file with no sign-up, no macros and no locked cells." },
    ],
    related: ["debt-snowball-vs-avalanche-calculator", "0-percent-credit-card-payoff-calculator-uk", "income-and-expenditure-form-uk", "overdraft-cost-calculator-uk"],
  },
  {
    slug: "student-budget-template",
    card: "Student budget",
    cardD: "Term-by-term, built around the maintenance loan",
    crumb: "Student budget",
    title: "Free student budget template (UK, CSV)",
    description:
      "A free UK student budget template built around termly maintenance loan instalments: rent, food, travel, study costs and going out, with a term column so the loan lasts until the next one arrives.",
    h1: "Free student budget template",
    tldr:
      "The maintenance loan arrives three times a year and has to last until the next instalment. This template works by term: loan and any job income in, halls or rent out first, then the weekly costs. Download the CSV, put in your own figures, and divide what is left by the weeks until the next payment.",
    published: "2026-09-16",
    updated: "2026-09-16",
    file: { name: "student-budget-template.csv", rows: STUDENT_ROWS },
    columns: [
      { name: "Date", meaning: "When it happened. The loan instalment date is the anchor for each term." },
      { name: "Description", meaning: "What it was. Keep names consistent so the same shop is easy to spot." },
      { name: "Category", meaning: "Income, Housing, Bills, Groceries, Transport, Study, Going out, Subscriptions, Health, Savings." },
      { name: "Money in / Money out", meaning: "Two columns for easy totals." },
      { name: "Term", meaning: "Autumn, Spring, Summer. Filter by term to see whether the loan will last." },
    ],
    howto: [
      "Download the CSV and enter your maintenance loan instalment and any regular job income for the term.",
      "Put rent for the term at the top. What remains is the money for everything else until the next instalment.",
      "Divide that by the number of weeks in the term. That is your weekly number, and the spend-per-day calculator can break it down further.",
      "Add spending as it happens, or import your bank CSV into The Income Tracker each month and let it do the sorting.",
    ],
    sections: [
      {
        h: "The January problem",
        p: [
          "The autumn instalment has to cover Freshers' Week, Christmas and the gap until January. Most students run short in December. The fix is boring and works: set the weekly figure in September, move a little to a savings pot each week, and treat December as two months.",
        ],
      },
      {
        h: "Discounts that change the numbers",
        p: [
          "A 16-25 Railcard, student bank account overdrafts at 0%, student plans on streaming and software, and council tax exemption for full-time students all shift the budget. Put the real figures in the template rather than the headline prices.",
        ],
      },
    ],
    faqs: [
      { q: "How do I budget a maintenance loan?", a: "Subtract rent for the term from the instalment, divide what is left by the weeks until the next payment, and spend to that weekly figure. The template and the spend-per-day calculator do the arithmetic." },
      { q: "Should I include my student overdraft?", a: "Track it as a debt with a 0% rate and note when the interest-free period ends after graduation. It is a useful buffer and an expensive habit." },
      { q: "Is it free?", a: "Yes. A plain CSV, no sign-up, usable in any spreadsheet or in The Income Tracker." },
    ],
    related: ["spend-per-day-until-payday-calculator", "weekly-budget-planner-template", "how-to-budget-for-beginners-uk", "import"],
  },
];
