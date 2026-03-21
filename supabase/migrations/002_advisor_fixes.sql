-- ================================================================
-- Migration 002: Supabase Advisor Fixes
-- Applied: 2026-03-21
-- Resolves all WARN-level advisor issues from performance/security lints
-- ================================================================

-- ----------------------------------------------------------------
-- FIX 1: Drop always-true / overly-permissive / duplicate policies
-- ----------------------------------------------------------------

-- company_intel: always-true USING (rls_policy_always_true WARN)
DROP POLICY IF EXISTS intel_auth_write ON public.company_intel;

-- ai_patterns: USING=true allows anonymous reads
DROP POLICY IF EXISTS ai_patterns_read ON public.ai_patterns;

-- system_metrics: USING=true allows anonymous reads
DROP POLICY IF EXISTS system_metrics_read ON public.system_metrics;

-- ad_tracking: duplicate SELECT (also bare auth.uid)
DROP POLICY IF EXISTS ad_tracking_read_own ON public.ad_tracking;

-- analytics_events: duplicate SELECT + duplicate INSERT
DROP POLICY IF EXISTS analytics_read_own ON public.analytics_events;
DROP POLICY IF EXISTS analytics_insert_service_role ON public.analytics_events;

-- audit_trail: audit_own ALL already covers SELECT and INSERT
DROP POLICY IF EXISTS audit_read_own ON public.audit_trail;
DROP POLICY IF EXISTS audit_insert ON public.audit_trail;

-- compliance_log: compliance_own ALL covers SELECT and INSERT
DROP POLICY IF EXISTS compliance_auth_read ON public.compliance_log;
DROP POLICY IF EXISTS compliance_auth_insert ON public.compliance_log;

-- phone_calls: phone_calls_own ALL covers everything; auth_read too broad
DROP POLICY IF EXISTS calls_auth_read ON public.phone_calls;
DROP POLICY IF EXISTS calls_auth_insert ON public.phone_calls;

-- scrape_queue: scrape_queue_auth too broad (all auth users see all rows)
DROP POLICY IF EXISTS scrape_queue_auth ON public.scrape_queue;

-- pentest_results: pentest_results_admin ALL covers all ops
DROP POLICY IF EXISTS pentest_auth_read ON public.pentest_results;
DROP POLICY IF EXISTS pentest_auth_insert ON public.pentest_results;

-- user_roles: duplicate SELECT policies
DROP POLICY IF EXISTS "Users see own role" ON public.user_roles;
DROP POLICY IF EXISTS user_roles_own ON public.user_roles;

-- admin_audit: consolidate two SELECT policies into one
DROP POLICY IF EXISTS "Admins view audit" ON public.admin_audit;
DROP POLICY IF EXISTS admin_audit_access ON public.admin_audit;

-- ----------------------------------------------------------------
-- FIX 2: Recreate policies with (SELECT auth.uid()) — fixes auth_rls_initplan
-- (bare auth.uid() is re-evaluated per row; SELECT form is cached per query)
-- ----------------------------------------------------------------

-- admin_audit: consolidated SELECT (was two separate policies)
CREATE POLICY admin_audit_select ON public.admin_audit
  FOR SELECT USING (
    admin_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = ANY (ARRAY['admin', 'superadmin'])
    )
  );

-- admin_users
DROP POLICY IF EXISTS admins_read_admin_users ON public.admin_users;
CREATE POLICY admins_read_admin_users ON public.admin_users
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- company_intel
DROP POLICY IF EXISTS intel_auth_read ON public.company_intel;
CREATE POLICY intel_auth_read ON public.company_intel
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- system_metrics
DROP POLICY IF EXISTS metrics_auth_read ON public.system_metrics;
CREATE POLICY metrics_auth_read ON public.system_metrics
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- ai_patterns
DROP POLICY IF EXISTS patterns_auth_read ON public.ai_patterns;
CREATE POLICY patterns_auth_read ON public.ai_patterns
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- user_roles: fix bare auth.role()
DROP POLICY IF EXISTS "Service role manages roles" ON public.user_roles;
CREATE POLICY "Service role manages roles" ON public.user_roles
  FOR ALL USING ((SELECT auth.role()) = 'service_role');

-- ----------------------------------------------------------------
-- FIX 3: Add missing FK indexes (unindexed_foreign_keys INFO)
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ad_tracking_user_id        ON public.ad_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id        ON public.admin_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id   ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id         ON public.audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_company_intel_user_id       ON public.company_intel(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_log_user_id      ON public.compliance_log(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deal_id       ON public.conversations(deal_id);
CREATE INDEX IF NOT EXISTS idx_documents_deal_id           ON public.documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id           ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_outreach_log_contact_id     ON public.outreach_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_outreach_log_deal_id        ON public.outreach_log(deal_id);
CREATE INDEX IF NOT EXISTS idx_outreach_log_user_id        ON public.outreach_log(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_user_id         ON public.phone_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_scrape_queue_deal_id        ON public.scrape_queue(deal_id);
CREATE INDEX IF NOT EXISTS idx_scrape_queue_requested_by   ON public.scrape_queue(requested_by);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id           ON public.workflows(user_id);

-- ----------------------------------------------------------------
-- FIX 4: sovereign.user_consents — split ALL into per-command policies
-- eliminates multiple_permissive INSERT overlap
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS own_consents ON sovereign.user_consents;
DROP POLICY IF EXISTS user_consents_insert_combined ON sovereign.user_consents;

-- SELECT/UPDATE/DELETE: own records only
CREATE POLICY user_consents_select ON sovereign.user_consents
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_consents_update ON sovereign.user_consents
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_consents_delete ON sovereign.user_consents
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- INSERT: allow anonymous cookie consent (session_id) OR authenticated user
CREATE POLICY user_consents_insert ON sovereign.user_consents
  FOR INSERT WITH CHECK (
    (session_id IS NOT NULL) OR (user_id = (SELECT auth.uid()))
  );

-- ----------------------------------------------------------------
-- NOTE: auth_leaked_password_protection WARN
-- Cannot be fixed via SQL — requires Supabase Pro Plan.
-- Enable at: Dashboard > Authentication > Password Security > HaveIBeenPwned
-- ----------------------------------------------------------------
