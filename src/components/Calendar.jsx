// Calendar.jsx = the left column: a big ring for the chosen day, a small calendar,
// and the list of "dailies" (habits you tick every day).
//
// Pieces in this file, top to bottom:
//   toggleDaily   tick / untick a daily
//   BigRing       the large ring at the top
//   DayCell       one small day in the calendar grid
//   useMarks      works out which days get a dot
//   DailyRow      one row in the dailies list
//   AddDaily      the "Add a daily…" box
//   Calendar      the whole column (this is what App.jsx uses)

import Icon from './Icons.jsx';
import FireArt from './FireArt.jsx';
import { fireColorStyle } from '../fire.js';
import { useAppearance } from '../appearance.js';
import { earnCase } from '../cases.js';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDroppable } from '@dnd-kit/core'; // lets a task be dropped onto a calendar day
import { all, commit, getState, uid, useStore } from '../store.js';
import { useSync } from '../sync.js';
import { DAILY_COLORS, DOW, MON, calendarWeeks, dailiesOn, doneKey, empties, isDone, quip, reminderOccursOn, streakOf, toDate, ymd } from '../lib.js';
import { Flame, sass, toast } from './Fire.jsx';

// Streak lengths that get a congratulation message.
const MILESTONES = [3, 7, 14, 21, 30, 50, 100, 200, 365];


// ======================================================================
// TICKING A DAILY
// ======================================================================
// Tick or untick a daily for a date. Only the big moments get a comment.
// Past days are locked: no rewriting history.
export function toggleDaily(daily, date, today) {
  if (date < today) return;

  // Each tick is saved as a "completion" with a key like "dailyId:2026-10-18".
  const key = doneKey(daily.id, date);

  // Already ticked? Then this click UNticks it.
  if (isDone(getState(), daily.id, date)) {
    commit('daily unticked', [{ t: 'completions', id: key, set: null }]); // set: null = delete
    sass('dailyUnticked', [], { chance: 0.6 });
    return;
  }

  // Otherwise tick it.
  commit('daily done', [
    { t: 'completions', id: key, set: { id: key, ref: daily.id, date, kind: 'daily' } },
  ]);

  // Only comment when ticking TODAY (future days get no fanfare).
  if (date !== today) return;

  const state = getState();
  const dailiesToday = dailiesOn(state, date);
  const streak = streakOf(state, daily.id, today);

  const everythingDone = dailiesToday.every((d) => isDone(state, d.id, date));
  if (everythingDone) {
    toast(quip('allDailies'));
  } else if (MILESTONES.includes(streak)) {
    toast(quip('streak', streak));
  } else {
    sass('dailyDone', [], { chance: 0.25 });
  }
}


// ======================================================================
// THE BIG RING
// ======================================================================
// One circle ring per daily, nested inside each other. More dailies = thinner rings.
// Clicking a ring ticks that daily.
function BigRing({ s, date, today }) {
  const dailies = dailiesOn(s, date);
  const count = dailies.length;
  const doneCount = dailies.filter((d) => isDone(s, d.id, date)).length;
  const everythingDone = count > 0 && doneCount === count; // "ablaze": show the flames

  // Finishing the last daily of today (not just opening the app on a finished day) drops a case, once a day.
  const wasDone = useRef(everythingDone);
  useEffect(() => {
    if (everythingDone && !wasDone.current && date === today) earnCase(today);
    wasDone.current = everythingDone;
  }, [everythingDone, date, today]);
  const { fireStyle, fireColor, fireCoverage } = useAppearance(); // the look of the flames (Settings > Look > Fire)

  // Ring sizes: they share the space, but never get thicker than 10.
  const band = 57 / Math.max(count, 3);
  const width = Math.min(10, band * 0.7);

  const dateObject = toDate(date);

  return (
    <div className={'big-ring' + (everythingDone ? ' ablaze' : '') + (fireColor === 'rainbow' ? ' fire-rainbow' : '') + (fireCoverage === 'around' ? ' fire-around' : '')} style={fireColorStyle(fireColor)}>
      {/* The flames, animated in and out */}
      <AnimatePresence>
        {everythingDone && (
          <motion.svg
            className="ring-fire"
            viewBox="0 0 200 200"
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          >
            <FireArt style={fireStyle} coverage={fireCoverage} />
          </motion.svg>
        )}
      </AnimatePresence>

      <svg viewBox="0 0 200 200">
        {/* No dailies yet: three thin empty rings, with a hint in the middle */}
        {count === 0 &&
          [88, 72, 56].map((radius) => (
            <circle key={radius} className="track" cx="100" cy="100" r={radius} strokeWidth="5" />
          ))}

        {/* One ring per daily */}
        {dailies.map((daily, i) => {
          const radius = 95 - band * i - width / 2; // each ring is a bit smaller than the last
          const isOn = isDone(s, daily.id, date);

          return (
            <g key={daily.id} transform="rotate(-90 100 100)">
              {/* The grey track. It is also the clickable area. */}
              <circle
                className={'track hit' + (date < today ? ' locked' : '')}
                cx="100"
                cy="100"
                r={radius}
                strokeWidth={width}
                onClick={() => toggleDaily(daily, date, today)}
              >
                <title>{daily.name}</title>
              </circle>

              {/* The coloured part that "fills in" when the daily is done */}
              <motion.circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke={daily.color}
                strokeWidth={width}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
                initial={false}
                animate={{ pathLength: isOn ? 1 : 0, opacity: isOn ? 1 : 0 }}
                transition={{
                  pathLength: { type: 'spring', stiffness: 60, damping: 16 },
                  opacity: { duration: 0.2 },
                }}
              />

            </g>
          );
        })}
      </svg>

      {/* The day number and "2/3" in the middle */}
      <div className="ring-center">
        <motion.span key={date} className="ring-day" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {dateObject.getDate()}
        </motion.span>
        {count === 0 && <span className="ring-hint">Add a daily below to fill these rings</span>}
      </div>
    </div>
  );
}


