-- Migration 014: Add missing columns to deals table
-- Fixes PGRST204 errors when scout/frontend sends fields not in schema

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS source          text,             -- origin of deal: scout|manual|import
  ADD COLUMN IF NOT EXISTS arr_pct         numeric,          -- ARR as % of revenue
  ADD COLUMN IF NOT EXISTS revenue_gbp     numeric,          -- total revenue in GBP
  ADD COLUMN IF NOT EXISTS asking_price_gbp numeric,         -- seller's asking price
  ADD COLUMN IF NOT EXISTS ai_score        integer,          -- AI-computed acquisition score
  ADD COLUMN IF NOT EXISTS contact_name    text,             -- primary contact name
  ADD COLUMN IF NOT EXISTS contact_email   text,             -- primary contact email
  ADD COLUMN IF NOT EXISTS website         text,             -- company website URL
  ADD COLUMN IF NOT EXISTS founded_year    integer,          -- year company was founded
  ADD COLUMN IF NOT EXISTS employee_count  integer;          -- headcount

-- Index for filtering by source (scout vs manual)
CREATE INDEX IF NOT EXISTS deals_source_idx ON public.deals(user_id, source);

SELECT pg_notify('pgrst', 'reload schema');
