// take-screenshots.mjs
// Uses puppeteer with the user's logged-in Chrome profile to capture
// all Sovereign app feature pages. Run once, images land in public/img/screenshots/

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/img/screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://sovereigncmd.xyz';

// Pages to capture: [path, filename, waitSelector, description]
const PAGES = [
  ['/command',      'command',      '#chat',           'AI Command Centre — 21-agent deal team'],
  ['/pipeline',     'pipeline',     '#kanbanBoard',    'Deal Pipeline — Kanban + workflow tree'],
  ['/intelligence', 'intelligence', '.intel-grid, .page-content', 'Company Intelligence — deep-dive reports'],
  ['/scout',        'scout',        '.scout-results, .page-content', 'Target Scout — Companies House + AI scoring'],
  ['/analytics',    'analytics',   '.page-content',   'Deal Analytics — conversion, velocity, trends'],
  ['/vault',        'vault',        '.vault-grid, .pg', 'Document Vault — NDAs, SPAs, playbooks'],
  ['/comms',        'comms',        '#threadList, .comms-shell', 'Comms Hub — deal team messaging'],
  ['/mail',         'mail',         '.mail-shell, .page-content', 'Mail — AI-drafted outreach'],
  ['/campaigns',    'campaigns',    '.page-content',   'Campaigns — LinkedIn + email sequences'],
  ['/agents',       'agents',       '.board, .page-content', 'Agents — autonomous task board'],
];

async function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Sovereign Feature Screenshot Capture');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Use the user's Chrome profile so we get the logged-in session
  const CHROME_PROFILE = '/tmp/sv_chrome_profile';

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    userDataDir: CHROME_PROFILE,
    headless: false,       // visible so auth cookies are available
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // Hide automation banner
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  for (const [path, name, waitSel, desc] of PAGES) {
    const url = `${BASE}${path}`;
    console.log(`→ ${desc}`);
    console.log(`  ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for the auth:ready event and content to render
      await page.waitForFunction(() => {
        return !document.getElementById('_authOverlay') ||
               document.getElementById('_authOverlay').style.display === 'none' ||
               !document.getElementById('_authOverlay').parentNode;
      }, { timeout: 15000 }).catch(() => {});

      // Try to wait for the primary content selector
      await page.waitForSelector(waitSel, { timeout: 10000 }).catch(() => {});

      // Extra settle time for animations and data load
      await new Promise(r => setTimeout(r, 2500));

      // Hide the auth overlay if still present
      await page.evaluate(() => {
        const o = document.getElementById('_authOverlay');
        if (o) o.remove();
      });

      const file = `${OUT}/${name}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  ✓ Saved ${name}.png\n`);

    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}\n`);
    }
  }

  await browser.close();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Screenshots saved to: ${OUT}`);
  console.log('Now run: node scripts/wire-screenshots.mjs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
