// cron-jobs — unified cron job management and manual trigger handler
// Lists scheduled jobs, allows manual triggering, and provides run history
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Registered cron jobs and their schedules (mirrors vercel.json crons)
const CRON_REGISTRY = [
  { id: 'deal-score-refresh', name: 'Deal Score Refresh',    schedule: '0 6 * * *',   description: 'Re-scores all active deals using latest company intel' },
  { id: 'self-improve',       name: 'Self Improve (S21)',    schedule: '0 7 * * *',   description: 'S21 Archivist extracts AI patterns from audit trail' },
  { id: 'pipeline-health',    name: 'Pipeline Health',       schedule: '0 8 * * *',   description: 'Alerts on stalled or overdue deals' },
  { id: 'health-check',       name: 'Health Check',          schedule: '0 */6 * * *', description: 'Pings database and Anthropic API every 6 hours' },
  { id: 'intel-refresh',      name: 'Intel Refresh',         schedule: '0 9 * * 1',  description: 'Refreshes company intelligence (Mondays)' },
  { id: 'data-retention',     name: 'Data Retention (GDPR)', schedule: '0 23 * * *',  description: 'Enforces UK GDPR data retention (audit 90d, analytics 365d)' },
  { id: 'weekly-briefing',    name: 'Weekly Briefing',       schedule: '0 17 * * 5',  description: 'Sends Howard a weekly M&A pipeline SMS via Twilio' },
  { id: 'compliance-check',   name: 'Compliance Check',      schedule: '0 0 1 * *',  description: 'Logs monthly GDPR/AML/FCA compliance checks' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr) return json({ error: 'Auth service unavailable' }, 503);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Admin-only
    const { data: profile } = await sb.from('user_profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
    if (!isAdmin) return json({ error: 'Forbidden — admin access required' }, 403);

    let body: { action?: string; payload?: Record<string, unknown> };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { action, payload } = body;

    // ── LIST CRONS ────────────────────────────────────────────────
    if (action === 'crons:list') {
      // Fetch last run for each cron from audit_trail
      const { data: auditRows } = await sb.from('audit_trail')
        .select('agent, created_at, status')
        .in('agent', CRON_REGISTRY.map(c => c.id))
        .order('created_at', { ascending: false })
        .limit(100);

      const lastRuns: Record<string, { ran_at: string; status: string }> = {};
      (auditRows || []).forEach((r: { agent: string; created_at: string; status: string }) => {
        if (!lastRuns[r.agent]) lastRuns[r.agent] = { ran_at: r.created_at, status: r.status };
      });

      const jobs = CRON_REGISTRY.map(c => ({
        ...c,
        last_run: lastRuns[c.id] || null,
      }));

      return json({ data: jobs });
    }

    // ── CRON HISTORY ──────────────────────────────────────────────
    if (action === 'crons:history') {
      const cronId = String((payload || {}).cron_id || '');
      const q = sb.from('audit_trail')
        .select('agent, created_at, status, details')
        .order('created_at', { ascending: false })
        .limit(50);
      if (cronId) q.eq('agent', cronId);
      else q.in('agent', CRON_REGISTRY.map(c => c.id));
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── MANUAL TRIGGER ───────────────────────────────────────────
    if (action === 'crons:trigger') {
      const cronId = String((payload || {}).cron_id || '');
      const cron = CRON_REGISTRY.find(c => c.id === cronId);
      if (!cron) return json({ error: `Unknown cron: ${cronId}` }, 400);

      const vercelUrl = Deno.env.get('VERCEL_URL') || Deno.env.get('NEXT_PUBLIC_VERCEL_URL');
      const cronSecret = Deno.env.get('CRON_SECRET');

      if (!vercelUrl || !cronSecret) {
        return json({ error: 'VERCEL_URL or CRON_SECRET not configured' }, 500);
      }

      // Call the Vercel cron route
      const url = `https://${vercelUrl}/api/cron/${cronId}`;
      const result = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${cronSecret}` },
      });

      const data = await result.json().catch(() => ({}));

      await sb.from('audit_trail').insert({
        user_id: user.id,
        event: 'cron_manual_trigger',
        agent: cronId,
        details: `Manual trigger by ${user.email || user.id}`,
        status: result.ok ? 'ok' : 'error',
      });

      return json({ ok: result.ok, cron: cron.name, status: result.status, data });
    }

    // ── SYSTEM METRICS SUMMARY ────────────────────────────────────
    if (action === 'crons:metrics') {
      const { data, error } = await sb.from('system_metrics')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
