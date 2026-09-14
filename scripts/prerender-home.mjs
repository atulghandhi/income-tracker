import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, preTransformRequests: false }, appType: 'custom' });
try {
  const { renderLanding } = await server.ssrLoadModule('/src/prerender.tsx');
  const markup = renderLanding();
  const file = resolve(root, 'dist/index.html');
  const html = await readFile(file, 'utf8');
  const start = html.indexOf('<div id="root">');
  const end = html.indexOf('</noscript>', start) + '</noscript>'.length;
  if (start < 0 || end < start) throw new Error('Homepage root or fallback marker is missing');
  // Reveal animation content in the initial HTML. React removes this style with
  // the static markup, so normal interactions/animations remain unchanged.
  const visible = '<style>html,body{overflow:auto!important}.lp-r,.lp-nav,.lp-csv-row{opacity:1!important;transform:none!important}.lp-hero-mock{pointer-events:none}</style>';
  const fallback = '<noscript><p style="padding:24px;text-align:center">Enable JavaScript to use the tracker. You can still read the guides, worked examples and download budget templates.</p></noscript>';
  await writeFile(file, html.slice(0,start) + '<div id="root">' + markup + visible + '</div>' + fallback + html.slice(end));
  console.log('Prerendered the complete public homepage, including links and FAQs.');
} finally { await server.close(); }
