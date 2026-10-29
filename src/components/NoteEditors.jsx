// NoteEditors.jsx = the three editors a note can be edited in (Settings > General > Notes editor). They all take the
// note's Markdown text (`md`, see notes.js) and call onMd(newMarkdown) as you type, so a note can be opened in any of them.
//
//   RichEditor      (RichEditor.jsx) like a word processor: select across lines freely, markdown shortcuts.
//   BlocksEditor    the block editor (BlockEditor.jsx): handles to move blocks, "/" menu, pick whole blocks.
//   MarkdownEditor  the Markdown itself, coloured as you type (one surface, nothing to switch).

import { useEffect, useMemo, useRef, useState } from 'react';
import BlockEditor, { cleanHtml } from './BlockEditor.jsx';
import { blocksToMd, mdToBlocks } from '../notes.js';


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
