// noteSave.js = saving notes safely.
//
// Typing is saved after a short pause (so a paragraph is ONE undo step, not forty), but what is waiting to be saved is
// kept here, outside any editor, so it can never be lost:
//   - leaving a note, switching editor or closing the editor saves it straight away (flushNoteSaves)
//   - closing the tab or putting the phone to sleep saves it too (pagehide / visibilitychange)
//   - an editor that opens reads what is waiting first (pendingText), so it never shows an older copy
// What is written is built by noteSavePatch (notes.js), which only adds to a note and never removes anything.

import { commit, getState } from './store.js';
import { noteSavePatch } from './notes.js';

const waiting = new Map(); // note id -> { title?, md? }
let timer;

// Something changed in a note: { title } and/or { md }. It is written after 500 ms of quiet.
export function queueNoteSave(id, change) {
  waiting.set(id, { ...waiting.get(id), ...change });
  clearTimeout(timer);
  timer = setTimeout(flushNoteSaves, 500);
}

// The text (or title) that is waiting to be saved for this note, if any.
export const pendingText = (id) => waiting.get(id);

// Write everything that is waiting. Returns true if something was written.
export function flushNoteSaves() {
  clearTimeout(timer);
  if (!waiting.size) return false;
  const changes = [];
  for (const [id, change] of waiting) {
    const note = getState().notes[id];
    if (!note || note._deleted) continue; // deleted meanwhile: nothing to write to
    const now = Date.now();
    let patch;
    if (typeof change.md === 'string') patch = noteSavePatch(note, change.md, now);
    else patch = { edited_at: now, ...(typeof note.md === 'string' ? { md_at: now } : {}) }; // title only: the text is unchanged
    if (typeof change.title === 'string') patch.title = change.title;
    changes.push({ t: 'notes', id, patch });
  }
  waiting.clear();
  if (changes.length) commit('note edited', changes);
  return changes.length > 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNoteSaves);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNoteSaves());
}
