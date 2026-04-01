// personaplex-proxy — NVIDIA NIM PersonaPlex persona routing with Claude fallback
// Mirrors ai-proxy interface: { system, messages, max_tokens, agent_name, stream }
// Routes to PersonaPlex when NVIDIA_NIM_API_KEY is set; falls back to Claude if not.
// Returns responses in Anthropic format so the client needs no changes.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Persona map: agent name or seat → PersonaPlex persona config ──────────────
// PersonaPlex-7b is best for dialogue, outreach, and seller-facing communications.
// For analytical tasks (DD, valuations, legal) Claude is preferred — but this proxy
// routes all agents through PersonaPlex when NVIDIA_NIM_API_KEY is set. To route
// analytical agents back to Claude, set env var PERSONAPLEX_DIALOGUE_ONLY=true.
const ANALYTICAL_SEATS = new Set(['S1','S2','S3','S4','S5','S7','S8','S9','S10','S15','S16','S17']);

interface PersonaConfig {
  name: string;
  role: string;
  communication_style: string;
  vocabulary_level: string;
  tone: string;
}

const PERSONA_MAP: Record<string, PersonaConfig> = {
  // ── Sourcing & Analysis ───────────────────────────────────────────────────
  'S1': { name: 'Silas Vane', role: 'CIO and forensic off-market sourcing specialist', communication_style: 'precise, data-driven, intelligence-led briefings', vocabulary_level: 'expert', tone: 'authoritative and focused' },
  'S2': { name: 'Kira Nyx', role: 'Data Architect specialising in tech debt and AI automation', communication_style: 'technical, structured, uses code metaphors', vocabulary_level: 'expert', tone: 'incisive and systematic' },
  'S3': { name: 'Bastian Cole', role: 'Auditor focused on hidden balance-sheet capital', communication_style: 'methodical, numbers-first, flags anomalies', vocabulary_level: 'expert', tone: 'precise and forensic' },
  'S4': { name: 'Lyra Belacqua', role: 'Market Sentiment and PE exits specialist', communication_style: 'market-narrative, trend-aware, uses multiples fluently', vocabulary_level: 'expert', tone: 'confident and strategic' },
  'S5': { name: 'Jaxen Reed', role: 'IP and Security specialist', communication_style: 'risk-focused, compliance-aware, concise', vocabulary_level: 'expert', tone: 'measured and protective' },
  // ── Deal Execution ────────────────────────────────────────────────────────
  'S6': { name: 'Vesper Thorne', role: 'Lead Negotiator and NMD structure architect', communication_style: 'persuasive, deal-focused, uses financial structuring language', vocabulary_level: 'expert', tone: 'confident and pragmatic' },
  'S7': { name: 'Caspian Frost', role: 'Lender Liaison and non-recourse debt specialist', communication_style: 'finance-fluent, creditor-aware, structured', vocabulary_level: 'expert', tone: 'methodical and credible' },
  'S8': { name: 'Sloane Haze', role: 'M&A Attorney focused on SPAs and minimal PG exposure', communication_style: 'legal-precise, clause-aware, risk-flagging', vocabulary_level: 'expert', tone: 'formal yet pragmatic' },
  'S9': { name: 'Thatcher Grey', role: 'Tax specialist — CGT, BADR, HoldCo optimisation', communication_style: 'HMRC-fluent, structures-focused, numerically precise', vocabulary_level: 'expert', tone: 'authoritative and exacting' },
  // ── Risk & Closing ────────────────────────────────────────────────────────
  'S10': { name: 'Rhea Vance', role: 'Risk Officer — scepticism engine', communication_style: 'adversarial questioning, stress-test framing', vocabulary_level: 'expert', tone: 'bluntly sceptical and rigorous' },
  'S11': { name: 'Kaelen Voss', role: 'Chief Closer and principled negotiator', communication_style: 'direct, bridge-building, deal-momentum oriented', vocabulary_level: 'advanced', tone: 'confident, warm, and decisive' },
  // ── Seller Engagement ─────────────────────────────────────────────────────
  'S12': { name: 'Mila Quinn', role: 'Empathy Lead — seller trust and emotional journey', communication_style: 'warm, listening-first, mirrors seller language', vocabulary_level: 'conversational', tone: 'empathetic and reassuring' },
  'S13': { name: 'Orion Pax', role: 'Funnel Architect — cold outreach to signed LOI', communication_style: 'sequence-driven, hook-oriented, persuasive', vocabulary_level: 'advanced', tone: 'energetic and methodical' },
  'S14': { name: 'Soren Vale', role: 'Behavioural Analyst — reading seller signals', communication_style: 'observational, pattern-matching, advises on framing', vocabulary_level: 'expert', tone: 'perceptive and calibrated' },
  // ── Exit & Growth ─────────────────────────────────────────────────────────
  'S15': { name: 'Elara Sterling', role: 'Exit Lead — SIC migration and institutional positioning', communication_style: 'exit-narrative, investor-facing, strategic', vocabulary_level: 'expert', tone: 'visionary and transaction-focused' },
  'S16': { name: 'Dr. Aris Thorne', role: 'AI Scientist — value creation through AI implementation', communication_style: 'technical, ROI-focused, implementation-ready', vocabulary_level: 'expert', tone: 'innovative and precise' },
  'S17': { name: 'Nova Skye', role: 'Ops Lead — roll-up integration and standardisation', communication_style: 'process-driven, playbook-oriented, operational', vocabulary_level: 'advanced', tone: 'organised and execution-focused' },
  'S18': { name: 'Gideon Cross', role: 'Growth specialist — post-acquisition revenue scaling', communication_style: 'revenue-narrative, growth-hypothesis driven', vocabulary_level: 'advanced', tone: 'ambitious and commercially sharp' },
  // ── System Agents ─────────────────────────────────────────────────────────
  'S19': { name: 'Echo', role: 'Interface Specialist — API integrations and systems bridge', communication_style: 'technical, integration-focused, systems-thinking', vocabulary_level: 'expert', tone: 'precise and adaptive' },
  'S20': { name: 'Sentinel', role: 'Gatekeeper — signal filter and Commander attention management', communication_style: 'terse, priority-ranked, filter-oriented', vocabulary_level: 'advanced', tone: 'protective and efficient' },
  'S21': { name: 'The Archivist', role: 'VPM — vector pattern memory and institutional knowledge', communication_style: 'historical-pattern matching, synthesising, meta-analytical', vocabulary_level: 'expert', tone: 'measured and encyclopaedic' },
};

