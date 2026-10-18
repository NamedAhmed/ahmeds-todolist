// Side.jsx = the Notes column on the right.
//   <Notes>  the whole column: a list of notes plus the editor for the selected one.
//   <Editor> the title and text boxes for one note.

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { all, commit, uid, useStore } from '../store.js';
import { empties, quip, shortDate, ymd } from '../lib.js';
import { sass, toast } from './Fire.jsx';


// ======================================================================
// EDITOR: the title + text boxes for ONE note
// ======================================================================
function Editor({ note }) {
  // What is currently typed in each box.
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saved, setSaved] = useState(''); // the small "Saving…" / "Saved" label

  // A timer we keep between re-draws (useRef holds a value that survives them).
  const timer = useRef();

  // Called on every keystroke. We don't save immediately. We wait 500ms after you
  // stop typing, so a whole paragraph is ONE undo step instead of forty.
  function scheduleSave(newValues) {
    setSaved('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      commit('note edited', [
        { t: 'notes', id: note.id, patch: { ...newValues, edited_at: Date.now() } },
      ]);
      setSaved('Saved');
    }, 500);
  }

  function onTitleChange(event) {
    const newTitle = event.target.value;
    setTitle(newTitle);
    scheduleSave({ title: newTitle, body });
  }

  function onBodyChange(event) {
    const newBody = event.target.value;
    setBody(newBody);
    scheduleSave({ title, body: newBody });
  }

  function deleteNote() {
    clearTimeout(timer.current); // cancel any save that was waiting
    commit('note deleted', [{ t: 'notes', id: note.id, set: null }]); // set: null = delete
    toast(quip('noteDeleted'), { undoable: true });
  }

  return (
    <motion.div
      className="note-editor"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <input
        id="note-title"
        type="text"
        placeholder="Untitled"
        aria-label="Note title"
        value={title}
        onChange={onTitleChange}
      />
      <textarea
        id="note-body"
        placeholder="Start writing…"
        aria-label="Note text"
        value={body}
        onChange={onBodyChange}
      />
      <footer className="note-foot">
        <span className="mono">{saved}</span>
        <button className="btn-ghost danger" type="button" onClick={deleteNote}>
          Delete
        </button>
      </footer>
    </motion.div>
  );
}


// ======================================================================
// NOTES: the whole column
// ======================================================================
export function Notes() {
  const state = useStore(); // all the app's data

  // All notes, newest edit first.
  const notes = all(state, 'notes');
  notes.sort((a, b) => (b.edited_at || 0) - (a.edited_at || 0));

  // Which note is selected. If none is chosen yet, we show the newest one.
  const [activeId, setActiveId] = useState(null);
  const active = notes.find((note) => note.id === activeId) ?? notes[0];

  // The "+ New" button: make an empty note and select it.
  function addNote() {
    const id = uid();
    commit('note added', [
      { t: 'notes', id, patch: { title: '', body: '', edited_at: Date.now() } },
    ]);
    setActiveId(id);
    sass('noteAdded', [], { chance: 0.5 }); // a rude comment, half the time
  }

  return (
    <div className="pane pane-notes">
      <header className="col-head">
        <h2>Notes</h2>
        <button className="btn-ghost" type="button" onClick={addNote}>
          + New
        </button>
      </header>

      <div className="notes">
        {/* The list of notes on the left of the column */}
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                className={'note-item' + (note.id === active?.id ? ' active' : '')}
                onClick={() => setActiveId(note.id)}
              >
                <span className="t">{note.title || 'Untitled'}</span>
                <span className="d">
                  {note.edited_at ? shortDate(ymd(new Date(note.edited_at))) : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* The editor for the selected note, or a message if there are no notes. */}
        {active ? <Editor key={active.id} note={active} /> : <p className="empty">{empties.notes}</p>}
      </div>
    </div>
  );
}
