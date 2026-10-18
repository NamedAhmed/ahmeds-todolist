import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { getState, redo } from './store.js';
import { brokenStreaks, quips, useToday } from './lib.js';
import Calendar from './components/Calendar.jsx';
import Tasks from './components/Tasks.jsx';
import { Notes } from './components/Side.jsx';
import { RemindersModal, SettingsModal } from './components/Modals.jsx';
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

  // Ctrl+Z anywhere, except inside a text box, where the browser's own undo should win.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (e.target.closest('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      if (e.shiftKey) { if (redo()) toast('Redone. Make up your mind.'); }
      else doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="app" data-tab={tab}>
        <Calendar today={today} day={day} setDay={setDay} open={setModal} />
        <Tasks today={today} day={day} setDay={setDay} />
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
      </AnimatePresence>
      <Toasts />
    </>
  );
}
