import { useEffect, useState } from 'react';
import * as chrono from 'chrono-node';
import { all } from './store.js';

// ---------- dates ----------
// toISOString() converts to UTC, which shifts the date in the evening. Build YYYY-MM-DD from local parts.
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const toDate = (s) => new Date(s + 'T00:00');
export const todayStr = () => ymd(new Date());
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000);
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (s) => { const d = toDate(s); return `${MON[d.getMonth()]} ${d.getDate()}`; };

export function dueInfo(due, today) {
  if (!due) return { text: '', cls: '' };
  const diff = diffDays(due, today);
  if (diff === 0) return { text: 'Today', cls: 'today' };
  if (diff === 1) return { text: 'Tomorrow', cls: '' };
  if (diff < 0) return { text: diff === -1 ? 'Yesterday' : `${-diff}d late`, cls: 'overdue' };
  if (diff < 7) return { text: DOW[toDate(due).getDay()], cls: '' };
  return { text: shortDate(due), cls: '' };
}

/** Today's date, kept correct when the tab is left open past midnight. */
export function useToday() {
  const [today, setToday] = useState(todayStr);
  useEffect(() => {
    const check = () => setToday(todayStr());
    const timer = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);
  return today;
}

/** The two weeks (or whole month) shown in the calendar, as rows of 7 dates. */
export function calendarWeeks(today, month) {
  const d = toDate(today);
  let start, weeks;
  if (month) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    start = addDays(ymd(first), -first.getDay());
    weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
  } else {
    start = addDays(today, -d.getDay());
    weeks = 2;
  }
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

// ---------- typed dates ----------
// "email landlord friday" -> { title: "email landlord", due: "2026-10-09", phrase: "friday" }
// Only a phrase at the very end counts, so "call Friday about the car" keeps its name.
export function parseTyped(text) {
  const trimmed = text.trimEnd();
  const found = chrono.parse(trimmed, new Date(), { forwardDate: true });
  const last = found[found.length - 1];
  if (!last || last.index === 0 || last.index + last.text.length !== trimmed.length) return null;
  const title = trimmed.slice(0, last.index).replace(/\s+(on|by|due|at|for)\s*$/i, '').trim();
  if (!title) return null;
  return { title, due: ymd(last.start.date()), phrase: last.text };
}

// ---------- dailies ----------
export const DAILY_COLORS = ['#ff6b57', '#6cb8ff', '#7ee0a1', '#f0b35a', '#c59bff', '#ff8fc7', '#5ee0d4', '#e6e25a', '#ff9d5c', '#9aa7ff'];
export const doneKey = (id, date) => `${id}:${date}`;

/** Dailies that existed on a given day, in display order. Past rings never change shape. */
export function dailiesOn(s, date) {
  return all(s, 'dailies')
    .filter((d) => d.created <= date && (!d.archived || d.archived > date))
    .sort((a, b) => a.position - b.position);
}

export const isDone = (s, id, date) => { const c = s.completions[doneKey(id, date)]; return !!c && !c._deleted; };

/** Days in a row, counted back from today (or yesterday, so an unfinished today isn't a broken streak yet). */
export function streakOf(s, id, today) {
  let day = isDone(s, id, today) ? today : addDays(today, -1);
  let n = 0;
  while (isDone(s, id, day)) { n++; day = addDays(day, -1); }
  return n;
}

// ---------- reminders ----------
// rule = { type: 'weekly', days: [0-6] } | { type: 'monthly', day: 1-31 } | { type: 'yearly', month: 0-11, day: 1-31 }
export function occursOn(rule, date) {
  const d = toDate(date);
  if (rule.type === 'weekly') return rule.days.includes(d.getDay());
  const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const hit = d.getDate() === Math.min(rule.day, lastOfMonth);   // "the 31st" falls on the last day of short months
  if (rule.type === 'monthly') return hit;
  return hit && d.getMonth() === rule.month;
}

export function ruleText(rule) {
  if (rule.type === 'weekly') return rule.days.length === 7 ? 'Every day' : rule.days.map((d) => DOW[d]).join(' ');
  if (rule.type === 'monthly') return `Monthly on the ${rule.day}${ordinal(rule.day)}`;
  return `Every ${MON[rule.month]} ${rule.day}`;
}
const ordinal = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

/** The one occurrence of a reminder worth showing: the oldest unfinished one up to today. They never pile up. */
export function pendingOccurrence(s, reminder, today) {
  let day = reminder.created > addDays(today, -60) ? reminder.created : addDays(today, -60);
  for (; day <= today; day = addDays(day, 1)) {
    if (occursOn(reminder.rule, day) && !isDone(s, reminder.id, day)) return day;
  }
  return null;
}

// ---------- tasks ----------
export const subtasksOf = (s, id) => all(s, 'tasks').filter((t) => t.parent === id).sort((a, b) => a.position - b.position);

/** A task's own percentage, or for a project the average of its subtasks. */
export function progressOf(s, task) {
  if (task.kind !== 'project') return task.done ? 100 : task.progress || 0;
  const subs = subtasksOf(s, task.id);
  if (!subs.length) return task.done ? 100 : 0;
  return Math.round(subs.reduce((sum, t) => sum + (t.done ? 100 : t.progress || 0), 0) / subs.length);
}

/** A position between two neighbours, so a reorder only ever changes the row that moved. */
export const between = (a, b) => (a == null && b == null ? 0 : a == null ? b - 1 : b == null ? a + 1 : (a + b) / 2);

// ---------- the voice ----------
// Savage on purpose. Picked by a stable seed so a line doesn't change on every keystroke.
const pick = (list, seed) => list[Math.abs(Math.round(seed)) % list.length];

export function headline({ open, overdue, doneToday, total, seed }) {
  if (!total) return pick(["Nothing here. Not a single ambition. Impressive.", "An empty list. Your potential, visualised.", "No tasks. Either you're done with life or hiding from it."], seed);
  if (overdue >= 5) return pick([`${overdue} overdue. This isn't a to-do list, it's a memorial.`, `${overdue} late. The deadlines have stopped believing in you.`, `${overdue} overdue. Even the list is embarrassed.`], seed);
  if (overdue > 0) return pick([`${overdue} overdue. You saw the date. You chose this.`, `${overdue} late. "I'll do it tomorrow", said you, every yesterday.`, `Overdue: ${overdue}. Deadlines are just suggestions to you, huh.`], seed);
  if (!open) return pick(["All done. Who did it for you?", "Everything finished. I'm genuinely concerned.", "Nothing left. Don't worry, you'll ruin it by Monday."], seed);
  if (doneToday >= 5) return pick([`${doneToday} done today. Relax, nobody's handing out medals.`, `${doneToday} finished. Who are you trying to impress?`], seed);
  if (open === 1) return pick(["One task. One. And yet here we are.", "One left. You'll still find a way to make it take all week."], seed);
  if (open > 12) return pick([`${open} open tasks. Writing them down isn't the same as doing them.`, `${open} left. You collect tasks like other people collect regrets.`], seed);
  return pick([`${open} left. Staring at them isn't a strategy.`, `${open} to go. They've been waiting. They're used to it.`, `${open} things. Do one. Shock everybody.`, `${open} left. The scrolling can wait. It won't, but it could.`], seed);
}

/** A small insult for a task that is late. The later it is, the worse it gets. */
export function lateJab(daysLate, seed) {
  if (daysLate >= 14) return pick(["at this point just delete it", "a fossil", "it has given up on you too", "older than your last good habit"], seed);
  if (daysLate >= 5) return pick(["still here. unlike your motivation", "it's not doing itself", "you keep scrolling past this", "embarrassing"], seed);
  if (daysLate >= 2) return pick(["any day now", "you said you'd do this", "ignoring it isn't working", "tick tock"], seed);
  return pick(["yesterday called", "so close. not really", "one day late already"], seed);
}

/** Dailies whose streak ended yesterday: done the day before, skipped yesterday, not rescued today. */
export function brokenStreaks(s, today) {
  const yesterday = addDays(today, -1);
  const out = [];
  for (const d of dailiesOn(s, yesterday)) {
    if (isDone(s, d.id, yesterday) || isDone(s, d.id, today)) continue;
    let day = addDays(today, -2), was = 0;
    while (isDone(s, d.id, day)) { was++; day = addDays(day, -1); }
    if (was >= 2) out.push({ name: d.name, was });
  }
  return out.sort((a, b) => b.was - a.was);
}

export const quips = {
  taskDeleted: ["Deleted. Can't fail what you never do.", "Gone. Cowardice, but efficient.", "Deleted. The easiest way to finish anything."],
  projectDone: ["A whole project. Finished. By you. Somebody check the logs.", "Project done. Took you long enough."],
  allDailies: ["Every daily done. Don't get cocky, you'll be back to nothing by Thursday.", "All rings closed. A personal best: the bare minimum.", "Full set. Enjoy it. Tomorrow you start from zero like everyone else."],
  streak: (n) => pick([`${n} days straight. Is this what having a personality feels like?`, `${n}-day streak. One lazy morning and it's gone. No pressure.`, `${n} days. The flame is real. Your excuses are running out.`], n),
  broken: (name, n) => pick([`"${name}": ${n} days, gone. You had one job.`, `You killed a ${n}-day "${name}" streak. Over what, a nap?`, `${n} days of "${name}", thrown away. Classic you.`], n),
  undo: ["Undone. Indecision suits you.", "Reversed. Make up your mind.", "Undone. We'll pretend you meant that."],
  nothingToUndo: ["Nothing to undo. Your mistakes are permanent now."],
  synced: ["Signed in. Now you can ignore your tasks on every device."]
};
export const quip = (name) => { const list = quips[name]; return list[Math.floor(Math.random() * list.length)]; };

export const empties = {
  tasks: "Nothing to do. Suspiciously convenient.",
  dailies: "No dailies. Discipline is for other people, apparently.",
  notes: "No notes. Not one thought worth keeping.",
  day: "Nothing due this day. You don't deserve it, but fine.",
  done: "Nothing finished. Shocking absolutely no one.",
  reminders: "No reminders. You'll \"just remember\". Sure you will."
};
