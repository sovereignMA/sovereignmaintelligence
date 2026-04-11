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

  // Idempotency: skip if already ran today (prevents duplicate deletes on concurrent runs)
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const alreadyRanRes = await fetch(
      `${base}/rest/v1/system_metrics?metric_name=eq.data_retention_run&created_at=gte.${todayStart.toISOString()}&limit=1&select=id`,
      { headers }
    );
    if (alreadyRanRes.ok) {
      const rows = await alreadyRanRes.json();
      if (rows.length > 0) {
        return Response.json({ ok: true, skipped: true, reason: 'already ran today', ts: new Date().toISOString() });
      }
    }
  } catch (_) { /* idempotency check failure — proceed with deletion */ }

  // Retain audit trail for 90 days, analytics for 365 days (UK GDPR data minimisation)
  const cutoff90  = new Date(Date.now() - 90  * 86400000).toISOString();
  const cutoff365 = new Date(Date.now() - 365 * 86400000).toISOString();

  try {
    const [auditDel, analyticsDel, adDel] = await Promise.allSettled([
      fetch(`${base}/rest/v1/audit_trail?created_at=lt.${cutoff90}`,       { method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' } }),
      fetch(`${base}/rest/v1/analytics_events?created_at=lt.${cutoff365}`, { method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' } }),
      fetch(`${base}/rest/v1/ad_tracking?created_at=lt.${cutoff365}`,      { method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' } }),
    ]);

    // Record completion so idempotency check works on any re-run today
    await fetch(`${base}/rest/v1/system_metrics`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        metric_name: 'data_retention_run',
        metric_value: 1,
        metric_unit: 'status',
        tags: {
          audit_ok:     auditDel.status === 'fulfilled' && auditDel.value.ok,
          analytics_ok: analyticsDel.status === 'fulfilled' && analyticsDel.value.ok,
          ad_ok:        adDel.status === 'fulfilled' && adDel.value.ok,
        },
      }),
    });

    return Response.json({
      ok: true,
      audit_deleted:     auditDel.status === 'fulfilled' && auditDel.value.ok,
      analytics_deleted: analyticsDel.status === 'fulfilled' && analyticsDel.value.ok,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
