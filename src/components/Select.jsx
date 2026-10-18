// Select.jsx = a drop-down list that looks like the rest of the app.
// The browser's own <select> opens a list drawn by the operating system (pale blue highlight,
// no pictures), which can't be restyled, so this one is made from buttons.
//
// Props:
//   value     the chosen option's value
//   groups    [{ label (optional heading), options: [{ value, label, thumb (optional picture) }] }]
//   onChange  called with the new value
//
// A thumb is either an address of a picture, or the id of a picture you added ('upload:...' or 'photo:...').

import { useEffect, useRef, useState } from 'react';
import { NO_PICTURE, useMediaUrl } from '../appearance.js';

// The small picture in front of an option.
function Thumb({ thumb }) {
  const isId = typeof thumb === 'string' && /^(upload|photo):/.test(thumb);
  const url = useMediaUrl(isId ? thumb : NO_PICTURE); // (a hook can't be called "sometimes", so it always runs)
  const src = isId ? url : thumb;
  if (!src) return <span className="dropdown-thumb empty" aria-hidden="true" />;
  return <img className="dropdown-thumb" src={src} alt="" loading="lazy" />;
}

export default function Select({ value, groups, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  const options = groups.flatMap((group) => group.options);
  const current = options.find((option) => String(option.value) === String(value)) ?? options[0];

  // While open: a click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (!root.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function choose(option) {
    onChange(option.value);
    setOpen(false);
    root.current.querySelector('.select')?.focus(); // keep keyboard users where they were
  }

  // Keyboard: Escape closes just this list (not the whole Settings window), and the arrow keys
  // move between the options.
  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      root.current.querySelector('.select')?.focus();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }
    const buttons = [...root.current.querySelectorAll('.dropdown-option')];
    const index = buttons.indexOf(document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[Math.max(0, Math.min(buttons.length - 1, index + step))]?.focus();
  }

  return (
    <div className="dropdown" ref={root} onKeyDown={onKeyDown}>
      <button type="button" className="select" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        {current?.thumb && <Thumb thumb={current.thumb} />}
        <span className="dropdown-label">{current?.label}</span>
      </button>

      {open && (
        <div className="dropdown-list" role="listbox">
          {groups.map((group, index) => (
            <div key={group.label ?? index}>
              {group.label && <div className="dropdown-group">{group.label}</div>}
              {group.options.map((option) => {
                const picked = option === current;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={picked}
                    className={'dropdown-option' + (picked ? ' picked' : '')}
                    onClick={() => choose(option)}
                  >
                    {option.thumb !== undefined && <Thumb thumb={option.thumb} />}
                    <span className="dropdown-label">{option.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
