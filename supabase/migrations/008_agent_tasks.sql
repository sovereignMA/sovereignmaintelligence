-- 008_agent_tasks.sql
-- Autonomous agent task queue: todo → in_progress → complete | failed

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text        NOT NULL,
  description    text,
  agent_type     text        NOT NULL DEFAULT 'general'
                   CHECK (agent_type IN ('research','outreach','analysis','pipeline','general')),
  status         text        NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo','in_progress','complete','failed')),
  priority       smallint    NOT NULL DEFAULT 3
                   CHECK (priority BETWEEN 1 AND 5),   -- 1 = highest
  input          jsonb,
  output         text,
  error          text,
  parent_task_id uuid        REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  created_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Indexes for the runner (picks highest priority todo first)
CREATE INDEX IF NOT EXISTS agent_tasks_status_priority_idx
  ON public.agent_tasks(status, priority ASC, created_at ASC);

-- RLS: admins only
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_agent_tasks" ON public.agent_tasks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
