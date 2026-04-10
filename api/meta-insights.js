// api/meta-insights.js
// Returns Meta Pixel event stats + CAPI delivery info for the campaigns dashboard
// GET /api/meta-insights?days=7|30|90

import { setCORS } from './lib/cors-auth.js';
import { PIXEL_ID, GRAPH_BASE as BASE } from './lib/meta-config.js';

export default async function handler(req, res) {
  setCORS(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: 'META_ACCESS_TOKEN not configured' });

  const days = Math.min(90, Math.max(1, parseInt(req.query.days || '30', 10)));
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - days * 86400;

  try {
    const [pixelInfo, statsRaw] = await Promise.all([
      // Pixel metadata
      fetch(`${BASE}/${PIXEL_ID}?fields=name,last_fired_time&access_token=${token}`)
        .then(r => r.json()),

      // All event counts aggregated by event name (browser pixel + CAPI combined)
      fetch(`${BASE}/${PIXEL_ID}/stats?aggregation=EVENT&start_time=${startTime}&end_time=${now}&access_token=${token}`)
        .then(r => r.json()),
    ]);

    // Surface Meta API-level errors (they return HTTP 200 with { error: {...} })
    if (pixelInfo.error) {
      return res.status(502).json({ error: `Meta API: ${pixelInfo.error.message || JSON.stringify(pixelInfo.error)}` });
    }
    if (statsRaw.error) {
      return res.status(502).json({ error: `Meta API: ${statsRaw.error.message || JSON.stringify(statsRaw.error)}` });
    }

    // Normalise stats array → { EventName: count }
    const allEvents = {};
    (statsRaw.data || []).forEach(d => {
      if (d.event) allEvents[d.event] = (allEvents[d.event] || 0) + Number(d.count || 0);
    });

    return res.status(200).json({
      pixel: {
        id: PIXEL_ID,
        name: pixelInfo.name || null,
        last_fired_time: pixelInfo.last_fired_time || null,
      },
      days,
      events: allEvents, // browser pixel + CAPI combined (same action_source: 'website')
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
