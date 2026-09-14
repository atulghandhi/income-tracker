// Distinct budgeting tasks, with worked examples available without JavaScript.
export const BUDGET_TOOLS = [
  {
    slug: 'weekly-to-monthly-budget-calculator', published: '2026-09-14', updated: '2026-09-14',
    card: 'Weekly to monthly converter', cardD: 'Convert weekly, fortnightly and four-weekly amounts', crumb: 'Weekly to monthly',
    title: 'Weekly to Monthly Budget Calculator | Free Converter',
    description: 'Convert weekly, fortnightly, four-weekly or annual pay and bills to a monthly budget. See the formula, yearly total and why multiplying by four falls short.',
    h1: 'Weekly to monthly budget calculator',
    tldr: 'Weekly amount × 52 ÷ 12 gives the monthly average. For example, £100 a week is £433.33 a month. Choose the payment frequency below to convert income, rent or another regular bill.',
    fields: [
      { id: 'amount', label: 'Amount per payment', prefix: '£', value: 100 },
      { id: 'frequency', label: 'Payment frequency', value: 52, options: [{ value: 52, label: 'Weekly' }, { value: 26, label: 'Fortnightly (every 2 weeks)' }, { value: 13, label: 'Every 4 weeks' }, { value: 12, label: 'Monthly' }, { value: 1, label: 'Yearly' }] },
    ],
    compute: `
    var amount=n('amount'), frequency=n('frequency');
    if([52,26,13,12,1].indexOf(frequency)<0)return;
    var annual=amount*frequency, monthly=annual/12;
    out.innerHTML='<div class="calc-headline">'+gbp(monthly)+' <small>monthly average</small></div><p>'+gbp(annual)+' a year · '+gbp(annual/52)+' a week · '+gbp(annual/26)+' a fortnight.</p><p>Formula: '+gbp(amount)+' × '+frequency+' payments ÷ 12 months.</p><p class="calc-hint">This is an annual budgeting average, not the cash you receive in every calendar month. Check your actual payment dates.</p>';
    `,
    sections: [
      { h: 'Conversion formulas', table: { head: ['Payment frequency', 'Monthly equivalent'], rows: [['Weekly', 'Amount × 52 ÷ 12'], ['Fortnightly', 'Amount × 26 ÷ 12'], ['Every four weeks', 'Amount × 13 ÷ 12'], ['Yearly', 'Amount ÷ 12']] } },
      { h: 'Why multiplying by four underestimates a monthly budget', p: ['Twelve four-week periods cover 48 weeks. A 52-week budgeting year has four more weeks to account for. At £100 per week, multiplying by four gives £400 a month, while the annual average is £433.33. The shortcut misses £400 over a year.'] },
      { h: 'Four-weekly pay is different from monthly pay', p: ['£2,000 every four weeks is £26,000 over 13 payments, or £2,166.67 per calendar month on average. It does not mean £2,166.67 arrives each month. Keep enough money for bills between actual paydays, and plan the extra pay packet when it arrives. This converter uses 52 weekly, 26 fortnightly or 13 four-weekly payments; some payroll years contain an extra payment.'] },
      { h: 'Use the same basis for income and spending', p: ['For a household budget, enter take-home pay after deductions. For a rent or subscription comparison, enter the amount actually charged. The converter does not calculate tax, interest, or salary deductions.'] },
    ],
    faqs: [
      { q: 'How much is £500 a week per month?', a: '£500 × 52 ÷ 12 = £2,166.67 per month on average, or £26,000 over 52 weeks. This is before or after tax according to the amount you enter.' },
      { q: 'Is four-weekly the same as monthly?', a: 'No. Four-weekly payments occur 13 times in 52 weeks; monthly payments occur 12 times in a year.' },
      { q: 'Can I convert monthly spending into a weekly budget?', a: 'Yes. Select Monthly and enter your monthly amount. The weekly result is that amount × 12 ÷ 52.' },
    ],
    ctaLine: 'Turn the monthly average into a budget using your actual transactions.',
    related: ['budget-on-a-variable-income-uk', 'monthly-surplus-calculator', 'split-bills-by-income-calculator', 'monthly-budget-planner-template'],
  },
  {
    slug: 'split-bills-by-income-calculator', published: '2026-09-14', updated: '2026-09-14', checked: '2026-09-14',
    card: 'Split bills by income', cardD: 'Compare proportional contributions with a 50/50 split', crumb: 'Split bills by income',
    title: 'Split Bills by Income Calculator | Couples & Rent',
    description: 'Work out each partner’s share of rent and household bills using take-home income. Compare an income-based split with 50/50 and see what each has left.',
    h1: 'Split bills by income calculator',
    tldr: 'An income-based split gives each person the same percentage of shared bills as their share of combined take-home pay. Enter both monthly incomes and the shared bill total to compare this with splitting equally.',
    fields: [{ id: 'income1', label: 'Person 1 monthly take-home pay', prefix: '£', value: 3000 }, { id: 'income2', label: 'Person 2 monthly take-home pay', prefix: '£', value: 2000 }, { id: 'bills', label: 'Shared monthly bills', prefix: '£', value: 1500 }],
    compute: `
    var a=n('income1'),b=n('income2'),bills=n('bills'),total=a+b;
    if(total<=0){out.innerHTML='<p class="calc-hint">Enter a positive income for at least one person.</p>';return;}
    var cents=Math.round(bills*100),one=Math.round(cents*a/total)/100,two=(cents-Math.round(cents*a/total))/100;
    var half1=Math.ceil(cents/2)/100,half2=Math.floor(cents/2)/100;
    out.innerHTML='<div class="calc-headline">'+pct(a/total*100)+' / '+pct(b/total*100)+' <small>income-based split</small></div><div class="tablewrap"><table><thead><tr><th scope="col">Monthly amount</th><th scope="col">Person 1</th><th scope="col">Person 2</th></tr></thead><tbody><tr><th scope="row">Income-based contribution</th><td>'+gbp(one)+'</td><td>'+gbp(two)+'</td></tr><tr><th scope="row">Left after shared bills</th><td>'+gbp(a-one)+'</td><td>'+gbp(b-two)+'</td></tr><tr><th scope="row">Equal split</th><td>'+gbp(half1)+'</td><td>'+gbp(half2)+'</td></tr></tbody></table></div><p>Contributions are rounded to pennies and add up to the shared total. Personal bills and debts are not included.</p>'+(bills>total?'<p class="calc-warn">Shared bills exceed your combined take-home income. Changing the split does not close that gap.</p>':'');
    `,
    sections: [
      { h: 'Worked example: £3,000 and £2,000 take-home pay', p: ['Combined income is £5,000. Person 1 earns 60% and person 2 earns 40%. With £1,500 of shared bills, the contributions are £900 and £600. Both contribute 30% of their own income. With an equal split, each contributes £750.'] },
      { h: 'Which bills should be shared?', ul: ['Include the rent or mortgage payment, utilities and groceries you have agreed to share.', 'Keep individual subscriptions, personal debts and individual spending separate unless you agree otherwise.', 'Use monthly take-home income for both people. Convert weekly or four-weekly pay to the same basis first.'] },
      { h: 'Is an income-based split always fair?', p: ['It is one option to discuss, rather than a rule. Childcare, unpaid caring, variable earnings and personal commitments can change what feels workable. The calculator compares two methods; it does not decide your arrangement. Review the numbers when income or responsibilities change.'], html: '<p><a href="/guides/budgeting-for-couples-separate-accounts-uk.html">Read the guide to budgeting together with separate accounts</a>.</p>' },
    ],
    faqs: [
      { q: 'How do you split rent based on income?', a: 'Divide each person’s take-home income by the combined take-home income, then multiply by the rent. The same formula works for an agreed total of shared bills.' },
      { q: 'Should we use gross or net income?', a: 'Use net, or take-home, income after deductions for this household-budget comparison. Use the same time period for both people.' },
      { q: 'What if one partner has no income?', a: 'The formula assigns the full shared bill to the person with income. That is only the mathematical result; agree an arrangement that accounts for care, savings and other circumstances.' },
    ],
    sources: [{ t: 'MoneyHelper: how to split rent and bills fairly', href: 'https://www.moneyhelper.org.uk/en/blog/utilities/how-to-split-rent-and-bills-fairly' }],
    related: ['budgeting-for-couples-separate-accounts-uk', 'household-bills-tracker-template', 'weekly-to-monthly-budget-calculator', 'monthly-surplus-calculator'],
  },
  {
    slug: 'christmas-budget-savings-calculator', published: '2026-09-14', updated: '2026-09-14', checked: '2026-09-14',
    card: 'Christmas budget & savings', cardD: 'Add festive costs and work out savings per payday', crumb: 'Christmas budget planner',
    title: 'Christmas Budget & Savings Calculator | Free Planner',
    description: 'Plan Christmas gifts, food, travel and extras. Subtract what you have saved and work out how much to save each payday before you need to spend it.',
    h1: 'Christmas budget and savings calculator',
    tldr: 'Add your planned Christmas costs, subtract money already saved, then divide the gap by your remaining paydays. Count only paydays before you need to buy things, which may be earlier than 25 December.',
    fields: [{ id: 'gifts', label: 'Gifts', prefix: '£', value: 300 }, { id: 'food', label: 'Extra food and drink', prefix: '£', value: 150 }, { id: 'travel', label: 'Travel', prefix: '£', value: 100 }, { id: 'extras', label: 'Decorations, postage and other extras', prefix: '£', value: 50 }, { id: 'saved', label: 'Already saved for these costs', prefix: '£', value: 150 }, { id: 'paydays', label: 'Paydays before your spending deadline', value: 3, min: 1, step: 1 }],
    compute: `
    var total=n('gifts')+n('food')+n('travel')+n('extras'),saved=n('saved'),paydays=n('paydays'),gap=Math.max(0,total-saved);
    if(paydays<1||Math.floor(paydays)!==paydays){out.innerHTML='<p class="calc-hint">Enter a whole number of paydays, at least one.</p>';return;}
    var payment=Math.ceil(Math.round(gap*100)/paydays)/100;
    out.innerHTML='<div class="calc-headline">'+gbp(payment)+' <small>to save each payday</small></div><p>Planned costs: <strong>'+gbp(total)+'</strong>. Already saved: '+gbp(saved)+'. Still to save: <strong>'+gbp(gap)+'</strong>.</p>'+(gap===0?'<p class="calc-good">Your saved amount covers this plan.</p>':'<p>Set aside '+gbp(payment)+' on each of your '+paydays+' remaining paydays. Rounded up to the next penny; the final payment may be slightly smaller.</p>')+'<p class="calc-hint">No interest or investment growth is assumed. Check that this fits after essential bills.</p>';
    `,
    sections: [
      { h: 'Example: a £600 Christmas with £150 already saved', p: ['The remaining gap is £450. With three paydays before shopping starts, put aside £150 each payday. With nine weekly paydays, the same gap needs £50 per payday. Enter your own count, whether you are paid weekly, fortnightly or monthly.'] },
      { h: 'Include the costs that are easy to miss', ul: ['Set a total gift allowance, including small gifts and work exchanges.', 'Include extra food and drink rather than the groceries already in your normal budget.', 'Add train fares, fuel, postage, wrapping and decorations if you expect to buy them.', 'Count money already saved only once; do not count money reserved for rent or other bills.'] },
      { h: 'Choose a shopping deadline, not just Christmas Day', p: ['If you need to book travel or buy gifts in November, December pay will arrive too late for those purchases. Count the actual paydays before your first large purchase. If the result is too high, reduce the planned costs and compare again.'] },
      { h: 'Keep the plan separate from your monthly essentials', p: ['This is a savings plan, not a credit or loan recommendation. It uses your chosen costs and payment count, without predicting interest. You can create a goal in the tracker and log the money you put aside.'] },
    ],
    faqs: [
      { q: 'How much should I save each month for Christmas?', a: 'Subtract existing Christmas savings from your planned costs and divide by the monthly paydays before you need the money. A £600 plan with £150 saved and three paydays left needs £150 per payday.' },
      { q: 'Can I use this if I am paid weekly?', a: 'Yes. Enter the number of weekly paydays before your shopping deadline. The result is the amount to save each week.' },
      { q: 'Does the calculator use a fixed Christmas year?', a: 'No. It uses the paydays you enter, so the same page works each year without assuming a pay date.' },
    ],
    sources: [{ t: 'MoneyHelper: saving money for Christmas', href: 'https://www.moneyhelper.org.uk/en/savings/types-of-savings/saving-money-for-christmas' }],
    related: ['monthly-surplus-calculator', 'weekly-to-monthly-budget-calculator', 'subscription-cost-calculator', 'monthly-budget-planner-template'],
  },
];
