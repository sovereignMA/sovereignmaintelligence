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
    // Fetch company intel with acquisition scores
    const intelRes = await fetch(`${base}/rest/v1/company_intel?select=deal_id,data&data->>acquisition_score=not.is.null`, { headers });
    if (!intelRes.ok) return Response.json({ ok: false, error: 'Failed to fetch intel' }, { status: 500 });
    const intel = await intelRes.json();

    let updated = 0;
    for (const row of intel) {
      const score = row.data?.acquisition_score;
      if (!score || !row.deal_id) continue;
      const r = await fetch(`${base}/rest/v1/deals?id=eq.${row.deal_id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ score: Math.min(100, Math.max(0, Math.round(score))) }),
      });
      if (r.ok) updated++;
    }
    return Response.json({ ok: true, updated, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
