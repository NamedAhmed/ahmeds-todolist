// store.js = the ONE place where all your data (tasks, dailies, notes...) lives.
//
// How it works, in plain words:
//   - "state" is one big object holding everything.
//   - To change anything you call commit(). Nothing else is allowed to change the state.
//   - commit() also remembers how to undo the change, saves to your browser,
//     and marks the changed items as "_dirty" so sync.js knows to upload them.
//   - Components call useStore() and re-draw automatically when the state changes.

import { useSyncExternalStore } from 'react';


// ======================================================================
// SETUP
// ======================================================================

// The kinds of data we keep. Each one is a "table": an object of items, keyed by id.
// state looks like: { tasks: { "id1": {...}, "id2": {...} }, dailies: {...}, notes: {...} ... }
export const TABLES = ['tasks', 'dailies', 'completions', 'reminders', 'notes', 'settings'];

// The name we save under in the browser's localStorage.
const KEY = 'todolist:v2';

// A fresh state with every table empty.
function empty() {
  const result = {};
  for (const table of TABLES) {
    result[table] = {};
  }
  return result;
}

// Read the saved data from the browser when the app starts.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...empty(), ...saved };
  } catch {
    // The save was corrupt. Ignore it and start clean.
  }
  // Nothing saved yet: check for data from the very first version of the app.
  return migrateV1(empty());
}

// Bring over tasks and notes made in the first version of the app (stored under 'todolist:v1').
function migrateV1(state) {
  try {
    const old = JSON.parse(localStorage.getItem('todolist:v1'));
    if (!old) return state;

    const oldTasks = old.tasks || [];
    oldTasks.forEach((task, index) => {
      state.tasks[task.id] = {
        id: task.id,
        title: task.title,
        due: task.due,
        done: !!task.done,
        progress: 0,
        kind: 'task',
        position: index,
        created_at: task.createdAt,
        _dirty: true,
      };
    });

    const oldNotes = old.notes || [];
    oldNotes.forEach((note) => {
      state.notes[note.id] = {
        id: note.id,
        title: note.title,
        body: note.body,
        edited_at: note.updatedAt,
        _dirty: true,
      };
    });
  } catch {
    // Nothing to bring over.
  }
  return state;
}

// ---- the live variables ----
let state = load();             // all the data
const listeners = new Set();    // functions to call whenever the state changes (React components)
const undoStack = [];           // past changes, so Ctrl+Z works
const redoStack = [];           // undone changes, so Ctrl+Shift+Z works


// ======================================================================
// READING THE DATA
// ======================================================================

export function getState() {
  return state;
}

// Lets a component say "tell me when the state changes". Returns a function to stop listening.
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// What components use: gives back the current state and re-draws when it changes.
export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}

// Make a new random unique id for a new item.
export function uid() {
  return crypto.randomUUID();
}

// All the items in a table that haven't been deleted, as a list.
export function all(currentState, table) {
  return Object.values(currentState[table]).filter((item) => !item._deleted);
}

const MINUTE_MS = 60000;

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function missingTaskDates(currentState) {
  const tasks = all(currentState, 'tasks');
  const used = new Set(
    tasks.map((task) => timestamp(task.created) ?? timestamp(task.created_at)).filter((value) => value !== null)
  );
  const mainTasks = tasks.filter((task) => !task.parent).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const patches = [];
  const missing = [];

  for (const task of mainTasks) {
    if (timestamp(task.created) !== null) continue;
    const legacyCreated = timestamp(task.created_at);
    if (legacyCreated !== null) patches.push({ id: task.id, created: legacyCreated });
    else missing.push(task);
  }

  let created = new Date(2000, 0, 1).getTime();
  for (let index = missing.length - 1; index >= 0; index--) {
    while (used.has(created)) created += MINUTE_MS;
    patches.push({ id: missing[index].id, created });
    used.add(created);
    created += MINUTE_MS;
  }

  return patches;
}

