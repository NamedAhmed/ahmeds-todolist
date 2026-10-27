// import-cases.mjs = builds src/cases-catalog.json, the list of CS:GO weapon cases the Cases menu uses.
//
//   node scripts/import-cases.mjs
//
// The data comes from the community-run CSGO-API (github.com/ByMykel/CSGO-API). Only names, rarities and image
// addresses are kept: the pictures themselves are NOT copied into this project, the app loads them from Steam's
// image servers when a case is shown (see components/Cases.jsx). Each case is
//   { id, name, image, items: [[name, rarity, image], ...], rare: [[name, image], ...] }
// where rarity is 0 Mil-Spec, 1 Restricted, 2 Classified, 3 Covert, and `rare` are the gold knives and gloves.

import { writeFileSync } from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';
const PREFIX = 'https://community.akamai.steamstatic.com/economy/image/';
const RARITY = { 'Mil-Spec Grade': 0, Restricted: 1, Classified: 2, Covert: 3 };

// Steam image addresses all start the same way, so the start is dropped to keep the file small.
const short = (url) => (url?.startsWith(PREFIX) ? url.slice(PREFIX.length) : url);

const crates = await (await fetch(SOURCE)).json();
const cases = crates
  .filter((crate) => crate.type === 'Case' && crate.image && crate.contains?.length)
  .map((crate) => ({
    id: crate.id,
    name: crate.name,
    image: short(crate.image),
    items: crate.contains.filter((item) => item.image && item.rarity.name in RARITY).map((item) => [item.name, RARITY[item.rarity.name], short(item.image)]),
    rare: (crate.contains_rare || []).filter((item) => item.image).map((item) => [item.name, short(item.image)]),
  }));

writeFileSync(new URL('../src/cases-catalog.json', import.meta.url), JSON.stringify({ prefix: PREFIX, cases }));
console.log(`${cases.length} cases, ${cases.reduce((n, c) => n + c.items.length + c.rare.length, 0)} items`);
