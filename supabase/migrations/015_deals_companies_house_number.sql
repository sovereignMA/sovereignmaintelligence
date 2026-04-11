ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS companies_house_number text;  -- UK Companies House registration number

SELECT pg_notify('pgrst', 'reload schema');
