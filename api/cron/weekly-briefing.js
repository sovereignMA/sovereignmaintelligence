export const config = { runtime: 'edge' };
export default async function handler(req) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  const sbHeaders = {
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  const base = process.env.SUPABASE_URL;

  try {
    // Fetch active deals summary
    const dealsRes = await fetch(
      `${base}/rest/v1/deals?select=company_name,stage,score,deal_value_gbp&stage=not.in.(completed,dead)&order=score.desc&limit=10`,
      { headers: sbHeaders }
    );
    const deals = dealsRes.ok ? await dealsRes.json() : [];

    if (!process.env.ANTHROPIC_API_KEY || !process.env.TWILIO_ACCOUNT_SID) {
      return Response.json({ ok: false, error: 'Missing ANTHROPIC_API_KEY or Twilio credentials in Vercel env' }, { status: 500 });
    }

    // Generate briefing with Claude
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Weekly M&A pipeline briefing. Active deals: ${JSON.stringify(deals)}. Write a concise 3-sentence SMS-friendly summary: top deal, overall pipeline health, recommended focus for the week.`,
        }],
      }),
    });
    if (!aiRes.ok) return Response.json({ ok: false, error: `AI error ${aiRes.status}` }, { status: 500 });
    const aiData = await aiRes.json();
    const briefing = aiData.content?.[0]?.text || 'Weekly briefing unavailable.';

    // Send via Twilio SMS
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: process.env.HOWARD_PHONE, From: process.env.TWILIO_FROM_NUMBER, Body: `[Sovereign Weekly] ${briefing}` }).toString(),
    });

    return Response.json({ ok: smsRes.ok, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
