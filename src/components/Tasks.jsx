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
import { flushSync } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { all, commit, getState, uid, useStore } from '../store.js';
import { addDays, between, todayStr, diffDays, doneKey, dueInfo, empties, headline, isDone, lateJab, occursOn, parseTyped, pendingOccurrence, progressOf, quip, ruleText, shortDate, subtasksOf, ymd } from '../lib.js';
import { sass, toast } from './Fire.jsx';
import { DailyStrip } from './Calendar.jsx';


// ======================================================================
// SMOOTH RE-SORTING
// ======================================================================
// Runs `change` (a function that saves something) and, if the browser supports it,
// animates the rows sliding to their new places. Otherwise it just runs `change`.
function smooth(change) {
  const prefersLessMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = document.startViewTransition && !prefersLessMotion && !document.hidden;
  if (!canAnimate) return change();

  // The browser calls `once` when it is ready to animate. If the window is hidden or covered,
  // that can take a long time, so a 250ms timer makes sure the change still happens.
  // The `ran` flag makes sure it only happens once.
  let ran = false;
  function once() {
    if (ran) return;
    ran = true;
    flushSync(change);
  }

  const transition = document.startViewTransition(once);
  setTimeout(once, 250);

  // Ignore errors from the animation (e.g. if it was skipped).
  for (const promise of [transition.ready, transition.finished, transition.updateCallbackDone]) {
    promise.catch(() => {});
  }
}

// The tick mark drawn inside the round check button.
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#0c0b0a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
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
      <button className="more" tabIndex={-1} aria-label="More" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        ⋯
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
                  {item.label}
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
function DueButton({ due, today, done, inputRef }) {
  const info = dueInfo(due, today);
  if (!due) return null;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={'due ' + (done ? '' : info.cls)}
      onClick={() => inputRef.current.showPicker?.()}
    >
      {info.text}
    </button>
  );
}


// ======================================================================
// FINISHING, REOPENING AND DELETING TASKS
// ======================================================================

// Mark a task as done. The little delay (420ms) lets the tick animation play first.
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

  setTimeout(() => smooth(() => commit('task finished', changes)), 420);

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
  sass('reopened', [], { chance: 0.5 });
}

