// App.jsx = the top of the app. It puts the three columns on screen
// (Calendar, Tasks, Notes) and handles the keyboard shortcuts.
//
// A quick tour:
//   <Calendar>  the left column  -> components/Calendar.jsx
//   <Tasks>     the middle column -> components/Tasks.jsx
//   <Notes>     the right column  -> components/Side.jsx
//   Modals (pop-up windows)       -> components/Modals.jsx
//   Toasts (little messages)      -> components/Fire.jsx

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { all, ensureTaskCreatedDates, getState, redo } from './store.js';
import { brokenStreaks, quip, useToday } from './lib.js';
import Calendar from './components/Calendar.jsx';
import Tasks, { TaskDnd } from './components/Tasks.jsx';
import { Notes } from './components/Side.jsx';
import { DailyEditModal, KeysModal, RemindersModal } from './components/Modals.jsx';
import Search from './components/Search.jsx';
// These windows are loaded the first time they open, so the first screen downloads less.
const SettingsSheet = lazy(() => import('./components/Settings.jsx').then((m) => ({ default: m.SettingsSheet })));
const AccountModal = lazy(() => import('./components/Settings.jsx').then((m) => ({ default: m.AccountModal })));
const SettingsPage = lazy(() => import('./components/Settings.jsx').then((m) => ({ default: m.SettingsPage })));
import { Toasts, doUndo, toast } from './components/Fire.jsx';
import Icon from './components/Icons.jsx';
import TabBar from './components/TabBar.jsx';
const Onboarding = lazy(() => import('./components/Onboarding.jsx'));
import { Resizer, useColumns } from './components/Columns.jsx';
import { useSync } from './sync.js';
import { useAppearance } from './appearance.js';
import { startPushSync, usePushPrompt } from './push.js';
import Wallpaper from './Wallpaper.jsx';
import { storage } from './storage.js';

// The three views in the bottom bar on a phone: [internal name, label shown, icon]. (Settings is the fourth button there.)
const TABS = [
  ['calendar', 'Calendar', 'calendar'],
  ['tasks', 'Tasks', 'list'],
  ['notes', 'Notes', 'note'],
];

const TASK_FILTERS = ['today', 'week', 'month', 'undated', 'all'];
const TASK_SORTS = ['custom', 'due', 'added'];

// Which task filter was left on last time? (Storage can be blocked, e.g. in a private window.)
function readTaskFilter() {
  try {
    const saved = storage.get('todolist:task-filter');
    if (TASK_FILTERS.includes(saved)) return saved;
    return storage.get('todolist:today-only') === '1' ? 'today' : 'all';
  } catch {
    return 'all';
  }
}

function readTaskSort() {
  try {
    const saved = storage.get('todolist:task-sort');
    return TASK_SORTS.includes(saved) ? saved : 'due';
  } catch {
    return 'due';
  }
}

// First launch: show the tour (components/Onboarding.jsx) to someone with nothing saved yet. Anyone who already has
// tasks, dailies, notes or reminders (for example from before the tour existed) counts as having seen it.
const TOUR_KEY = 'todolist:onboarded';
function needsTour() {
  if (storage.get(TOUR_KEY)) return false;
  const s = getState();
  const hasData = ['tasks', 'dailies', 'notes', 'reminders'].some((table) => all(s, table).length > 0);
  if (hasData) storage.set(TOUR_KEY, '1');
  return !hasData;
}

