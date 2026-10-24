// App.jsx = the top of the app. It puts the three columns on screen
// (Calendar, Tasks, Notes) and handles the keyboard shortcuts.
//
// A quick tour:
//   <Calendar>  the left column  -> components/Calendar.jsx
//   <Tasks>     the middle column -> components/Tasks.jsx
//   <Notes>     the right column  -> components/Side.jsx
//   Modals (pop-up windows)       -> components/Modals.jsx
//   Toasts (little messages)      -> components/Fire.jsx

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { getState, redo } from './store.js';
import { brokenStreaks, quip, useToday } from './lib.js';
import Calendar from './components/Calendar.jsx';
import Tasks, { TaskDnd } from './components/Tasks.jsx';
import { Notes } from './components/Side.jsx';
import { DailyEditModal, KeysModal, RemindersModal } from './components/Modals.jsx';
import { SettingsSheet } from './components/Settings.jsx';
import { Toasts, doUndo, toast } from './components/Fire.jsx';
import Icon from './components/Icons.jsx';
import { Resizer, useColumns } from './components/Columns.jsx';
import Wallpaper from './Wallpaper.jsx';

// The three buttons in the bottom bar on a phone: [internal name, label shown].
const TABS = [
  ['calendar', 'Calendar', 'calendar'],
  ['tasks', 'Tasks', 'list'],
  ['notes', 'Notes', 'note'],
];

const TASK_FILTERS = ['today', 'week', 'month', 'undated', 'all'];

// Which task filter was left on last time? (Storage can be blocked, e.g. in a private window.)
function readTaskFilter() {
  try {
    const saved = localStorage.getItem('todolist:task-filter');
    if (TASK_FILTERS.includes(saved)) return saved;
    return localStorage.getItem('todolist:today-only') === '1' ? 'today' : 'all';
  } catch {
    return 'all';
  }
}

