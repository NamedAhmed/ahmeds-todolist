import { useSyncExternalStore } from 'react';

// ---------- the one place data lives ----------
// state = { tasks: { id: record }, dailies: { ... }, ... }
// Every change goes through commit(). It updates state, remembers how to undo itself,
// saves to this browser, and flags the changed records as _dirty so sync.js pushes them.
export const TABLES = ['tasks', 'dailies', 'completions', 'reminders', 'notes', 'settings'];
const KEY = 'todolist:v2';

const empty = () => Object.fromEntries(TABLES.map((t) => [t, {}]));

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...empty(), ...saved };
  } catch { /* corrupt save: start clean */ }
  return migrateV1(empty());
}

// Bring over anything made in the three-file MVP.
function migrateV1(s) {
  try {
    const old = JSON.parse(localStorage.getItem('todolist:v1'));
    if (!old) return s;
    (old.tasks || []).forEach((t, i) => {
      s.tasks[t.id] = { id: t.id, title: t.title, due: t.due, done: !!t.done, progress: 0, kind: 'task', position: i, created_at: t.createdAt, _dirty: true };
    });
    (old.notes || []).forEach((n) => {
      s.notes[n.id] = { id: n.id, title: n.title, body: n.body, edited_at: n.updatedAt, _dirty: true };
    });
  } catch { /* nothing to migrate */ }
  return s;
}

let state = load();
const listeners = new Set();
const undoStack = [];
const redoStack = [];

export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useStore = () => useSyncExternalStore(subscribe, getState);
export const uid = () => crypto.randomUUID();

/** Live (not deleted) records of a table, as an array. */
export const all = (s, table) => Object.values(s[table]).filter((r) => !r._deleted);

let saveTimer;
function emit() {
  listeners.forEach((fn) => fn());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save locally', e); }
  }, 150);
}

// Apply a list of changes and return the list that reverses them.
// change = { t: table, id, patch }   merge fields into a record (creates it if missing)
//        | { t: table, id, set }     replace the whole record (set: null deletes it)
function apply(changes) {
  const inverse = [];
  const next = { ...state };
  for (const c of changes) {
    const prev = next[c.t][c.id];
    inverse.unshift({ t: c.t, id: c.id, set: prev && !prev._deleted ? prev : null });
    let rec;
    if ('set' in c) rec = c.set ? { ...c.set } : { id: c.id, _deleted: true };
    else rec = { ...(prev && !prev._deleted ? prev : { id: c.id }), ...c.patch };
    rec._dirty = true;
    next[c.t] = { ...next[c.t], [c.id]: rec };
  }
  state = next;
  return inverse;
}

/** The only way to change data. `label` names the action for the undo toast. */
export function commit(label, changes) {
  if (!changes.length) return;
  undoStack.push({ label, changes: apply(changes) });
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  emit();
}

export function undo() {
  const last = undoStack.pop();
  if (!last) return null;
  redoStack.push({ label: last.label, changes: apply(last.changes) });
  emit();
  return last.label;
}

export function redo() {
  const last = redoStack.pop();
  if (!last) return null;
  undoStack.push({ label: last.label, changes: apply(last.changes) });
  emit();
  return last.label;
}

// ---------- used only by sync.js ----------
export function dirtyRecords() {
  const out = [];
  for (const t of TABLES) for (const rec of Object.values(state[t])) if (rec._dirty) out.push({ t, rec });
  return out;
}

/** After a successful push. Skips records edited again while the push was in flight. */
export function markClean(pushed) {
  const next = { ...state };
  for (const { t, rec } of pushed) {
    if (next[t][rec.id] !== rec) continue;
    const { _dirty, ...clean } = rec;
    next[t] = { ...next[t], [rec.id]: clean };
  }
  state = next;
  emit();
}

/** Rows pulled from the server. A local unsynced edit wins until it has been pushed. */
export function applyRemote(rows) {
  const next = { ...state };
  let changed = false;
  for (const row of rows) {
    if (!next[row.tbl]) continue;
    if (next[row.tbl][row.id]?._dirty) continue;
    const rec = row.deleted ? { id: row.id, _deleted: true } : { ...row.data, id: row.id };
    next[row.tbl] = { ...next[row.tbl], [row.id]: rec };
    changed = true;
  }
  if (changed) { state = next; emit(); }
}

export function markAllDirty() {
  const next = {};
  for (const t of TABLES) next[t] = Object.fromEntries(Object.entries(state[t]).map(([id, r]) => [id, { ...r, _dirty: true }]));
  state = next;
  emit();
}

export function resetAll() {
  state = empty();
  undoStack.length = 0;
  redoStack.length = 0;
  emit();
}

export function exportJson() {
  const out = {};
  for (const t of TABLES) out[t] = all(state, t).map(({ _dirty, ...r }) => r);
  return JSON.stringify(out, null, 2);
}

// Another tab changed the save: take its version so the two never fight.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = { ...empty(), ...JSON.parse(e.newValue) }; listeners.forEach((fn) => fn()); } catch { /* ignore */ }
});
