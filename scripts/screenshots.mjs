#!/usr/bin/env node
// Captures the console and the Grafana dashboard in light and dark themes.
// Usage: node scripts/screenshots.mjs <output-dir> [prefix]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const [outDir = 'docs/evidence/screenshots', prefix = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const shots = ['light', 'dark'].flatMap((theme) => [
  { name: `${prefix}console-${theme}`, url: 'http://localhost:8080/', theme, settle: 5000 },
  {
    name: `${prefix}grafana-${theme}`,
    url: `http://localhost:3001/d/service-overview/service-overview?orgId=1&kiosk&from=now-5m&to=now&theme=${theme}`,
    theme,
    settle: 7000,
  },
]);

const browser = await chromium.launch();
await Promise.all(
  shots.map(async ({ name, url, theme, settle }) => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: theme });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(settle);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
    console.log(`saved ${outDir}/${name}.png`);
  }),
);
await browser.close();
