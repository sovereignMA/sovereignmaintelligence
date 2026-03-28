// api/stripe/webhook.js
// Handles Stripe webhook events — syncs subscription status to Supabase
// Set webhook endpoint in Stripe Dashboard to: https://sovereigncmd.xyz/api/stripe/webhook
// Events to enable: checkout.session.completed, customer.subscription.updated,
//                   customer.subscription.deleted, invoice.payment_failed, invoice.paid

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Stripe requires raw body for signature verification
export const config = { api: { bodyParser: false } };

// Map Stripe plan metadata to our plan names
const PLAN_MAP = {
  prospector: 'prospector',
  dealmaker:  'dealmaker',
  team:       'team',
  fund:       'fund',
  // legacy
  solo:       'prospector',
  enterprise: 'fund',
};

// Map Stripe subscription status to our status
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

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('[webhook] Signature verification failed:', e.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {

      // ── Checkout completed → subscription activated ────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;
        const userId = session.metadata?.supabase_user_id;
        if (!userId) { console.error('[webhook] No supabase_user_id in session metadata'); break; }

        const plan = session.metadata?.plan || 'solo';
        const subscriptionId = session.subscription;

        // Fetch full subscription to get status
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const status = STATUS_MAP[sub.status] || 'active';

        await sb.from('user_profiles').upsert({
          id: userId,
          stripe_customer_id: session.customer,
          subscription_id: subscriptionId,
          plan: PLAN_MAP[plan] || plan,
          subscription_status: status,
          // Clear trial end since they've now subscribed
          trial_ends_at: sub.status === 'trialing' ? new Date(sub.trial_end * 1000).toISOString() : null,
        });

        // If referred user just subscribed, credit the referrer
        await creditReferrer(sb, userId);

        console.log(`[webhook] checkout.session.completed — user ${userId} plan ${plan} status ${status}`);
        break;
      }

      // ── Subscription updated (plan change, renewal, trial end) ─
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) {
          // Fall back to customer lookup
          const customer = await stripe.customers.retrieve(sub.customer);
          const fallbackId = customer?.metadata?.supabase_user_id;
          if (!fallbackId) { console.error('[webhook] Cannot resolve user for subscription update'); break; }
          await syncSubscription(sb, fallbackId, sub);
        } else {
          await syncSubscription(sb, userId, sub);
        }
        break;
      }

      // ── Subscription deleted / cancelled ───────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) {
          const customer = await stripe.customers.retrieve(sub.customer);
          const fallbackId = customer?.metadata?.supabase_user_id;
          if (!fallbackId) break;
          await sb.from('user_profiles').update({
            subscription_status: 'cancelled',
            plan: 'cancelled',
          }).eq('id', fallbackId);
        } else {
          await sb.from('user_profiles').update({
            subscription_status: 'cancelled',
            plan: 'cancelled',
          }).eq('id', userId);
        }
        console.log(`[webhook] subscription.deleted — user ${userId}`);
        break;
      }

      // ── Payment failed → past due ──────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;
        await sb.from('user_profiles').update({ subscription_status: 'past_due' }).eq('id', userId);
        console.log(`[webhook] invoice.payment_failed — user ${userId}`);
        break;
      }

      // ── Invoice paid → ensure active ──────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;
        const status = STATUS_MAP[sub.status] || 'active';
        await sb.from('user_profiles').update({ subscription_status: status }).eq('id', userId);
        console.log(`[webhook] invoice.paid — user ${userId} status ${status}`);
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }

    return res.status(200).json({ received: true });

  } catch (e) {
    console.error('[webhook] Handler error:', e.message);
    return res.status(500).json({ error: 'Webhook handler error' });
  }
}

async function syncSubscription(sb, userId, sub) {
  const status = STATUS_MAP[sub.status] || sub.status;
  const plan = sub.metadata?.plan || 'solo';
  const updates = {
    subscription_id: sub.id,
    subscription_status: status,
    plan: PLAN_MAP[plan] || plan,
  };
  if (sub.trial_end) {
    updates.trial_ends_at = new Date(sub.trial_end * 1000).toISOString();
  }
  await sb.from('user_profiles').update(updates).eq('id', userId);
  console.log(`[webhook] subscription.updated — user ${userId} plan ${plan} status ${status}`);
}

async function creditReferrer(sb, referredUserId) {
  try {
    // Find referral record for this user
    const { data: referral } = await sb.from('referrals')
      .select('id, referrer_id, status, reward_applied_at')
      .eq('referred_user_id', referredUserId)
      .single();

    if (!referral || referral.reward_applied_at) return; // Already credited or no referral

    // Mark referral as subscribed + apply 30-day credit to referrer
    await sb.from('referrals').update({
      status: 'subscribed',
      reward_applied_at: new Date().toISOString(),
    }).eq('id', referral.id);

    // Add 30 days credit to both referrer and referred user
    await sb.rpc('increment_referral_credits', { user_id: referral.referrer_id, days: 30 });
    await sb.rpc('increment_referral_credits', { user_id: referredUserId, days: 30 });

    console.log(`[webhook] Referral credited — referrer ${referral.referrer_id} +30 days`);
  } catch (e) {
    console.error('[webhook] creditReferrer error:', e.message);
  }
}
