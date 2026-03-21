-- ═══════════════════════════════════════════════════════════════
-- PROJECT SOVEREIGN — Full Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Project: kicdjdxxdqtmetphipnn
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── USER PROFILES ──────────────────────────────────────────────
create table if not exists public.user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  full_name     text,
  email         text,
  role          text default 'viewer',   -- viewer | analyst | admin | superadmin
  onboarded     boolean default false,
  last_seen_at  timestamptz
);

-- ── ADMIN USERS ────────────────────────────────────────────────
create table if not exists public.admin_users (
  id            uuid default gen_random_uuid() primary key,
  created_at    timestamptz default now(),
  user_id       uuid references auth.users(id) on delete cascade unique,
  email         text not null,
  full_name     text,
  role          text default 'admin',    -- admin | superadmin
  is_active     boolean default true,
  last_seen_at  timestamptz
);

-- ── DEALS ──────────────────────────────────────────────────────
create table if not exists public.deals (
  id                uuid default gen_random_uuid() primary key,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  company_name      text not null,
  sector            text,
  sic_code          text,
  stage             text default 'sourcing',  -- sourcing|approach|loi|due_diligence|spa|exchanged|completed|dead
  ebitda_gbp        numeric,
  arr_gbp           numeric,
  rec_revenue_pct   numeric,
  deal_value_gbp    numeric,
  score             integer default 75,
  seller_signal     text,
  nmd_structure     text,
  deferred_pct      integer,
  notes             text,
  deal_events       jsonb default '[]',
  assigned_agent    text,
  next_action       text,
  next_action_date  date
);

-- ── CONTACTS ───────────────────────────────────────────────────
create table if not exists public.contacts (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  deal_id     uuid references public.deals(id) on delete set null,
  full_name   text,
  email       text,
  phone       text,
  role        text,
  company     text,
  linkedin    text,
  notes       text,
  last_contact_at timestamptz
);

-- ── CONVERSATIONS ──────────────────────────────────────────────
create table if not exists public.conversations (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  deal_id     uuid references public.deals(id) on delete set null,
  agent       text,
  title       text,
  summary     text,
  messages    jsonb default '[]',
  token_count integer default 0
);

-- ── DOCUMENTS (Vault) ──────────────────────────────────────────
create table if not exists public.documents (
  id                uuid default gen_random_uuid() primary key,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  deal_id           uuid references public.deals(id) on delete set null,
  title             text,
  doc_type          text,
  content           text,
  encrypted_content text,
  is_encrypted      boolean default false,
  file_size_bytes   integer,
  mime_type         text
);

-- ── LEGAL DOCUMENTS ────────────────────────────────────────────
create table if not exists public.legal_documents (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  doc_type    text unique not null,   -- privacy_policy | terms_of_service | cookie_policy | etc.
  title       text,
  content     text,
  version     text default '1.0',
  is_current  boolean default true
);

-- ── WORKFLOWS ──────────────────────────────────────────────────
create table if not exists public.workflows (
  id              uuid default gen_random_uuid() primary key,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  name            text not null,
  description     text,
  trigger_type    text default 'manual',  -- manual | schedule | event | ai_signal | webhook
  assigned_agent  text,
  steps           jsonb default '[]',
  is_active       boolean default true,
  run_count       integer default 0,
  success_count   integer default 0,
  fail_count      integer default 0,
  last_run_at     timestamptz
);

-- ── AUDIT TRAIL ────────────────────────────────────────────────
create table if not exists public.audit_trail (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  user_id     uuid references auth.users(id) on delete set null,
  entity_type text,
  entity_id   text,
  action      text,
  actor_id    text,
  event       text,
  agent       text,
  details     text,
  status      text default 'ok',
  metadata    jsonb
);

-- ── COMPANY INTEL ──────────────────────────────────────────────
create table if not exists public.company_intel (
  id                uuid default gen_random_uuid() primary key,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  user_id           uuid references auth.users(id) on delete set null,
  deal_id           uuid references public.deals(id) on delete cascade unique,
  company_name      text,
  acquisition_score integer,
  data              jsonb
);

-- ── SCRAPE QUEUE ───────────────────────────────────────────────
create table if not exists public.scrape_queue (
  id            uuid default gen_random_uuid() primary key,
  created_at    timestamptz default now(),
  deal_id       uuid references public.deals(id) on delete cascade,
  company_name  text not null,
  website_url   text,
  requested_by  uuid references auth.users(id) on delete set null,
  status        text default 'pending',   -- pending | processing | done | error
  error_message text,
  completed_at  timestamptz
);

-- ── PHONE CALLS / SMS ──────────────────────────────────────────
create table if not exists public.phone_calls (
  id               uuid default gen_random_uuid() primary key,
  created_at       timestamptz default now(),
  user_id          uuid references auth.users(id) on delete set null,
  agent_name       text,
  call_type        text,   -- call | sms | whatsapp
  to_number        text,
  purpose          text,
  body             text,
  twilio_sid       text,
  status           text default 'queued',
  duration_seconds integer
);

