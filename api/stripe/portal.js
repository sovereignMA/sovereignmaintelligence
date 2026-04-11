// api/stripe/portal.js
// Creates a Stripe Customer Portal session so users can manage/cancel their subscription
// POST {} (no body needed)
// Requires: Authorization: Bearer <supabase_jwt>

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { setCORS } from '../lib/cors-auth.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCORS(req, res); return res.status(200).end(); }
  setCORS(req, res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Rate limit: max 5 portal requests per user per minute
  const windowStart = new Date(Date.now() - 60 * 1000).toISOString();
  const { count } = await sb.from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('event_name', 'portal_attempt')
    .gt('created_at', windowStart);
  if ((count || 0) >= 5) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  sb.from('analytics_events').insert({ user_id: user.id, event_name: 'portal_attempt', event_cat: 'billing' }).then(() => {});

  const { data: profile } = await sb.from('user_profiles')
    .select('stripe_customer_id').eq('id', user.id).single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'No active subscription found. Please subscribe first.' });
  }

  try {
    const appUrl = process.env.APP_URL || 'https://sovereigncmd.xyz';
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/command`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[stripe/portal]', e.message);
    if (e.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ error: 'No active subscription found. Please subscribe first.' });
    }
    return res.status(503).json({ error: 'Billing portal temporarily unavailable. Please try again.' });
  }
}
