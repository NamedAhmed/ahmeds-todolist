// Modals.jsx = the pop-up windows (a "modal" is a window that appears over the page).
//
//   (Settings is not here: it is a sheet that slides up from the bottom, see Settings.jsx.)
//   Modal           the empty window frame the others use (exported: DatePicker.jsx uses it too) (dark backdrop, Close button, Esc to close)
//   RemindersModal  list and add repeating reminders
//   DailyEditModal  rename a daily and change its colour
//   KeysModal       the keyboard shortcut cheat sheet
//
// App.jsx decides which one is open.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { all, commit, uid, useStore } from '../store.js';
import { DAILY_COLORS, DOW, MON, empties, quip, ruleText } from '../lib.js';
import { sass, toast } from './Fire.jsx';

// A CSS selector that finds everything you can Tab to inside the window.
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';


// ======================================================================
// THE WINDOW FRAME
// ======================================================================
// Props: title (shown at the top), onClose (function to close it), wide (a bigger window), children (what goes inside).
export function Modal({ title, onClose, wide, children }) {
  const box = useRef(null); // points at the window's HTML element
  const close = useRef(onClose); // the latest onClose, so the effect below runs once per window, not on every re-draw
  close.current = onClose;

  // Keyboard behaviour for accessibility:
  //  - when it opens, the cursor moves inside it
  //  - Tab stays inside the window (it loops around)
  //  - Escape closes it
  //  - when it closes, the cursor goes back to where it was before
  useEffect(() => {
    const opener = document.activeElement; // what had focus before the window opened

    // Focus the first text box if there is one, otherwise the window itself. (Not a time or date box: on a phone
    // focusing one opens the phone's own picker.)
    const firstInput = box.current.querySelector('input:not([type=time]):not([type=date]):not([type=checkbox]), select, textarea');
    (firstInput ?? box.current).focus();

    function onKey(event) {
      if (event.key === 'Escape') {
        close.current();
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
  }, []);

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
        className={'modal' + (wide ? ' wide' : '')}
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

  // Existing reminders: single ones by their date first, then the repeating ones, oldest first.
  const reminders = all(s, 'reminders');
  reminders.sort((a, b) => {
    const once = (r) => (r.rule.type === 'once' ? 0 : 1);
    if (once(a) !== once(b)) return once(a) - once(b);
    if (once(a) === 0) return a.rule.date < b.rule.date ? -1 : 1;
    return a.created < b.created ? -1 : 1;
  });

  // What is currently typed/selected in the "add reminder" form.
  const [title, setTitle] = useState('');
  const [type, setType] = useState('once');                // 'once' | 'weekly' | 'monthly' | 'yearly'
  const [date, setDate] = useState(today);                 // once: which day
  const [time, setTime] = useState('');                    // the time of day to be notified at ('' = no time)
  const [days, setDays] = useState([new Date().getDay()]); // weekly: which weekdays (0 = Sunday)
  const [day, setDay] = useState(1);                       // monthly / yearly: day of the month
  const [month, setMonth] = useState(new Date().getMonth()); // yearly: which month (0 = January)

  // Runs when you press "Add reminder".
  function addReminder(event) {
    event.preventDefault();
    if (!title.trim()) return;
    if (type === 'weekly' && days.length === 0) return; // weekly needs at least one weekday
    if (type === 'once' && !date) return;

    // Build the "rule" that says when it happens (see occursOn in lib.js).
    let rule;
    if (type === 'once') rule = { type, date };
    else if (type === 'weekly') rule = { type, days: [...days].sort() };
    else if (type === 'monthly') rule = { type, day };
    else rule = { type, month, day };

    commit('reminder added', [
      { t: 'reminders', id: uid(), patch: { title: title.trim(), rule, time: time || null, created: today } },
    ]);
    setTitle('');
    sass('reminderAdded', [], { chance: 0.6 });
  }

  function deleteReminder(reminder) {
    commit('reminder deleted', [{ t: 'reminders', id: reminder.id, set: null }]);
    toast(quip('reminderDeleted'), { undoable: true });
  }

  function setReminderTime(reminder, value) {
    commit('reminder time changed', [{ t: 'reminders', id: reminder.id, patch: { time: value || null } }]);
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
        A reminder shows up in the list on its day, and notifies you at its time if you gave it one (turn notifications on in Settings). A single one happens once; a repeating one comes back after you tick it. Forever. Like laundry.
      </p>

      {/* The existing reminders */}
      <ul className="plain-list">
        {reminders.map((reminder) => (
          <li key={reminder.id}>
            <span className="repeat" title={reminder.rule.type === 'once' ? 'Happens once' : 'Repeats'}>
              {reminder.rule.type === 'once' ? '•' : '↻'}
            </span>
            <span className="grow">{reminder.title}</span>
            <span className="mono">{ruleText(reminder.rule)}</span>
            <input
              className="reminder-time"
              type="time"
              value={reminder.time || ''}
              onChange={(event) => setReminderTime(reminder, event.target.value)}
              aria-label={`Time for ${reminder.title}`}
              title="Time of day to be notified"
            />
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

        {/* Choose once / weekly / monthly / yearly */}
        <div className="seg-row" role="group" aria-label="How often">
          {[['once', 'Just once'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([kind, label]) => (
            <button
              type="button"
              key={kind}
              className={'chip' + (type === kind ? ' solid' : '')}
              onClick={() => setType(kind)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Once: pick the day */}
        {type === 'once' && (
          <div className="seg-row">
            <label className="target">
              on <input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
        )}

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
        {(type === 'monthly' || type === 'yearly') && (
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

        {/* The time of day to be notified at (optional) */}
        <div className="seg-row">
          <label className="target">
            notify me at <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </label>
          {time && (
            <button type="button" className="btn-ghost" onClick={() => setTime('')}>
              No time
            </button>
          )}
        </div>

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
// EDIT A DAILY WINDOW
// ======================================================================
// Opened by clicking a daily's name in the Calendar column. You can rename it and pick its colour:
// one of the ten palette colours, or any colour from the colour picker at the end of the row.
// Props: id (which daily), onClose.
export function DailyEditModal({ id, onClose }) {
  const s = useStore();
  const daily = s.dailies[id];
  const missing = !daily || daily._deleted; // for example it was removed on another device

  const [name, setName] = useState(daily?.name ?? '');
  const [color, setColor] = useState(daily?.color ?? DAILY_COLORS[0]);

  useEffect(() => {
    if (missing) onClose();
  }, [missing, onClose]);
  if (missing) return null;

  function save(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return; // a daily needs a name
    commit('daily edited', [{ t: 'dailies', id, patch: { name: trimmed, color } }]);
    onClose();
  }

  return (
    <Modal title="Edit daily" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <input
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          aria-label="Daily name"
        />

        <h3 className="mono">Colour</h3>
        <div className="palette">
          {DAILY_COLORS.map((swatch) => (
            <button
              type="button"
              key={swatch}
              className={'palette-swatch' + (color === swatch ? ' picked' : '')}
              style={{ background: swatch }}
              aria-label={`Colour ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => setColor(swatch)}
            />
          ))}
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Custom colour" />
        </div>

        <div className="seg-row">
          <button className="btn-add" type="submit" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
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
      ['Ctrl K', 'Search everything'],
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
