// api/cron/self-improve.js
// Weekly self-learning loop: extract patterns from agent outcomes, upsert learnings,
// auto-create diagnostic tasks for underperforming agent types.
// Schedule: every Sunday 07:00 UTC (vercel.json: "0 7 * * 0")

export const config = { runtime: 'edge' };

const AGENT_TYPES = ['research', 'outreach', 'analysis', 'pipeline', 'general'];
const LOOKBACK_DAYS = 30;
const MIN_SAMPLE_FOR_EXTRACTION = 5;
const SELF_HEAL_THRESHOLD = 0.70;

// Types that use deal_id for outcome correlation
const DEAL_CHECK_TYPES = new Set(['research', 'analysis', 'pipeline']);

// Wilson-interval-inspired dampening so small samples don't claim high confidence.
// n=1 100% → 0.167 · n=5 100% → 0.500 · n=20 80% → 0.640 · n=50 80% → 0.727
function wilsonConfidence(sampleSize, rawSuccessRate) {
  if (sampleSize === 0) return 0;
  return (sampleSize / (sampleSize + 5)) * rawSuccessRate;
}

// Returns true if the task produced a downstream outcome signal.
function outcomeSignal(task, dealById, respondedDealIds) {
  if (task.status === 'failed') return false;
  const dealId = task.input?.deal_id;
  const completedAt = new Date(task.completed_at);

  if (task.agent_type === 'outreach') {
    // Positive: a contact on the same deal responded after this task ran
    return dealId ? respondedDealIds.has(dealId) : true;
  }
  if (DEAL_CHECK_TYPES.has(task.agent_type)) {
    // Positive: the linked deal was updated after this task completed
    if (dealId) {
      const deal = dealById[dealId];
      return deal ? new Date(deal.updated_at) > completedAt : task.status === 'complete';
    }
    return task.status === 'complete';
  }
  return task.status === 'complete';
}

// Calls Claude to extract 3–5 patterns from task data for a given agent type.
// Returns an array of learning row objects (may be empty on error).
async function extractPatterns(agentType, typeTasks, stats, deals, respondedDealIds) {
  const { n, successCount, rawSuccessRate } = stats;
  const taskSummary = typeTasks.slice(0, 40).map(t =>
    `- [${t._success ? 'SUCCESS' : 'FAIL'}] ${t.title}` +
    (t.description ? ` | ${t.description.slice(0, 80)}` : '')
  ).join('\n');

  const dealContext = agentType === 'outreach'
    ? `Contacts that responded recently (deal IDs): ${[...respondedDealIds].slice(0, 10).join(', ') || 'none'}`
    : DEAL_CHECK_TYPES.has(agentType)
      ? `Deals updated recently: ${deals.slice(0, 8).map(d => `${d.company_name} (${d.stage}, sector:${d.sector})`).join(', ') || 'none'}`
      : '';

  const prompt = `You are analysing performance data for an autonomous ${agentType} agent used in a UK SaaS M&A acquisition fund.

Task outcomes (SUCCESS = positive outcome, FAIL = task failed or no outcome):
${taskSummary}
${dealContext ? `\nContext:\n${dealContext}\n` : ''}
Overall success rate: ${Math.round(rawSuccessRate * 100)}% (${successCount}/${n})

Extract 3–5 actionable patterns. Each must be a concrete insight that would improve future ${agentType} tasks if prepended to the system prompt.

Return ONLY a JSON array (no markdown, no explanation):
[{"pattern_key":"snake_case_max_40_chars","outcome":"One sentence max 25 words.","raw_success_rate":0.0,"sample_size":0}]`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: 'You are a data analyst. Return only valid JSON arrays. No markdown fences.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) return [];

    const raw = (await aiRes.json()).content?.[0]?.text ?? '';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const patterns = JSON.parse(match[0]);
    if (!Array.isArray(patterns)) return [];

    return patterns
      .filter(p => p.pattern_key && p.outcome)
      .map(p => {
        const sampleSize = Math.min(n, typeof p.sample_size === 'number' ? p.sample_size : n);
        const rate = typeof p.raw_success_rate === 'number'
          ? Math.max(0, Math.min(1, p.raw_success_rate))
          : rawSuccessRate;
        return {
          agent_type: agentType,
          pattern_key: `${agentType}_${p.pattern_key}`.slice(0, 80),
          outcome: p.outcome.slice(0, 300),
          sample_size: sampleSize,
          confidence: wilsonConfidence(sampleSize, rate),
        };
      });
  } catch {
    return [];
  }
}