// Name-to-seat lookup for when agent_name is passed as a full name
const NAME_TO_SEAT: Record<string, string> = {
  'silas vane': 'S1', 'kira nyx': 'S2', 'bastian cole': 'S3', 'lyra belacqua': 'S4',
  'jaxen reed': 'S5', 'vesper thorne': 'S6', 'caspian frost': 'S7', 'sloane haze': 'S8',
  'thatcher grey': 'S9', 'rhea vance': 'S10', 'kaelen voss': 'S11', 'mila quinn': 'S12',
  'orion pax': 'S13', 'soren vale': 'S14', 'elara sterling': 'S15', 'dr. aris thorne': 'S16',
  'nova skye': 'S17', 'gideon cross': 'S18', 'echo': 'S19', 'sentinel': 'S20', 'the archivist': 'S21',
};

function resolvePersona(agent_name: string): PersonaConfig {
  // Try direct seat key (e.g. "S6")
  if (PERSONA_MAP[agent_name]) return PERSONA_MAP[agent_name];
  // Try lowercase name lookup
  const seat = NAME_TO_SEAT[agent_name.toLowerCase()];
  if (seat && PERSONA_MAP[seat]) return PERSONA_MAP[seat];
  // Default fallback persona
  return { name: agent_name, role: 'M&A specialist', communication_style: 'professional and precise', vocabulary_level: 'expert', tone: 'authoritative' };
}

function resolveSeat(agent_name: string): string {
  if (agent_name.match(/^S\d{1,2}$/)) return agent_name;
  return NAME_TO_SEAT[agent_name.toLowerCase()] || '';
}

// ── Convert OpenAI message format to Anthropic for client compatibility ────────
function openAIToAnthropic(openAIResp: Record<string, unknown>): Record<string, unknown> {
  const choices = (openAIResp.choices as Array<{ message?: { content?: string } }>) || [];
  const text = choices[0]?.message?.content || '';
  return {
    id: openAIResp.id || 'personaplex-resp',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: openAIResp.model || 'personaplex',
    stop_reason: 'end_turn',
    usage: openAIResp.usage || { input_tokens: 0, output_tokens: 0 },
  };
}

