// notifier — Twilio calls, SMS, WhatsApp to Howard + contacts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function twilioRequest(endpoint: string, params: Record<string, string>) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Twilio error ${res.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

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
    const fromNumber  = Deno.env.get('TWILIO_FROM_NUMBER')!;
    const howardPhone = Deno.env.get('HOWARD_PHONE')!;

    const logCall = (type: string, to: string, body: string, sid: string, status: string) =>
      sb.from('phone_calls').insert({ user_id: user.id, agent_name: payload?.agent_name || 'notifier', call_type: type, to_number: to, purpose: payload?.purpose, body, twilio_sid: sid, status });

    // ── CALL HOWARD ──────────────────────────────────────────────
    if (action === 'call:howard') {
      const agent_name = String(payload?.agent_name || '');
      const purpose    = String(payload?.purpose    || '');
      const message    = String(payload?.message    || '');
      const twiml = `<Response><Say voice="Polly.Amy">${message || `${agent_name} alert: ${purpose}`}</Say></Response>`;
      const result = await twilioRequest('Calls.json', { To: howardPhone, From: fromNumber, Twiml: twiml });
      await logCall('call', howardPhone, message, result.sid, result.status);
      return json({ ok: true, sid: result.sid, status: result.status });
    }

    // ── SMS HOWARD ───────────────────────────────────────────────
    if (action === 'sms:howard') {
      const agent_name = String(payload?.agent_name || '');
      const message    = String(payload?.message    || '');
      const body = `[${agent_name}] ${message}`;
      const result = await twilioRequest('Messages.json', { To: howardPhone, From: fromNumber, Body: body });
      await logCall('sms', howardPhone, body, result.sid, result.status);
      return json({ ok: true, sid: result.sid });
    }

    // ── WHATSAPP HOWARD ──────────────────────────────────────────
    if (action === 'whatsapp:howard') {
      const agent_name = String(payload?.agent_name || '');
      const message    = String(payload?.message    || '');
      const body = `[${agent_name}] ${message}`;
      const whatsappFrom = `whatsapp:${fromNumber}`;
      const whatsappTo   = `whatsapp:${howardPhone}`;
      const result = await twilioRequest('Messages.json', { To: whatsappTo, From: whatsappFrom, Body: body });
      await logCall('whatsapp', howardPhone, body, result.sid, result.status);
      return json({ ok: true, sid: result.sid });
    }

    // ── SMS CONTACT ──────────────────────────────────────────────
    if (action === 'sms:contact') {
      const to         = String(payload?.to         || '');
      const message    = String(payload?.message    || '');
      const contact_id = String(payload?.contact_id || '');
      const deal_id    = String(payload?.deal_id    || '');
      const result = await twilioRequest('Messages.json', { To: to, From: fromNumber, Body: message });
      await Promise.allSettled([
        logCall('sms', to, message, result.sid, result.status),
        sb.from('outreach_log').insert({ user_id: user.id, contact_id, deal_id, channel: 'sms', direction: 'outbound', body: message, status: result.status, consent_given: true }),
      ]);
      return json({ ok: true, sid: result.sid });
    }

    // ── IN-APP NOTIFICATION ──────────────────────────────────────
    if (action === 'notify:inapp') {
      const { title, body, priority } = payload;
      await sb.from('audit_trail').insert({ user_id: user.id, event: 'notification', agent: 'notifier', details: `${title}: ${body}`, status: priority === 'critical' ? 'warn' : 'ok' });
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
