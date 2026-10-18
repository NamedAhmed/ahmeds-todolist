import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { all, commit, getState, uid, useStore } from '../store.js';
import { addDays, between, todayStr, diffDays, doneKey, dueInfo, empties, headline, isDone, lateJab, occursOn, parseTyped, pendingOccurrence, progressOf, quip, ruleText, shortDate, subtasksOf, ymd } from '../lib.js';
import { toast } from './Fire.jsx';
import { DailyStrip } from './Calendar.jsx';

/** Let the browser animate rows to their new places when the list re-sorts. */
function smooth(change) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || calm || document.hidden) return change();
  // The browser runs `once` when it is ready to animate. If it isn't painting (window covered,
  // tab in the background) that can be a long wait, so the timer makes sure the change still lands.
  let ran = false;
  const once = () => { if (!ran) { ran = true; flushSync(change); } };
  const transition = document.startViewTransition(once);
  setTimeout(once, 250);
  for (const p of [transition.ready, transition.finished, transition.updateCallbackDone]) p.catch(() => {});
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#0c0b0a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

// ---------- small pieces ----------
function Title({ value, editing, setEditing, onSave }) {
  if (!editing) return <span className="task-title" onDoubleClick={() => setEditing(true)}>{value}</span>;
  const finish = (e) => { const v = e.target.value.trim(); if (v && v !== value) onSave(v); setEditing(false); };
  return (
    <input className="title-edit" autoFocus defaultValue={value} onBlur={finish}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = value; e.target.blur(); } }} />
  );
}

// The one control a row shows on hover. Everything you can do to a task lives in here.
// Controlled by the row so a key can open it; arrows move through it and Escape hands focus back to the row.
function RowMenu({ items, open, onOpenChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    ref.current.querySelector('[role=menuitem]')?.focus();
    const close = (e) => {
      if (e.type === 'pointerdown' ? !ref.current.contains(e.target) : e.key === 'Escape') {
        onOpenChange(false);
        if (e.type === 'keydown') ref.current.closest('li')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open, onOpenChange]);
  const arrows = (e) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const btns = [...ref.current.querySelectorAll('[role=menuitem]')];
    btns[(btns.indexOf(document.activeElement) + step + btns.length) % btns.length].focus();
  };
  return (
    <span className={'menu-wrap' + (open ? ' open' : '')} ref={ref}>
      <button className="more" tabIndex={-1} aria-label="More" aria-expanded={open} onClick={() => onOpenChange(!open)}>⋯</button>
      <AnimatePresence>
        {open && (
          <motion.div className="menu" role="menu" onKeyDown={arrows} initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.12 }}>
            {items.filter(Boolean).map((item, i) => item === '-'
              ? <hr key={'hr' + i} />
              : <button key={item.label} role="menuitem" className={(item.danger ? 'danger ' : '') + (item.on ? 'on' : '')} onClick={() => { onOpenChange(false); item.run(); }}>{item.label}</button>)}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// Rows are keyboard stops. Focus moves between them without touching their inner controls.
const rowsOf = (li) => [...li.parentElement.children].filter((c) => c.matches('li.task[tabindex]'));
function stepFocus(li, to) {
  const rows = rowsOf(li);
  const next = to === 'first' ? rows[0] : to === 'last' ? rows.at(-1) : rows[rows.indexOf(li) + to];
  next?.focus();
}
// Every row answers the same movement keys; `act` supplies the row's own verbs.
function rowKeys(e, act) {
  if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey) return;
  const li = e.currentTarget;
  const nav = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1, Home: 'first', End: 'last' }[e.key];
  if (nav !== undefined && !e.altKey) { e.preventDefault(); return stepFocus(li, nav); }
  const verb = e.altKey ? ({ ArrowUp: act.up, ArrowDown: act.down })[e.key] : ({
    ' ': act.toggle, x: act.toggle, Enter: act.enter, e: act.rename, d: act.date, m: act.menu, ContextMenu: act.menu,
    '[': act.earlier, ']': act.later, Delete: act.remove, Backspace: act.remove, s: act.skip
  })[e.key];
  if (!verb) return;
  e.preventDefault();
  verb();
}

function DueButton({ due, today, done, inputRef }) {
  const info = dueInfo(due, today);
  if (!due) return null;
  return <button type="button" tabIndex={-1} className={'due ' + (done ? '' : info.cls)} onClick={() => inputRef.current.showPicker?.()}>{info.text}</button>;
}

