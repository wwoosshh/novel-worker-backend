-- Missing indexes for subscriptions and chapters queries
create index if not exists subs_novel_id_idx   on public.subscriptions(novel_id);
create index if not exists subs_user_id_idx    on public.subscriptions(user_id);
create index if not exists chapters_public_idx on public.chapters(novel_id, is_public);
create index if not exists macros_novel_idx    on public.macros(novel_id);
