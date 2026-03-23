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
    // Fetch recent audit trail (all users, service-level)
    const r = await fetch(`${base}/rest/v1/audit_trail?select=agent,status&order=created_at.desc&limit=500`, { headers });
    if (!r.ok) return Response.json({ ok: false, error: 'Failed to fetch audit trail' }, { status: 500 });
    const recent = await r.json();

    // Aggregate per-agent success rates
    const stats = {};
    for (const row of recent) {
      if (!row.agent) continue;
      if (!stats[row.agent]) stats[row.agent] = { ok: 0, total: 0 };
      stats[row.agent].total++;
      if (row.status === 'ok') stats[row.agent].ok++;
    }

    const patterns = Object.entries(stats).map(([agent, s]) => ({
      pattern_type: 'agent_performance',
      title: `${agent} success rate`,
      description: `${agent} completed ${s.ok}/${s.total} tasks successfully`,
      success_rate: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0,
      usage_count: s.total,
      data: { agent, ...s },
    }));

    if (patterns.length > 0) {
      await fetch(`${base}/rest/v1/ai_patterns`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(patterns),
      });
    }

    return Response.json({ ok: true, patterns_updated: patterns.length, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