// ---------- finishing things ----------
function finishTask(task) {
  const changes = [{ t: 'tasks', id: task.id, patch: { done: true, done_at: Date.now() } }];
  // Finishing a project finishes whatever was left inside it.
  if (task.kind === 'project') for (const sub of subtasksOf(getState(), task.id)) if (!sub.done) changes.push({ t: 'tasks', id: sub.id, patch: { done: true, done_at: Date.now() } });
  setTimeout(() => smooth(() => commit('task finished', changes)), 420);
  if (task.kind === 'project') toast(quip('projectDone'));
}

const reopenTask = (task) => smooth(() => commit('task reopened', [{ t: 'tasks', id: task.id, patch: { done: false, done_at: null } }]));

function removeTask(task) {
  const subs = subtasksOf(getState(), task.id);
  smooth(() => commit('task deleted', [task, ...subs].map((t) => ({ t: 'tasks', id: t.id, set: null }))));
  toast(quip('taskDeleted'), { undoable: true });
}

// ---------- a project's insides ----------
function Subtask({ sub }) {
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const patch = (label, p) => commit(label, [{ t: 'tasks', id: sub.id, patch: p }]);
  const done = sub.done || closing;
  const toggle = () => {
    if (sub.done) return patch('step reopened', { done: false });
    setClosing(true);
    setTimeout(() => { patch('step finished', { done: true, done_at: Date.now() }); setClosing(false); }, 380);
  };
  return (
    <motion.li className={'task sub' + (done ? ' done' : '')} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}>
      <div className="task-main">
        <button className="check" aria-pressed={done} aria-label={sub.title} onClick={toggle}><CheckIcon /></button>
        <Title value={sub.title} editing={editing} setEditing={setEditing} onSave={(title) => patch('step renamed', { title })} />
        <button className="del" aria-label={`Delete ${sub.title}`} onClick={() => commit('step deleted', [{ t: 'tasks', id: sub.id, set: null }])}>×</button>
      </div>
    </motion.li>
  );
}

function ProjectBody({ s, task }) {
  const subs = subtasksOf(s, task.id);
  const [text, setText] = useState('');
  const add = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    commit('step added', [{ t: 'tasks', id: uid(), patch: { title: text.trim(), parent: task.id, done: false, kind: 'task', position: (subs.at(-1)?.position ?? 0) + 1, created: Date.now() } }]);
    setText('');
  };
  return (
    <motion.div className="project-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
      <div className="project-inner">
        <ul className="sub-list">
          <AnimatePresence initial={false}>{subs.map((sub) => <Subtask key={sub.id} sub={sub} />)}</AnimatePresence>
        </ul>
        <form onSubmit={add}><input className="sub-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step…" aria-label="New step" /></form>
        <textarea className="project-note" defaultValue={task.note || ''} placeholder="Notes"
          onBlur={(e) => { if (e.target.value !== (task.note || '')) commit('project note edited', [{ t: 'tasks', id: task.id, patch: { note: e.target.value } }]); }} />
      </div>
    </motion.div>
  );
}

