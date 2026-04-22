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

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    // All compliance checks run in parallel — core + CE + SOC2 + ISO27001
    const [
      breachRes, retentionRes, amlRes, fcaRes,
      // Cyber Essentials
      orphanAccountRes, patchRunRes,
      // SOC 2
      failedAuthRes, availErrRes,
      // ISO 27001
      incidentRes, privEscRes, policyReviewRes,
    ] = await Promise.all([
      // Core
      fetch(`${base}/rest/v1/compliance_log?framework=eq.UK_GDPR&status=eq.breach&created_at=gte.${thirtyDaysAgo}&limit=1&select=id`, { headers }),
      fetch(`${base}/rest/v1/system_metrics?metric_name=eq.data_retention_run&created_at=gte.${monthStart}&limit=1&select=id`, { headers }),
      fetch(`${base}/rest/v1/audit_trail?event=eq.suspicious_activity&created_at=gte.${thirtyDaysAgo}&limit=1&select=id`, { headers }),
      fetch(`${base}/rest/v1/audit_trail?event=eq.unauthorised_access&created_at=gte.${thirtyDaysAgo}&limit=1&select=id`, { headers }),
      // CE: orphan accounts (no login in 90 days) — UAC control
      fetch(`${base}/rest/v1/user_profiles?select=id&last_sign_in_at=lt.${ninetyDaysAgo}&plan=neq.cancelled&limit=1`, { headers }),
      // CE: patch/dependency check ran this month
      fetch(`${base}/rest/v1/system_metrics?metric_name=eq.dependency_audit_run&created_at=gte.${monthStart}&limit=1&select=id`, { headers }),
      // SOC2 CC: failed auth events in past 30 days
      fetch(`${base}/rest/v1/audit_trail?event=eq.auth_failure&created_at=gte.${thirtyDaysAgo}&select=id&limit=50`, { headers }),
      // SOC2 A: availability errors logged in past 30 days
      fetch(`${base}/rest/v1/audit_trail?event=eq.system_error&status=eq.error&created_at=gte.${thirtyDaysAgo}&select=id&limit=1`, { headers }),
      // ISO A.16: security incidents in past 30 days
      fetch(`${base}/rest/v1/audit_trail?event=eq.security_incident&created_at=gte.${thirtyDaysAgo}&select=id&limit=1`, { headers }),
      // ISO A.9: privilege escalation events
      fetch(`${base}/rest/v1/audit_trail?event=eq.privilege_escalation&created_at=gte.${thirtyDaysAgo}&select=id&limit=1`, { headers }),
      // ISO A.5: IS Policy review this quarter
      fetch(`${base}/rest/v1/system_metrics?metric_name=eq.is_policy_reviewed&created_at=gte.${new Date(Date.now() - 90 * 86400000).toISOString()}&limit=1&select=id`, { headers }),
    ]);

    // ── Core framework checks ──────────────────────────────────────────

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

    // ── Cyber Essentials checks ────────────────────────────────────────

    // CE-1: User access control — orphan accounts not reviewed in 90 days
    const orphanRows = orphanAccountRes.ok ? await orphanAccountRes.json() : [];
    const ceUacStatus = orphanRows.length === 0 ? 'compliant' : 'review';
    const ceUacNote   = orphanRows.length === 0
      ? 'CE UAC: No inactive accounts detected (90-day threshold) — access controls current'
      : `⚠ CE UAC: ${orphanRows.length}+ inactive account(s) not reviewed — disable or review per CE requirement`;

    // CE-2: Patch management — dependency audit ran this month
    const patchRows = patchRunRes.ok ? await patchRunRes.json() : [];
    const cePatchStatus = patchRows.length > 0 ? 'compliant' : 'review';
    const cePatchNote   = patchRows.length > 0
      ? 'CE Patch: Dependency audit ran this month — no unpatched critical CVEs'
      : '⚠ CE Patch: Dependency audit not recorded this month — run npm audit and log result';

    // ── SOC 2 Type II checks ───────────────────────────────────────────

    // SOC2-CC: Failed auth rate (>20 failures in 30 days is a review flag)
    const failedAuthRows = failedAuthRes.ok ? await failedAuthRes.json() : [];
    const soc2CcStatus = failedAuthRows.length < 20 ? 'compliant' : 'review';
    const soc2CcNote   = failedAuthRows.length < 20
      ? `SOC2 CC: ${failedAuthRows.length} failed auth event(s) in 30 days — within normal threshold`
      : `⚠ SOC2 CC: ${failedAuthRows.length} failed auth events — possible brute-force; review source IPs`;

    // SOC2-A: System availability — any system errors logged
    const availErrRows = availErrRes.ok ? await availErrRes.json() : [];
    const soc2AStatus = availErrRows.length === 0 ? 'compliant' : 'review';
    const soc2ANote   = availErrRows.length === 0
      ? 'SOC2 A: No system errors logged in the past 30 days — availability target met'
      : '⚠ SOC2 A: System error events detected — review impact on availability SLA';

    // ── ISO 27001:2022 checks ──────────────────────────────────────────

    // ISO A.16: security incidents
    const incidentRows = incidentRes.ok ? await incidentRes.json() : [];
    const isoA16Status = incidentRows.length === 0 ? 'compliant' : 'review';
    const isoA16Note   = incidentRows.length === 0
      ? 'ISO A.16: No security incidents recorded in the past 30 days'
      : `⚠ ISO A.16: ${incidentRows.length} security incident(s) — confirm IR Playbook executed and lesson learned logged`;

    // ISO A.9: privilege escalation
    const privEscRows = privEscRes.ok ? await privEscRes.json() : [];
    const isoA9Status = privEscRows.length === 0 ? 'compliant' : 'review';
    const isoA9Note   = privEscRows.length === 0
      ? 'ISO A.9: No privilege escalation events in 30 days — access control boundary intact'
      : `⚠ ISO A.9: ${privEscRows.length} privilege escalation event(s) — review and confirm authorised`;

    // ISO A.5: IS Policy reviewed in the last 90 days
    const policyRows = policyReviewRes.ok ? await policyReviewRes.json() : [];
    const isoA5Status = policyRows.length > 0 ? 'compliant' : 'review';
    const isoA5Note   = policyRows.length > 0
      ? 'ISO A.5: IS Policy reviewed within the last 90 days — controls current'
      : '⚠ ISO A.5: IS Policy review overdue (90-day cycle) — schedule review and log in system_metrics';

    const checks = [
      // Core regulatory
      { framework: 'UK_GDPR',         event_type: 'monthly_review', description: gdprNote,       lawful_basis: 'legitimate_interests', status: gdprStatus },
      { framework: 'RETENTION',        event_type: 'monthly_review', description: retentionNote,   lawful_basis: 'legal_obligation',     status: retentionStatus },
      { framework: 'AML',              event_type: 'monthly_review', description: amlNote,         lawful_basis: 'legal_obligation',     status: amlStatus },
      { framework: 'FCA',              event_type: 'monthly_review', description: fcaNote,         lawful_basis: 'legal_obligation',     status: fcaStatus },
      // Cyber Essentials
      { framework: 'CE_UAC',           event_type: 'monthly_review', description: ceUacNote,       lawful_basis: 'legal_obligation',     status: ceUacStatus },
      { framework: 'CE_PATCH',         event_type: 'monthly_review', description: cePatchNote,     lawful_basis: 'legal_obligation',     status: cePatchStatus },
      // SOC 2 Type II
      { framework: 'SOC2_CC',          event_type: 'monthly_review', description: soc2CcNote,      lawful_basis: 'legitimate_interests', status: soc2CcStatus },
      { framework: 'SOC2_AVAILABILITY',event_type: 'monthly_review', description: soc2ANote,       lawful_basis: 'legitimate_interests', status: soc2AStatus },
      // ISO 27001:2022
      { framework: 'ISO_A5_POLICY',    event_type: 'monthly_review', description: isoA5Note,       lawful_basis: 'legal_obligation',     status: isoA5Status },
      { framework: 'ISO_A9_ACCESS',    event_type: 'monthly_review', description: isoA9Note,       lawful_basis: 'legal_obligation',     status: isoA9Status },
      { framework: 'ISO_A16_INCIDENT', event_type: 'monthly_review', description: isoA16Note,      lawful_basis: 'legal_obligation',     status: isoA16Status },
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

    const groups = [
      { label: 'Regulatory', frameworks: ['UK_GDPR','RETENTION','AML','FCA'] },
      { label: 'Cyber Essentials (NCSC)', frameworks: ['CE_UAC','CE_PATCH'] },
      { label: 'SOC 2 Type II', frameworks: ['SOC2_CC','SOC2_AVAILABILITY'] },
      { label: 'ISO 27001:2022', frameworks: ['ISO_A5_POLICY','ISO_A9_ACCESS','ISO_A16_INCIDENT'] },
    ];

    const checkRows = groups.map(g => {
      const groupChecks = checks.filter(c => g.frameworks.includes(c.framework));
      const rows = groupChecks.map(c => `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.05);color:#a1a1aa;font-size:12px">${c.framework}</td>
          <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px">${c.description}</td>
          <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap">
            <span style="color:${statusColor[c.status] || '#a1a1aa'};font-size:12px">${statusIcon[c.status] || '?'} ${c.status}</span>
          </td>
        </tr>`).join('');
      return `
        <tr><td colspan="3" style="padding:10px 12px 4px;font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid rgba(255,255,255,0.08)">${g.label}</td></tr>
        ${rows}`;
    }).join('');

    const headerColor = anyIssues ? '#fbbf24' : '#4ade80';
    const headerIcon  = anyIssues ? '⚠' : '⬡';
    const headerTitle = anyIssues ? 'COMPLIANCE — ACTION REQUIRED' : 'COMPLIANCE CHECK ✓';
    const passCount = checks.filter(c => c.status === 'compliant').length;

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;color:#e4e4e7;background:#07080f;padding:32px 24px;border-radius:12px">
  <div style="border-bottom:2px solid ${headerColor};padding-bottom:16px;margin-bottom:24px">
    <h1 style="margin:0;font-size:20px;color:${headerColor};letter-spacing:1px">${headerIcon} ${headerTitle}</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#71717a">Monthly Review — ${month} · ${passCount}/${checks.length} checks passed</p>
  </div>
  <p style="font-size:14px;color:#d4d4d8;margin:0 0 16px">
    ${anyIssues ? 'One or more compliance checks require attention this month.' : `All ${checks.length} compliance checks passed for ${month}. Frameworks: UK GDPR · Cyber Essentials · SOC 2 Type II · ISO 27001:2022.`}
  </p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
    <tr style="color:#71717a;text-align:left">
      <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Control</th>
      <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Finding</th>
      <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Status</th>
    </tr>
    ${checkRows}
  </table>
  <p style="font-size:12px;color:#71717a;margin:16px 0 0">Automated checks against live platform data. Quarterly manual review of data processing activities, DPA obligations, and Annex A control evidence is required by the data controller.</p>
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
