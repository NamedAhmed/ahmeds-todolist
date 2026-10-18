import { memo, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDroppable } from '@dnd-kit/core';
import { all, commit, getState, uid, useStore } from '../store.js';
import { useSync } from '../sync.js';
import { DAILY_COLORS, DOW, MON, calendarWeeks, dailiesOn, doneKey, empties, isDone, occursOn, quip, streakOf, toDate, ymd } from '../lib.js';
import { Flame, sass, toast } from './Fire.jsx';

const MILESTONES = [3, 7, 14, 21, 30, 50, 100, 200, 365];

/** Tick or untick a daily for a date. Only the big moments get a comment. */
export function toggleDaily(daily, date, today) {
  const key = doneKey(daily.id, date);
  if (isDone(getState(), daily.id, date)) {
    commit('daily unticked', [{ t: 'completions', id: key, set: null }]);
    sass('dailyUnticked', [], { chance: 0.6 });
    return;
  }
  commit('daily done', [{ t: 'completions', id: key, set: { id: key, ref: daily.id, date, kind: 'daily' } }]);
  if (date !== today) return;
  const s = getState();
  const list = dailiesOn(s, date);
  const streak = streakOf(s, daily.id, today);
  if (list.every((d) => isDone(s, d.id, date))) toast(quip('allDailies'));
  else if (MILESTONES.includes(streak)) toast(quip('streak', streak));
  else sass('dailyDone', [], { chance: 0.25 });
}

// The fire behind a finished ring: a flat silhouette of flame tongues rising around its top half.
// Each tongue has a round belly and a tip that curls to one side; tongues are tallest at the top.
// The shape closes along the ring itself, so nothing shows through the middle.
function flamePath(tongues, height, curl, base = 96) {
  const pt = (deg, r) => `${(100 + r * Math.cos((deg * Math.PI) / 180)).toFixed(1)} ${(100 + r * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`;
  const sizes = [1, 0.5, 0.82, 0.58, 1, 0.52, 0.86, 0.6];
  const from = -172, span = 164, step = span / tongues;
  let d = `M${pt(from, base)}`;
  for (let i = 0; i < tongues; i++) {
    const a = from + i * step;
    const h = height * (0.35 + 0.65 * Math.sin(Math.PI * ((i + 0.5) / tongues))) * sizes[i % sizes.length];
    d += ` C${pt(a - step * 0.05, base + h * 0.55)} ${pt(a + step * (0.3 + curl), base + h * 0.7)} ${pt(a + step * (0.5 + curl * 2), base + h)}`;
    d += ` C${pt(a + step * 0.62, base + h * 0.5)} ${pt(a + step * 1.02, base + h * 0.4)} ${pt(a + step, base)}`;
  }
  return `${d} A${base} ${base} 0 ${span > 180 ? 1 : 0} 0 ${pt(from, base)} Z`;   // back along the ring to the start
}
const FIRE_BACK = flamePath(6, 42, 0.1);
const FIRE_FRONT = flamePath(7, 22, -0.08);

// Today's ring: one concentric ring per daily. More dailies means thinner rings, never a different shape.
function BigRing({ s, date, today }) {
  const dailies = dailiesOn(s, date);
  const n = dailies.length;
  const done = dailies.filter((d) => isDone(s, d.id, date)).length;
  const ablaze = n > 0 && done === n;
  const band = 57 / Math.max(n, 3);
  const width = Math.min(14, band * 0.72);
  const d = toDate(date);
  return (
    <div className={'big-ring' + (ablaze ? ' ablaze' : '')}>
      <AnimatePresence>
        {ablaze && (
          <motion.svg className="ring-fire" viewBox="0 0 200 200" aria-hidden="true"
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <path className="fire-back" d={FIRE_BACK} />
            <path className="fire-front" d={FIRE_FRONT} />
          </motion.svg>
        )}
      </AnimatePresence>
      <svg viewBox="0 0 200 200">
        {n === 0 && [88, 68, 48].map((r) => <circle key={r} className="track" cx="100" cy="100" r={r} strokeWidth="14" />)}
        {dailies.map((daily, i) => {
          const r = 95 - band * i - width / 2;
          const on = isDone(s, daily.id, date);
          return (
            <g key={daily.id} transform="rotate(-90 100 100)">
              <circle className="track hit" cx="100" cy="100" r={r} strokeWidth={width}
                onClick={() => toggleDaily(daily, date, today)}>
                <title>{daily.name}</title>
              </circle>
              <motion.circle cx="100" cy="100" r={r} fill="none" stroke={daily.color} strokeWidth={width} strokeLinecap="round"
                style={{ pointerEvents: 'none' }} initial={false}
                animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
                transition={{ pathLength: { type: 'spring', stiffness: 60, damping: 16 }, opacity: { duration: 0.2 } }} />
            </g>
          );
        })}
      </svg>
      <div className="ring-center">
        <motion.span key={date} className="ring-day" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{d.getDate()}</motion.span>
        {n > 0 && <span className="mono">{done}/{n}</span>}
      </div>
    </div>
  );
}

