// Renders scripts/og-card.mjs in a headless browser and writes public/og.jpg
// (the social / Open Graph share card).
//
// Regenerating is a rare one-off, so the browser tooling isn't a committed
// dependency. To run `npm run build:og`, first:
//   npm i -D playwright-core && npx playwright install chromium
// The generated public/og.jpg is committed; the app build does not need this.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = resolve(__dirname, '.cache');
const BUNDLE = resolve(CACHE, 'og-card.bundle.js');
const OUT = resolve(__dirname, '../public/og.jpg');

mkdirSync(CACHE, { recursive: true });
mkdirSync(resolve(__dirname, '../public'), { recursive: true });

console.log('Bundling og-card.mjs …');
execFileSync(
  resolve(__dirname, '../node_modules/.bin/esbuild'),
  [
    resolve(__dirname, 'og-card.mjs'),
    '--bundle',
    '--format=esm',
    '--platform=browser',
    `--outfile=${BUNDLE}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' }
);

console.log('Rendering …');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body>');
await page.addScriptTag({ content: readFileSync(BUNDLE, 'utf8'), type: 'module' });
await page.waitForFunction('typeof window.__renderOgCard === "function"', { timeout: 5000 });
const bytes = await page.evaluate(() => window.__renderOgCard());
await browser.close();

writeFileSync(OUT, Buffer.from(bytes));
console.log(`Wrote ${OUT} (${(bytes.length / 1024).toFixed(0)} KB)`);
