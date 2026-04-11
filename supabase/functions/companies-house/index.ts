// companies-house — queries UK Companies House API to surface acquisition targets
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SIC codes associated with SaaS / software / tech businesses
const SAAS_SIC_CODES = new Set(['62012', '62020', '62090', '63110', '63120', '58290']);

// SIC code groups for sector filtering (broader tech set)
const TECH_SIC_CODES = new Set([
  '62012', '62020', '62090', '63110', '63120', '58290',
  '61100', '61200', '61300', '61900', '62010', '62030',
  '63910', '63990', '74100', '74200', '74900',
]);

interface CompaniesHouseCompany {
  company_number: string;
  title?: string;          // search endpoint field name
  company_name?: string;   // profile endpoint field name
  type?: string;           // profile endpoint field name
  company_type?: string;   // search endpoint field name
  company_status?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  address_snippet?: string;
  registered_office_address?: {
    country?: string;
    locality?: string;
    postal_code?: string;
    address_line_1?: string;
  };
  accounts?: {
    next_due?: string;
    last_accounts?: {
      made_up_to?: string;
    };
  };
}

interface EnrichedCompany {
  company_number: string;
  company_name: string;
  title: string;           // kept for backwards-compat with any existing callers
  sic_codes: string[];
  incorporation_date: string | null;
  age_years: number | null;
  status: string;
  address: string;
  score: number;
  sell_signals: string[];
}

function computeScore(company: CompaniesHouseCompany, ageYears: number | null): { score: number; sell_signals: string[] } {
  let score = 0;
  const sell_signals: string[] = [];

  // +30 pts for SaaS/tech SIC codes
  const sics = company.sic_codes ?? [];
  const hasSaasSic = sics.some(s => SAAS_SIC_CODES.has(s));
  if (hasSaasSic) {
    score += 30;
    sell_signals.push('saas_sic_codes');
  }

  // +20 pts for age between 3 and 12 years
  if (ageYears !== null && ageYears >= 3 && ageYears <= 12) {
    score += 20;
    sell_signals.push('optimal_age');
  }

  // +20 pts for active status
  const status = (company.company_status ?? '').toLowerCase();
  if (status === 'active') {
    score += 20;
    sell_signals.push('active_status');
  }

  // +10 pts if accounts have been filed
  const hasAccounts =
    !!company.accounts?.last_accounts?.made_up_to ||
    !!company.accounts?.next_due;
  if (hasAccounts) {
    score += 10;
    sell_signals.push('accounts_filed');
  }

  // +10 pts for private limited company type
  // profile endpoint uses 'type', search endpoint uses 'company_type'
  const companyType = (company.company_type ?? company.type ?? '').toLowerCase();
  if (companyType === 'ltd') {
    score += 10;
    sell_signals.push('ltd_company_type');
  }

  // +10 pts for England/Wales registered address
  const country = (
    company.registered_office_address?.country ??
    company.address_snippet ??
    ''
  ).toLowerCase();
  if (
    country.includes('england') ||
    country.includes('wales') ||
    country.includes('united kingdom') ||
    country.includes('uk')
  ) {
    score += 10;
    sell_signals.push('england_wales_address');
  }

  return { score, sell_signals };
}

function isDissolvedOrLiquidated(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s === 'dissolved' ||
    s === 'liquidation' ||
    s === 'administration' ||
    s === 'receivership' ||
    s === 'converted-closed' ||
    s === 'voluntary-arrangement'
  );
}

