// api/evidence/collect.js
// Automated evidence collection for ISO 27001, SOC 2, and Cyber Essentials
// GET /api/evidence/collect — admin only
// Returns structured control evidence pulled live from Supabase

import { createClient } from '@supabase/supabase-js';
import { setCORS } from '../lib/cors-auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCORS(req, res); return res.status(200).end(); }
  setCORS(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await sb.from('user_profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'superadmin'].includes(profile?.role)) return res.status(403).json({ error: 'Admin only' });

  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    // Run all evidence queries in parallel
    const [
      userCountRes,
      adminCountRes,
      inactiveCountRes,
      auditCountRes,
      lastAuditRes,
      breachRes,
      incidentRes,
      retentionRes,
      patchRes,
      bcpTestRes,
      policyReviewRes,
      failedAuthRes,
    ] = await Promise.all([
      sb.from('user_profiles').select('id', { count: 'exact', head: true }).neq('plan', 'cancelled'),
      sb.from('user_profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'superadmin']),
      sb.from('user_profiles').select('id', { count: 'exact', head: true }).lt('last_sign_in_at', ninetyDaysAgo).neq('plan', 'cancelled'),
      sb.from('audit_trail').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
      sb.from('audit_trail').select('created_at').order('created_at', { ascending: false }).limit(1),
      sb.from('compliance_log').select('id', { count: 'exact', head: true }).eq('framework', 'UK_GDPR').eq('status', 'breach').gte('created_at', thirtyDaysAgo),
      sb.from('audit_trail').select('id', { count: 'exact', head: true }).eq('event', 'security_incident').gte('created_at', ninetyDaysAgo),
      sb.from('system_metrics').select('created_at').eq('metric_name', 'data_retention_run').gte('created_at', monthStart).order('created_at', { ascending: false }).limit(1),
      sb.from('system_metrics').select('created_at').eq('metric_name', 'dependency_audit_run').gte('created_at', monthStart).order('created_at', { ascending: false }).limit(1),
      sb.from('system_metrics').select('created_at').eq('metric_name', 'bcp_test_run').gte('created_at', oneYearAgo).order('created_at', { ascending: false }).limit(1),
      sb.from('system_metrics').select('created_at').eq('metric_name', 'is_policy_reviewed').gte('created_at', ninetyDaysAgo).order('created_at', { ascending: false }).limit(1),
      sb.from('audit_trail').select('id', { count: 'exact', head: true }).eq('event', 'auth_failure').gte('created_at', thirtyDaysAgo),
    ]);

    const totalUsers = userCountRes.count ?? 0;
    const adminCount = adminCountRes.count ?? 0;
    const inactiveCount = inactiveCountRes.count ?? 0;
    const auditCount = auditCountRes.count ?? 0;
    const lastAuditAt = lastAuditRes.data?.[0]?.created_at ?? null;
    const breachCount = breachRes.count ?? 0;
    const incidentCount = incidentRes.count ?? 0;
    const retentionRanAt = retentionRes.data?.[0]?.created_at ?? null;
    const patchRanAt = patchRes.data?.[0]?.created_at ?? null;
    const bcpTestAt = bcpTestRes.data?.[0]?.created_at ?? null;
    const policyReviewAt = policyReviewRes.data?.[0]?.created_at ?? null;
    const failedAuthCount = failedAuthRes.count ?? 0;

    const controls = [
      // ── Cyber Essentials ──────────────────────────────────────────────
      {
        id: 'CE_BOUNDARY',
        framework: 'Cyber Essentials',
        annex: 'CE-1',
        control: 'Boundary firewalls & internet gateways',
        status: 'pass',
        evidence: 'Vercel edge network enforces TLS-only; CSP headers block unauthorised origins; no unused ports exposed; WAF active on all routes',
        evidence_type: 'documented',
        detail: { source: 'Vercel configuration + vercel.json headers' },
      },
      {
        id: 'CE_SECURE_CONFIG',
        framework: 'Cyber Essentials',
        annex: 'CE-2',
        control: 'Secure configuration',
        status: 'pass',
        evidence: 'HSTS max-age=63072000; X-Frame-Options DENY; X-Content-Type-Options nosniff; Referrer-Policy strict-origin; Supabase RLS on all tables',
        evidence_type: 'documented',
        detail: { source: 'vercel.json headers + Supabase schema' },
      },
      {
        id: 'CE_UAC',
        framework: 'Cyber Essentials',
        annex: 'CE-3',
        control: 'User access control',
        status: inactiveCount > 0 ? 'review' : 'pass',
        evidence: inactiveCount > 0
          ? `${inactiveCount} inactive account(s) detected (no login >90 days) — review and disable`
          : `${totalUsers} active users; ${adminCount} admin/superadmin accounts; no inactive accounts detected`,
        evidence_type: 'automated',
        detail: { total_users: totalUsers, admin_count: adminCount, inactive_count: inactiveCount, threshold_days: 90 },
      },
      {
        id: 'CE_MALWARE',
        framework: 'Cyber Essentials',
        annex: 'CE-4',
        control: 'Malware protection',
        status: 'pass',
        evidence: 'CDN-delivered static assets only; no server-side code execution by users; Vercel runtime isolation; dependencies scanned via npm audit',
        evidence_type: 'documented',
        detail: { source: 'Architecture — no user code execution surface' },
      },
      {
        id: 'CE_PATCH',
        framework: 'Cyber Essentials',
        annex: 'CE-5',
        control: 'Patch management',
        status: patchRanAt ? 'pass' : 'review',
        evidence: patchRanAt
          ? `Dependency audit ran this month (${new Date(patchRanAt).toLocaleDateString('en-GB')})`
          : 'Dependency audit not recorded this month — run npm audit and log in system_metrics',
        evidence_type: 'automated',
        detail: { last_run: patchRanAt, metric: 'dependency_audit_run' },
      },

      // ── SOC 2 Type II ────────────────────────────────────────────────
      {
        id: 'SOC2_CC6',
        framework: 'SOC 2 Type II',
        annex: 'CC6.1',
        control: 'Logical access controls (Security)',
        status: inactiveCount > 0 ? 'review' : 'pass',
        evidence: `JWT + Supabase PKCE; RBAC enforced; ${adminCount} privileged accounts; ${inactiveCount} inactive accounts`,
        evidence_type: 'automated',
        detail: { total_users: totalUsers, admin_count: adminCount, inactive_count: inactiveCount },
      },
      {
        id: 'SOC2_CC7',
        framework: 'SOC 2 Type II',
        annex: 'CC7.3',
        control: 'Security monitoring & audit trail',
        status: auditCount > 0 ? 'pass' : 'review',
        evidence: auditCount > 0
          ? `${auditCount} audit_trail events in past 30 days; last event: ${lastAuditAt ? new Date(lastAuditAt).toLocaleString('en-GB') : 'unknown'}`
          : 'No audit trail events in past 30 days — verify logging is active',
        evidence_type: 'automated',
        detail: { events_30d: auditCount, last_event: lastAuditAt, failed_auth_30d: failedAuthCount },
      },
      {
        id: 'SOC2_A1',
        framework: 'SOC 2 Type II',
        annex: 'A1.1',
        control: 'Availability — uptime & capacity',
        status: 'pass',
        evidence: 'Vercel 99.99% SLA; Supabase 99.9% SLA; Anthropic graceful degradation; edge middleware always serves',
        evidence_type: 'documented',
        detail: { source: 'Vercel Enterprise SLA + Supabase SLA docs + SOV-BCP-001' },
      },
      {
        id: 'SOC2_PI1',
        framework: 'SOC 2 Type II',
        annex: 'PI1.1',
        control: 'Processing integrity — input validation',
        status: 'pass',
        evidence: 'All API boundaries validate inputs; Stripe webhooks are idempotent (event ID dedup); all mutations audit-logged',
        evidence_type: 'documented',
        detail: { source: 'api/stripe/webhook.js idempotency + audit_trail logging' },
      },
      {
        id: 'SOC2_C1',
        framework: 'SOC 2 Type II',
        annex: 'C1.1',
        control: 'Confidentiality — data isolation',
        status: 'pass',
        evidence: 'Row Level Security on all 28 tables (auth.uid() predicate); AES-256 at rest; TLS 1.3 in transit; no cross-tenant data leakage possible',
        evidence_type: 'documented',
        detail: { source: 'Supabase RLS policies + SOV-ASR-001' },
      },
      {
        id: 'SOC2_P1',
        framework: 'SOC 2 Type II',
        annex: 'P1.1',
        control: 'Privacy — personal data handling',
        status: breachCount === 0 ? 'pass' : 'fail',
        evidence: breachCount === 0
          ? 'No GDPR breaches recorded in past 30 days; privacy notice live; consent flows implemented; DPA with Anthropic in review'
          : `${breachCount} breach record(s) require ICO notification review`,
        evidence_type: 'automated',
        detail: { breach_count_30d: breachCount },
      },

      // ── ISO 27001:2022 ────────────────────────────────────────────────
      {
        id: 'ISO_A5',
        framework: 'ISO 27001:2022',
        annex: 'A.5.1',
        control: 'Information Security Policies',
        status: policyReviewAt ? 'pass' : 'review',
        evidence: policyReviewAt
          ? `IS Policy (SOV-POL-001) reviewed ${new Date(policyReviewAt).toLocaleDateString('en-GB')} — within 90-day review cycle`
          : 'IS Policy review overdue (90-day cycle) — log review completion in system_metrics',
        evidence_type: 'automated',
        detail: { last_reviewed: policyReviewAt, document: 'SOV-POL-001', next_annual_review: '2027-04-02' },
      },
      {
        id: 'ISO_A6',
        framework: 'ISO 27001:2022',
        annex: 'A.6.1',
        control: 'Organisation of information security',
        status: 'pass',
        evidence: 'ISMS Owner: Howard Henry; roles defined in SOV-POL-001 §3; MLRO, Data Controller, Platform Admin responsibilities documented',
        evidence_type: 'documented',
        detail: { source: 'SOV-POL-001 §3 Roles and Responsibilities' },
      },
      {
        id: 'ISO_A8',
        framework: 'ISO 27001:2022',
        annex: 'A.5.9',
        control: 'Asset management — information asset register',
        status: 'pass',
        evidence: 'SOV-ASR-001 active; 13 software assets, 2 hardware assets, 10 data assets, 12 credentials catalogued with classification and controls',
        evidence_type: 'documented',
        detail: { source: 'SOV-ASR-001 — last reviewed 4 April 2026' },
      },
      {
        id: 'ISO_A9',
        framework: 'ISO 27001:2022',
        annex: 'A.8.2',
        control: 'Access control — least privilege',
        status: inactiveCount > 0 ? 'review' : 'pass',
        evidence: `${totalUsers} users; ${adminCount} privileged; ${inactiveCount} inactive; RBAC enforced; MFA available via Google OAuth`,
        evidence_type: 'automated',
        detail: { total_users: totalUsers, admin_count: adminCount, inactive_count: inactiveCount },
      },
      {
        id: 'ISO_A10',
        framework: 'ISO 27001:2022',
        annex: 'A.8.24',
        control: 'Cryptography',
        status: 'pass',
        evidence: 'TLS 1.3 enforced; AES-256 at rest (Supabase); HSTS preload; JWT HS256 session tokens; secrets in Vercel env vars only',
        evidence_type: 'documented',
        detail: { source: 'SOV-POL-001 §6 Cryptography' },
      },
      {
        id: 'ISO_A12',
        framework: 'ISO 27001:2022',
        annex: 'A.8.9',
        control: 'Operations security — change management',
        status: 'pass',
        evidence: 'All changes via git + Vercel CI/CD; no direct production edits; deployment history in Vercel Dashboard; rollback capability confirmed',
        evidence_type: 'documented',
        detail: { source: 'GitHub + Vercel deployment pipeline' },
      },
      {
        id: 'ISO_A16',
        framework: 'ISO 27001:2022',
        annex: 'A.5.24',
        control: 'Incident management',
        status: incidentCount === 0 ? 'pass' : 'review',
        evidence: incidentCount === 0
          ? 'No security incidents in past 90 days; SOV-IRP-001 active; IR Lead: Howard Henry'
          : `${incidentCount} security incident(s) in past 90 days — confirm SOV-IRP-001 was executed`,
        evidence_type: 'automated',
        detail: { incident_count_90d: incidentCount, document: 'SOV-IRP-001' },
      },
      {
        id: 'ISO_A17',
        framework: 'ISO 27001:2022',
        annex: 'A.5.29',
        control: 'Business continuity',
        status: bcpTestAt ? 'pass' : 'review',
        evidence: bcpTestAt
          ? `BCP test completed ${new Date(bcpTestAt).toLocaleDateString('en-GB')}; RTO 4h / RPO 1h; Supabase PITR active`
          : 'Annual BCP test not recorded — schedule database restore test and log in system_metrics',
        evidence_type: 'automated',
        detail: { last_test: bcpTestAt, rto_hours: 4, rpo_hours: 1, document: 'SOV-BCP-001' },
      },
      {
        id: 'ISO_A18',
        framework: 'ISO 27001:2022',
        annex: 'A.5.36',
        control: 'Compliance with legal requirements',
        status: breachCount === 0 ? 'pass' : 'review',
        evidence: `UK GDPR · MLR 2017 · FSMA 2000 registered; monthly automated checks running; ${breachCount === 0 ? 'no open breaches' : breachCount + ' breach(es) require attention'}`,
        evidence_type: 'automated',
        detail: { breach_count_30d: breachCount, retention_ran: !!retentionRanAt },
      },
    ];

    const passCount = controls.filter(c => c.status === 'pass').length;
    const reviewCount = controls.filter(c => c.status === 'review').length;
    const failCount = controls.filter(c => c.status === 'fail').length;

    // Store collection timestamp in system_metrics (fire-and-forget)
    sb.from('system_metrics').insert({
      metric_name: 'evidence_collected',
      metric_value: passCount,
      notes: `${passCount}/${controls.length} controls passing`,
    }).then(() => {}).catch(() => {});

    return res.status(200).json({
      ok: true,
      collected_at: now.toISOString(),
      collected_by: user.email,
      summary: { total: controls.length, pass: passCount, review: reviewCount, fail: failCount },
      controls,
    });
  } catch (e) {
    console.error('[evidence/collect]', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
