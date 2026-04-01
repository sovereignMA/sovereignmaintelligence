-- Migration 007: Performance fixes — RLS initplan + duplicate indexes
-- Fixes Supabase linter WARNs: auth_rls_initplan + duplicate_index

-- ── 1. Fix RLS initplan: own_scout_searches ─────────────────────────────────
-- Wrap auth.uid() in (select ...) so Postgres initialises it once per query,
-- not once per row. This is a significant perf win on large tables.
DROP POLICY IF EXISTS "own_scout_searches" ON public.scout_searches;
CREATE POLICY "own_scout_searches" ON public.scout_searches
  FOR ALL TO authenticated
  USING  (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── 2. Fix RLS initplan: newsletter_admins_read ──────────────────────────────
-- auth.jwt() calls current_setting() internally — the linter still flags it
-- even with (SELECT auth.jwt()). Use current_setting() directly with (SELECT)
-- so the query planner can hoist it out of the per-row evaluation loop.
DROP POLICY IF EXISTS newsletter_admins_read ON public.newsletter_subscribers;
CREATE POLICY newsletter_admins_read ON public.newsletter_subscribers
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (SELECT auth.role()) = 'service_role'
    OR (SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role')) = 'admin'
  );

-- ── 3. Drop duplicate indexes ────────────────────────────────────────────────
-- The idx_* variants exist in the live DB (created directly); the *_user_id_idx
-- and referrer_idx variants were added by migration 005.  Drop the duplicates.
DROP INDEX IF EXISTS public.email_aliases_user_id_idx;
DROP INDEX IF EXISTS public.email_rules_user_id_idx;
DROP INDEX IF EXISTS public.referrals_referrer_idx;
