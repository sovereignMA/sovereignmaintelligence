// api/stripe/portal.js
// Creates a Stripe Customer Portal session so users can manage/cancel their subscription
// POST {} (no body needed)
// Requires: Authorization: Bearer <supabase_jwt>

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

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
    return res.status(500).json({ error: 'Portal unavailable. Please try again.' });
  }
}
