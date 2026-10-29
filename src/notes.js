// notes.js = how a note's text is stored, and moving it between the three editors (Settings > General > Notes editor).
//
// Every note keeps ONE canonical copy of its text, `md`: Markdown. All three editors read and write it:
//   Rich      (TipTap)       reads/writes Markdown itself
//   Blocks    (BlockEditor)  works on a list of blocks, converted from and to Markdown here
//   Markdown  (a text box)   edits `md` directly
//
// A note record looks like:
//   { title, md, md_at, body, blocks, legacy_blocks, versions, trashed, position, edited_at }
//   md             the text, in Markdown (see "The dialect" below)
//   md_at          the edited_at that went with `md`. If `edited_at` is newer, an OLDER copy of the app edited `blocks`
//                  after this copy last saved, so the text is rebuilt from `blocks` and nothing that copy wrote is lost
//   body, blocks   the same text as plain text and as blocks. Still written on every save, so a copy of the app from
//                  before this system keeps showing the right thing
//   legacy_blocks  the note's `blocks` exactly as they were before this system first touched it. Written once, never changed
//   versions       up to 10 earlier copies of `md`: [{ at, md }], for "History" in the note's footer
//   trashed        a time, when the note is in the Trash. Nothing is ever deleted without going through the Trash first
//
// Nothing in this file deletes or overwrites a note's data: it only converts.
//
// ---- The dialect ----------------------------------------------------------------------------------------------
// Blocks are separated by a newline (list items) or a blank line (everything else), and:
//   # / ## / ###      headings            - item   or  * item     bullet (two spaces of indent per level)
//   1. item           numbered            - [ ] / - [x]           to-do
//   > text            quote               ``` ... ```             code
//   a line of text    a paragraph; a newline inside one is a line break; an empty paragraph is   &nbsp;
//   **bold** *italic* ~~strike~~ `code` [text](url) <u>underline</u>      (backslash escapes the markers)

const LIST_TYPES = ['bullet', 'number', 'todo'];

// ---- inline text: block HTML (b i u s code a br) <-> Markdown ----
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (text) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (match) => ENTITIES[match]);
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeMd = (text) => text.replace(/([\\`*_~[\]<>])/g, '\\$1');

export function htmlToMd(html) {
  let out = '';
  let inCode = false; // inside `code`, text is kept exactly as it is
  for (const part of String(html ?? '').split(/(<[^>]+>)/)) {
    const tag = /^<(\/?)([a-z]+)([^>]*)>$/i.exec(part);
    if (!tag) {
      out += inCode ? decode(part).replace(/`/g, "'") : escapeMd(decode(part));
      continue;
    }
    const [, closing, name, attrs] = tag;
    const lower = name.toLowerCase();
    if (lower === 'b' || lower === 'strong') out += '**';
    else if (lower === 'i' || lower === 'em') out += '*';
    else if (lower === 's' || lower === 'strike' || lower === 'del') out += '~~';
    else if (lower === 'code') {
      inCode = !closing;
      out += '`';
    }
    else if (lower === 'u') out += closing ? '</u>' : '<u>';
    else if (lower === 'br') out += '\n';
    else if (lower === 'a') {
      if (closing) out += `](${linkStack.pop() ?? ''})`;
      else {
        linkStack.push(decode(/href="([^"]*)"/i.exec(attrs)?.[1] ?? '').replace(/\)/g, '%29'));
        out += '[';
      }
    }
  }
  linkStack.length = 0;
  return out;
}
const linkStack = [];

