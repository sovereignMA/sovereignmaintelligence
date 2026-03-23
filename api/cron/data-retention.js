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
  // Retain audit trail for 90 days, analytics for 365 days (UK GDPR data minimisation)
  const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const cutoff365 = new Date(Date.now() - 365 * 86400000).toISOString();

  try {
    const [auditDel, analyticsDel, adDel] = await Promise.allSettled([
      fetch(`${base}/rest/v1/audit_trail?created_at=lt.${cutoff90}`, { method: 'DELETE', headers }),
      fetch(`${base}/rest/v1/analytics_events?created_at=lt.${cutoff365}`, { method: 'DELETE', headers }),
      fetch(`${base}/rest/v1/ad_tracking?created_at=lt.${cutoff365}`, { method: 'DELETE', headers }),
    ]);

    await fetch(`${base}/rest/v1/audit_trail`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ event: 'data_retention_run', agent: 'S14', details: 'GDPR data minimisation cron completed', status: 'ok' }),
    });

    return Response.json({
      ok: true,
      audit_deleted: auditDel.status === 'fulfilled' && auditDel.value.ok,
      analytics_deleted: analyticsDel.status === 'fulfilled' && analyticsDel.value.ok,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
