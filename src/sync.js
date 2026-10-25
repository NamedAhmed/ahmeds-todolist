// sync.js = signing in, and keeping your data the same on every device.
//
// How it works:
//   - The backend is one Supabase table called `records`.
//     Each row is one item: (user_id, tbl, id, data, deleted, updated_at).
//   - PUSH (upload): every item marked _dirty in store.js is sent to the table.
//   - PULL (download): fetch rows that changed on the server since the last pull.
//   - The server stamps `updated_at` itself, so your phone's clock and your laptop's clock
//     never have to agree.
//   - Signing in uses a one-time code or link emailed to you (no password).

import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { applyRemote, dirtyRecords, markAllDirty, markClean, resetAll, subscribe as onStoreChange } from './store.js';


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
    // ---- PUSH: upload changed items, 200 at a time ----
    const dirty = dirtyRecords();
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200);

      // Turn each item into a row for the table.
      const rows = chunk.map(({ t, rec }) => {
        const { _dirty, _deleted, id, ...data } = rec; // `data` = everything else about the item
        return { user_id: user.id, tbl: t, id, data, deleted: !!_deleted };
      });

      const { error } = await supabase.from('records').upsert(rows); // upsert = insert, or update if it exists
      if (error) throw error;

      markClean(chunk); // these are uploaded now
    }

    // ---- PULL: download rows that changed since last time ----
    let cursor = localStorage.getItem(cursorKey(user.id)) || '1970-01-01T00:00:00Z';

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
      localStorage.setItem(cursorKey(user.id), cursor);

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

// Called when Supabase tells us who is signed in (or that nobody is).
function onUser(user) {
  if (!user) {
    setStatus({ user: null, sync: 'signed-out' });
    return;
  }
  if (status.user?.id === user.id) return; // same person as before, nothing to do

  const owner = localStorage.getItem(OWNER); // the account this browser's data belongs to

  if (owner && owner !== user.id) {
    // A DIFFERENT account was using this browser: wipe its data so the two never mix.
    resetAll();
  } else if (!owner) {
    // First sign-in ever: whatever you made before signing in now belongs to this account.
    markAllDirty();
  }

  localStorage.setItem(OWNER, user.id);
  keepStorage();
  setStatus({ user: { id: user.id, email: user.email } });
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

  // Also sync when you come back to the tab, when the internet returns, and once a minute.
  window.addEventListener('focus', syncNow);
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow();
  });
  setInterval(syncNow, 60000);
}
