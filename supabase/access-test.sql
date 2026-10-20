-- Run in SQL Editor after the migration. All fixtures roll back.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into public.projects(id,owner_id,title) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Test A'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Test B');
insert into public.notes(id,owner_id,project_id,title) values
 ('aaaaaaaa-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Note A'),
 ('bbbbbbbb-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Note B');
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare affected integer;
begin
 if (select count(*) from public.projects) <> 1 then raise exception 'Project isolation failed'; end if;
 if (select count(*) from public.notes) <> 1 then raise exception 'Note isolation failed'; end if;
 update public.notes set body='must not write' where id='bbbbbbbb-2222-4222-8222-222222222222';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Cross-user update succeeded'; end if;
 begin
  insert into public.notes(owner_id,title) values('22222222-2222-4222-8222-222222222222','forged');
  raise exception 'Owner forgery succeeded';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.notes(project_id,title) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','foreign project');
  raise exception 'Cross-owner project reference succeeded';
 exception when foreign_key_violation then null;
 end;
 update public.notes set body='first edit' where id='aaaaaaaa-1111-4111-8111-111111111111' and revision=1;
 update public.notes set body='stale edit' where id='aaaaaaaa-1111-4111-8111-111111111111' and revision=1;
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Stale edit was accepted'; end if;
 if (select body from public.notes where id='aaaaaaaa-1111-4111-8111-111111111111') <> 'first edit' then raise exception 'Text overwritten'; end if;
 update public.notes set deleted_at=now() where id='aaaaaaaa-1111-4111-8111-111111111111';
 update public.notes set deleted_at=null where id='aaaaaaaa-1111-4111-8111-111111111111';
 if not exists(select 1 from public.notes where id='aaaaaaaa-1111-4111-8111-111111111111' and deleted_at is null) then raise exception 'Restore failed'; end if;
end $$;
reset role;
rollback;
