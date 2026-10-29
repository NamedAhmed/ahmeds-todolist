// sync.js = signing in, and keeping your data the same on every device.
//
// How it works:
//   - The backend is one Supabase table called `records`.
//     Each row is one item: (user_id, tbl, id, data, deleted, updated_at).
//   - PUSH (upload): every item marked _dirty in store.js is sent to the table, but never over a newer version that
//     another device saved meanwhile (see push below: that becomes a "conflicted copy" instead).
//   - PULL (download): fetch rows that changed on the server since the last pull.
//   - REALTIME: Supabase tells us when a row changes on another device, and we pull right away.
//   - The server stamps `updated_at` itself, so your phone's clock and your laptop's clock
//     never have to agree.
//   - Signing in uses a one-time code or link emailed to you (no password).

import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { applyRemote, dirtyRecords, exportJson, markAllDirty, markClean, resetAll, resolveConflicts, subscribe as onStoreChange } from './store.js';
import { storage } from './storage.js';


// ======================================================================
// CONNECTING TO SUPABASE
// ======================================================================
// These two values come from the file `.env.local` (see `.env.example`).
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

// `supabase` is our connection. It is null when the keys are missing, which switches syncing off.
// Staying signed in: the session is saved in this browser (persistSession) and quietly renewed
// before it runs out (autoRefreshToken), so you stay signed in until you press Sign out.
// How long a session may last at most is set in the Supabase dashboard (Authentication > Sessions).
export const supabase = url && key
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Ask the browser not to clear this app's saved data (and with it the sign-in) when space runs low
// or after a long time away. Browsers may say no; then nothing changes.
function keepStorage() {
  navigator.storage?.persist?.().catch(() => {});
}


// ======================================================================
// THE SYNC STATUS (what the screen shows)
// ======================================================================
// status.user  = who is signed in: { id, email } or null
// status.sync  = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error'
// status.error = the error message when sync = 'error'
let status = { user: null, sync: supabase ? 'signed-out' : 'off', error: '' };

// Components that want to be told when the status changes.
const listeners = new Set();

// Change part of the status and tell everyone.
function setStatus(changes) {
  status = { ...status, ...changes };
  listeners.forEach((listener) => listener());
}

// What components use to read the status (and re-draw when it changes).
export function useSync() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status
  );
}

// Names we use in the browser's localStorage.
const OWNER = 'todolist:owner'; // which account the data in this browser belongs to
function cursorKey(userId) {
  // The "cursor" remembers when we last downloaded, so we only fetch what is new.
  return `todolist:cursor:${userId}`;
}


// ======================================================================
// SYNCING
// ======================================================================
let busy = false;  // is a sync running right now?
let again = false; // did someone ask to sync while one was already running?

// Other files can ask to be run after each good sync (appearance.js uses it to sync your pictures).
// Each gets (supabase, user) and may return a promise; its errors never break the sync.
const afterSync = new Set();
export function onSynced(task) {
  afterSync.add(task);
}

