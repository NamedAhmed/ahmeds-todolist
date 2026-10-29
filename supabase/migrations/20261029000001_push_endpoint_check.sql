-- A push subscription's address is where the server will POST to, so it must be a real push service and nothing else.
-- (Without this any signed-in user could point the server at any URL.)
-- Chrome/Android: fcm.googleapis.com · Firefox: updates.push.services.mozilla.com · Safari/iOS: *.push.apple.com ·
-- Edge/Windows: *.notify.windows.com
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host check (
    endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'
  );
