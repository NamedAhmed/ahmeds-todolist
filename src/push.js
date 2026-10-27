// push.js = push notifications (the server half is supabase/functions/send-push).
//
// How it works:
//   - Turning notifications on asks the browser for permission and subscribes this device to Web Push; the
//     subscription (an address plus keys) is saved in the `push_subscriptions` table.
//   - This file works out WHEN to notify: every task with a due time, every reminder with a time, and (if you chose
//     a time for them) the tasks and reminders that only have a day. The next 30 days of them are written to the
//     `push_queue` table, and are rewritten whenever your tasks or reminders change. The app does this because it
//     knows the repeat rules and your time zone; the server only sends what is due, every minute.
//   - The service worker (public/push-sw.js) shows the notification, even when the app is closed.
//   On an iPhone the app must be added to the Home Screen first. Sign in is needed (the server has to know it is you).

import { all, getState, subscribe } from './store.js';
import { supabase } from './sync.js';
import { addDays, formatTime, isDone, reminderOccursOn, todayStr } from './lib.js';

const FLAG = 'todolist:push'; // is push switched on for THIS device?
const DAYS_AHEAD = 30;

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushEnabled = () => {
  try {
    return localStorage.getItem(FLAG) === '1' && pushSupported() && Notification.permission === 'granted';
  } catch {
    return false;
  }
};

// "BDk..." (URL-safe text) -> the bytes the browser wants.
function keyBytes(text) {
  const padded = (text + '='.repeat((4 - (text.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function signedIn() {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

// ---- Turning it on and off ----

// Ask permission, subscribe this device and save the subscription. Returns '' on success, else a message to show.
export async function enablePush() {
  if (!supabase) return 'Sync is off in this copy, so push can not work.';
  if (!pushSupported()) return 'This browser can not do push notifications. On an iPhone, add the app to the Home Screen first.';
  if (!(await signedIn())) return 'Sign in first (the Account button): the server has to know it is you.';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'Notifications are blocked. Allow them for this site in the browser settings.';

  const { data: publicKey, error: keyError } = await supabase.rpc('push_public_key');
  if (keyError || !publicKey) return 'The server is not set up for push yet.';

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));

  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });
  if (error) return error.message;

  localStorage.setItem(FLAG, '1');
  await syncQueue();
  return '';
}

export async function disablePush() {
  localStorage.setItem(FLAG, '0');
  const registration = await navigator.serviceWorker?.ready;
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await supabase?.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
  await supabase?.from('push_queue').delete().eq('sent', false); // nothing more to send
}

// ---- Working out what to send, and when ----

// A date ("2026-10-25") and a time ("17:00") in THIS device's time zone, as a Date.
function at(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hour, minute);
}

// Every notification due in the next DAYS_AHEAD days: [{ key, fire_at, title, body }].
// `defaultTime` ('09:00', or '' for none) is used for tasks and reminders that have a day but no time.
export function buildSchedule(state, defaultTime, now = new Date()) {
  const today = todayStr();
  const last = addDays(today, DAYS_AHEAD);
  const notes = [];
  const add = (kind, id, when, title, body) => {
    if (when > now) notes.push({ key: `${kind}:${id}:${when.toISOString()}`, fire_at: when.toISOString(), title, body });
  };

  for (const task of all(state, 'tasks')) {
    if (task.done || !task.due || task.due > last) continue;
    const time = task.due_time || defaultTime;
    if (time) add('task', task.id, at(task.due, time), task.title, task.due_time ? `Due at ${formatTime(task.due_time)}` : 'Due today');
  }

  for (const reminder of all(state, 'reminders')) {
    const time = reminder.time || defaultTime;
    if (!time) continue;
    for (let day = today; day <= last; day = addDays(day, 1)) {
      if (reminderOccursOn(reminder, day, today) && !isDone(state, reminder.id, day)) {
        add('reminder', reminder.id, at(day, time), reminder.title, reminder.time ? `Reminder for ${formatTime(reminder.time)}` : 'Reminder for today');
      }
    }
  }
  return notes;
}

// Write the schedule to the server. Rows of an older write that were never sent are removed (a task that was
// finished, moved or deleted stops notifying), rows already sent are left alone so nothing is sent twice.
let syncing = false;
export async function syncQueue() {
  if (!supabase || !pushEnabled() || syncing || !(await signedIn())) return;
  syncing = true;
  try {
    const defaultTime = getState().settings.appearance?.pushDefaultTime ?? '09:00';
    const batch = crypto.randomUUID();
    const rows = buildSchedule(getState(), defaultTime).map((note) => ({ ...note, batch }));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await supabase.from('push_queue').upsert(rows.slice(i, i + 400), { onConflict: 'user_id,key' });
      if (error) throw error;
    }
    await supabase.from('push_queue').delete().eq('sent', false).neq('batch', batch);
  } catch (error) {
    console.warn('push schedule not saved:', error.message ?? error);
  } finally {
    syncing = false;
  }
}

// A notification right now, to see that it all works.
export async function sendTestPush() {
  if (!pushEnabled()) return 'Turn notifications on first.';
  const { error } = await supabase.from('push_queue').upsert({ key: `test:${Date.now()}`, fire_at: new Date().toISOString(), title: 'Todolist', body: 'It works. Now go do something.' });
  return error ? error.message : '';
}

// Call once at start: keep the schedule up to date while the app is open.
let timer;
export function startPushSync() {
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(syncQueue, 3000);
  };
  const stop = subscribe(later); // any change to tasks or reminders (store.js)
  later();
  return () => {
    stop();
    clearTimeout(timer);
  };
}