function matchesSector(sics: string[], sector: string): boolean {
  if (sector === 'all') return true;
  if (sector === 'saas') return sics.some(s => SAAS_SIC_CODES.has(s));
  if (sector === 'tech') return sics.some(s => TECH_SIC_CODES.has(s));
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Check Companies House API key first — fail fast with helpful error
  const CH_API_KEY = Deno.env.get('COMPANIES_HOUSE_API_KEY');
  if (!CH_API_KEY) {
    return json({ error: 'Companies House API not configured', setup_required: true }, 503);
  }

  try {
    // Bearer auth — same pattern as ai-proxy
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authErr } = await sb.auth.getUser(auth);
    if (authErr) return json({ error: 'Auth service unavailable' }, 503);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Parse query params — also accept POST body (for window._sb.functions.invoke() callers)
    const url = new URL(req.url);
    let q = url.searchParams.get('q') ?? '';
    let sector = url.searchParams.get('sector') ?? 'all';
    let minAge = parseFloat(url.searchParams.get('min_age') ?? '3');
    let maxAge = parseFloat(url.searchParams.get('max_age') ?? '15');
    let size = Math.min(parseInt(url.searchParams.get('size') ?? '20', 10), 100);

    if (!q.trim() && req.method === 'POST') {
      try {
        const body = await req.json();
        if (!q && body.q) q = body.q;
        if (!q && Array.isArray(body.terms) && body.terms.length > 0) q = body.terms.join(' ');
        if (body.sector) sector = body.sector;
        if (body.min_age != null) minAge = parseFloat(body.min_age);
        if (body.max_age != null) maxAge = parseFloat(body.max_age);
        if (body.limit != null) size = Math.min(parseInt(body.limit, 10), 100);
      } catch { /* malformed body — fall through to q check below */ }
    }

    if (!q.trim()) return json({ error: 'Query parameter `q` is required' }, 400);

    const credentials = btoa(`${CH_API_KEY}:`);
    const chHeaders = { Authorization: `Basic ${credentials}`, Accept: 'application/json' };

    // If query looks like a company number (6–8 alphanumeric chars, e.g. "16823981", "SC123456"),
    // use the direct profile endpoint which is more reliable than text search.
    let items: CompaniesHouseCompany[] = [];
    const isCompanyNumber = /^[A-Z0-9]{6,8}$/i.test(q.trim().replace(/\s/g, ''));

    if (isCompanyNumber) {
      const profileRes = await fetch(
        `https://api.company-information.service.gov.uk/company/${encodeURIComponent(q.trim().toUpperCase())}`,
        { headers: chHeaders },
      );
      if (profileRes.ok) {
        const profile: CompaniesHouseCompany = await profileRes.json();
        // Profile endpoint returns a single object, not an array
        if (profile.company_number) items = [profile];
      } else if (profileRes.status !== 404) {
        console.error(`[companies-house] CH profile API ${profileRes.status}`);
        return json({ error: `Companies House API error: ${profileRes.status}`, ch_status: profileRes.status }, 502);
      }
      // 404 = number doesn't exist, fall through to empty results
    } else {
      // Detect full company name queries (contain "limited", "ltd", "plc", "llp")
      // Use advanced search for name-includes matching which is more precise than the
      // general search index (which ranks by popularity, not relevance to a specific name).
      const isFullName = /\b(limited|ltd|plc|llp|lp)\b/i.test(q);

      let chUrl: string;
      if (isFullName) {
        chUrl = `https://api.company-information.service.gov.uk/advanced-search/companies?company_name_includes=${encodeURIComponent(q)}&size=${size}`;
      } else {
        chUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=${size}`;
      }

      const chRes = await fetch(chUrl, { headers: chHeaders });
      if (!chRes.ok) {
        // Advanced search returns 400 for some queries — fall back to regular search
        if (isFullName && chRes.status === 400) {
          const fallbackUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=${size}`;
          const fallbackRes = await fetch(fallbackUrl, { headers: chHeaders });
          if (!fallbackRes.ok) {
            console.error(`[companies-house] CH API fallback ${fallbackRes.status}`);
            return json({ error: `Companies House API error: ${fallbackRes.status}`, ch_status: fallbackRes.status }, 502);
          }
          const fallbackData: { items?: CompaniesHouseCompany[] } = await fallbackRes.json();
          items = fallbackData.items ?? [];
        } else {
          console.error(`[companies-house] CH API ${chRes.status}`);
          return json(
            { error: `Companies House API error: ${chRes.status}`, ch_status: chRes.status },
            chRes.status >= 500 ? 502 : chRes.status,
          );
        }
      } else {
        // Advanced search returns { items: [...] } same shape as regular search
        const chData: { items?: CompaniesHouseCompany[] } = await chRes.json();
        items = chData.items ?? [];
      }
    }

    const now = Date.now();
    const results: EnrichedCompany[] = [];

    for (const company of items) {
      // Filter out dissolved / liquidated companies
      const status = company.company_status ?? 'unknown';
      if (isDissolvedOrLiquidated(status)) continue;

      // Compute age
      let ageYears: number | null = null;
      if (company.date_of_creation) {
        const created = new Date(company.date_of_creation).getTime();
        if (!isNaN(created)) {
          ageYears = (now - created) / (1000 * 60 * 60 * 24 * 365.25);
        }
      }

      // Skip age/sector filters for direct lookups (company number or full name with "limited/ltd")
      // For keyword searches, apply the filters normally.
      const skipFilters = isCompanyNumber || /\b(limited|ltd|plc|llp|lp)\b/i.test(q);
      if (!skipFilters) {
        if (ageYears !== null && (ageYears < minAge || ageYears > maxAge)) continue;
        const sics = company.sic_codes ?? [];
        if (!matchesSector(sics, sector)) continue;
      }

      const sics = company.sic_codes ?? [];

      const { score, sell_signals } = computeScore(company, ageYears);

      // Build a readable address string
      const addr = company.registered_office_address;
      const addressParts = [
        addr?.address_line_1,
        addr?.locality,
        addr?.postal_code,
        addr?.country,
      ].filter(Boolean);
      const address = addressParts.length > 0
        ? addressParts.join(', ')
        : (company.address_snippet ?? '');

      // profile endpoint returns company_name; search endpoint returns title
      const displayName = company.title ?? company.company_name ?? '';

      results.push({
        company_number: company.company_number,
        company_name: displayName,
        title: displayName,  // backwards-compat
        sic_codes: sics,
        incorporation_date: company.date_of_creation ?? null,
        age_years: ageYears !== null ? Math.round(ageYears * 10) / 10 : null,
        status,
        address,
        score,
        sell_signals,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return json({ results, total: results.length, query: q, sector, min_age: minAge, max_age: maxAge });

  } catch (e) {
    console.error('[companies-house] unhandled error:', e);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
