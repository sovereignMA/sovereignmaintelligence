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

-- NOTE: user_roles and admin_audit policies removed — tables do not exist in migration 001

-- ----------------------------------------------------------------
-- FIX 2: Recreate policies with (SELECT auth.uid()) — fixes auth_rls_initplan
-- (bare auth.uid() is re-evaluated per row; SELECT form is cached per query)
-- ----------------------------------------------------------------

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

-- ----------------------------------------------------------------
-- FIX 3: Add missing FK indexes (unindexed_foreign_keys INFO)
-- ----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ad_tracking_user_id        ON public.ad_tracking(user_id);
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

-- NOTE: sovereign.user_consents policies removed — schema/table does not exist in migration 001

-- ----------------------------------------------------------------
-- NOTE: auth_leaked_password_protection WARN
-- Cannot be fixed via SQL — requires Supabase Pro Plan.
-- Enable at: Dashboard > Authentication > Password Security > HaveIBeenPwned
-- ----------------------------------------------------------------
