// test-notes.mjs = checks that a note's text survives being moved between the editors (src/notes.js).
//
//   node scripts/test-notes.mjs
//
// Random notes are turned into Markdown and back, thousands of times; the blocks that come back must equal the blocks that
// went in. A note must never lose or change text just because it was opened in a different editor.

import { blocksToMd, mdToBlocks, noteMd, noteSavePatch } from '../src/notes.js';

let seed = 12345;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (list) => list[Math.floor(random() * list.length)];

const WORDS = ['alpha', 'beta', 'gamma', 'a*b', 'x_y', 'tick`s', '[brackets]', '<tag>', 'a&b', '"quoted"', '1. not a list', '# not a heading', '- dash', '> arrow', '~tilde~', 'back\\slash', 'ünïcode ✓', 'https://example.com/a_b'];
const FORMATS = [['<b>', '</b>'], ['<i>', '</i>'], ['<u>', '</u>'], ['<s>', '</s>'], ['<code>', '</code>']];
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function phrase() {
  let html = '';
  for (let i = 0, n = 1 + Math.floor(random() * 4); i < n; i++) {
    const word = esc(pick(WORDS));
    if (random() < 0.25) {
      const [open, close] = pick(FORMATS);
      html += open + (open === '<code>' ? word.replace(/`/g, "'") : word) + close; // a backtick inside inline code can not be written in Markdown
    } else if (random() < 0.08) {
      html += `<a href="https://example.com/x" target="_blank" rel="noreferrer">${word}</a>`;
    } else html += word;
    if (i < n - 1) html += ' ';
  }
  return html;
}

function randomBlock() {
  const type = pick(['p', 'p', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'code']);
  let html = type === 'code' ? esc(pick(WORDS)) + '\nsecond line' : phrase();
  if (type !== 'code' && random() < 0.2) html += '<br>' + phrase(); // a line break inside the block
  if (type === 'p' && random() < 0.15) html = '';
  const block = { type, html, checked: type === 'todo' && random() < 0.5 };
  if (['bullet', 'number', 'todo'].includes(type)) block.indent = Math.floor(random() * 3);
  return block;
}

const norm = (blocks) => blocks.map((b) => ({ type: b.type, html: b.html, checked: !!b.checked, indent: ['bullet', 'number', 'todo'].includes(b.type) ? b.indent ?? 0 : 0 }));
// The renderer may end a line break and the next text in different ways, so compare ignoring id and treating a <br> as one.

let failures = 0;
for (let run = 0; run < 4000; run++) {
  const blocks = Array.from({ length: 1 + Math.floor(random() * 8) }, randomBlock);
  const md = blocksToMd(blocks);
  const back = mdToBlocks(md);
  const again = blocksToMd(back);
  const same = JSON.stringify(norm(blocks)) === JSON.stringify(norm(back));
  if (!same || md !== again) {
    if (failures++ < 3) console.log('FAIL\n', JSON.stringify(norm(blocks), null, 1), '\n--- md ---\n' + md + '\n--- back ---\n', JSON.stringify(norm(back), null, 1));
  }
}
console.log(failures ? `${failures} round trips changed the text` : 'all 4000 random notes survive Markdown and back');

// An old note (blocks only) is read, and saving it keeps the original blocks as legacy_blocks, once.
const old = { id: 'n', title: 't', blocks: [{ id: '1', type: 'p', html: 'hello <b>world</b>', checked: false }], body: 'hello world', edited_at: 5 };
const md = noteMd(old);
const patch = noteSavePatch(old, md + '\n\nmore', 100);
const ok1 = md === 'hello **world**' && patch.legacy_blocks === old.blocks && patch.md === 'hello **world**\n\nmore' && patch.body.includes('more') && patch.versions?.[0].md === md;
// A second save must not touch legacy_blocks.
const saved = { ...old, ...patch };
const ok2 = noteSavePatch(saved, patch.md + '!', 200).legacy_blocks === undefined;
// An older copy of the app edits `blocks` after the new system saved: that edit wins, nothing is lost.
const edited = { ...saved, blocks: [{ id: '1', type: 'p', html: 'edited elsewhere', checked: false }], edited_at: 999 };
const ok3 = noteMd(edited) === 'edited elsewhere';
// A note with only plain text.
const ok4 = noteMd({ body: 'one\ntwo', edited_at: 1 }) === 'one\n\ntwo';
console.log(ok1 && ok2 && ok3 && ok4 ? 'legacy notes read and save safely' : `legacy checks failed: ${[ok1, ok2, ok3, ok4]}`);
process.exit(failures || !(ok1 && ok2 && ok3 && ok4) ? 1 : 0);
