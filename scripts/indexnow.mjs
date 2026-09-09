// Pings IndexNow (Bing, DuckDuckGo, Yandex, Naver and others share the feed) with
// every URL in the sitemap, so new and updated pages are crawled within hours
// rather than weeks. Google does not use IndexNow; submit the sitemap in Search
// Console for Google.
//
// Run after a deploy: `npm run indexnow`. Safe to run repeatedly.
// The key file public/<key>.txt must be reachable at the site root; it is.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "www.theincometracker.com";
const KEY = "5a512c78dcd2032ef00728d001674202";

const sitemap = await readFile(join(ROOT, "public", "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urlList.length) throw new Error("No URLs found in public/sitemap.xml");

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: submitted ${urlList.length} URLs, HTTP ${response.status}`);
if (response.status >= 400) {
  console.error(await response.text());
  process.exit(1);
}
