export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const t = Date.now();
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/deals?select=id&limit=1`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    const ok = r.ok;
    // Log result to system_metrics
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/system_metrics`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ metric_name: 'health_check', metric_value: ok ? 1 : 0, metric_unit: 'status', tags: { latency_ms: Date.now() - t } }),
    });
    return Response.json({ ok, latency_ms: Date.now() - t, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
