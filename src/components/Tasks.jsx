import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { all, commit, getState, uid, useStore } from '../store.js';
import { between, diffDays, doneKey, dueInfo, empties, headline, isDone, lateJab, occursOn, parseTyped, pendingOccurrence, progressOf, quip, ruleText, shortDate, subtasksOf, ymd } from '../lib.js';
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
function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <span className={'menu-wrap' + (open ? ' open' : '')} ref={ref}>
      <button className="more" aria-label="More" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
      <AnimatePresence>
        {open && (
          <motion.div className="menu" role="menu" initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.12 }}>
            {items.filter(Boolean).map((item) => item === '-'
              ? <hr key={Math.random()} />
              : <button key={item.label} role="menuitem" className={(item.danger ? 'danger ' : '') + (item.on ? 'on' : '')} onClick={() => { setOpen(false); item.run(); }}>{item.label}</button>)}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function DueButton({ due, today, done, inputRef }) {
  const info = dueInfo(due, today);
  if (!due) return null;
  return <button type="button" className={'due ' + (done ? '' : info.cls)} onClick={() => inputRef.current.showPicker?.()}>{info.text}</button>;
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
function TaskRow({ s, task, today, open, onToggleOpen, sortable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !sortable });
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
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

  const menu = [
    { label: 'Rename', run: () => setEditing(true) },
    { label: task.due ? 'Change date' : 'Set a date', run: () => dateRef.current.showPicker?.() },
    task.due && { label: 'Remove date', run: () => patch('date removed', { due: null }) },
    { label: isProject ? 'Turn into a task' : 'Turn into a project', run: () => { patch(isProject ? 'made a task' : 'made a project', { kind: isProject ? 'task' : 'project' }); if (!isProject && !open) onToggleOpen(); } },
    '-',
    { label: 'Delete', danger: true, run: () => removeTask(task) }
  ];

  const style = { transform: CSS.Translate.toString(transform), transition, viewTransitionName: isDragging ? 'none' : `t-${task.id}` };
  return (
    <li ref={setNodeRef} style={style} className={['task', done && 'done', isProject && 'project', isDragging && 'dragging'].filter(Boolean).join(' ')}>
      <div className="task-main">
        {sortable && <button className="grip" aria-label="Drag to reorder" {...attributes} {...listeners}>⋮⋮</button>}
        <button className={'check' + (isProject ? ' square' : '')} aria-pressed={done} aria-label={(done ? 'Mark not done: ' : 'Mark done: ') + task.title} onClick={toggle}><CheckIcon /></button>
        {isProject && !editing
          ? <button className="task-title as-button" onClick={onToggleOpen} aria-expanded={open}>{task.title}</button>
          : <Title value={task.title} editing={editing} setEditing={setEditing} onSave={(title) => patch('task renamed', { title })} />}
        {late > 0 && <span className="jab">{lateJab(late, task.created || 0)}</span>}
        <span className="row-end">
          {isProject && <span className="count">{subs.filter((x) => x.done).length}/{subs.length}</span>}
          <DueButton due={task.due} today={today} done={done} inputRef={dateRef} />
          <input ref={dateRef} className="hidden-date" type="date" value={task.due || ''} onChange={(e) => patch('due date changed', { due: e.target.value || null })} tabIndex={-1} aria-hidden="true" />
          <RowMenu items={menu} />
        </span>
      </div>
      {isProject && !done && <div className="progress" style={{ '--p': pct + '%' }} role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" />}
      <AnimatePresence initial={false}>{isProject && open && <ProjectBody s={s} task={task} />}</AnimatePresence>
    </li>
  );
}

// A reminder's turn in the list. Not a stored task: it exists because its rule says today is the day.
function ReminderRow({ reminder, date, today }) {
  const [closing, setClosing] = useState(false);
  const info = dueInfo(date, today);
  const finish = (skipped) => {
    setClosing(true);
    const key = doneKey(reminder.id, date);
    setTimeout(() => smooth(() => commit(skipped ? 'reminder skipped' : 'reminder done', [{ t: 'completions', id: key, set: { id: key, ref: reminder.id, date, kind: 'reminder', skipped } }])), 400);
  };
  return (
    <li className={'task reminder' + (closing ? ' done' : '')} style={{ viewTransitionName: `r-${reminder.id}` }}>
      <div className="task-main">
        <button className="check" aria-label={'Mark done: ' + reminder.title} onClick={() => finish(false)} disabled={date > today}><CheckIcon /></button>
        <span className="task-title">{reminder.title}</span>
        <span className="row-end">
          <span className="tag" title={ruleText(reminder.rule)}>↻ {ruleText(reminder.rule)}</span>
          <span className={'due ' + info.cls}>{info.text}</span>
          <RowMenu items={[{ label: 'Skip this one', run: () => finish(true) }]} />
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

// ---------- the column ----------
// One plain list: reminders due, then open tasks in your order, then finished ones tucked away.
export default function Tasks({ today, day, setDay }) {
  const s = useStore();
  const [openIds, setOpenIds] = useState(() => new Set());
  const [showDone, setShowDone] = useState(false);

  const top = useMemo(() => all(s, 'tasks').filter((t) => !t.parent).sort((a, b) => a.position - b.position), [s.tasks]);
  const matches = (t) => !day || t.due === day;
  const open = top.filter((t) => !t.done && matches(t));
  const done = top.filter((t) => t.done && matches(t)).sort((a, b) => (b.done_at || 0) - (a.done_at || 0));

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = open.findIndex((t) => t.id === active.id);
    const to = open.findIndex((t) => t.id === over.id);
    const moved = arrayMove(open, from, to);
    commit('reordered', [{ t: 'tasks', id: active.id, patch: { position: between(moved[to - 1]?.position, moved[to + 1]?.position) } }]);
  };

  const toggleOpen = (id) => setOpenIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <ul className="task-list">
          {reminders.map(({ r, date }) => <ReminderRow key={r.id + date} reminder={r} date={date} today={today} />)}
          <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {open.map((t) => <TaskRow key={t.id} s={s} task={t} today={today} sortable open={openIds.has(t.id)} onToggleOpen={() => toggleOpen(t.id)} />)}
          </SortableContext>
          {nothing && <li className="empty-row"><p className="empty">{day ? empties.day : empties.tasks}</p></li>}
          {done.length > 0 && (
            <li className="done-head"><button className="mono" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} finished · {done.length}</button></li>
          )}
          {showDone && done.map((t) => <TaskRow key={t.id} s={s} task={t} today={today} sortable={false} open={openIds.has(t.id)} onToggleOpen={() => toggleOpen(t.id)} />)}
        </ul>
      </DndContext>
    </section>
  );
}
