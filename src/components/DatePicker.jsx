// DatePicker.jsx = the window for choosing a due date (it replaces the phone's own date picker,
// which can't be styled). Quick answers on top, a month to tap below.
//
// Props:
//   value    the current date ("2026-10-18") or null for "no date"
//   today    today's date
//   onPick   called with the chosen date, or null for "no date"
//   time     the current time of day ("17:00") or null, and onTime(time | null) called when it is changed
//            (leave both out for a date-only picker)
//   onClose  called to close the window (it is also called right after a pick)

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modals.jsx';
import Icon from './Icons.jsx';
import { DOW, addDays, toDate, ymd } from '../lib.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The days to draw for one month: blanks first so the 1st lands under the right weekday.
function monthCells(year, month) {
  const blanks = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  const cells = Array(blanks).fill(null);
  for (let day = 1; day <= length; day++) cells.push(ymd(new Date(year, month, day)));
  return cells;
}

export default function DatePicker({ value, today, onPick, onClose, time = null, onTime }) {
  const start = toDate(value || today);
  const [year, setYear] = useState(start.getFullYear());
  const [month, setMonth] = useState(start.getMonth());

  function pick(date) {
    onPick(date);
    onClose();
  }

  // The arrows step one month; December wraps to January of the next year.
  function step(direction) {
    const next = new Date(year, month + direction, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  // "Next week" = the coming Monday.
  const nextMonday = addDays(today, ((8 - toDate(today).getDay()) % 7) || 7);
  const quick = [
    ['Today', today],
    ['Tomorrow', addDays(today, 1)],
    ['Next week', nextMonday],
  ];

  // It is drawn at the end of the page (a portal), not inside the row or form that opened it: otherwise its
  // buttons would count as that form's buttons, and clicks and keys would also reach the row's own handlers
  // (rename, drag, shortcuts). The wrapper stops those events here. That also keeps Escape from the window's own
  // handler (it listens on the page), so Escape is handled right here: it closes the picker.
  const stop = (event) => {
    event.stopPropagation();
    if (event.type === 'keydown' && event.key === 'Escape') onClose();
  };

  return createPortal(
    <div className="dp-root" onKeyDown={stop} onClick={stop} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop}>
    <Modal title="Due date" onClose={onClose}>
      <div className="dp-quick">
        {quick.map(([label, date]) => (
          <button key={label} type="button" className={'chip' + (value === date ? ' solid' : '')} onClick={() => pick(date)}>
            {label}
          </button>
        ))}
        <button type="button" className={'chip' + (value === null ? ' solid' : '')} onClick={() => pick(null)}>
          <Icon name="infinity" size={14} /> No date
        </button>
      </div>

      <div className="dp-month">
        <button type="button" className="btn-ghost" onClick={() => step(-1)} aria-label="Previous month">
          <Icon name="chevronUp" size={16} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <span className="dp-title">
          {MONTHS[month]} {year}
        </span>
        <button type="button" className="btn-ghost" onClick={() => step(1)} aria-label="Next month">
          <Icon name="chevronUp" size={16} style={{ transform: 'rotate(90deg)' }} />
        </button>
      </div>

      <div className="dp-grid">
        {DOW.map((name) => (
          <span key={name} className="dp-dow mono">
            {name[0]}
          </span>
        ))}
        {monthCells(year, month).map((date, index) =>
          date ? (
            <button
              key={date}
              type="button"
              className={'dp-day' + (date === value ? ' on' : '') + (date === today ? ' today' : '')}
              onClick={() => pick(date)}
              aria-label={toDate(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={date === value}
            >
              {toDate(date).getDate()}
            </button>
          ) : (
            <span key={'blank' + index} />
          )
        )}
      </div>

      {onTime && (
        <div className="dp-time">
          <label>
            <span className="mono">At</span>
            <input type="time" value={time || ''} onChange={(event) => onTime(event.target.value || null)} aria-label="Time of day" />
          </label>
          {time && (
            <button type="button" className="btn-ghost" onClick={() => onTime(null)}>
              No time
            </button>
          )}
        </div>
      )}
    </Modal>
    </div>,
    document.body
  );
}
