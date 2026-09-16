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
  // Added 16 September 2026.
  {
    slug: 'budget-planner-uk', published: '2026-09-16', updated: '2026-09-16', checked: '2026-09-16',
    card: 'Budget planner (UK)', cardD: 'Income, seven spending groups, surplus and savings rate', crumb: 'Budget planner',
    title: 'Budget Planner UK | Free Monthly Budget Calculator',
    description: 'A free UK monthly budget planner. Enter take-home pay and seven spending groups to see your surplus, savings rate, essentials share and how you compare with the 50/30/20 guideline. No sign-up.',
    h1: 'Budget planner (UK)',
    tldr: 'Enter your monthly take-home pay and what you spend on housing, bills, food, transport, debt, subscriptions and everything else. The planner shows what is left, your savings rate, and how your essentials compare with the 50/30/20 guideline. It works in your browser and stores nothing.',
    fields: [
      { id: 'income', label: 'Monthly take-home income', prefix: '£', value: 2400 },
      { id: 'housing', label: 'Rent or mortgage', prefix: '£', value: 900 },
      { id: 'bills', label: 'Council tax, energy, water, broadband, phone, insurance', prefix: '£', value: 350 },
      { id: 'food', label: 'Groceries', prefix: '£', value: 320 },
      { id: 'transport', label: 'Transport', prefix: '£', value: 150 },
      { id: 'debt', label: 'Debt repayments', prefix: '£', value: 100 },
      { id: 'subs', label: 'Subscriptions', prefix: '£', value: 40 },
      { id: 'other', label: 'Everything else (eating out, shopping, fun)', prefix: '£', value: 300 },
    ],
    compute: `
    var income=n('income'),housing=n('housing'),bills=n('bills'),food=n('food'),transport=n('transport'),debt=n('debt'),subs=n('subs'),other=n('other');
    if(income<=0){out.innerHTML='<p class="calc-hint">Enter your monthly take-home income to start.</p>';return;}
    var essentials=housing+bills+food+transport+debt,flexible=subs+other,spend=essentials+flexible,surplus=income-spend;
    var rate=surplus/income*100,essPct=essentials/income*100,flexPct=flexible/income*100,housePct=housing/income*100;
    var cls=surplus>0?'calc-good':(surplus<0?'calc-bad':'calc-warn');
    var html='<div class="calc-headline '+cls+'">'+(surplus<0?'-':'')+gbp(Math.abs(surplus))+' <small>'+(surplus<0?'short each month':'left each month')+'</small></div>';
    html+='<p>Income '+gbp(income)+' minus spending '+gbp(spend)+'. '+(surplus>=0?'Savings rate <strong>'+pct(rate)+'</strong>.':'Spending exceeds income by <strong>'+pct(-rate)+'</strong>.')+'</p>';
    html+='<p>Essentials '+gbp(essentials)+' ('+pct(essPct)+' of income). Flexible spending '+gbp(flexible)+' ('+pct(flexPct)+'). Housing alone is '+pct(housePct)+'.</p>';
    var note='';
    if(essPct>50)note='Essentials are above the 50% guideline. Housing and bills are the lines to negotiate, switch or, over time, change.';
    else if(rate<20&&surplus>=0)note='Under the 50/30/20 guideline the target for savings and extra debt payments is 20%. Flexible spending is the quickest place to find the difference.';
    else if(surplus>=0)note='This meets the 50/30/20 guideline. Move the surplus on payday so it does not get spent.';
    if(surplus<0)note='Pay priority bills first (rent, council tax, energy), then cut flexible spending. If it still does not balance, free advice from StepChange or Citizens Advice is the next step.';
    if(note)html+='<p class="calc-hint">'+note+'</p>';
    out.innerHTML=html;
    `,
    sections: [
      { h: 'How to fill it in', ul: ['Income: take-home pay after tax, National Insurance, pension and student loan, plus benefits. Weekly amounts times 52 divided by 12.', 'Housing and bills: the direct debits and standing orders on last month’s statement.', 'Groceries, transport, subscriptions and everything else: the card spending from the same statement, averaged over two or three months if it varies.', 'Debt: the payments you actually make, not the minimums you could make.'] },
      { h: 'Example: £2,400 take-home', p: ['Housing £900, bills £350, groceries £320, transport £150 and debt £100 make essentials of £1,820, or 76% of income. Subscriptions £40 and everything else £300 bring spending to £2,160, leaving £240, a 10% savings rate. Housing at 37.5% is the number to watch: it is the reason essentials are over the 50% guideline, and it is the hardest line to change quickly.'] },
      { h: 'What the guideline numbers mean', table: { head: ['Measure', 'Guideline', 'Why'], rows: [['Essentials share', '50% of take-home or less', 'Leaves room for choices and savings'], ['Housing share', 'Around 30 to 35% or less', 'Above that, one rent rise or rate change strains everything'], ['Savings rate', '20% is the 50/30/20 target', 'Start with any positive number; build to it']] } },
      { h: 'From a one-off plan to a monthly habit', p: ['This planner gives you a picture from numbers you typed. The Income Tracker gives you the same picture from your real bank transactions, every month, with the categories remembered. Import a CSV and the surplus, savings rate and category totals update on their own.'] },
    ],
    faqs: [
      { q: 'What is a good monthly budget in the UK?', a: 'One where essentials are around half of take-home pay or less, and something is saved every month. The exact figures depend on where you live; the shares matter more than the pounds.' },
      { q: 'How much should rent be as a percentage of income?', a: 'A common guideline is 30 to 35% of take-home pay. In London and the South East many people pay more, which is why the rest of the budget needs to be tighter.' },
      { q: 'Does this budget planner store my numbers?', a: 'No. Everything is calculated in your browser and nothing is sent anywhere. A shared link includes the amounts you entered, so only share it if you are happy with that.' },
      { q: 'Is there a downloadable version?', a: 'Yes. The free monthly budget planner template on this site is a CSV with the same groups, and it imports straight into The Income Tracker.' },
    ],
    ctaLine: 'Build the same picture from your real transactions, every month.',
    related: ['how-to-budget-for-beginners-uk', '50-30-20-budget-calculator-uk', 'monthly-budget-planner-template', 'monthly-surplus-calculator', 'rent-affordability-calculator-uk'],
  },
  {
    slug: 'rent-affordability-calculator-uk', published: '2026-09-16', updated: '2026-09-16', checked: '2026-09-16',
    card: 'Rent affordability (UK)', cardD: 'The 30% rule and the letting-agent income check, side by side', crumb: 'Rent affordability',
    title: 'Rent Affordability Calculator UK | How Much Rent Can I Afford?',
    description: 'How much rent can you afford in the UK? Compare the 30% of take-home guideline with the 30-times-rent income check letting agents use, and see the rent you have room for.',
    h1: 'Rent affordability calculator (UK)',
    tldr: 'Two tests. Budgeting guidance says rent should be around 30% of take-home pay or less. Letting agents and referencing companies usually ask for gross annual income of at least 30 times the monthly rent (sometimes 2.5 times the annual rent). Enter your take-home, your gross salary and a rent to see both, and the rent that passes each test.',
    fields: [
      { id: 'takehome', label: 'Monthly take-home pay (all tenants combined)', prefix: '£', value: 2200 },
      { id: 'gross', label: 'Gross annual income (all tenants combined)', prefix: '£', value: 32000 },
      { id: 'rent', label: 'Monthly rent you are considering', prefix: '£', value: 950 },
    ],
    compute: `
    var th=n('takehome'),gross=n('gross'),rent=n('rent');
    if(th<=0||gross<=0){out.innerHTML='<p class="calc-hint">Enter your take-home pay and gross annual income.</p>';return;}
    var share=rent/th*100,max30=th*0.30,maxRef=gross/30,multiple=rent>0?gross/rent:0;
    var passBudget=rent<=max30,passRef=gross>=rent*30;
    var cls=passBudget&&passRef?'calc-good':(passRef?'calc-warn':'calc-bad');
    var html='<div class="calc-headline '+cls+'">'+pct(share)+' <small>of take-home pay</small></div>';
    html+='<p>Budget guideline (30% of take-home): rent up to <strong>'+gbp(max30)+'</strong>. '+(passBudget?'This rent passes.':'This rent is '+gbp(rent-max30)+' over.')+'</p>';
    html+='<p>Referencing check (income at least 30 times rent): rent up to <strong>'+gbp(maxRef)+'</strong>. '+(rent>0?'Your income is '+(Math.round(multiple*10)/10)+' times this rent, so it '+(passRef?'passes.':'falls short; a guarantor or a larger deposit may be asked for.'):'')+'</p>';
    html+='<p>Left after rent: '+gbp(th-rent)+' a month for bills, food, transport and everything else.</p>';
    out.innerHTML=html;
    `,
    sections: [
      { h: 'The two tests, and why they differ', p: ['The 30% guideline is about living comfortably: if rent takes more than a third of what lands in your account, the rest of the budget is under strain. The referencing check is about risk to the landlord and is calculated on gross income, before tax. Many agents use 30 times the monthly rent; some use 2.5 times the annual rent, which is the same thing, and a few use a lower multiple for people with strong credit histories. Passing the agent’s test does not mean the rent is comfortable, which is why both are shown.'] },
      { h: 'Example: £32,000 gross, £2,200 take-home', p: ['A rent of £950 is 43% of take-home, well over the 30% guideline (£660). Gross income is 33.7 times the rent, so the referencing check passes. This is the common position in expensive cities: the tenancy is approved, and the budget is tight. Knowing that in advance lets you decide with your eyes open.'] },
      { h: 'If you fall short of the income check', ul: ['A guarantor: a UK homeowner or high earner who agrees to cover the rent. Agents usually want their income to be around 36 times the monthly rent.', 'Paying several months upfront, if you can and if the agent accepts it.', 'A joint tenancy, where combined income is used. Enter the combined figures above.', 'Savings or benefits can count with some agents; it is worth asking rather than assuming.'] },
      { h: 'Rent is only part of the housing cost', p: ['Council tax, energy, water and broadband add hundreds a month on top of rent. Once you have a shortlist, put the full figures into the budget planner to see what is really left.'] },
    ],
    faqs: [
      { q: 'How much rent can I afford on my salary?', a: 'As a budgeting guideline, up to about 30% of your monthly take-home pay. For a tenancy application, most agents want gross annual income of at least 30 times the monthly rent, so £30,000 supports rent of about £1,000 a month on that test.' },
      { q: 'What is the 30 times rent rule?', a: 'A referencing check: your gross annual income should be at least 30 times the monthly rent. It is the same as 2.5 times the annual rent. Some agents use slightly different multiples.' },
      { q: 'Do letting agents use take-home or gross income?', a: 'Gross income, before tax. The 30% comfort guideline uses take-home pay, which is why the two tests can give different answers.' },
      { q: 'What if I do not pass the income check?', a: 'A guarantor, rent paid in advance, a joint tenancy, or a cheaper property. Some agents also count savings or benefits.' },
    ],
    sources: [
      { t: 'Shelter England: what checks landlords and agents can make', href: 'https://england.shelter.org.uk/housing_advice/private_renting/checks_when_renting' },
      { t: 'Citizens Advice: referencing checks when renting', href: 'https://www.citizensadvice.org.uk/housing/renting-privately/before-you-rent/' },
      { t: 'MoneyHelper: how much can you afford to rent?', href: 'https://www.moneyhelper.org.uk/en/homes/renting/how-much-rent-can-you-afford' },
    ],
    ctaLine: 'Once you have a rent in mind, track the rest of the budget around it.',
    related: ['budget-planner-uk', 'split-bills-by-income-calculator', 'budgeting-for-couples-separate-accounts-uk', 'monthly-surplus-calculator'],
  },
  {
    slug: 'overdraft-cost-calculator-uk', published: '2026-09-16', updated: '2026-09-16', checked: '2026-09-16',
    card: 'Overdraft cost (UK)', cardD: 'What being overdrawn costs by the day, month and year', crumb: 'Overdraft cost',
    title: 'Overdraft Cost Calculator UK | Daily Interest at Your EAR',
    description: 'Work out what an arranged overdraft costs in the UK from the amount, the days you are overdrawn and your bank’s EAR. See the daily, monthly and yearly cost and compare it with a credit card rate.',
    h1: 'Overdraft cost calculator (UK)',
    tldr: 'UK banks charge overdrafts as a single interest rate, quoted as an EAR (equivalent annual rate), with no fixed fees since the 2020 rules. At a typical 39.9% EAR, £500 overdrawn for 14 days costs about £6.48; permanently overdrawn by £500 costs around £200 a year. Enter your own figures below.',
    fields: [
      { id: 'amount', label: 'Amount overdrawn', prefix: '£', value: 500 },
      { id: 'days', label: 'Days overdrawn this month', value: 14, min: 1, step: 1 },
      { id: 'ear', label: 'Your overdraft EAR', suffix: '%', value: 39.9 },
    ],
    compute: `
    var amount=n('amount'),days=n('days'),ear=n('ear');
    if(days<1||Math.floor(days)!==days){out.innerHTML='<p class="calc-hint">Enter a whole number of days, at least one.</p>';return;}
    if(amount<=0){out.innerHTML='<p class="calc-hint">Enter the amount you are overdrawn.</p>';return;}
    var r=ear/100,daily=Math.pow(1+r,1/365)-1;
    var cost=amount*(Math.pow(1+daily,days)-1),perDay=amount*daily,month=amount*(Math.pow(1+daily,30)-1),year=amount*r;
    var card=amount*(Math.pow(1+0.249,days/365)-1);
    var html='<div class="calc-headline">'+gbp(cost)+' <small>for '+days+(days===1?' day':' days')+'</small></div>';
    html+='<p>About '+gbp(perDay)+' a day at '+ear+'% EAR. Overdrawn by '+gbp(amount)+' for a full 30 days would cost '+gbp(month)+'; all year, about '+gbp(year)+'.</p>';
    html+='<p class="calc-hint">The same balance on a credit card at 24.9% APR for the same days would cost roughly '+gbp(card)+'. A 0% card or a cheaper overdraft elsewhere changes the picture entirely.</p>';
    out.innerHTML=html;
    `,
    sections: [
      { h: 'How the cost is worked out', p: ['EAR is the yearly rate including compounding. The daily rate is (1 + EAR) to the power of 1/365, minus 1. At 39.9% EAR that is about 0.092% a day. The cost for a period is the balance multiplied by (1 + daily rate) to the power of the days, minus the balance. Banks calculate on the actual end-of-day balance, so the figure here assumes a constant balance and is a close estimate rather than a bill.'] },
      { h: 'Example: £500 for 14 days at 39.9%', p: ['Daily rate 0.092%, so 14 days compounds to about 1.3%, or £6.48. Dip in for a few days each month and it is a coffee habit. Stay permanently overdrawn by £500 and it is around £200 a year, more than many people pay for their phone.'] },
      { h: 'Arranged, unarranged and the 2020 rules', p: ['Since April 2020 the FCA requires banks to charge a single interest rate for arranged overdrafts, quoted as an EAR, with no daily or monthly fees, and to price unarranged overdrafts no higher than arranged ones. Most high street banks settled around 35% to 40% EAR, with some interest-free buffers of £10 to £250. Check your own rate in the app or on your statement.'] },
      { h: 'Getting out of a persistent overdraft', ul: ['Find the cause: import your statement and see which categories push you under before payday. The spend-per-day calculator helps with the last week of the month.', 'Use any interest-free buffer your bank offers, and ask about a lower rate; some accounts offer one.', 'Move the balance to a 0% money transfer card if you qualify, then clear it before the promotional period ends.', 'Reduce the limit as you go so the overdraft stops being part of your normal income.'] },
    ],
    faqs: [
      { q: 'How much does an overdraft cost per day?', a: 'At 39.9% EAR, about 9p a day per £100 overdrawn. £500 costs roughly 46p a day, £1,000 about 92p a day.' },
      { q: 'What is EAR on an overdraft?', a: 'Equivalent annual rate: the yearly interest rate on borrowing, including compounding, with no fees. UK banks must quote overdrafts this way so rates can be compared.' },
      { q: 'Is an overdraft cheaper than a credit card?', a: 'Usually not. Typical overdraft EARs of 35% to 40% are above most standard credit card APRs, and far above a 0% deal. Overdrafts are convenient for a few days, expensive for months.' },
      { q: 'Are unarranged overdrafts more expensive?', a: 'Not by rate; since 2020 they cannot be charged at a higher rate than arranged ones. Payments may be refused instead, which can cost you elsewhere.' },
    ],
    sources: [
      { t: 'FCA: overdraft pricing rules (PS19/16)', href: 'https://www.fca.org.uk/publications/policy-statements/ps19-16-high-cost-credit-review-overdrafts-policy-statement' },
      { t: 'MoneyHelper: overdrafts explained', href: 'https://www.moneyhelper.org.uk/en/everyday-money/types-of-credit/overdrafts-explained' },
    ],
    ctaLine: 'See which week of the month pushes you into the red.',
    related: ['spend-per-day-until-payday-calculator', '0-percent-credit-card-payoff-calculator-uk', 'debt-snowball-vs-avalanche-calculator', 'monthly-surplus-calculator'],
  },
  {
    slug: 'pro-rata-salary-calculator-uk', published: '2026-09-16', updated: '2026-09-16', checked: '2026-09-16',
    card: 'Pro rata salary (UK)', cardD: 'Part-time pay, hourly rate and holiday from a full-time salary', crumb: 'Pro rata salary',
    title: 'Pro Rata Salary Calculator UK | Part-Time Pay & Holiday',
    description: 'Convert a full-time salary to a part-time pro rata salary in the UK. Enter the full-time hours and your hours to see the annual, monthly and weekly pay, the hourly rate and your statutory holiday.',
    h1: 'Pro rata salary calculator (UK)',
    tldr: 'Pro rata pay is the full-time salary multiplied by your hours divided by the full-time hours. A £30,000 job on 37.5 hours pays £18,000 for 22.5 hours a week, or £1,500 a month before tax. Statutory holiday is 5.6 weeks of your own working hours, so 22.5 hours a week gives 126 hours a year.',
    fields: [
      { id: 'salary', label: 'Full-time annual salary', prefix: '£', value: 30000 },
      { id: 'fthours', label: 'Full-time hours per week', value: 37.5 },
      { id: 'hours', label: 'Your hours per week', value: 22.5 },
    ],
    compute: `
    var salary=n('salary'),ft=n('fthours'),hrs=n('hours');
    if(salary<=0||ft<=0||hrs<=0){out.innerHTML='<p class="calc-hint">Enter the full-time salary, the full-time hours and your hours.</p>';return;}
    if(hrs>ft*1.5){out.innerHTML='<p class="calc-hint">Your hours are well above the full-time hours. Check the two figures.</p>';return;}
    var annual=salary*hrs/ft,monthly=annual/12,weekly=annual/52,hourly=salary/(ft*52),holidayHours=Math.min(hrs*5.6,ft*5.6),holidayWeeks=5.6;
    var html='<div class="calc-headline">'+gbp(annual)+' <small>a year, pro rata</small></div>';
    html+='<p>'+gbp(monthly)+' a month, '+gbp(weekly)+' a week, before tax. Hourly rate '+gbp(hourly)+'.</p>';
    html+='<p>Statutory holiday: '+holidayWeeks+' weeks of your hours, so about '+(Math.round(holidayHours*10)/10)+' hours a year'+(hrs===ft?' (the full-time entitlement)':'')+'. Employers may offer more; they cannot offer less.</p>';
    html+='<p class="calc-hint">Gross figures. Tax, National Insurance, pension and student loan come off this. Percentages shown by employers (for example 60% FTE) are the same calculation: '+pct(hrs/ft*100)+' of full time here.</p>';
    out.innerHTML=html;
    `,
    sections: [
      { h: 'The formula', p: ['Pro rata salary = full-time salary × (your weekly hours ÷ full-time weekly hours). The hourly rate is the full-time salary divided by (full-time hours × 52). Holiday is 5.6 weeks of your own hours, capped at 28 days’ worth for people who work more than five days a week.'] },
      { h: 'Example: £30,000 full time, 22.5 hours a week', p: ['22.5 ÷ 37.5 is 0.6, so the pro rata salary is £18,000: £1,500 a month or £346.15 a week before deductions. The hourly rate is £15.38. Holiday is 5.6 × 22.5, or 126 hours a year, which is 16.8 of your 7.5-hour days.'] },
      { h: 'Things that are not pro rata', ul: ['The Personal Allowance and tax bands are not reduced for part-time work, so part-time earnings are taxed relatively lightly.', 'Some benefits in kind, such as a fixed phone allowance, may be given in full. Check the contract.', 'Bank holidays: a part-timer working Monday to Wednesday gets a pro rata share of bank holidays, not just the ones that fall on their days. Employers must handle this fairly.'] },
      { h: 'Budgeting on part-time pay', p: ['The monthly figure above is before tax. Put the take-home amount from your payslip into the budget planner, or import your bank CSV into The Income Tracker to see where it goes.'] },
    ],
    faqs: [
      { q: 'How do I work out a pro rata salary?', a: 'Multiply the full-time salary by your hours and divide by the full-time hours. £30,000 × 22.5 ÷ 37.5 = £18,000.' },
      { q: 'What does 0.6 FTE mean?', a: 'Sixty percent of full-time hours and, normally, sixty percent of the full-time salary. On a 37.5-hour week that is 22.5 hours.' },
      { q: 'How much holiday do part-time workers get in the UK?', a: 'The same 5.6 weeks as full-time staff, in their own hours. Someone working 20 hours a week is entitled to 112 hours a year.' },
      { q: 'Is the pro rata salary before or after tax?', a: 'Before. Tax, National Insurance, pension and student loan repayments are deducted from it. The Personal Allowance is not reduced for part-time work.' },
    ],
    sources: [
      { t: 'GOV.UK: holiday entitlement', href: 'https://www.gov.uk/holiday-entitlement-rights' },
      { t: 'ACAS: checking holiday entitlement', href: 'https://www.acas.org.uk/checking-holiday-entitlement' },
    ],
    ctaLine: 'Track what actually lands each month against your bills.',
    related: ['weekly-to-monthly-budget-calculator', 'budget-planner-uk', 'monthly-surplus-calculator', 'budget-on-a-variable-income-uk'],
  },
];
