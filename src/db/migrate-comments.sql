-- 댓글 테이블
CREATE TABLE IF NOT EXISTS public.comments (
  id           uuid default uuid_generate_v4() primary key,
  chapter_id   uuid references public.chapters(id) on delete cascade not null,
  author_id    uuid references public.profiles(id) on delete cascade not null,
  content      text not null,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

CREATE INDEX IF NOT EXISTS idx_comments_chapter ON public.comments(chapter_id);

-- 알림 설정 컬럼
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_settings jsonb
  DEFAULT '{"new_chapter":true,"comments":true,"announcements":true,"marketing":false}';

-- RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY "comments_insert" ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "comments_delete" ON public.comments;
CREATE POLICY "comments_delete" ON public.comments FOR DELETE
  USING (auth.uid() = author_id);
