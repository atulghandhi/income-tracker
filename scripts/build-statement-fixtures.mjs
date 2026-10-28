// Builds the synthetic PDF bank statements used by the PDF importer tests.
//
// Four UK banks, each with a different transaction layout, so the parser is
// exercised on four different problems rather than one layout four times:
//
//   Barclays  – "Money out £ / Money in £ / Balance £" columns, dates as "15 Dec"
//               with no year (the year comes from the statement period, which
//               crosses a year end), "Ref:" and "On 14 Dec" continuation lines,
//               Start/End balance rows, two pages with a repeated header.
//   HSBC      – "Payment type and details" with a code column (DD, VIS, CR, SO,
//               ATM, BP, ")))"), "dd Mon yy" dates shown only on the first entry
//               of each day, the balance only on the last entry of each day,
//               BALANCE BROUGHT/CARRIED FORWARD rows, multi-line details.
//   Monzo     – a single signed "Amount (GBP)" column plus "Balance (GBP)",
//               dd/mm/yyyy dates, reference/notes on a second line, and a
//               summary block above the table that must not be read as rows.
//
//   NatWest   – "Paid in / Withdrawn / Balance" columns, "28 AUG" dates printed
//               once per day, and transactions that take one, two or three rows
//               depending on how much the bank has to say: the figures always sit
//               on the last row, the type and payee on the first ("Automated
//               Credit MANGOPAY S.A. MGP VINTED FP 28/08/26 12"), any further
//               reference text in between. Three pages, header repeated on each.
//
// Two more files cover the unsupported paths: a letter with no transaction
// table, and a "scanned" page with no text at all.
//
// The PDF syntax is written by hand (text, rules and filled rectangles only)
// so the repo does not need a PDF library just to regenerate fixtures, and the
// output is byte-for-byte reproducible: no timestamps, no random ids.
//
// Run: `node scripts/build-statement-fixtures.mjs` → tests/fixtures/statements/

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "tests", "fixtures", "statements");

// ─── A tiny PDF writer ───────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;

// Helvetica / Helvetica-Bold advance widths (AFM, per 1000 em) for the printable
// ASCII range 0x20–0x7E, followed by a few WinAnsi extras used in statements.
const ASCII_WIDTHS = {
  regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
};
const EXTRA_GLYPHS = {
  "£": { code: 0xa3, regular: 556, bold: 556 },
  "–": { code: 0x96, regular: 556, bold: 556 },
  "—": { code: 0x97, regular: 1000, bold: 1000 },
  "’": { code: 0x92, regular: 222, bold: 278 },
  "‘": { code: 0x91, regular: 222, bold: 278 },
  "•": { code: 0x95, regular: 350, bold: 350 },
  "©": { code: 0xa9, regular: 737, bold: 737 },
};

function textWidth(text, size, font) {
  let total = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) total += ASCII_WIDTHS[font][code - 0x20];
    else if (EXTRA_GLYPHS[char]) total += EXTRA_GLYPHS[char][font];
    else total += 556;
  }
  return (total * size) / 1000;
}

// WinAnsi-encoded, escaped PDF string literal.
function pdfString(text) {
  const bytes = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    const byte = code >= 0x20 && code <= 0x7e ? code : EXTRA_GLYPHS[char]?.code ?? 0x3f;
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) bytes.push(0x5c);
    bytes.push(byte);
  }
  return `(${Buffer.from(bytes).toString("latin1")})`;
}

const num = (value) => (Math.round(value * 100) / 100).toString();

class Page {
  constructor() {
    this.ops = [];
  }

  // Draws a run of text. `align` positions the string relative to x.
  text(x, y, value, { size = 9, font = "regular", align = "left", color = "0 0 0" } = {}) {
    const width = textWidth(value, size, font);
    const startX = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
    this.ops.push(`BT ${color} rg /${font === "bold" ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${num(startX)} ${num(y)} Tm ${pdfString(value)} Tj ET`);
    return width;
  }

  rule(x1, y1, x2, y2, { width = 0.5, color = "0 0 0" } = {}) {
    this.ops.push(`${color} RG ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  rect(x, y, width, height, color = "0.9 0.9 0.9") {
    this.ops.push(`${color} rg ${num(x)} ${num(y)} ${num(width)} ${num(height)} re f`);
  }

  content() {
    return Buffer.from(this.ops.join("\n"), "latin1");
  }
}

class Document {
  constructor(title) {
    this.title = title;
    this.pages = [];
  }

  addPage() {
    const page = new Page();
    this.pages.push(page);
    return page;
  }

  toBuffer() {
    const objects = [];
    const add = (body) => {
      objects.push(body);
      return objects.length; // 1-based object number
    };

    const catalog = add(null); // filled in once the page tree exists
    const pagesRef = add(null);
    const resources = add(null);
    const regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objects[resources - 1] = `<< /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >>`;

    const pageRefs = [];
    for (const page of this.pages) {
      const stream = page.content();
      const contents = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "latin1"), stream, Buffer.from("\nendstream", "latin1")]));
      pageRefs.push(
        add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} 0 R /Contents ${contents} 0 R >>`),
      );
    }
    objects[pagesRef - 1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
    const info = add(`<< /Title ${pdfString(this.title)} /Producer (The Income Tracker fixture builder) >>`);

    const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets = [];
    let length = chunks[0].length;
    objects.forEach((body, index) => {
      offsets.push(length);
      const head = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
      const tail = Buffer.from("\nendobj\n", "latin1");
      const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1");
      chunks.push(head, bodyBuffer, tail);
      length += head.length + bodyBuffer.length + tail.length;
    });

    const xrefOffset = length;
    const xref = [`xref`, `0 ${objects.length + 1}`, `0000000000 65535 f `];
    for (const offset of offsets) xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    chunks.push(Buffer.from(`${xref.join("\n")}\n${trailer}`, "latin1"));
    return Buffer.concat(chunks);
  }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const money = (value) =>
  Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedMoney = (value) => (value < 0 ? `-${money(value)}` : money(value));
