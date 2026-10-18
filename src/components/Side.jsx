import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { all, commit, uid, useStore } from '../store.js';
import { empties, shortDate, ymd } from '../lib.js';
import { toast } from './Fire.jsx';

// ---------- notes ----------
function Editor({ note }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saved, setSaved] = useState('');
  const timer = useRef();

  // Write 500ms after typing stops, so a paragraph is one undo step, not forty.
  const change = (next) => {
    setSaved('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      commit('note edited', [{ t: 'notes', id: note.id, patch: { ...next, edited_at: Date.now() } }]);
      setSaved('Saved');
    }, 500);
  };

  return (
    <motion.div className="note-editor" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <input id="note-title" type="text" placeholder="Untitled" aria-label="Note title" value={title}
        onChange={(e) => { setTitle(e.target.value); change({ title: e.target.value, body }); }} />
      <textarea id="note-body" placeholder="Start writing…" aria-label="Note text" value={body}
        onChange={(e) => { setBody(e.target.value); change({ title, body: e.target.value }); }} />
      <footer className="note-foot">
        <span className="mono">{saved}</span>
        <button className="btn-ghost danger" type="button"
          onClick={() => { clearTimeout(timer.current); commit('note deleted', [{ t: 'notes', id: note.id, set: null }]); toast('Note deleted. The world will cope.', { undoable: true }); }}>Delete</button>
      </footer>
    </motion.div>
  );
}

export function Notes() {
  const s = useStore();
  const notes = all(s, 'notes').sort((a, b) => (b.edited_at || 0) - (a.edited_at || 0));
  const [activeId, setActiveId] = useState(null);
  const active = notes.find((n) => n.id === activeId) ?? notes[0];

  const add = () => {
    const id = uid();
    commit('note added', [{ t: 'notes', id, patch: { title: '', body: '', edited_at: Date.now() } }]);
    setActiveId(id);
  };

  return (
    <div className="pane pane-notes">
      <header className="col-head">
        <h2>Notes</h2>
        <button className="btn-ghost" type="button" onClick={add}>+ New</button>
      </header>
      <div className="notes">
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <button className={'note-item' + (n.id === active?.id ? ' active' : '')} onClick={() => setActiveId(n.id)}>
                <span className="t">{n.title || 'Untitled'}</span>
                <span className="d">{n.edited_at ? shortDate(ymd(new Date(n.edited_at))) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
        {active ? <Editor key={active.id} note={active} /> : <p className="empty">{empties.notes}</p>}
      </div>
    </div>
  );
}
