import { sendEmail } from '../lib/send-email.js';

export const config = { runtime: 'nodejs' };

// SIC codes associated with SaaS / software businesses
const TARGET_SIC_CODES = new Set([62012, 62020, 62090, 63110, 63120, 58290]);

const SEARCH_TERMS = [
  'saas software uk',
  'cloud platform technology',
  'b2b software services',
];

// ── Companies House helpers ────────────────────────────────────────────────────

function chAuthHeader(apiKey) {
  return 'Basic ' + Buffer.from(apiKey + ':').toString('base64');
}

async function searchCompaniesHouse(term, apiKey) {
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(term)}&items_per_page=20`;
  const res = await fetch(url, {
    headers: { Authorization: chAuthHeader(apiKey) },
  });
  if (!res.ok) {
    console.warn(`[scout-targets] CH search failed for "${term}": ${res.status}`);
    return [];
  }
  const json = await res.json();
  return json.items || [];
}

// ── Scoring ────────────────────────────────────────────────────────────────────

function ageInYears(dateString) {
  if (!dateString) return null;
  const created = new Date(dateString);
  const now = new Date();
  return (now - created) / (1000 * 60 * 60 * 24 * 365.25);
}

function scoreCompany(company) {
  const status = (company.company_status || '').toLowerCase();
  const type = (company.company_type || '').toLowerCase();
  const sicCodes = (company.sic_codes || []).map(Number);
  const age = ageInYears(company.date_of_creation);

  // Hard exclusions — skip before scoring
  const badStatuses = ['dissolved', 'liquidation', 'administration', 'receivership', 'voluntary-arrangement'];
  if (badStatuses.some(s => status.includes(s))) return null;

  // Age gates
  if (age === null) return null;
  if (age < 3 || age > 12) return null;

  let score = 0;

  // SIC code match
  if (sicCodes.some(c => TARGET_SIC_CODES.has(c))) score += 30;

  // Age band (already passed gate, so always true here)
  score += 20;

  // Active status
  if (status === 'active') score += 20;

  // Accounts filed (companies_house returns accounts.last_accounts.made_up_to when present)
  if (company.accounts && company.accounts.last_accounts && company.accounts.last_accounts.made_up_to) {
    score += 10;
  }

  // Company type: ltd / private-limited-guarant-nsc-limited-exemption / etc.
  if (type.includes('ltd') || type.includes('limited')) score += 10;

  return score;
}

// ── Fuzzy pipeline exclusion ────────────────────────────────────────────────────

function alreadyInPipeline(companyName, dealNames) {
  const normalise = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const needle = normalise(companyName);
  return dealNames.some(d => normalise(d) === needle);
}

// ── Email HTML ─────────────────────────────────────────────────────────────────

function buildEmailHtml({ userName, targets, dateLabel }) {
  const rows = targets.slice(0, 10).map(t => {
    const age = ageInYears(t.date_of_creation);
    const ageStr = age !== null ? `${Math.floor(age)}yr` : '—';
    const incorporated = t.date_of_creation
      ? new Date(t.date_of_creation).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';
    return `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${t.title || t.company_name || '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06);white-space:nowrap">${incorporated}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center">${ageStr}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06);text-align:center;color:#c9a84c;font-weight:600">${t._score}</td>
    </tr>`;
  }).join('');

  const greeting = userName ? `Hi ${userName.split(' ')[0]},` : 'Hi,';
  const count = Math.min(targets.length, 10);

  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; color: #e4e4e7; background: #07080f; padding: 32px 24px; border-radius: 12px;">
  <div style="border-bottom: 2px solid #c9a84c; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: #c9a84c; letter-spacing: 1px;">⬡ WEEKLY TARGET DIGEST</h1>
    <p style="margin: 4px 0 0; font-size: 13px; color: #71717a;">Scout run — ${dateLabel}</p>
  </div>
  <p style="font-size: 14px; margin: 0 0 20px; color: #a1a1aa;">${greeting} We found <strong style="color:#e4e4e7">${count} new UK SaaS acquisition target${count !== 1 ? 's' : ''}</strong> this week that match your criteria.</p>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 28px;">
    <tr style="color: #71717a; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <th style="padding:6px 12px;font-weight:500">Company</th>
      <th style="padding:6px 12px;font-weight:500">Incorporated</th>
      <th style="padding:6px 12px;font-weight:500;text-align:center">Age</th>
      <th style="padding:6px 12px;font-weight:500;text-align:center">Score</th>
    </tr>
    ${rows}
  </table>
  <div style="margin-top: 8px;">
    <a href="https://sovereigncmd.xyz/scout" style="display: inline-block; padding: 9px 22px; background: #c9a84c; color: #07080f; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">Open Scout →</a>
  </div>
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #71717a;">
    <p style="margin: 0;">Sovereign Scout • Weekly acquisition intelligence • <a href="https://sovereigncmd.xyz/settings" style="color:#71717a">Manage preferences</a></p>
  </div>
</div>`;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export default async function handler(req) {
  // 1. Auth
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 8. Guard: no CH key → skip gracefully
  if (!process.env.COMPANIES_HOUSE_API_KEY) {
    console.warn('[scout-targets] COMPANIES_HOUSE_API_KEY not set — skipping CH fetch');
    return Response.json({ ok: true, skipped: 'no_ch_key' });
  }

  const sbHeaders = {
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const base = process.env.SUPABASE_URL;
  const now = new Date().toISOString();

  try {
    // 2. Get active / trialing users
    const usersRes = await fetch(
      `${base}/rest/v1/user_profiles?select=id,email,full_name,plan&subscription_status=in.(active,trialing)&or=(trial_ends_at.is.null,trial_ends_at.gt.${now})`,
      { headers: sbHeaders }
    );
    if (!usersRes.ok) {
      return Response.json({ ok: false, error: 'Failed to fetch user_profiles' }, { status: 500 });
    }
    const users = await usersRes.json();
    if (!users.length) {
      return Response.json({ ok: true, users_processed: 0, targets_found: 0, ts: now });
    }

    // 4. Run Companies House searches (shared across all users — deduplicated pool)
    const rawPool = new Map(); // company_number → enriched company object

    for (const term of SEARCH_TERMS) {
      const results = await searchCompaniesHouse(term, process.env.COMPANIES_HOUSE_API_KEY);
      for (const company of results) {
        const num = company.company_number;
        if (!num || rawPool.has(num)) continue;

        // 5. Score and filter
        const score = scoreCompany(company);
        if (score === null || score < 50) continue;

        rawPool.set(num, { ...company, _score: score });
      }
    }

    const scoredPool = Array.from(rawPool.values()).sort((a, b) => b._score - a._score);

    // Per-user: fetch pipeline, filter, email
    let totalTargets = 0;

    for (const user of users) {
      // 3. Get user's existing deal names
      const dealsRes = await fetch(
        `${base}/rest/v1/deals?select=company_name&user_id=eq.${user.id}&stage=not.in.(completed,dead)`,
        { headers: sbHeaders }
      );
      const existingDeals = dealsRes.ok ? await dealsRes.json() : [];
      const dealNames = existingDeals.map(d => d.company_name);

      // 6. Filter out already-in-pipeline
      const targets = scoredPool.filter(
        c => !alreadyInPipeline(c.title || c.company_name || '', dealNames)
      );

      if (!targets.length) continue;

      totalTargets += Math.min(targets.length, 10);

      // 7. Email the user
      const dateLabel = new Date().toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
      const html = buildEmailHtml({ userName: user.full_name, targets, dateLabel });
      const subject = `⬡ Your Weekly Target Digest — ${Math.min(targets.length, 10)} new acquisition target${Math.min(targets.length, 10) !== 1 ? 's' : ''}`;

      await sendEmail({ subject, html, to: user.email });
    }

    // 9. Log to audit_trail
    await fetch(`${base}/rest/v1/audit_trail`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        event: 'scout_targets',
        agent: 'scout-targets',
        details: `${users.length} users, ${totalTargets} targets found`,
        status: 'ok',
      }),
    });

    // 10. Return summary
    return Response.json({
      ok: true,
      users_processed: users.length,
      targets_found: totalTargets,
      ts: now,
    });
  } catch (e) {
    console.error('[scout-targets] Unhandled error:', e);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
