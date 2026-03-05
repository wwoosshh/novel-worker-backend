-- ─── Feedback Posts ──────────────────────────────────────────────────────────
create table if not exists public.feedback_posts (
  id         uuid default uuid_generate_v4() primary key,
  author_id  uuid references public.profiles(id) on delete cascade not null,
  title      varchar(200) not null,
  content    text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_feedback_posts_created on public.feedback_posts(created_at desc);

-- ─── Feedback Comments ──────────────────────────────────────────────────────
create table if not exists public.feedback_comments (
  id         uuid default uuid_generate_v4() primary key,
  post_id    uuid references public.feedback_posts(id) on delete cascade not null,
  author_id  uuid references public.profiles(id) on delete cascade not null,
  content    text not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_feedback_comments_post on public.feedback_comments(post_id, created_at asc);
