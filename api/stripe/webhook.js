// api/stripe/webhook.js
// Handles Stripe webhook events — syncs subscription status to Supabase
// Set webhook endpoint in Stripe Dashboard to: https://sovereigncmd.xyz/api/stripe/webhook
// Events to enable: checkout.session.completed, customer.subscription.updated,
//                   customer.subscription.deleted, customer.subscription.trial_will_end,
//                   invoice.payment_failed, invoice.paid, customer.deleted

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../lib/send-email.js';
import { sendMetaEvent } from '../lib/meta-capi.js';
import { PLAN_MAP, STATUS_MAP } from '../lib/stripe-constants.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// Stripe requires raw body for signature verification
export const config = { api: { bodyParser: false } };


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

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

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

  // ── Idempotency: claim event atomically before processing ──
  // Insert first; a unique constraint violation means we already handled this event.
  // This avoids the TOCTOU race of check-then-insert when duplicate webhooks arrive concurrently.
  const { error: claimErr } = await sb.from('webhook_events').insert({ id: event.id });
  if (claimErr) {
    if (claimErr.code === '23505') { // unique_violation — already processed
      console.log(`[webhook] Duplicate event ${event.id} — skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    // Non-duplicate error (e.g. table unavailable) — log and proceed anyway
    console.warn('[webhook] Failed to claim event:', claimErr.message);
  }

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

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const status = STATUS_MAP[sub.status] || 'active';

        await sb.from('user_profiles').upsert({
          id: userId,
          stripe_customer_id: session.customer,
          subscription_id: subscriptionId,
          plan: PLAN_MAP[plan] || plan,
          subscription_status: status,
          trial_ends_at: sub.status === 'trialing' ? new Date(sub.trial_end * 1000).toISOString() : null,
        });

        await creditReferrer(sb, userId);

        // ── Meta CAPI ──────────────────────────────────────────────
        const { data: metaProfile } = await sb.from('user_profiles')
          .select('email, full_name').eq('id', userId).single();
        const metaEmail = metaProfile?.email || session.customer_details?.email;
        const metaName  = (metaProfile?.full_name || '').split(' ');
        if (status === 'trialing') {
          // New trial starter — fire StartTrial (custom) + CompleteRegistration
          await Promise.all([
            sendMetaEvent({
              event_name: 'StartTrial',
              user_data: { email: metaEmail, first_name: metaName[0], last_name: metaName[1], external_id: userId },
              custom_data: { content_name: PLAN_MAP[plan] || plan, currency: 'GBP', value: 0 },
              event_source_url: 'https://sovereigncmd.xyz/upgrade',
            }),
            sendMetaEvent({
              event_name: 'CompleteRegistration',
              user_data: { email: metaEmail, first_name: metaName[0], last_name: metaName[1], external_id: userId },
              custom_data: { content_name: PLAN_MAP[plan] || plan },
              event_source_url: 'https://sovereigncmd.xyz/upgrade',
            }),
          ]);
        } else {
          // Direct paid subscription (no trial)
          const amountGBP = (sub.items?.data?.[0]?.price?.unit_amount || 0) / 100;
          await sendMetaEvent({
            event_name: 'Purchase',
            user_data: { email: metaEmail, first_name: metaName[0], last_name: metaName[1], external_id: userId },
            custom_data: { currency: 'GBP', value: amountGBP, content_name: PLAN_MAP[plan] || plan },
            event_source_url: 'https://sovereigncmd.xyz/upgrade',
          });
        }

        // Send welcome email immediately on trial start (don't wait for cron)
        const { data: newProfile } = await sb.from('user_profiles')
          .select('full_name, email').eq('id', userId).single();
        const firstName = (newProfile?.full_name || '').split(' ')[0] || 'there';
        const appUrl = process.env.APP_URL || 'https://sovereigncmd.xyz';
        if (newProfile?.email) {
          const trialDays = sub.status === 'trialing' && sub.trial_end
            ? Math.ceil((sub.trial_end * 1000 - Date.now()) / 86400000) : 21;
          await sendEmail({
            to: newProfile.email,
            subject: `Welcome to Sovereign — your ${trialDays}-day trial has started`,
            html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px">
<div style="border-left:3px solid #c9a84c;padding-left:16px;margin-bottom:24px">
  <p style="font-size:11px;letter-spacing:2px;color:#c9a84c;text-transform:uppercase;margin:0">SOVEREIGN</p>
  <p style="font-size:11px;color:#71717a;margin:4px 0 0">AI-NATIVE M&A</p>
</div>
<h2 style="color:#f4f4f5;margin-bottom:8px">Welcome, ${firstName}.</h2>
<p style="color:#a1a1aa;line-height:1.7">Your ${trialDays}-day free trial is active. You have full access to every feature — pipeline CRM, all 21 AI agents, Companies House intelligence, document vault, and outreach.</p>
<p style="color:#a1a1aa;line-height:1.7">Here's where to start:</p>
<ul style="color:#a1a1aa;line-height:2;padding-left:20px">
  <li><a href="${appUrl}/command" style="color:#c9a84c;text-decoration:none">Command Centre</a> — your deal dashboard</li>
  <li><a href="${appUrl}/scout" style="color:#c9a84c;text-decoration:none">Target Scout</a> — find acquisition targets from Companies House</li>
  <li><a href="${appUrl}/pipeline" style="color:#c9a84c;text-decoration:none">Deal Pipeline</a> — track every deal stage</li>
</ul>
<a href="${appUrl}/command" style="display:inline-block;margin-top:20px;background:#c9a84c;color:#0a0a0f;border-radius:8px;padding:12px 28px;font-weight:700;text-decoration:none">Open Sovereign →</a>
<p style="margin-top:32px;font-size:12px;color:#52525b">71-75 Shelton Street, London, WC2H 9JQ, United Kingdom<br>
<a href="${appUrl}/legal" style="color:#71717a">Privacy Policy</a></p>
</div>`,
          });
        }

        console.log(`[webhook] checkout.session.completed — user ${userId} plan ${plan} status ${status}`);
        break;
      }

      // ── Checkout abandoned (session expired after 24h) ──────────
      case 'checkout.session.expired': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;
        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;
        const plan = session.metadata?.plan || 'prospector';

        const { data: profile } = await sb.from('user_profiles')
          .select('full_name, email, subscription_status').eq('id', userId).single();
        // Only send recovery email if they haven't subscribed via another session
        if (!profile?.email) break;
        if (['active', 'trialing'].includes(profile?.subscription_status)) break;

        const firstName = (profile.full_name || '').split(' ')[0] || 'there';
        const appUrl = process.env.APP_URL || 'https://sovereigncmd.xyz';
        await sendEmail({
          to: profile.email,
          subject: 'You left before starting your free trial',
          html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px">
<div style="border-left:3px solid #c9a84c;padding-left:16px;margin-bottom:24px">
  <p style="font-size:11px;letter-spacing:2px;color:#c9a84c;text-transform:uppercase;margin:0">SOVEREIGN</p>
</div>
<h2 style="color:#f4f4f5;margin-bottom:8px">Your trial is waiting, ${firstName}</h2>
<p style="color:#a1a1aa;line-height:1.7">You were one step away from a 21-day free trial of Sovereign — full access to the AI deal platform built for UK SaaS acquisitions. No charge until your trial ends.</p>
<p style="color:#a1a1aa;line-height:1.7">Your account is still ready. Pick up where you left off:</p>
<a href="${appUrl}/upgrade?plan=${plan}" style="display:inline-block;margin-top:16px;background:#c9a84c;color:#0a0a0f;border-radius:8px;padding:12px 28px;font-weight:700;text-decoration:none">Start Free Trial →</a>
<p style="margin-top:32px;font-size:12px;color:#52525b">71-75 Shelton Street, London, WC2H 9JQ, United Kingdom<br>
<a href="${appUrl}/legal" style="color:#71717a">Privacy Policy</a></p>
</div>`,
        });
        console.log(`[webhook] checkout.session.expired — recovery email sent to user ${userId}`);
        break;
      }

      // ── Subscription updated (plan change, renewal, trial end) ─
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) {
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
        const userId = sub.metadata?.supabase_user_id
          || (await resolveUserFromCustomer(stripe, sub.customer));
        if (!userId) break;
        await sb.from('user_profiles').update({
          subscription_status: 'cancelled',
          plan: 'cancelled',
          referral_credits: 0,  // prevent abuse on re-signup
        }).eq('id', userId);
        console.log(`[webhook] subscription.deleted — user ${userId}`);
        break;
      }

      // ── Trial ending in 3 days — send reminder ─────────────────
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id
          || (await resolveUserFromCustomer(stripe, sub.customer));
        if (!userId) break;
        const { data: profile } = await sb.from('user_profiles')
          .select('full_name, email').eq('id', userId).single();
        const firstName = (profile?.full_name || '').split(' ')[0] || 'there';
        const userEmail = profile?.email;
        if (userEmail) {
          await sendEmail({
            to: userEmail,
            subject: 'Your Sovereign trial ends in 3 days',
            html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px">
<h2 style="color:#c9a84c;margin-bottom:8px">⏱ 3 days left, ${firstName}</h2>
<p style="color:#a1a1aa;line-height:1.7">Your free trial ends in 3 days. Subscribe now to keep your full pipeline, all 21 agents, and your deals active.</p>
<a href="https://sovereigncmd.xyz/upgrade" style="display:inline-block;margin-top:16px;background:#c9a84c;color:#0a0a0f;border-radius:8px;padding:12px 24px;font-weight:700;text-decoration:none">Upgrade Now</a>
<p style="margin-top:24px;font-size:12px;color:#71717a">If you don't upgrade, your data is retained for 30 days — you can reactivate at any time.</p>
</div>`,
          });
        }
        console.log(`[webhook] trial_will_end — user ${userId}`);
        break;
      }

      // ── Customer deleted from Stripe Dashboard ─────────────────
      case 'customer.deleted': {
        const customer = event.data.object;
        const userId = customer.metadata?.supabase_user_id;
        if (!userId) break;
        await sb.from('user_profiles').update({
          subscription_status: 'cancelled',
          plan: 'cancelled',
          stripe_customer_id: null,
          subscription_id: null,
          referral_credits: 0,
        }).eq('id', userId);
        console.log(`[webhook] customer.deleted — user ${userId}`);
        break;
      }

      // ── Payment failed → past due + notify user ────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;
        await sb.from('user_profiles').update({ subscription_status: 'past_due' }).eq('id', userId);

        // Notify user so they can update their payment method
        const { data: profile } = await sb.from('user_profiles')
          .select('full_name, email').eq('id', userId).single();
        const firstName = (profile?.full_name || '').split(' ')[0] || 'there';
        const userEmail = profile?.email;
        if (userEmail) {
          await sendEmail({
            to: userEmail,
            subject: 'Action required: payment failed on your Sovereign subscription',
            html: `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px">
<h2 style="color:#f87171;margin-bottom:8px">⚠ Payment failed, ${firstName}</h2>
<p style="color:#a1a1aa;line-height:1.7">We couldn't process your subscription payment. Please update your payment method to keep uninterrupted access to Sovereign.</p>
<a href="https://sovereigncmd.xyz/upgrade" style="display:inline-block;margin-top:16px;background:#f87171;color:#fff;border-radius:8px;padding:12px 24px;font-weight:700;text-decoration:none">Update Payment Method</a>
<p style="margin-top:24px;font-size:12px;color:#71717a">Stripe will retry automatically. If payment continues to fail, your subscription will be cancelled.</p>
</div>`,
          });
        }
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
        // Fire Purchase for renewals (not the first invoice which is covered by checkout.session.completed)
        if (invoice.billing_reason === 'subscription_cycle') {
          const { data: profile } = await sb.from('user_profiles')
            .select('email, full_name').eq('id', userId).single();
          const name = (profile?.full_name || '').split(' ');
          const amountGBP = (invoice.amount_paid || 0) / 100;
          await sendMetaEvent({
            event_name: 'Purchase',
            user_data: { email: profile?.email, first_name: name[0], last_name: name[1], external_id: userId },
            custom_data: { currency: 'GBP', value: amountGBP, content_name: sub.metadata?.plan || 'subscription' },
            event_source_url: 'https://sovereigncmd.xyz',
          });
        }
        console.log(`[webhook] invoice.paid — user ${userId} status ${status}`);
        break;
      }

      default:
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

async function resolveUserFromCustomer(stripe, customerId) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer?.metadata?.supabase_user_id || null;
  } catch {
    return null;
  }
}

async function creditReferrer(sb, referredUserId) {
  try {
    const { data: referral } = await sb.from('referrals')
      .select('id, referrer_id, status, reward_applied_at')
      .eq('referred_user_id', referredUserId)
      .single();

    if (!referral || referral.reward_applied_at) return;

    await sb.from('referrals').update({
      status: 'subscribed',
      reward_applied_at: new Date().toISOString(),
    }).eq('id', referral.id);

    await sb.rpc('increment_referral_credits', { user_id: referral.referrer_id, days: 30 });
    await sb.rpc('increment_referral_credits', { user_id: referredUserId, days: 30 });

    console.log(`[webhook] Referral credited — referrer ${referral.referrer_id} +30 days`);
  } catch (e) {
    console.error('[webhook] creditReferrer error:', e.message);
  }
}
