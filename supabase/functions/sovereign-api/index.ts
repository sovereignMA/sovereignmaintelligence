// sovereign-api — core data CRUD for deals, contacts, docs, audit, profile
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    let body: { action?: string; payload?: Record<string, unknown>; deal_id?: string; contact_id?: string };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { action, payload, deal_id, contact_id } = body;

    // ── DEALS ──────────────────────────────────────────────────
    if (action === 'deals:list') {
      const { data, error } = await sb.from('deals').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'deals:create') {
      const { data, error } = await sb.from('deals').insert({ ...payload, user_id: user.id }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'deals:update') {
      const { data, error } = await sb.from('deals').update(payload).eq('id', deal_id).eq('user_id', user.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'deals:delete') {
      const { error } = await sb.from('deals').delete().eq('id', deal_id).eq('user_id', user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── CONTACTS ────────────────────────────────────────────────
    if (action === 'contacts:list') {
      const q = sb.from('contacts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (deal_id) q.eq('deal_id', deal_id);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'contacts:create') {
      const { data, error } = await sb.from('contacts').insert({ ...payload, user_id: user.id }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'contacts:update') {
      const { data, error } = await sb.from('contacts').update(payload).eq('id', contact_id).eq('user_id', user.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── OUTREACH ────────────────────────────────────────────────
    if (action === 'outreach:log') {
      const { data, error } = await sb.from('outreach_log').insert({ ...payload, user_id: user.id, contact_id }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'outreach:list') {
      const { data, error } = await sb.from('outreach_log').select('*, contacts(full_name,email), deals(company_name)').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── DOCUMENTS ───────────────────────────────────────────────
    if (action === 'docs:list') {
      const { data, error } = await sb.from('documents').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'docs:save') {
      const { data, error } = await sb.from('documents').upsert({ ...payload, user_id: user.id }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── CONVERSATIONS ────────────────────────────────────────────
    if (action === 'conv:save') {
      const { conversation, messages } = payload;
      const { data, error } = await sb.from('conversations').upsert({
        ...conversation,
        user_id: user.id,
        messages,
        token_count: messages.reduce((n: number, m: { content: string }) => n + Math.ceil(m.content.length / 4), 0),
      }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── AUDIT ────────────────────────────────────────────────────
    if (action === 'audit:log') {
      const { event, agent, details, status } = payload;
      const { error } = await sb.from('audit_trail').insert({ user_id: user.id, event, agent, details, status, actor_id: user.id });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── PROFILE ──────────────────────────────────────────────────
    if (action === 'profile:get') {
      const { data, error } = await sb.from('user_profiles').select('*').eq('id', user.id).single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'profile:update') {
      const { data, error } = await sb.from('user_profiles').upsert({ id: user.id, ...payload }).select().single();
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
