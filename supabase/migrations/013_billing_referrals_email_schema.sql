-- Migration 013: Fix billing, referrals, and email schema gaps
-- Adds all columns referenced in code but missing from existing tables

-- ═══════════════════════════════════════════════════════════════
-- 1. user_profiles — add referred_by (used in referral:claim)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS referred_by text;  -- stores the referral_code used at signup

-- ═══════════════════════════════════════════════════════════════
-- 2. referrals — add referred_email and code columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referred_email text,   -- email of the person who signed up
  ADD COLUMN IF NOT EXISTS code            text;  -- the referral code that was used

-- ═══════════════════════════════════════════════════════════════
-- 3. emails — rebuild with full schema (add all missing columns)
--    Old columns (to_email, body, status) kept for compatibility
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.emails
  ADD COLUMN IF NOT EXISTS alias        text,            -- alias name used for sending (e.g. 'notifications')
  ADD COLUMN IF NOT EXISTS message_id   text,            -- Resend or Nylas message ID (deduplication key)
  ADD COLUMN IF NOT EXISTS from_address text,            -- full sender email address
  ADD COLUMN IF NOT EXISTS from_name    text,            -- sender display name
  ADD COLUMN IF NOT EXISTS to_addresses text[],          -- array of recipient emails
  ADD COLUMN IF NOT EXISTS cc           text[],          -- cc recipients
  ADD COLUMN IF NOT EXISTS bcc          text[],          -- bcc recipients
  ADD COLUMN IF NOT EXISTS body_html    text,            -- HTML body
  ADD COLUMN IF NOT EXISTS body_text    text,            -- plain text body
  ADD COLUMN IF NOT EXISTS snippet      text,            -- first 200 chars preview
  ADD COLUMN IF NOT EXISTS folder       text default 'inbox',  -- inbox|sent|drafts|trash|spam|archive
  ADD COLUMN IF NOT EXISTS category     text default 'primary',-- primary|social|promotions
  ADD COLUMN IF NOT EXISTS labels       jsonb,           -- flexible label/tag store
  ADD COLUMN IF NOT EXISTS is_read      boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_starred   boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_draft     boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_archived  boolean not null default false,
  ADD COLUMN IF NOT EXISTS is_encrypted boolean not null default false,
  ADD COLUMN IF NOT EXISTS thread_id    text,            -- Gmail/Nylas thread grouping
  ADD COLUMN IF NOT EXISTS in_reply_to  text,            -- message ID this replies to
  ADD COLUMN IF NOT EXISTS deal_id      uuid references public.deals(id) on delete set null,
  ADD COLUMN IF NOT EXISTS source       text default 'manual',  -- resend|nylas|manual
  ADD COLUMN IF NOT EXISTS received_at  timestamptz;     -- when email arrived (null for sent)

-- Unique index to prevent duplicate synced emails
CREATE UNIQUE INDEX IF NOT EXISTS emails_message_id_user_idx
  ON public.emails(user_id, message_id) WHERE message_id IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS emails_folder_idx     ON public.emails(user_id, folder);
CREATE INDEX IF NOT EXISTS emails_thread_idx     ON public.emails(user_id, thread_id);
CREATE INDEX IF NOT EXISTS emails_deal_id_idx    ON public.emails(deal_id);
CREATE INDEX IF NOT EXISTS emails_received_at_idx ON public.emails(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS emails_is_read_idx    ON public.emails(user_id, folder, is_read) WHERE is_read = false;

-- ═══════════════════════════════════════════════════════════════
-- 4. email_aliases — add alias and domain columns
--    Code: .eq('alias', fromAlias) and alias.domain
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.email_aliases
  ADD COLUMN IF NOT EXISTS alias  text,            -- alias name (e.g. 'support', 'sales')
  ADD COLUMN IF NOT EXISTS domain text;            -- domain (e.g. 'sovereigncmd.xyz')

CREATE INDEX IF NOT EXISTS email_aliases_alias_idx ON public.email_aliases(user_id, alias);

-- ═══════════════════════════════════════════════════════════════
-- 5. email_connections — add Nylas/sync columns
--    Code: provider, nylas_grant_id, email_address, sync_state, last_sync_at
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS provider       text,            -- gmail|outlook|imap (code uses 'provider' not 'email_provider')
  ADD COLUMN IF NOT EXISTS nylas_grant_id text,            -- Nylas v3 grant ID
  ADD COLUMN IF NOT EXISTS email_address  text,            -- connected email address
  ADD COLUMN IF NOT EXISTS sync_state     text default 'active',  -- active|paused|inactive
  ADD COLUMN IF NOT EXISTS last_sync_at   timestamptz;     -- last successful sync

-- Unique constraint for upsert: one connection per user per email address
CREATE UNIQUE INDEX IF NOT EXISTS email_connections_user_email_idx
  ON public.email_connections(user_id, email_address) WHERE email_address IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 6. email_rules — add priority column
--    Code: .order('priority', { ascending: false })
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.email_rules
  ADD COLUMN IF NOT EXISTS priority      integer not null default 0,  -- higher = applied first
  ADD COLUMN IF NOT EXISTS name          text,            -- human-readable rule name
  ADD COLUMN IF NOT EXISTS subject_pattern text,          -- subject line pattern match
  ADD COLUMN IF NOT EXISTS to_pattern    text,            -- recipient pattern match
  ADD COLUMN IF NOT EXISTS label         text,            -- label to apply
  ADD COLUMN IF NOT EXISTS auto_archive  boolean default false,
  ADD COLUMN IF NOT EXISTS auto_read     boolean default false;

CREATE INDEX IF NOT EXISTS email_rules_priority_idx ON public.email_rules(user_id, priority DESC);

-- ═══════════════════════════════════════════════════════════════
-- 7. RLS policies for new columns / tables
-- ═══════════════════════════════════════════════════════════════

-- email_connections: users can only see/manage their own connections
DROP POLICY IF EXISTS "email_connections_access" ON public.email_connections;
CREATE POLICY "email_connections_access" ON public.email_connections
  AS PERMISSIVE FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- email_aliases: users can only see/manage their own aliases
DROP POLICY IF EXISTS "email_aliases_access" ON public.email_aliases;
CREATE POLICY "email_aliases_access" ON public.email_aliases
  AS PERMISSIVE FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- email_rules: users can only see/manage their own rules
DROP POLICY IF EXISTS "email_rules_access" ON public.email_rules;
CREATE POLICY "email_rules_access" ON public.email_rules
  AS PERMISSIVE FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

SELECT pg_notify('pgrst', 'reload schema');
