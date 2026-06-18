// Builds the static, crawlable SEO/GEO content pages for The Income Tracker.
//
// Why this exists: the app itself is a client-rendered Vite SPA, which crawlers
// and AI answer-engines index poorly. These pages are plain, server-free HTML
// served straight from /public, so Google, Bing and LLM crawlers (GPTBot,
// ClaudeBot, PerplexityBot and friends) get fully-formed, answer-first content
// with structured data. Those are the things that win long-tail rankings and AI
// citations for a brand-new, zero-authority domain.
//
// What gets built:
//   - Bank CSV export guides (one high-intent page per UK bank) + /import/ hub
//   - Cornerstone guides (privacy / free-alternative intent) + /guides/ hub
//   - Interactive money calculators (real tools, value at the top) + /tools/ hub
//   - Search-intent landing pages built around jobs people already search for
//
// Voice rules (deliberate): answer-first, value at the top, no em-dashes, varied
// sentence length, a bit of opinion, brief. Bullet points and clear headers so a
// reader finds what they came for instantly.
//
// Run: `node scripts/build-content.mjs` (also wired into `npm run prebuild`).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

const SITE = "https://www.theincometracker.com";
const BRAND = "The Income Tracker";
// Single source of truth for the "last updated" date stamped on every page and
// the sitemap. Bump this when content is meaningfully revised. Visible, recent
// dates are a strong freshness signal for both Google and Perplexity.
const UPDATED = "2026-06-16";
const UPDATED_HUMAN = "16 June 2026";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 24px 96px; background: #051424; color: #d4e4fa;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16px; line-height: 1.7;
  }
  .wrap { max-width: 760px; margin: 0 auto; }
  a { color: #00dfc1; text-decoration: none; }
  a:hover { text-decoration: underline; }
  header.top { padding: 28px 0 8px; }
  nav.crumbs { font-size: 0.85rem; color: #9ea8b7; }
  nav.crumbs a { color: #9ea8b7; }
  nav.crumbs a:hover { color: #00dfc1; }
  h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); font-weight: 800; line-height: 1.15; margin: 18px 0 10px; color: #fff; letter-spacing: -0.02em; }
  .meta { color: #9ea8b7; font-size: 0.85rem; margin-bottom: 24px; }
  .lede { font-size: 1.12rem; color: #eaf2ff; line-height: 1.65; margin: 0 0 24px; }
  .tldr { background: rgba(0,223,193,0.07); border: 1px solid rgba(0,223,193,0.22); border-radius: 12px; padding: 16px 20px; margin: 0 0 28px; }
  .tldr strong { color: #00dfc1; letter-spacing: 0.02em; font-size: 0.8rem; text-transform: uppercase; display: block; margin-bottom: 6px; }
  .tldr p { margin: 0; color: #d4e4fa; }
  h2 { font-size: 1.3rem; font-weight: 700; color: #fff; margin: 40px 0 12px; letter-spacing: -0.01em; }
  h3 { font-size: 1.05rem; font-weight: 650; color: #fff; margin: 28px 0 8px; }
  p, li { color: #c8d8ee; }
  ul, ol { padding-left: 22px; }
  li + li { margin-top: 8px; }
  ol.steps { counter-reset: step; list-style: none; padding-left: 0; }
  ol.steps > li { position: relative; padding: 0 0 4px 44px; margin-top: 18px; }
  ol.steps > li::before {
    counter-increment: step; content: counter(step);
    position: absolute; left: 0; top: 0; width: 30px; height: 30px;
    background: rgba(0,223,193,0.12); border: 1px solid rgba(0,223,193,0.4);
    color: #00dfc1; border-radius: 50%; display: grid; place-items: center;
    font-weight: 700; font-size: 0.9rem;
  }
  .note { background: rgba(212,228,250,0.05); border-left: 3px solid rgba(212,228,250,0.25); padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 0.95rem; color: #b8c8e0; }
  .cta { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 34px 0; padding: 24px; background: rgba(8,22,38,0.85); border: 1px solid rgba(0,223,193,0.18); border-radius: 14px; }
  .cta .cta-text { flex: 1; min-width: 220px; }
  .cta .cta-text strong { color: #fff; display: block; font-size: 1.05rem; margin-bottom: 2px; }
  .cta .cta-text span { color: #9ea8b7; font-size: 0.9rem; }
  .btn { display: inline-flex; align-items: center; gap: 8px; background: #00dfc1; color: #051424; font-weight: 700; padding: 13px 22px; border-radius: 10px; white-space: nowrap; }
  .btn:hover { text-decoration: none; filter: brightness(1.06); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin: 24px 0; }
  .card { display: block; padding: 16px 18px; background: rgba(8,22,38,0.7); border: 1px solid rgba(212,228,250,0.1); border-radius: 12px; transition: border-color 140ms ease, transform 140ms ease; }
  .card:hover { text-decoration: none; border-color: rgba(0,223,193,0.4); transform: translateY(-2px); }
  .card .card-t { color: #fff; font-weight: 650; display: block; margin-bottom: 4px; }
  .card .card-d { color: #9ea8b7; font-size: 0.88rem; }
  .faq dt { font-weight: 650; color: #fff; margin-top: 22px; }
  .faq dd { margin: 6px 0 0; color: #c8d8ee; }
  /* Calculator widget */
  .calc { background: rgba(8,22,38,0.9); border: 1px solid rgba(0,223,193,0.2); border-radius: 16px; padding: 22px; margin: 0 0 14px; }
  .calc-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; }
  .calc-field { display: flex; flex-direction: column; gap: 6px; }
  .calc-label { font-size: 0.82rem; color: #9ea8b7; font-weight: 600; }
  .calc-inwrap { display: flex; align-items: center; background: #06182b; border: 1px solid rgba(212,228,250,0.16); border-radius: 10px; padding: 0 12px; }
  .calc-inwrap:focus-within { border-color: rgba(0,223,193,0.5); }
  .calc-inwrap i { color: #9ea8b7; font-style: normal; font-size: 0.95rem; }
  .calc-inwrap input { flex: 1; min-width: 0; background: none; border: none; color: #fff; font-size: 1.05rem; font-weight: 600; padding: 11px 6px; outline: none; font-family: inherit; }
  .calc-inwrap input::-webkit-outer-spin-button, .calc-inwrap input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .calc-out { margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(212,228,250,0.1); }
  .calc-out p { margin: 8px 0 0; }
  .calc-headline { font-size: 2rem; font-weight: 800; color: #00dfc1; line-height: 1.1; letter-spacing: -0.02em; }
  .calc-headline small { font-size: 0.9rem; font-weight: 600; color: #9ea8b7; letter-spacing: 0; }
  .calc-hint { color: #9ea8b7; }
  .calc-good { color: #00dfc1; }
  .calc-warn { color: #ffd479; }
  .calc-bad { color: #ff8b8b; }
  hr { border: none; border-top: 1px solid rgba(212,228,250,0.1); margin: 48px 0 24px; }
  footer { color: #9ea8b7; font-size: 0.85rem; }
  footer a { color: #9ea8b7; }
  footer a:hover { color: #00dfc1; }
`;

function shell({ title, description, path, jsonLd, body, script = "" }) {
  const canonical = `${SITE}${path}`;
  const ld = jsonLd.map((o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`).join("\n");
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="author" content="${BRAND}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="geo.region" content="GB" />
    <meta http-equiv="content-language" content="en-GB" />
    <meta property="og:type" content="article" />
    <meta property="og:locale" content="en_GB" />
    <meta property="og:site_name" content="${BRAND}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${SITE}/og-image.png" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/icon.png" />
    <style>${CSS}</style>
${ld}
  </head>
  <body>
    <div class="wrap">
${body}
      <hr />
      <footer>
        &copy; 2026 ${BRAND} &nbsp;·&nbsp;
        <a href="/">Home</a> &nbsp;·&nbsp;
        <a href="/tools/">Calculators</a> &nbsp;·&nbsp;
        <a href="/import/">Bank CSV guides</a> &nbsp;·&nbsp;
        <a href="/guides/">Guides</a> &nbsp;·&nbsp;
        <a href="/privacy.html">Privacy</a> &nbsp;·&nbsp;
        <a href="/?feedback=1">Contact us</a> &nbsp;·&nbsp;
        <a href="/tos.html">Terms</a>
      </footer>
    </div>
${script}
  </body>
</html>
`;
}

function breadcrumbHtml(trail) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${trail
    .map((t, i) => (t.path ? `<a href="${t.path}">${esc(t.name)}</a>` : esc(t.name)) + (i < trail.length - 1 ? " &rsaquo; " : ""))
    .join("")}</nav>`;
}

function breadcrumbLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE}${t.path || ""}`,
    })),
  };
}

function faqLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function faqHtml(faqs) {
  return `<h2>Frequently asked questions</h2>\n<dl class="faq">\n${faqs
    .map((f) => `<dt>${esc(f.q)}</dt>\n<dd>${esc(f.a)}</dd>`)
    .join("\n")}\n</dl>`;
}

function ctaHtml(line = "Track it free. No account, no bank login.") {
  return `<div class="cta">
  <div class="cta-text"><strong>${BRAND}</strong><span>${esc(line)}</span></div>
  <a class="btn" href="/">Open the tracker &rarr;</a>
</div>`;
}

// Shared section renderer for guides, landing pages and calculator pages.
function renderSections(sections) {
  if (!sections) return "";
  return sections
    .map((s) => {
      const parts = [`<h2>${esc(s.h)}</h2>`];
      for (const p of s.p || []) parts.push(`<p>${esc(p)}</p>`);
      if (s.ul) parts.push(`<ul>\n${s.ul.map((i) => `        <li>${esc(i)}</li>`).join("\n")}\n      </ul>`);
      if (s.ol) parts.push(`<ol class="steps">\n${s.ol.map((i) => `        <li>${esc(i)}</li>`).join("\n")}\n      </ol>`);
      return parts.join("\n      ");
    })
    .join("\n\n      ");
}

function relatedCards(keys) {
  if (!keys || !keys.length) return "";
  const cards = keys
    .map((k) => RELATED_INDEX[k])
    .filter(Boolean)
    .map((r) => `        <a class="card" href="${r.href}"><span class="card-t">${esc(r.t)}</span><span class="card-d">${esc(r.d)}</span></a>`)
    .join("\n");
  return `<h2>Related</h2>\n      <div class="grid">\n${cards}\n      </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank CSV import guides. One high-intent long-tail page per bank.
// `steps` are sourced from each bank's current export flow (June 2026).
// ─────────────────────────────────────────────────────────────────────────────

const BANKS = [
  {
    slug: "barclays-csv",
    name: "Barclays",
    where: "Barclays Online Banking on a computer (the app cannot export CSV)",
    steps: [
      "Log in to Barclays Online Banking on a computer.",
      "Choose the account you want and click <em>Show recent transactions</em>.",
      "Scroll down and click <em>View all transactions</em>.",
      "Pick a start and end date, then click <em>Search</em>.",
      "Scroll to the bottom, click <em>Export all</em>, then choose <em>CSV (Excel)</em>.",
      "Save the file and drop it into The Income Tracker.",
    ],
    note: "Barclays only offers CSV export on the desktop Online Banking site. The mobile app cannot do it.",
  },
  {
    slug: "hsbc-csv",
    name: "HSBC UK",
    where: "HSBC Online Banking on desktop, from the transactions list rather than the PDF statement",
    steps: [
      "Log in to HSBC UK Online Banking on a computer (a mobile browser works too, but not the app).",
      "Open the account you want to export.",
      "Go to the transactions or previous statements view for that account.",
      "Use the <em>Download</em> option and choose <em>CSV</em> (or Excel).",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "HSBC's official monthly statements are PDF only. CSV comes from the transactions list and usually covers recent activity, so export in chunks if you need more history.",
  },
  {
    slug: "monzo-csv",
    name: "Monzo",
    where: "the Monzo app (iOS or Android)",
    steps: [
      "Open the Monzo app and find your transaction feed.",
      "Tap <em>Manage</em> next to the account (or the three dots on a business card).",
      "Tap <em>Bank statements</em>.",
      "Choose the date range you want.",
      "Select <em>CSV</em> as the format and generate the statement.",
      "Share or save the file, then import it into The Income Tracker.",
    ],
    note: "Monzo also offers PDF and QIF. Pick CSV for the cleanest import.",
  },
  {
    slug: "starling-csv",
    name: "Starling Bank",
    where: "the Starling app or web banking",
    steps: [
      "Open the Starling app and go to the account you want.",
      "Tap the account name, then <em>Account</em> or <em>Account information</em>.",
      "Tap <em>Statements</em> (or <em>Export statement</em>).",
      "Choose your date range and select <em>CSV</em> as the format.",
      "Save the file and drop it into The Income Tracker.",
    ],
    note: "Starling lets you export specific date ranges as CSV, which is handy for filling one month at a time.",
  },
  {
    slug: "lloyds-csv",
    name: "Lloyds Bank",
    where: "Lloyds Internet Banking on a computer (the app cannot export CSV)",
    steps: [
      "Log in to Lloyds Internet Banking on a computer.",
      "Open the account and find the <em>Statement options</em> box above the transactions.",
      "Click it and choose <em>Export transactions (CSV, QIF)</em>.",
      "Set your date range and choose <em>CSV</em>.",
      "The file downloads as <em>exportStatements-xx.csv</em>, ready to import into The Income Tracker.",
    ],
    note: "Lloyds caps each export at the last 12 months and 150 transactions. Hit the cap? Export again with a narrower date range and import each file.",
  },
  {
    slug: "natwest-csv",
    name: "NatWest",
    where: "NatWest Online Banking on desktop",
    steps: [
      "Log in to NatWest Online Banking on a computer.",
      "Select <em>Statements &amp; transactions</em> from the main menu.",
      "Choose <em>View transactions</em>, pick the account and set your date range.",
      "Click <em>View transactions</em>, then choose to export.",
      "From the format drop-down, select <em>Excel, Lotus, 123, Text (CSV file)</em>.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Always set the date range before exporting so you capture the full period you want.",
  },
  {
    slug: "santander-csv",
    name: "Santander UK",
    where: "Santander Online Banking on desktop",
    steps: [
      "Log in to Santander Online Banking on a computer.",
      "From <em>My accounts and transactions</em>, choose the account.",
      "Click <em>Download transactions</em> above the transactions table.",
      "In the <em>Download to</em> drop-down, choose <em>midata (CSV)</em>.",
      "Click <em>Download</em>, save the file, and import it into The Income Tracker.",
    ],
    note: "Santander's midata export covers up to 12 months and masks some sensitive details for security. That is normal and still imports fine.",
  },
  {
    slug: "revolut-csv",
    name: "Revolut",
    where: "the Revolut app or web app",
    steps: [
      "Open Revolut and go to <em>Accounts</em>.",
      "Tap <em>Statements</em> (under the account or in <em>Documents</em>).",
      "Choose your account or currency and date range.",
      "Select <em>Excel/CSV</em> as the format and generate it.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Revolut's CSV can include multi-currency columns. If a file looks messy, export one currency per file for the cleanest import.",
  },
];

function bankPage(bank) {
  const path = `/import/${bank.slug}.html`;
  const title = `How to export your ${bank.name} statement to CSV (free, 2026) · ${BRAND}`;
  const description = `Step-by-step: download your ${bank.name} transactions as a CSV file and track your income and spending free. No account and no bank login required.`;
  const trail = [
    { name: "Home", path: "/" },
    { name: "Bank CSV guides", path: "/import/" },
    { name: bank.name, path },
  ];
  const faqs = [
    {
      q: `Can I export ${bank.name} transactions to CSV for free?`,
      a: `Yes. ${bank.name} lets you download your own transactions as a CSV file at no cost from ${bank.where}. You then import that file into a budgeting tool such as The Income Tracker.`,
    },
    {
      q: `Do I need to connect or log in to my bank to use The Income Tracker?`,
      a: `No. There is no open-banking connection and you never enter bank credentials into The Income Tracker. You download the CSV from ${bank.name} yourself and drop it into the app, which runs entirely in your browser.`,
    },
    {
      q: `Is my ${bank.name} data kept private?`,
      a: `Yes. The Income Tracker is local-first. Your imported transactions stay in your own browser and are never uploaded to a server, unless you choose to sign in to sync across devices.`,
    },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>How to export your ${esc(bank.name)} statement to CSV</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>In short</strong><p>Log in to ${esc(bank.where)}, open the account, pick a date range and export as <strong>CSV</strong>. Then import that file into ${BRAND} and track your money for free, with no bank login.</p></div>

      <h2>Export ${esc(bank.name)} transactions as CSV</h2>
      <ol class="steps">
${bank.steps.map((s) => `        <li>${s}</li>`).join("\n")}
      </ol>
      <p class="note">${esc(bank.note)}</p>

      ${ctaHtml(`Import your ${bank.name} CSV. Free, no account, no bank login.`)}

      <h2>What happens after you import</h2>
      <p>Drop the file in and every transaction lands in a month-by-month ledger. Drag items into categories, flag the recurring ones, and watch your surplus update as you go. Money moved between your own accounts gets auto-skipped, so transfers never double-count.</p>

      ${faqHtml(faqs)}

      <h2>Other banks</h2>
      <div class="grid">
${BANKS.filter((b) => b.slug !== bank.slug)
  .map((b) => `        <a class="card" href="/import/${b.slug}.html"><span class="card-t">${esc(b.name)} &rarr; CSV</span><span class="card-d">Export ${esc(b.name)} transactions</span></a>`)
  .join("\n")}
      </div>`;
  return {
    path,
    html: shell({
      title,
      description,
      path,
      jsonLd: [
        breadcrumbLd(trail),
        {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: `How to export your ${bank.name} statement to CSV`,
          description,
          totalTime: "PT3M",
          step: bank.steps.map((s, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            text: s.replace(/<[^>]+>/g, ""),
          })),
        },
        faqLd(faqs),
      ],
      body,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cornerstone guides. Answer-first articles targeting privacy and
// free-alternative intent that LLMs and AI Overviews tend to cite.
// ─────────────────────────────────────────────────────────────────────────────

const GUIDES = [
  {
    slug: "budget-without-linking-bank",
    title: "How to budget without linking your bank account (2026)",
    description:
      "You do not need open banking to budget. Here is how to track your income and spending privately in 2026 using a bank CSV. No account connection, no credentials shared.",
    h1: "How to budget without linking your bank account",
    tldr:
      "Yes, you can budget without open banking. Download a CSV of your transactions from your bank, import it into a local-first tool like The Income Tracker, and you are done. Nothing connects to your bank. No credentials shared. Your data stays in your browser.",
    sections: [
      {
        h: "Why skip the bank connection?",
        p: [
          "Most budgeting apps want to plug into your bank through open banking (Plaid, TrueLayer and the like). That hands a third party an ongoing feed of everything you spend. Plenty of people are not comfortable with that, and fair enough.",
          "Here is the good news. You do not need it. Every UK bank lets you download your own transactions as a CSV, and a CSV is all a good budgeting tool actually needs.",
        ],
      },
      {
        h: "The method, start to finish",
        p: ["Two minutes, tops."],
        ol: [
          "Download a CSV of your transactions from your bank's app or website.",
          "Import it into The Income Tracker. It reads the dates, descriptions and amounts for you.",
          "Drag transactions into categories and watch your monthly surplus update live.",
        ],
      },
      {
        h: "What you give up",
        p: [
          "Honestly? Very little. You download a file once a month instead of letting it sync on its own. In return, no third party can see your accounts, there is no connection to break or renew, and it works across every bank you use. For most people that trade is a no-brainer.",
        ],
      },
    ],
    faqs: [
      {
        q: "Can you budget without open banking?",
        a: "Yes. Download a CSV of your transactions from your bank and import it into a budgeting tool such as The Income Tracker. No open-banking connection or bank login is required.",
      },
      {
        q: "Is it safe to budget with a CSV instead of connecting my bank?",
        a: "It is safer in the sense that no third party gets ongoing access to your accounts. You export the file yourself, and with a local-first tool like The Income Tracker the data stays in your own browser.",
      },
      {
        q: "Which UK banks let you export a CSV?",
        a: "All the major ones, including Barclays, HSBC, Monzo, Starling, Lloyds, NatWest, Santander and Revolut. The Income Tracker has a step-by-step CSV guide for each.",
      },
    ],
    related: ["import", "tools", "is-it-safe-to-upload-bank-statements", "free-ynab-alternative-uk"],
  },
  {
    slug: "free-ynab-alternative-uk",
    title: "The best free YNAB alternative in the UK (no subscription)",
    description:
      "Looking for a free YNAB alternative in the UK? The Income Tracker is free, needs no sign-up, and imports your bank CSV. No account and no bank login needed.",
    h1: "A free YNAB alternative for the UK",
    tldr:
      "Want YNAB's clarity without the monthly fee? The Income Tracker is free, needs no sign-up, and is built for the UK. Import a CSV from any UK bank, track income and spending month by month, and keep your data private in your browser.",
    sections: [
      {
        h: "What people actually want",
        p: [
          "YNAB is genuinely good. But it costs money, and its method can feel like a lot when all you want is to see your income, your spending and what is left. The usual wish list for an alternative is short: free, no subscription, works in the UK, and ideally no bank linking.",
        ],
      },
      {
        h: "How The Income Tracker compares",
        p: [
          "It is free, with no account required. It is built around UK banks, so you download a CSV from Barclays, HSBC, Monzo, Starling and others and import it in seconds. You get a month-by-month ledger, drag-and-drop categories, recurring items and an annual savings projection. No envelope system to learn.",
          "The trade-off is honest. This is not a full zero-based budgeting system like YNAB, and it will not auto-sync over open banking. If you want a simple, private, free way to see where your money goes, that is the whole point.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is there a free alternative to YNAB?",
        a: "Yes. The Income Tracker is a free, no-subscription budgeting tool for the UK. You import a CSV from your bank and track income and spending month by month, with no account or bank login required.",
      },
      {
        q: "Does the free YNAB alternative work with UK banks?",
        a: "Yes. The Income Tracker imports standard CSV exports from UK banks including Barclays, HSBC, Monzo, Starling, Lloyds, NatWest and Santander.",
      },
      {
        q: "Do I have to pay or subscribe?",
        a: "No. The Income Tracker is completely free. No credit card, no subscription, no sign-up.",
      },
    ],
    related: ["import", "tools", "spreadsheet-alternative-income-expense-tracker", "budget-without-linking-bank"],
  },
  {
    slug: "is-it-safe-to-upload-bank-statements",
    title: "Is it safe to upload your bank statement to a budgeting app?",
    description:
      "Is it safe to upload a bank statement or CSV to a budgeting app? It depends on where the data goes. Here is what to check, and how a local-first tool keeps it private.",
    h1: "Is it safe to upload your bank statement to a budgeting app?",
    tldr:
      "It depends on where the file goes. The safest setup is a local-first tool that reads your CSV in your browser and never uploads it. That is exactly how The Income Tracker works. Steer clear of tools that quietly send your statement to their servers.",
    sections: [
      {
        h: "The one question that matters",
        p: [
          "Before you upload a statement anywhere, ask one thing. Does this file leave my device? There are two ways a tool can read a CSV. It can process it entirely in your browser, so the file goes nowhere. Or it can upload it to a server to be processed and maybe stored.",
          "The first is private by design. The second asks you to trust a company with a full record of your finances.",
        ],
      },
      {
        h: "Check these three things first",
        ol: [
          "Does it say the file is processed locally, in your browser? Local-first is safest.",
          "If it uploads, does the privacy policy spell out what is stored and for how long?",
          "Does it demand your bank login or open banking? You should never have to share credentials just to read a CSV.",
        ],
      },
      {
        h: "How The Income Tracker handles it",
        p: [
          "It reads your CSV directly in your browser. Your transactions sit in local storage on your device and are never sent to a server, unless you choose to sign in to sync across devices. There is no open-banking connection and you never share bank credentials.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is it safe to upload a bank statement to a budgeting app?",
        a: "It is safe if the app processes the file locally in your browser and does not upload it to a server. The Income Tracker reads your CSV in your browser and keeps the data on your device.",
      },
      {
        q: "Can a budgeting app see my bank login?",
        a: "Only if you connect your bank via open banking, and you do not need to. Importing a CSV needs no credentials. The Income Tracker never asks for your bank login.",
      },
      {
        q: "Where does The Income Tracker store my data?",
        a: "In your own browser's local storage. Nothing is uploaded unless you choose to sign in to sync across devices.",
      },
    ],
    related: ["budget-without-linking-bank", "import", "tools", "free-ynab-alternative-uk"],
  },
];

function guidePage(guide) {
  const path = `/guides/${guide.slug}.html`;
  const title = `${guide.title} · ${BRAND}`;
  const trail = [
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides/" },
    { name: guide.h1, path },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>${esc(guide.h1)}</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>The short answer</strong><p>${esc(guide.tldr)}</p></div>

      ${renderSections(guide.sections)}

      ${ctaHtml()}

      ${faqHtml(guide.faqs)}

      ${relatedCards(guide.related)}`;
  return {
    path,
    html: shell({
      title,
      description: guide.description,
      path,
      jsonLd: [
        breadcrumbLd(trail),
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.h1,
          description: guide.description,
          datePublished: UPDATED,
          dateModified: UPDATED,
          inLanguage: "en-GB",
          author: { "@type": "Organization", name: BRAND, url: SITE },
          publisher: { "@type": "Organization", name: BRAND, url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/icon.png` } },
          mainEntityOfPage: `${SITE}${path}`,
        },
        faqLd(guide.faqs),
      ],
      body,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive calculators. Real tools, rendered client-side, with the answer at
// the very top of the page. These match queries people already search for and
// give a "post-click experience" a plain text answer cannot.
// Each `compute` is browser JS. It must not contain backticks or ${ so it can
// live safely inside this module's template literals.
// ─────────────────────────────────────────────────────────────────────────────

const CALCULATORS = [
  {
    slug: "0-percent-credit-card-payoff-calculator-uk",
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
    card: "Credit card utilisation",
    cardD: "See your score-friendly ratio",
    crumb: "Credit card utilisation",
    title: "Credit card utilisation calculator (UK)",
    description:
      "Free UK credit utilisation calculator. See what percentage of your credit limit you are using and whether it could be hurting your credit score.",
    h1: "Credit card utilisation calculator",
    tldr:
      "Utilisation is the share of your credit limit you are using. UK lenders like to see it low. Under 30% is good, under 10% is even better. Enter your balance and limit to see where you stand.",
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
    else if(u<=30){msg='Healthy. You are inside the safe zone.';cls='good';}
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
        a: "Under 30% is the usual guidance, and under 10% is even better. High utilisation can pull your credit score down.",
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
    related: ["0-percent-credit-card-payoff-calculator-uk", "loan-repayment-and-savings-goal-planner", "tools", "app"],
  },
  {
    slug: "how-long-to-save-10000-for-a-car",
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
    card: "Monthly surplus",
    cardD: "What is left after spending",
    crumb: "Monthly surplus",
    title: "Monthly surplus calculator (UK)",
    description:
      "Free monthly surplus calculator. Subtract your expenses from your income to see how much you have left each month and your savings rate.",
    h1: "Monthly surplus calculator",
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
];

function calcWidget(calc) {
  const ids = calc.fields.map((f) => f.id);
  const fields = calc.fields
    .map((f) => {
      const pre = f.prefix ? `<i>${esc(f.prefix)}</i>` : "";
      const suf = f.suffix ? `<i>${esc(f.suffix)}</i>` : "";
      return `<label class="calc-field"><span class="calc-label">${esc(f.label)}</span><span class="calc-inwrap">${pre}<input id="${f.id}" type="number" inputmode="decimal" step="any" value="${f.value}" />${suf}</span></label>`;
    })
    .join("\n          ");
  const html = `<div class="calc">
        <div class="calc-fields">
          ${fields}
        </div>
        <div class="calc-out" id="calc-out" aria-live="polite"></div>
      </div>`;
  const script = `<script>
(function(){
  function n(id){var el=document.getElementById(id);if(!el)return 0;var v=parseFloat(el.value);return isNaN(v)?0:v;}
  function gbp(x){return '£'+(Math.round(x*100)/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
  var out=document.getElementById('calc-out');
  function render(){${calc.compute}}
  ${JSON.stringify(ids)}.forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener('input',render);});
  render();
})();
</script>`;
  return { html, script };
}

function calcPage(calc) {
  const path = `/tools/${calc.slug}.html`;
  const title = `${calc.title} · ${BRAND}`;
  const trail = [
    { name: "Home", path: "/" },
    { name: "Calculators", path: "/tools/" },
    { name: calc.crumb, path },
  ];
  const widget = calcWidget(calc);
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>${esc(calc.h1)}</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>The short answer</strong><p>${esc(calc.tldr)}</p></div>
      ${widget.html}

      ${renderSections(calc.sections)}

      ${ctaHtml()}

      ${faqHtml(calc.faqs)}

      ${relatedCards(calc.related)}`;
  return {
    path,
    html: shell({
      title,
      description: calc.description,
      path,
      jsonLd: [
        breadcrumbLd(trail),
        {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: calc.title,
          description: calc.description,
          applicationCategory: "FinanceApplication",
          operatingSystem: "Any (web browser)",
          url: `${SITE}${path}`,
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        },
        faqLd(calc.faqs),
      ],
      body,
      script: widget.script,
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Search-intent landing pages. Built around jobs people already search for.
// These are product pages (use-case first) and cross-link to the matching
// how-to export guide, so they do not cannibalise the /import/ pages.
// ─────────────────────────────────────────────────────────────────────────────

const LANDINGS = [
  {
    slug: "monzo-csv-expense-tracker",
    card: "Monzo CSV expense tracker",
    cardD: "Track Monzo spending free",
    crumb: "Monzo CSV expense tracker",
    title: "Monzo CSV expense tracker (free, no bank login)",
    description:
      "Turn your Monzo CSV export into a clear month-by-month expense tracker. Free, private, no account and no open banking. Import in seconds.",
    h1: "A free Monzo CSV expense tracker",
    tldr:
      "Export a CSV from Monzo, drop it into The Income Tracker, and every transaction lands in a clean month-by-month view you can categorise in seconds. Free, private, no bank login.",
    why: [
      "Free, with no account and no subscription.",
      "No open banking. You export the CSV yourself.",
      "Your data stays in your browser, not on our servers.",
      "Drag-and-drop categories and live totals.",
      "Works alongside your other banks too.",
    ],
    steps: [
      "In the Monzo app, tap Manage, then Bank statements, and export as CSV.",
      "Open The Income Tracker and import the file.",
      "Your spending sorts into a monthly ledger, ready to categorise.",
    ],
    exportNoteHtml: 'Need the exact export steps? See the <a href="/import/monzo-csv.html">Monzo CSV guide</a>.',
    faqs: [
      { q: "Is the Monzo expense tracker free?", a: "Yes. The Income Tracker is free with no account or subscription. Import your Monzo CSV and start tracking straight away." },
      { q: "Do I need to connect Monzo with open banking?", a: "No. You export a CSV from the Monzo app yourself, so nothing connects to your account." },
      { q: "Can I track Monzo alongside other banks?", a: "Yes. Import CSVs from as many banks as you like and see everything in one monthly view." },
    ],
    related: ["monzo-csv", "starling-csv-budget-tracker", "tools", "budget-without-linking-bank"],
  },
  {
    slug: "barclays-csv-budget-planner",
    card: "Barclays CSV budget planner",
    cardD: "Plan from your Barclays CSV",
    crumb: "Barclays CSV budget planner",
    title: "Barclays CSV budget planner (free)",
    description:
      "Plan your budget from your Barclays CSV export. Free and private, with no bank login. See income, spending and surplus month by month.",
    h1: "A free Barclays CSV budget planner",
    tldr:
      "Download a CSV from Barclays Online Banking, import it into The Income Tracker, and plan your month around real numbers. Income, spending and what is left, all in one view. Free, no bank login.",
    why: [
      "Free, with no account and no subscription.",
      "No open banking. You download the CSV yourself.",
      "Income, expenses and surplus in one clear month view.",
      "Drag transactions into categories in seconds.",
      "An annual projection so you can plan ahead.",
    ],
    steps: [
      "In Barclays Online Banking, export your transactions as CSV (Export all, then CSV).",
      "Open The Income Tracker and import the file.",
      "Your month builds itself, ready to plan and categorise.",
    ],
    exportNoteHtml: 'Need the exact export steps? See the <a href="/import/barclays-csv.html">Barclays CSV guide</a>.',
    faqs: [
      { q: "Is the Barclays budget planner free?", a: "Yes. The Income Tracker is free, with no account or subscription. Import your Barclays CSV and start planning." },
      { q: "Do I have to connect my Barclays account?", a: "No. You export a CSV from Barclays Online Banking yourself. Nothing connects to your account." },
      { q: "Can I see a full year, not just one month?", a: "Yes. The Income Tracker adds up every month you import and projects the year ahead." },
    ],
    related: ["barclays-csv", "monzo-csv-expense-tracker", "tools", "budget-without-linking-bank"],
  },
  {
    slug: "starling-csv-budget-tracker",
    card: "Starling CSV budget tracker",
    cardD: "Track Starling spending free",
    crumb: "Starling CSV budget tracker",
    title: "Starling CSV import budget tracker (free)",
    description:
      "Import your Starling CSV and track your budget month by month. Free and private, with no open banking and no bank login.",
    h1: "A free Starling CSV budget tracker",
    tldr:
      "Export a CSV from Starling, import it into The Income Tracker, and track your spending in a clean monthly ledger. Free, private, no open banking.",
    why: [
      "Free, with no account and no subscription.",
      "No open banking. You export the CSV yourself.",
      "Month-by-month ledger with live totals.",
      "Drag-and-drop categories that stick.",
      "Mix in CSVs from your other banks too.",
    ],
    steps: [
      "In the Starling app, open Account information and export a CSV statement.",
      "Open The Income Tracker and import the file.",
      "Your transactions land in a monthly view, ready to categorise.",
    ],
    exportNoteHtml: 'Need the exact export steps? See the <a href="/import/starling-csv.html">Starling CSV guide</a>.',
    faqs: [
      { q: "Is the Starling budget tracker free?", a: "Yes. The Income Tracker is free, with no account or subscription. Import your Starling CSV and go." },
      { q: "Do I need open banking for this?", a: "No. You export a CSV from the Starling app yourself, so nothing connects to your account." },
      { q: "Can I import several months at once?", a: "Yes. Export the date range you want from Starling and import it in one go." },
    ],
    related: ["starling-csv", "monzo-csv-expense-tracker", "tools", "budget-without-linking-bank"],
  },
  {
    slug: "budget-app-without-open-banking",
    card: "Budget app, no open banking",
    cardD: "Private by design",
    crumb: "Budget app without open banking",
    title: "UK budget app without open banking (free)",
    description:
      "A free UK budget app that never uses open banking. Import a CSV from your bank and track spending privately, with no credentials shared.",
    h1: "A UK budget app with no open banking",
    tldr:
      "The Income Tracker is a free UK budget app that does not use open banking. You import a CSV you download yourself, so no third party ever connects to your accounts. Private by design.",
    why: [
      "No open banking, ever. No Plaid, no TrueLayer.",
      "You stay in control. You choose what to import.",
      "Free, with no account or subscription.",
      "Data stays in your browser, not on a server.",
      "Works with every major UK bank via CSV.",
    ],
    steps: [
      "Download a CSV of your transactions from your bank.",
      "Import it into The Income Tracker.",
      "Track income, spending and surplus, month by month.",
    ],
    sections: [
      {
        h: "Why no open banking?",
        p: [
          "Open banking is convenient, but it means handing a third party an ongoing window into your accounts. That is a real trade, and not everyone wants to make it. A CSV gives you the same insight with none of the exposure. You download the file, you import it, and nothing else touches your bank.",
        ],
      },
    ],
    exportNoteHtml: 'Not sure how to export a CSV? Pick your bank in the <a href="/import/">bank CSV guides</a>.',
    faqs: [
      { q: "Is there a budget app that does not use open banking?", a: "Yes. The Income Tracker never uses open banking. You import a CSV you download from your bank, so no third party connects to your accounts." },
      { q: "How does it get my transactions then?", a: "You download a CSV from your bank and import it. The app reads the dates, descriptions and amounts automatically." },
      { q: "Is it really free?", a: "Yes. No account, no subscription, no credit card." },
    ],
    related: ["budget-without-linking-bank", "import", "tools", "is-it-safe-to-upload-bank-statements"],
  },
  {
    slug: "spreadsheet-alternative-income-expense-tracker",
    card: "Spreadsheet alternative",
    cardD: "CSV in, totals out",
    crumb: "Spreadsheet alternative",
    title: "Spreadsheet alternative for tracking income and expenses (free)",
    description:
      "Tired of fiddly budgeting spreadsheets? The Income Tracker imports your bank CSV and does the formulas for you. Free, private, nothing to maintain.",
    h1: "A spreadsheet alternative for tracking income and expenses",
    tldr:
      "Love the control of a spreadsheet but hate maintaining one? The Income Tracker keeps the control and drops the busywork. Import your bank CSV and it builds the totals, categories and projections for you. Free.",
    why: [
      "No formulas to write or accidentally break.",
      "Import a bank CSV instead of typing every row.",
      "Categories, recurring items and totals built in.",
      "An annual projection without a single SUM().",
      "Your data stays in your browser.",
    ],
    steps: [
      "Download a CSV from your bank.",
      "Import it into The Income Tracker.",
      "Get a tidy monthly ledger and a yearly view, no formulas required.",
    ],
    sections: [
      {
        h: "When a spreadsheet still wins",
        p: [
          "Credit where it is due. If you want total custom control, odd one-off calculations or your own bespoke layout, a spreadsheet is hard to beat. For everyone else who just wants to see income, spending and surplus without the upkeep, a purpose-built tracker is faster and far less fragile.",
        ],
      },
    ],
    exportNoteHtml: 'New to CSV exports? Start with the <a href="/import/">bank CSV guides</a>.',
    faqs: [
      { q: "Is this better than a budgeting spreadsheet?", a: "For most people, yes. You get the same clear view of income and expenses without writing or fixing formulas. Power users who want total custom control may still prefer a sheet." },
      { q: "Can I import my bank CSV?", a: "Yes, that is the point. Import a CSV from any UK bank and the app builds the totals for you." },
      { q: "Does it cost anything?", a: "No. It is free, with no sign-up." },
    ],
    related: ["free-ynab-alternative-uk", "import", "tools", "monthly-surplus-calculator"],
  },
];

function landingPage(l) {
  const path = `/${l.slug}.html`;
  const title = `${l.title} · ${BRAND}`;
  const trail = [
    { name: "Home", path: "/" },
    { name: l.crumb, path },
  ];
  const why = `<h2>Why people pick it</h2>\n      <ul>\n${l.why.map((w) => `        <li>${esc(w)}</li>`).join("\n")}\n      </ul>`;
  const steps = `<h2>How it works</h2>\n      <ol class="steps">\n${l.steps.map((s) => `        <li>${esc(s)}</li>`).join("\n")}\n      </ol>`;
  const exportNote = l.exportNoteHtml ? `<p class="note">${l.exportNoteHtml}</p>` : "";
  const extra = l.sections ? `\n\n      ${renderSections(l.sections)}` : "";
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>${esc(l.h1)}</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>In short</strong><p>${esc(l.tldr)}</p></div>

      ${why}

      ${steps}
      ${exportNote}${extra}

      ${ctaHtml()}

      ${faqHtml(l.faqs)}

      ${relatedCards(l.related)}`;
  return {
    path,
    html: shell({
      title,
      description: l.description,
      path,
      jsonLd: [breadcrumbLd(trail), faqLd(l.faqs)],
      body,
    }),
  };
}

// ── Related index (built after all content arrays exist) ─────────────────────

const RELATED_INDEX = {
  import: { href: "/import/", t: "Bank CSV import guides", d: "Export from any UK bank" },
  tools: { href: "/tools/", t: "Free money calculators", d: "Payoff, utilisation, savings and more" },
  guides: { href: "/guides/", t: "Budgeting guides", d: "Private, free, no bank login" },
  app: { href: "/", t: "Open The Income Tracker", d: "Free, no account, no bank login" },
};
for (const b of BANKS) RELATED_INDEX[b.slug] = { href: `/import/${b.slug}.html`, t: `Export ${b.name} to CSV`, d: "Step-by-step guide" };
for (const g of GUIDES) RELATED_INDEX[g.slug] = { href: `/guides/${g.slug}.html`, t: g.h1, d: g.description };
for (const c of CALCULATORS) RELATED_INDEX[c.slug] = { href: `/tools/${c.slug}.html`, t: c.card, d: c.cardD };
for (const l of LANDINGS) RELATED_INDEX[l.slug] = { href: `/${l.slug}.html`, t: l.card, d: l.cardD };

// ── Hub pages ────────────────────────────────────────────────────────────────

function importHub() {
  const path = "/import/";
  const title = `Import your bank statement CSV: free UK budget tracker · ${BRAND}`;
  const description =
    "Step-by-step guides to export your transactions as a CSV from Barclays, HSBC, Monzo, Starling, Lloyds, NatWest, Santander and Revolut, then track them free with no bank login.";
  const trail = [
    { name: "Home", path: "/" },
    { name: "Bank CSV guides", path },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>Export your bank statement as a CSV</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>In short</strong><p>Pick your bank below for the exact steps to download your transactions as a CSV. Then import that file into ${BRAND} to track your income and spending. Free, no account, no bank login.</p></div>
      <p class="lede">${BRAND} reads standard CSV exports from UK banks automatically. No formatting, no open banking, no credentials shared. Just a file you download yourself.</p>
      <div class="grid">
${BANKS.map((b) => `        <a class="card" href="/import/${b.slug}.html"><span class="card-t">${esc(b.name)} &rarr; CSV</span><span class="card-d">How to export ${esc(b.name)} transactions</span></a>`).join("\n")}
      </div>
      ${ctaHtml()}`;
  return {
    path,
    html: shell({
      title,
      description,
      path,
      jsonLd: [
        breadcrumbLd(trail),
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "UK bank CSV export guides",
          itemListElement: BANKS.map((b, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `Export ${b.name} statement to CSV`,
            url: `${SITE}/import/${b.slug}.html`,
          })),
        },
      ],
      body,
    }),
  };
}

function guidesHub() {
  const path = "/guides/";
  const title = `Budgeting guides: private, free, no bank login · ${BRAND}`;
  const description =
    "Practical guides to budgeting without open banking: how to track spending from a bank CSV, free YNAB alternatives, and whether it is safe to upload a bank statement.";
  const trail = [
    { name: "Home", path: "/" },
    { name: "Guides", path },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>Budgeting guides</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <p class="lede">Straightforward guides for tracking your money privately. No open banking, no subscription, no jargon.</p>
      <div class="grid">
${GUIDES.map((g) => `        <a class="card" href="/guides/${g.slug}.html"><span class="card-t">${esc(g.h1)}</span><span class="card-d">${esc(g.description)}</span></a>`).join("\n")}
        <a class="card" href="/tools/"><span class="card-t">Free money calculators</span><span class="card-d">Payoff, utilisation, savings and more</span></a>
        <a class="card" href="/import/"><span class="card-t">Bank CSV import guides</span><span class="card-d">Export from any UK bank, step by step</span></a>
      </div>
      ${ctaHtml()}`;
  return {
    path,
    html: shell({ title, description, path, jsonLd: [breadcrumbLd(trail)], body }),
  };
}

function toolsHub() {
  const path = "/tools/";
  const title = `Free UK money calculators · ${BRAND}`;
  const description =
    "Free, instant UK money calculators: 0% credit card payoff, credit utilisation, savings goal timelines, monthly surplus and loan repayment. No sign-up.";
  const trail = [
    { name: "Home", path: "/" },
    { name: "Calculators", path },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>Free money calculators</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>In short</strong><p>Quick, free calculators for the money questions that actually come up. No sign-up, nothing stored. Pick one below.</p></div>
      <div class="grid">
${CALCULATORS.map((c) => `        <a class="card" href="/tools/${c.slug}.html"><span class="card-t">${esc(c.card)}</span><span class="card-d">${esc(c.cardD)}</span></a>`).join("\n")}
      </div>
      ${ctaHtml()}`;
  return {
    path,
    html: shell({
      title,
      description,
      path,
      jsonLd: [
        breadcrumbLd(trail),
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Free UK money calculators",
          itemListElement: CALCULATORS.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.title,
            url: `${SITE}/tools/${c.slug}.html`,
          })),
        },
      ],
      body,
    }),
  };
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

function sitemap(urls) {
  const entries = urls
    .map(
      (u) => `  <url>
    <loc>${SITE}${u.path}</loc>
    <lastmod>${UPDATED}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

// ── Build ──────────────────────────────────────────────────────────────────

async function emit(relPath, contents) {
  const full = join(PUBLIC, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents, "utf8");
  return relPath;
}

async function main() {
  const written = [];

  written.push(await emit("import/index.html", importHub().html));
  for (const b of BANKS) written.push(await emit(`import/${b.slug}.html`, bankPage(b).html));

  written.push(await emit("guides/index.html", guidesHub().html));
  for (const g of GUIDES) written.push(await emit(`guides/${g.slug}.html`, guidePage(g).html));

  written.push(await emit("tools/index.html", toolsHub().html));
  for (const c of CALCULATORS) written.push(await emit(`tools/${c.slug}.html`, calcPage(c).html));

  for (const l of LANDINGS) written.push(await emit(`${l.slug}.html`, landingPage(l).html));

  // Sitemap: home + existing legal pages + all generated content.
  const urls = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/tools/", changefreq: "monthly", priority: "0.8" },
    ...CALCULATORS.map((c) => ({ path: `/tools/${c.slug}.html`, changefreq: "monthly", priority: "0.7" })),
    { path: "/import/", changefreq: "monthly", priority: "0.8" },
    ...BANKS.map((b) => ({ path: `/import/${b.slug}.html`, changefreq: "monthly", priority: "0.7" })),
    ...LANDINGS.map((l) => ({ path: `/${l.slug}.html`, changefreq: "monthly", priority: "0.7" })),
    { path: "/guides/", changefreq: "monthly", priority: "0.7" },
    ...GUIDES.map((g) => ({ path: `/guides/${g.slug}.html`, changefreq: "monthly", priority: "0.6" })),
    { path: "/privacy.html", changefreq: "yearly", priority: "0.3" },
    { path: "/tos.html", changefreq: "yearly", priority: "0.3" },
  ];
  written.push(await emit("sitemap.xml", sitemap(urls)));

  console.log(`Generated ${written.length} files:`);
  for (const w of written) console.log(`  public/${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
