// email-send — compose, reply, forward, drafts, list, CRUD via Resend API
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function resendSend(p: { from: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html?: string; text?: string; headers?: Record<string, string> }) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: p.from, to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, html: p.html, text: p.text, headers: p.headers || {} }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Resend ${res.status}`);
  return data;
}

// Gateway already verified signature (verify_jwt: true), safe to decode payload directly
function decodeJwt(jwt: string): { sub: string; role?: string } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.sub || payload.role !== 'authenticated') return null;
    return payload;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);
    const jwtPayload = decodeJwt(auth);
    if (!jwtPayload) return json({ error: 'Unauthorized' }, 401);
    const userId = jwtPayload.sub;

    let body: { action?: string; payload?: Record<string, unknown> };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { action, payload } = body;
    const defaultFrom = Deno.env.get('RESEND_FROM') || 'Sovereign <notifications@sovereigncmd.xyz>';

    // ── SEND ──
    if (action === 'send') {
      const to = (payload?.to as string[] || []).filter(Boolean);
      const cc = (payload?.cc as string[] || []).filter(Boolean);
      const bcc = (payload?.bcc as string[] || []).filter(Boolean);
      const subject = String(payload?.subject || '');
      const bodyHtml = String(payload?.body_html || '');
      const bodyText = String(payload?.body_text || bodyHtml.replace(/<[^>]+>/g, ''));
      const fromAlias = String(payload?.from_alias || '');
      const inReplyTo = String(payload?.in_reply_to || '');
      const threadId = String(payload?.thread_id || '');
      if (!to.length) return json({ error: 'to required' }, 400);
      if (!subject) return json({ error: 'subject required' }, 400);

      let fromAddr = defaultFrom;
      if (fromAlias) {
        const { data: alias } = await sb.from('email_aliases').select('*').eq('user_id', userId).eq('alias', fromAlias).eq('is_active', true).single();
        if (alias) fromAddr = `${fromAlias}@${alias.domain}`;
      }

      const headers: Record<string, string> = {};
      if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
      if (threadId) headers['References'] = threadId;
      const result = await resendSend({ from: fromAddr, to, cc, bcc, subject, html: bodyHtml, text: bodyText, headers });

      const { data: email, error } = await sb.from('emails').insert({
        user_id: userId, alias: fromAlias || 'notifications', message_id: result.id,
        from_address: fromAddr, from_name: 'You', to_addresses: to, cc, bcc,
        subject, body_html: bodyHtml, body_text: bodyText, snippet: bodyText.slice(0, 200),
        folder: 'sent', category: 'primary', is_read: true,
        thread_id: threadId || result.id, in_reply_to: inReplyTo || null,
        source: 'resend', sent_at: new Date().toISOString(),
      }).select().single();
      if (error) return json({ error: error.message }, 500);

      if (payload?.draft_id) {
        await sb.from('emails').delete().eq('id', payload.draft_id).eq('user_id', userId).eq('is_draft', true);
      }
      return json({ data: email, resend_id: result.id });
    }

    // ── DRAFT ──
    if (action === 'draft:save') {
      const draftId = payload?.id ? String(payload.id) : undefined;
      const row = {
        user_id: userId, alias: String(payload?.from_alias || 'notifications'),
        from_address: defaultFrom, from_name: 'You',
        to_addresses: (payload?.to as string[] || []),
        cc: (payload?.cc as string[] || []), bcc: (payload?.bcc as string[] || []),
        subject: String(payload?.subject || ''),
        body_html: String(payload?.body_html || ''), body_text: String(payload?.body_text || ''),
        snippet: String(payload?.body_text || '').slice(0, 200),
        folder: 'drafts' as const, is_draft: true, is_read: true, source: 'manual' as const,
        thread_id: payload?.thread_id ? String(payload.thread_id) : undefined,
        in_reply_to: payload?.in_reply_to ? String(payload.in_reply_to) : undefined,
      };
      if (draftId) {
        const { data, error } = await sb.from('emails').update(row).eq('id', draftId).eq('user_id', userId).select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      } else {
        const { data, error } = await sb.from('emails').insert(row).select().single();
        if (error) return json({ error: error.message }, 500);
        return json({ data });
      }
    }

    // ── LIST ──
    if (action === 'list') {
      const folder = String(payload?.folder || 'inbox');
      const category = payload?.category ? String(payload.category) : null;
      const search = payload?.search ? String(payload.search) : null;
      const limit = Math.min(Number(payload?.limit || 50), 100);
      const offset = Number(payload?.offset || 0);

      let q = sb.from('emails').select('id,from_address,from_name,to_addresses,subject,snippet,folder,category,labels,is_read,is_starred,is_draft,is_archived,thread_id,deal_id,attachments,received_at,sent_at,created_at', { count: 'exact' }).eq('user_id', userId);
      if (folder === 'starred') {
        q = q.eq('is_starred', true).neq('folder', 'trash');
      } else {
        q = q.eq('folder', folder);
      }
      if (category) q = q.eq('category', category);
      if (search) q = q.or(`subject.ilike.%${search}%,body_text.ilike.%${search}%,from_address.ilike.%${search}%,from_name.ilike.%${search}%`);
      q = q.order('received_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      q = q.range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ data, count });
    }

    // ── GET ──
    if (action === 'get') {
      const id = String(payload?.id || '');
      if (!id) return json({ error: 'id required' }, 400);
      const { data, error } = await sb.from('emails').select('*').eq('id', id).eq('user_id', userId).single();
      if (error) return json({ error: error.message }, 500);
      if (data && !data.is_read) await sb.from('emails').update({ is_read: true }).eq('id', id);
      return json({ data });
    }

    // ── THREAD ──
    if (action === 'thread') {
      const threadId = String(payload?.thread_id || '');
      if (!threadId) return json({ error: 'thread_id required' }, 400);
      const { data, error } = await sb.from('emails').select('*').eq('user_id', userId).eq('thread_id', threadId).order('created_at', { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── UPDATE ──
    if (action === 'update') {
      const ids = (payload?.ids as string[] || [payload?.id]).filter(Boolean).map(String);
      if (!ids.length) return json({ error: 'id(s) required' }, 400);
      const updates: Record<string, unknown> = {};
      if (payload?.is_starred !== undefined) updates.is_starred = Boolean(payload.is_starred);
      if (payload?.is_read !== undefined) updates.is_read = Boolean(payload.is_read);
      if (payload?.folder) updates.folder = String(payload.folder);
      if (payload?.category) updates.category = String(payload.category);
      if (payload?.labels) updates.labels = payload.labels;
      if (payload?.is_archived !== undefined) {
        updates.is_archived = Boolean(payload.is_archived);
        if (payload.is_archived) updates.folder = 'archive';
      }
      if (!Object.keys(updates).length) return json({ error: 'No updates provided' }, 400);
      const { data, error } = await sb.from('emails').update(updates).eq('user_id', userId).in('id', ids).select();
      if (error) return json({ error: error.message }, 500);
      return json({ data, count: data.length });
    }

    // ── DELETE ──
    if (action === 'delete') {
      const ids = (payload?.ids as string[] || [payload?.id]).filter(Boolean).map(String);
      const permanent = Boolean(payload?.permanent);
      if (!ids.length) return json({ error: 'id(s) required' }, 400);
      if (permanent) {
        const { error } = await sb.from('emails').delete().eq('user_id', userId).in('id', ids);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await sb.from('emails').update({ folder: 'trash' }).eq('user_id', userId).in('id', ids);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    // ── COUNTS ──
    if (action === 'counts') {
      const folders = ['inbox','sent','drafts','trash','spam','archive'];
      const counts: Record<string, number> = {};
      for (const f of folders) {
        const { count } = await sb.from('emails').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('folder', f);
        counts[f] = count || 0;
      }
      const { count: starred } = await sb.from('emails').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_starred', true).neq('folder', 'trash');
      counts.starred = starred || 0;
      const { count: unread } = await sb.from('emails').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('folder', 'inbox').eq('is_read', false);
      counts.unread = unread || 0;
      return json({ data: counts });
    }

    // ── RULES ──
    if (action === 'rules:list') {
      const { data, error } = await sb.from('email_rules').select('*').eq('user_id', userId).order('priority', { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }
    if (action === 'rules:create') {
      const { data, error } = await sb.from('email_rules').insert({ ...payload, user_id: userId }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }
    if (action === 'rules:delete') {
      const { error } = await sb.from('email_rules').delete().eq('id', payload?.id).eq('user_id', userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ── ENCRYPT (store encrypted body for a previously stored email) ──
    if (action === 'encrypt') {
      const id = String(payload?.id || '');
      if (!id) return json({ error: 'id required' }, 400);
      const updates: Record<string, unknown> = { is_encrypted: true };
      if (payload?.body_html !== undefined) updates.body_html = String(payload.body_html);
      if (payload?.body_text !== undefined) updates.body_text = String(payload.body_text);
      if (payload?.snippet !== undefined) updates.snippet = String(payload.snippet);
      const { data, error } = await sb.from('emails').update(updates).eq('id', id).eq('user_id', userId).select().single();
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
