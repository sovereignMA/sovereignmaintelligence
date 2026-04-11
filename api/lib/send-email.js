// api/lib/send-email.js
// Resend email helper for Vercel Edge functions.
// Checks email_suppressions before sending.
// Adds List-Unsubscribe / List-Unsubscribe-Post headers (CAN-SPAM / RFC 8058).
//
// Required env vars: RESEND_API_KEY
// Optional env vars: RESEND_FROM, NOTIFY_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

async function isSuppressed(email) {
  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !email) return false;
  try {
    const res = await fetch(
      `${base}/rest/v1/email_suppressions?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&limit=1&select=id`,
      { headers: { 'Authorization': `Bearer ${key}`, 'apikey': key } }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {object} opts
 * @param {string|string[]} opts.to           - Recipient(s)
 * @param {string}          opts.subject      - Email subject
 * @param {string}          [opts.html]       - HTML body
 * @param {string}          [opts.text]       - Plain-text body
 * @param {string}          [opts.from]       - Override from address
 * @param {string}          [opts.unsubscribeUrl] - One-click unsubscribe URL (generates headers)
 * @returns {{ ok: boolean, id?: string, error?: string, suppressed?: boolean }}
 */
export async function sendEmail({ subject, html, text, to, from, unsubscribeUrl }) {
  const apiKey    = process.env.RESEND_API_KEY;
  const recipient = to || process.env.NOTIFY_EMAIL;
  if (!apiKey || !recipient) return { ok: false, error: 'Missing RESEND_API_KEY or recipient' };

  const toEmail = Array.isArray(recipient) ? recipient[0] : recipient;

  // Suppression check
  if (await isSuppressed(toEmail)) {
    return { ok: false, suppressed: true, error: `${toEmail} is suppressed` };
  }

  const fromAddr = from || process.env.RESEND_FROM || 'Sovereign <notifications@sovereigncmd.xyz>';
  const toList   = Array.isArray(recipient) ? recipient : [recipient];

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const payload = {
    from: fromAddr,
    to: toList,
    subject,
    html: html || undefined,
    text: text || undefined,
  };

  // CAN-SPAM / RFC 8058 unsubscribe headers
  if (unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:unsubscribe@sovereigncmd.xyz?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    return { ok: false, error: `Resend ${res.status}: ${err}` };
  }

  const data = await res.json();
  return { ok: true, id: data.id };
}
