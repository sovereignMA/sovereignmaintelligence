// email-inbound — ImprovMX webhook receiver + spam scoring + auto deal linking
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPAM_KEYWORDS = ['viagra','casino','lottery','prize','winner','nigerian','bitcoin doubler','earn money fast','act now','limited time','click here','unsubscribe','buy now','free money'];
const PROMO_PATTERNS = /deal|discount|offer|sale|%\s*off|coupon|promo|special|limited.time|act.now|subscribe|webinar/i;
const NEWSLETTER_PATTERNS = /noreply|no-reply|newsletter|digest|updates@|marketing@|info@|news@|bulletin/i;

function computeSpamScore(from: string, subject: string, bodyText: string, headers: Record<string, string>): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  const combined = (subject + ' ' + bodyText).toLowerCase();
  for (const kw of SPAM_KEYWORDS) {
    if (combined.includes(kw)) { score += 2; flags.push('spam_keyword:' + kw); }
  }
  const linkCount = (bodyText.match(/https?:\/\//g) || []).length;
  if (linkCount > 10) { score += 2; flags.push('excessive_links:' + linkCount); }
  if (linkCount > 25) { score += 3; flags.push('very_excessive_links'); }
  if (subject === subject.toUpperCase() && subject.length > 10) { score += 1; flags.push('all_caps_subject'); }
  if (headers['x-spf'] && headers['x-spf'] !== 'pass') { score += 2; flags.push('spf_fail'); }
  if (headers['x-dkim'] && headers['x-dkim'] !== 'pass') { score += 2; flags.push('dkim_fail'); }
  return { score, flags };
}

function categorize(from: string, subject: string, spamScore: number): string {
  if (spamScore > 5) return 'junk';
  if (NEWSLETTER_PATTERNS.test(from)) return 'updates';
  if (PROMO_PATTERNS.test(subject)) return 'promotions';
  return 'primary';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let payload: Record<string, unknown>;
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      payload = await req.json();
    } else if (ct.includes('form')) {
      const fd = await req.formData();
      payload = Object.fromEntries(fd.entries());
    } else {
      payload = await req.json().catch(() => ({}));
    }

    // Parse RFC 822 "Name <email@domain>" format
    function parseRfc822(raw: string): { name: string; email: string } {
      const m = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
      if (m) return { name: m[1].trim().replace(/^["']|["']$/g, ''), email: m[2].trim().toLowerCase() };
      const e = raw.trim().toLowerCase();
      return { name: e.split('@')[0] || '', email: e };
    }

    // ImprovMX sends: mailfrom, rcptto, from (RFC822), to (RFC822), messageId
    const rawFrom = String(payload.from || payload.mailfrom || payload.sender || payload.envelope_from || '');
    const { name: fromName, email: fromAddr } = parseRfc822(rawFrom);

    // Skip empty test pings (ImprovMX sends these on webhook registration)
    if (!fromAddr || fromAddr === '(no subject)') {
      return json({ ok: true, skipped: 'empty payload' });
    }

    const toRaw = String(payload.to || payload.rcptto || payload.recipient || '');
    const toAddresses = toRaw.split(',').map((s: string) => {
      const { email } = parseRfc822(s.trim());
      return email;
    }).filter(Boolean);
    const cc = payload.cc ? String(payload.cc).split(',').map((s: string) => parseRfc822(s.trim()).email) : [];
    const subject = String(payload.subject || '(no subject)');
    const bodyHtml = String(payload.html || payload.body_html || '');
    const bodyText = String(payload.text || payload.body_text || payload.stripped_text || '');
    const messageId = String(payload.message_id || payload.messageId || payload['Message-Id'] || '');
    const inReplyTo = String(payload.in_reply_to || payload.inReplyTo || payload['In-Reply-To'] || '');
    const refsRaw = String(payload.references || payload['References'] || '');
    const refs = refsRaw ? refsRaw.split(/\s+/).filter(Boolean) : [];
    // Derive alias from rcptto or to field
    const recipientRaw = String(payload.rcptto || payload.to || payload.recipient || '');
    const recipientEmail = parseRfc822(recipientRaw.split(',')[0].trim()).email;
    const alias = recipientEmail.split('@')[0] || '';
    const domain = recipientEmail.split('@')[1] || 'sovereigncmd.xyz';
    const headers = (payload.headers || {}) as Record<string, string>;

    const { data: aliasRow } = await sb.from('email_aliases')
      .select('user_id').eq('alias', alias).eq('domain', domain).eq('is_active', true).single();

    let userId: string;
    if (aliasRow) {
      userId = aliasRow.user_id;
    } else {
      const { data: admin } = await sb.from('admin_users').select('user_id').limit(1).single();
      if (!admin) return json({ error: 'No user found for alias' }, 404);
      userId = admin.user_id;
    }

    const { score: spamScore, flags: spamFlags } = computeSpamScore(fromAddr, subject, bodyText, headers);
    const category = categorize(fromAddr, subject, spamScore);
    const folder = spamScore > 8 ? 'spam' : 'inbox';
    const snippet = bodyText.slice(0, 200).replace(/\s+/g, ' ').trim();
    const threadId = inReplyTo || messageId || undefined;

    let dealId: string | null = null;
    const senderDomain = fromAddr.split('@')[1]?.toLowerCase();
    if (senderDomain) {
      const { data: contact } = await sb.from('contacts')
        .select('deal_id').eq('user_id', userId).ilike('email', `%${senderDomain}%`).limit(1).single();
      if (contact?.deal_id) {
        dealId = contact.deal_id;
      } else {
        const domainName = senderDomain.split('.')[0];
        const { data: deal } = await sb.from('deals')
          .select('id').eq('user_id', userId).ilike('company_name', `%${domainName}%`).limit(1).single();
        if (deal) dealId = deal.id;
      }
    }

    const { data: rules } = await sb.from('email_rules')
      .select('*').eq('user_id', userId).eq('is_active', true).order('priority', { ascending: false });

    let finalFolder = folder;
    let finalCategory = category;
    let finalLabels: string[] = [];
    let isStarred = false;

    if (rules) {
      for (const rule of rules) {
        let fieldValue = '';
        if (rule.match_field === 'from') fieldValue = fromAddr + ' ' + fromName;
        else if (rule.match_field === 'to') fieldValue = toAddresses.join(' ');
        else if (rule.match_field === 'subject') fieldValue = subject;
        else if (rule.match_field === 'body') fieldValue = bodyText;
        try {
          if (new RegExp(rule.match_pattern, 'i').test(fieldValue)) {
            if (rule.action === 'move' && rule.destination_folder) finalFolder = rule.destination_folder;
            if (rule.action === 'category' && rule.destination_category) finalCategory = rule.destination_category;
            if (rule.action === 'label' && rule.label) finalLabels.push(rule.label);
            if (rule.action === 'star') isStarred = true;
            if (rule.action === 'archive') finalFolder = 'archive';
            if (rule.action === 'delete') finalFolder = 'trash';
          }
        } catch { /* invalid regex, skip */ }
      }
    }

    const { data: email, error } = await sb.from('emails').insert({
      user_id: userId, alias, message_id: messageId,
      from_address: fromAddr, from_name: fromName,
      to_addresses: toAddresses, cc, subject,
      body_html: bodyHtml, body_text: bodyText, snippet,
      folder: finalFolder, category: finalCategory,
      labels: finalLabels, is_starred: isStarred,
      thread_id: threadId, in_reply_to: inReplyTo || null,
      references: refs, spam_score: spamScore, spam_flags: spamFlags,
      deal_id: dealId, source: 'improvmx',
      received_at: new Date().toISOString(),
    }).select().single();

    if (error) {
      console.error('Insert error:', error);
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, id: email.id, folder: finalFolder, category: finalCategory, deal_id: dealId });
  } catch (e) {
    console.error('Inbound error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
