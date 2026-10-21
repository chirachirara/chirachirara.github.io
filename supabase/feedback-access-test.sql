-- Transactional fixtures only; no real reports are changed.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into public.feedback(owner_id,kind,message) values
 ('22222222-2222-4222-8222-222222222222','idea','Other user report');
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
 if (select count(*) from public.feedback) <> 0 then raise exception 'Cross-user read'; end if;
 insert into public.feedback(kind,message) values('problem','Own test report');
 if (select count(*) from public.feedback) <> 1 then raise exception 'Own insert/read failed'; end if;
 begin
  insert into public.feedback(owner_id,kind,message) values('22222222-2222-4222-8222-222222222222','idea','Forged report owner');
  raise exception 'Owner forgery accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.feedback(kind,message,status) values('idea','Attempt to set status','done');
  raise exception 'Client status accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  update public.feedback set status='done';
  raise exception 'Client status update accepted';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.feedback(kind,message) values('idea','short');
  raise exception 'Invalid message accepted';
 exception when check_violation then null;
 end;
end $$;
reset role;
rollback;
