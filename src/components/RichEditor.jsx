// RichEditor.jsx = the Rich note editor (TipTap). It lives in its own file so the editor library (about 350 KB) is only
// downloaded when a note is opened in Rich (see Side.jsx, which loads it on demand).
//
// Enter is a new line in the same block (in a list it is a new item); Shift+Enter starts a new block. Markdown shortcuts
// (# , - , [] , > ) and Ctrl+B/I/U work as you type.

import { useEffect, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';

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

export default RichEditor;
