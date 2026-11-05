// Onboarding.jsx = the short tour someone new sees the first time the app opens.
//
// Five steps, each one skippable:
//   1. Welcome     what the app is
//   2. Task        add a first task (and learn that "friday 5pm" at the end sets the date)
//   3. Dailies     pick a few habits; each one becomes a ring on the calendar
//   4. Look        pick a theme (it changes as you click)
//   5. Done        the two shortcuts worth knowing, and signing in to sync
//
// App.jsx decides when to show it (see needsTour there). Close, Escape or "Skip" ends the tour for good.

import { useMemo, useState } from 'react';
import { Modal } from './Modals.jsx';
import { ThemeCard } from './Look.jsx';
import { createTask } from './Tasks.jsx';
import { createDaily } from './Calendar.jsx';
import { THEMES, useAppearance } from '../appearance.js';
import { useSync } from '../sync.js';
import { dueInfo, parseTyped, todayStr } from '../lib.js';

const STEPS = ['Welcome', 'Your first task', 'Dailies', 'Pick a look', 'All set'];

// Habits to pick from with one click. You can type your own too.
const SUGGESTED_DAILIES = ['Read 20 min', 'Drink water', 'Move 30 min', 'Journal', 'Sleep by 11', 'No phone in bed'];

// Props: onClose(next) ends the tour. `next` is a window to open afterwards ('account' to sign in), or nothing.
export default function Onboarding({ onClose }) {
  const [step, setStep] = useState(0);
  const next = () => setStep((current) => current + 1);

  return (
    <Modal title={STEPS[step]} onClose={() => onClose()}>
      <p className="mono tour-count" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((name, i) => (
          <i key={name} className={i <= step ? 'on' : ''} />
        ))}
      </p>
      {step === 0 && <Welcome next={next} skip={() => onClose()} />}
      {step === 1 && <FirstTask next={next} />}
      {step === 2 && <PickDailies next={next} />}
      {step === 3 && <PickLook next={next} />}
      {step === 4 && <AllSet onClose={onClose} />}
    </Modal>
  );
}


// ---- 1. Welcome ----
function Welcome({ next, skip }) {
  return (
    <>
      <p className="tour-lead">Tasks, daily habits and notes, all on one screen.</p>
      <p className="hint">It's honest with you. Sometimes rudely. Setting up takes about a minute, and you can change all of it later.</p>
      <div className="tour-actions">
        <button type="button" className="btn-ghost" onClick={skip}>
          Skip
        </button>
        <button type="button" className="btn-add" onClick={next} autoFocus>
          Set me up
        </button>
      </div>
    </>
  );
}


// ---- 2. The first task ----
// The same date reading as the Add box: a day or time at the end of the text becomes the due date.
function FirstTask({ next }) {
  const [text, setText] = useState('');
  const today = todayStr();
  const parsed = useMemo(() => parseTyped(text), [text]);

  function submit(event) {
    event.preventDefault();
    const title = (parsed ? parsed.title : text).trim();
    if (!title) return;
    createTask({ title, due: parsed?.due ?? today, dueTime: parsed?.time ?? null });
    next();
  }

  // What the task will get, shown as you type.
  let when = 'Due today. End it with a day or time, like "friday 5pm", to pick another.';
  if (parsed) {
    const label = dueInfo(parsed.due, today, parsed.time).text.replace(' · ', ' at ').replace(/^(Today|Tomorrow)/, (word) => word.toLowerCase());
    when = `Due ${label}.`; // "Due tomorrow at 5 PM.", "Due Fri at 5 PM."
  }

  return (
    <form className="tour-form" onSubmit={submit}>
      <p className="tour-lead">What's one thing you need to do?</p>
      <input
        className="field"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="e.g. call mum friday 5pm"
        aria-label="First task"
        autoFocus
      />
      <p className="hint" aria-live="polite">
        {text.trim() ? when : 'Type it like you would say it. A day or time at the end sets the date.'}
      </p>
      <div className="tour-actions">
        <button type="button" className="btn-ghost" onClick={next}>
          Skip
        </button>
        <button type="submit" className="btn-add" disabled={!text.trim()}>
          Add task
        </button>
      </div>
    </form>
  );
}


// ---- 3. Dailies ----
function PickDailies({ next }) {
  const [picked, setPicked] = useState([]); // names, in the order they were picked
  const [own, setOwn] = useState(''); // the "your own" box
  const choices = [...SUGGESTED_DAILIES, ...picked.filter((name) => !SUGGESTED_DAILIES.includes(name))];

  const toggle = (name) => setPicked((current) => (current.includes(name) ? current.filter((n) => n !== name) : [...current, name]));

  function addOwn(event) {
    event.preventDefault();
    const name = own.trim();
    if (name && !picked.includes(name)) setPicked([...picked, name]);
    setOwn('');
  }

  function save() {
    const today = todayStr();
    picked.forEach((name) => createDaily(name, today));
    next();
  }

  return (
    <>
      <p className="tour-lead">Pick a few things to do every day.</p>
      <p className="hint">Each one becomes a ring on the calendar. Tick them all and the rings catch fire.</p>
      <div className="tour-chips">
        {choices.map((name) => (
          <button key={name} type="button" className={'chip' + (picked.includes(name) ? ' solid' : '')} aria-pressed={picked.includes(name)} onClick={() => toggle(name)}>
            {name}
          </button>
        ))}
      </div>
      <form className="daily-add" onSubmit={addOwn}>
        <input value={own} onChange={(event) => setOwn(event.target.value)} placeholder="Or type your own and press Enter" aria-label="Your own daily" />
      </form>
      <div className="tour-actions">
        <button type="button" className="btn-ghost" onClick={next}>
          Skip
        </button>
        <button type="button" className="btn-add" onClick={save} disabled={!picked.length}>
          {picked.length > 1 ? `Add ${picked.length} dailies` : 'Add daily'}
        </button>
      </div>
    </>
  );
}


// ---- 4. The look ----
function PickLook({ next }) {
  const { theme } = useAppearance();
  return (
    <>
      <p className="hint">Click one to try it. Wallpapers and your own pictures are in Settings.</p>
      <div className="theme-row">
        {THEMES.map(([id, label]) => (
          <ThemeCard key={id} id={id} label={label} picked={theme === id} />
        ))}
      </div>
      <div className="tour-actions">
        <button type="button" className="btn-add" onClick={next}>
          Next
        </button>
      </div>
    </>
  );
}


// ---- 5. All set ----
function AllSet({ onClose }) {
  const sync = useSync();
  const canSignIn = sync.sync !== 'off' && !sync.user; // syncing is set up for this app, and nobody is signed in

  return (
    <>
      <p className="tour-lead">That's it. Now go and actually do something.</p>
      <p className="hint">
        <span className="tour-keys">
          Press <kbd>N</kbd> to add a task from anywhere, and <kbd>?</kbd> for every shortcut.
        </span>
        <span className="tour-touch">Tap a ring on the Calendar tab to tick off a daily.</span>
        {canSignIn && ' Sign in to keep your list the same on your phone and computer.'}
      </p>
      <div className="tour-actions">
        {canSignIn && (
          <button type="button" className="btn-ghost" onClick={() => onClose('account')}>
            Sign in to sync
          </button>
        )}
        <button type="button" className="btn-add" onClick={() => onClose()} autoFocus>
          Start
        </button>
      </div>
    </>
  );
}
