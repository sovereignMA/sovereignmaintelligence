// api/cron/stripe-reconcile.js
// Daily Stripe ↔ DB reconciliation — runs at 02:00 UTC
// Fetches all active/trialing Stripe subscriptions and syncs any that have
// drifted from the DB (missed webhooks, race conditions, manual dashboard changes).
// Safe to run repeatedly: only updates rows where DB and Stripe disagree.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const STATUS_MAP = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  unpaid: 'past_due',
  incomplete: 'past_due',
  incomplete_expired: 'cancelled',
  paused: 'paused',
};

const PLAN_MAP = {
  prospector: 'prospector', dealmaker: 'dealmaker',
  team: 'team', fund: 'fund',
  solo: 'prospector', enterprise: 'fund',
};

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let synced = 0;
  let checked = 0;
  const errors = [];

  // Page through all non-cancelled Stripe subscriptions
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })) {
    checked++;
    const userId = sub.metadata?.supabase_user_id
      || sub.customer?.metadata?.supabase_user_id;
    if (!userId) continue;

    const stripeStatus = STATUS_MAP[sub.status] || sub.status;
    const stripePlan = PLAN_MAP[sub.metadata?.plan] || sub.metadata?.plan || null;
    const stripeTrialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

    const { data: profile } = await sb.from('user_profiles')
      .select('subscription_status, plan, trial_ends_at, subscription_id')
      .eq('id', userId).single();

    if (!profile) continue;

    // Detect drift: status, plan, trial_ends_at, or subscription_id mismatch
    const statusDrift   = profile.subscription_status !== stripeStatus;
    const planDrift     = stripePlan && profile.plan !== stripePlan;
    const trialDrift    = stripeTrialEnd && profile.trial_ends_at !== stripeTrialEnd;
    const subIdDrift    = profile.subscription_id !== sub.id;

    if (!statusDrift && !planDrift && !trialDrift && !subIdDrift) continue;

    const updates = {
      subscription_id: sub.id,
      subscription_status: stripeStatus,
    };
    if (stripePlan) updates.plan = stripePlan;
    if (stripeTrialEnd) updates.trial_ends_at = stripeTrialEnd;

    const { error } = await sb.from('user_profiles').update(updates).eq('id', userId);
    if (error) {
      errors.push({ userId, error: error.message });
    } else {
      synced++;
      console.log(`[stripe-reconcile] Fixed drift for user ${userId}: status ${profile.subscription_status}→${stripeStatus}`);
    }
  }

  console.log(`[stripe-reconcile] Done — checked ${checked}, synced ${synced}, errors ${errors.length}`);
  return res.status(200).json({ ok: true, checked, synced, errors });
}
