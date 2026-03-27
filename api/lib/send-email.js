// Resend email helper for Vercel Edge cron jobs
// Requires env vars: RESEND_API_KEY, NOTIFY_EMAIL
// Optional: RESEND_FROM (defaults to notifications@sovereigncmd.xyz)

export async function sendEmail({ subject, html, text, to }) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = to || process.env.NOTIFY_EMAIL;
  if (!apiKey || !recipient) return { ok: false, error: 'Missing RESEND_API_KEY or NOTIFY_EMAIL' };

  const from = process.env.RESEND_FROM || 'Sovereign <notifications@sovereigncmd.xyz>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(recipient) ? recipient : [recipient],
      subject,
      html: html || undefined,
      text: text || undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    return { ok: false, error: `Resend ${res.status}: ${err}` };
  }

  const data = await res.json();
  return { ok: true, id: data.id };
}
