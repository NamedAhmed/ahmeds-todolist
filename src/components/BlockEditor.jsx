// BlockEditor.jsx = the text editor inside a note. A note is a list of BLOCKS, like Notion:
// each paragraph, heading, list item, to-do, quote or code snippet is its own block.
//
//   - Type "/" on an empty line to pick what a block should be (heading, list, to-do...).
//   - Or type a shortcut at the start of a line:  # , ## , ### , - , 1. , [] , > , ```  (each followed by a space).
//   - Bold, italic, underline and strikethrough: Ctrl+B, Ctrl+I, Ctrl+U (no toolbar: everything else is in the "/" menu).
//   - Enter starts a new line inside the block (an empty list item turns back into text). Shift+Enter makes a new
//     block (a list carries on).
//   - Backspace at the start of a block turns it into text, or joins it to the block above.
//   - Select across blocks by dragging, Shift+click or Shift+arrows: the blocks tint, Backspace/Delete/Ctrl+X remove
//     the selected text (the blocks it touches join up), and Tab / Shift+Tab indent the selected list items.
//   - Drag a block by its handle (⋮⋮, on the left) to move it. Arrow keys move between blocks.
//
// A block looks like { id, type, html, checked }. `type` is one of BLOCK_TYPES below. `html` is the text with
// its bold/italic/etc. as HTML. The parent (Side.jsx) owns the list and saves it; this file only edits it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragLayer from './DragLayer.jsx';
import Icon from './Icons.jsx';
import { uid } from '../store.js';


// ======================================================================
// THE KINDS OF BLOCK
// ======================================================================
// symbol = the little label in the "/" menu, keys = words that find it in the "/" menu.
export const BLOCK_TYPES = [
  { type: 'p', label: 'Text', symbol: 'T', keys: 'text paragraph plain' },
  { type: 'h1', label: 'Heading 1', symbol: 'H1', keys: 'heading title big h1' },
  { type: 'h2', label: 'Heading 2', symbol: 'H2', keys: 'heading subtitle h2' },
  { type: 'h3', label: 'Heading 3', symbol: 'H3', keys: 'heading small h3' },
  { type: 'bullet', label: 'Bulleted list', symbol: '•', keys: 'bullet list unordered ul' },
  { type: 'number', label: 'Numbered list', symbol: '1.', keys: 'number list ordered ol' },
  { type: 'todo', label: 'To-do', symbol: '☐', keys: 'todo task check checkbox' },
  { type: 'quote', label: 'Quote', symbol: '❝', keys: 'quote callout' },
  { type: 'code', label: 'Code', symbol: '</>', keys: 'code snippet monospace' },
];

// Typing one of these at the start of an empty text block (then a space) turns it into that kind of block.
const SHORTCUTS = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'bullet', '* ': 'bullet', '1. ': 'number', '[] ': 'todo', '> ': 'quote', '``` ': 'code' };

// Pressing Enter in one of these makes another block of the same kind (on an empty one it ends the list).
const REPEATS = ['bullet', 'number', 'todo', 'quote'];
const LIST_TYPES = ['bullet', 'number', 'todo'];

function indentOf(block) {
  return LIST_TYPES.includes(block.type) ? Math.max(0, Number(block.indent) || 0) : 0;
}

function blockRows(blocks) {
  const ancestors = [];
  return blocks.map((block, index) => {
    if (!LIST_TYPES.includes(block.type)) {
      ancestors.length = 0;
      return { block, index, hidden: false, hasChildren: false };
    }

    const indent = indentOf(block);
    while (ancestors.length && ancestors[ancestors.length - 1].indent >= indent) ancestors.pop();
    const hidden = ancestors.some((ancestor) => ancestor.collapsed);
    const next = blocks[index + 1];
    const hasChildren = LIST_TYPES.includes(next?.type) && indentOf(next) > indent;
    if (!hidden) ancestors.push({ indent, collapsed: !!block.collapsed });
    return { block, index, hidden, hasChildren };
  });
}

function subtreeEnd(blocks, index) {
  const block = blocks[index];
  if (!LIST_TYPES.includes(block.type)) return index;
  const indent = indentOf(block);
  let end = index;
  for (let i = index + 1; i < blocks.length; i++) {
    if (!LIST_TYPES.includes(blocks[i].type) || indentOf(blocks[i]) <= indent) break;
    end = i;
  }
  return end;
}


// ======================================================================
// HELPERS
// ======================================================================
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The text of some block HTML, without any formatting.
function htmlToText(html) {
  const box = document.createElement('div');
  box.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return box.textContent ?? '';
}

