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
      `${base}/rest/v1/deals?select=id,company_name,stage,next_action_date&next_action_date=lt.${today}&stage=not.in.(completed,dead)`,
      { headers }
    );
    if (!r.ok) return Response.json({ ok: false, error: 'Failed to fetch deals' }, { status: 500 });
    const overdue = await r.json();

    if (overdue.length > 0) {
      await fetch(`${base}/rest/v1/audit_trail`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          event: 'pipeline_health_check',
          agent: 'S10',
          details: `${overdue.length} deals with overdue next actions`,
          status: overdue.length > 5 ? 'warn' : 'ok',
        }),
      });
    }
    return Response.json({ ok: true, overdue_count: overdue.length, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