const round = (value) => Math.round(value * 100) / 100;

// Runs a balance through a list of { out, in } rows and returns each row's closing balance.
function runBalances(opening, rows) {
  let balance = opening;
  return rows.map((row) => {
    balance = round(balance + (row.in ?? 0) - (row.out ?? 0));
    return balance;
  });
}

const GREY = "0.45 0.45 0.45";
const LIGHT_RULE = "0.8 0.8 0.8";

// ─── Barclays ────────────────────────────────────────────────────────────────
// Statement period 13 December 2025 to 12 January 2026: dates carry no year, so
// "15 Dec" must resolve to 2025 and "2 Jan" to 2026.

const BARCLAYS_OPENING = 1234.56;
const BARCLAYS_ROWS = [
  { date: "15 Dec", lines: ["Direct Debit to British Gas", "Ref: 601234567890"], out: 85.0 },
  { date: "15 Dec", lines: ["Card Payment to Tesco Stores 2423", "On 14 Dec"], out: 23.5 },
  { date: "16 Dec", lines: ["Card Payment to TfL Travel Charge", "On 15 Dec"], out: 8.2 },
  { date: "18 Dec", lines: ["Received From Acme Ltd", "Ref: Salary Dec 25"], in: 2500.0 },
  { date: "18 Dec", lines: ["Standing Order to Mr J Smith", "Ref: Savings"], out: 200.0 },
  { date: "19 Dec", lines: ["Card Payment to Sainsburys S/Mkts", "On 19 Dec"], out: 46.12 },
  { date: "22 Dec", lines: ["Direct Debit to Netflix.com", "Ref: 8837361"], out: 10.99 },
  { date: "23 Dec", lines: ["Card Payment to Amazon.co.uk", "On 22 Dec"], out: 34.99 },
  { date: "24 Dec", lines: ["Card Payment to Pret A Manger", "On 24 Dec"], out: 6.45 },
  { date: "29 Dec", lines: ["Refund From Amazon.co.uk"], in: 34.99 },
  { date: "2 Jan", lines: ["Direct Debit to Thames Water", "Ref: 1122334455"], out: 32.0 },
  { date: "2 Jan", lines: ["Standing Order to Hometown Lettings", "Ref: Rent Flat 4"], out: 950.0 },
  { date: "5 Jan", lines: ["Card Payment to Costa Coffee", "On 4 Jan"], out: 4.35 },
  { date: "6 Jan", lines: ["Cash Withdrawal at Barclays Bank Kings Cross"], out: 50.0 },
  { date: "8 Jan", lines: ["Payment to Barclaycard", "Ref: Card Payment"], out: 120.0 },
  { date: "9 Jan", lines: ["Card Payment to Uber *Trip", "On 9 Jan"], out: 14.8 },
  { date: "12 Jan", lines: ["Interest Paid"], in: 0.42 },
];

