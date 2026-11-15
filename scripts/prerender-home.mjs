import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createServer } from 'vite';

// Runs after `vite build`. From the one index.html Vite writes, it produces:
//   dist/index.html               the UK homepage, fully prerendered
//   dist/us/index.html            the US homepage, prerendered with its own head
//   dist/app-shell/<view>.html    one shell per app page (/dashboard, /ledger, …), noindex, with
//                                 its own title and description. vercel.json rewrites each app
//                                 URL to its shell. Before this, every app URL served the homepage
//                                 HTML and Bing reported them as pages with identical titles.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = (...p) => resolve(root, 'dist', ...p);
const server = await createServer({ root, configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, preTransformRequests: false }, appType: 'custom' });

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function swap(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`prerender: ${label} not found in dist/index.html`);
  return html.replace(pattern, replacement);
}

// Replace the crawlable fallback (between <div id="root"> and the end of the long <noscript>)
// with the given markup and a short no-JS note.
function withBody(html, inner) {
  const start = html.indexOf('<div id="root">');
  const end = html.indexOf('</noscript>', start) + '</noscript>'.length;
  if (start < 0 || end < start) throw new Error('Homepage root or fallback marker is missing');
  const fallback = '<noscript><p style="padding:24px;text-align:center">Enable JavaScript to use the tracker. You can still read the guides, worked examples and download budget templates.</p></noscript>';
  return html.slice(0, start) + '<div id="root">' + inner + '</div>' + fallback + html.slice(end);
}

function setMeta(html, attr, name, value) {
  const pattern = new RegExp(`<meta\\s+${attr}="${name.replace('.', '\\.')}"\\s+content="[^"]*"\\s*/>`);
  return swap(html, pattern, `<meta ${attr}="${name}" content="${escAttr(value)}" />`, `${attr}=${name}`);
}

try {
  const { renderLanding, LANDING_COPY, SITE, APP_VIEWS, VIEW_META, titleForView } = await server.ssrLoadModule('/src/prerender.tsx');
  const raw = await readFile(dist('index.html'), 'utf8');

  // Reveal animation content in the initial HTML. React removes this style with
  // the static markup, so normal interactions/animations remain unchanged.
  const visible = '<style>html,body{overflow:auto!important}.lp-r,.lp-nav,.lp-csv-row{opacity:1!important;transform:none!important}.lp-hero-mock{pointer-events:none}</style>';

  // ── UK homepage ──
  await writeFile(dist('index.html'), withBody(raw, renderLanding('GB') + visible));

  // ── US homepage ──
  const us = LANDING_COPY.US;
  const usUrl = `${SITE}/us/`;
  let html = swap(raw, /<html lang="en-GB">/, '<html lang="en-US">', 'html lang');
  html = swap(html, /<title>[\s\S]*?<\/title>/, `<title>${escAttr(us.meta.title)}</title>`, 'title');
  html = setMeta(html, 'name', 'description', us.meta.description);
  html = setMeta(html, 'name', 'keywords', us.meta.keywords);
  html = setMeta(html, 'name', 'geo.region', 'US');
  html = setMeta(html, 'name', 'geo.placename', 'United States');
  html = setMeta(html, 'name', 'language', 'en-US');
  html = setMeta(html, 'http-equiv', 'content-language', 'en-US');
  html = setMeta(html, 'property', 'og:locale', 'en_US');
  html = setMeta(html, 'property', 'og:url', usUrl);
  html = setMeta(html, 'property', 'og:title', us.meta.title);
  html = setMeta(html, 'property', 'og:description', us.meta.socialDescription);
  html = setMeta(html, 'property', 'og:image:alt', 'The Income Tracker: a free, private budget tracker with no bank login');
  html = setMeta(html, 'name', 'twitter:url', usUrl);
  html = setMeta(html, 'name', 'twitter:title', us.meta.title);
  html = setMeta(html, 'name', 'twitter:description', us.meta.socialDescription);
  html = swap(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${usUrl}" />`, 'canonical');
  const usGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': `${usUrl}#webpage`, url: usUrl, name: us.meta.title, description: us.meta.description, inLanguage: 'en-US', isPartOf: { '@id': `${SITE}/#website` }, about: { '@id': `${usUrl}#app` } },
      {
        '@type': 'WebApplication', '@id': `${usUrl}#app`, name: 'The Income Tracker', url: usUrl,
        description: 'A free, private income and expense tracker. Import a CSV, OFX, QFX, QIF or PDF statement from any US bank, categorize your transactions and see every month side by side. No account and no Plaid connection.',
        applicationCategory: 'FinanceApplication', applicationSubCategory: 'Budgeting & Personal Finance',
        operatingSystem: 'Any (web browser: Chrome, Safari, Firefox, Edge); installable as a web app',
        inLanguage: 'en-US', isAccessibleForFree: true, countriesSupported: 'US',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
        featureList: [
          'Free to use with no account and no sign-up',
          'Import CSV, OFX, QFX, QIF and PDF statements from Chase, Bank of America, Wells Fargo, Capital One and other US banks',
          'No Plaid connection and no bank credentials',
          'Track income and expenses month by month in a clear ledger',
          'US take-home pay calculator with federal and state income tax and FICA',
          'Subscription tracker with yearly costs and price rises flagged',
          'Local-first and private: data is stored in your own browser unless you sign in to sync',
        ],
        publisher: { '@id': `${SITE}/#org` },
      },
      { '@type': 'FAQPage', '@id': `${usUrl}#faq`, mainEntity: us.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  };
  html = swap(html, /<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${JSON.stringify(usGraph, null, 2)}\n    </script>`, 'JSON-LD');
  await mkdir(dist('us'), { recursive: true });
  await writeFile(dist('us', 'index.html'), withBody(html, renderLanding('US') + visible));

  // ── App shells ──
  await mkdir(dist('app-shell'), { recursive: true });
  for (const view of APP_VIEWS) {
    const title = titleForView(view);
    let shell = swap(raw, /<title>[\s\S]*?<\/title>/, `<title>${escAttr(title)}</title>`, 'title');
    shell = setMeta(shell, 'name', 'description', VIEW_META[view].description);
    shell = setMeta(shell, 'name', 'robots', 'noindex, follow');
    shell = setMeta(shell, 'property', 'og:title', title);
    shell = setMeta(shell, 'name', 'twitter:title', title);
    shell = swap(shell, /\s*<meta\s+name="keywords"\s+content="[^"]*"\s*\/>/, '', 'keywords');
    shell = swap(shell, /\s*<link rel="canonical" href="[^"]*" \/>/, '', 'canonical');
    shell = shell.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>/g, '');
    shell = swap(shell, /\s*<!-- Structured data[^>]*-->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '', 'JSON-LD');
    await writeFile(dist('app-shell', `${view}.html`), withBody(shell, ''));
  }

  console.log(`Prerendered the UK and US homepages and ${APP_VIEWS.length} noindex app shells.`);
} finally { await server.close(); }
