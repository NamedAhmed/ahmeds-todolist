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

// Every item: [rarity, name].
const ITEM_LIST = [
  ['milspec', 'Sticky Note | Faded'],
  ['milspec', 'Pencil Stub | Worn'],
  ['milspec', 'Lukewarm Coffee | Field-Tested'],
  ['milspec', 'Dog-Eared Page | Minimal Wear'],
  ['milspec', 'Paperclip | Bent'],
  ['milspec', 'Eraser Crumbs | Battle-Scarred'],
  ['restricted', 'Highlighter | Neon'],
  ['restricted', 'Mechanical Keyboard | Clacky'],
  ['restricted', 'Desk Plant | Overwatered'],
  ['restricted', 'Stapler | Jammed'],
  ['classified', 'Planner | Color-Coded'],
  ['classified', 'Headphones | Deep Focus'],
  ['covert', 'Inbox Zero | Factory New'],
  ['covert', 'Flow State | StatTrak™'],
  ['rare', '★ Procrastination Knife | Fade'],
  ['rare', '★ Gloves | Productivity'],
];

export const ITEMS = ITEM_LIST.map(([rarity, name], index) => ({ ...RARITIES.find((r) => r.id === rarity), id: `i${index}`, rarity, name }));

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

// Ask the app to open a case. `day` (a date string) limits it to once a day, e.g. for "all dailies done".
export function earnCase(day) {
  if (day) {
    if (getState().settings[STATS_ID]?.lastCaseDay === day) return;
    saveSetting(STATS_ID, { lastCaseDay: day });
  }
  window.dispatchEvent(new CustomEvent('todolist:open-case'));
}
