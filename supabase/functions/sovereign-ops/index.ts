// sovereign-ops — platform operations, metrics, and KPI reporting
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr) return json({ error: 'Auth service unavailable' }, 503);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let body: { action?: string; payload?: Record<string, unknown> };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { action, payload } = body;

    // ── PLATFORM KPIs ─────────────────────────────────────────────
    if (action === 'ops:kpis') {
      const [dealsRes, contactsRes, intelRes, patternsRes, auditRes] = await Promise.allSettled([
        sb.from('deals').select('id, stage, score, deal_value_gbp, ebitda_gbp', { count: 'exact' }).eq('user_id', user.id),
        sb.from('contacts').select('id', { count: 'exact' }).eq('user_id', user.id),
        sb.from('company_intel').select('id, data', { count: 'exact' }),
        sb.from('ai_patterns').select('id, success_rate', { count: 'exact' }),
        sb.from('audit_trail').select('status', { count: 'exact' })
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
      ]);

      const deals     = dealsRes.status === 'fulfilled' ? dealsRes.value.data || [] : [];
      const dealCount = dealsRes.status === 'fulfilled' ? (dealsRes.value.count || 0) : 0;
      const contactCount = contactsRes.status === 'fulfilled' ? (contactsRes.value.count || 0) : 0;
      const intelCount   = intelRes.status === 'fulfilled' ? (intelRes.value.count || 0) : 0;
      const patternCount = patternsRes.status === 'fulfilled' ? (patternsRes.value.count || 0) : 0;
      const auditCount   = auditRes.status === 'fulfilled' ? (auditRes.value.count || 0) : 0;

      const typedDeals = deals as Array<{ stage: string; score?: number; deal_value_gbp?: number; ebitda_gbp?: number }>;
      const activeDeals  = typedDeals.filter(d => !['completed', 'dead'].includes(d.stage));
      const pipelineValue = activeDeals.reduce((n, d) => n + (Number(d.deal_value_gbp) || 0), 0);
      const avgScore     = activeDeals.length
        ? Math.round(activeDeals.reduce((n, d) => n + (Number(d.score) || 0), 0) / activeDeals.length)
        : 0;
      const patterns     = patternsRes.status === 'fulfilled' ? patternsRes.value.data || [] : [];
      const typedPatterns = patterns as Array<{ success_rate?: number }>;
      const avgAgentSuccess = typedPatterns.length
        ? Math.round(typedPatterns.reduce((n, p) => n + (Number(p.success_rate) || 0), 0) / typedPatterns.length)
        : 0;

      return json({
        data: {
          deals: { total: dealCount, active: activeDeals.length, pipeline_value_gbp: pipelineValue, avg_score: avgScore },
          contacts: { total: contactCount },
          intelligence: { total: intelCount },
          ai_patterns: { total: patternCount, avg_success_rate: avgAgentSuccess },
          activity: { audit_events_7d: auditCount },
          generated_at: new Date().toISOString(),
        },
      });
    }

    // ── FULL HEALTH CHECK ─────────────────────────────────────────
    if (action === 'ops:health') {
      const t = Date.now();
      const checks = await Promise.allSettled([
        sb.from('deals').select('id').limit(1),                           // DB read
        sb.from('audit_trail').select('id').limit(1),                     // Audit table
        sb.from('system_metrics').select('id').limit(1),                  // Metrics table
        fetch('https://api.anthropic.com/v1/models', {                    // Anthropic API
          headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '', 'anthropic-version': '2023-06-01' },
        }),
        fetch('https://r.jina.ai/', { method: 'HEAD' }),                  // Jina (scraper dep)
      ]);

      const latency = Date.now() - t;
      const [dbCheck, auditCheck, metricsCheck, anthropicCheck, jinaCheck] = checks;

      const services = [
        { service: 'PostgreSQL (deals)',   status: dbCheck.status === 'fulfilled' && !dbCheck.value.error ? 'ok' : 'error',    latency_ms: latency },
        { service: 'Audit Trail',          status: auditCheck.status === 'fulfilled' && !auditCheck.value.error ? 'ok' : 'error', latency_ms: latency },
        { service: 'System Metrics',       status: metricsCheck.status === 'fulfilled' && !metricsCheck.value.error ? 'ok' : 'error', latency_ms: latency },
        { service: 'Anthropic Claude API', status: anthropicCheck.status === 'fulfilled' && (anthropicCheck.value as Response).ok ? 'ok' : 'error', latency_ms: latency },
        { service: 'Jina Reader',          status: jinaCheck.status === 'fulfilled' ? 'ok' : 'degraded', latency_ms: latency },
        { service: 'TAVILY_API_KEY',       status: Deno.env.get('TAVILY_API_KEY') ? 'configured' : 'missing', latency_ms: 0 },
        { service: 'TWILIO_ACCOUNT_SID',   status: Deno.env.get('TWILIO_ACCOUNT_SID') ? 'configured' : 'missing', latency_ms: 0 },
        { service: 'HOWARD_PHONE',         status: Deno.env.get('HOWARD_PHONE') ? 'configured' : 'missing', latency_ms: 0 },
      ];

      // Record to system_metrics
      const okCount = services.filter(s => s.status === 'ok' || s.status === 'configured').length;
      await sb.from('system_metrics').insert({
        metric_name: 'platform_health_score',
        metric_value: Math.round((okCount / services.length) * 100),
        metric_unit: 'percent',
        tags: { checked_by: 'sovereign-ops' },
      }).then(() => {}).catch(() => {});

      return json({ data: services, health_score: Math.round((okCount / services.length) * 100), timestamp: new Date().toISOString() });
    }

    // ── AGENT PERFORMANCE ─────────────────────────────────────────
    if (action === 'ops:agent_performance') {
      const days = Math.min(Number((payload || {}).days) || 30, 90);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const { data, error } = await sb.from('audit_trail')
        .select('agent, status, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .not('agent', 'is', null);
      if (error) return json({ error: error.message }, 500);

      const stats: Record<string, { ok: number; total: number; last_active: string }> = {};
      for (const r of (data || []) as Array<{ agent: string; status: string; created_at: string }>) {
        if (!r.agent) continue;
        if (!stats[r.agent]) stats[r.agent] = { ok: 0, total: 0, last_active: r.created_at };
        stats[r.agent].total++;
        if (r.status === 'ok') stats[r.agent].ok++;
        if (r.created_at > stats[r.agent].last_active) stats[r.agent].last_active = r.created_at;
      }

      const performance = Object.entries(stats).map(([agent, s]) => ({
        agent,
        success_rate: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0,
        total_tasks: s.total,
        successful: s.ok,
        last_active: s.last_active,
      })).sort((a, b) => b.total_tasks - a.total_tasks);

      return json({ data: performance, period_days: days });
    }

    // ── RECORD METRIC ─────────────────────────────────────────────
    if (action === 'ops:record_metric') {
      const { metric_name, metric_value, metric_unit, tags } = payload || {};
      if (!metric_name) return json({ error: 'metric_name required' }, 400);
      const { data, error } = await sb.from('system_metrics').insert({
        metric_name: String(metric_name),
        metric_value: Number(metric_value) || 0,
        metric_unit: metric_unit ? String(metric_unit) : null,
        tags: tags || {},
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── METRICS HISTORY ───────────────────────────────────────────
    if (action === 'ops:metrics') {
      const metricName = payload?.metric_name ? String(payload.metric_name) : null;
      const limit = Math.min(Number((payload || {}).limit) || 100, 500);
      const q = sb.from('system_metrics').select('*').order('created_at', { ascending: false }).limit(limit);
      if (metricName) q.eq('metric_name', metricName);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── AUDIT SUMMARY ─────────────────────────────────────────────
    if (action === 'ops:audit_summary') {
      const days = Math.min(Number((payload || {}).days) || 7, 30);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const { data, error } = await sb.from('audit_trail')
        .select('event, agent, status, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return json({ error: error.message }, 500);

      const rows = (data || []) as Array<{ event: string; agent: string; status: string; created_at: string }>;
      const byEvent: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      let errors = 0;

      for (const r of rows) {
        byEvent[r.event] = (byEvent[r.event] || 0) + 1;
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        if (r.status === 'error' || r.status === 'warn') errors++;
      }

      return json({
        data: {
          total: rows.length,
          errors,
          by_event: byEvent,
          by_status: byStatus,
          period_days: days,
          recent: rows.slice(0, 20),
        },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
