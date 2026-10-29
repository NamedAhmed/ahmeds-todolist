// send-push = sends the push notifications that are due.
//
// pg_cron calls public.run_push() every minute, which calls this function (only when something is due) with the
// shared secret in the `x-cron-secret` header. The function:
//   1. checks the secret (in constant time) and loads the VAPID keys (both live in public.push_config, readable only
//      with the service role),
//   2. claims the due rows of public.push_queue (claim_due_push marks them sent),
//   3. sends each one to every browser/phone the user turned notifications on for, but only to real push services,
//   4. forgets a browser the push service says is gone (404 / 410).

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// The only hosts a subscription may point at (the database refuses anything else too).
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//i;

// Compare two secrets without stopping at the first difference.
function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  const given = request.headers.get('x-cron-secret');
  if (!given) return new Response('forbidden', { status: 403 }); // no secret: no database work at all

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: config } = await admin.from('push_config').select('*').eq('id', 1).maybeSingle();
  if (!config || !same(given, config.cron_secret)) return new Response('forbidden', { status: 403 });
  webpush.setVapidDetails(config.subject, config.vapid_public, config.vapid_private);

  const { data: due, error } = await admin.rpc('claim_due_push');
  if (error) {
    console.error('claim_due_push failed', error.message);
    return new Response('error', { status: 500 });
  }

  let sent = 0;
  let removed = 0;
  for (const note of due ?? []) {
    const { data: subscriptions } = await admin.from('push_subscriptions').select('*').eq('user_id', note.user_id);
    const payload = JSON.stringify({ title: note.title, body: note.body, tag: note.key });

    await Promise.all(
      (subscriptions ?? []).map(async (subscription) => {
        if (!PUSH_HOST.test(subscription.endpoint)) {
          await admin.from('push_subscriptions').delete().eq('id', subscription.id); // not a push service: forget it
          removed++;
          return;
        }
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 60 * 60 });
          sent++;
        } catch (failure) {
          const status = (failure as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('id', subscription.id);
            removed++;
          }
        }
      }),
    );
  }

  return Response.json({ due: due?.length ?? 0, sent, removed });
});