// ---------- one row ----------
// At rest a row is a checkbox, a name and a date. Hovering adds the grip and one menu button.
const TaskRow = memo(function TaskRow({ s, task, today, open, onToggleOpen, onMove, sortable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !sortable });
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const liRef = useRef(null);
  const dateRef = useRef(null);
  const isProject = task.kind === 'project';
  const done = task.done || closing;
  const subs = isProject ? subtasksOf(s, task.id) : [];
  const pct = isProject ? progressOf(s, task) : 0;
  const patch = (label, p) => commit(label, [{ t: 'tasks', id: task.id, patch: p }]);
  const late = !done && task.due && task.due < today ? diffDays(today, task.due) : 0;

  const toggle = () => {
    if (task.done) return reopenTask(task);
    setClosing(true);
    finishTask(task);
  };
  useEffect(() => { if (task.done) setClosing(false); }, [task.done]);

  // Leaving the rename box by keyboard lands back on the row, not on nothing.
  const edit = (on) => { setEditing(on); if (!on) requestAnimationFrame(() => { if (document.activeElement === document.body) liRef.current?.focus(); }); };
  const shiftDue = (n) => patch('due date changed', { due: addDays(task.due || today, n) });
  const remove = () => {
    const rows = rowsOf(liRef.current), i = rows.indexOf(liRef.current), keep = rows[i + 1] ?? rows[i - 1];
    removeTask(task);
    setTimeout(() => keep?.isConnected && keep.focus(), 80);
  };
  const keys = (e) => rowKeys(e, {
    toggle, enter: isProject ? () => onToggleOpen(task.id) : () => edit(true), rename: () => edit(true),
    date: () => dateRef.current.showPicker?.(), menu: () => setMenuOpen(true), earlier: () => shiftDue(-1), later: () => shiftDue(1),
    remove, up: sortable && (() => onMove(task.id, -1)), down: sortable && (() => onMove(task.id, 1))
  });

  const menu = [
    { label: 'Rename', run: () => edit(true) },
    { label: task.due ? 'Change date' : 'Set a date', run: () => dateRef.current.showPicker?.() },
    task.due && { label: 'Remove date', run: () => patch('date removed', { due: null }) },
    { label: isProject ? 'Turn into a task' : 'Turn into a project', run: () => { patch(isProject ? 'made a task' : 'made a project', { kind: isProject ? 'task' : 'project' }); if (!isProject && !open) onToggleOpen(task.id); } },
    '-',
    { label: 'Delete', danger: true, run: () => removeTask(task) }
  ];

  const style = { transform: CSS.Translate.toString(transform), transition, viewTransitionName: isDragging ? 'none' : `t-${task.id}` };
  return (
    <li ref={(node) => { setNodeRef(node); liRef.current = node; }} style={style} data-task={task.id} tabIndex={0} onKeyDown={keys} className={['task', done && 'done', isProject && 'project', isDragging && 'dragging'].filter(Boolean).join(' ')}>
      <div className="task-main">
        {sortable && <button className="grip" aria-label="Drag to reorder" {...attributes} {...listeners} tabIndex={-1}>⋮⋮</button>}
        <button tabIndex={-1} className={'check' + (isProject ? ' square' : '')} aria-pressed={done} aria-label={(done ? 'Mark not done: ' : 'Mark done: ') + task.title} onClick={toggle}><CheckIcon /></button>
        {isProject && !editing
          ? <button tabIndex={-1} className="task-title as-button" onClick={() => onToggleOpen(task.id)} aria-expanded={open}>{task.title}</button>
          : <Title value={task.title} editing={editing} setEditing={edit} onSave={(title) => patch('task renamed', { title })} />}
        {late > 0 && <span className="jab">{lateJab(late, task.created || 0)}</span>}
        <span className="row-end">
          {isProject && <span className="count">{subs.filter((x) => x.done).length}/{subs.length}</span>}
          <DueButton due={task.due} today={today} done={done} inputRef={dateRef} />
          <input ref={dateRef} className="hidden-date" type="date" value={task.due || ''} onChange={(e) => patch('due date changed', { due: e.target.value || null })} tabIndex={-1} aria-hidden="true" />
          <RowMenu items={menu} open={menuOpen} onOpenChange={setMenuOpen} />
        </span>
      </div>
      {isProject && !done && <div className="progress" style={{ '--p': pct + '%' }} role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" />}
      <AnimatePresence initial={false}>{isProject && open && <ProjectBody s={s} task={task} />}</AnimatePresence>
    </li>
  );
// A row only repaints when its own task, the day, or (for a project) its steps change, not on every edit elsewhere.
}, (a, b) => a.task === b.task && a.today === b.today && a.open === b.open && a.sortable === b.sortable && a.onMove === b.onMove
  && (a.task.kind !== 'project' || a.s.tasks === b.s.tasks));

