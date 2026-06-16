// Builds the static, crawlable SEO/GEO content pages for The Income Tracker.
//
// Why this exists: the app itself is a client-rendered Vite SPA, which crawlers
// and AI answer-engines index poorly. These pages are plain, server-free HTML
// served straight from /public, so Google, Bing and LLM crawlers (GPTBot,
// ClaudeBot, PerplexityBot, …) get fully-formed, answer-first content with
// structured data — the things that actually win long-tail rankings and AI
// citations for a brand-new, zero-authority domain.
//
// Strategy (see PR description): niche down on the angles the big budgeting apps
// structurally cannot own — "no bank login", "import your own bank CSV", and
// "private / local-first". Each bank page targets a real, low-competition,
// high-intent query ("how to export <bank> statement to CSV") and funnels to the
// app. The guides target the privacy / free-alternative intent that LLMs cite.
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
// the sitemap. Bump this when content is meaningfully revised — visible,
// recent dates are a strong freshness signal for both Google and Perplexity.
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
  .meta { color: #9ea8b7; font-size: 0.85rem; margin-bottom: 28px; }
  .lede { font-size: 1.12rem; color: #eaf2ff; line-height: 1.65; margin: 0 0 24px; }
  .tldr { background: rgba(0,223,193,0.07); border: 1px solid rgba(0,223,193,0.22); border-radius: 12px; padding: 16px 20px; margin: 0 0 32px; }
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
  .related { margin-top: 8px; }
  hr { border: none; border-top: 1px solid rgba(212,228,250,0.1); margin: 48px 0 24px; }
  footer { color: #9ea8b7; font-size: 0.85rem; }
  footer a { color: #9ea8b7; }
  footer a:hover { color: #00dfc1; }
`;

function shell({ title, description, path, jsonLd, body }) {
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
        <a href="/import/">Bank CSV guides</a> &nbsp;·&nbsp;
        <a href="/guides/">Guides</a> &nbsp;·&nbsp;
        <a href="/privacy.html">Privacy</a> &nbsp;·&nbsp;
        <a href="/tos.html">Terms</a>
      </footer>
    </div>
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

function ctaHtml(line = "Track it free — no account, no bank login") {
  return `<div class="cta">
  <div class="cta-text"><strong>${BRAND}</strong><span>${esc(line)}</span></div>
  <a class="btn" href="/">Open the tracker &rarr;</a>
</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank CSV import guides — one high-intent long-tail page per bank.
// `steps` are sourced from each bank's current export flow (June 2026).
// ─────────────────────────────────────────────────────────────────────────────

const BANKS = [
  {
    slug: "barclays-csv",
    name: "Barclays",
    where: "Online Banking on a desktop browser (not the Barclays app)",
    steps: [
      "Log in to Barclays Online Banking on a computer.",
      "Choose the account you want and click <em>Show recent transactions</em>.",
      "Scroll down and click <em>View all transactions</em>.",
      "Pick a start and end date, then click <em>Search</em>.",
      "Scroll to the bottom and click <em>Export all</em>, then choose <em>CSV (Excel)</em>.",
      "Save the file, then drop it into The Income Tracker.",
    ],
    note: "Barclays CSV export is only available on the desktop Online Banking site — the mobile app can't export CSV.",
  },
  {
    slug: "hsbc-csv",
    name: "HSBC UK",
    where: "Online Banking (desktop) — from the transactions list, not the PDF statement",
    steps: [
      "Log in to HSBC UK Online Banking on a computer (or in a mobile browser, not the app).",
      "Open the account you want to export.",
      "Go to the transactions / previous statements view for that account.",
      "Use the <em>Download</em> option and choose <em>CSV</em> (or Excel) as the format.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "HSBC's official monthly statements are PDF only. CSV comes from the transactions list and usually covers recent activity rather than a full statement period — export in chunks if you need more history.",
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
    note: "Monzo also offers PDF and QIF — pick CSV for the cleanest import.",
  },
  {
    slug: "starling-csv",
    name: "Starling Bank",
    where: "The Starling app or web banking",
    steps: [
      "Open the Starling app and go to the account you want.",
      "Tap the account name, then <em>Account</em> / <em>Account information</em>.",
      "Tap <em>Statements</em> (or <em>Export statement</em>).",
      "Choose your date range and select <em>CSV</em> as the format.",
      "Save the file and drop it into The Income Tracker.",
    ],
    note: "Starling lets you export specific date ranges as CSV — handy for filling one month at a time.",
  },
  {
    slug: "lloyds-csv",
    name: "Lloyds Bank",
    where: "Internet Banking on a computer (the Lloyds app can't export CSV)",
    steps: [
      "Log in to Lloyds Internet Banking on a computer.",
      "Open the account and find the <em>Statement options</em> box above the transactions.",
      "Click it and choose <em>Export transactions (CSV, QIF)</em>.",
      "Set your date range and choose <em>CSV</em>.",
      "The file downloads as <em>exportStatements-xx.csv</em> — import it into The Income Tracker.",
    ],
    note: "Lloyds caps each export at the last 12 months and 150 transactions. If you hit the cap, export again with a narrower date range and import each file.",
  },
  {
    slug: "natwest-csv",
    name: "NatWest",
    where: "Online Banking (desktop)",
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
    where: "Online Banking (desktop)",
    steps: [
      "Log in to Santander Online Banking on a computer.",
      "From <em>My accounts and transactions</em>, choose the account.",
      "Click <em>Download transactions</em> above the transactions table.",
      "In the <em>Download to</em> drop-down, choose <em>midata (CSV)</em>.",
      "Click <em>Download</em>, save the file, and import it into The Income Tracker.",
    ],
    note: "Santander's midata export covers up to 12 months and masks some sensitive details for security — that's normal and still imports fine.",
  },
  {
    slug: "revolut-csv",
    name: "Revolut",
    where: "The Revolut app or web app",
    steps: [
      "Open Revolut and go to <em>Accounts</em>.",
      "Tap <em>Statements</em> (under the account or in <em>Documents</em>).",
      "Choose your account/currency and date range.",
      "Select <em>Excel/CSV</em> as the format and generate it.",
      "Save the file and import it into The Income Tracker.",
    ],
    note: "Revolut's CSV can include multi-currency columns. If a file looks messy, export a single currency per file for the cleanest import.",
  },
];

function bankPage(bank) {
  const path = `/import/${bank.slug}.html`;
  const title = `How to export your ${bank.name} statement to CSV (free, 2026) · ${BRAND}`;
  const description = `Step-by-step: download your ${bank.name} transactions as a CSV file and track your income and spending free — no account and no bank login required.`;
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
      a: `Yes. The Income Tracker is local-first: your imported transactions are stored in your own browser and are never uploaded to a server unless you choose to sign in to sync across devices.`,
    },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>How to export your ${esc(bank.name)} statement to CSV</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>In short</strong><p>Log in to ${esc(bank.where)}, open the account, choose a date range and export the transactions as a <strong>CSV</strong> file. Then import that file into ${BRAND} to track your income and spending — free, with no bank login.</p></div>
      <p class="lede">A CSV is just a spreadsheet of your transactions. Once you have it, ${BRAND} reads the dates, descriptions and amounts automatically, so you can fill a whole month in seconds without typing anything in by hand.</p>

      <h2>Export ${esc(bank.name)} transactions as CSV, step by step</h2>
      <ol class="steps">
${bank.steps.map((s) => `        <li>${s}</li>`).join("\n")}
      </ol>
      <p class="note">${esc(bank.note)}</p>

      ${ctaHtml(`Import your ${bank.name} CSV — free, no account, no bank login`)}

      <h2>What happens after you import the CSV</h2>
      <p>Drop the file into ${BRAND} and you'll see every transaction laid out in a month-by-month ledger. Drag transactions into categories, mark recurring items, and watch your surplus update live. Money moved between your own accounts can be auto-skipped so transfers don't double-count.</p>

      ${faqHtml(faqs)}

      <h2>Other banks</h2>
      <div class="grid">
${BANKS.filter((b) => b.slug !== bank.slug)
  .map((b) => `        <a class="card" href="/import/${b.slug}.html"><span class="card-t">${esc(b.name)} &rarr; CSV</span><span class="card-d">Export ${esc(b.name)} transactions</span></a>`)
  .join("\n")}
      </div>`;
  return {
    path,
    title,
    description,
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
// Cornerstone guides — answer-first articles targeting privacy / free-alternative
// intent that LLMs and AI Overviews tend to cite.
// ─────────────────────────────────────────────────────────────────────────────

const GUIDES = [
  {
    slug: "budget-without-linking-bank",
    title: "How to budget without linking your bank account (2026)",
    description:
      "You don't need open banking to budget. Here's how to track your income and spending privately in 2026 using a bank CSV — no account connection, no credentials shared.",
    h1: "How to budget without linking your bank account",
    tldr:
      "You can budget without open banking by downloading a CSV of your transactions from your bank and importing it into a local-first tool like The Income Tracker. Nothing connects to your bank, no credentials are shared, and your data stays in your browser.",
    sections: [
      {
        h: "Why avoid linking your bank?",
        p: [
          "Most budgeting apps ask you to connect your bank through open banking (Plaid, TrueLayer and similar). That gives a third party ongoing read access to your accounts. Plenty of people are reasonably uncomfortable with that — they'd rather not hand a continuous feed of their finances to another company.",
          "The good news: you don't have to. Every UK bank lets you download your own transactions as a CSV file, and that's all a budgeting tool actually needs.",
        ],
      },
      {
        h: "The CSV method, in three steps",
        p: ["It takes about two minutes:"],
        ol: [
          "Download a CSV of your transactions from your bank's website or app.",
          "Import the CSV into The Income Tracker — it reads the dates, descriptions and amounts automatically.",
          "Categorise anything you like by dragging it, and watch your monthly surplus update live.",
        ],
      },
      {
        h: "Is this less convenient than open banking?",
        p: [
          "Slightly — you download a file once a month instead of it syncing automatically. In return you give up nothing: no third party can see your accounts, there's no connection to break or re-authorise, and it works across every bank you use. For most people that's a trade worth making.",
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
        a: "It's safer in the sense that no third party gets ongoing access to your accounts. You export the file yourself, and with a local-first tool like The Income Tracker the data stays in your own browser.",
      },
      {
        q: "Which UK banks let you export a CSV?",
        a: "All the major ones — Barclays, HSBC, Monzo, Starling, Lloyds, NatWest, Santander and Revolut among them. The Income Tracker has a step-by-step CSV guide for each.",
      },
    ],
    related: ["import", "is-it-safe-to-upload-bank-statements", "free-ynab-alternative-uk"],
  },
  {
    slug: "free-ynab-alternative-uk",
    title: "The best free YNAB alternative in the UK (no subscription)",
    description:
      "Looking for a free YNAB alternative in the UK? The Income Tracker is a free, no-subscription budgeting tool that imports your bank CSV — no account and no bank login needed.",
    h1: "A free YNAB alternative for the UK",
    tldr:
      "If you want YNAB's clarity without the subscription, The Income Tracker is a free, no-sign-up budgeting tool built for the UK. Import a CSV from any UK bank, track income and spending month by month, and keep your data private in your browser.",
    sections: [
      {
        h: "What people want from a YNAB alternative",
        p: [
          "YNAB is excellent, but it's a paid subscription and its method can feel heavy if you just want to see your income, spending and surplus clearly. The most common asks for an alternative are: free, no subscription, works in the UK, and ideally without linking your bank.",
        ],
      },
      {
        h: "How The Income Tracker compares",
        p: [
          "The Income Tracker is free with no account required. It's built around UK banks: download a CSV from Barclays, HSBC, Monzo, Starling and others and import it in seconds. You get a month-by-month ledger, drag-and-drop categories, recurring items, and an annual projection of your savings — no envelope system to learn.",
          "The trade-off is honest: it isn't a full zero-based budgeting system like YNAB, and it doesn't auto-sync via open banking. If you want a simple, private, free way to see where your money goes, that's exactly the point.",
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
        a: "No. The Income Tracker is completely free — no credit card, no subscription and no sign-up.",
      },
    ],
    related: ["import", "budget-without-linking-bank", "is-it-safe-to-upload-bank-statements"],
  },
  {
    slug: "is-it-safe-to-upload-bank-statements",
    title: "Is it safe to upload your bank statement to a budgeting app?",
    description:
      "Is it safe to upload a bank statement or CSV to a budgeting app? It depends entirely on where the data goes. Here's what to check — and how a local-first tool keeps it private.",
    h1: "Is it safe to upload your bank statement to a budgeting app?",
    tldr:
      "It depends on where your data goes. The safest option is a local-first tool that reads your CSV in your browser and never uploads it to a server — which is how The Income Tracker works. Avoid tools that send your statement to their servers without saying so.",
    sections: [
      {
        h: "The one question that matters",
        p: [
          "Before you upload a statement anywhere, ask: does this file leave my device? A budgeting tool can read a CSV in one of two ways. It can process it entirely in your browser, so the file never goes anywhere. Or it can upload it to a server, where it's processed and possibly stored.",
          "The first is private by design. The second means trusting a company with a complete record of your finances.",
        ],
      },
      {
        h: "What to check before uploading",
        ol: [
          "Does it say the file is processed locally / in your browser? (Local-first is safest.)",
          "If it uploads, does the privacy policy say what's stored and for how long?",
          "Does it require your bank login or open banking? (You shouldn't need to share credentials just to read a CSV.)",
        ],
      },
      {
        h: "How The Income Tracker handles it",
        p: [
          "The Income Tracker reads your CSV directly in your browser. Your transactions stay in local storage on your device and are never sent to a server — unless you explicitly sign in to sync across devices, which is your choice. There's no open-banking connection and you never share bank credentials.",
        ],
      },
    ],
    faqs: [
      {
        q: "Is it safe to upload a bank statement to a budgeting app?",
        a: "It's safe if the app processes the file locally in your browser and doesn't upload it to a server. The Income Tracker reads your CSV in your browser and keeps the data on your device.",
      },
      {
        q: "Can a budgeting app see my bank login?",
        a: "Only if you connect your bank via open banking. You don't need to — importing a CSV requires no credentials. The Income Tracker never asks for your bank login.",
      },
      {
        q: "Where does The Income Tracker store my data?",
        a: "In your own browser's local storage. Nothing is uploaded unless you choose to sign in to sync across devices.",
      },
    ],
    related: ["budget-without-linking-bank", "import", "free-ynab-alternative-uk"],
  },
];

const RELATED_INDEX = {
  import: { href: "/import/", t: "Bank CSV import guides", d: "Export from any UK bank" },
};
for (const g of GUIDES) RELATED_INDEX[g.slug] = { href: `/guides/${g.slug}.html`, t: g.title, d: g.description };

function guidePage(guide) {
  const path = `/guides/${guide.slug}.html`;
  const title = `${guide.title} · ${BRAND}`;
  const trail = [
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides/" },
    { name: guide.h1, path },
  ];
  const sectionsHtml = guide.sections
    .map((s) => {
      const parts = [`<h2>${esc(s.h)}</h2>`];
      for (const p of s.p || []) parts.push(`<p>${esc(p)}</p>`);
      if (s.ol) parts.push(`<ol class="steps">\n${s.ol.map((i) => `        <li>${esc(i)}</li>`).join("\n")}\n      </ol>`);
      return parts.join("\n      ");
    })
    .join("\n\n      ");
  const relatedHtml = `<h2>Related</h2>\n      <div class="grid">\n${guide.related
    .map((r) => RELATED_INDEX[r])
    .filter(Boolean)
    .map((r) => `        <a class="card" href="${r.href}"><span class="card-t">${esc(r.t)}</span><span class="card-d">${esc(r.d)}</span></a>`)
    .join("\n")}\n      </div>`;
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>${esc(guide.h1)}</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>The short answer</strong><p>${esc(guide.tldr)}</p></div>

      ${sectionsHtml}

      ${ctaHtml()}

      ${faqHtml(guide.faqs)}

      ${relatedHtml}`;
  return {
    path,
    title,
    description: guide.description,
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

// ── Hub pages ────────────────────────────────────────────────────────────────

function importHub() {
  const path = "/import/";
  const title = `Import your bank statement CSV — free UK budget tracker · ${BRAND}`;
  const description =
    "Step-by-step guides to export your transactions as a CSV from Barclays, HSBC, Monzo, Starling, Lloyds, NatWest, Santander and Revolut — then track them free with no bank login.";
  const trail = [
    { name: "Home", path: "/" },
    { name: "Bank CSV guides", path },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>Export your bank statement as a CSV</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <div class="tldr"><strong>In short</strong><p>Pick your bank below to see exactly how to download your transactions as a CSV. Then import that file into ${BRAND} to track your income and spending — free, no account, no bank login.</p></div>
      <p class="lede">${BRAND} reads standard CSV exports from UK banks automatically. No formatting, no open banking, no credentials shared — just a file you download yourself.</p>
      <div class="grid">
${BANKS.map((b) => `        <a class="card" href="/import/${b.slug}.html"><span class="card-t">${esc(b.name)} &rarr; CSV</span><span class="card-d">How to export ${esc(b.name)} transactions</span></a>`).join("\n")}
      </div>
      ${ctaHtml()}`;
  return {
    path,
    title,
    description,
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
  const title = `Budgeting guides — private, free, no bank login · ${BRAND}`;
  const description =
    "Practical guides to budgeting without open banking: how to track spending from a bank CSV, free YNAB alternatives, and whether it's safe to upload a bank statement.";
  const trail = [
    { name: "Home", path: "/" },
    { name: "Guides", path },
  ];
  const body = `      <header class="top">${breadcrumbHtml(trail)}</header>
      <h1>Budgeting guides</h1>
      <p class="meta">By ${BRAND} · Updated ${UPDATED_HUMAN}</p>
      <p class="lede">Straightforward guides for tracking your money privately — no open banking, no subscription, no jargon.</p>
      <div class="grid">
${GUIDES.map((g) => `        <a class="card" href="/guides/${g.slug}.html"><span class="card-t">${esc(g.h1)}</span><span class="card-d">${esc(g.description)}</span></a>`).join("\n")}
        <a class="card" href="/import/"><span class="card-t">Bank CSV import guides</span><span class="card-d">Export from any UK bank, step by step</span></a>
      </div>
      ${ctaHtml()}`;
  return {
    path,
    title,
    description,
    html: shell({ title, description, path, jsonLd: [breadcrumbLd(trail)], body }),
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

  const hubImport = importHub();
  written.push(await emit("import/index.html", hubImport.html));

  for (const b of BANKS) {
    const p = bankPage(b);
    written.push(await emit(`import/${b.slug}.html`, p.html));
  }

  const hubGuides = guidesHub();
  written.push(await emit("guides/index.html", hubGuides.html));

  for (const g of GUIDES) {
    const p = guidePage(g);
    written.push(await emit(`guides/${g.slug}.html`, p.html));
  }

  // Sitemap: home + existing legal pages + all generated content.
  const urls = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/import/", changefreq: "monthly", priority: "0.8" },
    ...BANKS.map((b) => ({ path: `/import/${b.slug}.html`, changefreq: "monthly", priority: "0.7" })),
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
