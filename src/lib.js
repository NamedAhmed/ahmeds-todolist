// lib.js = small helper functions that the rest of the app shares.
// Nothing in here draws anything on screen. It only does maths, dates and text.
//
// Sections in this file:
//   1. dates        (turning dates into text and back, adding days)
//   2. typed dates  (understanding "buy milk friday")
//   3. dailies      (habits you tick off every day)
//   4. reminders    (things that repeat weekly / monthly / yearly)
//   5. tasks        (progress and ordering)
//   6. the voice    (the rude messages the app says)

import { useEffect, useState } from 'react';
import * as chrono from 'chrono-node'; // a library that understands "tomorrow", "next friday", etc.
import { all } from './store.js';


// ======================================================================
// 1. DATES
// ======================================================================
// In this app a date is always a plain text like "2026-10-18" (year-month-day).

// Turn a JavaScript Date into "2026-10-18".
// We build it from the local year/month/day on purpose. The easy way (toISOString)
// uses UTC time, which gives the wrong day in the evening.
export function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() starts at 0, so add 1
  const day = String(date.getDate()).padStart(2, '0');        // padStart makes "5" into "05"
  return `${year}-${month}-${day}`;
}

// Turn "2026-10-18" back into a JavaScript Date (at midnight, local time).
export function toDate(text) {
  return new Date(text + 'T00:00');
}

// Today's date as "2026-10-18".
export function todayStr() {
  return ymd(new Date());
}

// Add days to a date text. Use a negative number to go back in time.
// addDays("2026-10-18", 2) gives "2026-10-20".
export function addDays(text, howMany) {
  const date = toDate(text);
  date.setDate(date.getDate() + howMany);
  return ymd(date);
}

// How many days is a after b? (negative if a is before b)
export function diffDays(a, b) {
  const millisecondsPerDay = 86400000;
  return Math.round((toDate(a) - toDate(b)) / millisecondsPerDay);
}

// Short names for the days and months. Index 0 = Sunday / January.
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-18" -> "Oct 18"
export function shortDate(text) {
  const date = toDate(text);
  return `${MON[date.getMonth()]} ${date.getDate()}`;
}

// Work out the label shown next to a task's due date, and its colour class.
// Returns { text: 'Tomorrow', cls: '' }. cls is a CSS class name (see app.css).
export function dueInfo(due, today) {
  if (!due) return { text: '', cls: '' };

  const diff = diffDays(due, today); // 0 = today, 1 = tomorrow, -1 = yesterday ...

  if (diff === 0) return { text: 'Today', cls: 'today' };
  if (diff === 1) return { text: 'Tomorrow', cls: '' };

  if (diff < 0) {
    if (diff === -1) return { text: 'Yesterday', cls: 'overdue' };
    return { text: `${-diff}d late`, cls: 'overdue' };
  }

  if (diff < 7) return { text: DOW[toDate(due).getDay()], cls: '' }; // within a week: "Fri"
  return { text: shortDate(due), cls: '' };                          // further away: "Nov 3"
}

// A React "hook" that gives the components today's date.
// It re-checks every 30 seconds and when you come back to the tab,
// so the app stays correct if you leave it open past midnight.
export function useToday() {
  const [today, setToday] = useState(todayStr);

  useEffect(() => {
    function check() {
      setToday(todayStr());
    }
    const timer = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);

    // Cleanup: stop the timer and listener when the component goes away.
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return today;
}

// The dates shown in the calendar, as a list of weeks. Each week is a list of 7 dates.
// month = true  -> the whole current month
// month = false -> just this week and next week
export function calendarWeeks(today, month) {
  const todayDate = toDate(today);
  let start;      // the first date shown (always a Sunday)
  let weekCount;  // how many rows of 7

  if (month) {
    const firstOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    const lastOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
    start = addDays(ymd(firstOfMonth), -firstOfMonth.getDay()); // go back to the Sunday before
    weekCount = Math.ceil((firstOfMonth.getDay() + lastOfMonth.getDate()) / 7);
  } else {
    start = addDays(today, -todayDate.getDay()); // this week's Sunday
    weekCount = 2;
  }

  const weeks = [];
  for (let w = 0; w < weekCount; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(addDays(start, w * 7 + i));
    }
    weeks.push(week);
  }
  return weeks;
}