// A reminder's turn in the list. Not a stored task: it exists because its rule says today is the day.
function ReminderRow({ reminder, date, today }) {
  const [closing, setClosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const info = dueInfo(date, today);
  const finish = (skipped) => {
    setClosing(true);
    const key = doneKey(reminder.id, date);
    setTimeout(() => smooth(() => commit(skipped ? 'reminder skipped' : 'reminder done', [{ t: 'completions', id: key, set: { id: key, ref: reminder.id, date, kind: 'reminder', skipped } }])), 400);
  };
  const keys = (e) => rowKeys(e, { toggle: () => date <= today && finish(false), enter: () => date <= today && finish(false), skip: () => finish(true), menu: () => setMenuOpen(true) });
  return (
    <li className={'task reminder' + (closing ? ' done' : '')} style={{ viewTransitionName: `r-${reminder.id}` }} tabIndex={0} onKeyDown={keys}>
      <div className="task-main">
        <button tabIndex={-1} className="check" aria-label={'Mark done: ' + reminder.title} onClick={() => finish(false)} disabled={date > today}><CheckIcon /></button>
        <span className="task-title">{reminder.title}</span>
        <span className="row-end">
          <span className="tag" title={ruleText(reminder.rule)}>↻ {ruleText(reminder.rule)}</span>
          <span className={'due ' + info.cls}>{info.text}</span>
          <RowMenu items={[{ label: 'Skip this one', run: () => finish(true) }]} open={menuOpen} onOpenChange={setMenuOpen} />
        </span>
      </div>
    </li>
  );
}

// ---------- the add row ----------
// The MVP's row: a box, a date, Add. Plus one word that switches between a task and a project.
// A date typed at the end ("friday", "oct 12") moves the date for you.
function AddRow({ day, today }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('task');
  const [picked, setPicked] = useState(null);   // a date chosen by hand beats a typed one
  const parsed = useMemo(() => parseTyped(text), [text]);
  const due = picked ?? parsed?.due ?? day ?? today;

  const submit = (e) => {
    e.preventDefault();
    const title = (parsed && !picked ? parsed.title : text).trim();
    if (!title) return;
    const top = Math.min(0, ...all(getState(), 'tasks').filter((t) => !t.parent).map((t) => t.position));
    smooth(() => commit(kind === 'project' ? 'project added' : 'task added', [{ t: 'tasks', id: uid(), patch: { title, due, done: false, kind, position: top - 1, created: Date.now() } }]));
    setText(''); setPicked(null);
  };

  return (
    <form className="task-form" onSubmit={submit} autoComplete="off">
      <input id="task-title" type="text" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={kind === 'project' ? 'Add a project…' : 'Add a task…'} aria-label={kind === 'project' ? 'Project name' : 'Task name'} />
      <button type="button" className="kind-switch" onClick={() => setKind(kind === 'task' ? 'project' : 'task')} title="Switch between task and project">
        {kind === 'task' ? 'Task' : 'Project'}
      </button>
      <input id="task-due" type="date" value={due} onChange={(e) => setPicked(e.target.value || null)} aria-label="Due date" />
      <button type="submit" className="btn-add">Add</button>
    </form>
  );
}

// ---------- drag and drop ----------
// One context spans the calendar and the list, so a task can be reordered or dropped on a day.
// Overdue tasks come first (each group keeps the user's own order), unless one day is being looked at.
const isLate = (t, day, today) => !day && !!t.due && t.due < today;
const openTasks = (s, day, today) => all(s, 'tasks').filter((t) => !t.parent && !t.done && (!day || t.due === day))
  .sort((a, b) => isLate(b, day, today) - isLate(a, day, today) || a.position - b.position);
// Over a day cell the pointer decides; inside the list the nearest row does.
const collide = (args) => { const hits = pointerWithin(args); return hits.length ? hits : closestCenter(args); };

// Move one task to a new slot; only that task's position changes.
function reorder(list, from, to) {
  const moved = arrayMove(list, from, to);
  commit('reordered', [{ t: 'tasks', id: list[from].id, patch: { position: between(moved[to - 1]?.position, moved[to + 1]?.position) } }]);
}

export function TaskDnd({ day, children }) {
  const [active, setActive] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }) => {
    setActive(null);
    if (!over || active.id === over.id) return;
    const date = over.data.current?.date;
    if (date) {
      commit('task moved', [{ t: 'tasks', id: active.id, patch: { due: date } }]);
      toast('Moved to ' + shortDate(date) + '.', { undoable: true });
      return;
    }
    const open = openTasks(getState(), day, todayStr());
    const from = open.findIndex((t) => t.id === active.id);
    const to = open.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    reorder(open, from, to);
  };
  const dragged = active && all(getState(), 'tasks').find((t) => t.id === active);
  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={({ active }) => setActive(active.id)} onDragCancel={() => setActive(null)} onDragEnd={onDragEnd}>
      {children}
      <DragOverlay dropAnimation={null}>{dragged && <div className="drag-chip">{dragged.title}</div>}</DragOverlay>
    </DndContext>
  );
}

