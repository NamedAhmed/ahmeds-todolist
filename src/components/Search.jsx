// Search.jsx = the Ctrl+K search window (like Spotlight or Raycast): type, arrow to a result, press Enter.
//
// It looks through your tasks, notes, dailies and reminders. Picking a result is App.jsx's job (it knows how to
// show each kind), so this file only finds things and hands the chosen one back through onPick.
//
// Props: onClose (close the window), onPick(result) where result is { kind, id, label, ... }.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { all, useStore } from '../store.js';
import Icon from './Icons.jsx';

// The kinds of result, in the order they are listed: [kind, heading, icon].
const KINDS = [
  ['task', 'Tasks', 'task'],
  ['note', 'Notes', 'note'],
  ['daily', 'Dailies', 'sun'],
  ['reminder', 'Reminders', 'repeat'],
];
const MAX_RESULTS = 24;

// Everything that can be found, as { kind, id, label, text, done }. `label` is the title shown; `text` is the extra
// text that can match too (a note's body).
function searchable(state) {
  const items = [];
  for (const task of all(state, 'tasks')) {
    if (task.parent) continue; // the steps of a project are found through the project
    items.push({ kind: 'task', id: task.id, label: task.title || '', text: '', done: !!task.done, project: task.kind === 'project' });
  }
  for (const note of all(state, 'notes')) {
    if (note.trashed) continue; // in the Trash
    items.push({ kind: 'note', id: note.id, label: note.title || 'Untitled', text: note.body || '' });
  }
  for (const daily of all(state, 'dailies')) {
    if (daily.archived) continue;
    items.push({ kind: 'daily', id: daily.id, label: daily.name || '', text: '' });
  }
  for (const reminder of all(state, 'reminders')) {
    items.push({ kind: 'reminder', id: reminder.id, label: reminder.title || '', text: '' });
  }
  return items;
}

// How well an item matches the typed words: every word must appear; a match in the title beats one in the body, and
// the start of the title beats the middle. Returns null for no match, otherwise a number (smaller is better).
function score(item, words) {
  const label = item.label.toLowerCase();
  const text = item.text.toLowerCase();
  let total = 0;
  for (const word of words) {
    const at = label.indexOf(word);
    if (at === 0) total += 0;
    else if (at > 0) total += 1;
    else if (text.includes(word)) total += 3;
    else return null;
  }
  return total + (item.done ? 5 : 0); // finished tasks come after open ones
}

// A short piece of a note's body around the first typed word, so you can see why it matched.
function snippet(text, words) {
  const flat = text.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(words[0]);
  if (at < 0) return '';
  const from = Math.max(0, at - 24);
  return (from > 0 ? '…' : '') + flat.slice(from, from + 80).trim();
}

export default function Search({ onClose, onPick }) {
  const state = useStore();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0); // which result is highlighted
  const list = useRef(null);
  const items = useMemo(() => searchable(state), [state.tasks, state.notes, state.dailies, state.reminders]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const found = [];
    for (const item of items) {
      const points = score(item, words);
      if (points !== null) found.push({ ...item, points, preview: item.text && !item.label.toLowerCase().includes(words[0]) ? snippet(item.text, words) : '' });
    }
    const order = (kind) => KINDS.findIndex(([name]) => name === kind);
    found.sort((a, b) => order(a.kind) - order(b.kind) || a.points - b.points);
    return found.slice(0, MAX_RESULTS);
  }, [items, query]);

  // Back to the top result whenever the typing changes.
  useEffect(() => setIndex(0), [query]);

  // Keep the highlighted result in view as the arrow keys move it.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, results]);

  // Remember what had focus, and give it back when the window closes without a choice.
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener?.isConnected && document.activeElement === document.body) opener.focus();
    };
  }, []);

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setIndex((index + step + results.length) % results.length);
    } else if (event.key === 'Enter' && results[index]) {
      event.preventDefault();
      onPick(results[index]);
    }
  }

  return (
    <motion.div
      className="scrim search-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
    >
      <motion.div
        className="modal search"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.99 }}
        transition={{ duration: 0.12 }}
      >
        <div className="search-box">
          <Icon name="search" size={20} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, notes, dailies, reminders"
            aria-label="Search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="search-list" id="search-results" role="listbox" ref={list}>
          {query.trim() && results.length === 0 && <p className="search-empty">Nothing matches "{query.trim()}".</p>}
          {results.map((result, i) => {
            const [, heading, icon] = KINDS.find(([kind]) => kind === result.kind);
            const first = i === 0 || results[i - 1].kind !== result.kind;
            return (
              <div key={result.kind + result.id}>
                {first && <h4 className="search-group mono">{heading}</h4>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className={'search-item' + (i === index ? ' picked' : '') + (result.done ? ' done' : '')}
                  tabIndex={-1}
                  onMouseMove={() => i !== index && setIndex(i)}
                  onClick={() => onPick(result)}
                >
                  <Icon name={result.project ? 'folder' : icon} size={16} />
                  <span className="search-label">{result.label || 'Untitled'}</span>
                  {result.preview && <span className="search-preview">{result.preview}</span>}
                  {result.done && <span className="search-tag mono">done</span>}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
