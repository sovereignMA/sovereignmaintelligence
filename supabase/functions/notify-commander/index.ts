// notify-commander — intelligent notification orchestrator
// Routes notifications to the right channel based on urgency and type
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function twilioRequest(endpoint: string, params: Record<string, string>) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Twilio error ${res.status}`);
  return data;
}

// Priority → channel mapping
function selectChannel(priority: string): string {
  if (priority === 'critical') return 'call';
  if (priority === 'high')     return 'sms';
  if (priority === 'medium')   return 'whatsapp';
  return 'inapp';
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

    // ── SMART DISPATCH ────────────────────────────────────────────
    // Picks the channel automatically based on priority
    if (action === 'commander:dispatch') {
      const title    = String(payload?.title || 'Sovereign Alert');
      const message  = String(payload?.message || '');
      const priority = String(payload?.priority || 'normal'); // critical|high|medium|normal
      const agent    = String(payload?.agent_name || 'commander');
      const deal_id  = payload?.deal_id ? String(payload.deal_id) : null;

      if (!message) return json({ error: 'message required' }, 400);

      const channel = String(payload?.channel || selectChannel(priority));
      let deliveryResult: Record<string, unknown> = { channel };

      try {
        if (channel === 'call' && howardPhone && fromNumber) {
          const twiml = `<Response><Say voice="Polly.Amy">${title}. ${message}</Say></Response>`;
          const result = await twilioRequest('Calls.json', { To: howardPhone, From: fromNumber, Twiml: twiml });
          deliveryResult = { channel, sid: result.sid, status: result.status };
        } else if (channel === 'sms' && howardPhone && fromNumber) {
          const body = `[${agent}] ${title}: ${message}`;
          const result = await twilioRequest('Messages.json', { To: howardPhone, From: fromNumber, Body: body.slice(0, 1600) });
          deliveryResult = { channel, sid: result.sid };
        } else if (channel === 'whatsapp' && howardPhone && fromNumber) {
          const body = `*[${agent}]* ${title}\n${message}`;
          const result = await twilioRequest('Messages.json', {
            To: `whatsapp:${howardPhone}`,
            From: `whatsapp:${fromNumber}`,
            Body: body.slice(0, 1600),
          });
          deliveryResult = { channel, sid: result.sid };
        } else {
          // in-app fallback (also used for 'normal' priority)
          deliveryResult = { channel: 'inapp' };
        }
      } catch (e) {
        // Downgrade to in-app on Twilio error
        deliveryResult = { channel: 'inapp', twilio_error: e instanceof Error ? e.message : String(e) };
      }

      // Always log to audit trail + phone_calls for Twilio channels
      const logPromises: Promise<unknown>[] = [
        sb.from('audit_trail').insert({
          user_id: user.id,
          event: 'notification_dispatched',
          agent: agent,
          details: `[${priority}] ${title}: ${message.slice(0, 200)}`,
          status: 'ok',
        }),
      ];

      if (['call', 'sms', 'whatsapp'].includes(deliveryResult.channel as string) && deliveryResult.sid) {
        logPromises.push(
          sb.from('phone_calls').insert({
            user_id: user.id,
            agent_name: agent,
            call_type: deliveryResult.channel,
            to_number: howardPhone,
            purpose: title,
            body: message,
            twilio_sid: String(deliveryResult.sid),
            status: 'sent',
          })
        );
      }

      await Promise.allSettled(logPromises);
      return json({ ok: true, ...deliveryResult, priority, deal_id });
    }

    // ── DEAL ALERT ────────────────────────────────────────────────
    // Sends a deal-specific alert with rich context
    if (action === 'commander:deal_alert') {
      const deal_id  = payload?.deal_id ? String(payload.deal_id) : null;
      const alertType = String(payload?.alert_type || 'update'); // update|opportunity|risk|stall
      const message  = String(payload?.message || '');
      const agent    = String(payload?.agent_name || 'S10');

      if (!deal_id || !message) return json({ error: 'deal_id and message required' }, 400);

      // Verify deal belongs to user
      const { data: deal } = await sb.from('deals')
        .select('company_name, stage, score')
        .eq('id', deal_id).eq('user_id', user.id).single();
      if (!deal) return json({ error: 'Deal not found' }, 404);

      // Priority based on alert type
      const priorityMap: Record<string, string> = { risk: 'high', opportunity: 'high', stall: 'medium', update: 'normal' };
      const priority = priorityMap[alertType] || 'normal';
      const channel = selectChannel(priority);

      const fullMessage = `${deal.company_name} [${deal.stage}] — ${message}`;

      try {
        if ((channel === 'sms' || channel === 'call') && howardPhone && fromNumber) {
          const body = `[${agent}] ${fullMessage}`.slice(0, 1600);
          if (channel === 'call') {
            const twiml = `<Response><Say voice="Polly.Amy">${fullMessage}</Say></Response>`;
            await twilioRequest('Calls.json', { To: howardPhone, From: fromNumber, Twiml: twiml });
          } else {
            await twilioRequest('Messages.json', { To: howardPhone, From: fromNumber, Body: body });
          }
        }
      } catch (_) { /* downgrade gracefully */ }

      await sb.from('audit_trail').insert({
        user_id: user.id,
        event: `deal_alert_${alertType}`,
        agent,
        details: fullMessage.slice(0, 300),
        status: alertType === 'risk' ? 'warn' : 'ok',
      });

      return json({ ok: true, deal: deal.company_name, alert_type: alertType, channel, priority });
    }

    // ── NOTIFICATION HISTORY ──────────────────────────────────────
    if (action === 'commander:history') {
      const limit = Math.min(Number((payload || {}).limit) || 50, 100);
      const { data, error } = await sb.from('audit_trail')
        .select('event, agent, details, status, created_at')
        .eq('user_id', user.id)
        .in('event', ['notification_dispatched', 'deal_alert_update', 'deal_alert_risk', 'deal_alert_opportunity', 'deal_alert_stall'])
        .order('created_at', { ascending: false })
        .limit(limit);
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
