-- 004_rls_performance.sql
-- Fix auth_rls_initplan: wrap auth.role() in (SELECT ...) so it's evaluated once per query
-- Fix multiple_permissive_policies: split ALL service policies into explicit SELECT/INSERT/UPDATE/DELETE

-- ── emails_access ─────────────────────────────────────────
DROP POLICY IF EXISTS emails_access ON public.emails;
CREATE POLICY emails_access ON public.emails
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- ── email_aliases_access ──────────────────────────────────
DROP POLICY IF EXISTS email_aliases_access ON public.email_aliases;
CREATE POLICY email_aliases_access ON public.email_aliases
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- ── email_connections_access ──────────────────────────────
DROP POLICY IF EXISTS email_connections_access ON public.email_connections;
CREATE POLICY email_connections_access ON public.email_connections
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- ── email_rules_access ────────────────────────────────────
DROP POLICY IF EXISTS email_rules_access ON public.email_rules;
CREATE POLICY email_rules_access ON public.email_rules
  AS PERMISSIVE FOR ALL TO public
  USING  (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.role()) = 'service_role') OR ((SELECT auth.uid()) = user_id));

-- ── newsletter_admins_read ────────────────────────────────
DROP POLICY IF EXISTS newsletter_admins_read ON public.newsletter_subscribers;
CREATE POLICY newsletter_admins_read ON public.newsletter_subscribers
  AS PERMISSIVE FOR SELECT TO public
  USING (
    ((SELECT auth.role()) = 'service_role')
    OR ((SELECT (auth.jwt() -> 'app_metadata' ->> 'role')) = 'admin')
  );

-- ── agent_health ──────────────────────────────────────────
DROP POLICY IF EXISTS agent_health_service ON public.agent_health;
DROP POLICY IF EXISTS agent_health_read ON public.agent_health;
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

-- ── company_intel ─────────────────────────────────────────
DROP POLICY IF EXISTS company_intel_read ON public.company_intel;
DROP POLICY IF EXISTS company_intel_write ON public.company_intel;
CREATE POLICY company_intel_select ON public.company_intel
  AS PERMISSIVE FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) OR ((SELECT auth.role()) = 'service_role'));
CREATE POLICY company_intel_insert ON public.company_intel
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) = user_id) OR ((SELECT auth.role()) = 'service_role'));
CREATE POLICY company_intel_update ON public.company_intel
  AS PERMISSIVE FOR UPDATE TO public
  USING  (((SELECT auth.uid()) = user_id) OR ((SELECT auth.role()) = 'service_role'))
  WITH CHECK (((SELECT auth.uid()) = user_id) OR ((SELECT auth.role()) = 'service_role'));
CREATE POLICY company_intel_delete ON public.company_intel
  AS PERMISSIVE FOR DELETE TO public
  USING (((SELECT auth.uid()) = user_id) OR ((SELECT auth.role()) = 'service_role'));

-- ── deal_milestones ───────────────────────────────────────
DROP POLICY IF EXISTS deal_milestones_service ON public.deal_milestones;
DROP POLICY IF EXISTS deal_milestones_user ON public.deal_milestones;
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

-- ── email_events ──────────────────────────────────────────
DROP POLICY IF EXISTS email_events_service ON public.email_events;
DROP POLICY IF EXISTS email_events_user_read ON public.email_events;
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

-- ── referrals ─────────────────────────────────────────────
DROP POLICY IF EXISTS referrals_service ON public.referrals;
DROP POLICY IF EXISTS referrals_user ON public.referrals;
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

-- ── workflow_templates ────────────────────────────────────
DROP POLICY IF EXISTS workflow_templates_service ON public.workflow_templates;
DROP POLICY IF EXISTS workflow_templates_read ON public.workflow_templates;
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