// ---- PUSH: upload every changed item ----
// Two devices can change the same item while one of them is offline. So an item that came from the server remembers the
// server's stamp on it (_base), and its upload only goes through if the server still has that version ("compare and set").
// If the server has something newer, that is a conflict: the server's version is kept, and for tasks and notes the local
// edit is kept as a "(conflicted copy)" next to it (resolveConflicts in store.js). Nothing is silently overwritten.
// Items the server has never seen, and settings (where the last change should simply win), are upserted as before.
// Returns how many conflicted copies were made. `client` is the Supabase connection (a stand-in in the tests).
export async function push(client, userId) {
  const toRow = ({ t, rec }) => {
    const { _dirty, _deleted, _base, id, ...data } = rec; // `data` = everything else about the item
    return { user_id: userId, tbl: t, id, data, deleted: !!_deleted };
  };
  const stampsOf = (rows) => Object.fromEntries((rows ?? []).map((row) => [row.tbl + ':' + row.id, row.updated_at]));

  const dirty = dirtyRecords();
  const fresh = dirty.filter(({ t, rec }) => !rec._base || t === 'settings');
  const known = dirty.filter((item) => !fresh.includes(item));

  // A setting this device has never downloaded (say the theme picked on a new phone before signing in) is merged into
  // the account's copy instead of replacing it: what was set here wins, everything else on the account is kept.
  const unseen = fresh.filter(({ t, rec }) => t === 'settings' && !rec._base).map(({ rec }) => rec.id);
  const onServer = {};
  if (unseen.length) {
    const { data, error } = await client.from('records').select('id,data,deleted').eq('user_id', userId).eq('tbl', 'settings').in('id', unseen);
    if (error) throw error;
    for (const row of data ?? []) if (!row.deleted) onServer[row.id] = row.data;
  }
  const withServer = (item) => {
    const row = toRow(item);
    return item.t === 'settings' && onServer[row.id] ? { ...row, data: { ...onServer[row.id], ...row.data } } : row;
  };

  // New items (and settings): 200 at a time. upsert = insert, or update if it exists.
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    const { data, error } = await client.from('records').upsert(chunk.map(withServer)).select('tbl,id,updated_at');
    if (error) throw error;
    markClean(chunk, stampsOf(data));
  }

  // Items the server already has: each one only if the server still has the version this edit started from.
  // 10 at a time, side by side.
  const conflicts = [];
  for (let i = 0; i < known.length; i += 10) {
    const chunk = known.slice(i, i + 10);
    const results = await Promise.all(
      chunk.map((item) => {
        const row = toRow(item);
        return client
          .from('records')
          .update({ data: row.data, deleted: row.deleted })
          .eq('user_id', userId)
          .eq('tbl', item.t)
          .eq('id', row.id)
          .eq('updated_at', item.rec._base)
          .select('tbl,id,updated_at');
      })
    );

    const done = [];
    const stamps = {};
    results.forEach(({ data, error }, j) => {
      if (error) throw error;
      if (data?.length) {
        done.push(chunk[j]);
        Object.assign(stamps, stampsOf(data));
      } else {
        conflicts.push(chunk[j]); // the server's version is newer than the one this edit started from
      }
    });
    markClean(done, stamps);
  }

  if (!conflicts.length) return 0;

  // Fetch the server's versions of the clashing items, then keep both (see resolveConflicts).
  const found = [];
  for (const t of new Set(conflicts.map((item) => item.t))) {
    const ids = conflicts.filter((item) => item.t === t).map((item) => item.rec.id);
    const { data, error } = await client.from('records').select('tbl,id,data,deleted,updated_at').eq('user_id', userId).eq('tbl', t).in('id', ids);
    if (error) throw error;
    for (const row of data ?? []) found.push({ t, id: row.id, row });
  }
  return resolveConflicts(found);
}

// Upload local changes, then download remote changes.
export async function syncNow() {
  const user = status.user;
  if (!supabase || !user) return; // not signed in, nothing to do

  // Already syncing? Remember to run once more afterwards, then stop.
  if (busy) {
    again = true;
    return;
  }

  busy = true;
  setStatus({ sync: 'syncing', error: '' });

  try {
    // ---- PUSH: upload changed items ----
    const copies = await push(supabase, user.id);
    if (copies) again = true; // conflicted copies were made: upload them too



    // ---- PULL: download rows that changed since last time ----
    let cursor = storage.get(cursorKey(user.id)) || '1970-01-01T00:00:00Z';

    while (true) {
      const { data, error } = await supabase
        .from('records')
        .select('tbl,id,data,deleted,updated_at')
        .gt('updated_at', cursor) // only rows newer than the cursor
        .order('updated_at')
        .limit(500);
      if (error) throw error;

      if (data.length === 0) break; // nothing new

      applyRemote(data);
      cursor = data[data.length - 1].updated_at;
      storage.set(cursorKey(user.id), cursor);

      if (data.length < 500) break; // that was the last page
    }

    setStatus({ sync: 'synced' });
    for (const task of afterSync) Promise.resolve(task(supabase, user)).catch(() => {});
  } catch (error) {
    setStatus({ sync: 'error', error: error.message || String(error) });
  } finally {
    busy = false;
    if (again) {
      again = false;
      syncNow();
    }
  }
}


