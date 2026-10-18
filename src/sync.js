import { useSyncExternalStore } from 'react';
import { createClient } from '@supabase/supabase-js';
import { applyRemote, dirtyRecords, markAllDirty, markClean, resetAll, subscribe as onStoreChange } from './store.js';

// ---------- login and sync ----------
// The whole backend is one Supabase table, `records` (user_id, tbl, id, data, deleted, updated_at).
// Push: upsert every _dirty record. Pull: fetch rows changed since the last pull.
// The server stamps updated_at, so the phone's clock and the laptop's clock never have to agree.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;
export const supabase = url && key ? createClient(url, key) : null;

let status = { user: null, sync: supabase ? 'signed-out' : 'off', error: '' };
const listeners = new Set();
const setStatus = (patch) => { status = { ...status, ...patch }; listeners.forEach((fn) => fn()); };
export const useSync = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => status);

const OWNER = 'todolist:owner';
const cursorKey = (id) => `todolist:cursor:${id}`;

let busy = false;
let again = false;

export async function syncNow() {
  const user = status.user;
  if (!supabase || !user) return;
  if (busy) { again = true; return; }
  busy = true;
  setStatus({ sync: 'syncing', error: '' });
  try {
    // push
    const dirty = dirtyRecords();
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200);
      const rows = chunk.map(({ t, rec }) => {
        const { _dirty, _deleted, id, ...data } = rec;
        return { user_id: user.id, tbl: t, id, data, deleted: !!_deleted };
      });
      const { error } = await supabase.from('records').upsert(rows);
      if (error) throw error;
      markClean(chunk);
    }
    // pull
    let cursor = localStorage.getItem(cursorKey(user.id)) || '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await supabase.from('records').select('tbl,id,data,deleted,updated_at')
        .gt('updated_at', cursor).order('updated_at').limit(500);
      if (error) throw error;
      if (!data.length) break;
      applyRemote(data);
      cursor = data[data.length - 1].updated_at;
      localStorage.setItem(cursorKey(user.id), cursor);
      if (data.length < 500) break;
    }
    setStatus({ sync: 'synced' });
  } catch (e) {
    setStatus({ sync: 'error', error: e.message || String(e) });
  } finally {
    busy = false;
    if (again) { again = false; syncNow(); }
  }
}

function onUser(user) {
  if (!user) { setStatus({ user: null, sync: 'signed-out' }); return; }
  if (status.user?.id === user.id) return;
  const owner = localStorage.getItem(OWNER);
  if (owner && owner !== user.id) resetAll();   // someone else's cache: don't mix accounts
  else if (!owner) markAllDirty();              // things made before signing in become this account's
  localStorage.setItem(OWNER, user.id);
  setStatus({ user: { id: user.id, email: user.email } });
  syncNow();
}

export async function sendCode(email) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signOut() {
  await syncNow();
  await supabase.auth.signOut();
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    // Defer: Supabase warns against calling its own API inside this callback.
    setTimeout(() => onUser(session?.user ?? null), 0);
  });

  let timer;
  onStoreChange(() => {
    if (!status.user || !dirtyRecords().length) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 1500);
  });
  window.addEventListener('focus', syncNow);
  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  setInterval(syncNow, 60000);
}