// Delete a task and all its steps. The toast has an Undo button.
function removeTask(task) {
  const steps = subtasksOf(getState(), task.id);
  const changes = [task, ...steps].map((t) => ({ t: 'tasks', id: t.id, set: null })); // set: null = delete
  smooth(() => commit('task deleted', changes));
  toast(quip('taskDeleted'), { undoable: true });
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
    }, 380);
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
          ×
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
          created: Date.now(),
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
  function TaskRow({ s, task, today, open, onToggleOpen, onMove, sortable }) {
    // Drag-and-drop helpers from the dnd-kit library.
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: task.id,
      disabled: !sortable,
    });

    const [closing, setClosing] = useState(false);   // true during the short "being ticked" animation
    const [editing, setEditing] = useState(false);   // true while renaming
    const [menuOpen, setMenuOpen] = useState(false); // is the ⋯ menu open?
    const liRef = useRef(null);   // points at this row's HTML element
    const dateRef = useRef(null); // points at the hidden date input

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
        date: () => dateRef.current.showPicker?.(),
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
      { label: 'Rename', run: () => edit(true) },
      { label: task.due ? 'Change date' : 'Set a date', run: () => dateRef.current.showPicker?.() },
      task.due && { label: 'Remove date', run: () => patch('date removed', { due: null }) },
      { label: isProject ? 'Turn into a task' : 'Turn into a project', run: turnIntoOtherKind },
      '-',
      { label: 'Delete', danger: true, run: () => removeTask(task) },
    ];

    // Inline styles: movement while dragging, and a name so the browser can animate this row.
    const style = {
      transform: CSS.Translate.toString(transform),
      transition,
      viewTransitionName: isDragging ? 'none' : `t-${task.id}`,
    };

    const className = ['task', done && 'done', isProject && 'project', isDragging && 'dragging'].filter(Boolean).join(' ');

    return (
      <li
        ref={(node) => {
          setNodeRef(node); // tell the drag library about this element
          liRef.current = node;
        }}
        style={style}
        data-task={task.id}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={className}
      >
        <div className="task-main">
          {/* The drag handle ⋮⋮ */}
          {sortable && (
            <button className="grip" aria-label="Drag to reorder" {...attributes} {...listeners} tabIndex={-1}>
              ⋮⋮
            </button>
          )}

          {/* The round (or square, for projects) check button */}
          <button
            tabIndex={-1}
            className={'check' + (isProject ? ' square' : '')}
            aria-pressed={done}
            aria-label={(done ? 'Mark not done: ' : 'Mark done: ') + task.title}
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
            <DueButton due={task.due} today={today} done={done} inputRef={dateRef} />
            <input
              ref={dateRef}
              className="hidden-date"
              type="date"
              value={task.due || ''}
              onChange={(event) => patch('due date changed', { due: event.target.value || null })}
              tabIndex={-1}
              aria-hidden="true"
            />
            <RowMenu items={menu} open={menuOpen} onOpenChange={setMenuOpen} />
          </span>
        </div>

        {/* Quick buttons that appear while Shift is held (see App.jsx) */}
        <span className="quick">
          <button tabIndex={-1} onClick={() => edit(true)}>
            Rename
          </button>
          <button tabIndex={-1} className="danger" onClick={remove}>
            Delete
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
  const info = dueInfo(date, today);

  // Tick it (skipped = false) or skip it (skipped = true). Either way it's saved as a "completion".
  function finish(skipped) {
    setClosing(true);
    sass(skipped ? 'reminderSkipped' : 'reminderDone', [], { chance: 0.5 });

    const key = doneKey(reminder.id, date);
    const label = skipped ? 'reminder skipped' : 'reminder done';
    const completion = { id: key, ref: reminder.id, date, kind: 'reminder', skipped };

    setTimeout(() => smooth(() => commit(label, [{ t: 'completions', id: key, set: completion }])), 400);
  }

  // A future reminder can't be ticked yet (only today or earlier).
  function tickIfDue() {
    if (date <= today) finish(false);
  }

  function onKeyDown(event) {
    rowKeys(event, {
      toggle: tickIfDue,
      enter: tickIfDue,
      skip: () => finish(true),
      menu: () => setMenuOpen(true),
    });
  }

  return (
    <li
      className={'task reminder' + (closing ? ' done' : '')}
      style={{ viewTransitionName: `r-${reminder.id}` }}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="task-main">
        <button
          tabIndex={-1}
          className="check"
          aria-label={'Mark done: ' + reminder.title}
          onClick={() => finish(false)}
          disabled={date > today}
        >
          <CheckIcon />
        </button>
        <span className="task-title">{reminder.title}</span>
        <span className="row-end">
          <span className="tag" title={ruleText(reminder.rule)}>
            ↻ {ruleText(reminder.rule)}
          </span>
          <span className={'due ' + info.cls}>{info.text}</span>
          <RowMenu items={[{ label: 'Skip this one', run: () => finish(true) }]} open={menuOpen} onOpenChange={setMenuOpen} />
        </span>
      </div>
    </li>
  );
}


