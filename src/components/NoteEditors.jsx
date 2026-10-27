// NoteEditors.jsx = the three editors a note can be edited in (Settings > General > Notes editor). They all take the
// note's Markdown text (`md`, see notes.js) and call onMd(newMarkdown) as you type, so a note can be opened in any of them.
//
//   RichEditor      like a word processor: select across lines freely, markdown shortcuts (# , - , [] , > ), Ctrl+B/I/U.
//                   Enter is a new line in the same block (in a list it is a new item); Shift+Enter starts a new block.
//   BlocksEditor    the block editor (BlockEditor.jsx): handles to move blocks, "/" menu, pick whole blocks.
//   MarkdownEditor  the Markdown itself, coloured as you type (one surface, nothing to switch).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import BlockEditor, { cleanHtml } from './BlockEditor.jsx';
import { blocksToMd, mdToBlocks } from '../notes.js';


// ======================================================================
// RICH (TipTap)
// ======================================================================
// Enter: a new line in the same block, except in a list (a new item), a task, code or a heading (as usual).
// Shift+Enter: a new block, except in those.
const inListLike = (editor) => editor.isActive('listItem') || editor.isActive('taskItem') || editor.isActive('codeBlock');
const Lines = Extension.create({
  name: 'lines',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => (inListLike(editor) || editor.isActive('heading') ? false : editor.commands.setHardBreak()), // a heading ends at Enter
      'Shift-Enter': ({ editor }) => (inListLike(editor) ? false : editor.commands.splitBlock()),
    };
  },
});

// The buttons above the editor, for the phone (everything here also has a shortcut or a markdown form).
const TOOLS = [
  ['B', 'Bold', (c) => c.toggleBold(), (e) => e.isActive('bold')],
  ['I', 'Italic', (c) => c.toggleItalic(), (e) => e.isActive('italic')],
  ['U', 'Underline', (c) => c.toggleUnderline(), (e) => e.isActive('underline')],
  ['S', 'Strikethrough', (c) => c.toggleStrike(), (e) => e.isActive('strike')],
  null,
  ['H1', 'Heading 1', (c) => c.toggleHeading({ level: 1 }), (e) => e.isActive('heading', { level: 1 })],
  ['H2', 'Heading 2', (c) => c.toggleHeading({ level: 2 }), (e) => e.isActive('heading', { level: 2 })],
  null,
  ['•', 'Bulleted list', (c) => c.toggleBulletList(), (e) => e.isActive('bulletList')],
  ['1.', 'Numbered list', (c) => c.toggleOrderedList(), (e) => e.isActive('orderedList')],
  ['☐', 'To-do list', (c) => c.toggleTaskList(), (e) => e.isActive('taskList')],
  null,
  ['❝', 'Quote', (c) => c.toggleBlockquote(), (e) => e.isActive('blockquote')],
  ['</>', 'Code block', (c) => c.toggleCodeBlock(), (e) => e.isActive('codeBlock')],
];

export function RichEditor({ md, onMd }) {
  const latest = useRef(onMd);
  latest.current = onMd;

  const editor = useEditor({
    extensions: [StarterKit, Markdown, TaskList, TaskItem.configure({ nested: true }), Lines],
    content: md,
    contentType: 'markdown',
    editorProps: { attributes: { class: 'rich', 'aria-label': 'Note text', spellcheck: 'true' } },
    onUpdate: ({ editor: current }) => latest.current(current.getMarkdown()),
  });

  // Keep the toolbar's pressed states in step with the cursor.
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const update = () => redraw((n) => n + 1);
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  if (!editor) return null;
  return (
    <div className="rich-editor">
      <div className="rich-tools" role="toolbar" aria-label="Formatting">
        {TOOLS.map((tool, index) => {
          if (!tool) return <span key={index} className="rich-sep" aria-hidden="true" />;
          const [label, name, run, active] = tool;
          return (
          <button
            key={name}
            type="button"
            className={'btn-ghost rich-tool t-' + label.replace(/[^A-Za-z0-9]/g, '') + (active(editor) ? ' on' : '')}
            aria-label={name}
            aria-pressed={active(editor)}
            title={name}
            onMouseDown={(event) => event.preventDefault()} // keep the cursor where it is
            onClick={() => run(editor.chain().focus()).run()}
          >
            {label}
          </button>
          );
        })}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}


// ======================================================================
// BLOCKS
// ======================================================================
export function BlocksEditor({ md, onMd }) {
  const [blocks, setBlocks] = useState(() => mdToBlocks(md));
  return (
    <BlockEditor
      blocks={blocks}
      onChange={(next) => {
        setBlocks(next);
        onMd(blocksToMd(next.map((block) => ({ ...block, html: cleanHtml(block.html) }))));
      }}
    />
  );
}


// ======================================================================
// MARKDOWN
// ======================================================================
// ONE surface: you type the Markdown itself, and it is coloured as you type (headings bold, **bold** bold, `code` shaded,
// markers dimmed). A coloured copy of the text sits behind a see-through text box with exactly the same font and size, so
// nothing shifts and there is nothing to switch between.
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function colour(md) {
  return md
    .split('\n')
    .map((raw) => {
      let line = escapeHtml(raw);
      const heading = /^(#{1,3} )(.*)$/.exec(line);
      const quote = /^(&gt; ?)(.*)$/.exec(line);
      const item = /^(\s*(?:[-*+]|\d+[.)]) (?:\[[ xX]\] )?)(.*)$/.exec(line);
      const done = /^\s*[-*+] \[[xX]\] /.test(line);
      // inline marks: the characters stay (so the box lines up); they are only wrapped
      const inline = (text) =>
        text
          .replace(/(`[^`\n]+`)/g, '<span class="mk-code">$1</span>')
          .replace(/(\*\*[^*\n]+\*\*)/g, '<b>$1</b>')
          .replace(/(~~[^~\n]+~~)/g, '<s>$1</s>')
          .replace(/(^|[^*])(\*[^*\n]+\*)/g, '$1<i>$2</i>')
          .replace(/(\[[^\]\n]+\]\([^)\s]*\))/g, '<span class="mk-link">$1</span>');
      if (heading) return `<span class="mk-mark">${heading[1]}</span><span class="mk-h">${inline(heading[2])}</span>`;
      if (quote) return `<span class="mk-mark">${quote[1]}</span><span class="mk-q">${inline(quote[2])}</span>`;
      if (item) return `<span class="mk-mark">${item[1]}</span><span class="${done ? 'mk-done' : ''}">${inline(item[2])}</span>`;
      if (/^```/.test(line)) return `<span class="mk-mark">${line}</span>`;
      return inline(line);
    })
    .join('\n');
}

export function MarkdownEditor({ md, onMd }) {
  const [text, setText] = useState(md);
  const area = useRef(null);

  // The box grows with its text (the note scrolls, not the box).
  useEffect(() => {
    if (!area.current) return;
    area.current.style.height = 'auto';
    area.current.style.height = area.current.scrollHeight + 'px';
  }, [text]);

  const html = useMemo(() => colour(text) + '\n ', [text]); // a last line break so the copy is as tall as the box

  return (
    <div className="md-editor">
      <pre className="md-color" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
      <textarea
        ref={area}
        className="md-text"
        value={text}
        spellCheck
        aria-label="Note text (Markdown)"
        placeholder="Write here. # heading, - list, - [ ] to-do, > quote, **bold**, *italic*"
        onChange={(event) => {
          setText(event.target.value);
          onMd(event.target.value);
        }}
      />
    </div>
  );
}
