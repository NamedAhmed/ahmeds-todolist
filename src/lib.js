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
// Savage on purpose: the target is your habits, never you. Headlines and jabs use a stable seed so a
// line doesn't change on every keystroke; spoken reactions (quips) are random but never the same one twice in a row.
const pick = (list, seed) => list[Math.abs(Math.round(seed)) % list.length];

export function headline({ open, overdue, doneToday, total, seed }) {
  if (!total) return pick([
    "Nothing here. Not a single ambition. Impressive.",
    "An empty list. Your potential, visualised.",
    "No tasks. Either you're done with life or hiding from it.",
    "A blank list. Bold. Delusional, but bold.",
    "Nothing to do. Enjoy the calm before you remember everything."
  ], seed);
  if (overdue >= 10) return pick([
    `${overdue} overdue. At this point the list is a crime scene.`,
    `${overdue} late. Declare bankruptcy and start over, nobody would blame you.`,
    `${overdue} overdue. The deadlines held a vote. You lost.`
  ], seed);
  if (overdue >= 5) return pick([
    `${overdue} overdue. This isn't a to-do list, it's a memorial.`,
    `${overdue} late. The deadlines have stopped believing in you.`,
    `${overdue} overdue. Even the list is embarrassed.`,
    `${overdue} late. Procrastination isn't a personality, but you're really committing.`
  ], seed);
  if (overdue > 0) return pick([
    `${overdue} overdue. You saw the date. You chose this.`,
    `${overdue} late. "I'll do it tomorrow", said you, every yesterday.`,
    `Overdue: ${overdue}. Deadlines are just suggestions to you, huh.`,
    `${overdue} overdue. It's not going to do itself. Believe me, I've waited.`,
    `${overdue} late. Not a disaster. Yet. Give it a day.`
  ], seed);
  if (!open) return pick([
    "All done. Who did it for you?",
    "Everything finished. I'm genuinely concerned.",
    "Nothing left. Don't worry, you'll ruin it by Monday.",
    "Clear list. Savour it, the feeling lasts about nine minutes.",
    "All done. Add something. You were never going to cope with peace."
  ], seed);
  if (doneToday >= 5) return pick([
    `${doneToday} done today. Relax, nobody's handing out medals.`,
    `${doneToday} finished. Who are you trying to impress?`,
    `${doneToday} done. Productive today. Where was this all week?`
  ], seed);
  if (open === 1) return pick([
    "One task. One. And yet here we are.",
    "One left. You'll still find a way to make it take all week.",
    "One thing left. It's lonely. Go and finish it.",
    "One task. Even you can't make this complicated. Try me."
  ], seed);
  if (open > 20) return pick([
    `${open} open tasks. That's not a list, it's a lifestyle.`,
    `${open} left. You don't need a to-do list, you need a miracle.`
  ], seed);
  if (open > 12) return pick([
    `${open} open tasks. Writing them down isn't the same as doing them.`,
    `${open} left. You collect tasks like other people collect regrets.`,
    `${open} open. Adding was fun. Doing is where you vanish.`
  ], seed);
  return pick([
    `${open} left. Staring at them isn't a strategy.`,
    `${open} to go. They've been waiting. They're used to it.`,
    `${open} things. Do one. Shock everybody.`,
    `${open} left. The scrolling can wait. It won't, but it could.`,
    `${open} on the list. Your phone isn't going to check itself, but this is more important.`,
    `${open} left. Procrastinating about them takes more effort than doing them.`
  ], seed);
}

