import { sendEmail } from '../lib/send-email.js';

export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const headers = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const base = process.env.SUPABASE_URL;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Find deals with overdue next_action_date
    const r = await fetch(
      `${base}/rest/v1/deals?select=id,company_name,stage,next_action_date,score&next_action_date=lt.${today}&stage=not.in.(completed,dead)&order=score.desc`,
      { headers }
    );
    if (!r.ok) return Response.json({ ok: false, error: 'Failed to fetch deals' }, { status: 500 });
    const overdue = await r.json();

    // Find deals stuck in same stage for 14+ days
    const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString();
    const staleRes = await fetch(
      `${base}/rest/v1/deals?select=id,company_name,stage,updated_at,score&updated_at=lt.${cutoff14}&stage=not.in.(completed,dead)&order=updated_at.asc`,
      { headers }
    );
    const stale = staleRes.ok ? await staleRes.json() : [];

    const severity = overdue.length > 5 || stale.length > 3 ? 'warn' : 'ok';

    // Log to audit trail
    await fetch(`${base}/rest/v1/audit_trail`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        event: 'pipeline_health_check',
        agent: 'pipeline-health',
        details: `${overdue.length} overdue, ${stale.length} stale deals`,
        status: severity,
      }),
    });

    // Send email alert if there are issues
    if (overdue.length > 0 || stale.length > 0) {
      const overdueRows = overdue.slice(0, 10).map(d =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${d.company_name}</td><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${d.stage}</td><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${d.next_action_date}</td><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${d.score || '—'}</td></tr>`
      ).join('');

      const staleRows = stale.slice(0, 10).map(d =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${d.company_name}</td><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${d.stage}</td><td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${new Date(d.updated_at).toLocaleDateString('en-GB')}</td></tr>`
      ).join('');

      const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #e4e4e7; background: #07080f; padding: 32px 24px; border-radius: 12px;">
  <div style="border-bottom: 2px solid ${severity === 'warn' ? '#f87171' : '#c9a84c'}; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: ${severity === 'warn' ? '#f87171' : '#c9a84c'}; letter-spacing: 1px;">⬡ PIPELINE HEALTH ${severity === 'warn' ? '⚠️' : '✓'}</h1>
    <p style="margin: 4px 0 0; font-size: 13px; color: #71717a;">Daily check — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
  </div>
  ${overdue.length > 0 ? `
  <h3 style="color: #f87171; font-size: 14px; margin: 0 0 8px;">🔴 ${overdue.length} Overdue Deal${overdue.length > 1 ? 's' : ''}</h3>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
    <tr style="color: #71717a; text-align: left;"><th style="padding:6px 12px">Company</th><th style="padding:6px 12px">Stage</th><th style="padding:6px 12px">Due</th><th style="padding:6px 12px">Score</th></tr>
    ${overdueRows}
  </table>` : ''}
  ${stale.length > 0 ? `
  <h3 style="color: #fbbf24; font-size: 14px; margin: 0 0 8px;">🟡 ${stale.length} Stale Deal${stale.length > 1 ? 's' : ''} (14+ days no update)</h3>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
    <tr style="color: #71717a; text-align: left;"><th style="padding:6px 12px">Company</th><th style="padding:6px 12px">Stage</th><th style="padding:6px 12px">Last Updated</th></tr>
    ${staleRows}
  </table>` : ''}
  <div style="margin-top: 16px;">
    <a href="https://sovereigncmd.xyz/pipeline" style="display: inline-block; padding: 8px 20px; background: #c9a84c; color: #07080f; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">Open Pipeline →</a>
  </div>
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #71717a;">
    <p style="margin: 0;">Sovereign Pipeline Health • Daily at 08:00 UTC</p>
  </div>
</div>`;

      await sendEmail({
        subject: `[Sovereign] ${severity === 'warn' ? '⚠️' : '📊'} Pipeline: ${overdue.length} overdue, ${stale.length} stale`,
        html,
      });
    }

    return Response.json({ ok: true, overdue_count: overdue.length, stale_count: stale.length, severity, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
