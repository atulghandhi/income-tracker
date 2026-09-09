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
];
