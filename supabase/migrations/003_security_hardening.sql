-- 003_security_hardening.sql
-- Fix mutable search_path on SECURITY DEFINER functions + tighten newsletter RLS

-- Fix 1: Pin search_path on generate_referral_code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  code TEXT;
  attempts INT := 0;
BEGIN
  IF NEW.referral_code IS NULL THEN
    LOOP
      code := UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT || RANDOM()::TEXT) FROM 1 FOR 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE referral_code = code);
      attempts := attempts + 1;
      EXIT WHEN attempts > 10;
    END LOOP;
    NEW.referral_code := code;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix 2: Pin search_path on set_trial_expiry
CREATE OR REPLACE FUNCTION public.set_trial_expiry()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '21 days';
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix 3: Pin search_path on increment_referral_credits
CREATE OR REPLACE FUNCTION public.increment_referral_credits(user_id uuid, days integer)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
BEGIN
  UPDATE public.user_profiles
  SET referral_credits = referral_credits + days
  WHERE id = user_id;
END;
$function$;

-- Fix 4: Tighten newsletter INSERT policy — require valid email format
-- (replaces the overly permissive WITH CHECK (true))
DROP POLICY IF EXISTS newsletter_subscribe ON public.newsletter_subscribers;
CREATE POLICY newsletter_subscribe ON public.newsletter_subscribers
  FOR INSERT
  WITH CHECK (email IS NOT NULL AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