function buildBarclays() {
  const doc = new Document("Barclays Bank Account statement");
  const balances = runBalances(BARCLAYS_OPENING, BARCLAYS_ROWS);
  const totalIn = round(BARCLAYS_ROWS.reduce((sum, row) => sum + (row.in ?? 0), 0));
  const totalOut = round(BARCLAYS_ROWS.reduce((sum, row) => sum + (row.out ?? 0), 0));
  const closing = balances[balances.length - 1];
  const pageCount = 2;

  const columns = { date: 40, description: 92, out: 430, in: 492, balance: 555 };

  function header(page, pageNumber) {
    page.rect(40, PAGE_HEIGHT - 66, 92, 24, "0 0.682 0.937");
    page.text(46, PAGE_HEIGHT - 58, "BARCLAYS", { size: 12, font: "bold", color: "1 1 1" });
    page.text(555, PAGE_HEIGHT - 48, "Barclays Bank UK PLC", { align: "right", size: 8, color: GREY });
    page.text(555, PAGE_HEIGHT - 59, "Leicester LE87 2BB", { align: "right", size: 8, color: GREY });
    page.text(555, PAGE_HEIGHT - 70, "barclays.co.uk  |  0345 734 5345", { align: "right", size: 8, color: GREY });
    if (pageNumber === 1) {
      let y = PAGE_HEIGHT - 96;
      for (const line of ["MR JOHN SMITH", "12 EXAMPLE ROAD", "LONDON", "N1 1AA"]) {
        page.text(40, y, line, { size: 9 });
        y -= 11;
      }
      page.text(40, PAGE_HEIGHT - 160, "Your Barclays Bank Account statement", { size: 16, font: "bold" });
      const details = [
        ["Statement date", "12 January 2026"],
        ["Statement period", "13 December 2025 to 12 January 2026"],
        ["Statement number", "112"],
        ["Sort code", "20-12-34"],
        ["Account number", "12345678"],
      ];
      y = PAGE_HEIGHT - 184;
      for (const [label, value] of details) {
        page.text(40, y, label, { size: 9, color: GREY });
        page.text(150, y, value, { size: 9 });
        y -= 12;
      }
      page.text(40, PAGE_HEIGHT - 258, "At a glance", { size: 11, font: "bold" });
      const glance = [
        ["Start balance", `£${money(BARCLAYS_OPENING)}`],
        ["Money in", `£${money(totalIn)}`],
        ["Money out", `£${money(totalOut)}`],
        ["End balance", `£${money(closing)}`],
      ];
      glance.forEach(([label, value], index) => {
        const x = 40 + index * 130;
        page.text(x, PAGE_HEIGHT - 276, label, { size: 8, color: GREY });
        page.text(x, PAGE_HEIGHT - 290, value, { size: 11, font: "bold" });
      });
    }
  }

  function tableHeader(page, y, title) {
    page.text(40, y, title, { size: 11, font: "bold" });
    y -= 18;
    page.text(columns.date, y, "Date", { size: 8, font: "bold" });
    page.text(columns.description, y, "Description", { size: 8, font: "bold" });
    page.text(columns.out, y, "Money out £", { size: 8, font: "bold", align: "right" });
    page.text(columns.in, y, "Money in £", { size: 8, font: "bold", align: "right" });
    page.text(columns.balance, y, "Balance £", { size: 8, font: "bold", align: "right" });
    page.rule(40, y - 4, 555, y - 4);
    return y - 16;
  }

  function footer(page, pageNumber, continued) {
    if (continued) page.text(555, 78, "Continued on next page", { size: 8, align: "right", color: GREY });
    page.rule(40, 66, 555, 66, { color: LIGHT_RULE });
    page.text(
      40,
      54,
      "Barclays Bank UK PLC. Authorised by the Prudential Regulation Authority and regulated by the Financial Conduct Authority and the",
      { size: 6.5, color: GREY },
    );
    page.text(
      40,
      45,
      "Prudential Regulation Authority (Financial Services Register No. 759676). Registered in England. Registered No. 9740322.",
      { size: 6.5, color: GREY },
    );
    page.text(40, 36, "Registered Office: 1 Churchill Place, London E14 5HP.", { size: 6.5, color: GREY });
    page.text(555, 36, `Page ${pageNumber} of ${pageCount}`, { size: 8, align: "right" });
  }

  const firstPageRows = 10;
  let page = doc.addPage();
  header(page, 1);
  let y = tableHeader(page, PAGE_HEIGHT - 322, "Your transactions");
  page.text(columns.description, y, "Start balance", { size: 9 });
  page.text(columns.balance, y, money(BARCLAYS_OPENING), { size: 9, align: "right" });
  y -= 14;

  BARCLAYS_ROWS.forEach((row, index) => {
    if (index === firstPageRows) {
      footer(page, 1, true);
      page = doc.addPage();
      header(page, 2);
      y = tableHeader(page, PAGE_HEIGHT - 96, "Your transactions continued");
    }
    page.rule(40, y + 10, 555, y + 10, { color: LIGHT_RULE, width: 0.3 });
    page.text(columns.date, y, row.date, { size: 9 });
    page.text(columns.description, y, row.lines[0], { size: 9 });
    if (row.out) page.text(columns.out, y, money(row.out), { size: 9, align: "right" });
    if (row.in) page.text(columns.in, y, money(row.in), { size: 9, align: "right" });
    page.text(columns.balance, y, money(balances[index]), { size: 9, align: "right" });
    y -= 12;
    for (const extra of row.lines.slice(1)) {
      page.text(columns.description, y, extra, { size: 8, color: GREY });
      y -= 11;
    }
    y -= 4;
  });

  page.rule(40, y + 10, 555, y + 10, { color: LIGHT_RULE, width: 0.3 });
  page.text(columns.description, y, "End balance", { size: 9, font: "bold" });
  page.text(columns.balance, y, money(closing), { size: 9, font: "bold", align: "right" });
  footer(page, 2, false);
  return doc;
}

// ─── HSBC ────────────────────────────────────────────────────────────────────