export function mdToHtml(md) {
  let out = '';
  const open = []; // the tags that are open, so unfinished formatting is closed at the end
  const toggle = (tag) => {
    const at = open.lastIndexOf(tag);
    if (at === -1) {
      open.push(tag);
      out += `<${tag}>`;
    } else {
      while (open.length > at) out += `</${open.pop()}>`;
    }
  };

  const text = String(md ?? '');
  for (let i = 0; i < text.length; i++) {
    const rest = text.slice(i);
    if (text[i] === '\\' && i + 1 < text.length) {
      out += escapeHtml(text[++i]);
    } else if (rest.startsWith('**')) {
      toggle('b');
      i += 1;
    } else if (rest.startsWith('~~')) {
      toggle('s');
      i += 1;
    } else if (text[i] === '*' || (text[i] === '_' && !/\w/.test(text[i - 1] ?? ' '))) {
      toggle('i');
    } else if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end === -1) out += '`';
      else {
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
        i = end;
      }
    } else if (rest.startsWith('<u>')) {
      toggle('u');
      i += 2;
    } else if (rest.startsWith('</u>')) {
      toggle('u');
      i += 3;
    } else if (text[i] === '[') {
      const link = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/.exec(rest);
      if (link) {
        // Only web and mail links become links: a javascript: or data: address stays plain text.
        out += /^(https?:|mailto:)/i.test(link[2]) ? `<a href="${escapeHtml(link[2])}" target="_blank" rel="noreferrer">${mdToHtml(link[1])}</a>` : mdToHtml(link[1]);
        i += link[0].length - 1;
      } else out += '[';
    } else if (text[i] === '\n') {
      out += '<br>';
    } else {
      out += escapeHtml(text[i]);
    }
  }
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

// ---- the plain text of a note (for search and for old copies of the app) ----
export function mdToPlain(md) {
  return blocksToPlain(mdToBlocks(md));
}

