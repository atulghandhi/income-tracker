// What each calculator needs on top of its content: a one-line hint and an example for every
// field (shown as a greyed placeholder, so the form starts empty), which fields may be left blank,
// and, where the tracker has the same tool, how to carry the figures into it.
//
// field options:
//   hint      one plain-English line under the label: what goes here and where to find it
//   example   the greyed "e.g." placeholder (defaults to the content file's old demo value)
//   optional  blank counts as 0 and does not hold back the answer
//   keep      a real default rather than demo data (selects always keep theirs)
//
// app:
//   view      the app page the figures land on
//   label     the save button
//   handoff   browser JS (no backticks, no ${) returning { debts?, goals?, extra?, priority?,
//             grossSalary? } from the inputs via n(id), or null when there is nothing to save.
//             src/calcHandoff.ts validates and applies it.

export const CALC_APP = {
  "debt-snowball-vs-avalanche-calculator": {
    lede: "List your debts, add what you can spare each month, and see which payoff order clears them faster and cheaper.",
    app: { view: "allocate", label: "Save these debts to my plan", emptyLabel: "Open the debt planner" },
  },
  "0-percent-credit-card-payoff-calculator-uk": {
    fields: {
      bal: { hint: "What you still owe on the card.", example: 2000 },
      months: { hint: "Until the 0% deal ends. It is on your statement or in your card's app.", example: 18 },
      apr: { hint: "The rate once the deal ends, also on your statement.", optional: true, example: 24.9 },
    },
    app: {
      view: "allocate",
      label: "Add this card to my debt plan",
      emptyLabel: "Open the debt planner",
      handoff: "var b=n('bal'),m=n('months');if(b<=0)return null;return {debts:[{name:'0% credit card',type:'credit-card',balance:b,apr:n('apr'),promoRate:0,promoMonths:m,minPayment:m>0?Math.ceil(b/m):0}]};",
    },
  },
  "credit-card-utilisation-calculator-uk": {
    fields: {
      bal: { hint: "Add up what you owe across all your cards.", example: 1500 },
      limit: { hint: "Add up the credit limits across all your cards.", example: 5000 },
    },
    app: {
      view: "accounts",
      label: "Track my cards in the app",
      emptyLabel: "Open my accounts",
      handoff: "var b=n('bal'),l=n('limit');if(b<=0&&l<=0)return null;return {debts:[{name:'Credit cards',type:'credit-card',balance:b,creditLimit:l}]};",
    },
  },
  "how-long-to-save-10000-for-a-car": {
    fields: {
      target: { hint: "How much you want to end up with.", example: 10000 },
      saved: { hint: "Leave blank if you are starting from zero.", optional: true, example: 500 },
      monthly: { hint: "What you can put aside each month.", example: 300 },
      rate: { hint: "Your savings account's interest rate, if it pays any.", optional: true, example: 4 },
    },
    app: {
      view: "goals",
      label: "Save this goal in the app",
      emptyLabel: "Open my goals",
      handoff: "var t=n('target');if(t<=0)return null;return {goals:[{name:'New car',target:t,saved:n('saved'),monthly:n('monthly'),rate:n('rate')}]};",
    },
  },
  "emergency-fund-calculator-uk": {
    fields: {
      essentials: { hint: "Rent, bills, food and transport: what you could not skip.", example: 1500 },
      months: { hint: "Three is the usual start. Six if your income is irregular.", keep: true },
      saved: { hint: "Leave blank if you are starting from zero.", optional: true, example: 400 },
      monthly: { hint: "What you can put aside each month.", optional: true, example: 150 },
    },
    app: {
      view: "goals",
      label: "Save this goal in the app",
      emptyLabel: "Open my goals",
      handoff: "var e=n('essentials'),m=n('months');if(e<=0||m<=0)return null;return {goals:[{name:'Emergency fund',target:e*m,saved:n('saved'),monthly:n('monthly')}]};",
    },
  },
  "christmas-budget-savings-calculator": {
    fields: {
      gifts: { hint: "Presents for everyone on your list.", example: 300 },
      food: { hint: "On top of your normal weekly shop.", optional: true, example: 150 },
      travel: { hint: "Trains, fuel or taxis to see family.", optional: true, example: 100 },
      extras: { optional: true, example: 50 },
      saved: { hint: "Leave blank if nothing yet.", optional: true, example: 150 },
      paydays: { hint: "How many more paydays before you need the money.", example: 3 },
    },
    app: {
      view: "goals",
      label: "Save this goal in the app",
      emptyLabel: "Open my goals",
      handoff: "var t=n('gifts')+n('food')+n('travel')+n('extras'),p=n('paydays'),s=n('saved');if(t<=0)return null;return {goals:[{name:'Christmas',target:t,saved:s,monthly:p>0?Math.ceil(Math.max(0,t-s)/p):0,deadlineMonths:p}]};",
    },
  },
  "loan-repayment-and-savings-goal-planner": {
    fields: {
      balance: { hint: "What you still owe. It is on your loan statement.", example: 5000 },
      apr: { hint: "The loan's interest rate, also on the statement.", example: 12.9 },
      payment: { hint: "What leaves your account for it each month.", example: 200 },
      goal: { hint: "Once the loan is paid off, keep paying yourself instead. Leave blank to skip.", optional: true, example: 5000 },
    },
    app: {
      view: "allocate",
      label: "Add this loan to my debt plan",
      emptyLabel: "Open the debt planner",
      handoff: "var b=n('balance'),g=n('goal');if(b<=0&&g<=0)return null;var o={debts:[{name:'Loan',type:'loan',balance:b,apr:n('apr'),minPayment:n('payment')}]};if(g>0)o.goals=[{name:'After the loan',target:g}];return o;",
    },
  },
  "pro-rata-salary-calculator-uk": {
    fields: {
      salary: { hint: "The full-time salary on the job advert.", example: 30000 },
      fthours: { hint: "Usually 35 to 40. Ask the employer if unsure.", example: 37.5 },
      hours: { hint: "The hours you would actually work each week.", example: 22.5 },
    },
    app: {
      view: "pay",
      label: "See my take-home pay",
      emptyLabel: "Open the pay calculator",
      handoff: "var s=n('salary'),f=n('fthours'),h=n('hours');if(s<=0||f<=0||h<=0)return null;return {grossSalary:Math.round(s*h/f)};",
    },
  },
  "weekly-to-monthly-budget-calculator": {
    fields: {
      amount: { hint: "One payment: your weekly wage, a fortnightly bill, and so on.", example: 100 },
      frequency: { hint: "How often that amount is paid." },
    },
  },
  "split-bills-by-income-calculator": {
    fields: {
      income1: { hint: "After tax: what lands in their account each month.", example: 3000 },
      income2: { hint: "The same for the second person.", example: 2000 },
      bills: { hint: "Rent, energy, council tax and anything else you share.", example: 1500 },
    },
  },
  "budget-planner-uk": {
    fields: {
      income: { hint: "After tax: what actually lands in your account each month.", example: 2400 },
      housing: { optional: true, example: 900 },
      bills: { optional: true, example: 350 },
      food: { optional: true, example: 320 },
      transport: { hint: "Fuel, insurance, train or bus fares.", optional: true, example: 150 },
      debt: { hint: "Cards, loans, car finance.", optional: true, example: 100 },
      subs: { hint: "Streaming, gym, apps.", optional: true, example: 40 },
      other: { optional: true, example: 300 },
    },
  },
  "rent-affordability-calculator-uk": {
    fields: {
      takehome: { hint: "After tax, all tenants together.", example: 2200 },
      gross: { hint: "Before tax, per year, all tenants together. Letting agents check this one.", example: 32000 },
      rent: { hint: "The monthly rent of the place you are looking at.", example: 950 },
    },
  },
  "overdraft-cost-calculator-uk": {
    fields: {
      amount: { hint: "How far below zero your account is.", example: 500 },
      days: { hint: "How many days this month you will stay overdrawn.", example: 14 },
      ear: { hint: "In your banking app or on your statement. Most UK banks charge around 40%.", example: 39.9 },
    },
  },
  "monthly-surplus-calculator": {
    fields: {
      income: { hint: "Take-home pay plus any other money coming in.", example: 2500 },
      expenses: { hint: "Everything going out: bills, food, transport, fun.", example: 1900 },
    },
  },
  "50-30-20-budget-calculator-uk": {
    fields: {
      income: { hint: "After tax: what lands in your account each month.", example: 2500 },
      needs: { hint: "Rent, bills, groceries, minimum debt payments. Optional, to compare.", optional: true, example: 1400 },
      wants: { hint: "Eating out, shopping, holidays. Optional, to compare.", optional: true, example: 600 },
    },
  },
  "spend-per-day-until-payday-calculator": {
    fields: {
      balance: { hint: "What your banking app says right now.", example: 420 },
      days: { hint: "Count from tomorrow up to payday.", example: 12 },
      bills: { hint: "Direct debits still to leave before payday.", optional: true, example: 60 },
    },
  },
  "subscription-cost-calculator": {
    fields: {
      monthly: { hint: "Streaming, music, gym, apps, cloud storage: the total per month.", example: 62 },
      cancel: { hint: "The ones you barely use. Optional.", optional: true, example: 25 },
      rate: { hint: "What a savings account would pay you. Optional.", optional: true, example: 4 },
    },
  },
};