// Keep only the formatting we support (bold, italic, underline, strikethrough, code, links, line breaks).
// Anything else, including scripts and styles, is removed. This runs before a note is saved.
const KEEP = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', CODE: 'code', BR: 'br', A: 'a' };
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');

  function clean(node) {
    let out = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += escapeHtml(child.textContent);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = KEEP[child.tagName];
        const inner = clean(child);
        if (!tag) out += inner; // an element we don't support: keep its text
        else if (tag === 'br') out += '<br>';
        else if (tag === 'a') {
          const href = child.getAttribute('href') || '';
          out += /^(https?:|mailto:)/i.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${inner}</a>` : inner;
        } else out += `<${tag}>${inner}</${tag}>`;
      }
    }
    return out;
  }
  return clean(doc.body);
}

export function newBlock(type = 'p', html = '') {
  return { id: uid(), type, html, checked: false };
}

// The blocks of a note. Notes written before blocks existed only have plain text (note.body): each line becomes a block.
export function blocksFromNote(note) {
  if (Array.isArray(note.blocks) && note.blocks.length > 0) return note.blocks;
  return (note.body || '').split('\n').map((line) => newBlock('p', escapeHtml(line)));
}

// The note as plain text (so it still works as a simple fallback, for search or an old copy of the app).
export function blocksToText(blocks) {
  let count = 0;
  return blocks
    .map((block) => {
      count = block.type === 'number' ? count + 1 : 0;
      const text = htmlToText(block.html);
      const indent = LIST_TYPES.includes(block.type) ? '  '.repeat(Math.max(0, Number(block.indent) || 0)) : '';
      const marker = { h1: '# ', h2: '## ', h3: '### ', bullet: '- ', number: `${count}. `, quote: '> ' }[block.type] ?? '';
      if (block.type === 'todo') return `${indent}[${block.checked ? 'x' : ' '}] ${text}`;
      return indent + marker + text;
    })
    .join('\n');
}


// ======================================================================
// THE CURSOR
// ======================================================================
// Where is the cursor in a block's text? { collapsed: nothing selected, atStart, atEnd }
function caretState(element) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return { collapsed: false, atStart: false, atEnd: false };
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return { collapsed: false, atStart: false, atEnd: false };

  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const after = range.cloneRange();
  after.selectNodeContents(element);
  after.setStart(range.endContainer, range.endOffset);

  return { collapsed: range.collapsed, atStart: before.toString() === '', atEnd: after.toString() === '' };
}

// The block's HTML before the cursor and after it (anything selected is dropped).
function splitAtCaret(element) {
  const range = window.getSelection().getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const after = range.cloneRange();
  after.selectNodeContents(element);
  after.setStart(range.endContainer, range.endOffset);

  const toHtml = (part) => {
    const box = document.createElement('div');
    box.appendChild(part.cloneContents());
    return box.innerHTML;
  };
  return [toHtml(before), toHtml(after)];
}

// Put the cursor at 'start', 'end', or a number of characters from the start.
function placeCaret(element, at) {
  const range = document.createRange();
  if (at === 'start') {
    range.selectNodeContents(element);
    range.collapse(true);
  } else if (at === 'end') {
    range.selectNodeContents(element);
    range.collapse(false);
  } else {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let left = at;
    let node;
    while ((node = walker.nextNode())) {
      if (left <= node.length) {
        range.setStart(node, left);
        range.collapse(true);
        break;
      }
      left -= node.length;
    }
    if (!node) {
      range.selectNodeContents(element);
      range.collapse(false);
    }
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}


// ======================================================================
// ONE BLOCK
// ======================================================================
const PLACEHOLDERS = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'List', number: 'List', todo: 'To-do', quote: 'Quote', code: 'Code' };

function BlockRow({ block, number, menu, actions, hasChildren, selected }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const text = useRef(null);
  const indent = LIST_TYPES.includes(block.type) ? Math.max(0, Number(block.indent) || 0) : 0;

  // Keep the text on screen in step with the data, but only when they differ, so typing never moves the cursor.
  useLayoutEffect(() => {
    if (text.current && text.current.innerHTML !== block.html) text.current.innerHTML = block.html;
  }, [block.html]);

  const matching = menu?.id === block.id ? actions.menuItems(menu.query) : [];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, marginLeft: `${indent * 24}px` }}
      className={`block block-${block.type}${block.checked ? ' checked' : ''}${isDragging ? ' dragging' : ''}${selected ? ' selected' : ''}`}
      data-block={block.id}
    >
      <button type="button" className="block-grip" aria-label="Drag to move this block" tabIndex={-1} {...attributes} {...listeners}>
        <Icon name="grip" size={14} />
      </button>

      {LIST_TYPES.includes(block.type) && hasChildren && (
        <button
          type="button"
          className="block-collapse"
          aria-label={block.collapsed ? 'Expand sub-list' : 'Collapse sub-list'}
          aria-expanded={!block.collapsed}
          title={block.collapsed ? 'Expand sub-list' : 'Collapse sub-list'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => actions.toggleCollapse(block.id)}
        >
          <Icon name="chevronDown" size={10} />
        </button>
      )}

      {block.type === 'bullet' && <span className="block-marker" aria-hidden="true">•</span>}
      {block.type === 'number' && <span className="block-marker" aria-hidden="true">{number}.</span>}
      {block.type === 'todo' && (
        <input
          type="checkbox"
          className="block-check"
          checked={!!block.checked}
          aria-label="Done"
          onChange={() => actions.update(block.id, { checked: !block.checked })}
        />
      )}

      <div
        ref={(node) => {
          text.current = node;
          actions.register(block.id, node);
        }}
        className="block-text"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={PLACEHOLDERS[block.type] ?? "Type '/' for blocks"}
        onInput={(event) => actions.input(block, event.currentTarget)}
        onKeyDown={(event) => actions.key(block, event)}
        onPaste={(event) => actions.paste(block, event)}
        onCut={(event) => actions.cut(event)}
      />

      {menu?.id === block.id && matching.length > 0 && (
        <div className="slash-menu" role="listbox">
          {matching.map((item, i) => (
            <button
              key={item.type}
              type="button"
              role="option"
              aria-selected={i === menu.index}
              className={'slash-item' + (i === menu.index ? ' picked' : '')}
              onMouseDown={(event) => {
                event.preventDefault();
                actions.choose(block.id, item.type);
              }}
            >
              <span className="slash-symbol">{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// ======================================================================
// THE EDITOR
// ======================================================================
// Props: blocks (the list), onChange(newList) (called after every change).
export default function BlockEditor({ blocks, onChange }) {
  const elements = useRef({});          // block id -> its text element
  const pendingFocus = useRef(null);    // where to put the cursor after the next change: { id, at }
  const [menu, setMenu] = useState(null); // the "/" menu: { id, query, index } or null
  const [dragId, setDragId] = useState(null); // the block being dragged, or null
  const root = useRef(null);
  const [selected, setSelected] = useState(() => new Set()); // blocks touched by a selection that spans several blocks
  const latest = useRef(blocks);
  latest.current = blocks;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // After a change, put the cursor where the change asked for.
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    pendingFocus.current = null;
    const element = elements.current[request.id];
    if (!element) return;
    element.focus();
    placeCaret(element, request.at);
  }, [blocks]);

  function focusAfterChange(id, at) {
    pendingFocus.current = { id, at };
  }

  // The ids of the visible blocks a selection touches, in order, when it spans more than one (else an empty list).
  function selectedIdsNow() {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed || !root.current?.contains(selection.getRangeAt(0).commonAncestorContainer)) return [];
    const range = selection.getRangeAt(0);
    const ids = blockRows(latest.current)
      .filter((row) => !row.hidden)
      .map((row) => row.block.id)
      .filter((id) => elements.current[id] && range.intersectsNode(elements.current[id]));
    return ids.length > 1 ? ids : [];
  }

  // Tint the blocks while a selection spans several of them.
  useEffect(() => {
    function onSelectionChange() {
      const ids = selectedIdsNow();
      setSelected((previous) => (previous.size === ids.length && ids.every((id) => previous.has(id)) ? previous : new Set(ids)));
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // The part of a block's HTML before the selection starts, or after it ends (empty if the selection reaches past that block).
  function edgeHtml(element, range, side) {
    const part = document.createRange();
    part.selectNodeContents(element);
    if (side === 'before') {
      if (!element.contains(range.startContainer)) return '';
      part.setEnd(range.startContainer, range.startOffset);
    } else {
      if (!element.contains(range.endContainer)) return '';
      part.setStart(range.endContainer, range.endOffset);
    }
    const box = document.createElement('div');
    box.appendChild(part.cloneContents());
    return box.innerHTML;
  }

  // Delete what is selected across several blocks: the text before it in the first block and the text after it in
  // the last block are joined, and the blocks in between disappear.
  function deleteSelection(ids) {
    const range = window.getSelection().getRangeAt(0);
    const first = ids[0];
    const head = edgeHtml(elements.current[first], range, 'before');
    const tail = edgeHtml(elements.current[ids[ids.length - 1]], range, 'after');
    const gone = new Set(ids.slice(1));
    onChange(blocks.filter((b) => !gone.has(b.id)).map((b) => (b.id === first ? { ...b, html: head + tail } : b)));
    focusAfterChange(first, htmlToText(head).length);
  }

  // Ctrl+X over several blocks: put the text on the clipboard, then delete it.
  function cut(event) {
    const ids = selectedIdsNow();
    if (!ids.length) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', window.getSelection().toString());
    deleteSelection(ids);
  }

  const update = (id, patch) => onChange(blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  const toggleCollapse = (id) => {
    const block = blocks.find((item) => item.id === id);
    if (block) update(id, { collapsed: !block.collapsed });
  };

  // Which kinds of block match what is typed after the "/".
  const menuItems = (query) => {
    const q = query.trim().toLowerCase();
    return BLOCK_TYPES.filter((item) => !q || `${item.label} ${item.keys}`.toLowerCase().includes(q));
  };

  // Turn a block into another kind (from the "/" menu). Text typed for the menu is cleared.
  function choose(id, type) {
    const fromMenu = menu?.id === id;
    setMenu(null);
    onChange(blocks.map((b) => (b.id === id ? { ...b, type, html: fromMenu ? '' : b.html, checked: false, indent: LIST_TYPES.includes(type) ? (b.indent ?? 0) : 0 } : b)));
    focusAfterChange(id, 'end');
  }

  // ---- what happens as you type
  function input(block, element) {
    // Browsers leave a stray <br> in an empty box; remove it so the placeholder shows.
    if (element.innerHTML === '<br>') element.innerHTML = '';
    const plain = element.textContent.replace(/\u00a0/g, ' ');

    // "# " and friends at the start of an empty text block turn it into a heading, list...
    if (block.type === 'p' && SHORTCUTS[plain]) {
      onChange(blocks.map((b) => (b.id === block.id ? { ...b, type: SHORTCUTS[plain], html: '' } : b)));
      focusAfterChange(block.id, 'start');
      return;
    }

    // "/" at the start opens the menu, and what follows it narrows the choices.
    if (plain.startsWith('/')) setMenu({ id: block.id, query: plain.slice(1), index: 0 });
    else if (menu?.id === block.id) setMenu(null);

    update(block.id, { html: element.innerHTML });
  }

  // ---- keys
  function key(block, event) {
    const index = blocks.findIndex((b) => b.id === block.id);
    const element = elements.current[block.id];
    if (event.nativeEvent.isComposing) return;

    // Several blocks are selected: Backspace / Delete / Enter remove the selection, Tab indents the list items in it.
    const picked = selectedIdsNow();
    if (picked.length && !event.ctrlKey && !event.metaKey) {
      if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter') {
        event.preventDefault();
        deleteSelection(picked);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const delta = event.shiftKey ? -1 : 1;
        onChange(blocks.map((b) => (picked.includes(b.id) && LIST_TYPES.includes(b.type) ? { ...b, indent: Math.max(0, (Number(b.indent) || 0) + delta) } : b)));
        return;
      }
    }

    // The "/" menu is open: the keys drive it.
    if (menu?.id === block.id) {
      const items = menuItems(menu.query);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setMenu({ ...menu, index: (menu.index + step + items.length) % Math.max(1, items.length) });
        return;
      }
      if (event.key === 'Enter' && items.length > 0) {
        event.preventDefault();
        choose(block.id, items[menu.index]?.type ?? items[0].type);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMenu(null);
        return;
      }
    }

    // Tab indents list items; Shift+Tab outdents them.
    if (event.key === 'Tab' && LIST_TYPES.includes(block.type)) {
      event.preventDefault();
      if (menu?.id === block.id) setMenu(null);
      update(block.id, { indent: Math.max(0, (Number(block.indent) || 0) + (event.shiftKey ? -1 : 1)) });
      return;
    }

    // Enter: a new line inside the block (an empty list item ends the list). Shift+Enter: a new block.
    if (event.key === 'Enter') {
      event.preventDefault();
      const isEmpty = htmlToText(block.html).trim() === '';
      if (!event.shiftKey) {
        if (REPEATS.includes(block.type) && isEmpty) {
          update(block.id, { type: 'p', indent: 0 }); // an empty list item ends the list
          focusAfterChange(block.id, 'start');
        } else if (block.type === 'code') {
          document.execCommand('insertText', false, '\n');
        } else {
          document.execCommand('insertLineBreak');
        }
        return;
      }
      const [before, after] = splitAtCaret(element);
      const repeats = REPEATS.includes(block.type);
      const created = { ...newBlock(repeats ? block.type : 'p', after), ...(repeats ? { indent: block.indent ?? 0 } : {}) };
      onChange([...blocks.slice(0, index), { ...block, html: before }, created, ...blocks.slice(index + 1)]);
      focusAfterChange(created.id, 'start');
      return;
    }

    const caret = caretState(element);

    // Backspace at the very start: turn it into text, or join it to the block above.
    if (event.key === 'Backspace' && caret.collapsed && caret.atStart) {
      if (block.type !== 'p') {
        event.preventDefault();
        update(block.id, { type: 'p', indent: 0 });
        focusAfterChange(block.id, 'start');
      } else if (index > 0) {
        event.preventDefault();
        const previous = blocks[index - 1];
        const joinAt = htmlToText(previous.html).length;
        onChange([...blocks.slice(0, index - 1), { ...previous, html: previous.html + element.innerHTML }, ...blocks.slice(index + 1)]);
        focusAfterChange(previous.id, joinAt);
      }
      return;
    }

    // Arrow keys at the edge of a block go to the next one.
    if (event.key === 'ArrowUp' && caret.collapsed && caret.atStart && index > 0) {
      event.preventDefault();
      elements.current[blocks[index - 1].id].focus();
      placeCaret(elements.current[blocks[index - 1].id], 'end');
    }
    if (event.key === 'ArrowDown' && caret.collapsed && caret.atEnd && index < blocks.length - 1) {
      event.preventDefault();
      elements.current[blocks[index + 1].id].focus();
      placeCaret(elements.current[blocks[index + 1].id], 'start');
    }
  }

  // ---- pasting: only plain text comes in (no foreign styles); several lines become several blocks.
  function paste(block, event) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    const lines = text.split(/\r?\n/);
    if (lines.length === 1) {
      document.execCommand('insertText', false, text);
      return;
    }

    const index = blocks.findIndex((b) => b.id === block.id);
    const [before, after] = splitAtCaret(elements.current[block.id]);
    const parts = lines.map(escapeHtml);
    const rest = parts.slice(1).map((html, i) => newBlock('p', html + (i === parts.length - 2 ? after : '')));
    onChange([...blocks.slice(0, index), { ...block, html: before + parts[0] }, ...rest, ...blocks.slice(index + 1)]);
    focusAfterChange(rest[rest.length - 1].id, htmlToText(parts[parts.length - 1]).length);
  }

  // ---- dragging a block to a new place
  function onDragEnd({ active, over }) {
    setDragId(null);
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    const fromEnd = subtreeEnd(blocks, from);
    const toEnd = subtreeEnd(blocks, to);
    if ((to >= from && to <= fromEnd) || (to < from && toEnd >= from)) return;

    const moving = blocks.slice(from, fromEnd + 1);
    const remaining = [...blocks.slice(0, from), ...blocks.slice(fromEnd + 1)];
    const insertion = to < from ? to : toEnd - moving.length + 1;
    onChange([...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)]);
  }

  // The numbers of a numbered list: 1, 2, 3 for a run of numbered blocks, starting again after anything else.
  let run = 0;
  const numbers = blocks.map((block) => (block.type === 'number' ? ++run : (run = 0)));
  const visibleRows = blockRows(blocks).filter((row) => !row.hidden);

  const dragged = blocks.find((block) => block.id === dragId);

  const actions = { update, input, key, paste, cut, choose, menuItems, toggleCollapse, register: (id, node) => (elements.current[id] = node) };

  return (
    <div className="blocks" ref={root}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDragId(active.id)}
        onDragCancel={() => setDragId(null)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={visibleRows.map(({ block }) => block.id)} strategy={verticalListSortingStrategy}>
          {visibleRows.map(({ block, index, hasChildren }) => (
            <BlockRow key={block.id} block={block} number={numbers[index]} menu={menu} actions={actions} hasChildren={hasChildren} selected={selected.has(block.id)} />
          ))}
        </SortableContext>
        <DragLayer>
          {dragged && (
            <div className="drag-card block-card">
              <span className="drag-title">{htmlToText(dragged.html).trim() || 'Empty block'}</span>
            </div>
          )}
        </DragLayer>
      </DndContext>
    </div>
  );
}