// ======================================================================
// SIGNING IN AND OUT
// ======================================================================

// ======================================================================
// REALTIME: HEARING ABOUT CHANGES FROM OTHER DEVICES
// ======================================================================
// Supabase tells us when one of our rows changes. We don't use the row it sends: we just sync (a second or so
// later, so a burst of changes becomes one sync). Our own uploads cause a message too; that sync finds nothing new.
let channel = null;
let realtimeTimer;

function listen(userId) {
  stopListening();
  channel = supabase
    .channel('records:' + userId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, () => {
      clearTimeout(realtimeTimer);
      realtimeTimer = setTimeout(syncNow, 300);
    })
    .subscribe();
}

function stopListening() {
  clearTimeout(realtimeTimer);
  if (channel) supabase.removeChannel(channel);
  channel = null;
}


export const PREVIOUS_BACKUP = 'todolist:backup-before-account-switch';

// Called when Supabase tells us who is signed in (or that nobody is).
function onUser(user) {
  if (!user) {
    stopListening();
    setStatus({ user: null, sync: 'signed-out' });
    return;
  }
  if (status.user?.id === user.id) return; // same person as before, nothing to do

  const owner = storage.get(OWNER); // the account this browser's data belongs to

  if (owner && owner !== user.id) {
    // A DIFFERENT account was using this browser: its data is cleared so the two never mix. A copy of it is kept on this
    // device first (Settings > Account offers it as a download), so edits it had not synced yet are never simply gone.
    try {
      storage.set(PREVIOUS_BACKUP, exportJson());
    } catch {
      // storage full or blocked: nothing more can be kept
    }
    resetAll();
  } else if (!owner) {
    // First sign-in ever: whatever you made before signing in now belongs to this account.
    markAllDirty();
  }

  storage.set(OWNER, user.id);
  keepStorage();
  setStatus({ user: { id: user.id, email: user.email } });
  listen(user.id);
  syncNow();
}

// Step 1 of signing in: Supabase emails a link and a code to this address.
// emailRedirectTo = where the link should send you back to (must be allowed in Supabase's URL settings).
export async function sendCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

// Step 2 of signing in: check the code you typed from the email.
export async function verifyCode(email, token) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

// Sign out (after one last sync so nothing is lost).
export async function signOut() {
  await syncNow();
  await supabase.auth.signOut();
}


// ======================================================================
// STARTUP: this runs once when the app loads
// ======================================================================
if (supabase) {
  // Supabase calls this when someone signs in or out, and also when you land back on the app
  // from the link in the email.
  supabase.auth.onAuthStateChange((_event, session) => {
    // We wait a moment (setTimeout 0) because Supabase warns against calling its own
    // functions directly inside this callback.
    setTimeout(() => onUser(session?.user ?? null), 0);
  });

  // When you edit something, sync 1.5 seconds later (restarting the wait on each edit,
  // so lots of quick edits only cause one sync).
  let timer;
  onStoreChange(() => {
    if (!status.user) return;
    if (dirtyRecords().length === 0) return;

    clearTimeout(timer);
    timer = setTimeout(syncNow, 1500);
  });

  // Also sync when you come back to the tab, when the internet returns, and once a minute (a safety net
  // for the moments the realtime connection was down).
  window.addEventListener('focus', syncNow);
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => {
    // Coming back: catch up. Going away (the phone locks, the app is swiped off): send what is waiting NOW, because the
    // page may be frozen or closed before the usual 1.5 second wait is over.
    syncNow();
  });
  setInterval(syncNow, 60000);
}