// ======================================================================
// THE DATE AND TIME IN THE TOP CORNER
// ======================================================================
// The time on top, the weekday in a handwritten script, the date underneath (styled like the clock
// in the "The Hill" wallpaper). The time only shows when you are looking at today, and ticks along by itself.
function DateStamp({ date, live }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!live) return;
    setNow(new Date()); // looking at today again: show the real time right away
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, [live]);

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const weekday = date.toLocaleDateString([], { weekday: 'long' });

  return (
    <div className="stamp" aria-label={`${weekday}, ${MON[date.getMonth()]} ${date.getDate()}`}>
      {live && <span className="stamp-time">{time}</span>}
      <span className="stamp-day">{weekday}</span>
      <span className="stamp-date">
        {MON[date.getMonth()]} {date.getDate()}
      </span>
    </div>
  );
}


// ======================================================================
// ONE SMALL DAY IN THE CALENDAR GRID
// ======================================================================
// A small ring with one coloured arc per finished daily (unfinished ones stay empty), with the day number inside.
// `memo` means "don't re-draw this day unless something relevant changed"
// (the check is at the bottom of this function).
const DayCell = memo(
  function DayCell({ s, date, today, selected, marks, onPick, tabbable }) {
    const dailies = dailiesOn(s, date);
    const count = dailies.length;


    // The small gap between arcs.
    let gap = 0;
    if (count > 1) gap = count > 8 ? 0.12 : 0.2;

    const mark = marks[date]; // the dot for this day, if any
    const dateObject = toDate(date);

    // Makes this day a place you can drop a dragged task. isOver = a task is hovering over it now.
    const { setNodeRef, isOver } = useDroppable({ id: 'day:' + date, data: { date } });

    // What is on this day (see useMarks): a task due, a reminder, or only something finished.
    const hasReminder = mark && !mark.task && !mark.done;

    // Build the CSS class list (see .day in app.css). `false` entries are removed by filter(Boolean).
    const className = [
      'day',
      isOver && 'is-over',
      date === today && 'is-today',
      selected && 'is-selected',
      date > today && 'is-future',
      mark?.overdue && 'is-overdue',
      mark?.task && 'has-task',
      hasReminder && 'has-reminder',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={setNodeRef}
        className={className}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => onPick(date)}
        aria-pressed={selected}
        aria-label={`${DOW[dateObject.getDay()]} ${MON[dateObject.getMonth()]} ${dateObject.getDate()}`}
      >
        <svg viewBox="0 0 40 40">
          <g transform="rotate(-90 20 20)">
            <circle className="track" cx="20" cy="20" r="17" strokeWidth="3" />

            {/* Only finished dailies are drawn: a coloured arc each, so the colours match the big ring. */}
            {dailies.map((daily, i) =>
              isDone(s, daily.id, date) ? (
                <circle
                  key={daily.id}
                  cx="20"
                  cy="20"
                  r="17"
                  fill="none"
                  strokeWidth="3.5"
                  pathLength={count}
                  className="seg"
                  style={{ stroke: daily.color }}
                  strokeDasharray={`${1 - gap} ${count - 1 + gap}`}
                  strokeDashoffset={-(i + gap / 2)}
                />
              ) : null
            )}
          </g>
        </svg>

        <span className="day-num">{dateObject.getDate()}</span>
      </button>
    );
  },

  // The "should we skip re-drawing?" check. Returns true when NOTHING relevant to this day changed.
  // This only makes the app faster. It never changes what you see.
  (before, after) => {
    const markBefore = before.marks[before.date];
    const markAfter = after.marks[after.date];

    return (
      before.date === after.date &&
      before.today === after.today &&
      before.selected === after.selected &&
      before.tabbable === after.tabbable &&
      before.s.dailies === after.s.dailies &&
      before.s.completions === after.s.completions &&
      markBefore?.task === markAfter?.task &&
      markBefore?.done === markAfter?.done &&
      markBefore?.overdue === markAfter?.overdue
    );
  }
);