/** A small insult for a task that is late. The later it is, the worse it gets. */
export function lateJab(daysLate, seed) {
  if (daysLate >= 30) return pick(["it's older than some of your friendships", "archaeologists are interested", "a historical document at this point", "the task has grandchildren now"], seed);
  if (daysLate >= 14) return pick(["at this point just delete it", "a fossil", "it has given up on you too", "older than your last good habit", "this is a hostage situation"], seed);
  if (daysLate >= 5) return pick(["still here. unlike your motivation", "it's not doing itself", "you keep scrolling past this", "embarrassing", "this one has your name on it, and not in a good way"], seed);
  if (daysLate >= 2) return pick(["any day now", "you said you'd do this", "ignoring it isn't working", "tick tock", "it's watching you"], seed);
  return pick(["yesterday called", "so close. not really", "one day late already", "day one of avoiding it"], seed);
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

// Each entry is a list of lines; a line is a string or a function of the arguments quip() was given.
export const quips = {
  // adding
  taskAdded: ["Added. Writing it down was the easy part.", "Noted. Whether it gets done is a separate question.", "Another one. Your list is basically a hobby now.", "Added. Bold of you to assume future you will cooperate.", "Logged. Future you has been notified and is already annoyed.", "A new task. The old ones are jealous."],
  projectAdded: ["A project. How ambitious. How temporary.", "New project. Odds of it dying in this list: high.", "You've named it. That was the hard part. The rest is physical.", "A whole project. Remember when you said you'd stop starting things?"],
  stepAdded: ["Another step. Splitting it up is easier than starting it.", "Step added. Planning: the most comfortable way to avoid working."],
  noteAdded: ["A blank note. The hardest page to start.", "New note. Fill it or it will judge you.", "Writing things down. Look at you, a person with thoughts."],
  dailyAdded: ["A new daily. Day one is always a banger. Day three is where they die.", "Added. Place your bets on how long you last.", "New habit. The enthusiasm is touching. Temporary, but touching."],
  reminderAdded: ["Added. The nagging is now automated.", "A reminder. Your memory sends its regards. It quit."],
  // finishing
  taskDone: ["Done. See? It was never that hard.", "Finished. Frame it.", "Done. I'd clap, but I'm text.", "Look at you, doing the thing you said you'd do.", "Crossed off. The bar was on the floor and you cleared it.", "Done. Don't let it go to your head. It's one task.", "One down. Imagine if you did this on purpose."],
  taskDoneLate: [(n) => `Finished. Only ${n} days after it mattered.`, (n) => `Done, ${n} days late. The task has been through things.`, (n) => `Finally. ${n} days. We were about to send a search party.`, (n) => `${n} days late. It's fine. It's fine. It's not fine.`],
  stepDone: ["Step done. Keep going, or don't, I'm not your mum.", "A step. Tiny, but it counts. Barely."],
  projectDone: ["A whole project. Finished. By you. Somebody check the logs.", "Project done. Took you long enough.", "Project complete. Don't start three new ones to celebrate.", "Done. A whole project. Who are you and what did you do with the real you?"],
  dailyDone: ["Ticked. That's the easy bit, you do it again tomorrow.", "Daily done. The streak lives.", "One ring closer to a personality.", "Done for today. See you tomorrow, ideally."],
  reminderDone: ["Done. It'll be back. It always comes back.", "Ticked. Until next time. There's always next time."],
  allDailies: ["Every daily done. Don't get cocky, you'll be back to nothing by Thursday.", "All rings closed. A personal best: the bare minimum.", "Full set. Enjoy it. Tomorrow you start from zero like everyone else.", "All dailies. Fine. You're allowed one smug moment."],
  // undoing and changing your mind
  reopened: ["Reopened. It wasn't done, was it.", "You ticked it too early. Classic.", "Back on the list. It missed you. Nobody else did.", "Un-done. A rare sight: honesty."],
  dailyUnticked: ["Unticked. Lying to an app: a new low.", "Taking it back. At least you're honest with yourself. Sometimes."],
  reminderSkipped: ["Skipped. Consequences are a future problem.", "Skipped. Adults do this too. Badly."],
  // moving things around
  later: ["Pushed back again. The deadline noticed.", "Later. Always later. That's your whole brand.", "Moved to later. Bold strategy, let's see if it pays off.", "Rescheduled. The task is getting fed up of this too."],
  earlier: ["Earlier? Who are you and what did you do with yourself?", "Pulled forward. Suspicious ambition.", "Sooner. Is this a joke, or are you ill?"],
  movedToDay: [(d) => `Moved to ${d}. Out of sight, still your problem.`, (d) => `Dumped on ${d}. Past you is annoyed, future you is furious.`, (d) => `${d}. Another day to not do it.`, (d) => `${d} it is. Same task, same dread, new date.`],
  renamed: ["Renamed. Calling it something nicer won't make it less boring.", "New name, same dread.", "Renamed. Procrastination with extra steps."],
  reordered: ["Reordered. Rearranging the list: the most productive thing you've done all day.", "Shuffled. Feels like progress. Isn't.", "New order. Same you."],
  // deleting and quitting
  taskDeleted: ["Deleted. Can't fail what you never do.", "Gone. Cowardice, but efficient.", "Deleted. The easiest way to finish anything.", "Deleted. Not done, just erased. Bold accounting.", "Gone. The task, and any trace of your good intentions."],
  noteDeleted: ["Note deleted. The world will cope.", "Gone. Some thoughts deserve it.", "Deleted. Your best ideas were never going to be in here anyway."],
  reminderDeleted: ["Reminder deleted. Good luck remembering anything.", "Gone. You'll definitely remember that on your own. Definitely."],
  dailyArchived: ["Archived. Quitting: the one habit you keep.", "Gone. Another habit for the graveyard.", "Archived. It was nice while it lasted, which was briefly."],
  // the rest
  undo: ["Undone. Indecision suits you.", "Reversed. Make up your mind.", "Undone. We'll pretend you meant that.", "Undone. Go on, change your mind again. I'm not busy."],
  redo: ["Redone. Make up your mind.", "Redone. Now commit to it, for once."],
  nothingToUndo: ["Nothing to undo. Your mistakes are permanent now.", "Nothing to undo. Congratulations, you haven't done anything."],
  synced: ["Signed in. Now you can ignore your tasks on every device."],
  streak: [(n) => `${n} days straight. Is this what having a personality feels like?`, (n) => `${n}-day streak. One lazy morning and it's gone. No pressure.`, (n) => `${n} days. The flame is real. Your excuses are running out.`, (n) => `${n} days. I'd congratulate you, but you'll break it.`],
  broken: [(name, n) => `"${name}": ${n} days, gone. You had one job.`, (name, n) => `You killed a ${n}-day "${name}" streak. Over what, a nap?`, (name, n) => `${n} days of "${name}", thrown away. Classic you.`, (name, n) => `"${name}" streak: ${n} days. Died of neglect.`]
};

const lastLine = {};
/** A random line for `name`, never the one just used. Extra arguments fill in a line's blanks. */
export function quip(name, ...args) {
  const list = quips[name];
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastLine[name]) i = (i + 1) % list.length;
  lastLine[name] = i;
  const line = list[i];
  return typeof line === 'function' ? line(...args) : line;
}

export const empties = {
  tasks: "Nothing to do. Suspiciously convenient.",
  dailies: "No dailies. Discipline is for other people, apparently.",
  notes: "No notes. Not one thought worth keeping.",
  day: "Nothing due this day. You don't deserve it, but fine.",
  done: "Nothing finished. Shocking absolutely no one.",
  reminders: "No reminders. You'll \"just remember\". Sure you will."
};
