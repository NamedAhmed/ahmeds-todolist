import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { all, commit, exportJson, uid, useStore } from '../store.js';
import { sendCode, signOut, supabase, syncNow, useSync, verifyCode } from '../sync.js';
import { DOW, MON, empties, quip, ruleText } from '../lib.js';
import { toast } from './Fire.jsx';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

function Modal({ title, onClose, children }) {
  const box = useRef(null);
  // Focus moves into the dialog, Tab stays inside it, and closing hands focus back to where it came from.
  useEffect(() => {
    const opener = document.activeElement;
    (box.current.querySelector('input, select, textarea') ?? box.current).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const items = [...box.current.querySelectorAll(FOCUSABLE)];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener?.isConnected && opener.focus(); };
  }, [onClose]);
  return (
    <motion.div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div ref={box} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}
        initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <header className="col-head"><h2>{title}</h2><button className="btn-ghost" onClick={onClose}>Close</button></header>
        {children}
      </motion.div>
    </motion.div>
  );
}

// ---------- reminders ----------
export function RemindersModal({ today, onClose }) {
  const s = useStore();
  const reminders = all(s, 'reminders').sort((a, b) => (a.created < b.created ? -1 : 1));
  const [title, setTitle] = useState('');
  const [type, setType] = useState('weekly');
  const [days, setDays] = useState([new Date().getDay()]);
  const [day, setDay] = useState(1);
  const [month, setMonth] = useState(new Date().getMonth());

  const add = (e) => {
    e.preventDefault();
    if (!title.trim() || (type === 'weekly' && !days.length)) return;
    const rule = type === 'weekly' ? { type, days: [...days].sort() } : type === 'monthly' ? { type, day } : { type, month, day };
    commit('reminder added', [{ t: 'reminders', id: uid(), patch: { title: title.trim(), rule, created: today } }]);
    setTitle('');
  };

  return (
    <Modal title="Reminders" onClose={onClose}>
      <p className="hint">Repeating tasks. They show up in the list on their day and come back after you tick them. Forever. Like laundry.</p>
      <ul className="plain-list">
        {reminders.map((r) => (
          <li key={r.id}>
            <span className="repeat">↻</span>
            <span className="grow">{r.title}</span>
            <span className="mono">{ruleText(r.rule)}</span>
            <button className="del show" aria-label={`Delete ${r.title}`}
              onClick={() => { commit('reminder deleted', [{ t: 'reminders', id: r.id, set: null }]); toast('Reminder deleted. Good luck remembering anything.', { undoable: true }); }}>×</button>
          </li>
        ))}
      </ul>
      {!reminders.length && <p className="empty small">{empties.reminders}</p>}

      <form className="stack" onSubmit={add}>
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Take out the trash…" aria-label="Reminder" />
        <div className="seg-row">
          {['weekly', 'monthly', 'yearly'].map((t) => (
            <button type="button" key={t} className={'chip' + (type === t ? ' solid' : '')} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
        {type === 'weekly' && (
          <div className="seg-row">
            {DOW.map((n, i) => (
              <button type="button" key={n} className={'chip' + (days.includes(i) ? ' solid' : '')}
                onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i])}>{n}</button>
            ))}
          </div>
        )}
        {type !== 'weekly' && (
          <div className="seg-row">
            {type === 'yearly' && (
              <select className="field" value={month} onChange={(e) => setMonth(+e.target.value)} aria-label="Month">
                {MON.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            )}
            <label className="target">day <input type="number" min="1" max="31" value={day} onChange={(e) => setDay(Math.min(31, Math.max(1, +e.target.value || 1)))} /></label>
          </div>
        )}
        <div className="seg-row">
          <button className="btn-add" type="submit">Add reminder</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- settings and account ----------
function Account() {
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!supabase) return <p className="hint">Sync is off: this copy has no Supabase keys, so everything stays in this browser.</p>;

  if (sync.user) {
    return (
      <div className="stack">
        <p className="hint">Signed in as <b>{sync.user.email}</b>. {sync.sync === 'syncing' ? 'Syncing…' : sync.sync === 'error' ? `Sync failed: ${sync.error}` : 'Everything is synced.'}</p>
        <div className="seg-row">
          <button className="btn-ghost" onClick={syncNow}>Sync now</button>
          <button className="btn-ghost danger" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message || String(e)); }
    setBusy(false);
  };

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); run(sent ? async () => { await verifyCode(email, code.trim()); toast(quip('synced')); } : async () => { await sendCode(email); setSent(true); }); }}>
      <p className="hint">{sent ? 'Check your email. Click the link in it, or type the code here.' : 'Sign in to sync between your laptop and phone. No password, just an email.'}</p>
      <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" disabled={sent} />
      {sent && <input className="field" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from the email" aria-label="Code" />}
      {error && <p className="error">{error}</p>}
      <div className="seg-row">
        <button className="btn-add" type="submit" disabled={busy}>{busy ? 'Hold on…' : sent ? 'Sign in' : 'Email me'}</button>
        {sent && <button type="button" className="btn-ghost" onClick={() => { setSent(false); setCode(''); }}>Use another email</button>}
      </div>
    </form>
  );
}

export function SettingsModal({ onClose }) {
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
    a.download = 'todolist-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Modal title="Settings" onClose={onClose}>
      <h3 className="mono">Account</h3>
      <Account />
      <h3 className="mono">Your data</h3>
      <div className="seg-row">
        <button className="btn-ghost" onClick={download}>Download a backup</button>
      </div>
      <p className="hint">Ctrl+Z undoes anything. Ctrl+Shift+Z brings it back, in case you regret your regret.</p>
    </Modal>
  );
}

// ---------- keyboard ----------
const KEYS = [
  ['Anywhere', [['n', 'Add a task'], ['t', 'Today only, on or off'], ['c', 'Calendar'], ['l', 'Task list'], ['o', 'Notes'], ['r', 'Reminders'], ['Ctrl Z', 'Undo (Shift: redo)'], ['?', 'This list']]],
  ['On a task', [['↑ ↓ or j k', 'Move between tasks'], ['Space or x', 'Done, or not done'], ['Enter', 'Open a project, or rename a task'], ['e', 'Rename'], ['d', 'Pick a date'], ['[  ]', 'Due a day earlier or later'], ['Alt ↑ ↓', 'Reorder'], ['m', 'Menu'], ['Delete', 'Delete (Ctrl Z brings it back)']]],
  ['On the calendar', [['← → ↑ ↓', 'Move between days'], ['Enter', 'Show that day only']]]
];

export function KeysModal({ onClose }) {
  return (
    <Modal title="Keyboard" onClose={onClose}>
      <div className="keys">
        {KEYS.map(([group, rows]) => (
          <section key={group}>
            <h3 className="mono">{group}</h3>
            <dl>{rows.map(([k, what]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>)}</dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
