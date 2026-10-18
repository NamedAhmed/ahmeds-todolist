// Modals.jsx = the pop-up windows (a "modal" is a window that appears over the page).
//
//   Modal           the empty window frame the others use (dark backdrop, Close button, Esc to close)
//   RemindersModal  list and add repeating reminders
//   SettingsModal   sign in / sign out, and download a backup
//   KeysModal       the keyboard shortcut cheat sheet
//
// App.jsx decides which one is open.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { all, commit, exportJson, uid, useStore } from '../store.js';
import { sendCode, signOut, supabase, syncNow, useSync, verifyCode } from '../sync.js';
import { DOW, MON, empties, quip, ruleText } from '../lib.js';
import { sass, toast } from './Fire.jsx';

// A CSS selector that finds everything you can Tab to inside the window.
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';


// ======================================================================
// THE WINDOW FRAME
// ======================================================================
// Props: title (shown at the top), onClose (function to close it), children (what goes inside).
function Modal({ title, onClose, children }) {
  const box = useRef(null); // points at the window's HTML element

  // Keyboard behaviour for accessibility:
  //  - when it opens, the cursor moves inside it
  //  - Tab stays inside the window (it loops around)
  //  - Escape closes it
  //  - when it closes, the cursor goes back to where it was before
  useEffect(() => {
    const opener = document.activeElement; // what had focus before the window opened

    // Focus the first text box if there is one, otherwise the window itself.
    const firstInput = box.current.querySelector('input, select, textarea');
    (firstInput ?? box.current).focus();

    function onKey(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Make Tab loop: from the last item back to the first, and Shift+Tab the other way.
      const items = [...box.current.querySelectorAll(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKey);

    // Cleanup when the window closes.
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  // Clicking the dark area OUTSIDE the window closes it.
  function clickBackdrop(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <motion.div
      className="scrim"
      onMouseDown={clickBackdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        ref={box}
        tabIndex={-1}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      >
        <header className="col-head">
          <h2>{title}</h2>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </motion.div>
    </motion.div>
  );
}


// ======================================================================
// REMINDERS WINDOW
// ======================================================================
export function RemindersModal({ today, onClose }) {
  const s = useStore();

  // Existing reminders, oldest first.
  const reminders = all(s, 'reminders');
  reminders.sort((a, b) => (a.created < b.created ? -1 : 1));

  // What is currently typed/selected in the "add reminder" form.
  const [title, setTitle] = useState('');
  const [type, setType] = useState('weekly');              // 'weekly' | 'monthly' | 'yearly'
  const [days, setDays] = useState([new Date().getDay()]); // weekly: which weekdays (0 = Sunday)
  const [day, setDay] = useState(1);                       // monthly / yearly: day of the month
  const [month, setMonth] = useState(new Date().getMonth()); // yearly: which month (0 = January)

  // Runs when you press "Add reminder".
  function addReminder(event) {
    event.preventDefault();
    if (!title.trim()) return;
    if (type === 'weekly' && days.length === 0) return; // weekly needs at least one weekday

    // Build the "rule" that says when it repeats (see occursOn in lib.js).
    let rule;
    if (type === 'weekly') rule = { type, days: [...days].sort() };
    else if (type === 'monthly') rule = { type, day };
    else rule = { type, month, day };

    commit('reminder added', [
      { t: 'reminders', id: uid(), patch: { title: title.trim(), rule, created: today } },
    ]);
    setTitle('');
    sass('reminderAdded', [], { chance: 0.6 });
  }

  function deleteReminder(reminder) {
    commit('reminder deleted', [{ t: 'reminders', id: reminder.id, set: null }]);
    toast(quip('reminderDeleted'), { undoable: true });
  }

  // Click a weekday button: add it to the list, or remove it if it was already chosen.
  function toggleWeekday(index) {
    if (days.includes(index)) setDays(days.filter((d) => d !== index));
    else setDays([...days, index]);
  }

  // Keep the day number between 1 and 31.
  function changeDay(event) {
    const typed = +event.target.value || 1; // "+" turns the text into a number
    setDay(Math.min(31, Math.max(1, typed)));
  }

  return (
    <Modal title="Reminders" onClose={onClose}>
      <p className="hint">
        Repeating tasks. They show up in the list on their day and come back after you tick them. Forever. Like laundry.
      </p>

      {/* The existing reminders */}
      <ul className="plain-list">
        {reminders.map((reminder) => (
          <li key={reminder.id}>
            <span className="repeat">↻</span>
            <span className="grow">{reminder.title}</span>
            <span className="mono">{ruleText(reminder.rule)}</span>
            <button
              className="del show"
              aria-label={`Delete ${reminder.title}`}
              onClick={() => deleteReminder(reminder)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {reminders.length === 0 && <p className="empty small">{empties.reminders}</p>}

      {/* The form to add a new one */}
      <form className="stack" onSubmit={addReminder}>
        <input
          className="field"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Take out the trash…"
          aria-label="Reminder"
        />

        {/* Choose weekly / monthly / yearly */}
        <div className="seg-row">
          {['weekly', 'monthly', 'yearly'].map((kind) => (
            <button
              type="button"
              key={kind}
              className={'chip' + (type === kind ? ' solid' : '')}
              onClick={() => setType(kind)}
            >
              {kind}
            </button>
          ))}
        </div>

        {/* Weekly: pick weekdays */}
        {type === 'weekly' && (
          <div className="seg-row">
            {DOW.map((name, index) => (
              <button
                type="button"
                key={name}
                className={'chip' + (days.includes(index) ? ' solid' : '')}
                onClick={() => toggleWeekday(index)}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Monthly / yearly: pick a day (and a month for yearly) */}
        {type !== 'weekly' && (
          <div className="seg-row">
            {type === 'yearly' && (
              <select
                className="field"
                value={month}
                onChange={(event) => setMonth(+event.target.value)}
                aria-label="Month"
              >
                {MON.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <label className="target">
              day <input type="number" min="1" max="31" value={day} onChange={changeDay} />
            </label>
          </div>
        )}

        <div className="seg-row">
          <button className="btn-add" type="submit">
            Add reminder
          </button>
        </div>
      </form>
    </Modal>
  );
}


// ======================================================================
// SETTINGS WINDOW (sign in + backup)
// ======================================================================

// The sign-in part. How signing in works:
//   1. You type your email and press "Email me" -> sendCode() asks Supabase to email you.
//   2. The email has a link AND a code. Click the link, or type the code here -> verifyCode().
//   3. Once signed in, sync.js takes over and keeps your data in sync.
function Account() {
  const sync = useSync(); // { user, sync: 'signed-out' | 'syncing' | 'synced' | 'error' | 'off', error }

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);   // has the email been sent yet?
  const [busy, setBusy] = useState(false);   // waiting for the server?
  const [error, setError] = useState('');    // an error message to show

  // No Supabase keys in the settings file (.env.local): syncing is switched off.
  if (!supabase) {
    return <p className="hint">Sync is off: this copy has no Supabase keys, so everything stays in this browser.</p>;
  }

  // Already signed in: show who you are, plus Sync now and Sign out buttons.
  if (sync.user) {
    let statusText;
    if (sync.sync === 'syncing') statusText = 'Syncing…';
    else if (sync.sync === 'error') statusText = `Sync failed: ${sync.error}`;
    else statusText = 'Everything is synced.';

    return (
      <div className="stack">
        <p className="hint">
          Signed in as <b>{sync.user.email}</b>. {statusText}
        </p>
        <div className="seg-row">
          <button className="btn-ghost" onClick={syncNow}>
            Sync now
          </button>
          <button className="btn-ghost danger" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Run a slow action (talking to the server) while showing "Hold on…" and catching any error.
  async function runWithStatus(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy(false);
  }

  // Runs when you press Enter or the main button.
  function submit(event) {
    event.preventDefault();

    if (sent) {
      // Step 2: check the code you typed.
      runWithStatus(async () => {
        await verifyCode(email, code.trim());
        toast(quip('synced'));
      });
    } else {
      // Step 1: send the email.
      runWithStatus(async () => {
        await sendCode(email);
        setSent(true);
      });
    }
  }

  // Go back to step 1 so you can use a different email.
  function useAnotherEmail() {
    setSent(false);
    setCode('');
  }

  // Text for the main button.
  let buttonText;
  if (busy) buttonText = 'Hold on…';
  else if (sent) buttonText = 'Sign in';
  else buttonText = 'Email me';

  return (
    <form className="stack" onSubmit={submit}>
      <p className="hint">
        {sent
          ? 'Check your email. Click the link in it, or type the code here.'
          : 'Sign in to sync between your laptop and phone. No password, just an email.'}
      </p>

      <input
        className="field"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        disabled={sent}
      />

      {/* The code box only appears after the email was sent */}
      {sent && (
        <input
          className="field"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Code from the email"
          aria-label="Code"
        />
      )}

      {error && <p className="error">{error}</p>}

      <div className="seg-row">
        <button className="btn-add" type="submit" disabled={busy}>
          {buttonText}
        </button>
        {sent && (
          <button type="button" className="btn-ghost" onClick={useAnotherEmail}>
            Use another email
          </button>
        )}
      </div>
    </form>
  );
}

export function SettingsModal({ onClose }) {
  // "Download a backup": makes a temporary link to a .json file and clicks it for you.
  function downloadBackup() {
    const file = new Blob([exportJson()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = 'todolist-backup.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <h3 className="mono">Account</h3>
      <Account />

      <h3 className="mono">Your data</h3>
      <div className="seg-row">
        <button className="btn-ghost" onClick={downloadBackup}>
          Download a backup
        </button>
      </div>
      <p className="hint">
        Ctrl+Z undoes anything. Ctrl+Shift+Z brings it back, in case you regret your regret.
      </p>
    </Modal>
  );
}


// ======================================================================
// KEYBOARD SHORTCUTS WINDOW
// ======================================================================
// This is only the TEXT shown in the cheat sheet. The shortcuts themselves are coded in
// App.jsx (anywhere), Tasks.jsx (on a task) and Calendar.jsx (on the calendar).
// Each group is [group name, list of [key, what it does]].
const KEYS = [
  [
    'Anywhere',
    [
      ['n', 'Add a task'],
      ['t', 'Today only, on or off'],
      ['c', 'Calendar'],
      ['l', 'Task list'],
      ['o', 'Notes'],
      ['r', 'Reminders'],
      ['Ctrl Z', 'Undo (Shift: redo)'],
      ['?', 'This list'],
    ],
  ],
  [
    'On a task',
    [
      ['↑ ↓ or j k', 'Move between tasks'],
      ['Space or x', 'Done, or not done'],
      ['Enter', 'Open a project, or rename a task'],
      ['e', 'Rename'],
      ['d', 'Pick a date'],
      ['[  ]', 'Due a day earlier or later'],
      ['Alt ↑ ↓', 'Reorder'],
      ['m', 'Menu'],
      ['Delete', 'Delete (Ctrl Z brings it back)'],
    ],
  ],
  [
    'On the calendar',
    [
      ['← → ↑ ↓', 'Move between days'],
      ['Enter', 'Show that day only'],
    ],
  ],
];

export function KeysModal({ onClose }) {
  return (
    <Modal title="Keyboard" onClose={onClose}>
      <div className="keys">
        {KEYS.map(([group, rows]) => (
          <section key={group}>
            <h3 className="mono">{group}</h3>
            <dl>
              {rows.map(([key, what]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