export function blocksToPlain(blocks) {
  let count = 0;
  return blocks
    .map((block) => {
      count = block.type === 'number' ? count + 1 : 0;
      const text = decode(String(block.html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
      const indent = LIST_TYPES.includes(block.type) ? '  '.repeat(Math.max(0, Number(block.indent) || 0)) : '';
      const marker = { h1: '# ', h2: '## ', h3: '### ', bullet: '- ', number: `${count}. `, quote: '> ' }[block.type] ?? '';
      if (block.type === 'todo') return `${indent}[${block.checked ? 'x' : ' '}] ${text}`;
      return indent + marker + text;
    })
    .join('\n');
}

// ---- blocks -> Markdown ----
export function blocksToMd(blocks) {
  const lines = [];
  let previous = null;
  for (const block of blocks) {
    const indent = LIST_TYPES.includes(block.type) ? Math.max(0, Number(block.indent) || 0) : 0;
    const pad = '  '.repeat(indent);
    const body = block.type === 'code' ? decode(String(block.html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')) : htmlToMd(block.html);
    // A line that would be read as markup (a heading, a list item...) gets a backslash in front. Only lines with no
    // marker of their own need it: paragraph lines and continuation lines.
    const guard = (line) => (/^(#{1,3} |[-*+] |\d+[.)] |>|```|&nbsp;$)/.test(line) ? '\\' + line : line);
    const parts = body.split('\n').map((line, i) => (block.type === 'code' || (i === 0 && block.type !== 'p') ? line : guard(line)));
    const continuation = (i) => (i === 0 ? '' : pad + '  ');
    let chunk;

    if (block.type === 'code') chunk = ['```', ...parts, '```'];
    else if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') chunk = parts.map((p, i) => (i === 0 ? { h1: '# ', h2: '## ', h3: '### ' }[block.type] : '  ') + p);
    else if (block.type === 'quote') chunk = parts.map((p) => '> ' + p);
    else if (block.type === 'bullet') chunk = parts.map((p, i) => (i === 0 ? pad + '- ' : continuation(i)) + p);
    else if (block.type === 'number') chunk = parts.map((p, i) => (i === 0 ? pad + '1. ' : continuation(i)) + p);
    else if (block.type === 'todo') chunk = parts.map((p, i) => (i === 0 ? `${pad}- [${block.checked ? 'x' : ' '}] ` : continuation(i)) + p);
    else chunk = body.trim() === '' ? ['&nbsp;'] : parts;

    // Consecutive list items stay together; everything else gets a blank line around it.
    const together = previous && LIST_TYPES.includes(previous) && LIST_TYPES.includes(block.type);
    if (lines.length && !together) lines.push('');
    lines.push(...chunk);
    previous = block.type;
  }
  return lines.join('\n');
}

// ---- Markdown -> blocks ----
let counter = 0;
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `b${Date.now().toString(36)}${(counter++).toString(36)}`);
const make = (type, html, extra = {}) => ({ id: newId(), type, html, checked: false, ...extra });

const LIST = /^( *)(?:([-*+])|(\d+)[.)]) (?:\[([ xX])\] )?(.*)$/;

export function mdToBlocks(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = null; // the paragraph being built (its lines)
  let last = null;      // the last block, for continuation lines

  const endParagraph = () => {
    if (paragraph) {
      const text = paragraph.join('\n');
      blocks.push(make('p', text.trim() === '&nbsp;' ? '' : mdToHtml(text)));
      paragraph = null;
    }
    last = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      endParagraph();
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      blocks.push(make('code', escapeHtml(code.join('\n'))));
      continue;
    }
    if (line.trim() === '') {
      endParagraph();
      continue;
    }

    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      endParagraph();
      last = make('h' + heading[1].length, mdToHtml(heading[2]));
      blocks.push(last);
      continue;
    }
    if (line.startsWith('> ') || line === '>') {
      const text = mdToHtml(line.slice(2));
      if (last?.type === 'quote') last.html += '<br>' + text;
      else {
        endParagraph();
        last = make('quote', text);
        blocks.push(last);
      }
      continue;
    }
    const item = LIST.exec(line);
    if (item) {
      endParagraph();
      const [, spaces, bullet, number, check, text] = item;
      const indent = Math.floor(spaces.length / 2);
      const type = check !== undefined ? 'todo' : bullet ? 'bullet' : 'number';
      last = make(type, mdToHtml(text), { indent, checked: check === 'x' || check === 'X' });
      blocks.push(last);
      continue;
    }
    if (last && /^ {2,}/.test(line)) {
      last.html += '<br>' + mdToHtml(line.trim()); // a continuation line of a list item or heading
      continue;
    }
    (paragraph ??= []).push(line.replace(/ {2,}$/, '')); // two spaces at the end of a line are Markdown's line break mark
  }
  endParagraph();
  return blocks.length ? blocks : [make('p', '')];
}

// ---- reading a note ----
// The note's text as Markdown: its own `md`, unless an older copy of the app edited `blocks` after it was saved.
export function noteMd(note) {
  if (typeof note.md === 'string' && !(note.edited_at > (note.md_at ?? 0))) return note.md;
  if (Array.isArray(note.blocks) && note.blocks.length) return blocksToMd(note.blocks);
  if (typeof note.md === 'string') return note.md;
  return String(note.body ?? '')
    .split('\n')
    .map((line) => escapeMd(line) || '&nbsp;')
    .join('\n\n');
}

// What to save for a note whose text is now `md`. `legacy_blocks` is the only thing guarded: it is set once, from the
// blocks the note had before this system touched it, and then never written again.
export function noteSavePatch(note, md, now = Date.now()) {
  const patch = { md, md_at: now, edited_at: now, body: mdToPlain(md), blocks: mdToBlocks(md).map(({ id, ...block }) => ({ id, ...block })) };
  if (!note.legacy_blocks && Array.isArray(note.blocks) && note.blocks.length && typeof note.md !== 'string') patch.legacy_blocks = note.blocks;

  // History: an earlier copy is kept when the last one is more than 10 minutes old.
  const versions = Array.isArray(note.versions) ? note.versions : [];
  const before = typeof note.md === 'string' ? note.md : noteMd(note);
  if (before && before !== md && (!versions.length || now - versions[0].at > 10 * 60000)) {
    patch.versions = [{ at: now, md: before }, ...versions].slice(0, 10);
  }
  return patch;
}
