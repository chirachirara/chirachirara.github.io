begin;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 150),
  summary text not null default '',
  manuscript text not null default '',
  publication_url text not null default '' check (publication_url = '' or publication_url ~ '^https?://'),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null check (length(trim(title)) between 1 and 150),
  body text not null default '',
  tags text[] not null default '{}',
  images text[] not null default '{}',
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array'),
  comments jsonb not null default '[]' check (jsonb_typeof(comments) = 'array'),
  favorite boolean not null default false,
  deleted_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id)
);

create index projects_owner_idx on public.projects(owner_id);
create index notes_owner_updated_idx on public.notes(owner_id, updated_at desc);
create index notes_project_idx on public.notes(project_id);

-- Optimistic revision checks in the client prevent stale edits overwriting newer text.
create function public.touch_record() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;
create trigger projects_updated before update on public.projects for each row execute function public.touch_record();
create trigger notes_updated before update on public.notes for each row execute function public.touch_record();

alter table public.projects enable row level security;
alter table public.notes enable row level security;

create policy projects_own on public.projects for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy notes_own on public.notes for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

revoke all on public.projects, public.notes from anon;
grant select, insert, update, delete on public.projects, public.notes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('references', 'references', false, 5242880, array['image/jpeg','image/png','image/webp']);

create policy references_read on storage.objects for select to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy references_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy references_delete on storage.objects for delete to authenticated
  using (bucket_id = 'references' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
