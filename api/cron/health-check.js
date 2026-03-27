import { sendEmail } from '../lib/send-email.js';

export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const t = Date.now();
  try {
    // Check Supabase
    const dbRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/deals?select=id&limit=1`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    const dbOk = dbRes.ok;
    const dbLatency = Date.now() - t;

    // Check Anthropic API
    const t2 = Date.now();
    let aiOk = false;
    let aiLatency = 0;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
        aiOk = aiRes.ok;
        aiLatency = Date.now() - t2;
      } catch { aiLatency = Date.now() - t2; }
    }

    const allOk = dbOk && aiOk;

    // Log to system_metrics
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/system_metrics`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        metric_name: 'health_check',
        metric_value: allOk ? 1 : 0,
        metric_unit: 'status',
        tags: { db_ok: dbOk, db_latency_ms: dbLatency, ai_ok: aiOk, ai_latency_ms: aiLatency },
      }),
    });

    // Send alert email ONLY on failure
    if (!allOk) {
      const failures = [];
      if (!dbOk) failures.push('Supabase Database');
      if (!aiOk) failures.push('Anthropic API');

      await sendEmail({
        subject: `[Sovereign] 🔴 Health Check FAILED — ${failures.join(', ')}`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #e4e4e7; background: #07080f; padding: 32px 24px; border-radius: 12px;">
  <div style="border-bottom: 2px solid #f87171; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: #f87171;">⬡ HEALTH CHECK FAILED</h1>
    <p style="margin: 4px 0 0; font-size: 13px; color: #71717a;">${new Date().toISOString()}</p>
  </div>
  <ul style="font-size: 14px; padding-left: 20px; line-height: 2;">
    <li>Database: ${dbOk ? '<span style="color:#4ade80">✓ OK</span>' : '<span style="color:#f87171">✗ DOWN</span>'} (${dbLatency}ms)</li>
    <li>Anthropic API: ${aiOk ? '<span style="color:#4ade80">✓ OK</span>' : '<span style="color:#f87171">✗ DOWN</span>'} (${aiLatency}ms)</li>
  </ul>
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #71717a;">
    <p style="margin: 0;">Sovereign Health Monitor • Runs every 6 hours</p>
  </div>
</div>`,
      });
    }

    return Response.json({ ok: allOk, db: dbOk, ai: aiOk, db_latency_ms: dbLatency, ai_latency_ms: aiLatency, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
