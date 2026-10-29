// import-lively.mjs = copies wallpapers out of your Lively Wallpaper library into this app.
//
// What it does:
//   1. Looks in your Lively library folder for wallpapers that are web pages (Type 1 in LivelyInfo.json).
//   2. Copies each one into public/lively/<name>/ (leaving out things the app doesn't need).
//   3. Writes src/wallpapers/catalog.json: the list the Wallpapers tab in Settings shows,
//      with each wallpaper's title, author, licence and the settings Lively lets you change.
//
// Run it from the project folder:
//   node scripts/import-lively.mjs                     imports the wallpapers listed in WANTED below
//   node scripts/import-lively.mjs --title "Matrix Rain Customizable"    imports that one too
//   node scripts/import-lively.mjs --all               imports every web wallpaper in the library
//   node scripts/import-lively.mjs --library "D:\path\to\wallpapers"      if your library is somewhere else
//
// LICENCES: each wallpaper has its own licence (see its licence file in public/lively/<name>/).
// Only publish wallpapers you are allowed to. The defaults below all carry open licences.
// Rain is Creative Commons BY-NC-SA: fine for a personal, non-commercial app, with credit.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LIBRARY =
  'C:\\Users\\Ahmed\\AppData\\Local\\Packages\\12030rocksdanister.LivelyWallpaper_97hta09mmv6hy\\LocalCache\\Local\\Lively Wallpaper\\Library\\wallpapers';

// The wallpapers imported by default (matched by the Title in LivelyInfo.json).
const WANTED = ['Rain', 'Triangles & Light', 'Fluids', 'The Hill'];

// Settings whose starting value is changed from Lively's default, because outside Lively a wallpaper can
// otherwise look broken. (Fluids waits for the mouse unless "Random Splats" is on, so it starts black.)
// Format: { 'wallpaper-id': { settingName: startingValue } }
// (Rain's own photos are not copied, because the app's built-in photos are the same ones. They are
// picked as "photo:<name>", see src/wallpapers/pictures.js.)
const DEFAULT_OVERRIDES = { fluids: { randomSplats: true }, rain: { mediaSelect: 'photo:misty-mountain' } };

// Wallpapers you can see through (their background is transparent), so a picture can be put under them.
// They get a "Picture behind" setting in the app. Format: { 'wallpaper-id': { seeThrough: true } }
const EXTRAS = { 'triangles-light': { seeThrough: true } };

// Folders that are not copied, for particular wallpapers. { 'wallpaper-id': ['folder name'] }
const SKIP_FOLDERS = { rain: ['media'] };

// Files that are left out when copying (not needed to run the wallpaper in a page).
const SKIP = [/\.zip$/i, /^social\./i, /cropped-98mtb/i, /^\.git/i, /^node_modules$/i];

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const library = option('--library') ?? DEFAULT_LIBRARY;
const extraTitles = args.flatMap((arg, i) => (arg === '--title' ? [args[i + 1]] : []));
const importAll = args.includes('--all');

const publicDir = path.resolve('public', 'lively');
const catalogFile = path.resolve('src', 'wallpapers', 'catalog.json');

// "Triangles & Light" -> "triangles-light"
const slugify = (title) =>
  title
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Read a JSON file. Lively's files sometimes start with a hidden "BOM" character, and some contain
// comment lines (// like this), which real JSON doesn't allow. Both are removed here.
function readJson(file) {
  const text = fs
    .readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
    .replace(/,(\s*[}\]])/g, '$1'); // a comma before a closing bracket is not allowed either
  return JSON.parse(text);
}

// Copy a folder, skipping the unwanted files.
function copyFolder(from, to, skipFolders = []) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.some((pattern) => pattern.test(entry.name))) continue;
    if (entry.isDirectory() && skipFolders.includes(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyFolder(source, target, skipFolders);
    else fs.copyFileSync(source, target);
  }
}

// Lively lists a wallpaper's settings in LivelyProperties.json as an object. Turn it into a list,
// and for "folderDropdown" settings (pick a file from a folder) work out which files are in the folder.
// The app talks to a wallpaper only through messages (it runs sandboxed), so each page gets public/lively/bridge.js,
// which passes the app's settings and mouse movements on to the page. It goes first in <head>.
const BRIDGE_TAG = '<script src="../bridge.js"></script>';
function addBridge(pageFile) {
  const html = fs.readFileSync(pageFile, 'utf8');
  if (html.includes(BRIDGE_TAG)) return;
  fs.writeFileSync(pageFile, html.replace(/<head([^>]*)>/i, (tag) => `${tag}\n    ${BRIDGE_TAG}`));
}

function readProperties(folder, id, copy) {
  const file = path.join(folder, 'LivelyProperties.json');
  if (!fs.existsSync(file)) return [];

  return Object.entries(readJson(file)).map(([name, property]) => {
    const result = { name, ...property };
    if (DEFAULT_OVERRIDES[id]?.[name] !== undefined) result.value = DEFAULT_OVERRIDES[id][name];
    if (property.type === 'folderDropdown') {
      const dir = path.join(copy, property.folder); // the copy in public/lively, so only files that are really there are listed
      const filters = (property.filter ?? '*').split('|').map((f) => new RegExp('^' + f.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i'));
      result.files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => filters.some((f) => f.test(name))) : [];
    }
    return result;
  });
}

if (!fs.existsSync(library)) {
  console.error(`Lively library not found: ${library}\nUse --library "<folder>" to point to it.`);
  process.exit(1);
}

const catalog = [];
for (const dirName of fs.readdirSync(library)) {
  const folder = path.join(library, dirName);
  const infoFile = path.join(folder, 'LivelyInfo.json');
  if (!fs.existsSync(infoFile)) continue;

  const info = readJson(infoFile);
  if (info.Type !== 1) continue; // 1 = a web page. Videos and applications are not imported.
  if (!importAll && ![...WANTED, ...extraTitles].includes(info.Title)) continue;

  const id = slugify(info.Title);
  copyFolder(folder, path.join(publicDir, id), SKIP_FOLDERS[id]);
  addBridge(path.join(publicDir, id, info.FileName));

  // Find the licence file, so the app can link to it.
  const licenseFile = fs.readdirSync(folder).find((name) => /^licen[cs]e(\.txt|\.md)?$/i.test(name)) ?? null;

  catalog.push({
    id,
    title: info.Title,
    desc: info.Desc ?? '',
    author: info.Author ?? '',
    contact: info.Contact ?? '',
    license: info.License ?? '',
    licenseFile,
    entry: info.FileName,
    thumbnail: info.Thumbnail ?? null,
    preview: info.Preview ?? null,
    properties: readProperties(folder, id, path.join(publicDir, id)),
    ...EXTRAS[id],
  });
  console.log(`imported ${info.Title}  ->  public/lively/${id}`);
}

catalog.sort((a, b) => a.title.localeCompare(b.title));
fs.mkdirSync(path.dirname(catalogFile), { recursive: true });
fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
console.log(`\nWrote ${catalog.length} wallpapers to src/wallpapers/catalog.json`);
