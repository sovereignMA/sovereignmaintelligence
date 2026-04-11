-- Migration 012: RLS security fixes
-- Fixes: admin_users over-permissive read, company_intel cross-user write,
--        analytics_events/ad_tracking/audit_trail missing maintenance policies

-- ── 1. admin_users: restrict reads to admins only ────────────────────────────
-- Previously any authenticated user could read all admin records
DROP POLICY IF EXISTS "admins_read_admin_users" ON public.admin_users;

CREATE POLICY "admins_read_admin_users" ON public.admin_users
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM public.admin_users)
  );

-- ── 2. company_intel: scope writes to owning user ────────────────────────────
-- Previously any authenticated user could write any intel record
DROP POLICY IF EXISTS "intel_auth_write" ON public.company_intel;

CREATE POLICY "intel_own_write" ON public.company_intel
  FOR ALL
  USING (user_id = auth.uid() OR (SELECT auth.role()) = 'service_role')
  WITH CHECK (user_id = auth.uid() OR (SELECT auth.role()) = 'service_role');

-- ── 3. analytics_events: add service-role maintenance policies ───────────────
DROP POLICY IF EXISTS "analytics_delete_service" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_update_service" ON public.analytics_events;

CREATE POLICY "analytics_delete_service" ON public.analytics_events
  FOR DELETE USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "analytics_update_service" ON public.analytics_events
  FOR UPDATE USING ((SELECT auth.role()) = 'service_role');

-- ── 4. ad_tracking: add service-role maintenance policies ────────────────────
DROP POLICY IF EXISTS "ad_tracking_delete_service" ON public.ad_tracking;
DROP POLICY IF EXISTS "ad_tracking_update_service" ON public.ad_tracking;

CREATE POLICY "ad_tracking_delete_service" ON public.ad_tracking
  FOR DELETE USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "ad_tracking_update_service" ON public.ad_tracking
  FOR UPDATE USING ((SELECT auth.role()) = 'service_role');

-- ── 5. audit_trail: add service-role maintenance policies ────────────────────
DROP POLICY IF EXISTS "audit_delete_service" ON public.audit_trail;
DROP POLICY IF EXISTS "audit_update_service" ON public.audit_trail;

CREATE POLICY "audit_delete_service" ON public.audit_trail
  FOR DELETE USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "audit_update_service" ON public.audit_trail
  FOR UPDATE USING ((SELECT auth.role()) = 'service_role');

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