// ---------- the column ----------
// One plain list: reminders due, then open tasks in your order, then finished ones tucked away.
export default function Tasks({ today, day, setDay }) {
  const s = useStore();
  const [openIds, setOpenIds] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);

  const top = useMemo(() => all(s, 'tasks').filter((t) => !t.parent).sort((a, b) => a.position - b.position), [s.tasks]);
  const matches = (t) => !day || t.due === day;
  const open = useMemo(() => openTasks(s, day, today), [s.tasks, day, today]);
  const done = top.filter((t) => t.done && (matches(t) || (t.done_at && ymd(new Date(t.done_at)) === day))).sort((a, b) => (b.done_at || 0) - (a.done_at || 0));

  const reminders = all(s, 'reminders')
    .map((r) => ({ r, date: day ? (occursOn(r.rule, day) && !isDone(s, r.id, day) ? day : null) : pendingOccurrence(s, r, today) }))
    .filter((x) => x.date);

  const stats = useMemo(() => {
    const openAll = top.filter((t) => !t.done);
    return {
      total: top.length,
      open: openAll.length,
      overdue: openAll.filter((t) => t.due && t.due < today).length,
      doneToday: top.filter((t) => t.done && t.done_at && ymd(new Date(t.done_at)) === today).length
    };
  }, [top, today]);
  const line = useMemo(() => headline({ ...stats, seed: stats.open * 7 + stats.overdue * 3 + stats.doneToday }), [stats]);

  const toggleOpen = useCallback((id) => {
    setOpenIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    // once the project has unfolded, bring all of it into view
    setTimeout(() => document.querySelector(`[data-task="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 380);
  }, []);
  // Stable, so memoised rows aren't invalidated by it; it reads the current day from a ref.
  const view = useRef({});
  view.current = { day, today };
  const moveRow = useCallback((id, dir) => {
    const list = openTasks(getState(), view.current.day, view.current.today), from = list.findIndex((t) => t.id === id), to = from + dir;
    if (from >= 0 && to >= 0 && to < list.length) reorder(list, from, to);
  }, []);
  const lateCount = open.filter((t) => isLate(t, day, today)).length;
  const lateReminders = reminders.filter((x) => !day && x.date < today);
  const dueReminders = reminders.filter((x) => !lateReminders.includes(x));
  const lateTotal = lateCount + lateReminders.length;
  const reminderRow = ({ r, date }) => <ReminderRow key={r.id + date} reminder={r} date={date} today={today} />;
  const finishedShown = showDone || !!day;
  const nothing = !open.length && !reminders.length;

  return (
    <section className="col col-tasks" aria-label="Tasks">
      <header className="col-head">
        <h1>Tasks</h1>
        <button className={'day-toggle' + (day === today ? ' on' : '')} aria-pressed={day === today}
          onClick={() => setDay(day === today ? null : today)}>Today only</button>
        {day && day !== today && <button className="day-clear" onClick={() => setDay(null)}>{shortDate(day)} only ×</button>}
      </header>
      <p className="voice">{line}</p>

      <DailyStrip today={today} />

      <AddRow day={day} today={today} />

      <ul className="task-list">
          {lateTotal > 0 && <li className="group-head late">Overdue · {lateTotal}</li>}
          {lateReminders.map(reminderRow)}
          {lateTotal === 0 && dueReminders.map(reminderRow)}
          <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {open.map((t, i) => (
              <Fragment key={t.id}>
                {lateTotal > 0 && i === lateCount && <><li className="group-head">Coming up</li>{dueReminders.map(reminderRow)}</>}
                <TaskRow s={s} task={t} today={today} sortable open={openIds.has(t.id)} onToggleOpen={toggleOpen} onMove={moveRow} />
              </Fragment>
            ))}
            {lateTotal > 0 && lateCount === open.length && <><li className="group-head">Coming up</li>{dueReminders.map(reminderRow)}</>}
          </SortableContext>
          {nothing && <li className="empty-row"><p className="empty">{day ? empties.day : empties.tasks}</p></li>}
          {done.length > 0 && (
            <li className="done-head">{day
              ? <span className="mono">Finished · {done.length}</span>
              : <button className="mono" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} finished · {done.length}</button>}</li>
          )}
          {finishedShown && done.map((t) => <TaskRow key={t.id} s={s} task={t} today={today} sortable={false} open={openIds.has(t.id)} onToggleOpen={toggleOpen} onMove={moveRow} />)}
      </ul>
    </section>
  );
}
