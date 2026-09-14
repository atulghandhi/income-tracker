// Notify participating search engines about explicitly selected, deployed changes.
// Preview: npm run indexnow -- --since 2026-09-14
// Submit after deployment: npm run indexnow -- --since 2026-09-14 --submit
// Or use --urls-file /path/to/urls.txt (one canonical URL per line).
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ORIGIN = 'https://www.theincometracker.com';
const KEY = '5a512c78dcd2032ef00728d001674202';

export function sitemapEntries(xml) {
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => ({
    url: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1],
    lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]
  }));
}
export function selectUrls(entries, { since, urls } = {}) {
  if (!since && !urls) throw new Error('Choose --since YYYY-MM-DD or --urls-file. Unchanged URLs are not resubmitted by default.');
  if (since && (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(Date.parse(since)) || new Date(since).toISOString().slice(0,10) !== since)) throw new Error('Invalid --since date');
  const selected = [...new Set(urls || entries.filter(e => e.lastmod >= since).map(e => e.url))];
  for (const url of selected) {
    const u = new URL(url);
    if(u.origin !== ORIGIN || u.search || u.hash || !entries.some(e => e.url === url)) throw new Error(`URL is not a canonical entry in the local sitemap: ${url}`);
  }
  return selected;
}
export async function notifyIndexNow({ entries, urls, submit = false, fetchImpl = fetch }) {
  if(!submit || !urls.length) return { mode: 'preview', urls };
  const get = async url => {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if(response.status !== 200) throw new Error(`Live preflight failed: ${url} returned HTTP ${response.status}`);
    return response.text();
  };
  const keyLocation = `${ORIGIN}/${KEY}.txt`;
  if((await get(keyLocation)).trim() !== KEY) throw new Error('Live IndexNow key does not match');
  const live = sitemapEntries(await get(`${ORIGIN}/sitemap.xml`));
  for(const url of urls) {
    const expected = entries.find(e => e.url === url);
    if(!live.some(e => e.url === url && e.lastmod >= expected.lastmod)) throw new Error(`The updated sitemap is not deployed for ${url}`);
    const html = await get(url);
    if(!html.includes(`rel="canonical" href="${url}"`) || /<meta[^>]+name="robots"[^>]+noindex/.test(html)) throw new Error(`Live page is not indexable with the expected canonical: ${url}`);
  }
  const response = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ host: new URL(ORIGIN).hostname, key: KEY, keyLocation, urlList: urls })
  });
  if(![200,202].includes(response.status)) throw new Error(`IndexNow HTTP ${response.status}: ${await response.text()}`);
  return { mode: 'submitted', status: response.status, urls, note: 'Accepted for processing; this does not guarantee crawling, indexing or rankings.' };
}
async function main() {
  const args=process.argv.slice(2);
  const option=name => { const i=args.indexOf(name); return i<0?undefined:args[i+1]; };
  const entries=sitemapEntries(await readFile(join(ROOT,'public/sitemap.xml'),'utf8'));
  const file=option('--urls-file');
  const urls=selectUrls(entries, { since: option('--since'), urls: file ? (await readFile(resolve(file),'utf8')).split(/\r?\n/).map(s=>s.trim()).filter(Boolean) : undefined });
  const result=await notifyIndexNow({entries,urls,submit:args.includes('--submit')});
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(error.message);process.exitCode=1;});
