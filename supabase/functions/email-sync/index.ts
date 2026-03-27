// email-sync — Nylas API v3 integration for multi-provider email sync
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NYLAS_API = 'https://api.us.nylas.com/v3';

async function nylas(method: string, path: string, body?: unknown) {
  const apiKey = Deno.env.get('NYLAS_API_KEY');
  if (!apiKey) throw new Error('NYLAS_API_KEY not configured');
  const opts: RequestInit = {
    method,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(NYLAS_API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || `Nylas ${res.status}`);
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

    // ── AUTH URL ──
    if (action === 'sync:auth_url') {
      const provider = String(payload?.provider || 'google');
      const callbackUrl = String(payload?.callback_url || '');
      const clientId = Deno.env.get('NYLAS_CLIENT_ID');
      if (!clientId) return json({ error: 'NYLAS_CLIENT_ID not configured' }, 500);
      const authUrl = `https://api.us.nylas.com/v3/connect/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&provider=${provider}`;
      return json({ url: authUrl });
    }

    // ── CONNECT ──
    if (action === 'sync:connect') {
      const code = String(payload?.code || '');
      const provider = String(payload?.provider || 'gmail');
      if (!code) return json({ error: 'code required' }, 400);
      const clientId = Deno.env.get('NYLAS_CLIENT_ID');
      const clientSecret = Deno.env.get('NYLAS_CLIENT_SECRET');
      if (!clientId || !clientSecret) return json({ error: 'Nylas credentials not configured' }, 500);

      const tokenRes = await fetch('https://api.us.nylas.com/v3/connect/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) return json({ error: tokenData?.error || 'Token exchange failed' }, 500);

      const { data, error } = await sb.from('email_connections').upsert({
        user_id: user.id, provider, nylas_grant_id: tokenData.grant_id,
        email_address: tokenData.email || '', sync_state: 'active',
        last_sync_at: new Date().toISOString(),
      }, { onConflict: 'user_id,email_address' }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── DISCONNECT ──
    if (action === 'sync:disconnect') {
      const id = String(payload?.id || '');
      if (!id) return json({ error: 'id required' }, 400);
      const { data: conn } = await sb.from('email_connections').select('*').eq('id', id).eq('user_id', user.id).single();
      if (!conn) return json({ error: 'Connection not found' }, 404);
      try { await nylas('DELETE', `/grants/${conn.nylas_grant_id}`); } catch(e) { console.error('Nylas revoke:', e); }
      const { error } = await sb.from('email_connections').delete().eq('id', id).eq('user_id', user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── STATUS ──
    if (action === 'sync:status') {
      const { data, error } = await sb.from('email_connections').select('*').eq('user_id', user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── PULL ──
    if (action === 'sync:pull') {
      const connectionId = String(payload?.connection_id || '');
      const limit = Math.min(Number(payload?.limit || 25), 50);
      let q = sb.from('email_connections').select('*').eq('user_id', user.id).eq('sync_state', 'active');
      if (connectionId) q = q.eq('id', connectionId);
      const { data: conn } = await q.limit(1).single();
      if (!conn || !conn.nylas_grant_id) return json({ error: 'No active connection' }, 404);

      const messages = await nylas('GET', `/grants/${conn.nylas_grant_id}/messages?limit=${limit}`);
      const items = messages.data || [];
      let imported = 0;

      for (const msg of items) {
        const { data: existing } = await sb.from('emails').select('id').eq('message_id', msg.id).eq('user_id', user.id).single();
        if (existing) continue;

        const fromAddr = msg.from?.[0]?.email || '';
        const fromName = msg.from?.[0]?.name || fromAddr;
        const toAddrs = (msg.to || []).map((t: {email:string}) => t.email);

        let dealId: string | null = null;
        const senderDomain = fromAddr.split('@')[1]?.toLowerCase();
        if (senderDomain) {
          const { data: contact } = await sb.from('contacts').select('deal_id').eq('user_id', user.id).ilike('email', `%${senderDomain}%`).limit(1).single();
          if (contact?.deal_id) dealId = contact.deal_id;
        }

        await sb.from('emails').insert({
          user_id: user.id, message_id: msg.id,
          from_address: fromAddr, from_name: fromName, to_addresses: toAddrs,
          subject: msg.subject || '(no subject)',
          body_text: msg.snippet || '', snippet: (msg.snippet || '').slice(0, 200),
          folder: msg.folders?.includes('SENT') ? 'sent' : msg.folders?.includes('TRASH') ? 'trash' : msg.folders?.includes('SPAM') ? 'spam' : 'inbox',
          category: 'primary', is_read: !msg.unread, is_starred: msg.starred || false,
          thread_id: msg.thread_id || null, deal_id: dealId, source: 'nylas',
          received_at: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
        });
        imported++;
      }

      await sb.from('email_connections').update({ last_sync_at: new Date().toISOString() }).eq('id', conn.id);
      return json({ ok: true, imported, total: items.length });
    }

    // ── DEAL EMAILS ──
    if (action === 'deal:emails') {
      const dealId = String(payload?.deal_id || '');
      if (!dealId) return json({ error: 'deal_id required' }, 400);
      const { data, error } = await sb.from('emails').select('id,from_address,from_name,to_addresses,subject,snippet,folder,is_read,received_at,sent_at,source')
        .eq('deal_id', dealId).order('received_at', { ascending: false }).limit(50);
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
