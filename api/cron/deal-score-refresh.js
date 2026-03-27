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

  try {
    // Fetch current deal scores
    const dealsRes = await fetch(
      `${base}/rest/v1/deals?select=id,company_name,score,stage&stage=not.in.(completed,dead)`,
      { headers }
    );
    if (!dealsRes.ok) return Response.json({ ok: false, error: 'Failed to fetch deals' }, { status: 500 });
    const deals = await dealsRes.json();
    const oldScores = {};
    deals.forEach(d => { oldScores[d.id] = { score: d.score, name: d.company_name }; });

    // Fetch company intel with acquisition scores
    const intelRes = await fetch(`${base}/rest/v1/company_intel?select=deal_id,data&data->>acquisition_score=not.is.null`, { headers });
    if (!intelRes.ok) return Response.json({ ok: false, error: 'Failed to fetch intel' }, { status: 500 });
    const intel = await intelRes.json();

    let updated = 0;
    const changes = [];
    for (const row of intel) {
      const score = row.data?.acquisition_score;
      if (!score || !row.deal_id) continue;
      const newScore = Math.min(100, Math.max(0, Math.round(score)));
      const old = oldScores[row.deal_id];
      if (!old) continue;

      const r = await fetch(`${base}/rest/v1/deals?id=eq.${row.deal_id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ score: newScore }),
      });
      if (r.ok) {
        updated++;
        const delta = newScore - (old.score || 0);
        if (Math.abs(delta) >= 10) {
          changes.push({ name: old.name, oldScore: old.score || 0, newScore, delta });
        }
      }
    }

    // Email if significant score changes detected
    if (changes.length > 0) {
      const rows = changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map(c =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${c.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${c.oldScore}</td>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${c.newScore}</td>
          <td style="padding:6px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:${c.delta > 0 ? '#4ade80' : '#f87171'}">${c.delta > 0 ? '+' : ''}${c.delta}</td>
        </tr>`
      ).join('');

      await sendEmail({
        subject: `[Sovereign] 📊 ${changes.length} deal score${changes.length > 1 ? 's' : ''} changed significantly`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #e4e4e7; background: #07080f; padding: 32px 24px; border-radius: 12px;">
  <div style="border-bottom: 2px solid #c9a84c; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: #c9a84c;">⬡ SCORE REFRESH</h1>
    <p style="margin: 4px 0 0; font-size: 13px; color: #71717a;">${updated} deals rescored • ${changes.length} significant changes (±10+)</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr style="color: #71717a; text-align: left;"><th style="padding:6px 12px">Company</th><th style="padding:6px 12px">Old</th><th style="padding:6px 12px">New</th><th style="padding:6px 12px">Change</th></tr>
    ${rows}
  </table>
  <div style="margin-top: 24px;">
    <a href="https://sovereigncmd.xyz/pipeline" style="display: inline-block; padding: 8px 20px; background: #c9a84c; color: #07080f; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">View Pipeline →</a>
  </div>
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #71717a;">
    <p style="margin: 0;">Sovereign Deal Scoring • Daily at 06:00 UTC</p>
  </div>
</div>`,
      });
    }

    return Response.json({ ok: true, updated, significant_changes: changes.length, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
