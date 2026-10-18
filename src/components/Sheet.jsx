// Sheet.jsx = a panel that slides up from the bottom of the screen (used for Settings).
//
// Unlike a pop-up window (Modal in Modals.jsx), a sheet has NO dark overlay and does not block the page.
// The page above it gets SHORTER (it keeps its full width and its content reflows) to fit in the room that
// is left, so you can see it change while you change a theme, font or wallpaper. (This file sets
// --sheet-offset and data-sheet on the page; the CSS that shortens it is under "THE PAGE GETS SHORTER" in
// appearance.css.)
//
// You can drag the handle at the top to make it taller or shorter (the height is remembered),
// and the arrow keys do the same when the handle has focus. Escape closes it.
//
// Props: title, tabs (the tab buttons shown beside the title), onClose, children (the content).

import { useEffect, useRef, useState } from 'react';
import { motion, useIsPresent } from 'motion/react';
import Icon from './Icons.jsx';

const HEIGHT_KEY = 'todolist:sheet-height';
const MIN_HEIGHT = 170;

// Keep the height between a minimum and 70% of the window (taller than that and too little of the page would be left).
function clampHeight(height) {
  return Math.min(Math.round(window.innerHeight * 0.7), Math.max(MIN_HEIGHT, height));
}

// The remembered height, or 46% of the window the first time.
function startingHeight() {
  try {
    const saved = Number(localStorage.getItem(HEIGHT_KEY));
    if (saved) return clampHeight(saved);
  } catch {
    // storage unavailable: use the default
  }
  return clampHeight(Math.round(window.innerHeight * 0.46));
}

export default function Sheet({ title, tabs, onClose, children }) {
  const [height, setHeight] = useState(startingHeight);
  const dragging = useRef(false);

  // Tell the page how tall the sheet is, so the page can make itself that much shorter.
  useEffect(() => {
    document.documentElement.style.setProperty('--sheet-offset', height + 'px');
  }, [height]);

  // While the sheet is open the page wears data-sheet; when it closes, everything goes back to normal.
  // When you press Close the sheet stays in the page for a moment while it slides away (isPresent turns false
  // straight away). The page starts growing back at that same moment, so the two move together.
  const isPresent = useIsPresent();
  useEffect(() => {
    const root = document.documentElement;
    if (isPresent) root.setAttribute('data-sheet', '');
    else {
      root.removeAttribute('data-sheet');
      root.removeAttribute('data-sheet-dragging');
    }
  }, [isPresent]);
  useEffect(() => {
    return () => {
      const root = document.documentElement;
      root.removeAttribute('data-sheet');
      root.removeAttribute('data-sheet-dragging');
      root.style.removeProperty('--sheet-offset');
    };
  }, []);

  // Escape closes the sheet. (A drop-down list that is open stops the key first, so it only closes the list.)
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function remember(value) {
    try {
      localStorage.setItem(HEIGHT_KEY, String(value));
    } catch {
      // the height just won't be remembered
    }
  }

  // Dragging the handle: the sheet's top edge follows the pointer.
  function startDrag(event) {
    dragging.current = true;
    document.documentElement.setAttribute('data-sheet-dragging', ''); // so the page follows the pointer without lag
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event) {
    if (dragging.current) setHeight(clampHeight(window.innerHeight - event.clientY));
  }
  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    document.documentElement.removeAttribute('data-sheet-dragging');
    remember(height);
  }

  // Keyboard: arrow up makes it taller, arrow down shorter.
  function onHandleKey(event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = clampHeight(height + (event.key === 'ArrowUp' ? 40 : -40));
    setHeight(next);
    remember(next);
  }

  return (
    <motion.section
      className="sheet"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={{ height }}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    >
      <div
        className="sheet-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize settings"
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onHandleKey}
      >
        <span />
      </div>

      <header className="sheet-head">
        <h2>{title}</h2>
        {tabs}
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="x" size={16} />
        </button>
      </header>

      <div className="sheet-body">{children}</div>
    </motion.section>
  );
}