export default function App() {
  const today = useToday(); // today's date, e.g. "2026-10-18"
  const grid = useRef(null); // the page's grid, for the column widths
  const columns = useColumns(grid);

  // ---- things the screen remembers (React "state") ----
  // Calendar dates are transient; the task filter is remembered across sessions.
  const [selection, setSelection] = useState(() => ({ mode: readTaskFilter(), date: null }));
  const filter = selection.mode;
  const day = filter === 'today' ? today : filter === 'date' ? selection.date : null;
  const setDay = useCallback(
    (value) =>
      setSelection((previous) => {
        const current = previous.mode === 'today' ? today : previous.mode === 'date' ? previous.date : null;
        const next = typeof value === 'function' ? value(current) : value;
        if (next === today) return { mode: 'today', date: null };
        if (next) return { mode: 'date', date: next };
        return { mode: 'all', date: null };
      }),
    [today]
  );
  const setFilter = useCallback((mode) => setSelection({ mode, date: null }), []);
  useEffect(() => {
    try {
      const savedFilter = filter === 'date' ? 'all' : filter;
      localStorage.setItem('todolist:task-filter', savedFilter);
      localStorage.setItem('todolist:today-only', savedFilter === 'today' ? '1' : '0');
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  }, [filter]);
  const [modal, setModal] = useState(null); // which pop-up is open: 'reminders' | 'settings' | 'keys' | null
  const [tab, setTab] = useState('tasks');  // which column a phone is showing
  const [editingDaily, setEditingDaily] = useState(null); // id of the daily being edited, or null


  // ---- Effect 1: once a day, when the app opens, point out a streak that died yesterday ----
  useEffect(() => {
    // We remember the last day we did this, so it only happens once per day.
    if (localStorage.getItem('todolist:roasted') === today) return;
    localStorage.setItem('todolist:roasted', today);

    const deadStreak = brokenStreaks(getState(), today)[0]; // the biggest broken streak, if any
    if (deadStreak) {
      // Wait a moment so the message appears after the page has loaded.
      setTimeout(() => toast(quip('broken', deadStreak.name, deadStreak.was)), 900);
    }
  }, [today]);


  // ---- Effect 2: while the Shift key is held, show the Rename and Delete buttons ----
  // We put an attribute called data-shift on the page. The CSS (app.css) reads it.
  useEffect(() => {
    const root = document.documentElement;

    function onShiftKey(event) {
      if (event.key !== 'Shift') return;
      const shiftIsDown = event.type === 'keydown';
      root.toggleAttribute('data-shift', shiftIsDown); // add the attribute if down, remove if up
    }

    function clearShift() {
      root.removeAttribute('data-shift');
    }

    window.addEventListener('keydown', onShiftKey);
    window.addEventListener('keyup', onShiftKey);
    window.addEventListener('blur', clearShift); // clicking away from the window counts as letting go

    // Cleanup when the app closes.
    return () => {
      window.removeEventListener('keydown', onShiftKey);
      window.removeEventListener('keyup', onShiftKey);
      window.removeEventListener('blur', clearShift);
      clearShift();
    };
  }, []);


  // ---- Effect 3: keyboard shortcuts ----
  // These work anywhere EXCEPT inside a text box (where typing and the browser's own undo should win).
  useEffect(() => {
    // Show a column and move the cursor into it.
    // On a phone the three columns are tabs, so we show the right tab first.
    function goTo(column, selector) {
      setTab(column);
      requestAnimationFrame(() => {
        const element = document.querySelector(selector) ?? document.querySelector(`.col-${column}`);
        element?.focus();
      });
    }

    function onKey(event) {
      // Ignore the key if you're typing in a box, or something else already handled it.
      if (event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.defaultPrevented) return;

      // Ctrl+Z = undo, Ctrl+Shift+Z = redo (Cmd on a Mac).
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() !== 'z') return;
        event.preventDefault();
        if (event.shiftKey) {
          if (redo()) toast(quip('redo'));
        } else {
          doUndo();
        }
        return;
      }

      if (event.altKey) return;

      // The single-key shortcuts. Each key runs a small action.
      const key = event.key;
      let action = null;

      if (key === 'n' || key === 'a' || key === '/') action = () => goTo('tasks', '#task-title');       // new task
      else if (key === 'l') action = () => goTo('tasks', '.task-list > li.task[tabindex]');            // task list
      else if (key === 'c') action = () => goTo('calendar', '.day[tabindex="0"]');                     // calendar
      else if (key === 'o') action = () => goTo('notes', '.note-item');                                // notes
      else if (key === 't') action = () => setDay((current) => (current === today ? null : today));    // toggle "today"
      else if (key === 'r') action = () => setModal('reminders');                                      // reminders window
      else if (key === '?') action = () => setModal('keys');                                          // shortcuts window

      if (!action) return; // not one of our keys
      event.preventDefault();
      action();
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [today, setDay]);


  // ---- What gets drawn on the screen ----
  return (
    <>
      {/* The animated background and the theme. It sits behind everything. */}
      <Wallpaper />

      <div className="app" data-tab={tab} ref={grid} style={{ gridTemplateColumns: columns.template }} onClick={columns.onClick}>
        {/* TaskDnd wraps Calendar and Tasks so you can drag a task onto a calendar day. */}
        <TaskDnd day={day} filter={filter}>
          <Calendar today={today} day={day} setDay={setDay} open={setModal} editDaily={setEditingDaily} />
          <Resizer index={0} grid={grid} {...columns} />
          <Tasks today={today} day={day} filter={filter} setDay={setDay} setFilter={setFilter} />
        </TaskDnd>

        <Resizer index={1} grid={grid} {...columns} />
        <section className="col col-notes" aria-label="Notes">
          <Notes />
        </section>
      </div>

      {/* The bottom bar. It is only visible on a phone (see app.css). */}
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-label={label} title={label}>
            <Icon name={icon} size={22} />
          </button>
        ))}
        <button onClick={doUndo} aria-label="Undo" title="Undo">
          <Icon name="undo" size={22} />
        </button>
      </nav>

      {/* Pop-up windows. Only the one named in `modal` is shown. */}
      <AnimatePresence>
        {modal === 'reminders' && <RemindersModal key="r" today={today} onClose={() => setModal(null)} />}
        {modal === 'settings' && <SettingsSheet key="s" onClose={() => setModal(null)} />}
        {modal === 'keys' && <KeysModal key="k" onClose={() => setModal(null)} />}
        {editingDaily && <DailyEditModal key="d" id={editingDaily} onClose={() => setEditingDaily(null)} />}
      </AnimatePresence>

      {/* The little messages that slide in at the bottom. */}
      <Toasts />
    </>
  );
}
