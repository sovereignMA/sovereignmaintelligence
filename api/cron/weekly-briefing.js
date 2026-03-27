import { sendEmail } from '../lib/send-email.js';

export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const sbHeaders = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const base = process.env.SUPABASE_URL;

  try {
    // Fetch active deals summary
    const dealsRes = await fetch(
      `${base}/rest/v1/deals?select=company_name,stage,score,deal_value_gbp&stage=not.in.(completed,dead)&order=score.desc&limit=15`,
      { headers: sbHeaders }
    );
    const deals = dealsRes.ok ? await dealsRes.json() : [];

    // Fetch pipeline stats
    const allDealsRes = await fetch(
      `${base}/rest/v1/deals?select=stage`,
      { headers: sbHeaders }
    );
    const allDeals = allDealsRes.ok ? await allDealsRes.json() : [];
    const stageCounts = {};
    allDeals.forEach(d => { stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1; });

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ ok: false, error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 });
    }

    // Generate briefing with Claude
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Write a concise weekly M&A pipeline briefing email for the Sovereign platform.

Active deals (top 15 by score): ${JSON.stringify(deals)}
Pipeline stage breakdown: ${JSON.stringify(stageCounts)}
Total deals: ${allDeals.length}

Write an executive briefing with:
1. Pipeline snapshot (total deals, stage breakdown)
2. Top 3 deals to focus on this week (highest score)
3. Deals needing attention (stale stages, missing intel)
4. Recommended actions for the week

Use concise bullet points. Return ONLY the briefing body text (no subject line). Use HTML formatting with <h3>, <p>, <ul>, <li>, <strong> tags. Keep it professional and actionable.`,
        }],
      }),
    });
    if (!aiRes.ok) return Response.json({ ok: false, error: `AI error ${aiRes.status}` }, { status: 500 });
    const aiData = await aiRes.json();
    const briefingBody = aiData.content?.[0]?.text || '<p>Weekly briefing generation failed.</p>';

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #e4e4e7; background: #07080f; padding: 32px 24px; border-radius: 12px;">
  <div style="border-bottom: 2px solid #c9a84c; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: #c9a84c; letter-spacing: 1px;">⬡ SOVEREIGN</h1>
    <p style="margin: 4px 0 0; font-size: 13px; color: #71717a;">Weekly Pipeline Briefing — ${today}</p>
  </div>
  <div style="font-size: 14px; line-height: 1.6; color: #d4d4d8;">
    ${briefingBody}
  </div>
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #71717a;">
    <p style="margin: 0;">Sent by Sovereign Command Engine • <a href="https://sovereigncmd.xyz/command" style="color: #c9a84c;">Open Dashboard</a></p>
  </div>
</div>`;

    const emailResult = await sendEmail({
      subject: `[Sovereign] Weekly Briefing — ${deals.length} active deals`,
      html,
    });

    // Audit trail
    await fetch(`${base}/rest/v1/audit_trail`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        event: 'weekly_briefing_sent',
        agent: 'weekly-briefing',
        details: `Weekly briefing email ${emailResult.ok ? 'sent' : 'failed'}: ${emailResult.ok ? emailResult.id : emailResult.error}`,
        status: emailResult.ok ? 'ok' : 'error',
      }),
    });

    return Response.json({ ok: emailResult.ok, email: emailResult, deals_count: deals.length, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
