// sovereign-api — core data CRUD for deals, contacts, docs, audit, profile
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || '*';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MISSING_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  .filter(k => !Deno.env.get(k));
if (MISSING_VARS.length) console.error('[sovereign-api] Missing env vars:', MISSING_VARS.join(', '));

// Gateway already verified signature (verify_jwt: true), safe to decode payload directly
function decodeJwt(jwt: string): { sub: string; email?: string; user_metadata?: Record<string, unknown>; role?: string } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    // Normalise base64url → base64, then add padding so atob never throws on odd-length payloads
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    if (!payload.sub || payload.role !== 'authenticated') return null;
    return payload;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (MISSING_VARS.length) return json({ error: `Server misconfiguration — missing: ${MISSING_VARS.join(', ')}` }, 500);

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Unauthorized' }, 401);

    const jwtPayload = decodeJwt(auth);
    if (!jwtPayload) return json({ error: 'Unauthorized' }, 401);
    const userId = jwtPayload.sub;

    let body: { action?: string; payload?: Record<string, unknown>; deal_id?: string; contact_id?: string };
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }
    const { action, payload, deal_id, contact_id } = body;

    // ── INPUT VALIDATION ────────────────────────────────────────
    const VALID_ACTIONS = new Set(['deals:list','deals:create','deals:update','deals:delete','contacts:list','contacts:create','contacts:update','outreach:log','outreach:list','docs:list','docs:save','conv:save','conv:list','conv:load','audit:log','profile:get','profile:update','intel:get','intel:list','scrape:queue:add','milestones:list','milestones:update','milestones:init','milestones:templates','referral:get','referral:track','billing:status']);
    if (!action || !VALID_ACTIONS.has(action)) return json({ error: `Unknown action: ${action}` }, 400);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (deal_id && !UUID_RE.test(deal_id)) return json({ error: 'Invalid deal_id' }, 400);
    if (contact_id && !UUID_RE.test(contact_id)) return json({ error: 'Invalid contact_id' }, 400);

    // ── SUBSCRIPTION GATE ────────────────────────────────────────
    // Mutation actions are blocked for users whose trial has expired or subscription
    // is not active. Read-only and account-management actions are always permitted.
    const MUTATION_ACTIONS = new Set([
      'deals:create','deals:update','deals:delete',
      'contacts:create','contacts:update',
      'outreach:log','docs:save','conv:save',
      'scrape:queue:add','milestones:update','milestones:init',
      'profile:update','intel:get',
    ]);
    if (MUTATION_ACTIONS.has(action)) {
      const { data: sub } = await sb.from('user_profiles')
        .select('subscription_status, trial_ends_at')
        .eq('id', userId).single();
      const status = sub?.subscription_status;
      const trialEnd = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
      const isActive = status === 'active' || status === 'past_due';
      const isTrialing = (status === 'trialing' || status === null) && trialEnd && trialEnd > new Date();
      if (!isActive && !isTrialing) {
        return json({ error: 'subscription_required', message: 'Your trial has expired. Please upgrade to continue.' }, 402);
      }
    }

    // ── DEALS ──────────────────────────────────────────────────
    if (action === 'deals:list') {
      const { data, error } = await sb.from('deals').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200);
      if (error) { console.error('[sovereign-api] deals:list', error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'deals:create') {
      const { data, error } = await sb.from('deals').insert({ ...payload, user_id: userId }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'deals:update') {
      const DEAL_COLS = ['company_name','stage','ebitda_gbp','arr_gbp','arr_pct','revenue_gbp','asking_price_gbp','deal_value_gbp','nmd_structure','ai_score','notes','next_action','next_action_date','website','sector','sic_code','employee_count','founded_year','contact_email','contact_name','companies_house_number','source'];
      const updates: Record<string, unknown> = {};
      for (const k of DEAL_COLS) { if (payload?.[k] !== undefined) updates[k] = payload[k]; }
      if (!Object.keys(updates).length) return json({ error: 'No valid fields to update' }, 400);
      const { data, error } = await sb.from('deals').update(updates).eq('id', deal_id).eq('user_id', userId).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'deals:delete') {
      const { error } = await sb.from('deals').delete().eq('id', deal_id).eq('user_id', userId);
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ ok: true });
    }

    // ── CONTACTS ────────────────────────────────────────────────
    if (action === 'contacts:list') {
      let q = sb.from('contacts').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(500);
      if (deal_id) q = q.eq('deal_id', deal_id);
      const { data, error } = await q;
      if (error) { console.error('[sovereign-api] contacts:list', error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'contacts:create') {
      const { data, error } = await sb.from('contacts').insert({ ...payload, user_id: userId }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'contacts:update') {
      const CONTACT_COLS = ['full_name','email','phone','role','company_name','notes','linkedin_url','last_contacted_at','sentiment','outreach_status','deal_id'];
      const updates: Record<string, unknown> = {};
      for (const k of CONTACT_COLS) { if (payload?.[k] !== undefined) updates[k] = payload[k]; }
      if (!Object.keys(updates).length) return json({ error: 'No valid fields to update' }, 400);
      const { data, error } = await sb.from('contacts').update(updates).eq('id', contact_id).eq('user_id', userId).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── OUTREACH ────────────────────────────────────────────────
    if (action === 'outreach:log') {
      const { data, error } = await sb.from('outreach_log').insert({ ...payload, user_id: userId, contact_id }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'outreach:list') {
      const { data, error } = await sb.from('outreach_log').select('*, contacts(full_name,email), deals(company_name)').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── DOCUMENTS ───────────────────────────────────────────────
    if (action === 'docs:list') {
      const { data, error } = await sb.from('documents').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(200);
      if (error) { console.error('[sovereign-api] docs:list', error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'docs:save') {
      const { data, error } = await sb.from('documents').upsert({ ...payload, user_id: userId }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── CONVERSATIONS ────────────────────────────────────────────
    if (action === 'conv:list') {
      const { data, error } = await sb.from('conversations')
        .select('id,agent_seat,agent_name,title,updated_at,token_count')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'conv:load') {
      const id = payload?.id;
      if (!id) return json({ error: 'Missing conversation id' }, 400);
      const { data, error } = await sb.from('conversations')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'conv:save') {
      const { conversation, messages } = payload;
      const { data, error } = await sb.from('conversations').upsert({
        ...conversation,
        user_id: userId,
        messages,
        token_count: messages.reduce((n: number, m: { content: string }) => n + Math.ceil(m.content.length / 4), 0),
      }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── AUDIT ────────────────────────────────────────────────────
    if (action === 'audit:log') {
      const { event, agent, details, status } = payload;
      const { error } = await sb.from('audit_trail').insert({ user_id: userId, event, agent, details, status, actor_id: userId });
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ ok: true });
    }

    // ── PROFILE ──────────────────────────────────────────────────
    if (action === 'profile:get') {
      const { data, error } = await sb.from('user_profiles').select('*').eq('id', userId).single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'profile:update') {
      const { data, error } = await sb.from('user_profiles').upsert({ id: userId, ...payload }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── COMPANY INTEL ────────────────────────────────────────────
    if (action === 'intel:get') {
      if (!deal_id) return json({ error: 'deal_id required' }, 400);
      const { data: dealCheck } = await sb.from('deals').select('id').eq('id', deal_id).eq('user_id', userId).single();
      if (!dealCheck) return json({ error: 'Deal not found' }, 404);
      const { data, error } = await sb.from('company_intel').select('*').eq('deal_id', deal_id).single();
      if (error && error.code !== 'PGRST116') { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data: data || null });
    }

    if (action === 'intel:list') {
      const { data, error } = await sb.from('company_intel')
        .select('*, deals!inner(id, company_name, stage, score, user_id)')
        .eq('deals.user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) { console.error('[sovereign-api] intel:list', error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── SCRAPE QUEUE ─────────────────────────────────────────────
    if (action === 'scrape:queue:add') {
      const { company_name, website_url } = payload || {};
      if (!deal_id || !company_name) return json({ error: 'deal_id and company_name required' }, 400);
      const { data, error } = await sb.from('scrape_queue').insert({
        deal_id,
        company_name: String(company_name),
        website_url: website_url ? String(website_url) : null,
        requested_by: userId,
        status: 'pending',
      }).select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    // ── BILLING STATUS ───────────────────────────────────────────
    if (action === 'billing:status') {
      const { data: profile } = await sb.from('user_profiles')
        .select('plan, subscription_status, trial_ends_at, referral_credits')
        .eq('id', userId).single();
      if (!profile) return json({ data: { plan: 'trial', subscription_status: 'trialing', trial_ends_at: null, referral_credits: 0 } });
      const now = new Date();
      const trialEnd = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
      const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)) : 0;
      const trialExpired = profile.subscription_status === 'trialing' && trialEnd && trialEnd < now;
      return json({ data: { ...profile, trial_days_left: trialDaysLeft, trial_expired: trialExpired } });
    }

    // ── REFERRALS ────────────────────────────────────────────────
    if (action === 'referral:get') {
      // Ensure user has a referral code (auto-generated by trigger, but backfill if missing)
      let { data: profile, error: pErr } = await sb.from('user_profiles').select('referral_code, referral_credits').eq('id', userId).single();
      if (pErr || !profile) {
        // Upsert profile to trigger code generation
        const { data: up, error: upErr } = await sb.from('user_profiles')
          .upsert({ id: userId, email: jwtPayload.email, full_name: (jwtPayload.user_metadata?.full_name as string) || null })
          .select('referral_code, referral_credits').single();
        if (upErr) return json({ error: upErr.message }, 500);
        profile = up;
      }
      // Count referrals by status
      const { data: refs } = await sb.from('referrals').select('status').eq('referrer_id', userId);
      const stats = { pending: 0, signed_up: 0, subscribed: 0 };
      for (const r of (refs || [])) stats[r.status as keyof typeof stats] = (stats[r.status as keyof typeof stats] || 0) + 1;
      return json({ data: { referral_code: profile?.referral_code, credits: profile?.referral_credits || 0, stats } });
    }

    if (action === 'referral:track') {
      const code = String(payload?.code || '').toUpperCase().trim();
      if (!code) return json({ error: 'code required' }, 400);
      // Look up referrer
      const { data: referrerProfile } = await sb.from('user_profiles')
        .select('id, email').eq('referral_code', code).single();
      if (!referrerProfile) return json({ error: 'Invalid referral code' }, 404);
      if (referrerProfile.id === userId) return json({ error: 'Cannot refer yourself' }, 400);
      // Check not already tracked for this user
      const { data: existing } = await sb.from('referrals').select('id').eq('referred_user_id', userId).single();
      if (existing) return json({ data: { already_tracked: true } });
      // Fraud gate: max 10 referrals per referrer per 24 hours
      const since24h = new Date(Date.now() - 86400000).toISOString();
      const { count: recentCount } = await sb.from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', referrerProfile.id)
        .gte('created_at', since24h);
      if ((recentCount || 0) >= 10) {
        return json({ error: 'Referral limit reached. Please try again tomorrow.' }, 429);
      }
      // Fraud gate: referred email domain must not match referrer domain (catches org self-referral)
      const referredDomain = (jwtPayload.email || '').split('@')[1]?.toLowerCase();
      const referrerDomain = (referrerProfile.email || '').split('@')[1]?.toLowerCase();
      if (referredDomain && referrerDomain && referredDomain === referrerDomain) {
        return json({ error: 'Referral not valid' }, 400);
      }
      // Insert referral record
      const { error: insErr } = await sb.from('referrals').insert({
        referrer_id: referrerProfile.id,
        referred_user_id: userId,
        referred_email: jwtPayload.email,
        code,
        status: 'signed_up',
      });
      if (insErr) return json({ error: insErr.message }, 500);
      await sb.from('user_profiles').upsert({ id: userId, referred_by: code });
      return json({ ok: true });
    }

    // ── MILESTONES ──────────────────────────────────────────────
    if (action === 'milestones:list') {
      if (!deal_id) return json({ error: 'deal_id required' }, 400);
      const { data: dealCheck } = await sb.from('deals').select('id').eq('id', deal_id).eq('user_id', userId).single();
      if (!dealCheck) return json({ error: 'Deal not found' }, 404);
      const { data, error } = await sb.from('deal_milestones')
        .select('*')
        .eq('deal_id', deal_id)
        .order('stage').order('sort_order', { ascending: true });
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'milestones:update') {
      const milestoneId = String(payload?.id || '');
      if (!milestoneId) return json({ error: 'milestone id required' }, 400);
      // Verify the milestone belongs to a deal owned by this user
      const { data: mOwn } = await sb.from('deal_milestones').select('deal_id').eq('id', milestoneId).single();
      if (!mOwn) return json({ error: 'Milestone not found' }, 404);
      const { data: dealOwn } = await sb.from('deals').select('id').eq('id', mOwn.deal_id).eq('user_id', userId).single();
      if (!dealOwn) return json({ error: 'Unauthorized' }, 403);
      const allowed = ['status','notes','started_at','completed_at','deliverable_url','due_date','priority'];
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) { if (payload?.[k] !== undefined) updates[k] = payload[k]; }
      const { data, error } = await sb.from('deal_milestones')
        .update(updates)
        .eq('id', milestoneId)
        .select().single();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data });
    }

    if (action === 'milestones:init') {
      if (!deal_id) return json({ error: 'deal_id required' }, 400);
      const templateName = String(payload?.template || 'nmd_standard');
      // Check deal ownership
      const { data: dealCheck } = await sb.from('deals').select('id').eq('id', deal_id).eq('user_id', userId).single();
      if (!dealCheck) return json({ error: 'Deal not found' }, 404);
      // Check if milestones already exist
      const { data: existing } = await sb.from('deal_milestones').select('id').eq('deal_id', deal_id).limit(1);
      if (existing && existing.length > 0) return json({ error: 'Milestones already initialized for this deal' }, 400);
      // Load template
      const { data: templates, error: tplErr } = await sb.from('workflow_templates')
        .select('*').eq('name', templateName).order('sort_order');
      if (tplErr) return json({ error: tplErr.message }, 500);
      if (!templates || templates.length === 0) return json({ error: 'Template not found' }, 404);
      // Insert milestones from template
      const milestones = templates.map((t: Record<string, unknown>) => ({
        deal_id,
        stage: t.stage,
        title: t.title,
        description: t.description,
        agent_seat: t.agent_seat,
        agent_name: t.agent_name,
        priority: t.priority,
        sort_order: t.sort_order,
        status: 'pending',
      }));
      const { data, error } = await sb.from('deal_milestones').insert(milestones).select();
      if (error) { console.error('[sovereign-api]', action, error); return json({ error: 'Database error' }, 500); }
      return json({ data, count: data.length });
    }

    if (action === 'milestones:templates') {
      const { data, error } = await sb.from('workflow_templates').select('*').order('name').order('stage').order('sort_order').limit(500);
      if (error) { console.error('[sovereign-api] milestones:templates', error); return json({ error: 'Database error' }, 500); }
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
