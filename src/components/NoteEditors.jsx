// NoteEditors.jsx = the three editors a note can be edited in (Settings > General > Notes editor). They all take the
// note's Markdown text (`md`, see notes.js) and call onMd(newMarkdown) as you type, so a note can be opened in any of them.
//
//   RichEditor      like a word processor: select across lines freely, markdown shortcuts (# , - , [] , > ), Ctrl+B/I/U.
//                   Enter is a new line in the same block (in a list it is a new item); Shift+Enter starts a new block.
//   BlocksEditor    the block editor (BlockEditor.jsx): handles to move blocks, "/" menu, pick whole blocks.
//   MarkdownEditor  the Markdown as plain text, with a Preview switch.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import BlockEditor, { cleanHtml } from './BlockEditor.jsx';
import { blocksToMd, mdToBlocks, mdToHtml } from '../notes.js';


// ======================================================================
// RICH (TipTap)
// ======================================================================
// Enter: a new line in the same block, except in a list (a new item), a task or code (as usual).
// Shift+Enter: a new block, except in those.
const inListLike = (editor) => editor.isActive('listItem') || editor.isActive('taskItem') || editor.isActive('codeBlock');
const Lines = Extension.create({
  name: 'lines',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => (inListLike(editor) ? false : editor.commands.setHardBreak()),
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
            className={'rich-tool t-' + label.replace(/[^A-Za-z0-9]/g, '') + (active(editor) ? ' on' : '')}
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
export function MarkdownEditor({ md, onMd }) {
  const [text, setText] = useState(md);
  const [preview, setPreview] = useState(false);
  const area = useRef(null);

  // The box grows with its text (the note scrolls, not the box).
  useEffect(() => {
    if (!area.current) return;
    area.current.style.height = 'auto';
    area.current.style.height = area.current.scrollHeight + 'px';
  }, [text, preview]);

  const html = useMemo(() => (preview ? mdToBlocks(text) : []), [preview, text]);

  return (
    <div className="md-editor">
      <div className="rich-tools">
        <button type="button" className={'rich-tool wide' + (!preview ? ' on' : '')} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" className={'rich-tool wide' + (preview ? ' on' : '')} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      {preview ? (
        <div className="md-preview">
          {html.map((block) => {
            const inner = { __html: block.html };
            if (block.type === 'h1') return <h1 key={block.id} dangerouslySetInnerHTML={inner} />;
            if (block.type === 'h2') return <h2 key={block.id} dangerouslySetInnerHTML={inner} />;
            if (block.type === 'h3') return <h3 key={block.id} dangerouslySetInnerHTML={inner} />;
            if (block.type === 'quote') return <blockquote key={block.id} dangerouslySetInnerHTML={inner} />;
            if (block.type === 'code') return <pre key={block.id} dangerouslySetInnerHTML={inner} />;
            const marker = { bullet: '•', number: '–', todo: block.checked ? '☑' : '☐' }[block.type];
            return (
              <p key={block.id} style={{ marginLeft: (block.indent ?? 0) * 20 }}>
                {marker && <span className="md-marker">{marker} </span>}
                <span dangerouslySetInnerHTML={inner} />
              </p>
            );
          })}
        </div>
      ) : (
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
      )}
    </div>
  );
}
