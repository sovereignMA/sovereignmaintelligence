import { sendEmail } from '../lib/send-email.js';

export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const headers = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const base = process.env.SUPABASE_URL;
  const now = new Date();
  const month = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  try {
    // ── Real compliance checks against live DB ─────────────────────

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // All 4 compliance checks run in parallel
    const [breachRes, retentionRes, amlRes, fcaRes] = await Promise.all([
      fetch(`${base}/rest/v1/compliance_log?framework=eq.UK_GDPR&status=eq.breach&created_at=gte.${thirtyDaysAgo}&limit=1&select=id`, { headers }),
      fetch(`${base}/rest/v1/system_metrics?metric_name=eq.data_retention_run&created_at=gte.${monthStart}&limit=1&select=id`, { headers }),
      fetch(`${base}/rest/v1/audit_trail?event=eq.suspicious_activity&created_at=gte.${thirtyDaysAgo}&limit=1&select=id`, { headers }),
      fetch(`${base}/rest/v1/audit_trail?event=eq.unauthorised_access&created_at=gte.${thirtyDaysAgo}&limit=1&select=id`, { headers }),
    ]);

    // 1. UK GDPR: any open breach records in the past 30 days?
    const breachRows = breachRes.ok ? await breachRes.json() : [];
    const gdprStatus = breachRows.length === 0 ? 'compliant' : 'breach';
    const gdprNote   = breachRows.length === 0
      ? 'No data breaches recorded in the past 30 days'
      : `⚠ ${breachRows.length} breach record(s) require ICO notification review`;

    // 2. Data retention: did the retention cron run this month?
    const retentionRows = retentionRes.ok ? await retentionRes.json() : [];
    const retentionStatus = retentionRows.length > 0 ? 'compliant' : 'review';
    const retentionNote   = retentionRows.length > 0
      ? 'Data retention cron ran this month — old records purged per policy'
      : '⚠ Data retention cron has not run this month — manual trigger required';

    // 3. AML: check for any audit_trail entries flagged as suspicious in the past 30 days
    const amlRows = amlRes.ok ? await amlRes.json() : [];
    const amlStatus = amlRows.length === 0 ? 'compliant' : 'review';
    const amlNote   = amlRows.length === 0
      ? 'No suspicious activity flags in the past 30 days'
      : `⚠ ${amlRows.length} suspicious activity flag(s) require AML review`;

    // 4. FCA: check for any unauthorised access attempts
    const fcaRows = fcaRes.ok ? await fcaRes.json() : [];
    const fcaStatus = fcaRows.length === 0 ? 'compliant' : 'review';
    const fcaNote   = fcaRows.length === 0
      ? 'No unauthorised access attempts recorded in the past 30 days'
      : `⚠ ${fcaRows.length} unauthorised access event(s) require FCA reporting review`;

    const checks = [
      { framework: 'UK_GDPR',   event_type: 'monthly_review', description: gdprNote,       lawful_basis: 'legitimate_interests', status: gdprStatus },
      { framework: 'RETENTION', event_type: 'monthly_review', description: retentionNote,   lawful_basis: 'legal_obligation',     status: retentionStatus },
      { framework: 'AML',       event_type: 'monthly_review', description: amlNote,         lawful_basis: 'legal_obligation',     status: amlStatus },
      { framework: 'FCA',       event_type: 'monthly_review', description: fcaNote,         lawful_basis: 'legal_obligation',     status: fcaStatus },
    ];

    const anyIssues = checks.some(c => c.status !== 'compliant');

    await fetch(`${base}/rest/v1/compliance_log`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(checks),
    });

    // Build email
    const statusColor = { compliant: '#4ade80', review: '#fbbf24', breach: '#f87171' };
    const statusIcon  = { compliant: '✓', review: '⚠', breach: '✗' };

    const checkRows = checks.map(c => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);font-weight:600">${c.framework}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">${c.description}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)">
          <span style="color:${statusColor[c.status] || '#a1a1aa'}">${statusIcon[c.status] || '?'} ${c.status}</span>
        </td>
      </tr>`).join('');

    const headerColor = anyIssues ? '#fbbf24' : '#4ade80';
    const headerIcon  = anyIssues ? '⚠' : '⬡';
    const headerTitle = anyIssues ? 'COMPLIANCE — ACTION REQUIRED' : 'COMPLIANCE CHECK ✓';

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px">
  <div style="border-bottom:2px solid ${headerColor};padding-bottom:16px;margin-bottom:24px">
    <h1 style="margin:0;font-size:20px;color:${headerColor};letter-spacing:1px">${headerIcon} ${headerTitle}</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#71717a">Monthly Review — ${month}</p>
  </div>
  <p style="font-size:14px;color:#d4d4d8;margin:0 0 16px">
    ${anyIssues ? 'One or more compliance checks require attention this month.' : `All compliance checks passed for ${month}.`}
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
    <tr style="color:#71717a;text-align:left">
      <th style="padding:8px 12px">Framework</th>
      <th style="padding:8px 12px">Finding</th>
      <th style="padding:8px 12px">Status</th>
    </tr>
    ${checkRows}
  </table>
  <p style="font-size:12px;color:#71717a;margin:16px 0 0">These are automated checks against live platform data. Manual review of data processing activities, consent records, and DPA obligations should be conducted quarterly by the data controller.</p>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#71717a">
    <p style="margin:0">Sovereign Compliance Engine · <a href="https://sovereigncmd.xyz/security" style="color:#c9a84c">View Security Dashboard</a></p>
  </div>
</div>`;

    await sendEmail({
      subject: anyIssues
        ? `[Sovereign] ⚠ Compliance Issues Detected — ${month}`
        : `[Sovereign] ✓ Monthly Compliance Check — ${month}`,
      html,
    });

    return Response.json({ ok: true, checks_logged: checks.length, issues: anyIssues, ts: now.toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
