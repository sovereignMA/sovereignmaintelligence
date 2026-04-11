-- Migration 016: Fix contacts and deal_milestones schema gaps
-- Resolves PGRST204 and silent data-loss bugs found in audit

-- ═══════════════════════════════════════════════════════════════
-- 1. contacts — add missing columns the API/frontend expect
--    Old columns (company, linkedin, last_contact_at) kept for compat
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS company_name      text,           -- sovereign-api sends company_name not company
  ADD COLUMN IF NOT EXISTS linkedin_url      text,           -- sovereign-api sends linkedin_url not linkedin
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,   -- sovereign-api sends last_contacted_at not last_contact_at
  ADD COLUMN IF NOT EXISTS sentiment         text,           -- positive|neutral|negative — referenced in CONTACT_COLS
  ADD COLUMN IF NOT EXISTS outreach_status   text;           -- cold|warm|hot|replied — referenced in CONTACT_COLS

-- Back-fill new columns from old ones where new is null
UPDATE public.contacts SET company_name      = company       WHERE company_name      IS NULL AND company      IS NOT NULL;
UPDATE public.contacts SET linkedin_url      = linkedin      WHERE linkedin_url      IS NULL AND linkedin      IS NOT NULL;
UPDATE public.contacts SET last_contacted_at = last_contact_at WHERE last_contacted_at IS NULL AND last_contact_at IS NOT NULL;

-- Index for outreach status filtering
CREATE INDEX IF NOT EXISTS contacts_outreach_status_idx ON public.contacts(user_id, outreach_status);
CREATE INDEX IF NOT EXISTS contacts_sentiment_idx       ON public.contacts(user_id, sentiment);

-- ═══════════════════════════════════════════════════════════════
-- 2. deal_milestones — add all columns referenced in sovereign-api
--    milestones:init inserts: stage, title, description, agent_seat,
--    agent_name, priority, sort_order, status
--    milestones:update writes: status, notes, started_at,
--    completed_at, deliverable_url, due_date, priority, updated_at
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.deal_milestones
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz default now(),
  ADD COLUMN IF NOT EXISTS stage           text,                           -- pipeline stage (sourcing|diligence|legal|close)
  ADD COLUMN IF NOT EXISTS description     text,                           -- full milestone description
  ADD COLUMN IF NOT EXISTS agent_seat      text,                           -- which AI agent owns this milestone
  ADD COLUMN IF NOT EXISTS agent_name      text,                           -- display name of the agent
  ADD COLUMN IF NOT EXISTS status          text not null default 'pending', -- pending|in_progress|completed|blocked
  ADD COLUMN IF NOT EXISTS priority        text default 'medium',          -- low|medium|high|critical
  ADD COLUMN IF NOT EXISTS sort_order      integer not null default 0,     -- display order within stage
  ADD COLUMN IF NOT EXISTS started_at      timestamptz,                    -- when work began
  ADD COLUMN IF NOT EXISTS deliverable_url text;                           -- link to completed deliverable

-- Performance index for sorted milestone queries
CREATE INDEX IF NOT EXISTS deal_milestones_stage_sort_idx ON public.deal_milestones(deal_id, stage, sort_order);
CREATE INDEX IF NOT EXISTS deal_milestones_status_idx     ON public.deal_milestones(deal_id, status);

SELECT pg_notify('pgrst', 'reload schema');