// ======================================================================
// WHICH DAYS GET A DOT
// ======================================================================
// Works out which days have something due (or something finished) so the calendar can mark them (an underline under the day number).
// Returns an object like { "2026-10-20": { task: true, overdue: false } }.
// useMemo = only recalculate when the listed things change (an optimisation).
function useMarks(s, weeks, today) {
  return useMemo(() => {
    const marks = {};

    // 1. Tasks (not their sub-steps).
    for (const task of all(s, 'tasks')) {
      if (task.parent) continue;

      if (task.done) {
        // A finished task marks the day it was finished.
        if (task.done_at) {
          const finishedOn = ymd(new Date(task.done_at));
          if (!marks[finishedOn]) marks[finishedOn] = { done: true };
        }
        continue;
      }

      // An unfinished task marks its due date (overdue if that date has passed).
      if (task.due) marks[task.due] = { task: true, overdue: task.due < today };
    }

    // 2. Reminders: mark upcoming days where a reminder happens (if that day has no task dot already).
    const reminders = all(s, 'reminders');
    for (const date of weeks.flat()) {
      if (date < today) continue;
      if (marks[date]?.task) continue;

      const hasReminder = reminders.some(
        (reminder) => reminderOccursOn(reminder, date, today) && !isDone(s, reminder.id, date)
      );
      if (hasReminder) marks[date] = { task: false };
    }

    return marks;
  }, [s.tasks, s.reminders, s.completions, weeks, today]);
}


// ======================================================================
// ONE ROW IN THE DAILIES LIST
// ======================================================================
function DailyRow({ s, daily, date, today, onEdit }) {
  const isOn = isDone(s, daily.id, date);
  const streak = streakOf(s, daily.id, today);

  // The flame gets bigger for longer streaks.
  let flameSize = 14;
  if (streak >= 30) flameSize = 18;
  else if (streak >= 7) flameSize = 16;

  // The × button: hide this daily from now on (it keeps its history in the past).
  function archive() {
    commit('daily archived', [{ t: 'dailies', id: daily.id, patch: { archived: today } }]);
    toast(quip('dailyArchived'), { undoable: true });
  }

  return (
    <motion.li
      className={'daily' + (isOn ? ' on' : '')}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
    >
      <button
        className="daily-check"
        style={{ '--c': daily.color }}
        aria-pressed={isOn}
        aria-label={daily.name}
        disabled={date < today}
        onClick={() => toggleDaily(daily, date, today)}
      />
      {/* Clicking the name opens the editor (rename and change colour). */}
      <button className="daily-name daily-name-btn" aria-label={`Edit ${daily.name}`} onClick={() => onEdit(daily.id)}>
        {daily.name}
      </button>

      <span
        className={'streak' + (streak ? '' : ' cold')}
        title={streak ? `${streak} days in a row` : 'No streak. Yet. Allegedly.'}
      >
        <Flame streak={streak} size={flameSize} />
        <motion.b key={streak} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>
          {streak}
        </motion.b>
      </span>

      <button className="del" aria-label={`Archive ${daily.name}`} onClick={archive}>
        ×
      </button>
    </motion.li>
  );
}


// ======================================================================
// THE "ADD A DAILY" BOX
// ======================================================================
function AddDaily({ s, today }) {
  const [name, setName] = useState(''); // what is typed in the box

  // Runs when you press Enter.
  function submit(event) {
    event.preventDefault(); // stop the page from reloading
    if (!name.trim()) return; // ignore an empty box

    const existing = all(s, 'dailies');
    const color = DAILY_COLORS[existing.length % DAILY_COLORS.length]; // next colour in the list

    commit('daily added', [
      {
        t: 'dailies',
        id: uid(),
        patch: { name: name.trim(), color, position: existing.length, created: today },
      },
    ]);
    setName('');
    sass('dailyAdded', [], { chance: 0.7 });
  }

  return (
    <form className="daily-add" onSubmit={submit}>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add a daily habit, e.g. Read 20 min…"
        aria-label="New daily"
      />
    </form>
  );
}


