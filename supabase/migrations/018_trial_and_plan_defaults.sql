-- 018_trial_and_plan_defaults.sql
-- Fixes three gaps found in signup-to-payment audit:
--   1. handle_new_user() now sets plan='trial' and trial_ends_at on profile creation
--   2. Attaches set_trial_expiry as BEFORE INSERT trigger on user_profiles
--   3. Adds DEFAULT 'trial' to plan column so drip cron (plan=eq.trial) matches new users
--   4. Back-fills existing rows with NULL plan that are still in trialing state

-- ── 1. Default on plan column ────────────────────────────────────────────────
ALTER TABLE public.user_profiles
  ALTER COLUMN plan SET DEFAULT 'trial';

-- ── 2. Attach set_trial_expiry as BEFORE INSERT trigger on user_profiles ─────
-- The function already exists (migration 003) but was never hooked to user_profiles.
DROP TRIGGER IF EXISTS trg_set_trial_expiry ON public.user_profiles;
CREATE TRIGGER trg_set_trial_expiry
  BEFORE INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_trial_expiry();

-- ── 3. Update handle_new_user to explicitly set plan='trial' ─────────────────
-- This guarantees the column is populated even if the DEFAULT is ever removed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, plan)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    'trial'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 4. Back-fill existing users with NULL plan ───────────────────────────────
-- Only updates rows where plan IS NULL AND subscription_status is NULL or 'trialing'
-- (active/past_due/cancelled users keep their current state set by the webhook).
UPDATE public.user_profiles
SET
  plan           = 'trial',
  trial_ends_at  = COALESCE(trial_ends_at, created_at + INTERVAL '21 days')
WHERE plan IS NULL
  AND (subscription_status IS NULL OR subscription_status = 'trialing');

SELECT pg_notify('pgrst', 'reload schema');
