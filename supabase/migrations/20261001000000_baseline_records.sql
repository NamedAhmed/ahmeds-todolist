-- Baseline for the `records` table: what the live project already has, written down so the project can be rebuilt from
-- this folder. Every statement is safe to run on a project that already has it (it changes nothing there).
--
-- Each row is one item of the app (a task, a note...): (user_id, tbl, id) identifies it, `data` is the item, `deleted`
-- is a tombstone so a delete reaches the other devices, and `updated_at` is stamped by the server (never the phone's clock).
-- The columns and triggers added later (email, activity log) are in the migrations that follow this one.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

alter table public.records enable row level security;

-- Only the signed-in owner can see or change their own rows. Nobody else, and not anonymous visitors.
drop policy if exists "own rows select" on public.records;
create policy "own rows select" on public.records for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own rows insert" on public.records;
create policy "own rows insert" on public.records for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows update" on public.records;
create policy "own rows update" on public.records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own rows delete" on public.records;
create policy "own rows delete" on public.records for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The server stamps updated_at on every write.
create or replace function public.records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();
