// SVG is the editable source of truth. Requires librsvg: brew install librsvg.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'public/icon.svg'), 'utf8');
// iOS and maskable icons must fill the canvas; the OS supplies the corner mask.
const fullBleed = svg.replace('rx="28"', 'rx="0"');
function png(path, size, source = svg) {
  const result = spawnSync('rsvg-convert', ['-w', `${size}`, '-h', `${size}`, '-o', resolve(root, path)], { input: source });
  if (result.error || result.status !== 0) {
    throw new Error(`Icon export failed. Install librsvg (brew install librsvg). ${result.error?.message ?? result.stderr}`);
  }
}
png('public/icon.png', 240);
png('public/apple-touch-icon.png', 180, fullBleed);
png('public/icon-192.png', 192, fullBleed);
png('public/icon-512.png', 512, fullBleed);
const assets = 'ios/IncomeTracker/Resources/Assets.xcassets';
if (existsSync(resolve(root, assets))) {
  png(`${assets}/AppIcon.appiconset/AppIcon.png`, 1024, fullBleed);
  const brand = resolve(root, assets, 'BrandLogo.imageset');
  mkdirSync(brand, { recursive: true });
  writeFileSync(resolve(brand, 'BrandLogo.svg'), svg);
  writeFileSync(resolve(brand, 'Contents.json'), JSON.stringify({
    images: [{ filename: 'BrandLogo.svg', idiom: 'universal' }],
    info: { author: 'xcode', version: 1 },
    properties: { 'preserves-vector-representation': true }
  }, null, 2) + '\n');
}
console.log('Exported web icons and available iOS assets from public/icon.svg.');
