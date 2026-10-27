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
import { motion } from 'motion/react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { all, commit, uid, useStore } from '../store.js';
import { empties, quip, shortDate, ymd } from '../lib.js';
import { sass, toast } from './Fire.jsx';
import BlockEditor, { blocksFromNote, blocksToText, cleanHtml, newBlock } from './BlockEditor.jsx';
import DragLayer from './DragLayer.jsx';
import Icon from './Icons.jsx';


// ======================================================================
// EDITOR: the title + the blocks of ONE note
// ======================================================================
function Editor({ note }) {
  // What is currently in the editor.
  const [title, setTitle] = useState(note.title);
  const [blocks, setBlocks] = useState(() => blocksFromNote(note));
  const [saved, setSaved] = useState(''); // the small "Saving…" / "Saved" label

  // A timer we keep between re-draws (useRef holds a value that survives them).
  const timer = useRef();
  const blockArea = useRef(null);

  // Called on every change. We don't save immediately. We wait 500ms after you
  // stop typing, so a whole paragraph is ONE undo step instead of forty.
  function scheduleSave(newTitle, newBlocks) {
    setSaved('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Only the formatting we support is saved (see cleanHtml).
      const cleaned = newBlocks.map((block) => ({ ...block, html: cleanHtml(block.html) }));
      commit('note edited', [
        { t: 'notes', id: note.id, patch: { title: newTitle, blocks: cleaned, body: blocksToText(cleaned), edited_at: Date.now() } },
      ]);
      setSaved('Saved');
    }, 500);
  }

  function onTitleChange(event) {
    setTitle(event.target.value);
    scheduleSave(event.target.value, blocks);
  }

  function onBlocksChange(newBlocks) {
    setBlocks(newBlocks);
    scheduleSave(title, newBlocks);
  }

  // Enter in the title jumps into the first block.
  function onTitleKeyDown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    blockArea.current?.querySelector('.block-text')?.focus();
  }

  function deleteNote() {
    clearTimeout(timer.current); // cancel any save that was waiting
    commit('note deleted', [{ t: 'notes', id: note.id, set: null }]); // set: null = delete
    toast(quip('noteDeleted'), { undoable: true });
  }

  return (
    <motion.div
      className="note-editor"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
    >
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
        <BlockEditor blocks={blocks} onChange={onBlocksChange} />
      </div>
      <footer className="note-foot">
        <span className="mono">{saved}</span>
        <button className="btn-ghost danger" type="button" onClick={deleteNote} aria-label="Delete note" title="Delete note">
          <Icon name="trash" size={16} />
        </button>
      </footer>
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
export function Notes() {
  const state = useStore(); // all the app's data
  const notes = orderNotes(all(state, 'notes'));

  // Which note is selected. If none is chosen yet, we show the first one.
  const [activeId, setActiveId] = useState(null);
  const active = notes.find((note) => note.id === activeId) ?? notes[0];
  const [dragId, setDragId] = useState(null); // the note being dragged, or null

  // Selecting several notes: Ctrl/Cmd+click, or press "Select" (for a phone) and tap notes. Then Delete removes them all.
  const [picked, setPicked] = useState(() => new Set());
  const [selecting, setSelecting] = useState(false);
  const clearPicked = () => {
    setPicked(new Set());
    setSelecting(false);
  };
  function pick(event, id) {
    if (!(selecting || picked.size || event.ctrlKey || event.metaKey)) return setActiveId(id);
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function deletePicked() {
    commit('notes deleted', [...picked].map((id) => ({ t: 'notes', id, set: null }))); // set: null = delete
    toast(`${picked.size} notes gone.`, { undoable: true });
    clearPicked();
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
      { t: 'notes', id, patch: { title: '', body: '', blocks: [newBlock()], position: top, edited_at: Date.now() } },
    ]);
    setActiveId(id);
    sass('noteAdded', [], { chance: 0.5 }); // a rude comment, half the time
  }

  return (
    <div className="pane pane-notes">
      <header className="col-head">
        <h2>Notes</h2>
        <button className={'btn-ghost' + (selecting || picked.size ? ' on' : '')} type="button" onClick={() => (selecting || picked.size ? clearPicked() : setSelecting(true))} title="Select several notes (Ctrl+click)">
          {selecting || picked.size ? 'Cancel' : 'Select'}
        </button>
        <button className="btn-ghost" type="button" onClick={addNote} aria-label="New note" title="New note">
          <Icon name="plus" size={16} />
        </button>
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
          {(selecting || picked.size > 0) && (
            <div className="bulk-bar" role="toolbar" aria-label="Selected notes">
              <span className="mono">{picked.size ? `${picked.size} selected` : 'Tap notes to select'}</span>
              <button className="btn-ghost danger" type="button" disabled={!picked.size} onClick={deletePicked}>
                Delete
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
