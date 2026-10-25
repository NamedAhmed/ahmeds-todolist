-- One tiny row per user per day: how many times each kind of thing happened, e.g. {"tasks:added": 3, "tasks:finished": 2}.
-- Only the trigger below writes to it, so it can't be faked and costs almost no storage.
create table if not exists public.activity_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  email text,
  counts jsonb not null default '{}'::jsonb,
  primary key (user_id, day)
);
alter table public.activity_daily enable row level security;
create policy "read own activity" on public.activity_daily for select using ((select auth.uid()) = user_id);

create or replace function public.records_log_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  k text;
begin
  if tg_op = 'INSERT' then
    k := new.tbl || ':added';
  elsif new.deleted and not old.deleted then
    k := new.tbl || ':deleted';
  elsif new.tbl = 'tasks'
        and coalesce(new.data ->> 'done', 'false') = 'true'
        and coalesce(old.data ->> 'done', 'false') <> 'true' then
    k := 'tasks:finished';
  else
    k := new.tbl || ':edited';
  end if;

  insert into public.activity_daily as a (user_id, email, day, counts)
  values (new.user_id, new.email, current_date, jsonb_build_object(k, 1))
  on conflict (user_id, day) do update
    set counts = jsonb_set(a.counts, array[k], to_jsonb(coalesce((a.counts ->> k)::int, 0) + 1)),
        email = coalesce(excluded.email, a.email);
  return null;
end $$;
revoke execute on function public.records_log_activity() from public, anon, authenticated;

drop trigger if exists records_b_log_activity on public.records;
create trigger records_b_log_activity after insert or update on public.records
  for each row execute function public.records_log_activity();
