// TabBar.jsx = the floating bottom bar on a phone, in the style of Apple's Liquid Glass tab bar.
//
// A lens of lighter glass sits behind the selected tab. Press anywhere on the bar and the lens swells and
// follows your finger, the tab under it is selected as you pass, and when you let go it springs to rest on
// the tab you ended on. A plain tap does the same thing in one step.
//
// Props: tabs ([id, label, icon] each), tab (the selected id), setTab, settingsOpen, openSettings.
// It is docked to the bottom edge with a label under each icon, and slides away while a text field has focus.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import Icon from './Icons.jsx';

const SPRING = { type: 'spring', stiffness: 520, damping: 36, mass: 0.8 };

export default function TabBar({ tabs, tab, setTab, settingsOpen, openSettings }) {
  const nav = useRef(null);
  const x = useMotionValue(0);
  const [lens, setLens] = useState({ width: 0 }); // the lens is as wide as one button
  const [pressed, setPressed] = useState(false);
  const drag = useRef({ active: false, moved: false, startX: 0 });
  const placed = useRef(false);

  // Where the selected button is, as an offset inside the bar.
  const restingX = useCallback(() => {
    const button = nav.current?.querySelector('button.active');
    return button ? { x: button.offsetLeft, width: button.offsetWidth } : null;
  }, []);

  // Move the lens to the selected button: instantly the first time, then with a spring.
  const settle = useCallback(() => {
    const spot = restingX();
    if (!spot || !spot.width) return;
    setLens((old) => (old.width === spot.width ? old : { width: spot.width }));
    if (!placed.current) {
      placed.current = true;
      x.set(spot.x);
    } else if (!drag.current.active) {
      animate(x, spot.x, SPRING);
    }
  }, [restingX, x]);

  useLayoutEffect(settle, [settle, tab, settingsOpen]);

  // Typing: the keyboard needs the room, so the bar slides away until the field loses focus.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (element) => element?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element?.tagName ?? '');
    const update = () => setTyping(isField(document.activeElement) && !document.activeElement.closest('.sheet'));
    const later = () => setTimeout(update, 0); // after the focus has moved on
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, []);
  useEffect(() => {
    window.addEventListener('resize', settle);
    return () => window.removeEventListener('resize', settle);
  }, [settle]);

  // The tab button under the finger, or null.
  function buttonAt(event) {
    return document.elementFromPoint(event.clientX, event.clientY)?.closest('button[data-tab]');
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const bar = nav.current.getBoundingClientRect();
    drag.current = { active: true, moved: false, startX: event.clientX, bar };
    setPressed(true);
  }

  function onPointerMove(event) {
    const state = drag.current;
    if (!state.active) return;
    if (!state.moved && Math.abs(event.clientX - state.startX) < 6) return;
    state.moved = true;
    // The lens follows the finger, staying inside the bar.
    const first = nav.current.querySelector('button');
    const last = nav.current.querySelector('button:last-of-type');
    const min = first.offsetLeft;
    const max = last.offsetLeft;
    x.set(Math.min(max, Math.max(min, event.clientX - state.bar.left - lens.width / 2)));
    const id = buttonAt(event)?.dataset.tab;
    if (id && id !== tab) setTab(id);
  }

  function onPointerEnd() {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    setPressed(false);
    if (!state.moved) return; // a tap: the button's own click does the rest
    settle(); // the lens springs to rest on the tab you ended on
    // The click that follows a drag must not undo it.
    setTimeout(() => {
      state.moved = false;
    }, 0);
  }

  function choose(id) {
    if (drag.current.moved) return;
    setTab(id);
  }

  return (
    <nav
      ref={nav}
      className="tabbar"
      data-pressed={pressed || undefined}
      data-hidden={typing || undefined}
      aria-label="Sections"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <motion.i className="tabbar-lens" aria-hidden="true" style={{ x, width: lens.width }} animate={{ scale: pressed ? 1.14 : 1 }} transition={SPRING} />
      {tabs.map(([id, label, icon]) => (
        <button key={id} data-tab={id} className={tab === id && !settingsOpen ? 'active' : ''} onClick={() => choose(id)} aria-label={label} title={label}>
          <Icon name={icon} size={22} />
          <span className="tab-label">{label}</span>
        </button>
      ))}
      <button
        className={'settings-tab' + (settingsOpen ? ' active' : '')}
        onClick={() => !drag.current.moved && openSettings()}
        aria-label="Settings"
        title="Settings"
      >
        <Icon name="sliders" size={22} />
        <span className="tab-label">Settings</span>
      </button>
    </nav>
  );
}
