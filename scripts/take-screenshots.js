// scripts/take-screenshots.js
// Takes authenticated screenshots of all Sovereign platform pages.
// Uses Supabase admin API to get session tokens, injects them into the browser
// via localStorage (bypasses the magic link redirect complexity).
// Run: node scripts/take-screenshots.js

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL   = 'https://kicdjdxxdqtmetphipnn.supabase.co';
const SUPABASE_ANON  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpY2RqZHh4ZHF0bWV0cGhpcG5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTQ2ODksImV4cCI6MjA4OTQzMDY4OX0.UukZihDkA1nwZe0MZewya3Is_7vCoVt4cVIKSrdjFKE';
const SERVICE_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpY2RqZHh4ZHF0bWV0cGhpcG5uIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1NDY4OSwiZXhwIjoyMDg5NDMwNjg5fQ.jF1ZP52y0B5GEIWdq8U8hl7dimU5sF_-4q4k9k_nUFY';
const ADMIN_EMAIL    = 'trainingcircuitvc@gmail.com';
const BASE_URL       = 'https://sovereigncmd.xyz';
const LS_KEY         = 'sb-kicdjdxxdqtmetphipnn-auth-token';
const OUT_DIR        = path.join(__dirname, '..', 'public', 'assets', 'screenshots');

const PAGES = [
  { slug: 'command',      file: 'command.png',       label: 'Command Centre' },
  { slug: 'pipeline',     file: 'pipeline.png',      label: 'Deal Pipeline' },
  { slug: 'scout',        file: 'scout.png',         label: 'Target Scout' },
  { slug: 'agents',       file: 'agents.png',        label: 'Agent Task Board' },
  { slug: 'intelligence', file: 'intelligence.png',  label: 'Market Intelligence' },
  { slug: 'analytics',    file: 'analytics.png',     label: 'Analytics' },
  { slug: 'comms',        file: 'comms.png',         label: 'Comms' },
  { slug: 'vault',        file: 'vault.png',         label: 'Document Vault' },
  { slug: 'security',     file: 'security.png',      label: 'Security' },
  { slug: 'admin',        file: 'admin.png',         label: 'Admin Dashboard' },
];

async function getSession() {
  // Generate a magic link and extract tokens from the returned action_link URL
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: ADMIN_EMAIL }),
  });

  if (!res.ok) throw new Error(`generate_link failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  // The action_link contains the OTP token — exchange it for a session
  // Format: https://<project>.supabase.co/auth/v1/verify?token=<token>&type=magiclink&redirect_to=...
  const actionLink = data.action_link;
  if (!actionLink) throw new Error('No action_link in response: ' + JSON.stringify(data));

  // Extract token and type from the action link
  const linkUrl = new URL(actionLink);
  const token = linkUrl.searchParams.get('token');
  const type  = linkUrl.searchParams.get('type') || 'magiclink';

  if (!token) throw new Error('No token in action_link: ' + actionLink);

  // Exchange OTP token for a session via Supabase REST
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, type, redirect_to: BASE_URL }),
  });

  if (!verifyRes.ok) {
    // Try alternative: use the action_link directly and parse the redirect URL
    console.log('  Direct verify failed, trying redirect approach...');
    const redirectRes = await fetch(actionLink, { redirect: 'manual' });
    const location = redirectRes.headers.get('location') || '';
    const hashIdx = location.indexOf('#');
    if (hashIdx === -1) throw new Error('No hash fragment in redirect: ' + location);
    const hash = new URLSearchParams(location.slice(hashIdx + 1));
    return {
      access_token:  hash.get('access_token'),
      refresh_token: hash.get('refresh_token'),
      expires_at:    parseInt(hash.get('expires_at') || '0', 10),
    };
  }

  const session = await verifyRes.json();
  return {
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
    expires_at:    session.expires_at || Math.floor(Date.now() / 1000) + 3600,
  };
}

async function injectSession(page, session) {
  // Build the localStorage value Supabase JS expects
  const lsValue = JSON.stringify({
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
    expires_at:    session.expires_at,
    token_type:    'bearer',
    user: { id: 'a9399fd3-d17d-42ae-9ae4-bba04c8b2372', email: ADMIN_EMAIL },
  });

  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: LS_KEY, value: lsValue });
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Fetching session tokens...');
  const session = await getSession();
  if (!session.access_token) throw new Error('No access_token in session response');
  console.log('Session obtained. Expires at:', new Date(session.expires_at * 1000).toISOString());

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('dialog', d => d.dismiss());

  // First load the base URL to establish the origin in localStorage, then inject session
  console.log('Establishing origin...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await injectSession(page, session);
  console.log('Session injected into localStorage.');

  for (const p of PAGES) {
    const url = `${BASE_URL}/${p.slug}`;
    console.log(`Capturing ${url}...`);
    try {
      // Re-inject session before each navigation (some pages clear storage on redirect)
      await injectSession(page, session);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

      // If we got redirected to login, re-inject and navigate again
      if (page.url().includes('/login') || page.url().includes('/#access')) {
        console.log('  Redirected to login — re-injecting session...');
        await injectSession(page, session);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      }

      // Let auth event fire and page render
      await page.waitForTimeout(3000);

      // Dismiss any modals / overlays
      await page.evaluate(() => {
        document.querySelectorAll('[id*="overlay"],[id*="modal"],[class*="overlay"],[class*="modal"]')
          .forEach(el => { if (el.style) el.style.display = 'none'; });
      });

      const outPath = path.join(OUT_DIR, p.file);
      await page.screenshot({ path: outPath, fullPage: false });
      const stat = fs.statSync(outPath);
      console.log(`  ✓ ${p.file} (${Math.round(stat.size/1024)}KB)`);
    } catch (e) {
      console.warn(`  ✗ ${p.slug}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\nDone. Screenshots in public/assets/screenshots/');
}

run().catch(e => { console.error(e); process.exit(1); });