const HSBC_OPENING = 1234.56;
const HSBC_ROWS = [
  { date: "02 Jan 26", code: "DD", lines: ["BRITISH GAS"], out: 85.0 },
  { date: "02 Jan 26", code: "VIS", lines: ["TESCO STORES 2423", "LONDON"], out: 23.5 },
  { date: "03 Jan 26", code: ")))", lines: ["PRET A MANGER", "LONDON"], out: 6.45 },
  { date: "05 Jan 26", code: "CR", lines: ["ACME LTD", "SALARY JAN 26"], in: 2500.0 },
  { date: "06 Jan 26", code: "SO", lines: ["J SMITH SAVINGS"], out: 200.0 },
  { date: "06 Jan 26", code: "DD", lines: ["VODAFONE LTD"], out: 28.0 },
  { date: "08 Jan 26", code: "ATM", lines: ["HSBC KINGS CROSS", "LONDON"], out: 50.0 },
  { date: "10 Jan 26", code: "VIS", lines: ["SAINSBURYS S/MKTS", "LONDON"], out: 46.12 },
  { date: "10 Jan 26", code: "VIS", lines: ["AMAZON.CO.UK", "AMAZON.CO.UK"], out: 34.99 },
  { date: "12 Jan 26", code: "BP", lines: ["JANE DOE", "DINNER"], out: 25.0 },
  { date: "15 Jan 26", code: "CR", lines: ["AMAZON.CO.UK", "REFUND"], in: 34.99 },
  { date: "20 Jan 26", code: "DD", lines: ["LB CAMDEN", "COUNCIL TAX"], out: 145.0 },
  { date: "22 Jan 26", code: "VIS", lines: ["TFL TRAVEL CH", "TFL.GOV.UK/CP"], out: 8.2 },
  { date: "22 Jan 26", code: "VIS", lines: ["UBER *TRIP", "HELP.UBER.COM"], out: 14.8 },
  { date: "26 Jan 26", code: "BP", lines: ["BARCLAYCARD", "CARD PAYMENT"], out: 120.0 },
  { date: "28 Jan 26", code: "DD", lines: ["NETFLIX.COM"], out: 10.99 },
];

function buildHsbc() {
  const doc = new Document("HSBC Bank Account statement");
  const balances = runBalances(HSBC_OPENING, HSBC_ROWS);
  const totalIn = round(HSBC_ROWS.reduce((sum, row) => sum + (row.in ?? 0), 0));
  const totalOut = round(HSBC_ROWS.reduce((sum, row) => sum + (row.out ?? 0), 0));
  const closing = balances[balances.length - 1];
  const columns = { date: 40, code: 96, details: 126, out: 405, in: 478, balance: 555 };

  const page = doc.addPage();
  page.rect(40, PAGE_HEIGHT - 64, 58, 22, "0.859 0 0.067");
  page.text(46, PAGE_HEIGHT - 57, "HSBC", { size: 12, font: "bold", color: "1 1 1" });
  page.text(104, PAGE_HEIGHT - 57, "UK", { size: 12, font: "bold" });

  let y = PAGE_HEIGHT - 96;
  for (const line of ["MR JOHN SMITH", "12 EXAMPLE ROAD", "LONDON", "N1 1AA"]) {
    page.text(40, y, line, { size: 9 });
    y -= 11;
  }

  page.text(555, PAGE_HEIGHT - 48, "Contact tel 03457 404 404", { size: 8, align: "right", color: GREY });
  page.text(555, PAGE_HEIGHT - 59, "Text phone 03457 125 563", { size: 8, align: "right", color: GREY });
  page.text(555, PAGE_HEIGHT - 70, "www.hsbc.co.uk", { size: 8, align: "right", color: GREY });
  page.text(555, PAGE_HEIGHT - 96, "Your Statement", { size: 14, font: "bold", align: "right" });
  const details = [
    ["Account Name", "Mr John Smith"],
    ["Sortcode", "40-12-34"],
    ["Account Number", "12345678"],
    ["Sheet Number", "112"],
  ];
  y = PAGE_HEIGHT - 116;
  for (const [label, value] of details) {
    page.text(430, y, label, { size: 8, color: GREY });
    page.text(555, y, value, { size: 9, align: "right" });
    y -= 12;
  }
  page.text(555, PAGE_HEIGHT - 172, "2 January to 31 January 2026", { size: 9, font: "bold", align: "right" });

  page.text(40, PAGE_HEIGHT - 206, "Your Bank Account details", { size: 11, font: "bold" });
  page.rule(40, PAGE_HEIGHT - 212, 555, PAGE_HEIGHT - 212);
  const summary = [
    ["Opening Balance", money(HSBC_OPENING)],
    ["Payments In", money(totalIn)],
    ["Payments Out", money(totalOut)],
    ["Closing Balance", money(closing)],
  ];
  y = PAGE_HEIGHT - 228;
  for (const [label, value] of summary) {
    page.text(40, y, label, { size: 9 });
    page.text(260, y, value, { size: 9, align: "right" });
    y -= 12;
  }

  y = PAGE_HEIGHT - 300;
  page.text(40, y, "Your Bank Account Transactions", { size: 11, font: "bold" });
  y -= 18;
  page.text(columns.date, y, "Date", { size: 8, font: "bold" });
  page.text(columns.code, y, "Payment type and details", { size: 8, font: "bold" });
  page.text(columns.out, y, "Paid out", { size: 8, font: "bold", align: "right" });
  page.text(columns.in, y, "Paid in", { size: 8, font: "bold", align: "right" });
  page.text(columns.balance, y, "Balance", { size: 8, font: "bold", align: "right" });
  page.rule(40, y - 4, 555, y - 4);
  y -= 16;

  page.text(columns.details, y, "BALANCE BROUGHT FORWARD", { size: 9 });
  page.text(columns.balance, y, money(HSBC_OPENING), { size: 9, align: "right" });
  y -= 13;

  HSBC_ROWS.forEach((row, index) => {
    const firstOfDay = index === 0 || HSBC_ROWS[index - 1].date !== row.date;
    const lastOfDay = index === HSBC_ROWS.length - 1 || HSBC_ROWS[index + 1].date !== row.date;
    if (firstOfDay) page.text(columns.date, y, row.date, { size: 9 });
    page.text(columns.code, y, row.code, { size: 9 });
    page.text(columns.details, y, row.lines[0], { size: 9 });
    if (row.out) page.text(columns.out, y, money(row.out), { size: 9, align: "right" });
    if (row.in) page.text(columns.in, y, money(row.in), { size: 9, align: "right" });
    if (lastOfDay) page.text(columns.balance, y, money(balances[index]), { size: 9, align: "right" });
    y -= 11;
    for (const extra of row.lines.slice(1)) {
      page.text(columns.details, y, extra, { size: 9 });
      y -= 11;
    }
    y -= 2;
  });

  page.text(columns.details, y, "BALANCE CARRIED FORWARD", { size: 9 });
  page.text(columns.balance, y, money(closing), { size: 9, align: "right" });

  page.rule(40, 70, 555, 70, { color: LIGHT_RULE });
  page.text(40, 58, "HSBC UK Bank plc. Registered in England and Wales with number 09928412. Registered Office: 1 Centenary Square, Birmingham, B1 1HQ.", {
    size: 6.5,
    color: GREY,
  });
  page.text(40, 49, "Authorised by the Prudential Regulation Authority and regulated by the Financial Conduct Authority and the Prudential Regulation Authority.", {
    size: 6.5,
    color: GREY,
  });
  page.text(40, 40, "Information about the Financial Services Compensation Scheme can be found at www.fscs.org.uk", { size: 6.5, color: GREY });
  page.text(555, 40, "Sheet 112", { size: 8, align: "right" });
  return doc;
}

