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
import { useEffect, useState } from 'react';
import { supabase, useSync } from './sync.js';
import { addDays, formatTime, isDone, reminderOccursOn, todayStr } from './lib.js';
import { storage } from './storage.js';

const FLAG = 'todolist:push'; // is push switched on for THIS device?
const DAYS_AHEAD = 30;

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushEnabled = () => {
  try {
    return storage.get(FLAG) === '1' && pushSupported() && Notification.permission === 'granted';
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

  storage.set(FLAG, '1');
  await syncQueue();
  return '';
}

export async function disablePush() {
  storage.set(FLAG, '0');
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

// 15 -> "15 minutes", 60 -> "1 hour", 1440 -> "1 day".
const leadText = (minutes) => (minutes >= 1440 ? `${minutes / 1440} day` : minutes >= 60 ? `${minutes / 60} hour${minutes > 60 ? 's' : ''}` : `${minutes} minutes`);

// Every notification due in the next DAYS_AHEAD days: [{ key, fire_at, title, body }].
// `defaultTime` ('09:00', or '' for none) is used for tasks and reminders that have a day but no time.
// `lead` is minutes: for things with a time of their own, an extra notification that long before.
export function buildSchedule(state, defaultTime, now = new Date(), lead = 0) {
  const today = todayStr();
  const last = addDays(today, DAYS_AHEAD);
  const notes = [];
  const add = (kind, id, when, title, body, timed = false) => {
    if (when > now) notes.push({ key: `${kind}:${id}:${when.toISOString()}`, fire_at: when.toISOString(), title, body });
    // The warning: only for things you gave a time (a day-only task has no moment to be warned about).
    const early = new Date(when.getTime() - lead * 60000);
    if (timed && lead > 0 && early > now) {
      notes.push({ key: `${kind}-early:${id}:${when.toISOString()}`, fire_at: early.toISOString(), title, body: `In ${leadText(lead)}: ${body}` });
    }
  };

  for (const task of all(state, 'tasks')) {
    if (task.done || !task.due || task.due > last) continue;
    const time = task.due_time || defaultTime;
    if (time) add('task', task.id, at(task.due, time), task.title, task.due_time ? `Due at ${formatTime(task.due_time)}` : 'Due today', !!task.due_time);
  }

  for (const reminder of all(state, 'reminders')) {
    const time = reminder.time || defaultTime;
    if (!time) continue;
    for (let day = today; day <= last; day = addDays(day, 1)) {
      if (reminderOccursOn(reminder, day, today) && !isDone(state, reminder.id, day)) {
        add('reminder', reminder.id, at(day, time), reminder.title, reminder.time ? `Reminder for ${formatTime(reminder.time)}` : 'Reminder for today', !!reminder.time);
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
    const lead = Number(getState().settings.appearance?.pushLead) || 0;
    const batch = crypto.randomUUID();
    const rows = buildSchedule(getState(), defaultTime, new Date(), lead).map((note) => ({ ...note, batch }));
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

// ---- On by default ----
// Notifications are on unless you turn them off. A browser only lets a site ask for permission after a tap, so:
//   - a device that has already allowed notifications is switched on by itself, as soon as you are signed in
//   - otherwise, once, a small card asks "Turn on notifications?" (usePushPrompt, shown by App.jsx)
// "Turn off on this device" in Settings is remembered and nothing here switches it back on.
const ASKED = 'todolist:push-asked';

export function usePushPrompt() {
  const { user } = useSync();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user || !supabase || !pushSupported()) return;
    let off = false;
    try {
      off = storage.get(FLAG) === '0';
      if (off) return;
      if (Notification.permission === 'granted' && storage.get(FLAG) !== '1') enablePush(); // already allowed here: just subscribe
      else if (Notification.permission === 'default' && !storage.get(ASKED)) setShow(true);
    } catch {
      // storage unavailable: no prompt
    }
  }, [user]);

  return {
    show,
    accept: async () => {
      setShow(false);
      storage.set(ASKED, '1');
      await enablePush();
    },
    dismiss: () => {
      setShow(false);
      storage.set(ASKED, '1'); // asked once; Settings > General > Notifications is still there
    },
  };
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
