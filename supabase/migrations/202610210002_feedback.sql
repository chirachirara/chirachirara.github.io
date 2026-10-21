begin;
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('problem', 'idea')),
  message text not null check (char_length(trim(message)) between 10 and 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);
create index feedback_created_idx on public.feedback(created_at desc);
alter table public.feedback enable row level security;
create policy feedback_insert_own on public.feedback for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy feedback_read_own on public.feedback for select to authenticated
  using ((select auth.uid()) = owner_id);
revoke all on public.feedback from anon, authenticated;
grant select on public.feedback to authenticated;
grant insert (id, owner_id, kind, message) on public.feedback to authenticated;
comment on table public.feedback is 'Проблемы и предложения пользователей. Статус меняет администратор через Supabase.';
commit;
