-- The account's email next to user_id. The server fills it in, so a client can't fake it.
alter table public.records add column if not exists email text;

create or replace function public.records_set_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select u.email into new.email from auth.users u where u.id = new.user_id;
  return new;
end $$;
revoke execute on function public.records_set_email() from public, anon, authenticated;

drop trigger if exists records_a_set_email on public.records;
create trigger records_a_set_email before insert or update on public.records
  for each row execute function public.records_set_email();

-- Fill in the rows that already exist.
update public.records r set email = u.email from auth.users u where u.id = r.user_id;

-- Realtime: clients are told when a row changes (RLS still applies, so you only hear about your own rows).
alter publication supabase_realtime add table public.records;