export default function App() {
  const today = useToday(); // today's date, e.g. "2026-10-18"
  const grid = useRef(null); // the page's grid, for the column widths
  const columns = useColumns(grid);

  // ---- things the screen remembers (React "state") ----
  // Calendar dates are transient; the task filter is remembered across sessions.
  const [selection, setSelection] = useState(() => ({ mode: readTaskFilter(), date: null }));
  // With "Group tasks by date" on (Settings > General) the time-period switcher is not used: week, month and
  // no-date become sections of the "all" list. Picking a day on the calendar still narrows the list to that day.
  const { taskGroups } = useAppearance();
  const mode = selection.mode;
  const filter = taskGroups && ['week', 'month', 'undated'].includes(mode) ? 'all' : mode;
  const day = mode === 'today' ? today : mode === 'date' ? selection.date : null;
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
  const [sort, setSort] = useState(readTaskSort);
  useEffect(() => {
    try {
      const savedFilter = filter === 'date' ? 'all' : filter;
      storage.set('todolist:task-filter', savedFilter);
      storage.set('todolist:today-only', savedFilter === 'today' ? '1' : '0');
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  }, [filter]);
  useEffect(() => {
    try {
      storage.set('todolist:task-sort', sort);
    } catch {
      // storage unavailable: the choice just isn't remembered
    }
  }, [sort]);
  useEffect(() => {
    ensureTaskCreatedDates();
  }, []);
  const sync = useSync(); // the dot on the Settings button in the phone's bottom bar
  const [modal, setModal] = useState(() => (needsTour() ? 'tour' : null)); // which pop-up is open: 'tour' | 'reminders' | 'settings' | 'account' | 'keys' | 'search' | null
  const [tab, setTab] = useState('tasks');  // which page a phone is showing: calendar | tasks | notes | settings
  const [settingsTab, setSettingsTab] = useState('style'); // the tab open on the phone's Settings page: style | general | account

  // On a phone Settings (and Account, which lives in it) is a page of its own; on a computer they are a sheet and a window.
  const [isPhone, setIsPhone] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const change = () => setIsPhone(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const openModal = useCallback(
    (name) => {
      if (isPhone && (name === 'settings' || name === 'account')) {
        if (name === 'account') setSettingsTab('account');
        setModal(null);
        setTab('settings');
      } else {
        setModal(name);
      }
    },
    [isPhone]
  );
  const [editingDaily, setEditingDaily] = useState(null); // id of the daily being edited, or null


  // ---- Effect 1: once a day, when the app opens, point out a streak that died yesterday ----
  useEffect(() => {
    // We remember the last day we did this, so it only happens once per day.
    if (storage.get('todolist:roasted') === today) return;
    storage.set('todolist:roasted', today);

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

    let shiftIsDown = false;

    function isTyping() {
      return !!document.activeElement?.closest('input, textarea, select, [contenteditable]');
    }

    function updateShiftVisibility() {
      root.toggleAttribute('data-shift', shiftIsDown && !isTyping());
    }

    function onShiftKey(event) {
      if (event.key !== 'Shift') return;
      shiftIsDown = event.type === 'keydown';
      updateShiftVisibility();
    }

    function clearShift() {
      shiftIsDown = false;
      updateShiftVisibility();
    }

    window.addEventListener('keydown', onShiftKey);
    window.addEventListener('keyup', onShiftKey);
    window.addEventListener('focusin', updateShiftVisibility);
    window.addEventListener('blur', clearShift); // clicking away from the window counts as letting go

    // Cleanup when the app closes.
    return () => {
      window.removeEventListener('keydown', onShiftKey);
      window.removeEventListener('keyup', onShiftKey);
      window.removeEventListener('focusin', updateShiftVisibility);
      window.removeEventListener('blur', clearShift);
      clearShift();
    };
  }, []);


  // ---- Ctrl+K (Cmd+K on a Mac) opens the search, even while typing in a box ----
  useEffect(() => {
    function onSearchKey(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault(); // (the browser would otherwise use it to focus its own search box)
      setModal((current) => (current === 'search' ? null : 'search'));
    }
    window.addEventListener('keydown', onSearchKey);
    return () => window.removeEventListener('keydown', onSearchKey);
  }, []);

  // Go to what was picked in the search: show its column (opening it if it is squeezed into a strip), then tell
  // that column which item to show. (The columns listen for these two events, see Tasks.jsx and Side.jsx.)
  function pickResult(result) {
    setModal(null);
    if (result.kind === 'daily') return setEditingDaily(result.id);
    if (result.kind === 'reminder') return setModal('reminders');

    const column = result.kind === 'task' ? 1 : 2;
    if (columns.cols.collapsed[column]) columns.open(column);
    if (result.kind === 'task') {
      setFilter('all'); // so the task is in the list, whatever view was on
      setTab('tasks');
      setTimeout(() => window.dispatchEvent(new CustomEvent('todolist:reveal-task', { detail: result.id })), 60);
    } else {
      setTab('notes');
      window.dispatchEvent(new CustomEvent('todolist:open-note', { detail: result.id }));
    }
  }

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
      if (event.target.closest?.('input, textarea, select, [contenteditable]')) return; // (closest: the target can be the page itself)
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


  // Keep the push notification schedule up to date (does nothing until notifications are turned on in Settings).
  useEffect(() => startPushSync(), []);
  const pushPrompt = usePushPrompt();

  // Settings can open the other windows (the shortcut list): they ask here.
  useEffect(() => {
    const openWindow = (event) => {
      setModal(event.detail);
    };
    window.addEventListener('todolist:open-modal', openWindow);
    return () => window.removeEventListener('todolist:open-modal', openWindow);
  }, []);


  // ---- What gets drawn on the screen ----
  return (
    <MotionConfig reducedMotion="user">{/* animations follow the device's own "reduce motion" setting */}
      {/* The animated background and the theme. It sits behind everything. */}
      <Wallpaper />

      <div className="app" data-tab={tab} ref={grid} style={{ gridTemplateColumns: columns.template }} onClick={columns.onClick}>
        {/* TaskDnd wraps Calendar and Tasks so you can drag a task onto a calendar day. */}
        <TaskDnd day={day} filter={filter} sort={sort}>
          <Calendar today={today} day={day} setDay={setDay} open={openModal} editDaily={setEditingDaily} />
          <Resizer index={0} grid={grid} {...columns} />
          <Tasks today={today} day={day} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} onReminders={() => setModal('reminders')} />
        </TaskDnd>

        <Resizer index={1} grid={grid} {...columns} />
        <section className="col col-notes" aria-label="Notes">
          <Notes onSearch={() => setModal('search')} />
        </section>

        {isPhone && tab === 'settings' && (
          <Suspense fallback={null}>
            <SettingsPage tab={settingsTab} setTab={setSettingsTab} />
          </Suspense>
        )}
      </div>

      {/* The bottom bar. It is only visible on a phone (see app.css). */}
      <TabBar
        tabs={TABS}
        tab={tab}
        setTab={setTab}
        settingsOpen={isPhone ? tab === 'settings' : modal === 'settings'}
        openSettings={() => openModal('settings')}
      />

      {/* Pop-up windows. Only the one named in `modal` is shown. */}
      <Suspense fallback={null}>
      <AnimatePresence>
        {modal === 'tour' && (
          <Onboarding
            key="o"
            onClose={(next) => {
              storage.set(TOUR_KEY, '1');
              next === 'settings' || next === 'account' ? openModal(next) : setModal(next ?? null);
            }}
          />
        )}
        {modal === 'reminders' && <RemindersModal key="r" today={today} onClose={() => setModal(null)} />}
        {modal === 'settings' && <SettingsSheet key="s" onClose={() => setModal(null)} />}
        {modal === 'account' && <AccountModal key="a" onClose={() => setModal(null)} />}
        {modal === 'keys' && <KeysModal key="k" onClose={() => setModal(null)} />}
        {modal === 'search' && <Search key="f" onClose={() => setModal(null)} onPick={pickResult} />}
        {editingDaily && <DailyEditModal key="d" id={editingDaily} onClose={() => setEditingDaily(null)} />}
      </AnimatePresence>
      </Suspense>

      {/* The little messages that slide in at the bottom, with the one-time notifications card above them. */}
      <Toasts>
        {pushPrompt.show && modal !== 'tour' && (
          <div className="push-prompt" role="dialog" aria-label="Notifications">
            <span>Get a notification when a task or reminder is due?</span>
            <button className="btn-add" onClick={() => pushPrompt.accept().then((problem) => problem && toast(problem))}>
              Turn on
            </button>
            <button className="btn-ghost" onClick={pushPrompt.dismiss}>
              Not now
            </button>
          </div>
        )}
      </Toasts>
    </MotionConfig>
  );
}
