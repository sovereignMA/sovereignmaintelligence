-- 005_missing_tables.sql
-- Creates all tables referenced in code/policies but missing from 001_init.sql
-- Also adds Stripe/billing columns to user_profiles and the referral credits RPC

-- ═══════════════════════════════════════════════════════════════
-- 1. STRIPE & BILLING COLUMNS ON user_profiles
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id  text,
  ADD COLUMN IF NOT EXISTS subscription_id     text,
  ADD COLUMN IF NOT EXISTS subscription_status text,   -- active | trialing | past_due | cancelled | paused
  ADD COLUMN IF NOT EXISTS plan                text,   -- solo | team | fund | enterprise | cancelled
  ADD COLUMN IF NOT EXISTS trial_ends_at       timestamptz,
  ADD COLUMN IF NOT EXISTS referral_credits    integer default 0,
  ADD COLUMN IF NOT EXISTS referral_code       text unique;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_stripe_customer_idx ON public.user_profiles(stripe_customer_id);

-- ═══════════════════════════════════════════════════════════════
-- 2. REFERRALS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.referrals (
  id               uuid        default gen_random_uuid() primary key,
  created_at       timestamptz default now(),
  referrer_id      uuid        references auth.users(id) on delete cascade not null,
  referred_user_id uuid        references auth.users(id) on delete cascade not null,
  status           text        default 'pending',  -- pending | subscribed | completed
  reward_applied_at timestamptz
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS referrals_referrer_idx       ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referred_user_idx  ON public.referrals(referred_user_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. EMAIL TABLES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.emails (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  user_id     uuid        references auth.users(id) on delete cascade not null,
  to_email    text,
  subject     text,
  body        text,
  status      text        default 'sent',   -- queued | sent | failed
  sent_at     timestamptz
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS emails_user_id_idx ON public.emails(user_id);

-- --

CREATE TABLE IF NOT EXISTS public.email_aliases (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  user_id     uuid        references auth.users(id) on delete cascade not null,
  alias_email text        unique,
  forward_to  text,
  is_active   boolean     default true
);

ALTER TABLE public.email_aliases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_aliases_user_id_idx ON public.email_aliases(user_id);

-- --

CREATE TABLE IF NOT EXISTS public.email_connections (
  id             uuid        default gen_random_uuid() primary key,
  created_at     timestamptz default now(),
  user_id        uuid        references auth.users(id) on delete cascade not null,
  email_provider text,           -- gmail | outlook | imap
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz
);

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_connections_user_id_idx ON public.email_connections(user_id);

-- --

CREATE TABLE IF NOT EXISTS public.email_rules (
  id           uuid        default gen_random_uuid() primary key,
  created_at   timestamptz default now(),
  user_id      uuid        references auth.users(id) on delete cascade not null,
  from_pattern text,
  action       text,
  is_active    boolean     default true
);

ALTER TABLE public.email_rules ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_rules_user_id_idx ON public.email_rules(user_id);

-- --

CREATE TABLE IF NOT EXISTS public.email_events (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  email_id    uuid        references public.emails(id) on delete cascade,
  event_type  text,           -- opened | clicked | bounced | delivered
  metadata    jsonb
);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS email_events_email_id_idx ON public.email_events(email_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. AGENT HEALTH
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_health (
  id              uuid        default gen_random_uuid() primary key,
  created_at      timestamptz default now(),
  agent_name      text        not null,
  status          text        default 'ok',   -- ok | degraded | down
  last_heartbeat  timestamptz default now(),
  metrics         jsonb
);

ALTER TABLE public.agent_health ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS agent_health_agent_name_idx ON public.agent_health(agent_name);

-- ═══════════════════════════════════════════════════════════════
-- 5. WORKFLOW TEMPLATES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id          uuid        default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  name        text        not null,
  description text,
  definition  jsonb
);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 6. NEWSLETTER SUBSCRIBERS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id               uuid        default gen_random_uuid() primary key,
  created_at       timestamptz default now(),
  email            text        unique not null,
  subscribed_at    timestamptz default now(),
  unsubscribed_at  timestamptz
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 7. DEAL MILESTONES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.deal_milestones (
  id           uuid        default gen_random_uuid() primary key,
  created_at   timestamptz default now(),
  deal_id      uuid        references public.deals(id) on delete cascade not null,
  title        text,
  milestone_type text,     -- loi | due_diligence | spa | completion | etc.
  due_date     date,
  completed_at timestamptz,
  notes        text
);

ALTER TABLE public.deal_milestones ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS deal_milestones_deal_id_idx ON public.deal_milestones(deal_id);

-- ═══════════════════════════════════════════════════════════════
-- 8. RLS POLICIES (applied here since tables didn't exist in 004)
-- ═══════════════════════════════════════════════════════════════

-- referrals (mirrors 004)
DROP POLICY IF EXISTS referrals_select ON public.referrals;
DROP POLICY IF EXISTS referrals_write  ON public.referrals;
DROP POLICY IF EXISTS referrals_update ON public.referrals;
DROP POLICY IF EXISTS referrals_delete ON public.referrals;
CREATE POLICY referrals_select ON public.referrals
  AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = referrer_id));
CREATE POLICY referrals_write ON public.referrals
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY referrals_update ON public.referrals
  AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role');
CREATE POLICY referrals_delete ON public.referrals
  AS PERMISSIVE FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- emails (mirrors 004)
DROP POLICY IF EXISTS emails_access ON public.emails;
CREATE POLICY emails_access ON public.emails
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- email_aliases (mirrors 004)
DROP POLICY IF EXISTS email_aliases_access ON public.email_aliases;
CREATE POLICY email_aliases_access ON public.email_aliases
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- email_connections (mirrors 004)
DROP POLICY IF EXISTS email_connections_access ON public.email_connections;
CREATE POLICY email_connections_access ON public.email_connections
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- email_rules (mirrors 004)
DROP POLICY IF EXISTS email_rules_access ON public.email_rules;
CREATE POLICY email_rules_access ON public.email_rules
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- email_events (mirrors 004)
DROP POLICY IF EXISTS email_events_select ON public.email_events;
DROP POLICY IF EXISTS email_events_write  ON public.email_events;
DROP POLICY IF EXISTS email_events_update ON public.email_events;
DROP POLICY IF EXISTS email_events_delete ON public.email_events;
CREATE POLICY email_events_select ON public.email_events
  AS PERMISSIVE FOR SELECT TO public
  USING (
    ((SELECT auth.role()) = 'service_role')
    OR EXISTS (
      SELECT 1 FROM public.emails e
      WHERE e.id = email_events.email_id AND e.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY email_events_write ON public.email_events
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY email_events_update ON public.email_events
  AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role');
CREATE POLICY email_events_delete ON public.email_events
  AS PERMISSIVE FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- agent_health (mirrors 004)
DROP POLICY IF EXISTS agent_health_select ON public.agent_health;
DROP POLICY IF EXISTS agent_health_write  ON public.agent_health;
DROP POLICY IF EXISTS agent_health_update ON public.agent_health;
DROP POLICY IF EXISTS agent_health_delete ON public.agent_health;
CREATE POLICY agent_health_select ON public.agent_health
  AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) OR ((SELECT auth.role()) = 'service_role'));
CREATE POLICY agent_health_write ON public.agent_health
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY agent_health_update ON public.agent_health
  AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role');
CREATE POLICY agent_health_delete ON public.agent_health
  AS PERMISSIVE FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- workflow_templates (mirrors 004)
DROP POLICY IF EXISTS workflow_templates_select ON public.workflow_templates;
DROP POLICY IF EXISTS workflow_templates_write  ON public.workflow_templates;
DROP POLICY IF EXISTS workflow_templates_update ON public.workflow_templates;
DROP POLICY IF EXISTS workflow_templates_delete ON public.workflow_templates;
CREATE POLICY workflow_templates_select ON public.workflow_templates
  AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) OR ((SELECT auth.role()) = 'service_role'));