-- ── OUTREACH LOG ───────────────────────────────────────────────
create table if not exists public.outreach_log (
  id             uuid default gen_random_uuid() primary key,
  created_at     timestamptz default now(),
  user_id        uuid references auth.users(id) on delete set null,
  contact_id     uuid references public.contacts(id) on delete set null,
  deal_id        uuid references public.deals(id) on delete set null,
  channel        text,        -- email | sms | call | linkedin | whatsapp
  direction      text,        -- outbound | inbound
  subject        text,
  body           text,
  status         text,
  consent_given  boolean default false
);

-- ── AI PATTERNS (S21 Archivist) ────────────────────────────────
create table if not exists public.ai_patterns (
  id            uuid default gen_random_uuid() primary key,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  pattern_type  text,
  title         text,
  description   text,
  success_rate  numeric default 0,
  usage_count   integer default 0,
  data          jsonb
);

-- ── ANALYTICS EVENTS ───────────────────────────────────────────
create table if not exists public.analytics_events (
  id            uuid default gen_random_uuid() primary key,
  created_at    timestamptz default now(),
  user_id       uuid references auth.users(id) on delete set null,
  session_id    text,
  event_name    text not null,
  event_cat     text default 'general',
  page          text,
  props         jsonb,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  referrer      text,
  device_type   text,
  user_agent    text
);

-- ── AD TRACKING ────────────────────────────────────────────────
create table if not exists public.ad_tracking (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  user_id     uuid references auth.users(id) on delete set null,
  session_id  text,
  pixel_name  text,
  pixel_type  text,
  event_name  text,
  props       jsonb,
  conversion  boolean default false
);

-- ── COMPLIANCE LOG ─────────────────────────────────────────────
create table if not exists public.compliance_log (
  id           uuid default gen_random_uuid() primary key,
  created_at   timestamptz default now(),
  user_id      uuid references auth.users(id) on delete set null,
  framework    text,   -- UK_GDPR | FCA | ICO | AML | KYC | PECR | Companies_Act
  event_type   text,
  description  text,
  lawful_basis text,
  status       text default 'compliant'   -- compliant | review | breach
);

-- ── SYSTEM METRICS ─────────────────────────────────────────────
create table if not exists public.system_metrics (
  id           uuid default gen_random_uuid() primary key,
  created_at   timestamptz default now(),
  metric_name  text,
  metric_value numeric,
  metric_unit  text,
  tags         jsonb
);

