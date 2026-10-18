import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { getState, redo } from './store.js';
import { brokenStreaks, quips, useToday } from './lib.js';
import Calendar from './components/Calendar.jsx';
import Tasks, { TaskDnd } from './components/Tasks.jsx';
import { Notes } from './components/Side.jsx';
import { KeysModal, RemindersModal, SettingsModal } from './components/Modals.jsx';
import { Toasts, doUndo, toast } from './components/Fire.jsx';

const TABS = [['calendar', 'Calendar'], ['tasks', 'Tasks'], ['notes', 'Notes']];

export default function App() {
  const today = useToday();
  const [day, setDay] = useState(null);       // a day picked on the calendar, or null for "everything"
  const [modal, setModal] = useState(null);   // 'reminders' | 'settings' | null
  const [tab, setTab] = useState('tasks');    // which column a phone is showing

  // Once a day, on opening: point out a streak that died yesterday.
  useEffect(() => {
    if (localStorage.getItem('todolist:roasted') === today) return;
    localStorage.setItem('todolist:roasted', today);
    const dead = brokenStreaks(getState(), today)[0];
    if (dead) setTimeout(() => toast(quips.broken(dead.name, dead.was)), 900);
  }, [today]);

  // Keyboard, anywhere except inside a text box (where typing and the browser's own undo win).
  useEffect(() => {
    // On a phone the three columns are tabs, so show the right one before moving focus into it.
    const go = (to, selector) => { setTab(to); requestAnimationFrame(() => (document.querySelector(selector) ?? document.querySelector(`.col-${to}`))?.focus()); };
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() !== 'z') return;
        e.preventDefault();
        if (e.shiftKey) { if (redo()) toast('Redone. Make up your mind.'); }
        else doUndo();
        return;
      }
      if (e.altKey) return;
      const to = {
        n: () => go('tasks', '#task-title'), a: () => go('tasks', '#task-title'), '/': () => go('tasks', '#task-title'),
        l: () => go('tasks', '.task-list > li.task[tabindex]'),
        c: () => go('calendar', '.day[tabindex="0"]'),
        o: () => go('notes', '.note-item'),
        t: () => setDay((cur) => (cur === today ? null : today)),
        r: () => setModal('reminders'), '?': () => setModal('keys')
      }[e.key];
      if (!to) return;
      e.preventDefault();
      to();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [today]);

  return (
    <>
      <div className="app" data-tab={tab}>
        <TaskDnd day={day}>
          <Calendar today={today} day={day} setDay={setDay} open={setModal} />
          <Tasks today={today} day={day} setDay={setDay} />
        </TaskDnd>
        <section className="col col-notes" aria-label="Notes">
          <Notes />
        </section>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
        <button onClick={doUndo} aria-label="Undo">↶</button>
      </nav>

      <AnimatePresence>
        {modal === 'reminders' && <RemindersModal key="r" today={today} onClose={() => setModal(null)} />}
        {modal === 'settings' && <SettingsModal key="s" onClose={() => setModal(null)} />}
        {modal === 'keys' && <KeysModal key="k" onClose={() => setModal(null)} />}
      </AnimatePresence>
      <Toasts />
    </>
  );
}
