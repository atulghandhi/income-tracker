import { BUDGET_TOOLS } from "./budget-tools.mjs";

// Interactive calculators. Each `compute` is browser JS rendered inline.
// It must not contain backticks or ${ so it can live inside template literals.

export const CALCULATORS = [
  ...BUDGET_TOOLS,
  {
    slug: "0-percent-credit-card-payoff-calculator-uk",
    published: "2026-06-16",
    card: "0% credit card payoff",
    cardD: "What to pay to clear it in time",
    crumb: "0% credit card payoff",
    title: "0% credit card payoff calculator (UK)",
    description:
      "Free UK 0% credit card payoff calculator. Work out exactly what to pay each month to clear your balance before the 0% deal ends and the interest hits.",
    h1: "0% credit card payoff calculator",
    tldr:
      "A 0% card is free money, but only if you clear it before the deal ends. Enter your balance and the months you have left, and this works out the monthly payment that gets you to zero in time.",
    fields: [
      { id: "bal", label: "Balance left", prefix: "£", value: 2000 },
      { id: "months", label: "0% months remaining", value: 18 },
      { id: "apr", label: "APR after 0% ends", suffix: "%", value: 24.9 },
    ],
    compute: `
    var bal=n('bal'), m=n('months'), apr=n('apr');
    if(bal<=0||m<=0){out.innerHTML='<p class="calc-hint">Enter your balance and the number of 0% months you have left.</p>';return;}
    var pay=bal/m;
    var html='<div class="calc-headline">'+gbp(pay)+' <small>per month</small></div>';
    html+='<p>Pay this each month to clear '+gbp(bal)+' before your 0% deal ends in '+m+(m===1?' month':' months')+'.</p>';
    if(apr>0){var mi=bal*(apr/100)/12;html+='<p class="calc-warn">Miss the deadline and interest starts at '+apr+'% APR. On this balance that is roughly '+gbp(mi)+' a month. That is the trap to avoid.</p>';}
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "How to use it",
        ul: [
          "Balance left: what you still owe on the card.",
          "0% months remaining: how long until the promotional rate ends.",
          "APR after 0% ends: the standard rate, shown on your statement. Optional, but it shows the cost of slipping up.",
        ],
      },
      {
        h: "The one rule with 0% cards",
        p: [
          "Clear the balance before the 0% window closes. Set the monthly payment above as a standing order and forget about it. Leave it to the last minute and a single missed deadline can wipe out months of interest-free progress.",
        ],
      },
    ],
    faqs: [
      {
        q: "How much should I pay each month on a 0% credit card?",
        a: "Divide your balance by the number of 0% months left. Pay that each month and the balance reaches zero just as the deal ends. The calculator above does the maths for you.",
      },
      {
        q: "What happens when the 0% period ends?",
        a: "Any leftover balance starts accruing interest at the card's standard APR, often 20% or more. That is why clearing it in time matters so much.",
      },
      {
        q: "Is this calculator free?",
        a: "Yes, completely free, and nothing you type leaves your browser.",
      },
    ],
    related: ["loan-repayment-and-savings-goal-planner", "credit-card-utilisation-calculator-uk", "tools", "app"],
  },
  {
    slug: "credit-card-utilisation-calculator-uk",
    published: "2026-06-16",
    card: "Credit card utilisation",
    cardD: "See your score-friendly ratio",
    crumb: "Credit card utilisation",
    title: "Credit card utilisation calculator (UK)",
    description:
      "Free UK credit utilisation calculator. See what percentage of your credit limit you are using and whether it could be hurting your credit score.",
    h1: "Credit card utilisation calculator",
    tldr:
      "Utilisation is the share of your credit limit you are using. UK lenders like to see it low. Experian and Equifax both suggest keeping it below 25%, and under 10% is better still. Enter your balance and limit to see where you stand.",
    fields: [
      { id: "bal", label: "Total card balance", prefix: "£", value: 1500 },
      { id: "limit", label: "Total credit limit", prefix: "£", value: 5000 },
    ],
    compute: `
    var bal=n('bal'), lim=n('limit');
    if(lim<=0){out.innerHTML='<p class="calc-hint">Enter your total credit limit.</p>';return;}
    var u=bal/lim*100;
    var msg,cls;
    if(u<10){msg='Excellent. This is the sweet spot lenders like to see.';cls='good';}
    else if(u<=25){msg='Healthy. Inside the under-25% range Experian and Equifax suggest.';cls='good';}
    else if(u<=50){msg='Getting high. Worth bringing down before you apply for credit.';cls='warn';}
    else{msg='High. This can drag your credit score down.';cls='bad';}
    out.innerHTML='<div class="calc-headline calc-'+cls+'">'+(Math.round(u*10)/10)+'%</div><p class="calc-'+cls+'">'+msg+'</p><p>'+gbp(bal)+' used of a '+gbp(lim)+' limit.</p>';
  `,
    sections: [
      {
        h: "Why utilisation matters",
        p: [
          "It is one of the biggest levers on your credit score, and one of the easiest to move. Pay a chunk off before your statement date and your reported utilisation drops, often within a month. Lenders read low utilisation as a sign you are in control rather than stretched.",
        ],
      },
      {
        h: "Quick ways to lower it",
        ul: [
          "Pay down the balance, ideally before the statement date.",
          "Ask for a higher credit limit and then do not use it.",
          "Spread spending across cards instead of maxing one.",
        ],
      },
    ],
    faqs: [
      {
        q: "What is a good credit utilisation in the UK?",
        a: "Experian UK and Equifax UK both suggest staying below 25% of your total limit, and under 10% is better still. The 30% figure you often see is US guidance. High utilisation can pull your credit score down.",
      },
      {
        q: "How is credit utilisation calculated?",
        a: "Total balance divided by total credit limit, as a percentage. So £1,500 owed on a £5,000 limit is 30%.",
      },
      {
        q: "Does checking this affect my credit score?",
        a: "No. This calculator runs in your browser and does not touch your credit file.",
      },
    ],
    checked: "2026-09-08",
    sources: [
      { t: "Experian UK: credit utilisation ratio", href: "https://www.experian.co.uk/consumer/guides/credit-utilisation-ratio.html" },
      { t: "Equifax UK: credit limits and utilisation", href: "https://www.equifax.co.uk/resources/loans-and-credit/credit-limit" },
    ],
    related: ["0-percent-credit-card-payoff-calculator-uk", "loan-repayment-and-savings-goal-planner", "tools", "app"],
  },
  {
    slug: "how-long-to-save-10000-for-a-car",
    published: "2026-06-16",
    card: "Save £10,000 (or any goal)",
    cardD: "How long it will take",
    crumb: "How long to save £10,000",
    title: "How long to save £10,000 for a car (calculator)",
    description:
      "How long does it take to save £10,000 for a car? Enter what you save each month and see the exact date you hit your goal. Free UK savings goal calculator.",
    h1: "How long to save £10,000 for a car",
    tldr:
      "Saving for a car comes down to one number: how much you put away each month. Pop in your goal and your monthly amount, and this tells you the month you will hit it. Add a savings rate to factor in interest.",
    fields: [
      { id: "target", label: "Goal amount", prefix: "£", value: 10000 },
      { id: "saved", label: "Saved so far", prefix: "£", value: 0 },
      { id: "monthly", label: "Saving per month", prefix: "£", value: 300 },
      { id: "rate", label: "Interest (optional)", suffix: "%", value: 0 },
    ],
    compute: `
    var t=n('target'), s=n('saved'), m=n('monthly'), r=n('rate')/100/12;
    if(m<=0){out.innerHTML='<p class="calc-hint">Enter how much you can put away each month.</p>';return;}
    var need=t-s;
    if(need<=0){out.innerHTML='<div class="calc-headline calc-good">Already there</div><p>You have '+gbp(s)+', which covers your '+gbp(t)+' goal.</p>';return;}
    var months;
    if(r>0){months=Math.log((t*r+m)/(s*r+m))/Math.log(1+r);}else{months=need/m;}
    months=Math.ceil(months);
    var d=new Date();d.setMonth(d.getMonth()+months);
    var when=d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    var y=Math.floor(months/12),mm=months%12;
    var dur=(y?y+(y===1?' year':' years'):'')+(y&&mm?' ':'')+(mm?mm+(mm===1?' month':' months'):'');
    if(!dur)dur=months+' months';
    out.innerHTML='<div class="calc-headline">'+dur+'</div><p>Putting away '+gbp(m)+' a month, you reach '+gbp(t)+' around <strong>'+when+'</strong>.</p>';
  `,
    sections: [
      {
        h: "Want to get there sooner?",
        ul: [
          "Raise the monthly amount, even by a little. It moves the date more than you would think.",
          "Drop the goal. A solid used car can cost far less than £10,000.",
          "Park the savings somewhere that earns interest and add your rate above.",
        ],
      },
      {
        h: "The honest bit",
        p: [
          "A target date only works if the monthly amount is realistic. Track your actual surplus first, then set the number you can truly keep up. That is where The Income Tracker comes in.",
        ],
      },
    ],
    faqs: [
      {
        q: "How long does it take to save £10,000?",
        a: "It depends on how much you put away each month. At £300 a month it takes under three years. Enter your own numbers above for an exact date.",
      },
      {
        q: "Does adding interest change much?",
        a: "Over a few years, a little. Add your savings rate above to factor it in.",
      },
      {
        q: "Is the calculator free?",
        a: "Yes, and nothing you enter is stored or sent anywhere.",
      },
    ],
    related: ["monthly-surplus-calculator", "loan-repayment-and-savings-goal-planner", "tools", "app"],
  },
  {
    slug: "monthly-surplus-calculator",
    published: "2026-06-16",
    card: "Monthly surplus",
    cardD: "What is left after spending",
    crumb: "Monthly surplus",
    title: "Income and Expenditure Calculator | Monthly Budget",
    description:
      "Free monthly surplus calculator. Subtract your expenses from your income to see how much you have left each month and your savings rate.",
    h1: "Income and expenditure calculator",
    tldr:
      "Your surplus is what is left after expenses. It is the single most useful number in personal finance. Enter your monthly income and spending to see your surplus and savings rate.",
    fields: [
      { id: "income", label: "Monthly income", prefix: "£", value: 2500 },
      { id: "expenses", label: "Monthly expenses", prefix: "£", value: 1900 },
    ],
    compute: `
    var inc=n('income'), exp=n('expenses');
    if(inc<=0){out.innerHTML='<p class="calc-hint">Enter your monthly income.</p>';return;}
    var sur=inc-exp, rate=sur/inc*100;
    var cls=sur<0?'bad':(rate<10?'warn':'good'),msg;
    if(sur<0)msg='You are spending '+gbp(-sur)+' more than you earn. Fix this before anything else.';
    else if(rate<10)msg='A start, but thin. Aim for 20% when you can.';
    else if(rate<20)msg='Solid. You are building a real buffer.';
    else msg='Strong. That is serious progress.';
    out.innerHTML='<div class="calc-headline calc-'+cls+'">'+gbp(sur)+' <small>left over</small></div><p class="calc-'+cls+'">A '+(Math.round(rate*10)/10)+'% savings rate. '+msg+'</p>';
  `,
    sections: [
      {
        h: "What to do with the number",
        p: [
          "A positive surplus is your fuel. It pays down debt, builds an emergency fund, and feeds your savings goals. A negative one is a flashing warning light that needs sorting before anything else.",
        ],
      },
      {
        h: "See it every month, automatically",
        p: [
          "One month is a snapshot. The real value is the trend. Import your bank CSV into The Income Tracker and it works out your surplus month after month, so you can watch it climb.",
        ],
      },
    ],
    faqs: [
      {
        q: "What is a monthly surplus?",
        a: "It is the money left after you subtract your expenses from your income. It is the number that decides how fast you can save or pay off debt.",
      },
      {
        q: "What is a good savings rate?",
        a: "20% or more is strong. Even 10% builds a buffer over time. Anything negative means you are spending more than you earn.",
      },
      {
        q: "How do I track my surplus every month?",
        a: "Import your bank CSV into The Income Tracker and it works out your surplus automatically, month after month.",
      },
    ],
    related: ["how-long-to-save-10000-for-a-car", "loan-repayment-and-savings-goal-planner", "tools", "app"],
  },
  {
    slug: "loan-repayment-and-savings-goal-planner",
    published: "2026-06-16",
    card: "Loan repayment + savings",
    cardD: "Payoff time, then your goal",
    crumb: "Loan repayment + savings",
    title: "Loan repayment and savings goal planner (UK)",
    description:
      "Free loan repayment calculator and savings goal planner. See how long to clear your loan and the interest it costs, then how fast that payment builds your savings.",
    h1: "Loan repayment and savings goal planner",
    tldr:
      "See how long your loan takes to clear and what the interest costs. Then watch what happens when you point that same monthly payment at savings. Same money, two very different jobs.",
    fields: [
      { id: "balance", label: "Loan balance", prefix: "£", value: 5000 },
      { id: "apr", label: "Loan APR", suffix: "%", value: 12.9 },
      { id: "payment", label: "Monthly payment", prefix: "£", value: 200 },
      { id: "goal", label: "Then save up to (optional)", prefix: "£", value: 5000 },
    ],
    compute: `
    var bal=n('balance'), apr=n('apr'), pay=n('payment'), goal=n('goal');
    if(bal<=0||pay<=0){out.innerHTML='<p class="calc-hint">Enter your loan balance and monthly payment.</p>';return;}
    var r=apr/100/12, months, interest;
    if(r<=0){months=Math.ceil(bal/pay);interest=0;}
    else{var mi=bal*r;if(pay<=mi){out.innerHTML='<p class="calc-bad">At '+gbp(pay)+' a month you barely cover the '+gbp(mi)+' of monthly interest, so the balance hardly moves. Pay more if you possibly can.</p>';return;}months=Math.ceil(-Math.log(1-(bal*r)/pay)/Math.log(1+r));interest=pay*months-bal;}
    var html='<div class="calc-headline">'+months+(months===1?' month':' months')+'</div><p>That clears '+gbp(bal)+' at '+gbp(pay)+' a month';
    if(interest>0)html+=', costing about '+gbp(interest)+' in interest';
    html+='.</p>';
    if(goal>0){var gm=Math.ceil(goal/pay);html+='<p class="calc-good">Then point that same '+gbp(pay)+' at savings and you hit '+gbp(goal)+' in about '+gm+(gm===1?' more month':' more months')+'. Same money, new job.</p>';}
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "Debt first, then savings",
        p: [
          "For most people the order is simple. Clear high-interest debt before you chase savings, because the interest you stop paying almost always beats the interest you could earn. Once the loan is gone, the payment does not disappear. Redirect it.",
        ],
      },
      {
        h: "How to read the result",
        ul: [
          "Months to clear: how long until the loan hits zero at your current payment.",
          "Interest cost: the extra you pay on top of the balance. Bigger payments shrink it.",
          "Then save up to: keep the same payment going and see how quickly it builds your next goal.",
        ],
      },
    ],
    faqs: [
      {
        q: "How long will it take to pay off my loan?",
        a: "It depends on the balance, the APR and your monthly payment. Enter them above for an exact number of months and the total interest.",
      },
      {
        q: "Should I pay off debt or save first?",
        a: "Usually clear high-interest debt first, since the interest you save beats most savings rates. Then redirect that payment into savings.",
      },
      {
        q: "Is this planner free?",
        a: "Yes, free, and it runs entirely in your browser.",
      },
    ],
    related: ["0-percent-credit-card-payoff-calculator-uk", "how-long-to-save-10000-for-a-car", "tools", "app"],
  },

  // ── Added September 2026 ────────────────────────────────────────────────────
  {
    slug: "50-30-20-budget-calculator-uk",
    published: "2026-09-08",
    checked: "2026-09-08",
    card: "50/30/20 budget",
    cardD: "Needs, wants and savings from your take-home pay",
    crumb: "50/30/20 budget",
    title: "50/30/20 budget calculator (UK)",
    description:
      "Free UK 50/30/20 budget calculator. Enter your monthly take-home pay to see the needs, wants and savings targets, then compare them with what you actually spend.",
    h1: "50/30/20 budget calculator",
    tldr:
      "The 50/30/20 rule splits take-home pay three ways: half for needs, 30% for wants, 20% for savings and debt repayment. Enter your monthly pay for the targets. Add what you actually spend on needs and wants and it tells you how far off you are.",
    fields: [
      { id: "income", label: "Monthly take-home pay", prefix: "£", value: 2500 },
      { id: "needs", label: "Actual needs (optional)", prefix: "£", value: 0 },
      { id: "wants", label: "Actual wants (optional)", prefix: "£", value: 0 },
    ],
    compute: String.raw`
    var inc=n('income'),needs=n('needs'),wants=n('wants');
    if(inc<=0){out.innerHTML='<p class="calc-hint">Enter your monthly take-home pay.</p>';return;}
    var tn=inc*0.5,tw=inc*0.3,ts=inc*0.2;
    var html='<div class="calc-headline">'+gbp(ts)+' <small>to savings each month</small></div>';
    html+='<p>On '+gbp(inc)+' a month: up to <strong>'+gbp(tn)+'</strong> on needs, up to <strong>'+gbp(tw)+'</strong> on wants, and at least <strong>'+gbp(ts)+'</strong> saved or put towards debt.</p>';
    if(needs>0||wants>0){
      var left=inc-needs-wants,cls=left>=ts?'good':(left>=0?'warn':'bad'),msg;
      if(left>=ts)msg='On target. Anything above the 20% is a bonus.';
      else if(left>=0)msg='Under the 20% target. Wants are the easier lever; needs above half of pay is a housing or bills question.';
      else msg='You are spending more than you earn. Needs and wants both have to come down, needs first if they are over half of pay.';
      html+='<p class="calc-'+cls+'">Your split: needs '+pct(needs/inc*100)+', wants '+pct(wants/inc*100)+', leaving '+gbp(left)+' ('+pct(left/inc*100)+') for savings. '+msg+'</p>';
    }
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "What counts as a need, a want, and savings",
        ul: [
          "Needs: rent or mortgage, council tax, energy, water, broadband, basic food, transport to work, insurance, minimum debt payments. The things you must pay whatever happens.",
          "Wants: eating out, subscriptions, clothes beyond the basics, holidays, hobbies, the nicer version of anything.",
          "Savings: emergency fund, pension top-ups, ISA contributions, and any debt payment above the minimum.",
        ],
      },
      {
        h: "Where the rule comes from, and its limits",
        p: [
          "It was popularised by Elizabeth Warren and Amelia Warren Tyagi in All Your Worth (2005) as a rough shape for a healthy budget, not a law. In expensive parts of the UK, rent alone can pass 40% of take-home pay, which pushes needs over half. That does not make the rule useless; it tells you the problem is the fixed costs, not the coffee.",
        ],
      },
      {
        h: "Find your real split in two minutes",
        p: [
          "Guessing the needs and wants figures defeats the point. Import last month's bank CSV into The Income Tracker, and the category totals give you the real numbers to type into the boxes above. Better still, the tracker shows the split every month without the typing.",
        ],
      },
    ],
    sources: [
      { t: "HuffPost: Elizabeth Warren's All Your Worth and the 50/30/20 rule", href: "https://www.huffpost.com/entry/elizabeth-warren-book-all-your-worth-lessons_l_5cbe4b4ae4b0f7a84a73f5a9" },
      { t: "N26: the 50/30/20 rule explained", href: "https://n26.com/en-eu/blog/50-30-20-rule" },
    ],
    faqs: [
      { q: "What is the 50/30/20 rule?", a: "A budgeting guideline that puts 50% of take-home pay towards needs, 30% towards wants and 20% towards savings and debt repayment. It comes from Elizabeth Warren and Amelia Warren Tyagi's 2005 book All Your Worth." },
      { q: "Is the 50/30/20 rule realistic in the UK?", a: "As a target, yes. Where rent is high, needs often exceed 50%, which the calculator will show. Treat it as a diagnosis rather than a failure." },
      { q: "Does the 20% include pension contributions?", a: "Contributions taken from your pay before tax are already out of your take-home figure. Count any extra you add from take-home pay towards the 20%." },
      { q: "Is this calculator free?", a: "Yes, and nothing you type leaves your browser." },
    ],
    related: ["how-much-should-i-save-each-month-uk", "monthly-surplus-calculator", "emergency-fund-calculator-uk", "how-to-categorise-bank-transactions"],
  },
  {
    slug: "emergency-fund-calculator-uk",
    published: "2026-09-08",
    checked: "2026-09-08",
    card: "Emergency fund",
    cardD: "Your target, and the month you reach it",
    crumb: "Emergency fund",
    title: "Emergency fund calculator (UK)",
    description:
      "Free UK emergency fund calculator. Enter your essential monthly outgoings and months of cover to see your target, the shortfall and the month you will reach it.",
    h1: "Emergency fund calculator",
    tldr:
      "An emergency fund is three to six months of essential outgoings, MoneyHelper's rule of thumb, kept in instant-access savings. Enter your essentials, pick the months of cover, add what you have saved and what you can add each month, and the calculator gives you the target and the date.",
    fields: [
      { id: "essentials", label: "Essential outgoings a month", prefix: "£", value: 1500 },
      { id: "months", label: "Months of cover", value: 3 },
      { id: "saved", label: "Saved so far", prefix: "£", value: 0 },
      { id: "monthly", label: "Saving per month", prefix: "£", value: 150 },
    ],
    compute: String.raw`
    var ess=n('essentials'),m=n('months'),s=n('saved'),pm=n('monthly');
    if(ess<=0||m<=0){out.innerHTML='<p class="calc-hint">Enter your essential monthly outgoings and the months of cover you want.</p>';return;}
    var target=ess*m,gap=target-s;
    var html='<div class="calc-headline">'+gbp(target)+' <small>target</small></div><p>'+m+(m===1?' month':' months')+' of '+gbp(ess)+' essential outgoings.</p>';
    if(gap<=0){html+='<p class="calc-good">Funded. You have '+gbp(s)+', which covers it. Anything extra can go to your next goal.</p>';}
    else{
      html+='<p>Still to save: <strong>'+gbp(gap)+'</strong>.</p>';
      if(pm>0){var mo=Math.ceil(gap/pm);var d=new Date();d.setMonth(d.getMonth()+mo);html+='<p class="calc-good">At '+gbp(pm)+' a month you get there in '+mo+(mo===1?' month':' months')+', around <strong>'+d.toLocaleDateString('en-GB',{month:'long',year:'numeric'})+'</strong>.</p>';}
      else{html+='<p class="calc-hint">Add a monthly saving amount to see how long it takes.</p>';}
      if(s<1000){html+='<p class="calc-warn">First milestone: £1,000. Around three in ten UK adults have less than that saved, so it is worth celebrating on the way to the full fund.</p>';}
    }
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "What counts as essential",
        p: [
          "Rent or mortgage, council tax, energy, water, broadband, food, transport to work, insurance, minimum debt payments, childcare. Not the full month's spending. The fund is there to keep the lights on if income stops, not to keep every subscription running.",
        ],
      },
      {
        h: "Three months or six?",
        ul: [
          "Three months: a steady job, two incomes in the household, or a strong support network.",
          "Six months: self-employed, single income, a specialised job that takes time to replace, or dependants.",
          "Somewhere between, most people. Start with three; extend it once it is there.",
        ],
      },
      {
        h: "Where to keep it",
        p: [
          "Instant-access savings, separate from your current account so it is not spent by accident. Not investments, which can be down exactly when you need the money. Basic-rate taxpayers can earn £1,000 of interest a year tax-free under the Personal Savings Allowance, and a cash ISA shelters interest beyond that.",
        ],
      },
      {
        h: "Find your essentials figure without guessing",
        p: [
          "Import last month's bank CSV into The Income Tracker and add up the Housing, Bills, Groceries, Transport and Health categories. That is your essentials number, and it updates every month.",
        ],
      },
    ],
    sources: [
      { t: "MoneyHelper: emergency savings, how much is enough", href: "https://www.moneyhelper.org.uk/en/savings/types-of-savings/emergency-savings-how-much-is-enough" },
      { t: "FCA: Financial Lives 2024 survey, key findings", href: "https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-key-findings.pdf" },
      { t: "GOV.UK: tax on savings interest", href: "https://www.gov.uk/apply-tax-free-interest-on-savings" },
    ],
    faqs: [
      { q: "How much should an emergency fund be in the UK?", a: "MoneyHelper suggests three to six months of essential outgoings. Use three if your income is steady and six if it is not or you have dependants." },
      { q: "Should my emergency fund be in an ISA?", a: "It should be instant access. A cash ISA can be, and it shelters interest above your Personal Savings Allowance. Avoid fixed-term accounts and investments for this money." },
      { q: "How many people in the UK have no savings?", a: "The FCA's 2024 Financial Lives survey found 10% of adults had no cash savings and a further 21% had under £1,000." },
      { q: "Is the calculator free?", a: "Yes, and nothing you enter is stored or sent anywhere." },
    ],
    related: ["how-much-should-i-save-each-month-uk", "how-long-to-save-10000-for-a-car", "50-30-20-budget-calculator-uk", "monthly-surplus-calculator"],
  },
  {
    slug: "spend-per-day-until-payday-calculator",
    published: "2026-09-08",
    card: "Spend per day until payday",
    cardD: "What you can safely spend today",
    crumb: "Spend per day until payday",
    title: "Spend per day until payday calculator",
    description:
      "Enter what is left in your account, the days until payday and the bills still to come out, and see what you can spend per day and per week without going overdrawn.",
    h1: "How much can I spend per day until payday?",
    tldr:
      "Take what is in your account, subtract the bills that still have to come out before payday, and divide by the days left. That is your daily allowance. Enter the three numbers and the calculator does it, with a weekly figure too.",
    fields: [
      { id: "balance", label: "Money left in the account", prefix: "£", value: 420 },
      { id: "days", label: "Days until payday", value: 12 },
      { id: "bills", label: "Bills still to come out", prefix: "£", value: 60 },
    ],
    compute: String.raw`
    var bal=n('balance'),d=n('days'),bills=n('bills');
    if(d<=0){out.innerHTML='<p class="calc-hint">Enter the number of days until you are paid.</p>';return;}
    var free=bal-bills;
    if(free<0){out.innerHTML='<div class="calc-headline calc-bad">'+gbp(-free)+' <small>short</small></div><p class="calc-bad">The bills still to come out ('+gbp(bills)+') are more than the money you have left. Move a payment date, dip into savings, or talk to your bank before anything bounces. Unarranged overdraft charges are the expensive way to find out.</p>';return;}
    var perDay=free/d,perWeek=perDay*7,cls=perDay<5?'bad':(perDay<12?'warn':'good');
    var html='<div class="calc-headline calc-'+cls+'">'+gbp(perDay)+' <small>a day</small></div>';
    html+='<p>'+gbp(free)+' spendable over '+d+(d===1?' day':' days')+', or about <strong>'+gbp(perWeek)+' a week</strong>.</p>';
    if(cls==='bad')html+='<p class="calc-bad">Tight. Plan meals from what is in the cupboard and keep the card in the drawer for the non-essentials.</p>';
    else if(cls==='warn')html+='<p class="calc-warn">Doable, but one unplanned spend eats two days. Decide now what the week's one treat is.</p>';
    else html+='<p class="calc-good">Comfortable. Consider moving some of it to savings today, before it becomes spending.</p>';
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "Do not forget the bills",
        p: [
          "The number people get wrong is the middle one. A balance of £420 looks fine until the £60 phone bill and the £45 gym come out on the 20th. Check the direct debit list in your banking app for anything dated before payday and add it up. The household bills template makes this a one-off job.",
        ],
      },
      {
        h: "Make the allowance stick",
        ul: [
          "Move the spendable amount to a separate pot or card and spend only from that.",
          "Recalculate mid-way; a good week early on buys slack later.",
          "If you are here every month, the problem is the month, not the week. Track a full month and find the category that is doing it.",
        ],
      },
    ],
    faqs: [
      { q: "How do I work out how much I can spend a day?", a: "Money in the account, minus bills still to come out before payday, divided by the days until payday." },
      { q: "What if the answer is negative?", a: "The bills exceed what you have. Move a payment date, use savings if you have them, or contact your bank before a payment fails; unarranged overdrafts are expensive." },
      { q: "Does this replace a budget?", a: "No. It gets you to payday. A monthly ledger shows why you keep needing it, which is the more useful fix." },
    ],
    related: ["monthly-surplus-calculator", "household-bills-tracker-template", "find-and-cancel-unused-subscriptions", "app"],
  },
  {
    slug: "debt-snowball-vs-avalanche-calculator",
    published: "2026-09-08",
    card: "Snowball vs avalanche",
    cardD: "Which payoff order saves more",
    crumb: "Snowball vs avalanche",
    title: "Debt snowball vs avalanche calculator (UK)",
    description:
      "Free snowball vs avalanche calculator. Enter up to three debts with balance, APR and minimum payment, plus your extra payment, and compare the months and interest.",
    h1: "Debt snowball vs avalanche calculator",
    tldr:
      "Avalanche pays the highest APR first and costs the least in interest. Snowball pays the smallest balance first and gives quicker wins. Enter your debts and your extra monthly payment to see the months and the interest for both, side by side. Then pick the one you will stick to.",
    fields: [
      { id: "b1", label: "Debt 1 balance", prefix: "£", value: 2500 },
      { id: "r1", label: "Debt 1 APR", suffix: "%", value: 22.9 },
      { id: "p1", label: "Debt 1 minimum payment", prefix: "£", value: 75 },
      { id: "b2", label: "Debt 2 balance", prefix: "£", value: 1200 },
      { id: "r2", label: "Debt 2 APR", suffix: "%", value: 0 },
      { id: "p2", label: "Debt 2 minimum payment", prefix: "£", value: 30 },
      { id: "b3", label: "Debt 3 balance", prefix: "£", value: 6000 },
      { id: "r3", label: "Debt 3 APR", suffix: "%", value: 8.9 },
      { id: "p3", label: "Debt 3 minimum payment", prefix: "£", value: 150 },
      { id: "extra", label: "Extra you can pay each month", prefix: "£", value: 100 },
    ],
    compute: String.raw`
    var debts=[];
    [['b1','r1','p1'],['b2','r2','p2'],['b3','r3','p3']].forEach(function(k){var b=n(k[0]);if(b>0)debts.push({b:b,r:n(k[1]),p:n(k[2])});});
    var extra=n('extra');
    if(!debts.length){out.innerHTML='<p class="calc-hint">Enter at least one debt with a balance and a minimum payment.</p>';return;}
    function sim(sortFn){
      var ds=debts.map(function(d){return {b:d.b,r:d.r,p:d.p};}).sort(sortFn);
      var months=0,interest=0;
      while(ds.some(function(d){return d.b>0.005;})){
        months++;if(months>600)return null;
        var pool=extra;
        ds.forEach(function(d){
          if(d.b<=0.005){pool+=d.p;return;}
          var i=d.b*d.r/100/12;d.b+=i;interest+=i;
          var pay=Math.min(d.p,d.b);d.b-=pay;
        });
        for(var j=0;j<ds.length&&pool>0;j++){if(ds[j].b>0.005){var pay2=Math.min(pool,ds[j].b);ds[j].b-=pay2;pool-=pay2;}}
      }
      return {months:months,interest:interest};
    }
    var snow=sim(function(a,b){return a.b-b.b;}),aval=sim(function(a,b){return b.r-a.r;});
    if(!snow||!aval){out.innerHTML='<p class="calc-bad">At these payments the balances never clear: interest is outrunning the minimum on at least one debt. Raise the payments, or the extra, and try again.</p>';return;}
    function fmtM(m){var y=Math.floor(m/12),mm=m%12;var s=(y?y+(y===1?' year':' years'):'')+(y&&mm?' ':'')+(mm?mm+(mm===1?' month':' months'):'');return s||'0 months';}
    var saved=snow.interest-aval.interest,diff=snow.months-aval.months;
    var html='<div class="calc-headline">'+fmtM(aval.months)+' <small>to debt-free (avalanche)</small></div>';
    html+='<p><strong>Avalanche</strong> (highest APR first): clear in '+fmtM(aval.months)+', about '+gbp(aval.interest)+' in interest.</p>';
    html+='<p><strong>Snowball</strong> (smallest balance first): clear in '+fmtM(snow.months)+', about '+gbp(snow.interest)+' in interest.</p>';
    if(Math.abs(saved)<1)html+='<p class="calc-good">Both orders cost about the same here. Take the snowball for the quick wins.</p>';
    else if(saved>0)html+='<p class="calc-good">Avalanche saves about '+gbp(saved)+' in interest'+(diff>0?' and finishes '+diff+(diff===1?' month':' months')+' sooner':'')+'. If you need the early win to stay motivated, the snowball costs '+gbp(saved)+' for it.</p>';
    else html+='<p class="calc-good">Snowball saves about '+gbp(-saved)+' here, which happens when the smallest debt is also the priciest.</p>';
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "How the two methods work",
        ul: [
          "Both pay the minimum on every debt each month and put the extra on one target debt.",
          "Avalanche targets the highest APR. Mathematically the cheapest.",
          "Snowball targets the smallest balance. The first debt disappears fastest, and its minimum payment rolls into the next target.",
          "Either way, when a debt clears, its payment joins the extra. That rolling payment is what makes the last debts go quickly.",
        ],
      },
      {
        h: "Which should you choose?",
        p: [
          "If the calculator shows a small difference, pick the snowball; the early win is worth more than a few pounds. If avalanche saves hundreds, that is real money, and the right answer is to run avalanche and find your motivation elsewhere. Either method beats paying minimums everywhere, which is the expensive default.",
        ],
      },
      {
        h: "Two things that beat both",
        ul: [
          "A 0% balance transfer for the high-APR card, if you can get one. Then the 0% payoff calculator tells you what to pay to clear it before the deal ends.",
          "Finding the extra payment in the first place. Import your bank CSV into The Income Tracker; the subscriptions and the eating-out total usually hold it.",
        ],
      },
    ],
    faqs: [
      { q: "What is the difference between debt snowball and debt avalanche?", a: "Snowball pays off the smallest balance first for quick wins; avalanche pays the highest interest rate first to minimise the interest you pay. Both pay minimums on everything else." },
      { q: "Which method saves more money?", a: "Avalanche, almost always, because the expensive debt shrinks first. The calculator shows how much for your numbers." },
      { q: "Which method is better for motivation?", a: "Snowball. Clearing a whole debt in the first few months keeps people going. If the interest difference is small, choose it." },
      { q: "Does the calculator handle a 0% card?", a: "Yes. Enter 0 as the APR. Avalanche will leave it until last, which is correct as long as you clear it before the promotional rate ends." },
    ],
    related: ["0-percent-credit-card-payoff-calculator-uk", "loan-repayment-and-savings-goal-planner", "credit-card-utilisation-calculator-uk", "how-much-should-i-save-each-month-uk"],
  },
  {
    slug: "subscription-cost-calculator",
    published: "2026-09-08",
    card: "Subscription cost",
    cardD: "What your subscriptions cost over five years",
    crumb: "Subscription cost",
    title: "Subscription cost calculator (yearly and five-year cost)",
    description:
      "Free subscription cost calculator: enter your monthly subscriptions and see the yearly and five-year total, plus what cancelling a few is worth if you save it instead.",
    h1: "Subscription cost calculator",
    tldr:
      "Small monthly amounts hide big yearly ones. Enter your monthly subscription total to see the annual and five-year cost. Add the amount you could cancel and the calculator shows what that becomes if you save it at a typical interest rate.",
    fields: [
      { id: "monthly", label: "Subscriptions per month", prefix: "£", value: 62 },
      { id: "cancel", label: "Could cancel per month", prefix: "£", value: 25 },
      { id: "rate", label: "Savings rate if saved instead", suffix: "%", value: 4 },
    ],
    compute: String.raw`
    var m=n('monthly'),c=n('cancel'),r=n('rate');
    if(m<=0){out.innerHTML='<p class="calc-hint">Enter what you spend on subscriptions each month.</p>';return;}
    var html='<div class="calc-headline">'+gbp(m*12)+' <small>a year</small></div>';
    html+='<p>'+gbp(m)+' a month is <strong>'+gbp(m*12)+'</strong> a year and <strong>'+gbp(m*60)+'</strong> over five years.</p>';
    if(c>0){
      var mr=r/100/12,fv5=mr>0?c*((Math.pow(1+mr,60)-1)/mr):c*60;
      html+='<p class="calc-good">Cancel '+gbp(c)+' a month and you keep '+gbp(c*12)+' a year. Saved at '+r+'%, that is about <strong>'+gbp(fv5)+'</strong> after five years.</p>';
    }
    out.innerHTML=html;
  `,
    sections: [
      {
        h: "Find the real monthly figure",
        p: [
          "Most people undercount. Card subscriptions never show in the bank's Direct Debit list, app store subscriptions arrive as one unhelpful line, and annual renewals get forgotten. Import three months of transactions into The Income Tracker and the recurring view lists every repeating payment, with the amounts. That is the number to type in above.",
        ],
      },
      {
        h: "The cancel list",
        ul: [
          "Two services doing the same job (two video streamers, two cloud drives).",
          "Anything you have not opened in a month.",
          "Free trials that converted. Check the last three months for a first charge.",
          "Premium tiers you do not use the premium part of.",
        ],
        p: [
          "Then cancel properly: with the company first, and with your bank or card issuer if it is a card payment they will not stop. The subscriptions guide covers each type.",
        ],
      },
    ],
    faqs: [
      { q: "How much does the average person spend on subscriptions?", a: "Estimates vary and most people undercount their own. The reliable figure is yours: import three months of bank transactions and read the recurring total." },
      { q: "How do I cancel a subscription paid by card?", a: "Tell the company. If they will not stop it, tell your bank or card issuer to cancel the continuous payment authority; they must do so when asked." },
      { q: "Is this calculator free?", a: "Yes, and nothing you enter leaves your browser." },
    ],
    related: ["find-and-cancel-unused-subscriptions", "household-bills-tracker-template", "monthly-surplus-calculator", "emergency-fund-calculator-uk"],
  },
];
