// api/cron/trial-drip.js
// Daily trial lifecycle email sequence — runs at 09:00 UTC
// Sends the right email based on where each trial user is in their journey

import { sendEmail } from '../lib/send-email.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const sbHeaders = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const base = process.env.SUPABASE_URL;
  const appUrl = process.env.APP_URL || 'https://sovereigncmd.xyz';

  try {
    const now = new Date();
    // Fetch trial users created in the last 21 days (covers all active drip stages)
    const cutoff = new Date(now.getTime() - 21 * 86400000).toISOString();
    const res = await fetch(
      `${base}/rest/v1/user_profiles?select=id,email,full_name,created_at,trial_ends_at,plan,subscription_status&plan=eq.trial&email=not.is.null&created_at=gte.${cutoff}`,
      { headers: sbHeaders }
    );
    if (!res.ok) return Response.json({ ok: false, error: `DB fetch failed: ${res.status}` }, { status: 500 });
    const users = await res.json();
    const tasks = [];
    let skipped = 0;

    for (const user of users) {
      if (!user.email) { skipped++; continue; }

      const firstName = (user.full_name || '').split(' ')[0] || 'there';
      const createdAt = new Date(user.created_at);
      const trialEnds = user.trial_ends_at ? new Date(user.trial_ends_at) : null;

      const daysSinceSignup = Math.floor((now - createdAt) / 86400000);
      const daysUntilEnd = trialEnds ? Math.ceil((trialEnds - now) / 86400000) : null;
      const daysSinceEnd = trialEnds ? Math.floor((now - trialEnds) / 86400000) : null;

      let template = null;
      let emailPayload = null;

      if (daysSinceSignup === 0) {
        template = 'welcome';
        emailPayload = buildWelcome(firstName, appUrl);
      } else if (daysSinceSignup === 3) {
        template = 'feature_highlight';
        emailPayload = buildFeatureHighlight(firstName, appUrl);
      } else if (daysSinceSignup === 7) {
        template = 'midpoint';
        emailPayload = buildMidpoint(firstName, appUrl, daysUntilEnd);
      } else if (daysUntilEnd === 2) {
        template = 'urgency_2d';
        emailPayload = buildUrgency(firstName, appUrl);
      } else if (daysSinceEnd === 0) {
        template = 'trial_ended';
        emailPayload = buildTrialEnded(firstName, appUrl);
      } else if (daysSinceEnd === 2) {
        template = 'discount_expiry';
        emailPayload = buildDiscountExpiry(firstName, appUrl);
      }

      if (!emailPayload) { skipped++; continue; }

      tasks.push({ user, template, emailPayload });
    }

    // Send all emails in parallel
    const results = await Promise.allSettled(
      tasks.map(({ emailPayload, user }) => sendEmail({ ...emailPayload, to: user.email }))
    );

    const sent = [];
    const auditBase = `${base}/rest/v1/audit_trail`;
    const auditHeaders = { ...sbHeaders, 'Prefer': 'return=minimal' };

    results.forEach((r, i) => {
      const { user, template } = tasks[i];
      const result = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message };
      sent.push({ user_id: user.id, email: user.email, template, ok: result.ok, error: result.error });

      // Audit trail — fire-and-forget, don't block response
      fetch(auditBase, {
        method: 'POST',
        headers: auditHeaders,
        body: JSON.stringify({
          actor_id: user.id,
          event: `trial_email.${template}`,
          agent: 'trial-drip',
          details: result.ok ? `Sent ${template} email` : `Failed: ${result.error}`,
          status: result.ok ? 'ok' : 'error',
        }),
      }).catch(() => {});
    });

    return Response.json({ ok: true, sent, skipped, ts: now.toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// ── Email templates ────────────────────────────────────────────────────────────

function emailWrap(body) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px;">
  <div style="border-bottom:2px solid #c9a84c;padding-bottom:14px;margin-bottom:24px;">
    <span style="font-size:18px;font-weight:800;color:#c9a84c;letter-spacing:1px;">⬡ SOVEREIGN</span>
  </div>
  <div style="font-size:14px;line-height:1.7;color:#d4d4d8;">${body}</div>
  <div style="margin-top:32px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:#52525b;">
    Project Sovereign · <a href="https://sovereigncmd.xyz" style="color:#c9a84c;">sovereigncmd.xyz</a>
    · <a href="https://sovereigncmd.xyz/upgrade" style="color:#71717a;">Unsubscribe</a>
  </div>
</div>`;
}

function cta(text, url) {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#c9a84c;color:#0a0a0f;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">${text}</a>`;
}

function buildWelcome(name, appUrl) {
  return {
    subject: `Welcome to Sovereign, ${name} — your 21-agent deal team is ready`,
    html: emailWrap(`
<h2 style="color:#fff;margin:0 0 16px;font-size:20px;">Welcome aboard, ${name}.</h2>
<p>Your trial has started. Here's how to get your first acquisition target in 5 minutes:</p>
<ol style="padding-left:18px;margin:16px 0;color:#a1a1aa;">
  <li style="margin-bottom:10px;color:#d4d4d8;"><strong style="color:#fff;">Open Scout</strong> — search any UK company name or sector. The agent runs 8 data sources in parallel.</li>
  <li style="margin-bottom:10px;color:#d4d4d8;"><strong style="color:#fff;">Add to Pipeline</strong> — one click. Deal scoring, stage tracking, and activity log activate automatically.</li>
  <li style="margin-bottom:10px;color:#d4d4d8;"><strong style="color:#fff;">Run Intelligence</strong> — news feed, Companies House filings, Trustpilot, and LinkedIn signals in one view.</li>
</ol>
<p style="color:#a1a1aa;">Your trial includes all features. No restrictions, no watermarks.</p>
${cta('Open Command Centre →', `${appUrl}/command`)}
<p style="margin-top:20px;font-size:13px;color:#71717a;">Questions? Reply to this email — we read every one.</p>
`),
  };
}

function buildFeatureHighlight(name, appUrl) {
  return {
    subject: `${name}, have you tried the Intelligence feed yet?`,
    html: emailWrap(`
<h2 style="color:#fff;margin:0 0 16px;font-size:20px;">The feature most users find first on day 3.</h2>
<p>The <strong style="color:#c9a84c;">Intelligence module</strong> aggregates live signals for every company in your pipeline:</p>
<ul style="padding-left:18px;margin:14px 0;color:#a1a1aa;">
  <li style="margin-bottom:8px;color:#d4d4d8;">Breaking news and sentiment analysis</li>
  <li style="margin-bottom:8px;color:#d4d4d8;">Companies House filings (accounts, confirmation statements, PSC changes)</li>
  <li style="margin-bottom:8px;color:#d4d4d8;">Trustpilot and Glassdoor signals</li>
  <li style="margin-bottom:8px;color:#d4d4d8;">Funding and acquisition activity</li>
  <li style="margin-bottom:8px;color:#d4d4d8;">LinkedIn headcount trends</li>
</ul>
<p>If a target files accounts or gets acquired — you'll know before the broker does.</p>
${cta('Open Intelligence →', `${appUrl}/intelligence`)}
`),
  };
}

function buildMidpoint(name, appUrl, daysLeft) {
  const daysStr = daysLeft != null ? `${daysLeft} days` : 'a week';
  return {
    subject: `Halfway through your trial, ${name} — here's what's working`,
    html: emailWrap(`
<h2 style="color:#fff;margin:0 0 16px;font-size:20px;">You're halfway through your trial.</h2>
<p>You have <strong style="color:#c9a84c;">${daysStr}</strong> left. If you've added deals and run searches — the hard part is done. The pipeline pays for itself when you close one deal.</p>
<p style="margin-top:16px;color:#a1a1aa;">A few things worth trying before your trial ends:</p>
<ul style="padding-left:18px;margin:14px 0;color:#a1a1aa;">
  <li style="margin-bottom:8px;color:#d4d4d8;"><strong style="color:#fff;">Command Engine</strong> — ask the AI anything about your deals. "Which targets have declining headcount?" "Draft an intro email for TechCo Ltd."</li>
  <li style="margin-bottom:8px;color:#d4d4d8;"><strong style="color:#fff;">Analytics</strong> — see your pipeline velocity, deal score trends, and outreach activity.</li>
  <li style="margin-bottom:8px;color:#d4d4d8;"><strong style="color:#fff;">Vault</strong> — store NDA templates, LOIs, and due diligence checklists per deal.</li>
</ul>
${cta('Upgrade Now — Keep Your Pipeline →', `${appUrl}/upgrade`)}
<p style="margin-top:16px;font-size:13px;color:#71717a;">Plans from £99/month. Cancel anytime.</p>
`),
  };
}

function buildUrgency(name, appUrl) {
  return {
    subject: `2 days left on your Sovereign trial, ${name}`,
    html: emailWrap(`
<h2 style="color:#fff;margin:0 0 16px;font-size:20px;">Your trial ends in 2 days.</h2>
<p>After that, your pipeline, intel data, and AI agents will be paused.</p>
<p style="margin-top:14px;">Everything you've built stays safe — deals, contacts, documents, conversation history. You just won't be able to add new searches or run agents until you upgrade.</p>
<p style="margin-top:16px;font-size:15px;font-weight:700;color:#c9a84c;">Upgrade now to keep the momentum going.</p>
${cta('Choose Your Plan →', `${appUrl}/upgrade`)}
<p style="margin-top:16px;font-size:13px;color:#71717a;">Prospector from £99/mo · Dealmaker from £299/mo · Cancel anytime.</p>
`),
  };
}

function buildTrialEnded(name, appUrl) {
  return {
    subject: `Your Sovereign trial has ended, ${name} — upgrade with 20% off`,
    html: emailWrap(`
<h2 style="color:#fff;margin:0 0 16px;font-size:20px;">Your trial has ended.</h2>
<p>Your data is safe and your pipeline is intact. To get back in, choose a plan.</p>
<p style="margin-top:16px;padding:16px;background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.25);border-radius:8px;">
  <strong style="color:#c9a84c;font-size:15px;">🎁 Trial-end offer: 20% off your first 3 months.</strong><br>
  <span style="color:#a1a1aa;font-size:13px;">Use code <strong style="color:#fff;font-family:monospace;">SOVEREIGN20</strong> at checkout. Expires in 48 hours.</span>
</p>
${cta('Claim 20% Off →', `${appUrl}/upgrade`)}
<p style="margin-top:16px;font-size:13px;color:#71717a;">Enter code SOVEREIGN20 at checkout. Monthly or annual billing.</p>
`),
  };
}

function buildDiscountExpiry(name, appUrl) {
  return {
    subject: `Last chance: 20% off expires tonight, ${name}`,
    html: emailWrap(`
<h2 style="color:#fff;margin:0 0 16px;font-size:20px;">Your discount expires tonight.</h2>
<p>The 20% off code <strong style="color:#c9a84c;font-family:monospace;">SOVEREIGN20</strong> expires at midnight.</p>
<p style="margin-top:14px;color:#a1a1aa;">After that it's full price. If you're going to upgrade, now's the moment.</p>
${cta('Upgrade Before Midnight →', `${appUrl}/upgrade`)}
<p style="margin-top:16px;font-size:13px;color:#71717a;">Use code SOVEREIGN20 at checkout. No tricks — just a straight 20% off your first 3 months.</p>
`),
  };
}
