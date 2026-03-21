// gmail-comms — Gmail thread reading, sending, AI drafting via OAuth
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function gmailRequest(endpoint: string, gmailToken: string, method = 'GET', body?: unknown) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${gmailToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let err: { error?: { message?: string } } = {};
    try { err = await res.json(); } catch { /* ignore */ }
    throw new Error(err.error?.message || `Gmail error ${res.status}`);
  }
  return res.json();
}

function encodeEmail(to: string, from: string, subject: string, body: string, replyTo?: string): string {
  const headers = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    replyTo ? `In-Reply-To: ${replyTo}` : '',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].filter(Boolean).join('\r\n');
  return btoa(unescape(encodeURIComponent(headers))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Get Gmail OAuth token from user session provider token
    const { data: { session } } = await sb.auth.getSession();
    const gmailToken = session?.provider_token;
    if (!gmailToken) return json({ error: 'Gmail not connected — sign in with Google OAuth' }, 401);

    let reqBody: { action?: string; payload?: Record<string, unknown> };
    try { reqBody = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { action, payload } = reqBody;

    // ── LIST THREADS ─────────────────────────────────────────────
    if (action === 'gmail:threads') {
      const { query = '' } = payload || {};
      const threads = await gmailRequest(`threads?q=${encodeURIComponent(query)}&maxResults=20`, gmailToken);
      if (!threads.threads?.length) return json({ data: [] });

      // Fetch snippet for each thread
      const settled = await Promise.allSettled(
        threads.threads.slice(0, 20).map((t: { id: string }) =>
          gmailRequest(`threads/${t.id}?format=metadata&metadataHeaders=Subject,From,Date`, gmailToken)
        )
      );
      const detailed = settled.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<unknown>).value);

      const data = detailed.map((t: { id: string; snippet: string; messages: { payload: { headers: { name: string; value: string }[] } }[] }) => {
        const headers = t.messages?.[0]?.payload?.headers || [];
        const h = (name: string) => headers.find((x: { name: string }) => x.name === name)?.value || '';
        return { id: t.id, subject: h('Subject'), from: h('From'), date: h('Date'), snippet: t.snippet };
      });

      return json({ data });
    }

    // ── SEND EMAIL ───────────────────────────────────────────────
    if (action === 'gmail:send') {
      const { to, subject, body: emailBody, reply_to_message_id } = payload;
      const profile = await gmailRequest('profile', gmailToken);
      const raw = encodeEmail(to, profile.emailAddress, subject, emailBody, reply_to_message_id);
      const result = await gmailRequest('messages/send', gmailToken, 'POST', { raw });

      await sb.from('outreach_log').insert({
        user_id: user.id,
        channel: 'email',
        direction: 'outbound',
        subject,
        body: emailBody,
        status: 'sent',
        consent_given: true,
      });

      return json({ ok: true, id: result.id });
    }

    // ── AI DRAFT ─────────────────────────────────────────────────
    if (action === 'gmail:ai_draft') {
      const { context, tone = 'professional', deal_name, contact_name } = payload;
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Draft a ${tone} email${contact_name ? ` to ${contact_name}` : ''}${deal_name ? ` regarding the ${deal_name} acquisition` : ''}.\n\nContext: ${context}\n\nWrite only the email body, no subject line, no sign-off placeholder.`,
          }],
        }),
      });

      if (!anthropicRes.ok) {
        let err: { error?: { message?: string } } = {};
        try { err = await anthropicRes.json(); } catch { /* ignore */ }
        return json({ error: err.error?.message || `AI error ${anthropicRes.status}` }, 500);
      }
      const aiData = await anthropicRes.json() as { content?: { text?: string }[] };
      const draft = aiData.content?.[0]?.text || '';
      return json({ draft });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