// ─── Monzo ───────────────────────────────────────────────────────────────────

const MONZO_OPENING = 1234.56;
const MONZO_ROWS = [
  { date: "02/01/2026", lines: ["British Gas", "Direct Debit"], amount: -85.0 },
  { date: "02/01/2026", lines: ["Tesco"], amount: -23.5 },
  { date: "03/01/2026", lines: ["Pret A Manger"], amount: -6.45 },
  { date: "05/01/2026", lines: ["ACME LTD", "Faster Payment: SALARY JAN 26"], amount: 2500.0 },
  { date: "06/01/2026", lines: ["Savings Pot", "Pot transfer"], amount: -200.0 },
  { date: "06/01/2026", lines: ["Vodafone", "Direct Debit"], amount: -28.0 },
  { date: "08/01/2026", lines: ["ATM Kings Cross", "Cash withdrawal"], amount: -50.0 },
  { date: "10/01/2026", lines: ["Sainsbury’s"], amount: -46.12 },
  { date: "10/01/2026", lines: ["Amazon"], amount: -34.99 },
  { date: "12/01/2026", lines: ["Jane Doe", "Faster Payment: DINNER"], amount: -25.0 },
  { date: "15/01/2026", lines: ["Amazon", "Refund"], amount: 34.99 },
  { date: "20/01/2026", lines: ["London Borough of Camden", "Direct Debit: COUNCIL TAX"], amount: -145.0 },
  { date: "22/01/2026", lines: ["TfL"], amount: -8.2 },
  { date: "22/01/2026", lines: ["Uber"], amount: -14.8 },
  { date: "26/01/2026", lines: ["Barclaycard", "Faster Payment: CARD PAYMENT"], amount: -120.0 },
  { date: "28/01/2026", lines: ["Netflix", "Direct Debit"], amount: -10.99 },
];

