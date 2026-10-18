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


// ======================================================================
// CHANGING THE DATA
// ======================================================================

// Tell everyone the state changed, and save to the browser shortly after.
// We wait 150ms so lots of quick changes only cause one save.
let saveTimer;
function emit() {
  listeners.forEach((listener) => listener());

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Could not save locally', error);
    }
  }, 150);
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
  return JSON.stringify(out, null, 2);
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
