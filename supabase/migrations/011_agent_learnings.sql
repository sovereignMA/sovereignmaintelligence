-- 011_agent_learnings.sql
-- Cross-agent memory layer: stores extracted patterns and learnings from task outcomes.
-- Written by: self-improve cron (weekly pattern extraction)
-- Read by:    agent-runner (context injection before each task)

CREATE TABLE IF NOT EXISTS public.agent_learnings (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type   text        NOT NULL
                 CHECK (agent_type IN ('research','outreach','analysis','pipeline','general')),
  pattern_key  text        NOT NULL,
  -- Human-readable insight injected into agent system prompts
  outcome      text        NOT NULL,
  -- Wilson-dampened confidence: sample_size / (sample_size + 5) * raw_success_rate
  -- Range 0–1. Low n is penalised; high n converges toward raw rate.
  confidence   numeric     NOT NULL DEFAULT 0
                 CHECK (confidence >= 0 AND confidence <= 1),
  sample_size  integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT agent_learnings_type_key UNIQUE (agent_type, pattern_key)
);

CREATE TRIGGER agent_learnings_updated_at
  BEFORE UPDATE ON public.agent_learnings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index optimised for the runner's query: type + confidence DESC LIMIT 5
CREATE INDEX IF NOT EXISTS agent_learnings_type_conf_idx
  ON public.agent_learnings(agent_type, confidence DESC);

-- RLS: admin/superadmin only (mirrors agent_tasks policy pattern)
ALTER TABLE public.agent_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_agent_learnings" ON public.agent_learnings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  );
