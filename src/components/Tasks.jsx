// Tasks.jsx = the middle column: the "add a task" box and the list of tasks.
//
// Pieces in this file, top to bottom:
//   smooth                animate the list when it re-sorts
//   Title                 a task name you can double-click to rename
//   RowMenu               the "⋯" menu on each row
//   rowKeys / stepFocus   keyboard controls shared by every row
//   DueButton             the due date label on a row
//   finishTask / reopenTask / removeTask   what happens on done / undone / delete
//   Subtask, ProjectBody  the steps inside a "project"
//   TaskRow               one task in the list
//   ReminderRow           one reminder in the list
//   AddRow                the "Add a task…" form
//   TaskDnd               drag-and-drop (drag to reorder, or drop on a calendar day)
//   Tasks                 the whole column (this is what App.jsx uses)
//
// Vocabulary:
//   task     a normal to-do
//   project  a task that has steps inside it
//   reminder a repeating task (set up in the Reminders window)
//   commit() is how everything gets saved (see store.js)

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DndContext, PointerSensor, TouchSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { all, commit, getState, saveSetting, uid, useStore } from '../store.js';
import { addDays, between, todayStr, diffDays, doneKey, dueInfo, empties, formatTime, headline, isDone, lateJab, parseTyped, pendingOccurrence, progressOf, quip, reminderBlockedUntil, reminderOccursOn, ruleText, shortDate, subtasksOf, ymd } from '../lib.js';
import { sass, toast } from './Fire.jsx';
import DragLayer from './DragLayer.jsx';
import Icon from './Icons.jsx';
import DatePicker from './DatePicker.jsx';
import { useAppearance } from '../appearance.js';
import { storage } from '../storage.js';


// ======================================================================
// SMOOTH RE-SORTING
// ======================================================================
// Runs `change` (a function that saves something). Rows used to slide to their new places using the browser's
// page-wide "view transition", but that takes a snapshot of the whole page first, which made every change feel
// slow, so now the change simply happens.
function smooth(change) {
  change();
}

// The tick mark drawn inside the round check button.
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--bg)' }} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}


// ======================================================================
// SMALL PIECES
// ======================================================================

// A task's name. Double-click to turn it into a text box.
// Props: value (the name), editing (true = show the text box), setEditing, onSave(newName).
function Title({ value, editing, setEditing, onSave }) {
  if (!editing) {
    return (
      <span className="task-title" onDoubleClick={() => setEditing(true)}>
        {value}
      </span>
    );
  }

  // When the box loses focus: save the new name if it's not empty and actually changed.
  function finish(event) {
    const newName = event.target.value.trim();
    if (newName && newName !== value) onSave(newName);
    setEditing(false);
  }

  // Enter saves (by leaving the box). Escape puts the old name back first, so nothing is saved.
  function onKeyDown(event) {
    if (event.key === 'Enter') event.target.blur();
    if (event.key === 'Escape') {
      event.target.value = value;
      event.target.blur();
    }
  }

  return <input className="title-edit" autoFocus defaultValue={value} onBlur={finish} onKeyDown={onKeyDown} />;
}