export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const base = process.env.SUPABASE_URL;
  const headers = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Parallel data fetch — 200 tasks max (5 types × 40 used per Claude call)
  const [tasksRes, dealsRes, contactsRes] = await Promise.all([
    fetch(
      `${base}/rest/v1/agent_tasks` +
      `?or=(status.eq.complete,status.eq.failed)` +
      `&completed_at=gte.${since}` +
      `&select=id,agent_type,title,description,status,input,completed_at` +
      `&order=completed_at.desc&limit=200`,
      { headers }
    ),
    fetch(
      `${base}/rest/v1/deals?updated_at=gte.${since}&select=id,stage,updated_at,company_name,sector`,
      { headers }
    ),
    fetch(
      `${base}/rest/v1/contacts?last_contact_at=gte.${since}&select=id,deal_id`,
      { headers }
    ),
  ]);

  const tasks    = tasksRes.ok    ? await tasksRes.json()    : [];
  const deals    = dealsRes.ok    ? await dealsRes.json()    : [];
  const contacts = contactsRes.ok ? await contactsRes.json() : [];

  if (!tasks.length) {
    return Response.json({ ok: true, message: 'No completed tasks in lookback window', ts: new Date().toISOString() });
  }

  const dealById = Object.fromEntries(deals.map(d => [d.id, d]));
  const respondedDealIds = new Set(contacts.map(c => c.deal_id).filter(Boolean));

  // Group tasks by type — store only what's needed, avoid full-object spread
  const byType = Object.fromEntries(AGENT_TYPES.map(t => [t, []]));
  for (const task of tasks) {
    if (!byType[task.agent_type]) continue;
    byType[task.agent_type].push({
      title: task.title,
      description: task.description,
      status: task.status,
      input: task.input,
      completed_at: task.completed_at,
      _success: outcomeSignal(task, dealById, respondedDealIds),
    });
  }

  // Compute stats and baseline learnings for all types
  const allLearnings = [];
  const typeStats = {};

  for (const agentType of AGENT_TYPES) {
    const typeTasks = byType[agentType];
    const n = typeTasks.length;
    const successCount = typeTasks.filter(t => t._success).length;
    const rawSuccessRate = n > 0 ? successCount / n : 0;
    typeStats[agentType] = { n, successCount, rawSuccessRate };

    if (n > 0) {
      allLearnings.push({
        agent_type: agentType,
        pattern_key: `${agentType}_overall_success_rate`,
        outcome: `${agentType} tasks succeed ${Math.round(rawSuccessRate * 100)}% of the time (n=${n}). ` +
          (rawSuccessRate < SELF_HEAL_THRESHOLD
            ? 'Performance is below target — prioritise quality over speed.'
            : 'Performance is healthy.'),
        sample_size: n,
        confidence: wilsonConfidence(n, rawSuccessRate),
      });
    }
  }

  // Parallel Claude extractions for types with enough data
  const typesForExtraction = AGENT_TYPES.filter(t => typeStats[t].n >= MIN_SAMPLE_FOR_EXTRACTION);
  const extractionResults = await Promise.all(
    typesForExtraction.map(agentType =>
      extractPatterns(agentType, byType[agentType], typeStats[agentType], deals, respondedDealIds)
    )
  );
  for (const rows of extractionResults) allLearnings.push(...rows);

  // Upsert all learnings
  let upserted = 0;
  if (allLearnings.length > 0) {
    const upsertRes = await fetch(`${base}/rest/v1/agent_learnings`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(allLearnings),
    });
    if (upsertRes.ok) upserted = allLearnings.length;
  }

  // Self-healing: create diagnostic tasks for underperforming agent types
  const selfHealTasks = AGENT_TYPES
    .filter(t => typeStats[t].n >= MIN_SAMPLE_FOR_EXTRACTION && typeStats[t].rawSuccessRate < SELF_HEAL_THRESHOLD)
    .map(agentType => {
      const stat = typeStats[agentType];
      const failedSamples = byType[agentType]
        .filter(t => !t._success)
        .slice(0, 10)
        .map(t => ({ title: t.title, description: t.description?.slice(0, 100) || null }));
      return {
        title: `Improve ${agentType} agent performance`,
        description:
          `The ${agentType} agent has a ${Math.round(stat.rawSuccessRate * 100)}% success rate ` +
          `over the last ${LOOKBACK_DAYS} days (${stat.successCount}/${stat.n}). ` +
          `Recommend improvements to: (1) task descriptions, (2) the system prompt, ` +
          `(3) which tasks this agent should or should not handle.`,
        agent_type: 'general',
        status: 'todo',
        priority: 1,
        input: {
          underperforming_agent: agentType,
          success_rate: stat.rawSuccessRate,
          lookback_days: LOOKBACK_DAYS,
          failed_task_samples: failedSamples,
        },
      };
    });

  if (selfHealTasks.length > 0) {
    await fetch(`${base}/rest/v1/agent_tasks`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(selfHealTasks),
    });
  }

  return Response.json({
    ok: true,
    learnings_upserted: upserted,
    self_heal_tasks_created: selfHealTasks.length,
    agent_stats: Object.fromEntries(
      Object.entries(typeStats).map(([k, v]) => [
        k, { n: v.n, success_rate: Math.round(v.rawSuccessRate * 100) + '%' },
      ])
    ),
    ts: new Date().toISOString(),
  });
}
