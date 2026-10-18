import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { undo } from '../store.js';
import { quip } from '../lib.js';

// ---------- flame ----------
// A flat two-colour flame. It changes colour with the streak: grey at 0, orange from 1, red from 7, blue from 30.
export const flameTier = (streak) => (streak >= 30 ? 3 : streak >= 7 ? 2 : streak >= 1 ? 1 : 0);

export function Flame({ streak = 1, size = 16 }) {
  return (
    <svg className={`flame tier-${flameTier(streak)}`} width={size} height={size * 1.25} viewBox="0 0 24 30" aria-hidden="true">
      <path className="flame-outer" d="M12 1c2 6 9 9 9 17a9 9 0 0 1-18 0c0-5 3-7 4-11 2 2 3 3 3.5 5C11 8 10.5 4 12 1z" />
      <path className="flame-inner" d="M12 13c1.5 3 4.5 4.5 4.5 8.5a4.5 4.5 0 0 1-9 0C7.5 19 9.5 17.5 12 13z" />
    </svg>
  );
}

// ---------- toasts ----------
// Used sparingly: undo for deletes, and the few moments worth a comment.
let toasts = [];
const subs = new Set();
const push = () => subs.forEach((fn) => fn());

export function toast(text, { undoable = false } = {}) {
  const id = Math.random();
  toasts = [...toasts.slice(-1), { id, text, undoable }];
  push();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); push(); }, undoable ? 6000 : 4200);
}

export function doUndo() {
  const label = undo();
  toast(label ? `${quip('undo')} (${label})` : quip('nothingToUndo'));
}

export function Toasts() {
  const list = useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => toasts);
  return (
    <div className="toasts" role="status">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div key={t.id} className="toast" layout
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
            <span>{t.text}</span>
            {t.undoable && <button className="toast-undo" onClick={() => { toasts = toasts.filter((x) => x.id !== t.id); doUndo(); }}>Undo</button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