// Fill legacy tasks' missing dates without putting this one-time migration on the undo stack.
export function ensureTaskCreatedDates() {
  const patches = missingTaskDates(state);
  if (!patches.length) return;
  apply(patches.map(({ id, created }) => ({ t: 'tasks', id, patch: { created } })));
  emit();
}


// ======================================================================
// CHANGING THE DATA
// ======================================================================

// Tell everyone the state changed, and save to the browser shortly after.
// We wait 400ms so lots of quick changes only cause one save (writing everything is the slow part on an old phone), and
// anything still waiting is written the moment the page is hidden or closed, so the wait never costs a change.
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Could not save locally', error);
  }
}
function emit() {
  listeners.forEach((listener) => listener());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveTimer && save());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveTimer && save());
}

// Apply a list of changes to the state, and return the list of changes that would reverse them.
// A change is one of:
//   { t: tableName, id, patch: {...} }   add/update only these fields (creates the item if missing)
//   { t: tableName, id, set: {...} }     replace the whole item
//   { t: tableName, id, set: null }      delete the item
function apply(changes) {
  const inverse = [];
  const next = { ...state }; // copy, so we never edit the old state directly

  for (const change of changes) {
    const previous = next[change.t][change.id];
    const previousExists = previous && !previous._deleted;

    // Remember how to put things back. (unshift = add to the front, so undo runs in reverse order)
    inverse.unshift({
      t: change.t,
      id: change.id,
      set: previousExists ? previous : null,
    });

    // Work out the new version of the item.
    let item;
    if ('set' in change) {
      if (change.set) item = { ...change.set };
      else item = { id: change.id, _deleted: true }; // deleting keeps a marker so sync can tell the server
    } else {
      const base = previousExists ? previous : { id: change.id };
      item = { ...base, ...change.patch };
    }

    item._dirty = true; // "this needs uploading"
    next[change.t] = { ...next[change.t], [change.id]: item };
  }

  state = next;
  return inverse;
}

// THE way to change data. `label` is the name shown in the undo message.
export function commit(label, changes) {
  if (changes.length === 0) return;

  undoStack.push({ label, changes: apply(changes) });
  if (undoStack.length > 200) undoStack.shift(); // only remember the last 200 actions
  redoStack.length = 0;                          // a new change wipes the redo list
  emit();
}

// Save a preference (theme, wallpaper...) in the `settings` table. Unlike commit(), this is NOT
// added to the undo list, so Ctrl+Z never flips your theme back. It still syncs like everything else.
export function saveSetting(id, patch) {
  apply([{ t: 'settings', id, patch }]);
  emit();
}

// Reverse the last change. Returns its label, or null if there was nothing to undo.
export function undo() {
  const last = undoStack.pop();
  if (!last) return null;

  redoStack.push({ label: last.label, changes: apply(last.changes) });
  emit();
  return last.label;
}

// Re-do the change that was just undone. Returns its label, or null if there was nothing.
export function redo() {
  const last = redoStack.pop();
  if (!last) return null;

  undoStack.push({ label: last.label, changes: apply(last.changes) });
  emit();
  return last.label;
}


// ======================================================================
// USED ONLY BY sync.js (uploading and downloading)
// ======================================================================

// Every item that has changed since the last upload.
export function dirtyRecords() {
  const result = [];
  for (const table of TABLES) {
    for (const item of Object.values(state[table])) {
      if (item._dirty) result.push({ t: table, rec: item });
    }
  }
  return result;
}

// After a successful upload: remove the _dirty flag.
// If an item was edited again while uploading, leave it dirty so it uploads next time.
export function markClean(pushed) {
  const next = { ...state };

  for (const { t, rec } of pushed) {
    if (next[t][rec.id] !== rec) continue; // it changed during the upload, skip it

    const { _dirty, ...clean } = rec; // copy without the _dirty field
    next[t] = { ...next[t], [rec.id]: clean };
  }

  state = next;
  emit();
}