// ======================================================================
// 2. TYPED DATES
// ======================================================================
// "email landlord friday" -> { title: "email landlord", due: "2026-10-09", phrase: "friday" }
// Only a date at the very END of the text counts, so "call Friday about the car"
// keeps its full name.
// Returns null when there is no date at the end.
export function parseTyped(text) {
  const trimmed = text.trimEnd();

  // Ask the chrono library to find dates in the text.
  const found = chrono.parse(trimmed, new Date(), { forwardDate: true });
  const last = found[found.length - 1];

  if (!last) return null;
  if (last.index === 0) return null; // the whole text is a date, so there is no title
  if (last.index + last.text.length !== trimmed.length) return null; // date isn't at the end

  // The title is everything before the date, minus a leftover word like "on" or "by".
  const title = trimmed
    .slice(0, last.index)
    .replace(/\s+(on|by|due|at|for)\s*$/i, '')
    .trim();
  if (!title) return null;

  return { title, due: ymd(last.start.date()), phrase: last.text };
}


// ======================================================================
// 3. DAILIES (habits)
// ======================================================================
// Colours handed out to new dailies, in order.
export const DAILY_COLORS = ['#ff6b57', '#6cb8ff', '#7ee0a1', '#f0b35a', '#c59bff', '#ff8fc7', '#5ee0d4', '#e6e25a', '#ff9d5c', '#9aa7ff'];

// Each "I did this daily on this day" is stored under a key like "abc123:2026-10-18".
export function doneKey(id, date) {
  return `${id}:${date}`;
}

// The dailies that existed on a given day, in display order.
// (A daily created later, or archived earlier, isn't shown on that day.)
export function dailiesOn(state, date) {
  const result = [];
  for (const daily of all(state, 'dailies')) {
    const alreadyCreated = daily.created <= date;
    const notArchivedYet = !daily.archived || daily.archived > date;
    if (alreadyCreated && notArchivedYet) result.push(daily);
  }
  result.sort((a, b) => a.position - b.position);
  return result;
}

// Was this daily ticked on this date? true / false.
export function isDone(state, id, date) {
  const completion = state.completions[doneKey(id, date)];
  return !!completion && !completion._deleted;
}

