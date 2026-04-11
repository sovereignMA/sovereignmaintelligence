// api/reddit-events.js
// Client-side Reddit CAPI relay — browser sends events here to deduplicate with browser pixel
// Forwards real IP + User-Agent from the visitor for better match rates
// POST /api/reddit-events { event_type, click_id?, user_data?, event_metadata? }

import { setCORS } from './lib/cors-auth.js';
import { sendRedditEvent } from './lib/reddit-capi.js';

const ALLOWED = new Set(['PageVisit', 'ViewContent', 'Search', 'Purchase', 'Lead', 'SignUp']);

export default async function handler(req, res) {
  setCORS(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { event_type, click_id, user_data = {}, event_metadata = {} } = req.body || {};
  if (!event_type || !ALLOWED.has(event_type)) {
    return res.status(400).json({ error: 'Invalid event_type' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
  const ua = req.headers['user-agent'] || '';

  await sendRedditEvent({
    event_type,
    click_id,
    user_data: { ...user_data, ip, user_agent: ua },
    event_metadata,
  });

  return res.status(200).json({ ok: true });
}