// ======================================================================
// THE "ADD A TASK" FORM
// ======================================================================
// A text box, a Task/Project switch, a date and an Add button.
// If you type a date at the end ("buy milk friday", "call mum oct 12"), the date box fills in by itself.
// Props: day (the day picked on the calendar, or null), today.
function AddRow({ day, today }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('task');   // 'task' or 'project'
  const [picked, setPicked] = useState(null); // a date chosen by hand (beats a typed one)

  // Look for a date at the end of what is typed. (useMemo = only redo this when the text changes.)
  const parsed = useMemo(() => parseTyped(text), [text]);

  // Which due date to use: picked by hand, else typed, else the selected calendar day, else today.
  const due = picked ?? parsed?.due ?? day ?? today;

  function submit(event) {
    event.preventDefault();

    // Use the text without the date part, unless the date was picked by hand.
    const title = (parsed && !picked ? parsed.title : text).trim();
    if (!title) return;

    // New tasks go to the TOP of the list: give them a position smaller than all the others.
    const positions = all(getState(), 'tasks')
      .filter((t) => !t.parent)
      .map((t) => t.position);
    const top = Math.min(0, ...positions);

    const label = kind === 'project' ? 'project added' : 'task added';
    smooth(() =>
      commit(label, [
        { t: 'tasks', id: uid(), patch: { title, due, done: false, kind, position: top - 1, created: Date.now() } },
      ])
    );

    setText('');
    setPicked(null);
    sass(kind === 'project' ? 'projectAdded' : 'taskAdded', [], { chance: 0.4 });
  }

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
        className="kind-switch"
        onClick={() => setKind(kind === 'task' ? 'project' : 'task')}
        title="Switch between task and project"
      >
        {kind === 'task' ? 'Task' : 'Project'}
      </button>
      <input
        id="task-due"
        type="date"
        value={due}
        onChange={(event) => setPicked(event.target.value || null)}
        aria-label="Due date"
      />
      <button type="submit" className="btn-add">
        Add
      </button>
    </form>
  );
}


// ======================================================================
// DRAG AND DROP
// ======================================================================
// One drag-and-drop area covers the calendar and the list, so a task can be
// reordered in the list OR dropped on a calendar day (which changes its due date).

// Is this task overdue? (Not counted while you're looking at one specific day.)
function isLate(task, day, today) {
  return !day && !!task.due && task.due < today;
}

// The unfinished tasks in the order they appear in the list:
// overdue ones first, then the rest, each group in the user's own order.
// When a day is selected, only that day's tasks are included.
function openTasks(s, day, today) {
  const tasks = all(s, 'tasks').filter((t) => !t.parent && !t.done && (!day || t.due === day));

  tasks.sort((a, b) => {
    const lateDifference = Number(isLate(b, day, today)) - Number(isLate(a, day, today));
    if (lateDifference !== 0) return lateDifference;
    return a.position - b.position;
  });
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

// Wraps the calendar and the list (App.jsx puts them inside this).
export function TaskDnd({ day, children }) {
  const [active, setActive] = useState(null); // the id of the task being dragged, or null

  // Three ways to start a drag: mouse (after moving 4px), touch (after holding 180ms), or keyboard.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Runs when you let go of a dragged task.
  function onDragEnd({ active, over }) {
    setActive(null);
    if (!over || active.id === over.id) return; // dropped nowhere, or on itself

    // Dropped on a calendar day: change the due date to that day.
    const date = over.data.current?.date;
    if (date) {
      commit('task moved', [{ t: 'tasks', id: active.id, patch: { due: date } }]);
      toast(quip('movedToDay', shortDate(date)), { undoable: true });
      return;
    }

    // Dropped on another row: reorder the list.
    const open = openTasks(getState(), day, todayStr());
    const from = open.findIndex((t) => t.id === active.id);
    const to = open.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    reorder(open, from, to);
  }

  // The task being dragged (shown as a floating chip under the mouse).
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
      <DragOverlay dropAnimation={null}>{dragged && <div className="drag-chip">{dragged.title}</div>}</DragOverlay>
    </DndContext>
  );
}


