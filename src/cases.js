// cases.js = the CS:GO-style case drops (see components/CaseOpening.jsx).
//
// A case is earned when every daily is finished for the day, and at the task milestones. Opening one rolls a
// random item with CS:GO's own odds. What you own is kept in the synced `settings` table as
// { drops: { itemId: count }, lastCaseDay }, next to the tasks-completed count (see Tasks.jsx).

import { getState, saveSetting } from './store.js';

const STATS_ID = 'stats';

// Rarity: [id, name shown, colour, chance in %]. The odds are CS:GO's.
export const RARITIES = [
  { id: 'milspec', name: 'Mil-Spec', color: '#4b69ff', chance: 79.92 },
  { id: 'restricted', name: 'Restricted', color: '#8847ff', chance: 15.98 },
  { id: 'classified', name: 'Classified', color: '#d32ce6', chance: 3.2 },
  { id: 'covert', name: 'Covert', color: '#eb4b4b', chance: 0.64 },
  { id: 'rare', name: 'Rare Special', color: '#ffd700', chance: 0.26 },
];

// Every item: [rarity, weapon, skin, art]. `art` picks the picture drawn for it (see Weapon in CaseOpening.jsx).
const ITEM_LIST = [
  ['milspec', 'P250', 'Sand Dune', 'pistol'],
  ['milspec', 'Five-SeveN', 'Forest Night', 'pistol'],
  ['milspec', 'MP9', 'Hot Rod', 'smg'],
  ['milspec', 'SG 553', 'Army Sheen', 'rifle'],
  ['milspec', 'MAC-10', 'Heat', 'smg'],
  ['restricted', 'AK-47', 'Redline', 'rifle'],
  ['restricted', 'Glock-18', 'Water Elemental', 'pistol'],
  ['restricted', 'Desert Eagle', 'Blaze', 'pistol'],
  ['restricted', 'P90', 'Asiimov', 'smg'],
  ['classified', 'AWP', 'Asiimov', 'sniper'],
  ['classified', 'M4A4', 'Neo-Noir', 'rifle'],
  ['covert', 'AK-47', 'Fire Serpent', 'rifle'],
  ['covert', 'AWP', 'Dragon Lore', 'sniper'],
  ['rare', '★ Karambit', 'Doppler', 'karambit'],
  ['rare', '★ Butterfly Knife', 'Fade', 'bayonet'],
  ['rare', '★ Bayonet', 'Crimson Web', 'bayonet'],
];

export const ITEMS = ITEM_LIST.map(([rarity, weapon, skin, art], index) => ({
  ...RARITIES.find((r) => r.id === rarity),
  id: `i${index}`,
  rarity,
  weapon,
  skin,
  art,
  name: `${weapon} | ${skin}`,
}));

// Pick a random item, rarity first (by the odds), then an item of that rarity.
export function rollItem() {
  let roll = Math.random() * RARITIES.reduce((sum, r) => sum + r.chance, 0);
  let rarity = RARITIES[0];
  for (const r of RARITIES) {
    if (roll < r.chance) {
      rarity = r;
      break;
    }
    roll -= r.chance;
  }
  const pool = ITEMS.filter((item) => item.rarity === rarity.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

// The items you own, as { itemId: count }.
export function getDrops() {
  return getState().settings[STATS_ID]?.drops || {};
}

export function addDrop(item) {
  const drops = getDrops();
  saveSetting(STATS_ID, { drops: { ...drops, [item.id]: (drops[item.id] || 0) + 1 } });
  return drops[item.id] ? drops[item.id] + 1 : 1;
}

// Open a case right now, for trying the animation out (the Test button in Settings, shown only on a local copy).
export const testCase = () => window.dispatchEvent(new CustomEvent('todolist:open-case'));

// Ask the app to open a case. `day` (a date string) limits it to once a day, e.g. for "all dailies done".
export function earnCase(day) {
  if (day) {
    if (getState().settings[STATS_ID]?.lastCaseDay === day) return;
    saveSetting(STATS_ID, { lastCaseDay: day });
  }
  window.dispatchEvent(new CustomEvent('todolist:open-case'));
}
