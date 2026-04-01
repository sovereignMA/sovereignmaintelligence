// linkedin-campaigns — LinkedIn Ads API proxy for Campaign Manager
// Actions: accounts | campaigns | analytics | leads
// Requires LINKEDIN_ACCESS_TOKEN Supabase secret
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const LI_BASE = 'https://api.linkedin.com/v2';
const LI_HEADERS = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'LinkedIn-Version': '202304',
  'X-Restli-Protocol-Version': '2.0.0',
  'Content-Type': 'application/json',
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function liGet(token: string, path: string): Promise<Response> {
  const res = await fetch(`${LI_BASE}${path}`, { headers: LI_HEADERS(token) });
  const body = await res.json();
  if (!res.ok) {
    console.error(`[linkedin-campaigns] ${res.status} ${path}:`, JSON.stringify(body));
    return json({ error: body?.message || `LinkedIn API error ${res.status}`, status: res.status }, res.status);
  }
  return json(body);
}

// Convert date to LinkedIn dateRange format
function dateParam(d: Date) {
  return `year=${d.getFullYear()}&month=${d.getMonth() + 1}&day=${d.getDate()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const liToken = Deno.env.get('LINKEDIN_ACCESS_TOKEN');
    if (!liToken) return json({ error: 'LINKEDIN_ACCESS_TOKEN not configured' }, 503);

    let body: { action?: string; account_id?: string; campaign_id?: string; days?: number };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { action, account_id, campaign_id, days = 30 } = body;

    switch (action) {

      // ── List ad accounts ───────────────────────────────────────────────────
      case 'accounts': {
        return await liGet(liToken, '/adAccounts?q=search&search.type.values[0]=BUSINESS&search.status.values[0]=ACTIVE&count=50');
      }

      // ── List campaigns for an account ──────────────────────────────────────
      case 'campaigns': {
        if (!account_id) return json({ error: 'account_id required' }, 400);
        const urn = encodeURIComponent(`urn:li:sponsoredAccount:${account_id}`);
        return await liGet(liToken, `/adCampaigns?q=search&search.account.values[0]=${urn}&count=50`);
      }

      // ── Campaign analytics ─────────────────────────────────────────────────
      case 'analytics': {
        if (!account_id) return json({ error: 'account_id required' }, 400);
        const end = new Date();
        const start = new Date(Date.now() - days * 86400000);
        const startParam = `dateRange.start.year=${start.getFullYear()}&dateRange.start.month=${start.getMonth()+1}&dateRange.start.day=${start.getDate()}`;
        const endParam   = `dateRange.end.year=${end.getFullYear()}&dateRange.end.month=${end.getMonth()+1}&dateRange.end.day=${end.getDate()}`;
        const accountUrn = encodeURIComponent(`urn:li:sponsoredAccount:${account_id}`);
        const fields = 'impressions,clicks,costInLocalCurrency,leadGenerationMailContactInfoShares,oneClickLeads,viralImpressions,videoViews,approximateUniqueImpressions';
        let path = `/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&${startParam}&${endParam}&fields=${fields}&accounts[0]=${accountUrn}`;
        if (campaign_id) {
          const campUrn = encodeURIComponent(`urn:li:sponsoredCampaign:${campaign_id}`);
          path += `&campaigns[0]=${campUrn}`;
        }
        return await liGet(liToken, path);
      }

      // ── Lead gen form responses ────────────────────────────────────────────
      case 'leads': {
        if (!account_id) return json({ error: 'account_id required' }, 400);
        const accountUrn = encodeURIComponent(`urn:li:sponsoredAccount:${account_id}`);
        // Fetch lead gen forms for this account
        const formsRes = await fetch(`${LI_BASE}/leadGenerationForms?q=owner&owner=${accountUrn}&count=20`, {
          headers: LI_HEADERS(liToken),
        });
        if (!formsRes.ok) return json({ error: 'Could not fetch lead gen forms', status: formsRes.status }, formsRes.status);
        const forms = await formsRes.json() as { elements?: Array<{ id: string; name: string }> };
        if (!forms.elements?.length) return json({ elements: [], message: 'No lead gen forms found' });

        // Fetch responses for each form in parallel (cap at 5 forms)
        const responseSets = await Promise.allSettled(
          (forms.elements ?? []).slice(0, 5).map(async (form) => {
            const r = await fetch(`${LI_BASE}/leadGenerationFormResponses?q=owner&owner=${encodeURIComponent(`urn:li:leadGenerationForm:${form.id}`)}&count=50`, {
              headers: LI_HEADERS(liToken),
            });
            if (!r.ok) return [];
            const d = await r.json() as { elements?: unknown[] };
            return (d.elements ?? []).map((e: unknown) => ({ ...e as object, _form_id: form.id, _form_name: form.name }));
          })
        );

        const leads = responseSets.flatMap(r => r.status === 'fulfilled' ? r.value : []);
        return json({ elements: leads, total: leads.length });
      }

      // ── Campaign-level summary (accounts + analytics combined) ─────────────
      case 'summary': {
        if (!account_id) return json({ error: 'account_id required' }, 400);
        const end = new Date();
        const start = new Date(Date.now() - days * 86400000);
        const startParam = `dateRange.start.year=${start.getFullYear()}&dateRange.start.month=${start.getMonth()+1}&dateRange.start.day=${start.getDate()}`;
        const endParam   = `dateRange.end.year=${end.getFullYear()}&dateRange.end.month=${end.getMonth()+1}&dateRange.end.day=${end.getDate()}`;
        const accountUrn = encodeURIComponent(`urn:li:sponsoredAccount:${account_id}`);

        const [campaignsRes, analyticsRes] = await Promise.allSettled([
          fetch(`${LI_BASE}/adCampaigns?q=search&search.account.values[0]=${accountUrn}&count=50`, { headers: LI_HEADERS(liToken) }),
          fetch(`${LI_BASE}/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=ALL&${startParam}&${endParam}&fields=impressions,clicks,costInLocalCurrency,leadGenerationMailContactInfoShares,oneClickLeads&accounts[0]=${accountUrn}`, { headers: LI_HEADERS(liToken) }),
        ]);

        const campaigns = campaignsRes.status === 'fulfilled' && campaignsRes.value.ok
          ? (await campaignsRes.value.json() as { elements?: unknown[] }).elements ?? []
          : [];
        const analytics = analyticsRes.status === 'fulfilled' && analyticsRes.value.ok
          ? (await analyticsRes.value.json() as { elements?: unknown[] }).elements ?? []
          : [];

        return json({ campaigns, analytics });
      }

      default:
        return json({ error: `Unknown action: ${action}. Use accounts|campaigns|analytics|leads|summary` }, 400);
    }

  } catch (e) {
    console.error('[linkedin-campaigns] unhandled:', e);
    return json({ error: 'Internal server error' }, 500);
  }
});