-- ── PENTEST RESULTS ────────────────────────────────────────────
create table if not exists public.pentest_results (
  id              uuid default gen_random_uuid() primary key,
  created_at      timestamptz default now(),
  test_type       text,
  severity        text,   -- critical | high | medium | low | info
  description     text,
  vector          text,
  status          text default 'open',
  remediated_at   timestamptz
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════

alter table public.user_profiles    enable row level security;
alter table public.admin_users      enable row level security;
alter table public.deals            enable row level security;
alter table public.contacts         enable row level security;
alter table public.conversations    enable row level security;
alter table public.documents        enable row level security;
alter table public.legal_documents  enable row level security;
alter table public.workflows        enable row level security;
alter table public.audit_trail      enable row level security;
alter table public.company_intel    enable row level security;
alter table public.scrape_queue     enable row level security;
alter table public.phone_calls      enable row level security;
alter table public.outreach_log     enable row level security;
alter table public.ai_patterns      enable row level security;
alter table public.analytics_events enable row level security;
alter table public.ad_tracking      enable row level security;
alter table public.compliance_log   enable row level security;
alter table public.system_metrics   enable row level security;
alter table public.pentest_results  enable row level security;

-- ── RLS POLICIES ───────────────────────────────────────────────

-- user_profiles: own row only
create policy "users_own_profile" on public.user_profiles
  using (id = auth.uid()) with check (id = auth.uid());

-- admin_users: admins can read all; only superadmin via service role writes
create policy "admins_read_admin_users" on public.admin_users
  for select using (auth.uid() is not null);

-- deals: user owns their deals
create policy "users_own_deals" on public.deals
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- contacts: user owns their contacts
create policy "users_own_contacts" on public.contacts
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- conversations: user owns their conversations
create policy "users_own_conversations" on public.conversations
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- documents: user owns their documents
create policy "users_own_documents" on public.documents
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- legal_documents: everyone can read (public)
create policy "legal_docs_public_read" on public.legal_documents
  for select using (true);

-- workflows: user owns their workflows
create policy "users_own_workflows" on public.workflows
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_trail: authenticated users can insert; read own events
create policy "audit_insert" on public.audit_trail
  for insert with check (auth.uid() is not null);
create policy "audit_read_own" on public.audit_trail
  for select using (user_id = auth.uid() or user_id is null);

-- company_intel: authenticated users
create policy "intel_auth_read" on public.company_intel
  for select using (auth.uid() is not null);
create policy "intel_auth_write" on public.company_intel
  for all with check (auth.uid() is not null);

-- scrape_queue: authenticated users
create policy "scrape_queue_auth" on public.scrape_queue
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- phone_calls: authenticated read
create policy "calls_auth_read" on public.phone_calls
  for select using (auth.uid() is not null);
create policy "calls_auth_insert" on public.phone_calls
  for insert with check (auth.uid() is not null);

-- outreach_log: user owns their outreach
create policy "outreach_own" on public.outreach_log
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ai_patterns: all authenticated users can read; service role writes
create policy "patterns_auth_read" on public.ai_patterns
  for select using (auth.uid() is not null);

-- analytics_events: insert for anyone; read own
create policy "analytics_insert" on public.analytics_events
  for insert with check (true);
create policy "analytics_read_own" on public.analytics_events
  for select using (user_id = auth.uid() or user_id is null);

-- ad_tracking: insert for anyone; read own
create policy "ad_tracking_insert" on public.ad_tracking
  for insert with check (true);
create policy "ad_tracking_read_own" on public.ad_tracking
  for select using (user_id = auth.uid() or user_id is null);

-- compliance_log: authenticated users
create policy "compliance_auth_read" on public.compliance_log
  for select using (auth.uid() is not null);
create policy "compliance_auth_insert" on public.compliance_log
  for insert with check (auth.uid() is not null);

-- system_metrics: authenticated read; service role writes
create policy "metrics_auth_read" on public.system_metrics
  for select using (auth.uid() is not null);

-- pentest_results: authenticated read
create policy "pentest_auth_read" on public.pentest_results
  for select using (auth.uid() is not null);
create policy "pentest_auth_insert" on public.pentest_results
  for insert with check (auth.uid() is not null);

-- ═══════════════════════════════════════════════════════════════
-- INDEXES (performance)
-- ═══════════════════════════════════════════════════════════════

create index if not exists deals_user_id_idx        on public.deals(user_id);
create index if not exists deals_stage_idx          on public.deals(stage);
create index if not exists contacts_deal_id_idx     on public.contacts(deal_id);
create index if not exists contacts_user_id_idx     on public.contacts(user_id);
create index if not exists conversations_user_idx   on public.conversations(user_id);
create index if not exists audit_trail_created_idx  on public.audit_trail(created_at desc);
create index if not exists analytics_events_name_idx on public.analytics_events(event_name);
create index if not exists analytics_events_page_idx on public.analytics_events(page);
create index if not exists analytics_session_idx    on public.analytics_events(session_id);
create index if not exists ad_tracking_session_idx  on public.ad_tracking(session_id);
create index if not exists company_intel_deal_idx   on public.company_intel(deal_id);
create index if not exists scrape_queue_status_idx  on public.scrape_queue(status);
create index if not exists compliance_framework_idx on public.compliance_log(framework);

-- ═══════════════════════════════════════════════════════════════
-- AUTO-UPDATED updated_at TRIGGER
-- ═══════════════════════════════════════════════════════════════

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$ declare t text; begin
  foreach t in array array[
    'deals','contacts','conversations','documents',
    'legal_documents','workflows','company_intel','user_profiles','ai_patterns'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t
    );
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ═══════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- SEED: Legal document placeholders (populated via admin panel)
-- ═══════════════════════════════════════════════════════════════

insert into public.legal_documents (doc_type, title, content, is_current) values
  ('privacy_policy',           'Privacy Policy',            'Document pending — add via Supabase admin or legal.html.', true),
  ('terms_of_service',         'Terms of Service',          'Document pending — add via Supabase admin or legal.html.', true),
  ('cookie_policy',            'Cookie Policy',             'Document pending — add via Supabase admin or legal.html.', true),
  ('acceptable_use',           'Acceptable Use Policy',     'Document pending — add via Supabase admin or legal.html.', true),
  ('disclaimer',               'Disclaimer',                'Document pending — add via Supabase admin or legal.html.', true),
  ('nda',                      'NDA Template',              'Document pending — add via Supabase admin or legal.html.', true),
  ('aml_policy',               'AML Policy',                'Document pending — add via Supabase admin or legal.html.', true),
  ('kyc_policy',               'KYC Policy',                'Document pending — add via Supabase admin or legal.html.', true),
  ('data_processing_agreement','Data Processing Agreement', 'Document pending — add via Supabase admin or legal.html.', true)
on conflict (doc_type) do nothing;

-- ═══════════════════════════════════════════════════════════════
-- DONE — run in Supabase: Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════
