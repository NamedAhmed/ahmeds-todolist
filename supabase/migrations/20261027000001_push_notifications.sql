-- Push notifications.
--
--   push_subscriptions  one row per browser/phone that turned notifications on (its Web Push address and keys)
--   push_queue          the notifications to send and when. The app writes the next weeks of them (it knows the
--                       repeat rules and the user's time zone); the server only sends what is due.
--   push_config         the server's own secrets (the VAPID key pair and a shared secret). RLS is on with no
--                       policies, so only the service role (the edge function) can read it. The row is inserted by
--                       hand, never from a migration, so the keys never end up in git.
--
-- Every minute pg_cron calls run_push(), which wakes the `send-push` edge function when something is due.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.push_queue (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,                 -- e.g. "task:<id>:<fire_at>": the same notification always has the same key
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  batch text not null default '',    -- which sync wrote it: rows of an older batch that were never sent are removed
  sent boolean not null default false,
  primary key (user_id, key)
);
create index if not exists push_queue_due on public.push_queue (fire_at) where not sent;
alter table public.push_queue enable row level security;
create policy "own queue" on public.push_queue
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text not null,
  vapid_private text not null,
  subject text not null default 'mailto:admin@example.com',
  cron_secret text not null
);
alter table public.push_config enable row level security;

-- The app needs the public half of the key to subscribe.
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select vapid_public from public.push_config where id = 1
$$;
grant execute on function public.push_public_key() to authenticated;
revoke execute on function public.push_public_key() from anon, public;

-- Mark what is due as sent and return it (so two overlapping runs never send the same one twice).
-- Anything more than a day late is dropped instead of sent: an old reminder arriving now is just noise.
create or replace function public.claim_due_push() returns setof public.push_queue
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_queue where fire_at < now() - interval '1 day';
  return query
    update public.push_queue set sent = true
    where not sent and fire_at <= now()
    returning *;
end $$;
revoke execute on function public.claim_due_push() from public, anon, authenticated;

-- Called by pg_cron every minute: wake the edge function only when something is due.
create or replace function public.run_push() returns void
language plpgsql security definer set search_path = '' as $$
declare
  secret text;
begin
  if not exists (select 1 from public.push_queue where not sent and fire_at <= now()) then
    return;
  end if;
  select cron_secret into secret from public.push_config where id = 1;
  if secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://yjmdjpzowfxieobwenlx.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb
  );
end $$;
revoke execute on function public.run_push() from public, anon, authenticated;

select cron.schedule('send-push', '* * * * *', 'select public.run_push()');
