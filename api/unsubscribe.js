// api/unsubscribe.js
// Handles one-click email unsubscribe (RFC 8058 + CAN-SPAM/PECR).
//
// GET  /api/unsubscribe?email=...&token=...  — user clicks link in email
// POST /api/unsubscribe                      — one-click unsubscribe from email client
//      body: application/x-www-form-urlencoded  List-Unsubscribe=One-Click + email + token

export const config = { runtime: 'edge' };

import { verifyToken } from './lib/unsub-token.js';

const SUPABASE_URL  = () => process.env.SUPABASE_URL;
const SERVICE_KEY   = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function html(title, body) {
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Sovereign</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e5e5e5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#13131a;border:1px solid #2a2a3a;border-radius:14px;padding:40px 44px;max-width:460px;width:100%;text-align:center}
.icon{font-size:40px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:10px}
p{font-size:14px;color:#8888a0;line-height:1.65}
.gold{color:#c9a84c}
a{color:#c9a84c;text-decoration:none}
</style>
</head><body><div class="card">${body}</div></body></html>`,
    { headers: { ...CORS, 'Content-Type': 'text/html;charset=utf-8' } }
  );
}

async function suppress(email) {
  const base = SUPABASE_URL();
  const key  = SERVICE_KEY();
  if (!base || !key) return;

  const h = {
    'Authorization': `Bearer ${key}`,
    'apikey': key,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal,resolution=ignore-duplicates',
  };

  // Insert into email_suppressions (UPSERT — ignore if already suppressed)
  await fetch(`${base}/rest/v1/email_suppressions`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ email: email.toLowerCase().trim(), reason: 'unsubscribe' }),
  });

  // Also mark newsletter_subscribers.unsubscribed_at if present
  await fetch(
    `${base}/rest/v1/newsletter_subscribers?email=eq.${encodeURIComponent(email)}&unsubscribed_at=is.null`,
    {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
    }
  );
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let email = '';
  let token = '';

  if (req.method === 'GET') {
    const url = new URL(req.url);
    email = url.searchParams.get('email') || '';
    token = url.searchParams.get('token') || '';
  } else if (req.method === 'POST') {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/x-www-form-urlencoded')) {
      const body = await req.text();
      const params = new URLSearchParams(body);
      email = params.get('email') || '';
      token = params.get('token') || '';
    } else {
      const body = await req.json().catch(() => ({}));
      email = body.email || '';
      token = body.token || '';
    }
  }

  if (!email || !token) {
    return html('Invalid link', `
      <div class="icon">⚠️</div>
      <h1>Invalid unsubscribe link</h1>
      <p>This link is missing required parameters. If you'd like to unsubscribe, please reply to any email from us with the subject "Unsubscribe".</p>
    `);
  }

  const valid = await verifyToken(email, token);
  if (!valid) {
    return html('Invalid link', `
      <div class="icon">⚠️</div>
      <h1>Link expired or invalid</h1>
      <p>This unsubscribe link is no longer valid. Please reply to any email from us with the subject <span class="gold">"Unsubscribe"</span> and we'll remove you within 24 hours.</p>
    `);
  }

  await suppress(email);

  // One-click POST (RFC 8058) returns 200 with no body
  if (req.method === 'POST') {
    return new Response('', { status: 200, headers: CORS });
  }

  return html('Unsubscribed', `
    <div class="icon">✓</div>
    <h1>You've been unsubscribed</h1>
    <p>We've removed <span class="gold">${email}</span> from all outreach communications.<br><br>
    If this was a mistake, <a href="mailto:hello@sovereigncmd.xyz">contact us</a> and we'll re-add you.</p>
  `);
}
