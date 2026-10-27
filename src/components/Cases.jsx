// Cases.jsx = the Cases menu, laid out like CS:GO's container screens.
//
//   Cases tab       every case, with how many you own; pick one to see what could be inside it
//   a case          "Unlock Container": the case, the skins that might be in it, and the Open button
//   opening         a strip of skins spins past a marker and slows onto the one you won, which is then shown big
//   Inventory tab   every skin you have won
//
// Cases drop when every daily is finished for the day and at task milestones (cases.js). The list of cases and
// skins is cases-catalog.json; the pictures are loaded from Steam's image servers, never stored in this project.
// If a picture can't load (you are offline) its card just shows the name.

import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { useStore } from '../store.js';
import { RARITIES, addCase, addDrop, getCases, getDrops, loadCatalog, pictureUrl, rollItem, tiersOf } from '../cases.js';
import Icon from './Icons.jsx';
import { Modal } from './Modals.jsx';

const CARD = 164; // width of one skin card in the spinning strip (keep in step with .case-strip .case-card in app.css), and the gap
const GAP = 6;
const WIN_AT = 42; // the winning card's place on the strip
const STRIP_LENGTH = 52;

// "AK-47 | Redline" -> ["AK-47", "Redline"]; a vanilla knife has no skin name.
const splitName = (name) => {
  const [weapon, ...skin] = name.split(' | ');
  return [weapon, skin.join(' | ')];
};

