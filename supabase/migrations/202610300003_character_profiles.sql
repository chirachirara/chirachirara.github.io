begin;
alter table public.notes add column character_profile jsonb not null default '{}'::jsonb
  check (jsonb_typeof(character_profile) = 'object' and octet_length(character_profile::text) <= 200000);
comment on column public.notes.character_profile is 'Необязательная анкета персонажа для этой версии истории. Описание остаётся в body.';
commit;
