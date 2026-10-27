// CaseOpening.jsx = the case-opening window: a strip of items spins past a marker and slows down onto
// the one you won, like opening a CS:GO case. Which items exist and their odds: cases.js.
//
// It opens (see App.jsx) when every daily is finished for the day and at the task milestones.

import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { ITEMS, RARITIES, addDrop, getDrops, rollItem } from '../cases.js';
import { Modal } from './Modals.jsx';

const CARD = 128; // width of one item card, and the gap between cards
const GAP = 8;
const WIN_AT = 42; // the winning card's place on the strip
const STRIP_LENGTH = 52;

export default function CaseOpening({ onClose }) {
  const win = useMemo(rollItem, []);
  // The strip: random filler items (by the odds), with the winner at WIN_AT.
  const strip = useMemo(() => Array.from({ length: STRIP_LENGTH }, (_, i) => (i === WIN_AT ? win : rollItem())), [win]);

  const view = useRef(null);
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const [owned, setOwned] = useState(0); // how many of the won item you have now
  const saved = useRef(false);

  useEffect(() => {
    if (saved.current) return; // (React may run an effect twice while developing)
    saved.current = true;
    setOwned(addDrop(win));

    // Land somewhere inside the winning card, not always dead centre.
    const centre = view.current.clientWidth / 2;
    const target = -(WIN_AT * (CARD + GAP)) + centre - CARD / 2 + (Math.random() - 0.5) * (CARD - 24);
    const controls = animate(x, target, { duration: 6, ease: [0.08, 0.6, 0.12, 1], onComplete: () => setRevealed(true) });
    return () => controls.stop();
  }, [win, x]);

  const collection = ITEMS.filter((item) => getDrops()[item.id]);

  return (
    <Modal title="Case opened" onClose={onClose} wide>
      <div className="case">
        <p className="hint">{revealed ? 'And the winner is…' : 'A case dropped. Spinning…'}</p>
        <div className="case-view" ref={view}>
          <div className="case-marker" aria-hidden="true" />
          <motion.ul className="case-strip" style={{ x, gap: GAP }} aria-hidden="true">
            {strip.map((item, i) => (
              <li key={i} className="case-card" style={{ '--rarity': item.color, width: CARD }}>
                <span className="case-name">{item.name}</span>
              </li>
            ))}
          </motion.ul>
        </div>
        <div className="case-result" aria-live="polite">
          {revealed && (
            <p style={{ color: win.color }}>
              <b>{win.name}</b> <span className="mono">({RARITIES.find((r) => r.id === win.rarity).name}, you own {owned})</span>
            </p>
          )}
        </div>
        {collection.length > 0 && (
          <details className="case-collection">
            <summary className="mono">Collection ({collection.length}/{ITEMS.length})</summary>
            <ul>
              {collection.map((item) => (
                <li key={item.id} style={{ color: item.color }}>
                  {item.name} <span className="mono">×{getDrops()[item.id]}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Modal>
  );
}