// A skin's picture. If it can't load, the card shows the name instead.
function Picture({ src, name }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className="case-missing">{name}</span>;
  return <img className="case-art" src={src} alt={name} loading="lazy" draggable="false" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

// One skin card: its picture, a rarity stripe along the bottom, and (optionally) its name.
function SkinCard({ catalog, item, named, big, count }) {
  const [weapon, skin] = splitName(item.name);
  return (
    <li className={'case-card' + (big ? ' big' : '')} style={{ '--rarity': RARITIES[item.rarity].color }}>
      <Picture src={pictureUrl(catalog, item.image, '256fx192f')} name={item.name} />
      {named && (
        <>
          <span className="case-weapon">{weapon}</span>
          {skin && <span className="case-skin">{skin}</span>}
        </>
      )}
      {count > 1 && <span className="case-count mono">×{count}</span>}
    </li>
  );
}


// ======================================================================
// OPENING: the spinning strip, then the prize
// ======================================================================
function Opening({ catalog, crate, onDone }) {
  const tiers = useMemo(() => tiersOf(crate), [crate]);
  const win = useMemo(() => rollItem(tiers), [tiers]);
  // The strip: random skins of this case (by the odds), with the winner at WIN_AT.
  const strip = useMemo(() => Array.from({ length: STRIP_LENGTH }, (_, i) => (i === WIN_AT ? win : rollItem(tiers))), [tiers, win]);

  const view = useRef(null);
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState(false);
  const [owned, setOwned] = useState(0); // how many of the won skin you have now
  const saved = useRef(false);

  // Keep the skin (once, even if React runs the effect twice while developing).
  useEffect(() => {
    if (saved.current) return;
    saved.current = true;
    setOwned(addDrop(win));
  }, [win]);

  // Spin the strip and land somewhere inside the winning card, not always dead centre.
  useEffect(() => {
    const centre = view.current.clientWidth / 2;
    const target = -(WIN_AT * (CARD + GAP)) + centre - CARD / 2 + (Math.random() - 0.5) * (CARD - 36);
    const controls = animate(x, target, { duration: 7, ease: [0.08, 0.6, 0.12, 1] });
    let live = true;
    controls.then(() => live && setRevealed(true));
    return () => {
      live = false;
      controls.stop();
    };
  }, [x]);

  const rarity = RARITIES[win.rarity];
  return (
    <div className="case">
      <p className="case-heading mono">{revealed ? 'You received' : 'Opening container…'}</p>
      <div className={'case-view' + (revealed ? ' done' : '')} ref={view}>
        <div className="case-marker" aria-hidden="true" />
        <motion.ul className="case-strip" style={{ x, gap: GAP }} aria-hidden="true">
          {strip.map((item, i) => (
            <SkinCard key={i} catalog={catalog} item={item} />
          ))}
        </motion.ul>
      </div>

      <div className="case-result" aria-live="polite">
        {revealed && (
          <>
            <ul className="case-reveal">
              <SkinCard catalog={catalog} item={win} big />
            </ul>
            <p className="case-won" style={{ color: rarity.color }}>
              {win.name}
            </p>
            <p className="mono case-meta">
              {rarity.name} · you own {owned}
            </p>
            <button type="button" className="btn-ghost" onClick={onDone}>
              Back to cases
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// ======================================================================
// A CASE: "Unlock Container"
// ======================================================================
function Unlock({ catalog, crate, owned, onOpen, onBack }) {
  const tiers = useMemo(() => tiersOf(crate), [crate]);
  const shown = [3, 2, 1, 0].flatMap((rarity) => tiers[rarity]); // the best skins first
  return (
    <div className="case">
      <p className="case-heading mono">Unlock Container</p>
      <p className="case-sub">
        Unlock <b>{crate.name}</b>
      </p>
      <img className="case-hero" src={pictureUrl(catalog, crate.image, '360fx360f')} alt={crate.name} referrerPolicy="no-referrer" />
      <p className="case-note mono">This container can only be opened once · you own {owned}</p>

      <p className="case-list-title mono">Items that might be in this container:</p>
      <ul className="case-grid">
        {shown.map((item) => (
          <SkinCard key={item.id} catalog={catalog} item={item} named />
        ))}
        {tiers[4].length > 0 && (
          <li className="case-card gold" style={{ '--rarity': RARITIES[4].color }}>
            <span className="case-star">★</span>
            <span className="case-weapon">Rare Special Item</span>
            <span className="case-skin">Knife or gloves</span>
          </li>
        )}
      </ul>

      <div className="case-actions">
        <button type="button" className="btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-add" disabled={!owned} onClick={onOpen} title={owned ? '' : 'You have none of these yet'}>
          Open container
        </button>
      </div>
    </div>
  );
}


// ======================================================================
// THE MENU
// ======================================================================
// Props: onClose, initialCase (the id of a case that just dropped: its Unlock screen opens straight away).
export default function Cases({ onClose, initialCase }) {
  useStore(); // re-draw when what you own changes
  const [catalog, setCatalog] = useState(null);
  const [tab, setTab] = useState('cases'); // 'cases' | 'inventory'
  const [crateId, setCrateId] = useState(initialCase ?? null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    loadCatalog().then(setCatalog);
  }, []);

  const crate = catalog && crateId ? catalog.cases.find((c) => c.id === crateId) : null;
  const owned = getCases();
  const drops = getDrops();

  // Every skin in every case by name, to show your inventory.
  const skinsByName = useMemo(() => {
    const map = new Map();
    for (const c of catalog?.cases || []) for (const tier of tiersOf(c)) for (const item of tier) map.set(item.id, item);
    return map;
  }, [catalog]);

  function open() {
    addCase(crate.id, -1); // the case is used up
    setOpening(true);
  }

  let body;
  if (!catalog) {
    body = <p className="hint">Loading the cases…</p>;
  } else if (crate && opening) {
    body = <Opening catalog={catalog} crate={crate} onDone={() => (setOpening(false), setCrateId(null))} />;
  } else if (crate) {
    body = <Unlock catalog={catalog} crate={crate} owned={owned[crate.id] || 0} onOpen={open} onBack={() => setCrateId(null)} />;
  } else if (tab === 'inventory') {
    const items = Object.entries(drops)
      .map(([id, count]) => ({ item: skinsByName.get(id), count }))
      .filter((entry) => entry.item)
      .sort((a, b) => b.item.rarity - a.item.rarity);
    body = items.length ? (
      <ul className="case-grid">
        {items.map(({ item, count }) => (
          <SkinCard key={item.id} catalog={catalog} item={item} named count={count} />
        ))}
      </ul>
    ) : (
      <p className="hint">Nothing yet. Finish all your dailies and a case will drop.</p>
    );
  } else {
    body = (
      <>
        {import.meta.env.DEV && (
          <p className="hint">
            Local test:{' '}
            <button type="button" className="link-button" onClick={() => catalog.cases.forEach((c) => addCase(c.id))}>
              give me one of every case
            </button>
          </p>
        )}
        <ul className="case-shelf">
          {catalog.cases.map((c) => (
            <li key={c.id}>
              <button type="button" className={'case-pick' + (owned[c.id] ? ' owned' : '')} onClick={() => setCrateId(c.id)}>
                <img src={pictureUrl(catalog, c.image, '128fx128f')} alt="" loading="lazy" draggable="false" referrerPolicy="no-referrer" />
                <span className="case-pick-name">{c.name}</span>
                {owned[c.id] > 0 && <span className="case-count mono">×{owned[c.id]}</span>}
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const inScreen = crate || opening;
  return (
    <Modal title="Cases" onClose={onClose} wide>
      {!inScreen && (
        <div className="tabs" role="tablist">
          {[
            ['cases', 'Cases', 'box'],
            ['inventory', 'Inventory', 'task'],
          ].map(([id, label, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={'tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>
              <Icon name={icon} size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      {body}
    </Modal>
  );
}
