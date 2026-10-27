// cases.js = the CS:GO case drops (the Cases menu is components/Cases.jsx).
//
// A case is earned when every daily is finished for the day, and at the task milestones. Opening one rolls a
// random skin with CS:GO's own odds. What you own is kept in the synced `settings` table, next to the
// tasks-completed count (see Tasks.jsx):  { cases: { caseId: count }, drops: { "AK-47 | Redline": count }, lastCaseDay }
//
// The list of cases is src/cases-catalog.json (made by scripts/import-cases.mjs). It is big, so it is only
// loaded when needed.

import { getState, saveSetting } from './store.js';

const STATS_ID = 'stats';

// Rarity: the colour and the chance in %. The odds are CS:GO's; index 4 is the gold knife or gloves.
export const RARITIES = [
  { name: 'Mil-Spec', color: '#4b69ff', chance: 79.92 },
  { name: 'Restricted', color: '#8847ff', chance: 15.98 },
  { name: 'Classified', color: '#d32ce6', chance: 3.2 },
  { name: 'Covert', color: '#eb4b4b', chance: 0.64 },
  { name: 'Rare Special Item', color: '#ffd700', chance: 0.26 },
];

// ---- The catalog ----
let loading;
export function loadCatalog() {
  loading ??= import('./cases-catalog.json').then((module) => module.default);
  return loading;
}

// A Steam image address from the catalog's short form, at a size (e.g. '256fx192f').
export const pictureUrl = (catalog, path, size) => (path ? `${catalog.prefix}${path}/${size}` : '');

// One case's skins, as { id, name, rarity, image }, grouped by rarity: tiers[0] is Mil-Spec ... tiers[4] the gold ones.
export function tiersOf(crate) {
  const tiers = [[], [], [], [], []];
  for (const [name, rarity, image] of crate.items) tiers[rarity].push({ id: name, name, rarity, image });
  for (const [name, image] of crate.rare) tiers[4].push({ id: name, name, rarity: 4, image });
  return tiers;
}

// Pick a random skin from a case: the rarity first (by the odds, among the rarities this case has), then a skin of it.
export function rollItem(tiers) {
  const present = RARITIES.map((rarity, index) => ({ index, chance: tiers[index].length ? rarity.chance : 0 }));
  let roll = Math.random() * present.reduce((sum, tier) => sum + tier.chance, 0);
  let picked = present.find((tier) => tier.chance > 0);
  for (const tier of present) {
    if (roll < tier.chance) {
      picked = tier;
      break;
    }
    roll -= tier.chance;
  }
  const pool = tiers[picked.index];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- What you own ----
export const getCases = () => getState().settings[STATS_ID]?.cases || {};
export const getDrops = () => getState().settings[STATS_ID]?.drops || {};

export function addCase(id, by = 1) {
  const cases = getCases();
  saveSetting(STATS_ID, { cases: { ...cases, [id]: Math.max(0, (cases[id] || 0) + by) } });
}

export function addDrop(item) {
  const drops = getDrops();
  const count = (drops[item.id] || 0) + 1;
  saveSetting(STATS_ID, { drops: { ...drops, [item.id]: count } });
  return count;
}

// You earned a case: give a random one and tell the app (App.jsx opens the Cases menu on it).
// `day` (a date string) limits it to once a day, e.g. for "all dailies done".
export async function earnCase(day) {
  if (day) {
    if (getState().settings[STATS_ID]?.lastCaseDay === day) return;
    saveSetting(STATS_ID, { lastCaseDay: day });
  }
  const { cases } = await loadCatalog();
  const crate = cases[Math.floor(Math.random() * cases.length)];
  addCase(crate.id);
  window.dispatchEvent(new CustomEvent('todolist:case-earned', { detail: crate.id }));
}

// The "give me a case" button in Settings, shown only on a local copy (npm run dev).
export const testCase = () => earnCase();
