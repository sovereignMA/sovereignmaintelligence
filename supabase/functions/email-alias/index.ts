// email-alias — ImprovMX alias management + CRUD
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IMPROVMX_API = 'https://api.improvmx.com/v3';

async function improvmx(method: string, path: string, body?: unknown) {
  const apiKey = Deno.env.get('IMPROVMX_API_KEY');
  if (!apiKey) throw new Error('IMPROVMX_API_KEY not configured');
  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': 'Basic ' + btoa('api:' + apiKey),
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(IMPROVMX_API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `ImprovMX ${res.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr) return json({ error: 'Auth service unavailable' }, 503);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let body: { action?: string; payload?: Record<string, unknown> };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { action, payload } = body;

    if (action === 'alias:list') {
      const { data, error } = await sb.from('email_aliases').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'alias:create') {
      const alias = String(payload?.alias || '').toLowerCase().trim();
      const domain = String(payload?.domain || 'sovereigncmd.xyz').toLowerCase().trim();
      const forward_to = String(payload?.forward_to || '').trim();
      if (!alias || !forward_to) return json({ error: 'alias and forward_to required' }, 400);
      if (!/^[a-z0-9._+-]+$/.test(alias)) return json({ error: 'Invalid alias format' }, 400);
      try {
        await improvmx('POST', `/domains/${domain}/aliases`, { alias, forward: forward_to });
      } catch (e) {
        if (e.message?.includes('already exists')) {
          await improvmx('PUT', `/domains/${domain}/aliases/${alias}`, { forward: forward_to });
        } else {
          return json({ error: 'ImprovMX: ' + e.message }, 500);
        }
      }
      const { data, error } = await sb.from('email_aliases').upsert({
        user_id: user.id, alias, domain, forward_to, is_active: true,
      }, { onConflict: 'alias,domain' }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'alias:update') {
      const id = String(payload?.id || '');
      if (!id) return json({ error: 'id required' }, 400);
      const { data: existing } = await sb.from('email_aliases').select('*').eq('id', id).eq('user_id', user.id).single();
      if (!existing) return json({ error: 'Alias not found' }, 404);
      const forward_to = payload?.forward_to ? String(payload.forward_to) : existing.forward_to;
      const is_active = payload?.is_active !== undefined ? Boolean(payload.is_active) : existing.is_active;
      try {
        if (is_active) {
          await improvmx('PUT', `/domains/${existing.domain}/aliases/${existing.alias}`, { forward: forward_to });
        } else {
          await improvmx('DELETE', `/domains/${existing.domain}/aliases/${existing.alias}`);
        }
      } catch (e) { console.error('ImprovMX update error:', e.message); }
      const { data, error } = await sb.from('email_aliases').update({
        forward_to, is_active, updated_at: new Date().toISOString()
      }).eq('id', id).eq('user_id', user.id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    if (action === 'alias:delete') {
      const id = String(payload?.id || '');
      if (!id) return json({ error: 'id required' }, 400);
      const { data: existing } = await sb.from('email_aliases').select('*').eq('id', id).eq('user_id', user.id).single();
      if (!existing) return json({ error: 'Alias not found' }, 404);
      try { await improvmx('DELETE', `/domains/${existing.domain}/aliases/${existing.alias}`); } catch (e) { console.error('ImprovMX delete error:', e.message); }
      const { error } = await sb.from('email_aliases').delete().eq('id', id).eq('user_id', user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'domains:list') {
      try {
        const res = await improvmx('GET', '/domains');
        return json({ data: res.domains || [] });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (action === 'domain:check') {
      const domain = String(payload?.domain || 'sovereigncmd.xyz');
      try {
        const res = await improvmx('GET', `/domains/${domain}/check`);
        return json({ data: res });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