function buildMonzo() {
  const doc = new Document("Monzo statement");
  const balances = runBalances(
    MONZO_OPENING,
    MONZO_ROWS.map((row) => (row.amount < 0 ? { out: -row.amount } : { in: row.amount })),
  );
  const deposits = round(MONZO_ROWS.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0));
  const withdrawals = round(MONZO_ROWS.filter((row) => row.amount < 0).reduce((sum, row) => sum - row.amount, 0));
  const closing = balances[balances.length - 1];
  const columns = { date: 40, description: 112, amount: 462, balance: 555 };

  const page = doc.addPage();
  page.rect(40, PAGE_HEIGHT - 66, 64, 24, "1 0.31 0.35");
  page.text(47, PAGE_HEIGHT - 58, "monzo", { size: 13, font: "bold", color: "1 1 1" });
  page.text(40, PAGE_HEIGHT - 100, "Statement", { size: 18, font: "bold" });
  page.text(40, PAGE_HEIGHT - 116, "Personal Account", { size: 10, color: GREY });

  let y = PAGE_HEIGHT - 142;
  for (const line of ["Mr John Smith", "12 Example Road", "London", "N1 1AA"]) {
    page.text(40, y, line, { size: 9 });
    y -= 11;
  }
  const details = [
    ["Account number", "12345678"],
    ["Sort code", "04-00-04"],
    ["IBAN", "GB29 MONZ 0400 0412 3456 78"],
    ["BIC", "MONZGB2L"],
  ];
  y = PAGE_HEIGHT - 142;
  for (const [label, value] of details) {
    page.text(330, y, label, { size: 9, color: GREY });
    page.text(555, y, value, { size: 9, align: "right" });
    y -= 11;
  }

  page.text(40, PAGE_HEIGHT - 206, "01/01/2026 – 31/01/2026", { size: 10, font: "bold" });
  const summary = [
    ["Balance on 01/01/2026", `£${money(MONZO_OPENING)}`],
    ["Total deposits", `£${money(deposits)}`],
    ["Total withdrawals", `£${money(withdrawals)}`],
    ["Balance on 31/01/2026", `£${money(closing)}`],
  ];
  y = PAGE_HEIGHT - 226;
  for (const [label, value] of summary) {
    page.text(40, y, label, { size: 9, color: GREY });
    page.text(300, y, value, { size: 9, align: "right" });
    y -= 12;
  }

  y = PAGE_HEIGHT - 296;
  page.text(columns.date, y, "Date", { size: 8, font: "bold" });
  page.text(columns.description, y, "Description", { size: 8, font: "bold" });
  page.text(columns.amount, y, "Amount (GBP)", { size: 8, font: "bold", align: "right" });
  page.text(columns.balance, y, "Balance (GBP)", { size: 8, font: "bold", align: "right" });
  page.rule(40, y - 5, 555, y - 5);
  y -= 18;

  MONZO_ROWS.forEach((row, index) => {
    page.text(columns.date, y, row.date, { size: 9 });
    page.text(columns.description, y, row.lines[0], { size: 9 });
    page.text(columns.amount, y, signedMoney(row.amount), { size: 9, align: "right" });
    page.text(columns.balance, y, money(balances[index]), { size: 9, align: "right" });
    y -= 11;
    for (const extra of row.lines.slice(1)) {
      page.text(columns.description, y, extra, { size: 8, color: GREY });
      y -= 10;
    }
    page.rule(40, y + 4, 555, y + 4, { color: LIGHT_RULE, width: 0.3 });
    y -= 6;
  });

  page.rule(40, 70, 555, 70, { color: LIGHT_RULE });
  page.text(
    40,
    58,
    "Monzo Bank Limited is a company registered in England and Wales (No. 09446231). Monzo Bank Limited is authorised by the Prudential",
    { size: 6.5, color: GREY },
  );
  page.text(
    40,
    49,
    "Regulation Authority (PRA) and regulated by the Financial Conduct Authority and the PRA. Our Financial Services Register number is 730427.",
    { size: 6.5, color: GREY },
  );
  page.text(40, 40, "Our address is Broadwalk House, 5 Appold Street, London EC2A 2AG.", { size: 6.5, color: GREY });
  page.text(555, 40, "Page 1 of 1", { size: 8, align: "right" });
  return doc;
}

// ─── NatWest ─────────────────────────────────────────────────────────────────
// Statement period 28 July to 27 August 2026. The date is printed only on the
// first transaction of each day. A transaction's figures sit on its last line:
// one-line rows carry them beside the description, two-line rows put the
// description on the first line and the tail of the reference on the second.