// Rows downloaded from the server. A local change that hasn't uploaded yet wins over the server.
export function applyRemote(rows) {
  const next = { ...state };
  let changed = false;

  for (const row of rows) {
    if (!next[row.tbl]) continue;                  // unknown table, ignore
    if (next[row.tbl][row.id]?._dirty) continue;   // we have a newer local edit, keep it

    let item;
    if (row.deleted) item = { id: row.id, _deleted: true };
    else item = { ...row.data, id: row.id };

    next[row.tbl] = { ...next[row.tbl], [row.id]: item };
    changed = true;
  }

  if (changed) {
    for (const { id, created } of missingTaskDates(next)) {
      next.tasks[id] = { ...next.tasks[id], created, _dirty: true };
    }
    state = next;
    emit();
  }
}

// Mark everything as needing upload (used the first time you sign in).
export function markAllDirty() {
  const next = {};
  for (const table of TABLES) {
    next[table] = {};
    for (const [id, item] of Object.entries(state[table])) {
      next[table][id] = { ...item, _dirty: true };
    }
  }
  state = next;
  emit();
}

// Wipe everything (used when a different account signs in on this browser).
export function resetAll() {
  state = empty();
  undoStack.length = 0;
  redoStack.length = 0;
  emit();
}

// All your data as a nicely formatted JSON text (used by the export button).
export function exportJson() {
  const out = {};
  for (const table of TABLES) {
    out[table] = all(state, table).map((item) => {
      const { _dirty, ...clean } = item; // leave out the internal _dirty flag
      return clean;
    });
  }

  try {
    const savedFilter = localStorage.getItem('todolist:task-filter');
    out.preferences = {
      taskFilter: savedFilter || (localStorage.getItem('todolist:today-only') === '1' ? 'today' : 'all'),
      taskSort: localStorage.getItem('todolist:task-sort') || 'due',
    };
  } catch {
    out.preferences = { taskFilter: 'all', taskSort: 'due' };
  }

  return JSON.stringify(out, null, 2);
}

// Put a backup (the text from exportJson) back into the app. Everything in the file is added, and an item that
// already exists (same id) is replaced by the file's copy; nothing else is touched, so importing never deletes
// anything. It is ONE undo step, and the items are marked for upload like any other change.
// Returns { added, replaced } counts, or throws an Error with a message that can be shown to the user.
export function importJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a backup: it is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('That file is not a backup.');
  if (!TABLES.some((table) => Array.isArray(data[table]))) throw new Error('That file has no tasks, notes or dailies in it.');

  const changes = [];
  let added = 0;
  let replaced = 0;
  for (const table of TABLES) {
    if (!Array.isArray(data[table])) continue;
    for (const item of data[table]) {
      // Only real items: an object with a text id, not already deleted.
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item._deleted) continue;
      const { _dirty, ...clean } = item;
      const existing = state[table][item.id];
      if (existing && !existing._deleted) replaced++;
      else added++;
      changes.push({ t: table, id: item.id, set: clean });
    }
  }
  if (changes.length === 0) throw new Error('That backup is empty.');
  commit('backup imported', changes);

  // The task view (filter and sort) is not data in the tables: it lives in the browser, and applies on the next load.
  try {
    const { taskFilter, taskSort } = data.preferences ?? {};
    if (typeof taskFilter === 'string') localStorage.setItem('todolist:task-filter', taskFilter);
    if (typeof taskSort === 'string') localStorage.setItem('todolist:task-sort', taskSort);
  } catch {
    // storage unavailable: the view just stays as it is
  }
  return { added, replaced };
}


// ======================================================================
// MULTIPLE TABS
// ======================================================================
// If you have the app open in two browser tabs and one saves, the other
// picks up the new data so the two never fight each other.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY || !event.newValue) return;
  try {
    state = { ...empty(), ...JSON.parse(event.newValue) };
    listeners.forEach((listener) => listener());
  } catch {
    // Ignore a broken save.
  }
});