CREATE POLICY workflow_templates_write ON public.workflow_templates
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY workflow_templates_update ON public.workflow_templates
  AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT auth.role()) = 'service_role');
CREATE POLICY workflow_templates_delete ON public.workflow_templates
  AS PERMISSIVE FOR DELETE TO public
  USING ((SELECT auth.role()) = 'service_role');

-- newsletter_subscribers (mirrors 004)
DROP POLICY IF EXISTS newsletter_admins_read ON public.newsletter_subscribers;
CREATE POLICY newsletter_admins_read ON public.newsletter_subscribers
  AS PERMISSIVE FOR SELECT TO public
  USING (
    ((SELECT auth.role()) = 'service_role')
    OR ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')) = 'admin')
  );

-- deal_milestones (mirrors 004)
DROP POLICY IF EXISTS deal_milestones_access ON public.deal_milestones;
CREATE POLICY deal_milestones_access ON public.deal_milestones
  AS PERMISSIVE FOR ALL TO public
  USING (
    ((SELECT auth.role()) = 'service_role')
    OR deal_id IN (SELECT id FROM public.deals WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    ((SELECT auth.role()) = 'service_role')
    OR deal_id IN (SELECT id FROM public.deals WHERE user_id = (SELECT auth.uid()))
  );

-- ═══════════════════════════════════════════════════════════════
-- 9. increment_referral_credits RPC
--    Called by api/stripe/webhook.js creditReferrer()
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_referral_credits(user_id uuid, days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET referral_credits = COALESCE(referral_credits, 0) + days
  WHERE id = user_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════