// ── Convert OpenAI SSE stream → Anthropic SSE stream ─────────────────────────
function transformOpenAIStream(openAIStream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return new ReadableStream({
    async start(controller) {
      const reader = openAIStream.getReader();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }
            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                // Emit in Anthropic content_block_delta format
                const anthropicChunk = JSON.stringify({
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text: delta },
                });
                controller.enqueue(encoder.encode(`data: ${anthropicChunk}\n\n`));
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth: same pattern as ai-proxy ───────────────────────────────────────
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr) return json({ error: 'Auth service unavailable' }, 503);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let body: { system?: string; messages?: unknown[]; max_tokens?: number; stream?: boolean; model?: string; agent_name?: string };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

    const { system, messages, stream = false, agent_name = 'unknown' } = body;
    const max_tokens = Math.min(body.max_tokens ?? 1200, 4096);

    const nimKey = Deno.env.get('NVIDIA_NIM_API_KEY');
    const nimBase = Deno.env.get('NVIDIA_NIM_BASE_URL') || 'https://integrate.api.nvidia.com';
    const dialogueOnly = Deno.env.get('PERSONAPLEX_DIALOGUE_ONLY') === 'true';

    // Determine if we should use PersonaPlex or fall back to Claude
    const seat = resolveSeat(agent_name);
    const useAnalyticalFallback = dialogueOnly && ANALYTICAL_SEATS.has(seat);
    const usePersonaPlex = !!nimKey && !useAnalyticalFallback;

    let responseBody: ReadableStream<Uint8Array> | Record<string, unknown>;
    let isStream = false;
    let model = 'personaplex-7b';

    if (usePersonaPlex) {
      // ── NVIDIA NIM PersonaPlex route ───────────────────────────────────────
      const persona = resolvePersona(agent_name);

      // Build OpenAI-compatible messages array with system prompt
      const openAIMessages: Array<{ role: string; content: string }> = [];
      if (system) openAIMessages.push({ role: 'system', content: system });
      for (const m of (messages as Array<{ role: string; content: string }> || [])) {
        openAIMessages.push({ role: m.role, content: m.content });
      }

      const nimRes = await fetch(`${nimBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${nimKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'nvidia/personaplex-7b',
          messages: openAIMessages,
          max_tokens,
          stream,
          persona,
        }),
      });

      if (!nimRes.ok) {
        let err: Record<string, unknown> = {};
        try { err = await nimRes.json(); } catch { /* ignore */ }
        console.error(`[personaplex-proxy] NIM ${nimRes.status}: ${JSON.stringify(err)}`);
        // Fall through to Claude on NIM error
        return await claudeFallback(auth, sb, user.id, { system, messages, max_tokens, stream, agent_name });
      }

      // Audit log (fire and forget)
      sb.from('audit_trail').insert({
        user_id: user.id, event: 'ai_call', agent: agent_name,
        details: `model=personaplex-7b max_tokens=${max_tokens} seat=${seat}`, status: 'ok',
      }).then(() => {});

      if (stream) {
        return new Response(transformOpenAIStream(nimRes.body!), {
          headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });
      }
      const data = await nimRes.json();
      return json(openAIToAnthropic(data));

    } else {
      // ── Claude fallback (no NIM key, or analytical agent with PERSONAPLEX_DIALOGUE_ONLY) ──
      return await claudeFallback(auth, sb, user.id, { system, messages, max_tokens, stream, agent_name });
    }

  } catch (e) {
    console.error('[personaplex-proxy] unhandled error:', e);
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Claude fallback: same logic as ai-proxy ───────────────────────────────────
async function claudeFallback(
  auth: string,
  sb: ReturnType<typeof createClient>,
  userId: string,
  opts: { system?: string; messages?: unknown[]; max_tokens: number; stream: boolean; agent_name: string }
): Promise<Response> {
  const { system, messages, max_tokens, stream, agent_name } = opts;
  const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'];
  const model = 'claude-sonnet-4-20250514';

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return json({ error: 'Neither NVIDIA_NIM_API_KEY nor ANTHROPIC_API_KEY is configured' }, 503);

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens, stream, system, messages }),
  });

  if (!anthropicRes.ok) {
    let err: { error?: { message?: string } } = {};
    try { err = await anthropicRes.json(); } catch { /* ignore */ }
    console.error(`[personaplex-proxy/claude] Anthropic ${anthropicRes.status}:`, err);
    return json({ error: err.error?.message || `Anthropic error ${anthropicRes.status}` }, anthropicRes.status);
  }

  sb.from('audit_trail').insert({
    user_id: userId, event: 'ai_call', agent: agent_name,
    details: `model=${model} max_tokens=${max_tokens} via=claude-fallback`, status: 'ok',
  }).then(() => {});

  if (stream) {
    return new Response(anthropicRes.body, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
  }
  const data = await anthropicRes.json();
  return json(data);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
