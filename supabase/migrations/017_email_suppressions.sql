-- 017_email_suppressions.sql
-- Stores unsubscribe/suppression records for outreach emails.
-- Checked before every send; also honoured by Resend webhooks (bounce/complaint).

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  reason        text        NOT NULL DEFAULT 'unsubscribe'
                              CHECK (reason IN ('unsubscribe','bounce','complaint','manual')),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  notes         text,
  CONSTRAINT email_suppressions_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS email_suppressions_email_idx ON public.email_suppressions(LOWER(email));

-- Back-fill from newsletter_subscribers that already unsubscribed
INSERT INTO public.email_suppressions (email, reason, suppressed_at)
SELECT email, 'unsubscribe', unsubscribed_at
FROM   public.newsletter_subscribers
WHERE  unsubscribed_at IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Service-role only (no RLS needed — never exposed to browser clients)
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON public.email_suppressions
  FOR ALL USING (false) WITH CHECK (false);

SELECT pg_notify('pgrst', 'reload schema');