const NATWEST_OPENING = 1234.56;
const NATWEST_ROWS = [
  { date: "29 JUL", lines: ["Direct Debit BRITISH GAS 601234567890 DDR"], out: 85.0 },
  { date: "29 JUL", lines: ["4332 28JUL26 CD , TESCO STORES 2423 , LONDON GB CPM"], out: 23.5 },
  { date: "31 JUL", lines: ["Automated Credit ACME LTD SALARY JUL 26 BGC"], in: 2500.0 },
  { date: "31 JUL", lines: ["Standing Order MR J SMITH SAVINGS STO"], out: 200.0 },
  { date: "03 AUG", lines: ["Direct Debit VODAFONE LTD DDR"], out: 28.0 },
  { date: "05 AUG", lines: ["Cash Withdrawal NATWEST KINGS CROSS ATM 05AUG26 CSH"], out: 50.0 },
  { date: "07 AUG", lines: ["Automated Debit JANE DOE DINNER FP 07/08/26 18", "98765432109876543210 FPO"], out: 25.0 },
  { date: "07 AUG", lines: ["4332 06AUG26 CD , SAINSBURYS S/MKTS , LONDON GB CPM"], out: 46.12 },
  { date: "10 AUG", lines: ["4332 09AUG26 CD , AMAZON.CO.UK , AMAZON.CO.UK GB CPM"], out: 34.99 },
  { date: "12 AUG", lines: ["Automated Debit ROBINHOOD EUROPE UAB", "ROBINHOOD TOP UP FP 12/08/26 10", "11223344556677889900 FPO"], out: 100.0 },
  { date: "12 AUG", lines: ["Automated Credit ROBINHOOD EUROPE UAB", "ROBINHOOD WITHDRAWAL FP 12/08/26 16", "99887766554433221100 BGC"], in: 40.0 },
  { date: "14 AUG", lines: ["Direct Debit LB CAMDEN COUNCIL TAX DDR"], out: 145.0 },
  { date: "15 AUG", lines: ["Automated Credit AMAZON.CO.UK REFUND FP 15/08/26 11", "55555555555555555555 BGC"], in: 34.99 },
  { date: "18 AUG", lines: ["4332 17AUG26 CD , TFL TRAVEL CH , TFL.GOV.UK/CP GB CPM"], out: 8.2 },
  { date: "18 AUG", lines: ["4332 17AUG26 CD , UBER *TRIP , HELP.UBER.COM GB CPM"], out: 14.8 },
  { date: "20 AUG", lines: ["Automated Debit BARCLAYCARD CARD PAYMENT FP 20/08/26 10", "13579135791357913579 FPO"], out: 120.0 },
  { date: "24 AUG", lines: ["Direct Debit NETFLIX.COM DDR"], out: 10.99 },
  { date: "28 AUG", lines: ["Automated Credit MANGOPAY S.A. MGP VINTED FP 28/08/26 12", "34567890123456789012 BGC"], in: 12.5 },
  { date: "28 AUG", lines: ["Automated Credit MANGOPAY S.A. MGP VINTED FP 28/08/26 14", "34567890123456789099 BGC"], in: 8.0 },
  { date: "28 AUG", lines: ["Automated Debit HOMETOWN LETTINGS RENT FLAT 4 FP 28/08/26 07", "24681357924681357924 FPO"], out: 950.0 },
  { date: "28 AUG", lines: ["4332 27AUG26 CD , PRET A MANGER , LONDON GB CPM"], out: 6.45 },
];

function buildNatwest() {
  const doc = new Document("NatWest Select Account statement");
  const balances = runBalances(NATWEST_OPENING, NATWEST_ROWS);
  const closing = balances[balances.length - 1];
  const pageCount = 3;
  const columns = { date: 40, description: 92, in: 420, out: 488, balance: 555 };

  function header(page, pageNumber) {
    page.rect(40, PAGE_HEIGHT - 66, 80, 24, "0.26 0.12 0.45");
    page.text(47, PAGE_HEIGHT - 58, "NatWest", { size: 12, font: "bold", color: "1 1 1" });
    page.text(555, PAGE_HEIGHT - 48, "National Westminster Bank Plc", { size: 8, align: "right", color: GREY });
    page.text(555, PAGE_HEIGHT - 59, "250 Bishopsgate, London EC2M 4AA", { size: 8, align: "right", color: GREY });
    page.text(555, PAGE_HEIGHT - 70, `Page ${pageNumber} of ${pageCount}`, { size: 8, align: "right" });
    if (pageNumber === 1) {
      let y = PAGE_HEIGHT - 96;
      for (const line of ["MR J SMITH", "12 EXAMPLE ROAD", "LONDON", "N1 1AA"]) {
        page.text(40, y, line, { size: 9 });
        y -= 11;
      }
      page.text(40, PAGE_HEIGHT - 160, "Select Account statement", { size: 16, font: "bold" });
      const details = [
        ["Account name", "MR J SMITH"],
        ["Sort code", "60-12-34"],
        ["Account number", "12345678"],
        ["Statement period", "28 July to 27 August 2026"],
        ["Statement number", "112"],
      ];
      y = PAGE_HEIGHT - 184;
      for (const [label, value] of details) {
        page.text(40, y, label, { size: 9, color: GREY });
        page.text(150, y, value, { size: 9 });
        y -= 12;
      }
    }
  }

  function tableHeader(page, y) {
    page.text(columns.date, y, "Date", { size: 8, font: "bold" });
    page.text(columns.description, y, "Description", { size: 8, font: "bold" });
    page.text(columns.in, y, "Paid in (£)", { size: 8, font: "bold", align: "right" });
    page.text(columns.out, y, "Withdrawn (£)", { size: 8, font: "bold", align: "right" });
    page.text(columns.balance, y, "Balance (£)", { size: 8, font: "bold", align: "right" });
    page.rule(40, y - 4, 555, y - 4);
    return y - 16;
  }

  function footer(page) {
    page.rule(40, 66, 555, 66, { color: LIGHT_RULE });
    page.text(40, 54, "National Westminster Bank Plc. Registered in England and Wales (Registered Number 929027). Registered Office: 250 Bishopsgate, London EC2M 4AA.", {
      size: 6.5,
      color: GREY,
    });
    page.text(40, 45, "Authorised by the Prudential Regulation Authority and regulated by the Financial Conduct Authority and the Prudential Regulation Authority.", {
      size: 6.5,
      color: GREY,
    });
  }

  const rowsPerPage = [7, 8, 6];
  let pageNumber = 1;
  let page = doc.addPage();
  header(page, pageNumber);
  let y = tableHeader(page, PAGE_HEIGHT - 262);
  page.text(columns.date, y, "28 JUL", { size: 9 });
  page.text(columns.description, y, "BROUGHT FORWARD", { size: 9 });
  page.text(columns.balance, y, money(NATWEST_OPENING), { size: 9, align: "right" });
  y -= 13;

  let onPage = 0;
  NATWEST_ROWS.forEach((row, index) => {
    if (onPage === rowsPerPage[pageNumber - 1]) {
      page.text(columns.description, y, "CARRIED FORWARD", { size: 9 });
      page.text(columns.balance, y, money(balances[index - 1]), { size: 9, align: "right" });
      footer(page);
      pageNumber += 1;
      page = doc.addPage();
      header(page, pageNumber);
      y = tableHeader(page, PAGE_HEIGHT - 96);
      page.text(columns.description, y, "BROUGHT FORWARD", { size: 9 });
      page.text(columns.balance, y, money(balances[index - 1]), { size: 9, align: "right" });
      y -= 13;
      onPage = 0;
    }
    const firstOfDay = index === 0 || NATWEST_ROWS[index - 1].date !== row.date || onPage === 0;
    if (firstOfDay) page.text(columns.date, y, row.date, { size: 9 });
    row.lines.forEach((line, lineIndex) => {
      page.text(columns.description, y, line, { size: 9 });
      if (lineIndex === row.lines.length - 1) {
        if (row.in) page.text(columns.in, y, money(row.in), { size: 9, align: "right" });
        if (row.out) page.text(columns.out, y, money(row.out), { size: 9, align: "right" });
        page.text(columns.balance, y, money(balances[index]), { size: 9, align: "right" });
      }
      y -= 11;
    });
    y -= 2;
    onPage += 1;
  });
  page.text(columns.description, y, "CARRIED FORWARD", { size: 9 });
  page.text(columns.balance, y, money(closing), { size: 9, align: "right" });
  footer(page);
  return doc;
}