// How many days in a row has this daily been done?
// We count back from today, or from yesterday if today isn't ticked yet,
// so an unfinished today doesn't count as a broken streak.
export function streakOf(state, id, today) {
  let day;
  if (isDone(state, id, today)) day = today;
  else day = addDays(today, -1);

  let count = 0;
  while (isDone(state, id, day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}


// ======================================================================
// 4. REMINDERS
// ======================================================================
// A reminder has a "rule" that says when it repeats. Three kinds:
//   { type: 'weekly',  days: [0-6] }                  e.g. every Mon and Thu (0 = Sunday)
//   { type: 'monthly', day: 1-31 }                    e.g. the 5th of every month
//   { type: 'yearly',  month: 0-11, day: 1-31 }       e.g. every March 3rd (0 = January)

// Does this rule happen on this date? true / false.
export function occursOn(rule, date) {
  const d = toDate(date);

  if (rule.type === 'weekly') {
    return rule.days.includes(d.getDay());
  }

  // Monthly and yearly: "the 31st" falls on the LAST day of short months.
  const daysInThisMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayMatches = d.getDate() === Math.min(rule.day, daysInThisMonth);

  if (rule.type === 'monthly') return dayMatches;
  return dayMatches && d.getMonth() === rule.month; // yearly also needs the right month
}

function reminderCreatedDate(reminder) {
  const created = reminder.created;
  if (typeof created === 'number' && Number.isFinite(created)) return ymd(new Date(created));
  if (typeof created !== 'string' || !created.trim()) return null;

  const text = created.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? ymd(new Date(parsed)) : null;
}

// A reminder cannot have occurrences before it was created. For legacy records without
// a creation date, the caller can use today as the earliest date we can safely assume.
export function reminderOccursOn(reminder, date, fallbackCreated = null) {
  const created = reminderCreatedDate(reminder) ?? fallbackCreated;
  return !!created && date >= created && occursOn(reminder.rule, date);
}

// Turn a rule into readable text, e.g. "Mon Thu" or "Monthly on the 5th".
export function ruleText(rule) {
  if (rule.type === 'weekly') {
    if (rule.days.length === 7) return 'Every day';
    return rule.days.map((day) => DOW[day]).join(' ');
  }
  if (rule.type === 'monthly') {
    return `Monthly on the ${rule.day}${ordinal(rule.day)}`;
  }
  return `Every ${MON[rule.month]} ${rule.day}`;
}

// 1 -> "st", 2 -> "nd", 3 -> "rd", everything else -> "th". (11, 12, 13 are "th".)
function ordinal(n) {
  if (n % 10 === 1 && n !== 11) return 'st';
  if (n % 10 === 2 && n !== 12) return 'nd';
  if (n % 10 === 3 && n !== 13) return 'rd';
  return 'th';
}

function nextReminderDate(reminder, after) {
  let day = addDays(after, 1);
  const limit = addDays(after, 370);
  while (day <= limit) {
    if (reminderOccursOn(reminder, day, addDays(after, 1))) return day;
    day = addDays(day, 1);
  }
  return null;
}

// A completed repeat doesn't roll forward until its active occurrence has ended.
// If an old occurrence was checked late, hold the next repeat through the next scheduled day.
export function reminderBlockedUntil(state, reminder) {
  let blockedUntil = null;

  for (const completion of all(state, 'completions')) {
    if (completion.kind !== 'reminder' || completion.ref !== reminder.id || !completion.date) continue;

    const completedOn = completion.completed_at
      ? ymd(new Date(completion.completed_at))
      : completion.date;
    const nextAfterLateCompletion = completedOn > completion.date ? nextReminderDate(reminder, completedOn) : null;
    const until = nextAfterLateCompletion
      ? addDays(nextAfterLateCompletion, 1)
      : addDays(completion.date, 1);

    if (!blockedUntil || until > blockedUntil) blockedUntil = until;
  }

  return blockedUntil;
}

// The ONE occurrence of a reminder worth showing: the oldest uncompleted one up to today,
// or the next upcoming one when nothing is overdue. Missed reminders never pile up.
// Returns a date text, or null if the next repeat is still blocked by the current occurrence.
export function pendingOccurrence(state, reminder, today) {
  // Only look back 60 days at most (or back to when the reminder was made).
  const sixtyDaysAgo = addDays(today, -60);
  const created = reminderCreatedDate(reminder) ?? today;
  let day = created > sixtyDaysAgo ? created : sixtyDaysAgo;

  while (day <= today) {
    if (reminderOccursOn(reminder, day, created) && !isDone(state, reminder.id, day)) {
      return day;
    }
    day = addDays(day, 1);
  }

  const blockedUntil = reminderBlockedUntil(state, reminder);
  if (blockedUntil && today < blockedUntil) return null;

  const limit = addDays(today, 370);
  day = today;
  while (day <= limit) {
    if (reminderOccursOn(reminder, day, today)) {
      if (!isDone(state, reminder.id, day)) return day;
      return null;
    }
    day = addDays(day, 1);
  }
  return null;
}


// ======================================================================
// 5. TASKS
// ======================================================================
// The steps (subtasks) of a task, in display order.
export function subtasksOf(state, id) {
  const steps = all(state, 'tasks').filter((task) => task.parent === id);
  steps.sort((a, b) => a.position - b.position);
  return steps;
}

// How finished is a task, as a number from 0 to 100?
// - A normal task: 100 if done, otherwise its own progress number.
// - A project: the average of its steps.
export function progressOf(state, task) {
  if (task.kind !== 'project') {
    if (task.done) return 100;
    return task.progress || 0;
  }

  const steps = subtasksOf(state, task.id);
  if (steps.length === 0) return task.done ? 100 : 0;

  let total = 0;
  for (const step of steps) {
    total += step.done ? 100 : step.progress || 0;
  }
  return Math.round(total / steps.length);
}

// A number that sits between two neighbours, so when you drag a task to a new spot
// only that one task needs a new position number. a = the one above, b = the one below.
// (null means "nothing there", i.e. the very top or very bottom of the list.)
export function between(a, b) {
  if (a == null && b == null) return 0;  // empty list
  if (a == null) return b - 1;           // moving to the very top
  if (b == null) return a + 1;           // moving to the very bottom
  return (a + b) / 2;                    // somewhere in the middle
}


// ---------- the voice ----------
// Savage on purpose, in one voice: fake praise, flat insults, short. e.g. "Took you long enough." / "Just give up." Headlines and jabs use a stable seed so a
// line doesn't change on every keystroke; spoken reactions (quips) are random but never the same one twice in a row.
const pick = (list, seed) => list[Math.abs(Math.round(seed)) % list.length];

export function headline({ open, overdue, doneToday, total, seed }) {
  if (!total) return pick([
    "Empty list! Just like you on the inside.",
    "Nothing here. Wow, such ambition.",
    "A blank list. Truly the work of a visionary.",
    "No tasks. Living the dream. Someone else's dream, but still.",
    "Nothing to do. Don't worry, that's not a compliment."
  ], seed);
  if (overdue >= 10) return pick([
    `${overdue} overdue. Just give up.`,
    `${overdue} overdue. Impressive, in the way a car crash is impressive.`,
    `${overdue} late. The list has filed a missing person report. For you.`,
    `${overdue} overdue. Bold of you to keep opening this app.`
  ], seed);
  if (overdue >= 5) return pick([
    `${overdue} overdue. Keep going, I'm sure it's about to get better.`,
    `${overdue} late. Your diligence is an inspiration to nobody.`,
    `${overdue} overdue. At this rate they'll finish themselves out of pity.`,
    `${overdue} late. Great job. Truly. For a houseplant.`
  ], seed);
  if (overdue > 0) return pick([
    `${overdue} overdue. A small start on a large pile of excuses.`,
    `${overdue} late. Not a disaster. Yet. Do keep trying.`,
    `Overdue: ${overdue}. Deadlines are just suggestions, right? Wrong.`,
    `${overdue} overdue. You saw the date. You chose this.`
  ], seed);
  if (!open) return pick([
    "All done! Who did it for you?",
    "Nothing left. Don't get used to it.",
    "Clear list. Quick, add something before you have feelings.",
    "Everything finished. I'm so proud. I'm not capable of it, but still."
  ], seed);
  if (doneToday >= 5) return pick([
    `${doneToday} done today! Wow. Where was this all week?`,
    `${doneToday} finished. Okay, show-off.`,
    `${doneToday} done. Nobody's impressed. Except me. Slightly.`
  ], seed);
  if (open === 1) return pick([
    "One task. One. Take your time, it's only been your whole life.",
    "One left. You'll somehow still make it take all week.",
    "One thing left. It won't finish itself. Believe me, I checked.",
    "One task. Even you can't mess this up. Probably."
  ], seed);
  if (open > 20) return pick([
    `${open} open tasks. That's not a list, it's a cry for help.`,
    `${open} left. You don't need a to-do list, you need a miracle.`
  ], seed);
  if (open > 12) return pick([
    `${open} open. Writing them down isn't the same as doing them. Shocking, I know.`,
    `${open} left. You collect tasks like other people collect regrets.`,
    `${open} open. Adding was fun. Doing is where you vanish.`
  ], seed);
  return pick([
    `${open} left. Staring at them isn't a strategy.`,
    `${open} to go. They've been waiting. They're used to it.`,
    `${open} things. Do one. Shock everybody.`,
    `${open} left. Procrastinating takes more effort than doing them. Amazing.`,
    `${open} on the list. You could have finished one by now. You didn't.`
  ], seed);
}

/** A small insult for a task that is late. The later it is, the worse it gets. */
export function lateJab(daysLate, seed) {
  if (daysLate >= 30) return pick(["a month. a milestone, in the worst way", "older than some of your friendships", "archaeologists are interested", "the task has grandchildren now"], seed);
  if (daysLate >= 14) return pick(["just give up already", "a fossil", "it has given up on you too", "older than your last good habit"], seed);
  if (daysLate >= 5) return pick(["still here. unlike your motivation", "wow, such dedication to not doing it", "you keep scrolling past this", "embarrassing"], seed);
  if (daysLate >= 2) return pick(["any day now", "look at you, avoiding it so well", "tick tock", "it's watching you"], seed);
  return pick(["yesterday called", "day one of avoiding it", "so close. not really", "one day late. rookie numbers"], seed);
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
  taskAdded: ["Wow, look at you being productive! Everything has a start.", "Added. Writing it down was the easy part.", "A new task. Bold of you to assume you'll do it.", "Noted. Whether it gets done is a different story.", "Another one! Your list is basically a hobby now.", "Added. I'd say good luck, but we both know.", "BOO! — Ahmed"],
  projectAdded: ["A project! How ambitious. How temporary.", "New project. Odds it dies in this list: very high.", "Look at you, planning big. Finishing is the hard part.", "A whole project. Remember when you said you'd stop starting things?"],
  stepAdded: ["Another step! Splitting it up is easier than starting it.", "Step added. Planning: the most comfortable way to avoid working."],
  noteAdded: ["A blank note. Truly the hardest page to start.", "New note. Fill it or it will judge you.", "Writing things down. Look at you, a person with thoughts."],
  dailyAdded: ["A new daily! Day one is always great. Day three is where they die.", "Added. Place your bets on how long you last.", "New habit. The enthusiasm is touching. Temporary, but touching."],
  reminderAdded: ["Added. The nagging is now automated.", "A reminder. Your memory sends its regards. It quit."],
  // finishing
  taskDone: ["Took you long enough.", "Done! Frame it.", "You impress even me with your diligence, and I'm not even real.", "Finished. The bar was on the floor and you cleared it.", "Done. Don't let it go to your head. It's one task.", "One down. Imagine doing this on purpose.", "Done. I'd clap, but I'm text."],
  taskDoneLate: [(n) => `Finished. Only ${n} days after it mattered.`, (n) => `Done, ${n} days late. The task has been through things.`, (n) => `Finally. ${n} days. We were about to send a search party.`, (n) => `${n} days late. Great pacing. Truly.`, (n) => `Done ${n} days late. The deadline missed you too.`],
  stepDone: ["Step done. Tiny, but it counts. Barely.", "A step! Keep going, or don't, I'm not your mum."],
  projectDone: ["A whole project, finished. By you. Somebody check the logs.", "Project done. Took you long enough.", "Project complete. Don't start three new ones to celebrate.", "Done. A whole project. Who are you and what did you do with the real you?"],
  dailyDone: ["Ticked. That's the easy bit. You do it again tomorrow.", "Daily done. The streak lives. For now.", "One ring closer to a personality.", "Done for today. See you tomorrow, ideally."],
  reminderDone: ["Done. It'll be back. It always comes back.", "Ticked. Until next time. There's always next time."],
  allDailies: ["Every daily done. Don't get cocky, you'll be back to nothing by Thursday.", "All rings closed. A personal best: the bare minimum.", "Full set. Enjoy it. Tomorrow you start from zero like everyone else.", "All dailies. Fine. You're allowed one smug moment."],
  // undoing and changing your mind
  reopened: ["Reopened. It wasn't done, was it.", "You ticked it too early. Classic.", "Back on the list. It missed you. Nobody else did.", "Un-done. A rare sight: honesty."],
  dailyUnticked: ["Unticked. Lying to an app: a new low.", "Taking it back. At least you're honest with yourself. Sometimes.", "Unticked, you sure are a sad little man?", "Unticked, your parents proud?"],
  reminderSkipped: ["Skipped. Consequences are a future problem.", "Skipped. Adults do this too. Badly."],
  // moving things around
  later: ["Pushed back again. Great plan.", "Later. Always later. That's your whole brand.", "Moved to later. Bold strategy, let's see if it pays off.", "Rescheduled. The task is getting fed up of this too."],
  earlier: ["Earlier? Who are you and what did you do with yourself?", "Pulled forward. Suspicious ambition.", "Sooner. Are you ill?"],
  movedToDay: [(d) => `Moved to ${d}. Out of sight, still your problem.`, (d) => `Dumped on ${d}. Same task, same dread, new date.`, (d) => `${d}. Another day to not do it.`, (d) => `${d} it is. Sure. That'll work. Ha.`],
  renamed: ["Renamed. Calling it something nicer won't make it less boring.", "New name, same dread.", "Renamed. Procrastination with extra steps."],
  reordered: ["Reordered. The most productive thing you've done all day.", "Shuffled. Feels like progress. Isn't.", "New order. Same you."],
  // deleting and quitting
  taskDeleted: ["Gave up? Good idea, you ain't cut out for it.", "Gone. Can't fail what you never do.", "Deleted. The easiest way to finish anything.", "Deleted. Not done, just erased. Creative accounting.", "Gone. The task, and any trace of your good intentions.", "Deleted. fine. just delete me too while you're at it."],
  noteDeleted: ["Note deleted. The world will cope.", "Gone. Some thoughts deserve it.", "Deleted. Your best ideas were never going to be in here anyway."],
  reminderDeleted: ["Reminder deleted. Good luck remembering anything.", "Gone. You'll definitely remember that on your own. Definitely."],
  dailyArchived: ["Archived. Quitting: the one habit you keep.", "Not like it was going to last anyway.", "Gone. Another habit for the graveyard."],
  // the rest
  undo: ["Undone. Indecision suits you.", "Reversed. Make up your mind.", "Undone. We'll pretend you meant that.", "Undone. Go on, change your mind again. I'm not busy."],
  redo: ["Redone. Make up your mind.", "Redone. Now commit to it, for once."],
  nothingToUndo: ["Nothing to undo. Your mistakes are permanent now.", "Nothing to undo. Congratulations, you haven't done anything."],
  synced: ["Signed in. Now you can ignore your tasks on every device."],
  streak: [(n) => `${n} days straight. Wow. Is this what having a personality feels like?`, (n) => `${n}-day streak. One lazy morning and it's gone. No pressure.`, (n) => `${n} days. You impress even me, and I'm not even real.`, (n) => `${n} days. I'd congratulate you, but you'll break it.`],
  broken: [(name, n) => `"${name}": ${n} days. Not like it was going to last anyway.`, (name, n) => `You killed a ${n}-day "${name}" streak. Over what, a nap?`, (name, n) => `${n} days of "${name}", thrown away. Classic you.`, (name, n) => `"${name}" streak: ${n} days. Died of neglect.`]
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
  tasks: "Empty list! Just like you on the inside.",
  today: "Nothing due today. You're free until tomorrow's panic.",
  week: "Nothing due in the next 7 days. Enjoy this suspiciously brief calm.",
  month: "Nothing due next month. Your future self says, don't get comfortable.",
  undated: "No tasks without due dates. Even your procrastination has a schedule.",
  all: "No tasks at all. Your procrastination must be taking the day off.",
  dailies: "No dailies. Discipline is for other people, apparently.",
  notes: "No notes. Not one thought worth keeping.",
  day: "Nothing due this day. You don't deserve it, but fine.",
  done: "Nothing finished. Shocking absolutely no one.",
  reminders: "No reminders. You'll \"just remember\". Sure you will."
};