// A small day: one ring cut into a segment per daily.
const DayCell = memo(function DayCell({ s, date, today, selected, marks, onPick, tabbable }) {
  const dailies = dailiesOn(s, date);
  const n = dailies.length;
  const gap = n > 1 ? (n > 8 ? 0.12 : 0.2) : 0;
  const mark = marks[date];
  const { setNodeRef, isOver } = useDroppable({ id: 'day:' + date, data: { date } });
  const cls = ['day', isOver && 'is-over', date === today && 'is-today', selected && 'is-selected', date > today && 'is-future', mark?.overdue && 'is-overdue'].filter(Boolean).join(' ');
  return (
    <button ref={setNodeRef} className={cls} tabIndex={tabbable ? 0 : -1} onClick={() => onPick(date)} aria-pressed={selected} aria-label={`${DOW[toDate(date).getDay()]} ${MON[toDate(date).getMonth()]} ${toDate(date).getDate()}`}>
      <svg viewBox="0 0 40 40">
        <g transform="rotate(-90 20 20)">
          {n === 0 && <circle className="track" cx="20" cy="20" r="17" strokeWidth="3" />}
          {dailies.map((daily, i) => {
            const on = isDone(s, daily.id, date);
            return (
              <circle key={daily.id} cx="20" cy="20" r="17" fill="none" strokeWidth="3.500" pathLength={n}
                className={on ? 'seg on' : 'seg'} style={on ? { stroke: daily.color, color: daily.color } : undefined}
                strokeDasharray={`${1 - gap} ${n - 1 + gap}`} strokeDashoffset={-(i + gap / 2)} />
            );
          })}
        </g>
      </svg>
      <span className="day-num">{toDate(date).getDate()}</span>
      {mark && <i className={'day-dot' + (mark.task ? '' : mark.done ? ' done' : ' reminder')} />}
    </button>
  );
// Only repaint a day when its own rings, dot or selection change, not on every edit elsewhere.
}, (a, b) => {
  const m = a.marks[a.date], n = b.marks[b.date];
  return a.date === b.date && a.today === b.today && a.selected === b.selected && a.tabbable === b.tabbable
    && a.s.dailies === b.s.dailies && a.s.completions === b.s.completions
    && m?.task === n?.task && m?.done === n?.done && m?.overdue === n?.overdue;
});

/** Which days have something due (or something finished), so the calendar can dot them. */
function useMarks(s, weeks, today) {
  return useMemo(() => {
    const marks = {};
    for (const t of all(s, 'tasks')) {
      if (t.parent) continue;
      if (t.done) { if (t.done_at) { const d = ymd(new Date(t.done_at)); marks[d] ||= { done: true }; } continue; }
      if (t.due) marks[t.due] = { task: true, overdue: t.due < today };
    }
    const reminders = all(s, 'reminders');
    for (const date of weeks.flat()) {
      if (date < today || marks[date]?.task) continue;
      if (reminders.some((r) => occursOn(r.rule, date) && !isDone(s, r.id, date))) marks[date] = { task: false };
    }
    return marks;
  }, [s.tasks, s.reminders, s.completions, weeks, today]);
}

function DailyRow({ s, daily, date, today }) {
  const on = isDone(s, daily.id, date);
  const streak = streakOf(s, daily.id, today);
  return (
    <motion.li className={'daily' + (on ? ' on' : '')} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
      <button className="daily-check" style={{ '--c': daily.color }} aria-pressed={on} aria-label={daily.name}
        onClick={() => toggleDaily(daily, date, today)} />
      <span className="daily-name">{daily.name}</span>
      <span className={'streak' + (streak ? '' : ' cold')} title={streak ? `${streak} days in a row` : 'No streak. Yet. Allegedly.'}>
        <Flame streak={streak} size={streak >= 30 ? 18 : streak >= 7 ? 16 : 14} />
        <motion.b key={streak} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>{streak}</motion.b>
      </span>
      <button className="del" aria-label={`Archive ${daily.name}`}
        onClick={() => { commit('daily archived', [{ t: 'dailies', id: daily.id, patch: { archived: today } }]); toast(quip('dailyArchived'), { undoable: true }); }}>×</button>
    </motion.li>
  );
}

