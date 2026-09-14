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
  assert(/<meta\s+name="description"\s+content="[^"]+"/.test(html), `${url}: missing description`);
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
console.log(`SEO checks passed for ${entries.length} canonical pages: titles, descriptions, headings, links, structured data and dates.`);
