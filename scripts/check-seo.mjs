import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sitemap = await readFile(resolve(root, 'dist/sitemap.xml'), 'utf8');
const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => ({
  url: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1],
  modified: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]
}));
assert(entries.length > 0, 'Sitemap is empty');
assert.equal(new Set(entries.map(e => e.url)).size, entries.length, 'Duplicate sitemap URLs');
const titles = new Set();
for (const { url, modified } of entries) {
  const u = new URL(url);
  assert.equal(u.origin, 'https://www.theincometracker.com');
  assert.equal(u.search, '', 'Query URLs do not belong in the sitemap');
  assert.match(modified, /^\d{4}-\d{2}-\d{2}$/);
  assert(modified <= new Date().toISOString().slice(0,10), 'Future modification date');
  const path = u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname;
  const html = await readFile(resolve(root, 'dist', '.' + path), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  assert(title, `${url}: missing title`);
  assert(!titles.has(title), `${url}: duplicate title`); titles.add(title);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${url}: expected one h1`);
  assert(html.includes(`rel="canonical" href="${url}"`), `${url}: wrong canonical`);
  assert(!/<meta[^>]+name="robots"[^>]+noindex/.test(html), `${url}: indexable URL has noindex`);
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1];
  assert(description, `${url}: missing description`);
  // Bing's Site Scan flags descriptions over 160 characters, and truncates titles past about 70.
  const textLength = (s) => s.replace(/&(amp|quot|lt|gt|#39|rsquo|lsquo|pound|middot);/g, '_').length;
  assert(textLength(description) <= 160, `${url}: description is ${textLength(description)} characters (Bing flags over 160)`);
  assert(textLength(description) >= 50, `${url}: description is under 50 characters`);
  assert(textLength(title) <= 70, `${url}: title is ${textLength(title)} characters (keep it to 70)`);
  // A /?… link is a separate URL to a crawler, carrying the homepage's title: use /#… instead.
  assert(!/href="\/\?/.test(html), `${url}: links to a query-string URL of the homepage`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
  for (const m of html.matchAll(/(?:href|src)="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    const path = m[1];
    if(path.startsWith('//') || path.startsWith('/_vercel/')) continue;
    await access(resolve(root,'dist','.' + path + (path.endsWith('/')?'index.html':''))).catch(() => { throw new Error(`${url}: broken link ${path}`); });
  }
}
const home = await readFile(resolve(root,'dist/index.html'),'utf8');
assert(home.includes('lp-bank-grid'), 'Homepage is not prerendered');
for (const slug of ['weekly-to-monthly-budget-calculator','split-bills-by-income-calculator','christmas-budget-savings-calculator']) assert(home.includes(`/tools/${slug}.html`), `Homepage does not link ${slug}`);
// App pages (/dashboard, /ledger, …) each get their own noindex shell via vercel.json. If a view is
// added to the rewrite without a shell, or a shell loses its noindex, Bing sees duplicate pages again.
const vercel = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
const appRewrite = vercel.rewrites.find(r => r.destination === '/app-shell/:view.html');
assert(appRewrite, 'vercel.json no longer rewrites app views to their shells');
const views = appRewrite.source.match(/\(([^)]+)\)/)[1].split('|');
for (const view of views) {
  const shell = await readFile(resolve(root, 'dist/app-shell', `${view}.html`), 'utf8');
  const title = shell.match(/<title>(.*?)<\/title>/s)?.[1];
  assert(title && !titles.has(title), `/${view}: shell title is missing or duplicates an indexable page`); titles.add(title);
  assert(/<meta\s+name="robots"\s+content="noindex/.test(shell), `/${view}: shell is not noindex`);
  assert(!shell.includes('rel="canonical"'), `/${view}: shell should not carry a canonical`);
}
const us = await readFile(resolve(root, 'dist/us/index.html'), 'utf8');
for (const page of [home, us]) {
  assert(page.includes('hreflang="en-GB" href="https://www.theincometracker.com/"'), 'missing en-GB hreflang');
  assert(page.includes('hreflang="en-US" href="https://www.theincometracker.com/us/"'), 'missing en-US hreflang');
}
assert(us.includes('<html lang="en-US">') && !us.includes('£'), 'US homepage is not localised');
console.log(`SEO checks passed for ${entries.length} canonical pages: titles, descriptions, headings, links, structured data and dates.`);
