// Fire.jsx = two small things that show up all over the app:
//   1. The flame icon next to a daily's streak.
//   2. "Toasts": the little messages that slide in at the bottom of the screen.

import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from './Icons.jsx';
import { undo } from '../store.js';
import { quip } from '../lib.js';


// ======================================================================
// THE FLAME
// ======================================================================
// The flame changes colour with the streak length:
//   tier 0 = grey (no streak), tier 1 = orange (1+ days),
//   tier 2 = red (7+ days),    tier 3 = blue (30+ days).
// The colours themselves live in app.css (.tier-0, .tier-1 ...).
export function flameTier(streak) {
  if (streak >= 30) return 3;
  if (streak >= 7) return 2;
  if (streak >= 1) return 1;
  return 0;
}

// Draws the flame as an SVG picture made of two shapes (outer and inner).
export function Flame({ streak = 1, size = 16 }) {
  return (
    <svg
      className={`flame tier-${flameTier(streak)}`}
      width={size}
      height={size * 1.25}
      viewBox="0 0 24 30"
      aria-hidden="true"
    >
      <path className="flame-outer" d="M12 1c2 6 9 9 9 17a9 9 0 0 1-18 0c0-5 3-7 4-11 2 2 3 3 3.5 5C11 8 10.5 4 12 1z" />
      <path className="flame-inner" d="M12 13c1.5 3 4.5 4.5 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 19 9.5 17.5 12 13z" />
    </svg>
  );
}


// ======================================================================
// TOASTS (little messages)
// ======================================================================
// Used sparingly: for "Undo" after a delete, and for the few moments worth a comment.

// The list of messages currently on screen.
let toasts = [];

// Functions that want to hear when the list changes (the <Toasts> component below).
const subs = new Set();

function tellEveryone() {
  subs.forEach((listener) => listener());
}

// How long a message stays: long enough to read it and press Undo. The countdown stops while the mouse is over it.
const SHOW_FOR_MS = 8000;
const timers = new Map(); // message id -> { timer, left (ms), started }

function removeToast(id) {
  clearTimeout(timers.get(id)?.timer);
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  tellEveryone();
}

function startCountdown(id, ms) {
  timers.set(id, { timer: setTimeout(() => removeToast(id), ms), left: ms, started: Date.now() });
}

// Show a message. Pass { undoable: true } to add an Undo button.
export function toast(text, { undoable = false } = {}) {
  const id = Math.random();

  // Keep at most 2 messages: the newest one plus the one before it.
  const dropped = toasts.slice(0, -1);
  dropped.forEach((t) => {
    clearTimeout(timers.get(t.id)?.timer);
    timers.delete(t.id);
  });
  toasts = [...toasts.slice(-1), { id, text, undoable }];
  tellEveryone();
  startCountdown(id, SHOW_FOR_MS);
}

// A reaction to something you did. `chance` is a number from 0 to 1:
// 1 = always speak, 0.5 = speak half the time. So it never becomes noise.
// `name` picks which list of rude lines to choose from (see "quips" in lib.js).
export function sass(name, args = [], { chance = 1, undoable = false } = {}) {
  if (Math.random() < chance) {
    toast(quip(name, ...args), { undoable });
  }
}

// Undo the last change and show a message about it.
export function doUndo() {
  const label = undo(); // name of what was undone, or null if there was nothing
  if (label) toast(`${quip('undo')} (${label})`);
  else toast(quip('nothingToUndo'));
}

// The component that draws the messages. Put it once on the page (App.jsx does this).
// `children` (the notifications card) goes in the same stack, above the messages, so the two never cover each other.
export function Toasts({ children }) {
  // This tells React: "re-draw me whenever the toasts list changes".
  const list = useSyncExternalStore(
    (listener) => {
      subs.add(listener);
      return () => subs.delete(listener);
    },
    () => toasts
  );

  // Clicking Undo on a message: remove the message, then undo.
  function clickUndo(id) {
    removeToast(id);
    doUndo();
  }

  // The mouse over a message pauses its countdown; leaving starts it again with the time that was left.
  function pause(id) {
    const timing = timers.get(id);
    if (!timing) return;
    clearTimeout(timing.timer);
    timers.set(id, { ...timing, timer: null, left: Math.max(1500, timing.left - (Date.now() - timing.started)) });
  }
  function resume(id) {
    const timing = timers.get(id);
    if (timing && !timing.timer) startCountdown(id, timing.left);
  }

  return (
    <div className="toasts">
      {children}
      <div className="toast-list" role="status">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onFocus={() => pause(t.id)}
            onBlur={() => resume(t.id)}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span>{t.text}</span>
            {t.undoable && (
              <button className="toast-undo" onClick={() => clickUndo(t.id)} aria-label="Undo" title="Undo">
                <Icon name="undo" size={16} />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      </div>
    </div>
  );
}
