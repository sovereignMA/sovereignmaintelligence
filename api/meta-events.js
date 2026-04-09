// api/meta-events.js
// Client-side CAPI relay — browser sends events here to deduplicate with browser pixel
// Forwards IP + User-Agent from the actual visitor for better audience matching
// POST /api/meta-events { event_name, event_id, user_data?, custom_data?, event_source_url? }

import { sendMetaEvent } from './lib/meta-capi.js';

// Only safe browser-initiated events are allowed through this public endpoint
const ALLOWED = new Set(['PageView', 'ViewContent', 'Lead', 'InitiateCheckout', 'CompleteRegistration', 'Search']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://sovereigncmd.xyz');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { event_name, event_id, user_data = {}, custom_data = {}, event_source_url } = req.body || {};
  if (!event_name || !ALLOWED.has(event_name)) {
    return res.status(400).json({ error: 'Invalid event_name' });
  }

  // Enrich with real visitor IP + UA for better match rates
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const ua = req.headers['user-agent'] || '';

  await sendMetaEvent({
    event_name,
    event_id,
    user_data: { ...user_data, ip, user_agent: ua },
    custom_data,
    event_source_url,
  });

  return res.status(200).json({ ok: true });
}
