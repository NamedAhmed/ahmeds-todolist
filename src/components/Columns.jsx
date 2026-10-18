// Columns.jsx = the widths of the three columns, and the handles between them that you drag to change them.
//
// Each column has a width and can be collapsed. Dragging a handle moves the line between the two columns next to it.
// If a column is dragged narrower than COLLAPSE_AT it snaps into a thin STRIP (its title written sideways), and
// clicking the strip opens it again.
//
// How the widths work: the page is a CSS grid and each open column is given "N fr" of the space (so the columns
// share what is left in proportion to N). We store N as the column's width in pixels the last time it was measured, which
// keeps the maths easy: when two neighbours trade space, their widths just add up to the same total.
//
// While you drag, the grid is changed directly (not through React), so the columns' contents don't re-draw on
// every pixel. When you let go, the result is saved in React state and in localStorage.

import { useEffect, useLayoutEffect, useState } from 'react';

const KEY = 'todolist:columns';
const STRIP = 52;         // the width of a collapsed column, in pixels
const COLLAPSE_AT = 190;  // narrower than this and a column turns into a strip
const START = { widths: [300, 420, 360], collapsed: [false, false, false] };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.widths?.length === 3 && saved?.collapsed?.length === 3) return saved;
  } catch {
    // nothing saved yet, or it is unreadable: use the starting sizes
  }
  return START;
}

// The CSS for the grid: column, handle, column, handle, column. A handle is as wide as the gap between columns.
function templateOf({ widths, collapsed }) {
  const tracks = widths.map((width, i) => (collapsed[i] ? `${STRIP}px` : `${Math.max(1, Math.round(width))}fr`));
  return `${tracks[0]} var(--app-gap) ${tracks[1]} var(--app-gap) ${tracks[2]}`;
}

// The columns of the page (not the handles), left to right.
const columnsIn = (grid) => [...grid.querySelectorAll(':scope > .col')];

// Put a set of widths on the page straight away.
function apply(grid, cols) {
  grid.style.gridTemplateColumns = templateOf(cols);
  columnsIn(grid).forEach((column, i) => column.toggleAttribute('data-collapsed', cols.collapsed[i]));
}

// Where the line between column `index` and the next goes after moving it `dx` pixels.
// `measured` is the width every column has right now. Returns the new { widths, collapsed }.
function moved(cols, measured, index, dx) {
  const total = measured[index] + measured[index + 1];
  let left = Math.min(total - STRIP, Math.max(STRIP, measured[index] + dx));
  let right = total - left;

  // Open columns store the width they have now; a collapsed one keeps the width it had, for when it opens again.
  const widths = cols.widths.map((width, i) => (cols.collapsed[i] ? width : measured[i]));
  const collapsed = [...cols.collapsed];

  if (left < COLLAPSE_AT) {
    collapsed[index] = true;
    collapsed[index + 1] = false;
    right = total - STRIP;
  } else if (right < COLLAPSE_AT) {
    collapsed[index] = false;
    collapsed[index + 1] = true;
    left = total - STRIP;
  } else {
    collapsed[index] = false;
    collapsed[index + 1] = false;
  }
  if (!collapsed[index]) widths[index] = left;
  if (!collapsed[index + 1]) widths[index + 1] = right;
  return { widths, collapsed };
}

// The state for the columns. `grid` is a ref to the page's grid element.
export function useColumns(grid) {
  const [cols, setCols] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cols));
    } catch {
      // the sizes just won't be remembered
    }
  }, [cols]);

  // Mark the collapsed columns on the page (the CSS for a strip reads data-collapsed).
  useLayoutEffect(() => {
    if (grid.current) apply(grid.current, cols);
  }, [cols, grid]);

  // Open a collapsed column again (clicking its strip).
  function open(index) {
    const widths = [...cols.widths];
    widths[index] = Math.max(widths[index], 300);
    const collapsed = [...cols.collapsed];
    collapsed[index] = false;
    setCols({ widths, collapsed });
  }

  const reset = () => setCols(START);

  // A click anywhere on a strip opens that column.
  function onClick(event) {
    const column = event.target.closest('.col[data-collapsed]');
    if (column) open(columnsIn(grid.current).indexOf(column));
  }

  return { cols, setCols, open, reset, onClick, template: templateOf(cols) };
}

// The handle between column `index` and the next. Drag it, or focus it and use the arrow keys. Double-click resets.
export function Resizer({ index, grid, cols, setCols, reset }) {
  // The width of every column right now, in pixels.
  const measure = () => columnsIn(grid.current).map((column) => column.getBoundingClientRect().width);

  function onPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, measured: measure(), cols };
    let latest = cols;
    const root = document.documentElement;
    root.setAttribute('data-resizing', ''); // no animations while dragging, and the cursor stays a resize cursor

    function move(e) {
      latest = moved(start.cols, start.measured, index, e.clientX - start.x);
      apply(grid.current, latest);
    }
    function end() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      root.removeAttribute('data-resizing');
      setCols(latest);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function onKeyDown(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setCols(moved(cols, measure(), index, event.key === 'ArrowLeft' ? -32 : 32));
  }

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize columns"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={reset}
    />
  );
}