function AddDaily({ s, today }) {
  const [name, setName] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const list = all(s, 'dailies');
    commit('daily added', [{ t: 'dailies', id: uid(), patch: { name: name.trim(), color: DAILY_COLORS[list.length % DAILY_COLORS.length], position: list.length, created: today } }]);
    setName('');
    sass('dailyAdded', [], { chance: 0.7 });
  };
  return (
    <form className="daily-add" onSubmit={submit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a daily…" aria-label="New daily" />
    </form>
  );
}

/** Phones: a slim row of dailies above the task list, so the whole daily loop is one screen. */
export function DailyStrip({ today }) {
  const s = useStore();
  const dailies = dailiesOn(s, today);
  if (!dailies.length) return null;
  return (
    <div className="daily-strip">
      {dailies.map((d) => (
        <button key={d.id} className={'strip-pill' + (isDone(s, d.id, today) ? ' on' : '')} style={{ '--c': d.color }}
          onClick={() => toggleDaily(d, today, today)}>
          <i />{d.name}<Flame streak={streakOf(s, d.id, today)} size={11} />
        </button>
      ))}
    </div>
  );
}

export default function Calendar({ today, day, setDay, open }) {
  const s = useStore();
  const sync = useSync();
  const [month, setMonth] = useState(false);
  const shown = day ?? today;
  const weeks = useMemo(() => calendarWeeks(today, month), [today, month]);
  const marks = useMarks(s, weeks, today);
  const dailies = dailiesOn(s, shown);
  const d = toDate(shown);
  const dates = weeks.flat();
  const tabDate = dates.includes(shown) ? shown : dates[0];   // one stop for Tab; arrows do the rest
  // Arrow keys walk the grid: left and right by a day, up and down by a week.
  const walk = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step || !e.target.matches('.day')) return;
    e.preventDefault();
    const days = [...e.currentTarget.querySelectorAll('.day')];
    days[Math.min(days.length - 1, Math.max(0, days.indexOf(e.target) + step))].focus();
  };

  return (
    <section className="col col-calendar" aria-label="Calendar">
      <header className="col-head">
        <h2>Calendar</h2>
        <span className="mono">{DOW[d.getDay()]} · {MON[d.getMonth()]} {d.getDate()}</span>
      </header>

      <BigRing s={s} date={shown} today={today} />

      <div className="cal">
        <div className="cal-head">
          {DOW.map((n) => <span key={n} className="mono">{n[0]}</span>)}
        </div>
        <motion.div className="cal-grid" layout onKeyDown={walk} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
          {dates.map((date) => (
            <DayCell key={date} s={s} date={date} today={today} selected={day === date} marks={marks} tabbable={date === tabDate}
              onPick={(picked) => setDay((cur) => (picked === cur || (picked === today && !cur) ? null : picked))} />
          ))}
        </motion.div>
        <button className="btn-ghost cal-toggle" onClick={() => setMonth(!month)}>{month ? 'Two weeks' : 'Month'}</button>
      </div>

      <div className="dailies">
        <div className="mini-head">
          <span className="mono">Dailies{day && day !== today ? ` · ${MON[d.getMonth()]} ${d.getDate()}` : ''}</span>
        </div>
        <ul className="daily-list">
          <AnimatePresence initial={false}>
            {dailies.map((daily) => <DailyRow key={daily.id} s={s} daily={daily} date={shown} today={today} />)}
          </AnimatePresence>
        </ul>
        {!dailies.length && <p className="empty small">{empties.dailies}</p>}
        <AddDaily s={s} today={today} />
      </div>

      <footer className="col-foot">
        <button className="btn-ghost" onClick={() => open('reminders')}>↻ Reminders</button>
        <button className="btn-ghost" aria-label="Keyboard shortcuts" onClick={() => open('keys')}>?</button>
        <button className="btn-ghost account" onClick={() => open('settings')}>
          <i className={'sync-dot ' + sync.sync} />
          {sync.user ? sync.user.email.split('@')[0] : sync.sync === 'off' ? 'Settings' : 'Sign in'}
        </button>
      </footer>
    </section>
  );
}
