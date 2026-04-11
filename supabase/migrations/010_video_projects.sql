-- 010_video_projects.sql
-- Persists generated video scripts so admins can return to previous projects

CREATE TABLE IF NOT EXISTS public.video_projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title       text        NOT NULL DEFAULT 'Untitled Video',
  template    text        NOT NULL DEFAULT 'product_demo',
  topic       text,
  context     text,
  format      text        NOT NULL DEFAULT '16:9',
  script      jsonb       NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TRIGGER video_projects_updated_at
  BEFORE UPDATE ON public.video_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS video_projects_user_updated_idx
  ON public.video_projects(user_id, updated_at DESC);

-- RLS: admins (and superadmins) can manage their own projects
ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_own_video_projects" ON public.video_projects
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('admin','superadmin')
    )
  );
