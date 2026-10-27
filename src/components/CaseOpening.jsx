// CaseOpening.jsx = the case-opening window, laid out like the CS:GO "unlock container" screen: a strip of
// weapon cards spins past a marker and slows onto the one you won, which is then shown big.
// Which items exist and their odds: cases.js.
//
// It opens (see App.jsx) when every daily is finished for the day and at the task milestones.

import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { ITEMS, RARITIES, addDrop, getDrops, rollItem } from '../cases.js';
import { Modal } from './Modals.jsx';

const CARD = 148; // width of one item card (keep in step with .case-card in app.css), and the gap between cards
const GAP = 6;
const WIN_AT = 42; // the winning card's place on the strip
const STRIP_LENGTH = 52;

// The weapon pictures, as flat silhouettes on a 160 x 70 canvas (drawn in the card's colour).
const ART = {
  pistol: 'M18 20H116a4 4 0 0 1 4 4V34H64L58 42H50L54 62a3 3 0 0 1-3 3H39a3 3 0 0 1-3-2.5L27 34H18ZM120 24H134V32H120Z',
  smg: 'M6 28H26V24H98V38H66V60H56V38H42L38 54H28L30 38H26V34H6ZM98 29H134V33H98Z',
  rifle: 'M6 28L40 25V37L14 44L6 40ZM40 24H90V37H40ZM90 26H120V34H90ZM120 28H156V32H120ZM148 23H153V28H148ZM62 37H76L82 60H69ZM43 37H53L49 56H41Z',
  sniper: 'M4 30L44 28V40L12 47L4 43ZM44 28H106V38H44ZM106 30H158V34H106ZM54 17H98V25H54ZM60 25H65V28H60ZM88 25H93V28H88ZM47 38H55L51 54H43ZM74 24L80 19V24Z',
  karambit: 'M20 32Q66 0 128 12Q98 20 92 60Q86 38 52 38L38 42ZM30 40a7 7 0 1 0 .1 0ZM30 44a3 3 0 1 1-.1 0Z',
  bayonet: 'M44 30L142 24L154 36L44 38ZM6 28H40V40H6ZM40 22H47V46H40Z',
};

function Weapon({ item }) {
  return (
    <svg className="case-art" viewBox="0 0 160 70" aria-hidden="true">
      <path d={ART[item.art]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// One card, as it appears in the strip and in the big result.
function Card({ item, big }) {
  return (
    <li className={'case-card' + (big ? ' big' : '')} style={{ '--rarity': item.color }}>
      <Weapon item={item} />
      <span className="case-weapon">{item.weapon}</span>
      <span className="case-skin">{item.skin}</span>
    </li>
  );
}

export default function CaseOpening({ onClose }) {
  const win = useMemo(rollItem, []);
  // The strip: random filler items (by the odds), with the winner at WIN_AT.
  const strip = useMemo(() => Array.from({ length: STRIP_LENGTH }, (_, i) => (i === WIN_AT ? win : rollItem())), [win]);

  const view = useRef(null);
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const [owned, setOwned] = useState(0); // how many of the won item you have now
  const saved = useRef(false);

  // Keep the item (once, even if React runs the effect twice while developing).
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    setOwned(addDrop(win));
  }, [win]);

  // Spin the strip and land somewhere inside the winning card, not always dead centre.
  useEffect(() => {
    const centre = view.current.clientWidth / 2;
    const target = -(WIN_AT * (CARD + GAP)) + centre - CARD / 2 + (Math.random() - 0.5) * (CARD - 30);
    const controls = animate(x, target, { duration: 6.5, ease: [0.08, 0.6, 0.12, 1] });
    let live = true;
    controls.then(() => live && setRevealed(true));
    return () => {
      live = false;
      controls.stop();
    };
  }, [x]);

  const collection = ITEMS.filter((item) => getDrops()[item.id]);
  const rarity = RARITIES.find((r) => r.id === win.rarity);

  return (
    <Modal title="Unlock container" onClose={onClose} wide>
      <div className="case">
        <p className="case-title mono">{revealed ? 'You received' : 'Opening container…'}</p>
        <div className={'case-view' + (revealed ? ' done' : '')} ref={view}>
          <div className="case-marker" aria-hidden="true" />
          <motion.ul className="case-strip" style={{ x, gap: GAP }} aria-hidden="true">
            {strip.map((item, i) => (
              <Card key={i} item={item} />
            ))}
          </motion.ul>
        </div>

        <div className="case-result" aria-live="polite">
          {revealed && (
            <>
              <ul className="case-reveal">
                <Card item={win} big />
              </ul>
              <p className="case-won" style={{ color: win.color }}>
                {win.name}
              </p>
              <p className="mono case-meta">
                {rarity.name} · you own {owned}
              </p>
            </>
          )}
        </div>

        {collection.length > 0 && (
          <details className="case-collection">
            <summary className="mono">
              Collection ({collection.length}/{ITEMS.length})
            </summary>
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
