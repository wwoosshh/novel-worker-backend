-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Profiles (extends Supabase Auth) ─────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  username     text unique not null,
  display_name text,
  bio          text,
  avatar_url   text,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

-- ─── Novels ───────────────────────────────────────────────────────────────────
create table if not exists public.novels (
  id            uuid default uuid_generate_v4() primary key,
  author_id     uuid references public.profiles(id) on delete cascade not null,
  title         text not null,
  synopsis      text,
  cover_url     text,
  genre         text not null,
  tags          text[] default '{}',
  status        text default 'ongoing' check (status in ('ongoing', 'completed', 'hiatus')),
  is_public     boolean default true,
  view_count    integer default 0,
  chapter_count integer default 0,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- ─── Chapters ─────────────────────────────────────────────────────────────────
create table if not exists public.chapters (
  id           uuid default uuid_generate_v4() primary key,
  novel_id     uuid references public.novels(id) on delete cascade not null,
  number       integer not null,
  title        text not null,
  content      jsonb not null default '{}',
  content_text text,
  is_public    boolean default false,
  is_paid      boolean default false,
  view_count   integer default 0,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null,
  unique(novel_id, number)
);

-- ─── Settings DB ──────────────────────────────────────────────────────────────
create table if not exists public.db_characters (
  id         uuid default uuid_generate_v4() primary key,
  novel_id   uuid references public.novels(id) on delete cascade not null,
  name       text not null,
  fields     jsonb default '{}',
  created_at timestamptz default now() not null
);

create table if not exists public.db_locations (
  id         uuid default uuid_generate_v4() primary key,
  novel_id   uuid references public.novels(id) on delete cascade not null,
  name       text not null,
  fields     jsonb default '{}',
  created_at timestamptz default now() not null
);

create table if not exists public.db_factions (
  id         uuid default uuid_generate_v4() primary key,
  novel_id   uuid references public.novels(id) on delete cascade not null,
  name       text not null,
  fields     jsonb default '{}',
  created_at timestamptz default now() not null
);

create table if not exists public.db_items (
  id         uuid default uuid_generate_v4() primary key,
  novel_id   uuid references public.novels(id) on delete cascade not null,
  name       text not null,
  fields     jsonb default '{}',
  created_at timestamptz default now() not null
);

-- ─── Macros ───────────────────────────────────────────────────────────────────
create table if not exists public.macros (
  id         uuid default uuid_generate_v4() primary key,
  novel_id   uuid references public.novels(id) on delete cascade not null,
  label      text not null,
  content    text not null,
  shortcut   text,
  created_at timestamptz default now() not null
);

-- ─── Notices (per-novel announcements) ───────────────────────────────────────
create table if not exists public.notices (
  id         uuid default uuid_generate_v4() primary key,
  novel_id   uuid references public.novels(id) on delete cascade not null,
  title      text not null,
  content    text not null,
  is_pinned  boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ─── Subscriptions ────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id    uuid references public.profiles(id) on delete cascade,
  novel_id   uuid references public.novels(id)   on delete cascade,
  created_at timestamptz default now() not null,
  primary key (user_id, novel_id)
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.novels         enable row level security;
alter table public.chapters       enable row level security;
alter table public.db_characters  enable row level security;
alter table public.db_locations   enable row level security;
alter table public.db_factions    enable row level security;
alter table public.db_items       enable row level security;
alter table public.macros         enable row level security;
alter table public.notices         enable row level security;
alter table public.subscriptions  enable row level security;

-- profiles
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read"  on public.profiles for select using (true);
drop policy if exists "profiles_owner_write" on public.profiles;
create policy "profiles_owner_write"  on public.profiles for all    using (auth.uid() = id);

-- novels
drop policy if exists "novels_public_read" on public.novels;
create policy "novels_public_read"    on public.novels for select
  using (is_public = true or auth.uid() = author_id);
drop policy if exists "novels_author_write" on public.novels;
create policy "novels_author_write"   on public.novels for all
  using (auth.uid() = author_id);

-- chapters
drop policy if exists "chapters_public_read" on public.chapters;
create policy "chapters_public_read"  on public.chapters for select
  using (is_public = true or auth.uid() = (select author_id from public.novels where id = novel_id));
drop policy if exists "chapters_author_write" on public.chapters;
create policy "chapters_author_write" on public.chapters for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));

-- settings tables (author only)
drop policy if exists "db_chars_author" on public.db_characters;
create policy "db_chars_author"   on public.db_characters for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));
drop policy if exists "db_locs_author" on public.db_locations;
create policy "db_locs_author"    on public.db_locations  for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));
drop policy if exists "db_facs_author" on public.db_factions;
create policy "db_facs_author"    on public.db_factions   for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));
drop policy if exists "db_items_author" on public.db_items;
create policy "db_items_author"   on public.db_items      for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));
drop policy if exists "macros_author" on public.macros;
create policy "macros_author"     on public.macros        for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));

-- notices (public read, author write)
drop policy if exists "notices_public_read" on public.notices;
create policy "notices_public_read" on public.notices for select using (true);
drop policy if exists "notices_author_write" on public.notices;
create policy "notices_author_write" on public.notices for all
  using (auth.uid() = (select author_id from public.novels where id = novel_id));

-- subscriptions
drop policy if exists "subs_own" on public.subscriptions;
create policy "subs_own"          on public.subscriptions for all
  using (auth.uid() = user_id);

-- ─── Trigger: auto-create profile on signup ───────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username',     split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists novels_author_id_idx   on public.novels(author_id);
create index if not exists novels_genre_idx        on public.novels(genre);
create index if not exists novels_status_idx       on public.novels(status);
create index if not exists novels_view_count_idx   on public.novels(view_count desc);
create index if not exists novels_updated_at_idx   on public.novels(updated_at desc);
create index if not exists chapters_novel_id_idx   on public.chapters(novel_id);
create index if not exists chapters_number_idx     on public.chapters(novel_id, number);
create index if not exists db_chars_novel_idx      on public.db_characters(novel_id);
create index if not exists db_locs_novel_idx       on public.db_locations(novel_id);
create index if not exists db_facs_novel_idx       on public.db_factions(novel_id);
create index if not exists db_items_novel_idx      on public.db_items(novel_id);
create index if not exists notices_novel_idx       on public.notices(novel_id);
