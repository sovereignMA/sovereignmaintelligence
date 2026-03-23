// automation — workflows, AI patterns, agent status (S21 Archivist)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AGENTS = [
  { id:'S1',  name:'Sovereign Orchestrator',  status:'active',  role:'Master coordinator — routes tasks to all agents' },
  { id:'S2',  name:'Deal Sourcer',             status:'active',  role:'Finds UK SaaS acquisition targets via Tavily' },
  { id:'S3',  name:'Company Profiler',         status:'active',  role:'Deep company intel — financials, team, tech stack' },
  { id:'S4',  name:'Valuation Analyst',        status:'active',  role:'EBITDA multiples, ARR, deal value modelling' },
  { id:'S5',  name:'Risk Assessor',            status:'active',  role:'Red flags, PEP checks, AML signals' },
  { id:'S6',  name:'Outreach Composer',        status:'active',  role:'Personalised cold outreach via email/LinkedIn' },
  { id:'S7',  name:'Due Diligence Engine',     status:'active',  role:'Coordinates DD process, checklist, document review' },
  { id:'S8',  name:'Legal Drafter',            status:'active',  role:'LOI, NDA, SPA, DPA templates' },
  { id:'S9',  name:'Negotiation Advisor',      status:'active',  role:'NMD structure, deferred consideration, earnout advice' },
  { id:'S10', name:'Pipeline Manager',         status:'active',  role:'Stage transitions, next actions, deal scoring' },
  { id:'S11', name:'Comms Monitor',            status:'active',  role:'Gmail thread parsing, reply drafting' },
  { id:'S12', name:'Financial Modeller',       status:'active',  role:'P&L consolidation, synergy modelling, WACC' },
  { id:'S13', name:'Market Intelligence',      status:'active',  role:'Sector trends, comparable transactions, multiples' },
  { id:'S14', name:'Compliance Guardian',      status:'active',  role:'UK GDPR, FCA, ICO, AML, KYC, PECR compliance' },
  { id:'S15', name:'Integration Planner',      status:'active',  role:'Post-acquisition integration roadmap' },
  { id:'S16', name:'Notifier',                 status:'active',  role:'Twilio calls, SMS, WhatsApp to Howard' },
  { id:'S17', name:'Analytics Engine',         status:'active',  role:'Event tracking, funnel analysis, ad attribution' },
  { id:'S18', name:'Vault Keeper',             status:'active',  role:'AES-256-GCM encryption, document storage' },
  { id:'S19', name:'Security Auditor',         status:'active',  role:'Pentest, RLS audit, JWT validation' },
  { id:'S20', name:'Workflow Automator',       status:'active',  role:'Trigger-based workflow execution' },
  { id:'S21', name:'Archivist',                status:'active',  role:'Self-improvement — learns from deal patterns' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    let body: { action?: string; payload?: Record<string, unknown> };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { action, payload } = body;

    // ── WORKFLOWS ─────────────────────────────────────────────────
    if (action === 'workflow:list') {
      const { data, error } = await sb.from('workflows').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'workflow:create') {
      const { data, error } = await sb.from('workflows').insert({ ...payload, user_id: user.id }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'workflow:toggle') {
      const { workflow_id, is_active } = payload;
      const { data, error } = await sb.from('workflows').update({ is_active }).eq('id', workflow_id).eq('user_id', user.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'workflow:run') {
      const { workflow_id } = payload;
      const { data: wf, error } = await sb.from('workflows').select('*').eq('id', workflow_id).eq('user_id', user.id).single();
      if (error || !wf) return json({ error: 'Workflow not found' }, 404);
      if (!wf.is_active) return json({ error: 'Workflow is disabled' }, 400);

      // Increment run_count, log to audit
      await Promise.allSettled([
        sb.from('workflows').update({ run_count: (wf.run_count || 0) + 1, last_run_at: new Date().toISOString() }).eq('id', workflow_id),
        sb.from('audit_trail').insert({ user_id: user.id, event: 'workflow_run', agent: 'S20', details: `workflow=${wf.name}`, status: 'ok' }),
      ]);

      return json({ ok: true, workflow: wf.name, steps: wf.steps });
    }

    // ── AI PATTERNS (S21) ─────────────────────────────────────────
    if (action === 'patterns:list') {
      const { data, error } = await sb.from('ai_patterns').select('*').order('success_rate', { ascending: false }).limit(50);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'patterns:improve') {
      // S21 Archivist: analyse recent audit trail and derive patterns (scoped to this user)
      const { data: recent } = await sb.from('audit_trail').select('event, agent, status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200);
      if (!recent) return json({ patterns: [] });

      const agentStats = recent.reduce((acc: Record<string, { ok: number; total: number }>, r: { agent: string; status: string }) => {
        if (!r.agent) return acc;
        if (!acc[r.agent]) acc[r.agent] = { ok: 0, total: 0 };
        acc[r.agent].total++;
        if (r.status === 'ok') acc[r.agent].ok++;
        return acc;
      }, {});

      const patterns = Object.entries(agentStats).map(([agent, s]) => ({
        pattern_type: 'agent_performance',
        title: `${agent} success rate`,
        description: `${agent} completed ${s.ok}/${s.total} tasks successfully`,
        success_rate: s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0,
        usage_count: s.total,
        data: { agent, ...s },
      }));

      await sb.from('ai_patterns').upsert(patterns, { onConflict: 'title' });
      return json({ patterns });
    }

    // ── AGENTS STATUS ─────────────────────────────────────────────
    if (action === 'agents:status') {
      const { data: recentAudit } = await sb.from('audit_trail').select('agent, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
      const lastSeen: Record<string, string> = {};
      (recentAudit || []).forEach((r: { agent: string; created_at: string }) => {
        if (r.agent && !lastSeen[r.agent]) lastSeen[r.agent] = r.created_at;
      });

      // Return as object keyed by seat for Object.values() iteration in admin.html
      const agentMap: Record<string, { seat: string; name: string; specialty: string; status: string; last_active: string | null }> = {};
      for (const a of AGENTS) {
        agentMap[a.id] = {
          seat: a.id,
          name: a.name,
          specialty: a.role,
          status: a.status,
          last_active: lastSeen[a.id] || null,
        };
      }

      return json({
        data: agentMap,
        total: AGENTS.length,
        active: AGENTS.filter(a => a.status === 'active').length,
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