// ─── Unsupported PDFs ────────────────────────────────────────────────────────

// A bank letter: plenty of text and numbers, no transaction table.
function buildLetter() {
  const doc = new Document("Changes to your account");
  const page = doc.addPage();
  page.rect(40, PAGE_HEIGHT - 66, 92, 24, "0 0.682 0.937");
  page.text(46, PAGE_HEIGHT - 58, "BARCLAYS", { size: 12, font: "bold", color: "1 1 1" });
  let y = PAGE_HEIGHT - 110;
  const paragraphs = [
    "MR JOHN SMITH",
    "12 EXAMPLE ROAD",
    "LONDON N1 1AA",
    "",
    "12 January 2026",
    "",
    "Changes to the interest rate on your Everyday Saver",
    "",
    "Dear Mr Smith,",
    "",
    "From 1 February 2026 the interest rate on your Everyday Saver will change from 1.65% to 1.51% AER/gross",
    "per year. Interest is calculated daily and paid monthly. The change reflects the Bank of England base rate",
    "reduction announced on 18 December 2025.",
    "",
    "You do not need to do anything. If you would like to move your savings, you can do so at any time without",
    "charge. Call us on 0345 734 5345 or visit barclays.co.uk/savings to see every account we offer.",
    "",
    "Yours sincerely,",
    "",
    "Barclays Bank UK PLC",
    "Registered in England. Registered No. 9740322. Registered Office: 1 Churchill Place, London E14 5HP.",
  ];
  for (const line of paragraphs) {
    if (line) page.text(40, y, line, { size: 9 });
    y -= 13;
  }
  return doc;
}

// A scanned statement: one big "image" and no text layer at all.
function buildScan() {
  const doc = new Document("Scan 2026-01-12");
  const page = doc.addPage();
  page.rect(30, 30, PAGE_WIDTH - 60, PAGE_HEIGHT - 60, "0.93 0.93 0.93");
  for (let row = 0; row < 18; row += 1) {
    page.rect(60, PAGE_HEIGHT - 120 - row * 28, 300 + (row % 3) * 60, 8, "0.78 0.78 0.78");
    page.rect(440, PAGE_HEIGHT - 120 - row * 28, 80, 8, "0.78 0.78 0.78");
  }
  return doc;
}

// ─── Write everything ────────────────────────────────────────────────────────

const FIXTURES = [
  ["barclays-current-account.pdf", buildBarclays],
  ["hsbc-bank-account.pdf", buildHsbc],
  ["monzo-personal-account.pdf", buildMonzo],
  ["natwest-select-account.pdf", buildNatwest],
  ["unsupported-letter.pdf", buildLetter],
  ["unsupported-scan.pdf", buildScan],
];

await mkdir(OUT_DIR, { recursive: true });
for (const [name, build] of FIXTURES) {
  const buffer = build().toBuffer();
  await writeFile(join(OUT_DIR, name), buffer);
  console.log(`  tests/fixtures/statements/${name} (${buffer.length} bytes)`);
}
