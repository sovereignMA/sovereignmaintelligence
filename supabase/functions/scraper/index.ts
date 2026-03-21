// Supabase Edge Function: scraper
// Unified intelligence scraper powered by Tavily Search API
// Replaces: Companies House API + News API + web scraper
// Deno runtime — deploy via: supabase functions deploy scraper

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TAVILY_API_KEY   = Deno.env.get('TAVILY_API_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Tavily search helper ──────────────────────────────────────────────────────
async function tavilySearch(query: string, opts: Record<string, unknown> = {}): Promise<unknown[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key:        TAVILY_API_KEY,
      query,
      search_depth:   opts.depth ?? 'basic',
      include_answer: opts.answer ?? false,
      max_results:    opts.max ?? 5,
      include_domains: opts.domains ?? [],
      exclude_domains: opts.exclude ?? [],
      ...opts
    })
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { results?: unknown[] };
  return json.results ?? [];
}

// ── Jina Reader — free URL-to-markdown, no key needed ────────────────────────
async function jinaRead(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' }
    });
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, 8000); // cap at 8KB to stay within Claude context
  } catch {
    return '';
  }
}

// ── Claude Haiku — structured JSON extraction ─────────────────────────────────
async function extractWithClaude(rawData: string, companyName: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract structured company intelligence from this raw data about "${companyName}".
Return ONLY valid JSON (no markdown) with this exact shape:
{
  "company_name": string,
  "website": string | null,
  "linkedin_url": string | null,
  "twitter_url": string | null,
  "description": string | null,
  "industry": string | null,
  "employee_count": string | null,
  "founded_year": number | null,
  "headquarters": string | null,
  "revenue_estimate": string | null,
  "ebitda_estimate": string | null,
  "arr_estimate": string | null,
  "funding_total": string | null,
  "last_funding_round": string | null,
  "trustpilot_score": number | null,
  "glassdoor_score": number | null,
  "github_stars": number | null,
  "news_sentiment": "positive" | "neutral" | "negative" | null,
  "key_news": string[],
  "social_followers": { "twitter": number | null, "linkedin": number | null },
  "acquisition_score": number,
  "acquisition_rationale": string,
  "risk_flags": string[],
  "opportunity_flags": string[]
}

acquisition_score is 0–100 (100 = ideal NMD UK SaaS roll-up target).

RAW DATA:
${rawData.slice(0, 12000)}`
      }]
    })
  });
  if (!res.ok) return {};
  const json = await res.json() as { content?: { text?: string }[] };
  const text = json.content?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    // attempt to extract JSON block from text
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

// ── Full scrape pipeline ──────────────────────────────────────────────────────
async function scrapeCompany(companyName: string, websiteUrl?: string): Promise<Record<string, unknown>> {
  const queries = [
    { label: 'ch',          q: `"${companyName}" site:find.companieshouse.gov.uk OR site:beta.companieshouse.gov.uk`, opts: { max: 3 } },
    { label: 'linkedin',    q: `"${companyName}" site:linkedin.com/company`,  opts: { max: 3 } },
    { label: 'twitter',     q: `"${companyName}" site:twitter.com OR site:x.com`, opts: { max: 3 } },
    { label: 'news',        q: `"${companyName}" news funding acquisition revenue`, opts: { max: 5, depth: 'basic' } },
    { label: 'trustpilot',  q: `"${companyName}" site:trustpilot.com`, opts: { max: 3 } },
    { label: 'glassdoor',   q: `"${companyName}" site:glassdoor.co.uk OR site:glassdoor.com`, opts: { max: 3 } },
    { label: 'crunchbase',  q: `"${companyName}" site:crunchbase.com`, opts: { max: 3 } },
    { label: 'github',      q: `"${companyName}" site:github.com`, opts: { max: 3 } },
  ];

  // Run all Tavily searches in parallel
  const results = await Promise.allSettled(
    queries.map(({ q, opts }) => tavilySearch(q, opts))
  );

  // Gather raw text
  const rawChunks: string[] = [];
  queries.forEach(({ label }, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const items = r.value as { title?: string; url?: string; content?: string }[];
      items.forEach(item => {
        rawChunks.push(`[${label}] ${item.title ?? ''}\n${item.url ?? ''}\n${item.content ?? ''}`);
      });
    }
  });

  // Optional: read company website via Jina
  if (websiteUrl) {
    const webContent = await jinaRead(websiteUrl);
    if (webContent) rawChunks.push(`[website] ${webContent}`);
  }

  const rawData = rawChunks.join('\n\n---\n\n');

  // Extract structured intelligence with Claude (non-fatal — falls back to empty object)
  let intel: Record<string, unknown> = {};
  try { intel = await extractWithClaude(rawData, companyName); } catch { /* ignore */ }

  return { ...intel, _raw_sources: queries.map(q => q.label), _scraped_at: new Date().toISOString() };
}

// ── Upsert to Supabase ────────────────────────────────────────────────────────
async function upsertIntel(dealId: string, intel: Record<string, unknown>, userId?: string) {
  const { error } = await sb.from('company_intel').upsert({
    deal_id:    dealId,
    data:       intel,
    updated_at: new Date().toISOString()
  }, { onConflict: 'deal_id' });

  if (error) throw new Error(`DB upsert error: ${error.message}`);

  // Audit trail
  await sb.from('audit_trail').insert({
    entity_type: 'company_intel',
    entity_id:   dealId,
    action:      'scrape:full',
    actor_id:    userId ?? null,
    metadata:    { sources: intel._raw_sources, scraped_at: intel._scraped_at }
  });
}

// ── Process scrape queue ──────────────────────────────────────────────────────
async function processQueue() {
  const { data: queue, error } = await sb
    .from('scrape_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) throw new Error(`Queue fetch error: ${error.message}`);
  if (!queue || queue.length === 0) return { processed: 0 };

  let processed = 0;
  for (const job of queue) {
    try {
      await sb.from('scrape_queue').update({ status: 'processing' }).eq('id', job.id);
      const intel = await scrapeCompany(job.company_name, job.website_url);
      await upsertIntel(job.deal_id, intel, job.requested_by);
      await sb.from('scrape_queue').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', job.id);
      processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await sb.from('scrape_queue').update({ status: 'error', error_message: msg }).eq('id', job.id);
    }
  }
  return { processed };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
  }

  try {
    const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Content-Type': 'application/json' };
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS_HEADERS });

    const body = await req.json() as {
      action: string;
      deal_id?: string;
      company_name?: string;
      website_url?: string;
    };
    const { action, deal_id, company_name, website_url } = body;

    if (!action) return new Response(JSON.stringify({ error: 'action required' }), { status: 400 });

    switch (action) {
      case 'scrape:full': {
        if (!deal_id || !company_name) {
          return new Response(JSON.stringify({ error: 'deal_id and company_name required' }), { status: 400 });
        }
        const intel = await scrapeCompany(company_name, website_url);
        await upsertIntel(deal_id, intel);
        return new Response(JSON.stringify({ ok: true, intel }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'scrape:queue':
        return new Response(JSON.stringify(await processQueue()), { headers: { 'Content-Type': 'application/json' } });

      case 'scrape:companies_house': {
        if (!company_name) return new Response(JSON.stringify({ error: 'company_name required' }), { status: 400 });
        const results = await tavilySearch(`"${company_name}" site:find.companieshouse.gov.uk OR site:beta.companieshouse.gov.uk`, { max: 5 });
        return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'scrape:web': {
        if (!website_url) return new Response(JSON.stringify({ error: 'website_url required' }), { status: 400 });
        const content = await jinaRead(website_url);
        return new Response(JSON.stringify({ ok: true, content }), { headers: { 'Content-Type': 'application/json' } });
      }

      case 'scrape:news': {
        if (!company_name) return new Response(JSON.stringify({ error: 'company_name required' }), { status: 400 });
        const results = await tavilySearch(`"${company_name}" news funding acquisition`, { max: 8, depth: 'basic' });
        return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type': 'application/json' } });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('scraper error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
