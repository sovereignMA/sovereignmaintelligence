// automation-engine — AI workflow execution engine
// Runs multi-step agent workflows using Claude and updates deal state
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSING_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']
  .filter(k => !Deno.env.get(k));
if (MISSING_VARS.length) console.error('[automation-engine] Missing env vars:', MISSING_VARS.join(', '));

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

async function runClaudeStep(system: string, userMessage: string, maxTokens = 800): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
  const data = await res.json() as { content?: { text?: string }[] };
  return data.content?.[0]?.text ?? '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (MISSING_VARS.length) return json({ error: `Server misconfiguration — missing: ${MISSING_VARS.join(', ')}` }, 500);

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

    // ── EXECUTE WORKFLOW ───────────────────────────────────────────
    if (action === 'engine:run') {
      const { workflow_id, deal_id, context } = payload || {};
      if (!workflow_id) return json({ error: 'workflow_id required' }, 400);

      // Load workflow
      const { data: wf, error: wfErr } = await sb.from('workflows')
        .select('*').eq('id', String(workflow_id)).eq('user_id', user.id).single();
      if (wfErr || !wf) return json({ error: 'Workflow not found' }, 404);
      if (!wf.is_active) return json({ error: 'Workflow is disabled' }, 400);

      // Load deal context if deal_id provided
      let dealContext = '';
      if (deal_id) {
        const { data: deal } = await sb.from('deals').select('company_name, stage, score, notes, ebitda_gbp, arr_gbp')
          .eq('id', String(deal_id)).eq('user_id', user.id).single();
        if (deal) {
          dealContext = `\n\nDeal context: ${deal.company_name} | Stage: ${deal.stage} | Score: ${deal.score} | EBITDA: £${((deal.ebitda_gbp || 0)/1e6).toFixed(1)}M | ARR: £${((deal.arr_gbp || 0)/1e6).toFixed(1)}M | Notes: ${deal.notes || 'none'}`;
        }
      }

      // Execute each workflow step sequentially
      const steps: Array<{ step: number; agent: string; output: string; status: string }> = [];
      const workflowSteps: Array<{ agent_seat?: string; prompt?: string; description?: string }> = wf.steps || [];

      let previousOutput = String(context || '');
      for (let i = 0; i < Math.min(workflowSteps.length, 5); i++) {
        const step = workflowSteps[i];
        const agentSeat = step.agent_seat || 'S1';
        const stepPrompt = step.prompt || step.description || 'Analyse the context and provide actionable insights.';

        try {
          const system = `You are ${agentSeat} in Project Sovereign, an M&A intelligence platform. ${dealContext}
Your role: ${stepPrompt}
Be concise and actionable. Output structured analysis.`;

          const userMsg = previousOutput
            ? `Previous step output:\n${previousOutput}\n\nContinue the workflow.`
            : `Start the workflow: ${wf.name}`;

          const output = await runClaudeStep(system, userMsg, 600);
          steps.push({ step: i + 1, agent: agentSeat, output, status: 'ok' });
          previousOutput = output;
        } catch (e) {
          steps.push({ step: i + 1, agent: agentSeat, output: '', status: 'error' });
        }
      }

      // Update workflow stats and log
      await Promise.allSettled([
        sb.from('workflows').update({
          run_count: (wf.run_count || 0) + 1,
          last_run_at: new Date().toISOString(),
          success_count: (wf.success_count || 0) + (steps.every(s => s.status === 'ok') ? 1 : 0),
          fail_count: (wf.fail_count || 0) + (steps.some(s => s.status === 'error') ? 1 : 0),
        }).eq('id', String(workflow_id)),
        sb.from('audit_trail').insert({
          user_id: user.id,
          event: 'workflow_executed',
          agent: 'automation-engine',
          details: `workflow=${wf.name} steps=${steps.length} deal=${deal_id || 'none'}`,
          status: steps.every(s => s.status === 'ok') ? 'ok' : 'warn',
        }),
      ]);

      return json({ ok: true, workflow: wf.name, steps, final_output: previousOutput });
    }

    // ── AGENT TASK ─────────────────────────────────────────────────
    if (action === 'engine:task') {
      const { agent_seat, task, deal_id, context } = payload || {};
      if (!agent_seat || !task) return json({ error: 'agent_seat and task required' }, 400);

      const AGENT_ROLES: Record<string, string> = {
        S1: 'Master coordinator — routes tasks to all agents',
        S2: 'UK SaaS deal sourcer — finds acquisition targets',
        S3: 'Company profiler — deep intel, financials, tech stack',
        S4: 'Valuation analyst — EBITDA multiples, ARR, deal modelling',
        S5: 'Risk assessor — red flags, PEP checks, AML signals',
        S6: 'Outreach composer — personalised cold outreach',
        S7: 'Due diligence engine — DD process, checklist, documents',
        S8: 'Legal drafter — LOI, NDA, SPA, DPA templates',
        S9: 'Negotiation advisor — NMD structure, earnout advice',
        S10: 'Pipeline manager — stage transitions, deal scoring',
        S11: 'Comms monitor — Gmail thread parsing, reply drafting',
        S12: 'Financial modeller — P&L, synergy modelling, WACC',
        S13: 'Market intelligence — sector trends, comparable transactions',
        S14: 'Compliance guardian — UK GDPR, FCA, AML, KYC, PECR',
        S15: 'Integration planner — post-acquisition roadmap',
        S16: 'Notifier — Twilio calls, SMS, WhatsApp to Howard',
        S17: 'Analytics engine — event tracking, funnel analysis',
        S18: 'Vault keeper — AES-256-GCM encryption, document storage',
        S19: 'Security auditor — pentest, RLS audit, JWT validation',
        S20: 'Workflow automator — trigger-based workflow execution',
        S21: 'Archivist — self-improvement, learns from deal patterns',
      };

      let dealContext = '';
      if (deal_id) {
        const { data: deal } = await sb.from('deals').select('company_name, stage, score, notes, ebitda_gbp, arr_gbp, sector')
          .eq('id', String(deal_id)).eq('user_id', user.id).single();
        if (deal) {
          dealContext = `\nDeal: ${deal.company_name} | Sector: ${deal.sector || 'SaaS'} | Stage: ${deal.stage} | Score: ${deal.score} | EBITDA: £${((deal.ebitda_gbp || 0)/1e6).toFixed(1)}M | ARR: £${((deal.arr_gbp || 0)/1e6).toFixed(1)}M`;
        }
      }

      const seat = String(agent_seat);
      const system = `You are ${seat} — ${AGENT_ROLES[seat] || 'Sovereign AI agent'} — operating within Project Sovereign, an AI-native M&A command engine for UK SaaS roll-ups.${dealContext}
${context ? `\nAdditional context: ${context}` : ''}
Be precise, professional, and actionable. Format output with clear sections.`;

      const output = await runClaudeStep(system, String(task), 1000);

      await sb.from('audit_trail').insert({
        user_id: user.id,
        event: 'agent_task',
        agent: seat,
        details: String(task).slice(0, 200),
        status: 'ok',
      });

      return json({ ok: true, agent: seat, output });
    }

    // ── PIPELINE ANALYSIS ─────────────────────────────────────────
    if (action === 'engine:pipeline_analysis') {
      // Fetch all active deals for this user
      const { data: deals, error: dealsErr } = await sb.from('deals')
        .select('id, company_name, stage, score, ebitda_gbp, arr_gbp, deal_value_gbp, seller_signal, notes')
        .eq('user_id', user.id)
        .not('stage', 'in', '("completed","dead")')
        .order('score', { ascending: false })
        .limit(10);
      if (dealsErr) return json({ error: dealsErr.message }, 500);

      if (!deals || deals.length === 0) {
        return json({ ok: true, analysis: 'No active deals in pipeline.', deals: [] });
      }

      const dealSummary = deals.map((d: { company_name: string; stage: string; score: number; ebitda_gbp?: number; arr_gbp?: number }) =>
        `${d.company_name} [${d.stage}] score=${d.score} EBITDA=£${((d.ebitda_gbp || 0)/1e6).toFixed(1)}M ARR=£${((d.arr_gbp || 0)/1e6).toFixed(1)}M`
      ).join('\n');

      const analysis = await runClaudeStep(
        'You are S10 Pipeline Manager in Project Sovereign, an M&A intelligence platform for UK SaaS roll-ups. Analyse the deal pipeline and provide Howard Henry with a concise briefing: top priority deal, pipeline health assessment, and 3 specific recommended actions this week.',
        `Active deals:\n${dealSummary}\n\nProvide a structured pipeline briefing.`,
        800
      );

      await sb.from('audit_trail').insert({
        user_id: user.id,
        event: 'pipeline_analysis',
        agent: 'S10',
        details: `${deals.length} deals analysed`,
        status: 'ok',
      });

      return json({ ok: true, analysis, deal_count: deals.length });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
