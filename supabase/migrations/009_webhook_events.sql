-- 009_webhook_events.sql
-- Idempotency table for Stripe webhook events.
-- Prevents duplicate processing when Stripe retries delivery.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           text        PRIMARY KEY,   -- Stripe event.id (e.g. evt_xxx)
  processed_at timestamptz DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_events_service_only" ON public.webhook_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
