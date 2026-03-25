// ai-proxy — streaming Claude proxy with audit logging
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSING_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']
  .filter(k => !Deno.env.get(k));
if (MISSING_VARS.length) console.error('[ai-proxy] Missing env vars:', MISSING_VARS.join(', '));

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

    let body: { system?: string; messages?: unknown[]; max_tokens?: number; stream?: boolean; model?: string; agent_name?: string };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { system, messages, max_tokens = 1200, stream = false, model = 'claude-sonnet-4-6', agent_name = 'unknown' } = body;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        stream,
        system,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      let err: { error?: { message?: string; type?: string } } = {};
      try { err = await anthropicRes.json(); } catch { /* ignore */ }
      console.error(`[ai-proxy] Anthropic ${anthropicRes.status}: ${JSON.stringify(err)}`);
      return json({ error: err.error?.message || `Anthropic error ${anthropicRes.status}`, anthropic_status: anthropicRes.status, details: err }, anthropicRes.status);
    }

    // Log to audit trail (fire and forget)
    sb.from('audit_trail').insert({
      user_id: user.id,
      event: 'ai_call',
      agent: agent_name,
      details: `model=${model} max_tokens=${max_tokens}`,
      status: 'ok',
    }).then(() => {});

    if (stream) {
      return new Response(anthropicRes.body, {
        headers: {
          ...CORS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await anthropicRes.json();
    return json(data);

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
