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
    // Check pending scrape queue items
    const r = await fetch(`${base}/rest/v1/scrape_queue?status=eq.pending&select=id,company_name,deal_id`, { headers });
    if (!r.ok) return Response.json({ ok: false, error: 'Failed to fetch queue' }, { status: 500 });
    const pending = await r.json();

    if (pending.length === 0) return Response.json({ ok: true, processed: 0, ts: new Date().toISOString() });

    // Call the scraper edge function for each pending item (up to 3 per run to avoid timeout)
    let processed = 0;
    for (const job of pending.slice(0, 3)) {
      const scrapeRes = await fetch(`${base}/functions/v1/scraper`, {
        method: 'POST',
        headers: { ...headers, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ action: 'scrape:queue' }),
      });
      if (scrapeRes.ok) processed++;
    }

    return Response.json({ ok: true, pending: pending.length, processed, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
