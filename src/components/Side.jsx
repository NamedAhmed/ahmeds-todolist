// Side.jsx = the Notes column on the right.
//   <Notes>      the whole column: a list of notes you can drag into any order, plus the editor for the selected one.
//   <NoteItem>   one note in the list.
//   <Editor>     the title and the block editor (BlockEditor.jsx) for one note.
//
// A note is saved as { title, blocks, body, position, edited_at }:
//   blocks    the content (headings, lists, to-dos...), see BlockEditor.jsx
//   body      the same content as plain text, kept so older copies of the app can still show it
//   position  where the note is in the list (you drag notes to change it)

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { all, commit, getState, uid, useStore } from '../store.js';
import { useAppearance } from '../appearance.js';
import { noteMd, noteSavePatch } from '../notes.js';
import { flushNoteSaves, pendingText, queueNoteSave } from '../noteSave.js';
import { empties, quip, shortDate, ymd } from '../lib.js';
import { sass, toast } from './Fire.jsx';
import { newBlock } from './BlockEditor.jsx';
import { BlocksEditor, MarkdownEditor, RichEditor } from './NoteEditors.jsx';
import { Modal } from './Modals.jsx';
import DragLayer from './DragLayer.jsx';
import Icon from './Icons.jsx';


// ======================================================================
// EDITOR: the title + the text of ONE note
// ======================================================================
// The text is edited by whichever editor Settings > General > Notes editor says (NoteEditors.jsx). Saving goes through
// noteSave.js, which keeps what is waiting outside this component so leaving the note, switching editor or closing the
// page can never lose it.
function Editor({ note }) {
  const { noteEditor } = useAppearance();

  // What is currently in the editor (an unsaved change from a moment ago wins over what is stored).
  const waiting = pendingText(note.id);
  const [title, setTitle] = useState(waiting?.title ?? note.title);
  const [md] = useState(() => waiting?.md ?? noteMd(note)); // only read when the editor opens; the editor owns the text after that
  const [saved, setSaved] = useState('');
  const [history, setHistory] = useState(false);
  const [revision, setRevision] = useState(0); // bumped to open the editor again on restored text
  const blockArea = useRef(null);
  const savedLabel = useRef();

  // Leaving the note (or switching editor) writes what is waiting.
  useEffect(() => () => flushNoteSaves(), []);

  function onMd(text) {
    setSaved('Saving…');
    queueNoteSave(note.id, { md: text });
    clearTimeout(savedLabel.current);
    savedLabel.current = setTimeout(() => setSaved('Saved'), 600);
  }

  function onTitleChange(event) {
    setTitle(event.target.value);
    setSaved('Saving…');
    queueNoteSave(note.id, { title: event.target.value });
  }

  // Enter in the title jumps into the text.
  function onTitleKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    blockArea.current?.querySelector('.block-text, .rich, textarea')?.focus();
  }

  // A note is never deleted from here: it goes to the Trash, where it can be restored.
  function trashNote() {
    flushNoteSaves();
    commit('note trashed', [{ t: 'notes', id: note.id, patch: { trashed: Date.now() } }]);
    toast(quip('noteDeleted'), { undoable: true });
  }

  // Bring back an earlier copy. The text as it is now is kept in the history first.
  function restoreVersion(version) {
    flushNoteSaves();
    const latest = getState().notes[note.id];
    const now = Date.now();
    const patch = noteSavePatch(latest, version.md, now);
    patch.versions = [{ at: now, md: noteMd(latest) }, ...(latest.versions || []).filter((v) => v !== version)].slice(0, 10);
    commit('note restored', [{ t: 'notes', id: note.id, patch }]);
    setHistory(false);
    setRevision((n) => n + 1);
  }

  const Body = { rich: RichEditor, blocks: BlocksEditor, markdown: MarkdownEditor }[noteEditor] ?? RichEditor;

  return (
    <motion.div className="note-editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>
      <input
        id="note-title"
        type="text"
        placeholder="Untitled"
        aria-label="Note title"
        value={title}
        onChange={onTitleChange}
        onKeyDown={onTitleKeyDown}
      />
      <div className="note-scroll" ref={blockArea}>
        <Body key={noteEditor + revision} md={revision ? noteMd(getState().notes[note.id]) : md} onMd={onMd} />
      </div>
      <footer className="note-foot">
        <span className="mono">{saved}</span>
        {(note.versions?.length ?? 0) > 0 && (
          <button className="btn-ghost" type="button" onClick={() => setHistory(true)} title="Earlier versions of this note">
            History
          </button>
        )}
        <button className="btn-ghost danger" type="button" onClick={trashNote} aria-label="Move note to the Trash" title="Move note to the Trash">
          <Icon name="trash" size={16} />
        </button>
      </footer>

      <AnimatePresence>
        {history && (
          <Modal title="History" onClose={() => setHistory(false)}>
            <p className="hint">Earlier copies of this note, saved as you wrote. Restoring one keeps the current text in the history, so nothing is lost.</p>
            <ul className="plain-list">
              {(note.versions || []).map((version) => (
                <li key={version.at}>
                  <span className="mono">{new Date(version.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span className="grow">{version.md.replace(/\s+/g, ' ').slice(0, 80) || '(empty)'}</span>
                  <button className="btn-ghost" type="button" onClick={() => restoreVersion(version)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


// ======================================================================
// ONE NOTE IN THE LIST (drag it to move it)
// ======================================================================
function NoteItem({ note, active, picked, onPick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: note.id });

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? 'dragging' : undefined}>
      <button
        type="button"
        className={'note-item' + (active ? ' active' : '') + (picked ? ' selected' : '')}
        onClick={onPick}
        {...attributes}
        {...listeners}
      >
        <span className="t">{note.title || 'Untitled'}</span>
        <span className="d">{note.edited_at ? shortDate(ymd(new Date(note.edited_at))) : ''}</span>
      </button>
    </li>
  );
}

// The notes in the order you put them in. Notes you haven't moved yet are ordered newest first, after the moved ones.
function orderNotes(notes) {
  return [...notes].sort((a, b) => {
    const first = a.position ?? Infinity;
    const second = b.position ?? Infinity;
    if (first !== second) return first < second ? -1 : 1;
    return (b.edited_at || 0) - (a.edited_at || 0);
  });
}


// ======================================================================
// NOTES: the whole column
// ======================================================================
// Props: onSearch (opens the search window, Ctrl+K).
export function Notes({ onSearch }) {
  const state = useStore(); // all the app's data
  const every = all(state, 'notes');
  const notes = orderNotes(every.filter((note) => !note.trashed));
  const trashed = every.filter((note) => note.trashed).sort((a, b) => b.trashed - a.trashed);
  const [showTrash, setShowTrash] = useState(false);

  // Which note is selected. If none is chosen yet, we show the first one.
  const [activeId, setActiveId] = useState(null);
  const active = notes.find((note) => note.id === activeId) ?? notes[0];
  const [dragId, setDragId] = useState(null); // the note being dragged, or null

  // Selecting several notes: Ctrl/Cmd+click, then click more. Delete removes them all.
  const [picked, setPicked] = useState(() => new Set());
  const clearPicked = () => setPicked(new Set());
  function pick(event, id) {
    if (!(picked.size || event.ctrlKey || event.metaKey)) return setActiveId(id);
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function trashPicked() {
    flushNoteSaves();
    commit('notes trashed', [...picked].map((id) => ({ t: 'notes', id, patch: { trashed: Date.now() } })));
    toast(`${picked.size} notes in the Trash.`, { undoable: true });
    clearPicked();
  }

  // The Trash: a note comes back whole, or is deleted for good (only here, and only after asking).
  const restoreNote = (id) => commit('note restored', [{ t: 'notes', id, patch: { trashed: null } }]);
  function deleteForever(note) {
    if (!window.confirm(`Delete "${note.title || 'Untitled'}" for good? This can't be undone.`)) return;
    commit('note deleted', [{ t: 'notes', id: note.id, set: null }]); // set: null = delete
  }

  // A note picked in the search (see App.jsx).
  useEffect(() => {
    function open(event) {
      setActiveId(event.detail);
    }
    window.addEventListener('todolist:open-note', open);
    return () => window.removeEventListener('todolist:open-note', open);
  }, []);
  const dragged = notes.find((note) => note.id === dragId);

  // Drag to reorder: press and move a little (4px) and the note lifts; a plain click still selects it.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Dropped in a new place: give every note its new position number (0, 1, 2...) and save the ones that changed.
  function onDragEnd({ active: moving, over }) {
    setDragId(null);
    if (!over || moving.id === over.id) return;
    const from = notes.findIndex((note) => note.id === moving.id);
    const to = notes.findIndex((note) => note.id === over.id);
    const moved = arrayMove(notes, from, to);

    const changes = [];
    moved.forEach((note, index) => {
      if (note.position !== index) changes.push({ t: 'notes', id: note.id, patch: { position: index } });
    });
    commit('notes reordered', changes);
    sass('reordered', [], { chance: 0.2 });
  }

  // The "+ New" button: make an empty note at the top of the list and select it.
  function addNote() {
    const id = uid();
    const top = Math.min(0, ...notes.map((note) => note.position ?? 0)) - 1;
    commit('note added', [
      { t: 'notes', id, patch: { title: '', md: '', md_at: Date.now(), body: '', blocks: [newBlock()], position: top, edited_at: Date.now() } },
    ]);
    setActiveId(id);
    sass('noteAdded', [], { chance: 0.5 }); // a rude comment, half the time
  }

  return (
    <div className="pane pane-notes">
      <header className="col-head">
        <h2>Notes</h2>
        <span className="head-actions">
          <button className="btn-ghost" type="button" onClick={onSearch} aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">
            <Icon name="search" size={16} />
          </button>
          <button className="btn-ghost" type="button" onClick={addNote} aria-label="New note" title="New note">
            <Icon name="plus" size={16} />
          </button>
        </span>
      </header>

      <div className="notes">
        {/* The list of notes on the left of the column */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active: moving }) => setDragId(moving.id)}
          onDragCancel={() => setDragId(null)}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={notes.map((note) => note.id)} strategy={verticalListSortingStrategy}>
            <ul className="note-list">
              {notes.map((note) => (
                <NoteItem key={note.id} note={note} active={note.id === active?.id} picked={picked.has(note.id)} onPick={(event) => pick(event, note.id)} />
              ))}
            </ul>
          </SortableContext>
          {trashed.length > 0 && (
            <button type="button" className={'note-trash-toggle mono' + (showTrash ? ' on' : '')} onClick={() => setShowTrash(!showTrash)} aria-expanded={showTrash}>
              <Icon name="trash" size={13} /> Trash ({trashed.length})
            </button>
          )}
          {showTrash && trashed.length > 0 && (
            <ul className="note-trash">
              {trashed.map((note) => (
                <li key={note.id}>
                  <span className="t">{note.title || 'Untitled'}</span>
                  <button type="button" className="btn-ghost" onClick={() => restoreNote(note.id)}>
                    Restore
                  </button>
                  <button type="button" className="btn-ghost danger" onClick={() => deleteForever(note)} aria-label="Delete for good" title="Delete for good">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked.size > 0 && (
            <div className="bulk-bar" role="toolbar" aria-label="Selected notes">
              <span className="mono">{picked.size} selected</span>
              <button className="btn-ghost danger" type="button" onClick={trashPicked}>
                Trash
              </button>
            </div>
          )}
          <DragLayer>
            {dragged && (
              <div className="drag-card note-card">
                <Icon name="note" size={16} />
                <span className="drag-title">{dragged.title || 'Untitled'}</span>
              </div>
            )}
          </DragLayer>
        </DndContext>

        {/* The editor for the selected note, or a message if there are no notes. */}
        {active ? <Editor key={active.id} note={active} /> : <p className="empty">{empties.notes}</p>}
      </div>
    </div>
  );
}
