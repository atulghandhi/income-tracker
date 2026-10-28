// Browser side of PDF import: loads pdf.js on demand and hands the positioned
// text to the parser in pdfImporter.ts. Kept apart from the parser so the
// tests (which read the fixture PDFs with pdf.js's Node build) and the app
// (which runs pdf.js in a web worker) share every line of parsing logic.
//
// The PDF never leaves the browser: pdf.js runs locally, the worker is served
// from this origin, and only the extracted text reaches the review screen.

import { readPdfPages, type PdfjsLike, type PdfPageText } from "./pdfImporter";

let loader: Promise<PdfjsLike> | null = null;

// pdf.js is close to half a megabyte, so it is fetched the first time someone
// picks a PDF rather than on every app load.
function loadPdfjs(): Promise<PdfjsLike> {
  loader ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs as unknown as PdfjsLike;
  })();
  return loader;
}

export async function extractPdfPages(data: ArrayBuffer): Promise<PdfPageText[]> {
  const pdfjs = await loadPdfjs();
  return readPdfPages(pdfjs, data);
}
