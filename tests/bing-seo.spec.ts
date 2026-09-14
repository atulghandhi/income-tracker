import { expect, test } from '@playwright/test';

test('weekly and four-weekly conversion uses annual equivalents', async ({ page }) => {
  await page.goto('/tools/weekly-to-monthly-budget-calculator.html');
  const out=page.locator('#calc-out');
  await expect(out).toContainText('£433.33');
  await page.locator('#frequency').selectOption('13');
  await page.locator('#amount').fill('2000');
  await expect(out).toContainText('£2,166.67');
  await expect(out).toContainText('£26,000.00');
  await page.locator('#frequency').selectOption('12');
  await page.locator('#amount').fill('1300');
  await expect(out).toContainText('£300.00 a week');
  await page.locator('#amount').fill('-10');
  await expect(out).toContainText('valid non-negative');
  await page.locator('#amount').fill('');
  await expect(out).not.toContainText('£');
});

test('bill split conserves pennies and handles zero or insufficient income', async ({ page }) => {
  await page.goto('/tools/split-bills-by-income-calculator.html');
  const out=page.locator('#calc-out');
  await expect(out).toContainText('60% / 40%');
  await expect(out).toContainText('£900.00');
  await expect(out).toContainText('£600.00');
  await page.locator('#income1').fill('1');
  await page.locator('#income2').fill('1');
  await page.locator('#bills').fill('0.01');
  const contribution=out.locator('tr').filter({hasText:'Income-based contribution'});
  await expect(contribution).toContainText('£0.01');
  await expect(contribution).toContainText('£0.00');
  await page.locator('#income2').fill('0');
  await page.locator('#bills').fill('10');
  await expect(out).toContainText('exceed your combined');
  await page.locator('#income1').fill('0');
  await expect(out).toContainText('positive income');
});

test('Christmas savings plan excludes existing savings and validates paydays', async ({ page }) => {
  await page.goto('/tools/christmas-budget-savings-calculator.html');
  const out=page.locator('#calc-out');
  await expect(out).toContainText('£150.00 to save each payday');
  await page.locator('#paydays').fill('9');
  await expect(out).toContainText('£50.00 to save each payday');
  await page.locator('#saved').fill('700');
  await expect(out).toContainText('covers this plan');
  await expect(out).toContainText('£0.00 to save each payday');
  await page.locator('#paydays').fill('2.5');
  await expect(out).toContainText('whole numbers');
});

test('shared calculator input remains canonical and rejects invalid query values', async ({ page }) => {
  await page.goto('/tools/weekly-to-monthly-budget-calculator.html?amount=200&frequency=26');
  await expect(page.locator('#calc-out')).toContainText('£433.33');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://www.theincometracker.com/tools/weekly-to-monthly-budget-calculator.html');
  await page.goto('/tools/weekly-to-monthly-budget-calculator.html?amount=-1&frequency=999');
  await expect(page.locator('#calc-out')).not.toContainText('£');
});

test('homepage and calculators remain useful without JavaScript', async ({ browser }) => {
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:4177/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('link',{name:'Weekly to monthly calculator',exact:false})).toBeVisible();
  await expect(page.locator('.lp-bank-grid')).toBeVisible();
  await page.goto('http://127.0.0.1:4177/tools/split-bills-by-income-calculator.html');
  await expect(page.getByRole('heading',{name:'Worked example: £3,000 and £2,000 take-home pay'})).toBeVisible();
  await expect(page.getByRole('link',{name:'MoneyHelper: how to split rent and bills fairly'})).toHaveAttribute('href',/^https:\/\/www.moneyhelper.org.uk\//);
  await context.close();
});

test('new tool layouts fit mobile and have no runtime errors', async ({ page }) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const slug of ['weekly-to-monthly-budget-calculator','split-bills-by-income-calculator','christmas-budget-savings-calculator']) {
    await page.goto('/tools/'+slug+'.html');
    await expect(page.locator('#calc-out')).not.toBeEmpty();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
