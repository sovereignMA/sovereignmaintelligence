// api/stripe/checkout.js
// Creates a Stripe Checkout Session for the selected plan + billing cycle
// POST { plan: 'prospector'|'dealmaker'|'team'|'fund', billing: 'monthly'|'annual' }
// Requires: Authorization: Bearer <supabase_jwt>

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const PRICE_IDS = {
  prospector: { monthly: process.env.STRIPE_PRICE_PROSPECTOR_MONTHLY, annual: process.env.STRIPE_PRICE_PROSPECTOR_ANNUAL },
  dealmaker:  { monthly: process.env.STRIPE_PRICE_DEALMAKER_MONTHLY,  annual: process.env.STRIPE_PRICE_DEALMAKER_ANNUAL  },
  team:       { monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,       annual: process.env.STRIPE_PRICE_TEAM_ANNUAL       },
  fund:       { monthly: process.env.STRIPE_PRICE_FUND_MONTHLY,       annual: process.env.STRIPE_PRICE_FUND_ANNUAL       },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth — verify Supabase JWT
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { plan = 'solo', billing = 'monthly' } = req.body || {};

  // Validate inputs
  if (!PRICE_IDS[plan]) return res.status(400).json({ error: `Unknown plan: ${plan}` });
  const priceId = PRICE_IDS[plan][billing];
  if (!priceId) return res.status(400).json({ error: `Selected plan is not available. Please contact support.` });

  try {
    // Get or create Stripe customer
    const { data: profile } = await sb.from('user_profiles')
      .select('stripe_customer_id, full_name, referral_credits')
      .eq('id', user.id).single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.full_name || user.user_metadata?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Store customer ID immediately
      await sb.from('user_profiles').upsert({ id: user.id, stripe_customer_id: customerId });
    }

    const appUrl = process.env.APP_URL || 'https://sovereigncmd.xyz';

    // Compute trial days: sync with existing DB trial + any referral credits
    let trialDays = 0;
    if (profile?.trial_ends_at) {
      const daysLeft = Math.ceil((new Date(profile.trial_ends_at) - new Date()) / 86400000);
      if (daysLeft > 0) trialDays = daysLeft;
    }
    // Add referral credits on top, cap at 90
    if ((profile?.referral_credits || 0) > 0) {
      trialDays = Math.min(trialDays + profile.referral_credits, 90);
    }
    // Default 21-day trial for first-time subscribers with no trial record
    if (trialDays === 0 && !profile?.trial_ends_at) trialDays = 21;

    const sessionParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/command?checkout=success`,
      cancel_url: `${appUrl}/upgrade`,
      allow_promotion_codes: true,
      payment_method_collection: trialDays > 0 ? 'if_required' : 'always',
      metadata: { supabase_user_id: user.id, plan, billing },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan, billing },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      customer_update: { address: 'auto' },
      automatic_tax: { enabled: true },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });

  } catch (e) {
    console.error('[stripe/checkout]', e.message);
    return res.status(500).json({ error: 'Checkout unavailable. Please try again.' });
  }
}