// ======================================================================
// THE WHOLE TASKS COLUMN
// ======================================================================
// One plain list: reminders that are due, then open tasks in your order,
// then finished tasks tucked away behind "Show finished".
// Props: today, day (the day picked on the calendar or null), setDay.
export default function Tasks({ today, day, setDay }) {
  const s = useStore();
  const [openIds, setOpenIds] = useState(() => new Set()); // which projects are unfolded
  const [showDone, setShowDone] = useState(false);          // are finished tasks shown?

  // ---- Work out what to show ----

  // Every top-level task (steps excluded), in the user's order.
  const top = useMemo(
    () => all(s, 'tasks').filter((t) => !t.parent).sort((a, b) => a.position - b.position),
    [s.tasks]
  );

  // Does a task belong to the selected day? (Everything does when no day is selected.)
  function matches(task) {
    return !day || task.due === day;
  }

  // Unfinished tasks.
  const open = useMemo(() => openTasks(s, day, today), [s.tasks, day, today]);

  // Finished tasks (newest first): the ones due on that day, or finished on that day.
  const done = top
    .filter((t) => {
      if (!t.done) return false;
      if (matches(t)) return true;
      return !!t.done_at && ymd(new Date(t.done_at)) === day;
    })
    .sort((a, b) => (b.done_at || 0) - (a.done_at || 0));

  // Reminders to show: { reminder, date } pairs.
  // With a day selected: reminders that happen on that day. Otherwise: each reminder's pending date.
  const reminders = all(s, 'reminders')
    .map((reminder) => {
      let date;
      if (day) date = occursOn(reminder.rule, day) && !isDone(s, reminder.id, day) ? day : null;
      else date = pendingOccurrence(s, reminder, today);
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
    }, 380);
  }, []);

  // ---- Move a row with Alt+arrows ----
  // The function must stay the same between re-draws, so it reads the current day/today from a ref.
  const view = useRef({});
  view.current = { day, today };

  const moveRow = useCallback((id, direction) => {
    const list = openTasks(getState(), view.current.day, view.current.today);
    const from = list.findIndex((t) => t.id === id);
    const to = from + direction;
    if (from >= 0 && to >= 0 && to < list.length) reorder(list, from, to);
  }, []);

  // ---- Split the list into groups: "Overdue" and "Coming up" ----
  const lateCount = open.filter((t) => isLate(t, day, today)).length;
  const lateReminders = reminders.filter((item) => !day && item.date < today);
  const dueReminders = reminders.filter((item) => !lateReminders.includes(item));
  const lateTotal = lateCount + lateReminders.length;

  function reminderRow({ r, date }) {
    return <ReminderRow key={r.id + date} reminder={r} date={date} today={today} />;
  }

  const finishedShown = showDone || !!day; // when a day is selected, finished tasks always show
  const nothing = open.length === 0 && reminders.length === 0;

  return (
    <section className="col col-tasks" aria-label="Tasks">
      <header className="col-head">
        <h1>Tasks</h1>
        <button
          className={'day-toggle' + (day === today ? ' on' : '')}
          aria-pressed={day === today}
          onClick={() => setDay(day === today ? null : today)}
        >
          Today only
        </button>
        {day && day !== today && (
          <button className="day-clear" onClick={() => setDay(null)}>
            {shortDate(day)} only ×
          </button>
        )}
      </header>

      {/* The rude headline */}
      <p className="voice">{line}</p>

      <DailyStrip today={today} />

      <AddRow day={day} today={today} />

      <ul className="task-list">
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
                sortable
                open={openIds.has(t.id)}
                onToggleOpen={toggleOpen}
                onMove={moveRow}
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

        {/* Nothing at all to show */}
        {nothing && (
          <li className="empty-row">
            <p className="empty">{day ? empties.day : empties.tasks}</p>
          </li>
        )}

        {/* 4. Finished tasks, tucked away behind a button */}
        {done.length > 0 && (
          <li className="done-head">
            {day ? (
              <span className="mono">Finished · {done.length}</span>
            ) : (
              <button className="mono" onClick={() => setShowDone(!showDone)}>
                {showDone ? 'Hide' : 'Show'} finished · {done.length}
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
            />
          ))}
      </ul>
    </section>
  );
}