// The "⋯" button each row shows on hover. Everything you can do to a task lives in this menu.
// The row controls whether it is open (so a key like "m" can open it).
// Arrow keys move through the menu and Escape closes it and hands focus back to the row.
// Props: items (list of { label, run, danger?, on? } or '-' for a divider), open, onOpenChange.
function RowMenu({ items, open, onOpenChange }) {
  const ref = useRef(null);

  // While the menu is open: focus its first item, and close it on an outside click or Escape.
  useEffect(() => {
    if (!open) return;

    ref.current.querySelector('[role=menuitem]')?.focus();

    function close(event) {
      let shouldClose;
      if (event.type === 'pointerdown') shouldClose = !ref.current.contains(event.target); // clicked outside
      else shouldClose = event.key === 'Escape';

      if (!shouldClose) return;
      onOpenChange(false);
      if (event.type === 'keydown') ref.current.closest('li')?.focus(); // give focus back to the row
    }

    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open, onOpenChange]);

  // Up/Down arrows move between menu items (wrapping around at the ends).
  function onArrowKey(event) {
    let step = 0;
    if (event.key === 'ArrowDown') step = 1;
    if (event.key === 'ArrowUp') step = -1;
    if (!step) return;

    event.preventDefault();
    const buttons = [...ref.current.querySelectorAll('[role=menuitem]')];
    const current = buttons.indexOf(document.activeElement);
    const next = (current + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  return (
    <span className={'menu-wrap' + (open ? ' open' : '')} ref={ref}>
      <button className="more" tabIndex={-1} aria-label="More" title="More" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        <Icon name="dots" size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="menu"
            role="menu"
            onKeyDown={onArrowKey}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12 }}
          >
            {/* items can contain `false`/null (for options that don't apply), so filter those out */}
            {items.filter(Boolean).map((item, i) => {
              if (item === '-') return <hr key={'hr' + i} />; // a divider line

              function chooseItem() {
                onOpenChange(false);
                item.run();
              }

              return (
                <button
                  key={item.label}
                  role="menuitem"
                  className={(item.danger ? 'danger ' : '') + (item.on ? 'on' : '')}
                  onClick={chooseItem}
                >
                  {item.icon && <Icon name={item.icon} size={16} />}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}


// ======================================================================
// KEYBOARD CONTROLS FOR ROWS
// ======================================================================
// Each row is something you can Tab to. Arrow keys move between rows without touching
// the buttons inside them.

// All the rows in the list that this row (li) belongs to.
function rowsOf(li) {
  return [...li.parentElement.children].filter((child) => child.matches('li.task[tabindex]'));
}

// Move focus from a row to another: `to` is 1 (next), -1 (previous), 'first' or 'last'.
function stepFocus(li, to) {
  const rows = rowsOf(li);
  let next;
  if (to === 'first') next = rows[0];
  else if (to === 'last') next = rows[rows.length - 1];
  else next = rows[rows.indexOf(li) + to];
  next?.focus();
}

// Every row answers the same movement keys. `act` is an object of the row's own actions,
// e.g. { toggle: fn, rename: fn, remove: fn ... }. A row leaves out the ones it doesn't support.
function rowKeys(event, act) {
  // Only react when the row itself has focus (not a button or box inside it), and not with Ctrl/Cmd.
  if (event.target !== event.currentTarget) return;
  if (event.ctrlKey || event.metaKey) return;

  const li = event.currentTarget;

  // Movement keys: arrows and j/k go up and down, Home/End jump to the first/last row.
  const movement = {
    ArrowDown: 1,
    j: 1,
    ArrowUp: -1,
    k: -1,
    Home: 'first',
    End: 'last',
  }[event.key];

  if (movement !== undefined && !event.altKey) {
    event.preventDefault();
    stepFocus(li, movement);
    return;
  }

  // Action keys. With Alt held, the arrows reorder the task instead.
  let action;
  if (event.altKey) {
    action = { ArrowUp: act.up, ArrowDown: act.down }[event.key];
  } else {
    action = {
      ' ': act.toggle,
      x: act.toggle,
      Enter: act.enter,
      e: act.rename,
      d: act.date,
      m: act.menu,
      ContextMenu: act.menu,
      '[': act.earlier,
      ']': act.later,
      Delete: act.remove,
      Backspace: act.remove,
      s: act.skip,
    }[event.key];
  }

  if (!action) return; // this row doesn't do anything for that key
  event.preventDefault();
  action();
}

// The due date label on a row. Clicking it opens the date picker.
// A task with no date is "ongoing": it shows an infinity sign and never goes overdue.
// Clicking either opens the date picker window (onClick).
function DueButton({ due, time, today, done, onClick }) {
  // A finished task is not late, "yesterday" or "tomorrow" any more: it just keeps the date it was due.
  const info = done ? { text: shortDate(due) + (time ? ` · ${formatTime(time)}` : ''), cls: '' } : dueInfo(due, today, time);

  if (!due) {
    return (
      <button type="button" tabIndex={-1} className="due" title="No date: tap to set one" aria-label="No date: set one" onClick={onClick}>
        <Icon name="infinity" size={15} />
      </button>
    );
  }

  return (
    <button
      type="button"
      tabIndex={-1}
      className={'due ' + (done ? '' : info.cls)}
      onClick={onClick}
    >
      {info.text}
    </button>
  );
}


// ======================================================================
// FINISHING, REOPENING AND DELETING TASKS
// ======================================================================

// How many tasks have ever been finished, kept in the synced `settings` table as { tasksCompleted }.
// A finished task can be deleted later, so this is a running total rather than a count of what's in the list.
const STATS_ID = 'stats';
const TASK_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

function bumpTasksCompleted(by) {
  const total = Math.max(0, (getState().settings[STATS_ID]?.tasksCompleted || 0) + by);
  saveSetting(STATS_ID, { tasksCompleted: total });
  return total;
}

// Mark a task as done. The tiny delay (140ms) lets the tick animation start first.
function finishTask(task) {
  const changes = [{ t: 'tasks', id: task.id, patch: { done: true, done_at: Date.now() } }];

  // Finishing a project also finishes all its steps that were still open.
  if (task.kind === 'project') {
    for (const step of subtasksOf(getState(), task.id)) {
      if (!step.done) {
        changes.push({ t: 'tasks', id: step.id, patch: { done: true, done_at: Date.now() } });
      }
    }
  }

  setTimeout(() => smooth(() => commit('task finished', changes)), 140);

  // Milestones beat the usual comment.
  const total = bumpTasksCompleted(1);
  // A milestone is only celebrated the first time it is reached: un-ticking and ticking again must not cheer twice.
  const best = getState().settings[STATS_ID]?.tasksCompletedBest || 0;
  if (total > best) saveSetting(STATS_ID, { tasksCompletedBest: total });
  if (total > best && TASK_MILESTONES.includes(total)) {
    toast(quip('taskMilestone', total));
    return;
  }

  // A rude comment. Better ones for projects and for tasks that were very late.
  if (task.kind === 'project') {
    toast(quip('projectDone'));
  } else {
    let daysLate = 0;
    if (task.due && task.due < todayStr()) daysLate = diffDays(todayStr(), task.due);

    if (daysLate >= 2) sass('taskDoneLate', [daysLate], { chance: 0.7 });
    else sass('taskDone', [], { chance: 0.35 });
  }
}

// Un-finish a task.
function reopenTask(task) {
  smooth(() => commit('task reopened', [{ t: 'tasks', id: task.id, patch: { done: false, done_at: null } }]));
  bumpTasksCompleted(-1); // it will be counted again when it is finished again
  sass('reopened', [], { chance: 0.5 });
}

// Delete a task and all its steps. The toast has an Undo button.
function removeTask(task) {
  const steps = subtasksOf(getState(), task.id);
  const changes = [task, ...steps].map((t) => ({ t: 'tasks', id: t.id, set: null })); // set: null = delete
  smooth(() => commit('task deleted', changes));
  toast(quip('taskDeleted'), { undoable: true });
}

// The same for several tasks at once (the selection bar): one change, so one Undo brings them all back.
function finishTasks(tasks) {
  const now = Date.now();
  const changes = [];
  for (const task of tasks.filter((t) => !t.done)) {
    changes.push({ t: 'tasks', id: task.id, patch: { done: true, done_at: now } });
    if (task.kind === 'project') {
      for (const step of subtasksOf(getState(), task.id)) {
        if (!step.done) changes.push({ t: 'tasks', id: step.id, patch: { done: true, done_at: now } });
      }
    }
  }
  if (!changes.length) return;
  smooth(() => commit('tasks finished', changes));
  bumpTasksCompleted(tasks.filter((t) => !t.done).length);
  toast(`${tasks.length} tasks finished. Look at you go.`, { undoable: true });
}

function removeTasks(tasks) {
  const changes = tasks.flatMap((task) => [task, ...subtasksOf(getState(), task.id)]).map((t) => ({ t: 'tasks', id: t.id, set: null }));
  smooth(() => commit('tasks deleted', changes));
  toast(`${tasks.length} tasks gone.`, { undoable: true });
}


// ======================================================================
// THE INSIDES OF A PROJECT (its steps)
// ======================================================================

// One step inside a project.
function Subtask({ sub }) {
  const [closing, setClosing] = useState(false); // true during the short "being ticked" animation
  const [editing, setEditing] = useState(false); // true while renaming

  // Save a change to this step.
  function patch(label, changes) {
    commit(label, [{ t: 'tasks', id: sub.id, patch: changes }]);
  }

  const done = sub.done || closing;

  function toggle() {
    if (sub.done) {
      patch('step reopened', { done: false });
      return;
    }
    setClosing(true);
    setTimeout(() => {
      patch('step finished', { done: true, done_at: Date.now() });
      setClosing(false);
      sass('stepDone', [], { chance: 0.25 });
    }, 140);
  }

  return (
    <motion.li
      className={'task sub' + (done ? ' done' : '')}
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
    >
      <div className="task-main">
        <button className="check" aria-pressed={done} aria-label={sub.title} onClick={toggle}>
          <CheckIcon />
        </button>
        <Title
          value={sub.title}
          editing={editing}
          setEditing={setEditing}
          onSave={(title) => patch('step renamed', { title })}
        />
        <button
          className="del"
          aria-label={`Delete ${sub.title}`}
          onClick={() => commit('step deleted', [{ t: 'tasks', id: sub.id, set: null }])}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </motion.li>
  );
}

// The area that unfolds under an open project: its steps, an "Add a step" box, and a notes box.
function ProjectBody({ s, task }) {
  const steps = subtasksOf(s, task.id);
  const [text, setText] = useState('');

  function addStep(event) {
    event.preventDefault();
    if (!text.trim()) return;

    // Put the new step after the last one.
    const lastStep = steps[steps.length - 1];
    const position = (lastStep?.position ?? 0) + 1;

    commit('step added', [
      {
        t: 'tasks',
        id: uid(),
        patch: {
          title: text.trim(),
          parent: task.id, // this is what makes it a step of the project
          done: false,
          kind: 'task',
          position,
          created: minuteTimestamp(),
        },
      },
    ]);
    setText('');
    sass('stepAdded', [], { chance: 0.2 });
  }

  // Save the notes when you click out of the box (only if the text actually changed).
  function saveNote(event) {
    if (event.target.value !== (task.note || '')) {
      commit('project note edited', [{ t: 'tasks', id: task.id, patch: { note: event.target.value } }]);
    }
  }

  return (
    <motion.div
      className="project-body"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <div className="project-inner">
        <ul className="sub-list">
          <AnimatePresence initial={false}>
            {steps.map((sub) => (
              <Subtask key={sub.id} sub={sub} />
            ))}
          </AnimatePresence>
        </ul>

        <form onSubmit={addStep}>
          <input
            className="sub-add"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Add a step…"
            aria-label="New step"
          />
        </form>

        <textarea className="project-note" defaultValue={task.note || ''} placeholder="Notes" onBlur={saveNote} />
      </div>
    </motion.div>
  );
}


// ======================================================================
// ONE TASK ROW
// ======================================================================
// At rest a row is a check button, a name and a date. Hovering adds the drag grip and the "⋯" menu.
// `memo` = only re-draw when something relevant changed (check at the very end of this block).
//
// Props:
//   s              all the app's data
//   task           this task
//   today          today's date text
//   open           is this project unfolded?
//   onToggleOpen   function to unfold / fold a project
//   onMove         function to move the row up/down (Alt+arrows)
//   sortable       can this row be dragged? (finished tasks can't)
const TaskRow = memo(
  function TaskRow({ s, task, today, open, onToggleOpen, onMove, sortable, selected }) {
    // Drag-and-drop helpers from the dnd-kit library.
    const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: task.id,
      disabled: !sortable,
    });

    const [closing, setClosing] = useState(false);   // true during the short "being ticked" animation
    const [editing, setEditing] = useState(false);   // true while renaming
    const [menuOpen, setMenuOpen] = useState(false); // is the ⋯ menu open?
    const liRef = useRef(null);   // points at this row's HTML element
    const [picking, setPicking] = useState(false);   // is the date picker window open?

    const isProject = task.kind === 'project';
    const done = task.done || closing;
    const steps = isProject ? subtasksOf(s, task.id) : [];
    const percent = isProject ? progressOf(s, task) : 0;

    // How many days overdue (0 if it isn't).
    let late = 0;
    if (!done && task.due && task.due < today) late = diffDays(today, task.due);

    // Save a change to this task.
    function patch(label, changes) {
      commit(label, [{ t: 'tasks', id: task.id, patch: changes }]);
    }

    // The check button / Space key.
    function toggle() {
      if (task.done) {
        reopenTask(task);
        return;
      }
      setClosing(true);
      finishTask(task);
    }

    // Once the task really is saved as done, stop showing the temporary "closing" look.
    useEffect(() => {
      if (task.done) setClosing(false);
    }, [task.done]);

    // Start or stop renaming. When renaming ends by keyboard, focus goes back to the row (not nowhere).
    function edit(on) {
      setEditing(on);
      if (!on) {
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) liRef.current?.focus();
        });
      }
    }

    // Move the due date by n days (the [ and ] keys).
    function shiftDue(n) {
      patch('due date changed', { due: addDays(task.due || today, n) });
      sass(n > 0 ? 'later' : 'earlier', [], { chance: 0.6 });
    }

    // Delete this task, then move focus to a neighbouring row so keyboard users don't lose their place.
    function remove() {
      const rows = rowsOf(liRef.current);
      const index = rows.indexOf(liRef.current);
      const neighbour = rows[index + 1] ?? rows[index - 1];

      removeTask(task);
      setTimeout(() => {
        if (neighbour?.isConnected) neighbour.focus();
      }, 80);
    }

    // The keyboard shortcuts for this row. (Which keys do what is listed in rowKeys above.)
    function onKeyDown(event) {
      rowKeys(event, {
        toggle,
        enter: isProject ? () => onToggleOpen(task.id) : () => edit(true),
        rename: () => edit(true),
        date: () => setPicking(true),
        menu: () => setMenuOpen(true),
        earlier: () => shiftDue(-1),
        later: () => shiftDue(1),
        remove,
        up: sortable && (() => onMove(task.id, -1)),
        down: sortable && (() => onMove(task.id, 1)),
      });
    }

    // The entries of the "⋯" menu. An entry that is `false`/null is skipped. '-' is a divider line.
    function turnIntoOtherKind() {
      patch(isProject ? 'made a task' : 'made a project', { kind: isProject ? 'task' : 'project' });
      if (!isProject && !open) onToggleOpen(task.id); // a new project opens so you can add steps
    }

    const menu = [
      { label: 'Rename', icon: 'pencil', run: () => edit(true) },
      { label: task.due ? 'Change date' : 'Set a date', icon: 'calendar', run: () => setPicking(true) },
      task.due && { label: 'No due date', icon: 'infinity', run: () => patch('made ongoing', { due: null, due_time: null }) },
      { label: isProject ? 'Turn into a task' : 'Turn into a project', icon: isProject ? 'task' : 'folder', run: turnIntoOtherKind },
      '-',
      { label: 'Delete', icon: 'trash', danger: true, run: () => removeTask(task) },
    ];

    // Inline style: the row moves aside while another one is dragged past it.
    const style = {
      transform: CSS.Translate.toString(transform),
      transition,
    };

    const className = ['task', done && 'done', isProject && 'project', isDragging && 'dragging', selected && 'selected'].filter(Boolean).join(' ');

    return (
      <li
        ref={(node) => {
          setNodeRef(node); // tell the drag library about this element
          liRef.current = node;
        }}
        style={style}
        data-task={task.id}
        data-sortable={sortable || undefined}
        {...listeners}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={className}
      >
        <div className="task-main">
          {/* The round (or square, for projects) check button */}
          <button
            tabIndex={-1}
            className={'check' + (isProject ? ' square' : '')}
            aria-pressed={done}
            aria-label={'Done: ' + task.title}
            onClick={toggle}
          >
            <CheckIcon />
          </button>

          {/* The name. For a project, clicking it unfolds it. */}
          {isProject && !editing ? (
            <button tabIndex={-1} className="task-title as-button" onClick={() => onToggleOpen(task.id)} aria-expanded={open}>
              {task.title}
            </button>
          ) : (
            <Title
              value={task.title}
              editing={editing}
              setEditing={edit}
              onSave={(title) => {
                patch('task renamed', { title });
                sass('renamed', [], { chance: 0.3 });
              }}
            />
          )}

          {/* The rude comment on overdue tasks */}
          {late > 0 && <span className="jab">{lateJab(late, task.created || 0)}</span>}

          <span className="row-end">
            {isProject && (
              <span className="count">
                {steps.filter((step) => step.done).length}/{steps.length}
              </span>
            )}
            <DueButton due={task.due} time={task.due_time} today={today} done={done} onClick={() => setPicking(true)} />
            <AnimatePresence>
              {picking && (
                <DatePicker
                  value={task.due || null}
                  today={today}
                  onPick={(date) => patch(date ? 'due date changed' : 'made ongoing', date ? { due: date } : { due: null, due_time: null })}
                  time={task.due_time || null}
                  onTime={(time) => patch('due time changed', { due_time: time })}
                  onClose={() => setPicking(false)}
                />
              )}
            </AnimatePresence>
            <RowMenu items={menu} open={menuOpen} onOpenChange={setMenuOpen} />
          </span>
        </div>

        {/* Quick buttons that appear while Shift is held (see App.jsx) */}
        <span className="quick">
          <button tabIndex={-1} aria-label="Rename" title="Rename" onClick={() => edit(true)}>
            <Icon name="pencil" size={16} />
          </button>
          <button tabIndex={-1} className="danger" aria-label="Delete" title="Delete" onClick={remove}>
            <Icon name="trash" size={16} />
          </button>
        </span>

        {/* The thin progress bar under an unfinished project */}
        {isProject && !done && (
          <div
            className="progress"
            style={{ '--p': percent + '%' }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin="0"
            aria-valuemax="100"
          />
        )}

        {/* The unfolded project steps */}
        <AnimatePresence initial={false}>{isProject && open && <ProjectBody s={s} task={task} />}</AnimatePresence>
      </li>
    );
  },

  // The "should we skip re-drawing?" check. A row only re-draws when its own task, the day,
  // or (for a project) its steps change, not on every edit elsewhere. This only affects speed.
  (before, after) =>
    before.task === after.task &&
    before.today === after.today &&
    before.open === after.open &&
    before.sortable === after.sortable &&
    before.selected === after.selected &&
    before.onMove === after.onMove &&
    (before.task.kind !== 'project' || before.s.tasks === after.s.tasks)
);


// ======================================================================
// ONE REMINDER ROW
// ======================================================================
// A reminder's turn in the list. It isn't a stored task: it is shown because its rule says
// "today is the day" (or it was missed earlier and is still waiting).
function ReminderRow({ reminder, date, today }) {
  const [closing, setClosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const info = dueInfo(date, today, reminder.time);

  // Tick it (skipped = false) or skip it (skipped = true). Either way it's saved as a "completion".
  function finish(skipped) {
    setClosing(true);
    sass(skipped ? 'reminderSkipped' : 'reminderDone', [], { chance: 0.5 });

    const key = doneKey(reminder.id, date);
    const label = skipped ? 'reminder skipped' : 'reminder done';
    const completion = { id: key, ref: reminder.id, date, kind: 'reminder', skipped, completed_at: Date.now() };

    setTimeout(() => smooth(() => commit(label, [{ t: 'completions', id: key, set: completion }])), 140);
  }

  // A reminder occurrence can be completed ahead of its scheduled date.
  function tick() {
    finish(false);
  }

  function onKeyDown(event) {
    rowKeys(event, {
      toggle: tick,
      enter: tick,
      skip: () => finish(true),
      menu: () => setMenuOpen(true),
    });
  }

  return (
    <li
      className={'task reminder' + (closing ? ' done' : '')}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="task-main">
        <button
          tabIndex={-1}
          className="check"
          aria-label={'Mark done: ' + reminder.title}
          onClick={tick}
        >
          <CheckIcon />
        </button>
        <span className="task-title">{reminder.title}</span>
        <span className="row-end">
          <span className="tag" title={ruleText(reminder.rule)}>
            <Icon name={reminder.rule.type === 'once' ? 'calendar' : 'repeat'} size={12} /> {ruleText(reminder.rule)}
          </span>
          <span className={'due ' + info.cls}>{info.text}</span>
          <RowMenu items={[{ label: 'Skip this one', icon: 'x', run: () => finish(true) }]} open={menuOpen} onOpenChange={setMenuOpen} />
        </span>
      </div>
    </li>
  );
}


// ======================================================================
// THE "ADD A TASK" FORM
// ======================================================================
// A text box, a Project switch, a date button (opens the date picker window) and an Add button.
// If you type a date at the end ("buy milk friday", "call mum oct 12"), the date box fills in by itself.
// Props: day (the day picked on the calendar, or null), today.
function AddRow({ day, today }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('task');   // 'task' or 'project'
  const [picked, setPicked] = useState(null); // a date chosen by hand (beats a typed one)
  const [ongoing, setOngoing] = useState(false); // no due date: it just stays in the list
  const [picking, setPicking] = useState(false); // is the date picker window open?
  const [pickedTime, setPickedTime] = useState(undefined); // a time of day chosen by hand (null = none); undefined = not chosen

  // Look for a date at the end of what is typed. (useMemo = only redo this when the text changes.)
  const parsed = useMemo(() => parseTyped(text), [text]);

  // Which due date to use: picked by hand, else typed, else the selected calendar day, else today.
  const { newTaskDate } = useAppearance(); // Settings > Style > More > New task
  const startDate = newTaskDate === 'tomorrow' ? addDays(today, 1) : newTaskDate === 'none' ? null : today;
  const due = ongoing ? null : (picked ?? parsed?.due ?? day ?? startDate);
  // The time of day: chosen by hand, else typed ("friday 5pm"). Only with a date.
  const dueTime = ongoing ? null : (pickedTime !== undefined ? pickedTime : (picked ? null : parsed?.time ?? null));

  function submit(event) {
    event.preventDefault();

    // Use the text without the date part, unless the date was picked by hand.
    const title = (parsed && !picked && !ongoing ? parsed.title : text).trim();
    if (!title) return;

    smooth(() => createTask({ title, due, dueTime, kind }));

    setText('');
    setPicked(null);
    setPickedTime(undefined);
    setOngoing(false);
    sass(kind === 'project' ? 'projectAdded' : 'taskAdded', [], { chance: 0.4 });
  }

  // The label on the date button: what the new task will get.
  let dueLabel = shortDate(due ?? today);
  if (ongoing || due === null) dueLabel = 'No date';
  else if (due === today) dueLabel = 'Today';
  else if (due === addDays(today, 1)) dueLabel = 'Tomorrow';
  if (dueTime && !ongoing) dueLabel += ' · ' + formatTime(dueTime);

  return (
    <form className="task-form" onSubmit={submit} autoComplete="off">
      <input
        id="task-title"
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={kind === 'project' ? 'Add a project…' : 'Add a task…'}
        aria-label={kind === 'project' ? 'Project name' : 'Task name'}
      />
      <button
        type="button"
        className={'kind-switch' + (kind === 'project' ? ' on' : '')}
        onClick={() => setKind(kind === 'task' ? 'project' : 'task')}
        aria-pressed={kind === 'project'}
        title="Project: a task that holds smaller steps"
        aria-label="Make it a project"
      >
        <Icon name="folder" size={16} />
      </button>
      <button type="button" className="date-pill" onClick={() => setPicking(true)} aria-label={'Due date: ' + dueLabel}>
        <Icon name={ongoing || due === null ? 'infinity' : 'calendar'} size={15} />
        {dueLabel}
      </button>
      <button type="submit" className="btn-add" aria-label="Add" title="Add">
        <Icon name="plus" size={18} />
      </button>

      <AnimatePresence>
        {picking && (
          <DatePicker
            value={ongoing ? null : due}
            today={today}
            time={dueTime}
            onTime={setPickedTime}
            onPick={(date) => {
              setOngoing(date === null);
              setPicked(date);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>
    </form>
  );
}


// ======================================================================
// DRAG AND DROP
// ======================================================================
// One drag-and-drop area covers the calendar and the list, so a task can be
// reordered in the list OR dropped on a calendar day (which changes its due date).

function oneMonthFrom(today) {
  const date = new Date(today + 'T00:00');
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return ymd(date);
}

function matchesTaskFilter(task, filter, day, today) {
  if (filter === 'today') return task.due === today;
  if (filter === 'week') return !!task.due && task.due >= today && task.due <= addDays(today, 7);
  if (filter === 'month') return !!task.due && task.due >= today && task.due <= oneMonthFrom(today);
  if (filter === 'undated') return !task.due;
  if (filter === 'date') return !task.due || task.due === day;
  return true;
}

// Use the existing `created` task field as the single source for Date Added sorting.
function createdTimestamp(task) {
  if (typeof task.created === 'number' && Number.isFinite(task.created)) return task.created;
  const parsed = Date.parse(task.created ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareTitles(a, b) {
  return String(a.title).localeCompare(String(b.title), undefined, { sensitivity: 'base' });
}

function compareTasks(a, b, sort) {
  if (sort === 'custom') return (a.position ?? 0) - (b.position ?? 0);

  if (sort === 'due') {
    if (a.due !== b.due) {
      if (!a.due) return 1;
      if (!b.due) return -1;
      const dueOrder = a.due.localeCompare(b.due);
      if (dueOrder) return dueOrder;
    }
  } else if (sort === 'added') {
    const addedOrder = createdTimestamp(b) - createdTimestamp(a);
    if (addedOrder) return addedOrder;
  }

  return compareTitles(a, b) || (a.position ?? 0) - (b.position ?? 0);
}

function minuteTimestamp() {
  return Math.round(Date.now() / 60000) * 60000;
}

// Save a new task (or project). New tasks go to the TOP of the list: they get a position smaller than all the others.
// The Add box uses this, and so does the first-launch tour (Onboarding.jsx).
export function createTask({ title, due, dueTime = null, kind = 'task' }) {
  const positions = all(getState(), 'tasks')
    .filter((t) => !t.parent)
    .map((t) => t.position);
  const top = Math.min(0, ...positions);

  commit(kind === 'project' ? 'project added' : 'task added', [
    { t: 'tasks', id: uid(), patch: { title, due, due_time: dueTime, done: false, kind, position: top - 1, created: minuteTimestamp() } },
  ]);
}

// Is this task overdue? (Not counted while you're looking at one specific day.)
function isLate(task, day, today) {
  return !day && !!task.due && task.due < today;
}

// The unfinished tasks in the order they appear in the list.
function openTasks(s, day, today, filter = 'all', sort = 'due') {
  const tasks = all(s, 'tasks').filter(
    (t) => !t.parent && !t.done && matchesTaskFilter(t, filter, day, today)
  );

  if (sort === 'custom') {
    tasks.sort((a, b) => {
      const lateDifference = Number(isLate(b, day, today)) - Number(isLate(a, day, today));
      return lateDifference || compareTasks(a, b, sort);
    });
  } else {
    tasks.sort((a, b) => compareTasks(a, b, sort));
  }
  return tasks;
}

// Decides which thing you are dragging over. Over a calendar day the mouse pointer decides;
// inside the list, the nearest row does.
function collide(args) {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
}

// Move one task from index `from` to index `to`. Only the moved task's position changes.
function reorder(list, from, to) {
  const moved = arrayMove(list, from, to);
  const above = moved[to - 1]?.position;
  const below = moved[to + 1]?.position;

  commit('reordered', [{ t: 'tasks', id: list[from].id, patch: { position: between(above, below) } }]);
  sass('reordered', [], { chance: 0.2 });
}

// You can grab a row ANYWHERE to drag it, except on things you type in or click (a text box, the menu, the insides
// of a project): there, pressing and moving selects text or does what that thing does instead.
const NO_DRAG = 'input, textarea, select, .menu, .project-body, [contenteditable]';
const grabbable = (event) => !event.target.closest(NO_DRAG);

// The mouse: a drag starts after the pointer has moved 4px, so a plain click still clicks.
class RowPointerSensor extends PointerSensor {
  static activators = [
    { eventName: 'onPointerDown', handler: ({ nativeEvent: event }) => event.isPrimary && event.button === 0 && grabbable(event) },
  ];
}

// A finger: a drag starts after holding for a moment (a quick swipe still scrolls the list).
class RowTouchSensor extends TouchSensor {
  static activators = [{ eventName: 'onTouchStart', handler: ({ nativeEvent: event }) => event.touches.length === 1 && grabbable(event) }];
}

// The card that floats under the pointer while a task is dragged.
function TaskCard({ task }) {
  const info = dueInfo(task.due, todayStr(), task.due_time);
  return (
    <div className="drag-card">
      <span className="drag-mark">
        <Icon name={task.kind === 'project' ? 'folder' : 'task'} size={18} />
      </span>
      <span className="drag-title">{task.title}</span>
      {task.due && <span className="drag-due mono">{info.text}</span>}
    </div>
  );
}

// Wraps the calendar and the list (App.jsx puts them inside this).
export function TaskDnd({ day, filter = 'all', sort = 'due', children }) {
  const [active, setActive] = useState(null); // the id of the task being dragged, or null

  const customSensors = useSensors(
    useSensor(RowPointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(RowTouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );
  const sensors = sort === 'custom' ? customSensors : [];

  // Runs when you let go of a dragged task.
  function onDragEnd({ active, over }) {
    setActive(null);
    if (sort !== 'custom' || !over || active.id === over.id) return;

    // Dropped on a calendar day: change the due date to that day.
    const date = over.data.current?.date;
    if (date) {
      commit('task moved', [{ t: 'tasks', id: active.id, patch: { due: date } }]);
      toast(quip('movedToDay', shortDate(date)), { undoable: true });
      return;
    }

    // Dropped on another row: reorder the list.
    const open = openTasks(getState(), day, todayStr(), filter, sort);
    const from = open.findIndex((t) => t.id === active.id);
    const to = open.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    reorder(open, from, to);
  }

  // The task being dragged.
  const dragged = active && all(getState(), 'tasks').find((t) => t.id === active);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      onDragStart={({ active }) => setActive(active.id)}
      onDragCancel={() => setActive(null)}
      onDragEnd={onDragEnd}
    >
      {children}
      <DragLayer>{dragged && <TaskCard task={dragged} />}</DragLayer>
    </DndContext>
  );
}


// ======================================================================
// THE WHOLE TASKS COLUMN
// ======================================================================
// One plain list: reminders that are due, then open tasks in your order,
// then finished tasks tucked away behind "Show finished".
// Props: today, day (the selected calendar day or null), filter, setFilter.
const FILTER_ORDER = ['today', 'week', 'month', 'undated', 'all'];
const FILTER_LABELS = {
  today: 'Today Only',
  week: 'Next 7 Days',
  month: 'Next Month',
  undated: 'No Due Date',
  all: 'All Tasks',
};
// The sections of "Group tasks by date" (Settings > General), in order.
const GROUPS = ['Overdue', 'Today', 'Next 7 days', 'Next month', 'Later', 'No due date'];
function groupOf(due, today, day) {
  if (!due) return 5;
  if (!day && due < today) return 0;
  if (due <= today) return 1;
  if (due <= addDays(today, 7)) return 2;
  if (due <= oneMonthFrom(today)) return 3;
  return 4;
}

const SORT_ORDER = ['custom', 'due', 'added'];
const SORT_LABELS = {
  custom: 'Custom',
  due: 'Date Due',
  added: 'Date Added',
};

export default function Tasks({ today, day, filter, setFilter, sort, setSort, onReminders }) {
  const s = useStore();
  const [openIds, setOpenIds] = useState(() => new Set()); // which projects are unfolded
  const [showDone, setShowDone] = useState(false);          // are finished tasks shown?
  const { taskGroups, showRepeating } = useAppearance();

  // ---- Selecting several tasks ----
  // Ctrl/Cmd+click a row to select it; click more rows to add them. A bar then offers Done and Delete.
  const [selected, setSelected] = useState(() => new Set());
  // Sections folded shut in Groups mode (remembered on this device).
  const [folded, setFolded] = useState(() => {
    try {
      return new Set(JSON.parse(storage.get('todolist:folded-groups') || '[]'));
    } catch {
      return new Set();
    }
  });
  function toggleFold(group) {
    setFolded((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      try {
        storage.set('todolist:folded-groups', JSON.stringify([...next]));
      } catch {
        // storage unavailable: the fold just isn't remembered
      }
      return next;
    });
  }
  const clearSelection = () => setSelected(new Set());
  function onListClickCapture(event) {
    const row = event.target.closest('li.task[data-task]');
    if (!row || !(selected.size || event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation(); // the click only selects; it does not tick, rename or unfold anything
    const id = row.dataset.task;
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (event) => event.key === 'Escape' && clearSelection();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size]);

  // A task picked in the search (see App.jsx): show it (finished tasks too), scroll to it, focus it and flash it.
  useEffect(() => {
    function reveal(event) {
      if (getState().tasks[event.detail]?.done) setShowDone(true);
      setTimeout(() => {
        const row = document.querySelector(`[data-task="${event.detail}"]`);
        if (!row) return;
        row.scrollIntoView({ block: 'center' });
        row.focus({ preventScroll: true });
        row.classList.add('found');
        setTimeout(() => row.classList.remove('found'), 1500);
      }, 60);
    }
    window.addEventListener('todolist:reveal-task', reveal);
    return () => window.removeEventListener('todolist:reveal-task', reveal);
  }, []);

  // ---- Work out what to show ----

  // Every top-level task (steps excluded), in the user's order.
  const top = useMemo(
    () => all(s, 'tasks').filter((t) => !t.parent).sort((a, b) => a.position - b.position),
    [s.tasks]
  );

  // Unfinished tasks.
  const open = useMemo(() => openTasks(s, day, today, filter, sort), [s.tasks, day, today, filter, sort]);

  function completedWithinFilter(task) {
    if (!task.done_at || filter === 'all' || filter === 'undated') return false;
    const completed = ymd(new Date(task.done_at));
    if (filter === 'date') return completed === day;
    if (filter === 'today') return completed === today;
    if (filter === 'week') return completed >= today && completed <= addDays(today, 7);
    if (filter === 'month') return completed >= today && completed <= oneMonthFrom(today);
    return false;
  }

  // Finished tasks (newest first): those matching the filter, or completed in its date range.
  const done = top
    .filter((t) => t.done && (matchesTaskFilter(t, filter, day, today) || completedWithinFilter(t)))
    .sort((a, b) => compareTasks(a, b, sort));

  function reminderInRange(reminder, end) {
    const blockedUntil = reminderBlockedUntil(s, reminder);
    if (blockedUntil && today < blockedUntil) return null;

    let date = today;
    while (date <= end) {
      if (reminderOccursOn(reminder, date, today) && !isDone(s, reminder.id, date)) return date;
      date = addDays(date, 1);
    }
    return null;
  }

  // Reminders to show: { reminder, date } pairs.
  const reminders = (showRepeating ? all(s, 'reminders') : [])
    .map((reminder) => {
      let date = null;
      if (filter === 'date' && day) {
        date = reminderOccursOn(reminder, day, today) && !isDone(s, reminder.id, day) ? day : null;
      } else if (filter === 'today') {
        date = reminderOccursOn(reminder, today, today) && !isDone(s, reminder.id, today) ? today : null;
      } else if (filter === 'week') {
        date = reminderInRange(reminder, addDays(today, 7));
      } else if (filter === 'month') {
        date = reminderInRange(reminder, oneMonthFrom(today));
      } else if (filter === 'all') {
        date = pendingOccurrence(s, reminder, today);
      }
      return { r: reminder, date };
    })
    .filter((item) => item.date);

  // The numbers behind the rude headline.
  const stats = useMemo(() => {
    const unfinished = top.filter((t) => !t.done);
    return {
      total: top.length,
      open: unfinished.length,
      overdue: unfinished.filter((t) => t.due && t.due < today).length,
      doneToday: top.filter((t) => t.done && t.done_at && ymd(new Date(t.done_at)) === today).length,
    };
  }, [top, today]);

  // The seed makes the headline change when the numbers change, but not on every keystroke.
  const line = useMemo(
    () => headline({ ...stats, seed: stats.open * 7 + stats.overdue * 3 + stats.doneToday }),
    [stats]
  );

  // ---- Unfold / fold a project ----
  // useCallback = keep the same function between re-draws (an optimisation for the memoised rows).
  const toggleOpen = useCallback((id) => {
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Once the project has unfolded, scroll so all of it is visible.
    setTimeout(() => {
      document.querySelector(`[data-task="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 160);
  }, []);

  // ---- Move a row with Alt+arrows ----
  // The function must stay the same between re-draws, so it reads the current day/today from a ref.
  const view = useRef({});
  view.current = { day, today, filter, sort };

  const moveRow = useCallback((id, direction) => {
    const list = openTasks(getState(), view.current.day, view.current.today, view.current.filter, view.current.sort);
    const from = list.findIndex((t) => t.id === id);
    const to = from + direction;
    if (from >= 0 && to >= 0 && to < list.length) reorder(list, from, to);
  }, []);

  // ---- Split the list into groups: "Overdue" and "Coming up" ----
  const lateCount = sort === 'added' ? 0 : open.filter((t) => isLate(t, day, today)).length;
  const lateReminders = reminders.filter((item) => !day && item.date < today);
  const dueReminders = reminders.filter((item) => !lateReminders.includes(item));
  const lateTotal = lateCount + lateReminders.length;

  function reminderRow({ r, date }) {
    return <ReminderRow key={r.id + date} reminder={r} date={date} today={today} />;
  }

  // "Group tasks by date": one list in sections, reminders first inside each section.
  const grouped = taskGroups && filter === 'all';
  const groupRows = grouped
    ? [
        ...reminders.map((item) => ({ group: groupOf(item.date, today, day), reminder: item })),
        ...open.map((task) => ({ group: groupOf(task.due, today, day), task })),
      ]
        .map((row, order) => ({ ...row, order }))
        .sort((a, b) => a.group - b.group || a.order - b.order)
    : [];
  const groupCount = (group) => groupRows.filter((row) => row.group === group).length;

  const finishedShown = showDone || filter !== 'all'; // filtered views show matching finished tasks
  const nothing = open.length === 0 && reminders.length === 0 && done.length === 0;

  return (
    <section className="col col-tasks" aria-label="Tasks">
      <header className="col-head">
        <h1>Tasks</h1>
        <div className="task-controls">
          {onReminders && (
            <button className="day-toggle" onClick={onReminders} aria-label="Reminders" title="Reminders (repeating and one-off)">
              <Icon name="repeat" size={14} />
            </button>
          )}
          <button
            className={'day-toggle' + (sort !== 'due' ? ' on' : '')}
            aria-label={`Task sort: ${SORT_LABELS[sort]}. Click to change.`}
            title={`${SORT_LABELS[sort]} · Click to change sort`}
            onClick={() => {
              const next = SORT_ORDER.indexOf(sort) + 1;
              setSort(SORT_ORDER[next % SORT_ORDER.length]);
            }}
          >
            {SORT_LABELS[sort]}
          </button>
          {!(taskGroups && filter === 'all') && <span className="task-controls-separator" aria-hidden="true">•</span>}
          {!(taskGroups && filter === 'all') && <button
            className={'day-toggle' + (filter !== 'all' ? ' on' : '')}
            aria-pressed={filter !== 'all'}
            aria-label={`Task filter: ${filter === 'date' && day ? `${shortDate(day)} Only` : FILTER_LABELS[filter]}. Click to change.`}
            title={`${filter === 'date' && day ? `${shortDate(day)} Only` : FILTER_LABELS[filter]} · Click to change filter`}
            onClick={() => {
              if (filter === 'date') {
                setFilter('all');
                return;
              }
              const next = FILTER_ORDER.indexOf(filter) + 1;
              setFilter(FILTER_ORDER[next % FILTER_ORDER.length]);
            }}
          >
            {filter === 'date' && day ? `${shortDate(day)} Only` : FILTER_LABELS[filter]}
          </button>}
        </div>

      </header>

      {/* The rude headline */}
      <p className="voice">{line}</p>

      <AddRow day={day} today={today} />

      <ul className="task-list" onClickCapture={onListClickCapture}>
        {grouped ? (
          <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {groupRows.map((row, i) => (
              <Fragment key={row.task ? row.task.id : row.reminder.r.id + row.reminder.date}>
                {(i === 0 || groupRows[i - 1].group !== row.group) && (
                  <li className={'group-head' + (row.group === 0 ? ' late' : '')}>
                    <button type="button" className="group-fold" aria-expanded={!folded.has(row.group)} onClick={() => toggleFold(row.group)}>
                      <Icon name="chevronDown" size={12} style={{ transform: folded.has(row.group) ? 'rotate(-90deg)' : 'none' }} />
                      {GROUPS[row.group]} · {groupCount(row.group)}
                    </button>
                  </li>
                )}
                {folded.has(row.group) ? null : row.task ? (
                  <TaskRow s={s} task={row.task} today={today} sortable={sort === 'custom'} open={openIds.has(row.task.id)} onToggleOpen={toggleOpen} onMove={moveRow} selected={selected.has(row.task.id)} />
                ) : (
                  reminderRow(row.reminder)
                )}
              </Fragment>
            ))}
          </SortableContext>
        ) : (
        <>
        {/* 1. Overdue things first */}
        {lateTotal > 0 && <li className="group-head late">Overdue · {lateTotal}</li>}
        {lateReminders.map(reminderRow)}

        {/* 2. With nothing overdue, reminders come first */}
        {lateTotal === 0 && dueReminders.map(reminderRow)}

        {/* 3. The open tasks (drag to reorder). "Coming up" is inserted after the overdue ones. */}
        <SortableContext items={open.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {open.map((t, i) => (
            <Fragment key={t.id}>
              {lateTotal > 0 && i === lateCount && (
                <>
                  <li className="group-head">Coming up</li>
                  {dueReminders.map(reminderRow)}
                </>
              )}
              <TaskRow
                s={s}
                task={t}
                today={today}
                sortable={sort === 'custom'}
                open={openIds.has(t.id)}
                onToggleOpen={toggleOpen}
                onMove={moveRow}
                selected={selected.has(t.id)}
              />
            </Fragment>
          ))}

          {/* Everything open was overdue, so "Coming up" goes at the end */}
          {lateTotal > 0 && lateCount === open.length && (
            <>
              <li className="group-head">Coming up</li>
              {dueReminders.map(reminderRow)}
            </>
          )}
        </SortableContext>
        </>
        )}

        {/* Nothing to show in this view. (With no tasks at all the headline above already says so.) */}
        {nothing && stats.total > 0 && (
          <li className="empty-row">
            <p className="empty">{filter === 'date' ? empties.day : empties[filter]}</p>
          </li>
        )}

        {/* 4. Finished tasks, tucked away behind a button */}
        {done.length > 0 && (
          <li className="done-head">
            {filter !== 'all' ? (
              <span className="mono done-count">
                <Icon name="task" size={14} /> {done.length}
              </span>
            ) : (
              <button className="mono done-count" onClick={() => setShowDone(!showDone)} aria-label={showDone ? 'Hide finished' : 'Show finished'} title={showDone ? 'Hide finished' : 'Show finished'}>
                <Icon name={showDone ? 'eyeOff' : 'eye'} size={14} /> {done.length}
              </button>
            )}
          </li>
        )}
        {finishedShown &&
          done.map((t) => (
            <TaskRow
              key={t.id}
              s={s}
              task={t}
              today={today}
              sortable={false}
              open={openIds.has(t.id)}
              onToggleOpen={toggleOpen}
              onMove={moveRow}
              selected={selected.has(t.id)}
            />
          ))}
      </ul>

      {selected.size > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Selected tasks">
          <span className="mono">{selected.size} selected</span>
          <button
            className="btn-ghost"
            onClick={() => {
              finishTasks(top.filter((t) => selected.has(t.id)));
              clearSelection();
            }}
          >
            Done
          </button>
          <button
            className="btn-ghost danger"
            onClick={() => {
              removeTasks(top.filter((t) => selected.has(t.id)));
              clearSelection();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </section>
  );
}