// ======================================================================
// THE WHOLE CALENDAR COLUMN
// ======================================================================
// Props (the inputs App.jsx gives it):
//   today   today's date text
//   day     the day picked by the user, or null
//   setDay  function to pick a day
//   open    function to open a pop-up window ('reminders', 'keys', 'settings')
//   editDaily  function that opens the editor for a daily (gets the daily's id)
export default function Calendar({ today, day, setDay, open, editDaily }) {
  const s = useStore();
  const sync = useSync(); // are we signed in / syncing?

  const [month, setMonth] = useState(false); // false = two weeks, true = five weeks around today

  const shown = day ?? today;                              // the day the big ring shows
  const weeks = useMemo(() => calendarWeeks(today, month), [today, month]);
  const marks = useMarks(s, weeks, today);
  const dailies = dailiesOn(s, shown);
  const shownDate = toDate(shown);
  const dates = weeks.flat();                              // all the days as one flat list

  // For keyboard users: only ONE day is a Tab stop (tabbable). Arrow keys move between the rest.
  const tabDate = dates.includes(shown) ? shown : dates[0];

  // Arrow keys walk the grid: left/right by one day, up/down by a week.
  function walkWithArrowKeys(event) {
    let step = 0;
    if (event.key === 'ArrowLeft') step = -1;
    if (event.key === 'ArrowRight') step = 1;
    if (event.key === 'ArrowUp') step = -7;
    if (event.key === 'ArrowDown') step = 7;

    if (!step) return;                        // not an arrow key
    if (!event.target.matches('.day')) return; // focus isn't on a day button

    event.preventDefault();
    const dayButtons = [...event.currentTarget.querySelectorAll('.day')];
    const wanted = dayButtons.indexOf(event.target) + step;
    const clamped = Math.min(dayButtons.length - 1, Math.max(0, wanted)); // stay inside the grid
    dayButtons[clamped].focus();
  }

  // Clicking a day selects it. Clicking the selected day clears it. Clicking today selects it (the same as the sun button on Tasks).
  function pickDay(picked) {
    setDay((current) => (picked === current ? null : picked));
  }

  // The little text next to "Dailies", e.g. "· Oct 18" when looking at another day.
  const dailiesSuffix = day && day !== today ? ` · ${MON[shownDate.getMonth()]} ${shownDate.getDate()}` : '';

  return (
    <section className="col col-calendar" aria-label="Calendar">
      <header className="col-head">
        <h2>Calendar</h2>
        <DateStamp date={shownDate} live={shown === today} />
      </header>

      <BigRing s={s} date={shown} today={today} />

      <div className="cal">
        {/* The row of letters: S M T W T F S */}
        <div className="cal-head">
          {DOW.map((name) => (
            <span key={name} className="mono">
              {name[0]}
            </span>
          ))}
        </div>

        {/* The grid of days */}
        <motion.div
          className="cal-grid"
          layout
          onKeyDown={walkWithArrowKeys}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {dates.map((date) => (
            <DayCell
              key={date}
              s={s}
              date={date}
              today={today}
              selected={day === date}
              marks={marks}
              tabbable={date === tabDate}
              onPick={pickDay}
            />
          ))}
        </motion.div>

        <button className="btn-ghost cal-toggle" onClick={() => setMonth(!month)} aria-label={month ? 'Show two weeks' : 'Show five weeks'} title={month ? 'Show two weeks' : 'Show five weeks'}>
          <Icon name={month ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
      </div>

      {/* The list of dailies */}
      <div className="dailies">
        <div className="mini-head">
          <span className="mono">Dailies{dailiesSuffix}</span>
        </div>

        <ul className="daily-list">
          <AnimatePresence initial={false}>
            {dailies.map((daily) => (
              <DailyRow key={daily.id} s={s} daily={daily} date={shown} today={today} onEdit={editDaily} />
            ))}
          </AnimatePresence>
        </ul>

        {dailies.length === 0 && <p className="empty small">{empties.dailies}</p>}
        <AddDaily s={s} today={today} />
      </div>

      {/* The buttons at the bottom of the column */}
      <footer className="col-foot">
        <button className="btn-ghost" onClick={() => open('reminders')} aria-label="Reminders" title="Reminders">
          <Icon name="repeat" size={16} />
          Reminders
        </button>
        <button className="btn-ghost" onClick={() => open('search')} aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">
          <Icon name="search" size={16} />
        </button>
        <button className="btn-ghost" onClick={() => open('cases')} aria-label="Cases" title="Cases">
          <Icon name="box" size={16} />
        </button>
        <button className="btn-ghost shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => open('keys')}>
          <Icon name="help" size={16} />
        </button>
        <button className="btn-ghost foot-right" onClick={() => open('account')} aria-label="Account and backup" title="Account and backup">
          <i className={'sync-dot ' + sync.sync} />
          <Icon name="user" size={16} />
          Account
        </button>
        <button className="btn-ghost settings-button" onClick={() => open('settings')} aria-label="Settings" title="Settings">
          <Icon name="sliders" size={16} />
        </button>
      </footer>
    </section>
  );
}
