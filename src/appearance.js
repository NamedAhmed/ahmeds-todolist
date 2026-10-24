// appearance.js = the look of the app: the theme, the animated wallpaper, and the background picture.
//
//   - theme, wallpaper, dim and each wallpaper's settings are saved with saveSetting() (store.js),
//     so they sync between your devices.
//   - the pictures and videos you add are too big to sync. They live in this browser only, in
//     IndexedDB (a small database inside the browser). Which picture is chosen is kept in localStorage.
//
// The wallpapers are Lively Wallpaper web pages, copied into public/lively/ by scripts/import-lively.mjs.
// Their list is src/wallpapers/catalog.json. The colours of each theme live in appearance.css.

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { getState, saveSetting, useStore } from './store.js';
import catalog from './wallpapers/catalog.json';
import { DEFAULT_FIRE_COLOR, DEFAULT_FIRE_STYLE, FIRE_COLORS, FIRE_STYLES } from './fire.js';

// Each theme: [id used in appearance.css, name shown in Settings].
// ("ember" is the original look; it is shown as "Default".) A theme is more than colours: it also sets
// corner shapes, borders, the material of panels (flat or glass) and its own fonts. See appearance.css.
export const THEMES = [
  ['ember', 'Default'],
  ['light', 'Light'],
  ['liquid', 'Liquid'],
  ['paper', 'Paper'],
  ['terminal', 'Terminal'],
];


// ======================================================================
// THE WALLPAPER CHOICE
// ======================================================================
// A wallpaper is chosen by an id:
//   'off'              no wallpaper
//   'liquid'           the built-in liquid wallpaper
//   'matrix'           the built-in falling-code wallpaper
//   'gravity'          the built-in particles-and-gravity-points wallpaper
//   'lively:rain'      a Lively wallpaper from the catalog (here, the one with id "rain")
//   'video:<id>'       a video you added
export const OFF = 'off';
export const LIQUID = 'liquid'; // the built-in liquid wallpaper (src/wallpapers/liquid.js)
export const MATRIX = 'matrix'; // the built-in falling-code wallpaper (src/wallpapers/matrix.js)
export const GRAVITY = 'gravity'; // the built-in gravity wallpaper (src/wallpapers/gravity.js)
export const LIVELY = catalog; // [{ id, title, desc, author, entry, thumbnail, preview, properties, ... }]

// Find a catalog entry from a wallpaper id like 'lively:rain'. Returns undefined if there isn't one.
export function findLively(wallpaperId) {
  if (!wallpaperId.startsWith('lively:')) return undefined;
  return LIVELY.find((wallpaper) => wallpaper.id === wallpaperId.slice('lively:'.length));
}

// The built-in Liquid wallpaper described like a catalog entry, so it gets the same settings card as the others.
export const LIQUID_INFO = {
  id: 'liquid',
  title: 'Liquid',
  author: 'Built in',
  desc: 'Glowing liquid blobs that drift and merge.',
  seeThrough: true,
  properties: [
    { name: 'speed', type: 'slider', text: 'Speed', min: 0.2, max: 3, step: 0.1, value: 1 },
    { name: 'blobs', type: 'slider', text: 'Blobs', min: 3, max: 12, step: 1, value: 7 },
    { name: 'size', type: 'slider', text: 'Blob size', min: 0.5, max: 1.8, step: 0.1, value: 1 },
    { name: 'colors', type: 'dropdown', text: 'Colours', items: ['Theme', 'Aurora', 'Sunset', 'Ocean', 'Mono'], value: 0 },
    { name: 'mouse', type: 'checkbox', text: 'Follows the mouse', value: true },
  ],
};

// The settings of the Liquid wallpaper as { speed, blobs, ... }, from what you changed (see valueOf below).
export function liquidSettings(values) {
  return Object.fromEntries(LIQUID_INFO.properties.map((property) => [property.name, valueOf(property, values)]));
}

// The built-in Matrix wallpaper, described the same way (it draws its own black background, so no picture goes under it).
export const MATRIX_INFO = {
  id: 'matrix',
  title: 'Matrix',
  author: 'Built in',
  desc: 'Falling green code with depth, glow and a mouse light.',
  properties: [
    { name: 'matrixColor', type: 'color', text: 'Colour', value: '#00ff46' },
    { name: 'speed', type: 'slider', text: 'Speed', min: 0.3, max: 3, step: 0.1, value: 1 },
    { name: 'density', type: 'slider', text: 'Density', min: 0.2, max: 1, step: 0.05, value: 0.8 },
    { name: 'trail', type: 'slider', text: 'Trail length', min: 6, max: 40, step: 1, value: 20 },
    { name: 'size', type: 'slider', text: 'Glyph size', min: 10, max: 32, step: 1, value: 16 },
    { name: 'glyphs', type: 'dropdown', text: 'Glyphs', items: ['Katakana', 'Binary', 'Digits', 'Hex', 'Symbols'], value: 0 },
    { name: 'depth', type: 'slider', text: 'Depth layers', min: 1, max: 3, step: 1, value: 3 },
    { name: 'glow', type: 'checkbox', text: 'Glow', value: true },
    { name: 'mouse', type: 'checkbox', text: 'Mouse lights the code', value: true },
    { name: 'rainbow', type: 'checkbox', text: 'Rainbow', value: false },
    { name: 'rainbowSpeed', type: 'slider', text: 'Rainbow speed', min: 0, max: 100, step: 5, value: 40 },
  ],
};

// The settings of the Matrix wallpaper as { matrixColor, speed, ... }.
export function matrixSettings(values) {
  return Object.fromEntries(MATRIX_INFO.properties.map((property) => [property.name, valueOf(property, values)]));
}

// The built-in Gravity wallpaper (a port of "Gravity Points" by Akimitsu Hamamuro, see wallpapers/gravity.js).
export const GRAVITY_INFO = {
  id: 'gravity',
  title: 'Gravity',
  author: 'Akimitsu Hamamuro (port)',
  contact: 'https://codepen.io/akm2/full/AGgarW',
  desc: 'Particles streak through the dark and fall into gravity points that merge and collapse.',
  properties: [
    { name: 'particles', type: 'slider', text: 'Particles', min: 20, max: 500, step: 10, value: 150 },
    { name: 'points', type: 'slider', text: 'Gravity points', min: 0, max: 6, step: 1, value: 3 },
    { name: 'mouse', type: 'checkbox', text: 'Mouse pulls particles', value: true },
    { name: 'background', type: 'color', text: 'Background', value: '#0b3338' },
    { name: 'accent', type: 'color', text: 'Point colour', value: '#67b5bf' },
  ],
};

// The settings of the Gravity wallpaper as { particles, points, ... }.
export function gravitySettings(values) {
  return Object.fromEntries(GRAVITY_INFO.properties.map((property) => [property.name, valueOf(property, values)]));
}

// A "pick a picture" setting of a wallpaper (Rain's background). It is not shown in the wallpaper's own
// settings: the picture is chosen once, in the gallery, and handed to the wallpaper (see Wallpaper.jsx).
export const takesPicture = (property) => property.type === 'folderDropdown' && /jpe?g|png/i.test(property.filter ?? '');

// Does this wallpaper (a catalog entry) show a picture? Either it asks for one (Rain) or you can see through it.
const showsPicture = (wallpaper) => !!wallpaper && (!!wallpaper.seeThrough || wallpaper.properties.some(takesPicture));

// The same, from a wallpaper id ('off', 'liquid', 'lively:rain', 'video:...').
export function usesPicture(wallpaperId) {
  if (wallpaperId === LIQUID) return true;
  return showsPicture(findLively(wallpaperId ?? OFF));
}

// (glass has no fixed default: see useAppearance. autoFix is "Auto" in Settings > Readability.)
const DEFAULTS = { theme: 'ember', wallpaper: OFF, dim: 0.3, font: 'theme', autoFix: true, textColor: '', fireStyle: DEFAULT_FIRE_STYLE, fireColor: DEFAULT_FIRE_COLOR };
export const MAX_DIM = 0.7;
export const MAX_GLASS = 0.9;
const SETTING_ID = 'appearance'; // the one record in the settings table that holds theme, wallpaper and dim

// The current choices, as { theme, wallpaper, dim, glass, font, autoFix, textColor, look, fireStyle, fireColor }.
// Anything unknown (for example from a newer version of the app) falls back to the default.
export function useAppearance() {
  const state = useStore();
  const saved = state.settings[SETTING_ID];
  const choices = { ...DEFAULTS, ...(saved && !saved._deleted ? saved : {}) };

  const theme = THEMES.some(([id]) => id === choices.theme) ? choices.theme : DEFAULTS.theme;
  const dim = Math.min(MAX_DIM, Math.max(0, Number(choices.dim) || 0)); // never so dark that a wallpaper disappears
  // Glass is the backing behind the text. The Liquid theme starts with none (it adds nothing over the page); the others start at 40%.
  const glass = Math.min(MAX_GLASS, Math.max(0, Number(choices.glass ?? (theme === 'liquid' ? 0 : 0.4))));
  const autoFix = choices.autoFix !== false;

  let wallpaper = OFF;
  if (choices.wallpaper === LIQUID || choices.wallpaper === MATRIX || choices.wallpaper === GRAVITY || (typeof choices.wallpaper === 'string' && (findLively(choices.wallpaper) || choices.wallpaper.startsWith('video:')))) {
    wallpaper = choices.wallpaper;
  }

  const font = FONTS.some((preset) => preset.id === choices.font) ? choices.font : DEFAULTS.font;

  // The text colour: '' = the theme's own, otherwise a #rrggbb colour you picked.
  const textColor = /^#[0-9a-f]{6}$/i.test(choices.textColor ?? '') ? choices.textColor : '';

  // How the Liquid theme's glass looks: each setting is 0 to 1 (see GLASS_LOOK).
  const look = {};
  for (const key of Object.keys(GLASS_LOOK)) {
    const saved = Number(choices[GLASS_PREFIX + key] ?? GLASS_LOOK[key]);
    look[key] = Math.min(1, Math.max(0, Number.isNaN(saved) ? GLASS_LOOK[key] : saved));
  }

  // The fire around a finished ring (see fire.js).
  const fireStyle = FIRE_STYLES.some((item) => item.id === choices.fireStyle) ? choices.fireStyle : DEFAULTS.fireStyle;
  const fireColor = FIRE_COLORS.some((item) => item.id === choices.fireColor) ? choices.fireColor : DEFAULTS.fireColor;

  return { theme, wallpaper, dim, glass, font, autoFix, textColor, look, fireStyle, fireColor };
}

// Change one or more choices, e.g. setAppearance({ theme: 'forest' }).
export function setAppearance(patch) {
  saveSetting(SETTING_ID, patch);
}

// Puts the theme on the page: <html data-theme="forest">. appearance.css reads that attribute.
export function useApplyTheme(theme) {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}


// Puts your text colour on the page. It replaces the theme's four text shades (normal, soft, muted, faint) with
// the one colour at different strengths. '' removes it, so the theme's own colours show.
export function useApplyTextColor(color) {
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    if (!color) {
      for (const name of ['--text', '--text-soft', '--muted', '--faint']) style.removeProperty(name);
      return;
    }
    style.setProperty('--text', color);
    style.setProperty('--text-soft', `color-mix(in srgb, ${color} 88%, transparent)`);
    style.setProperty('--muted', `color-mix(in srgb, ${color} 62%, transparent)`);
    style.setProperty('--faint', `color-mix(in srgb, ${color} 36%, transparent)`);
  }, [color]);
}


// ---- The look of the Liquid theme's glass. Every setting is 0 to 1, and these are the starting values.
//   frost      how blurry it is                  vibrancy   how much the colours behind it are boosted
//   shine      how bright the light on the edges is    depth      how deep the shadow under the panels is
//   round      how round the corners are
export const GLASS_LOOK = { frost: 0.3, vibrancy: 0.5, shine: 0.6, depth: 0.5, round: 0.7 };
const GLASS_PREFIX = 'glass_'; // saved as glass_frost, glass_shine...

export function setGlassLook(patch) {
  const saved = {};
  for (const [key, value] of Object.entries(patch)) saved[GLASS_PREFIX + key] = value;
  saveSetting(SETTING_ID, saved);
}

export function resetGlassLook() {
  setGlassLook(Object.fromEntries(Object.keys(GLASS_LOOK).map((key) => [key, null]))); // null = the starting value
}

// Puts the glass look on the page (only while the Liquid theme is on). It is all plain CSS: these are variables
// that the Liquid rules in appearance.css read.
export function useApplyGlass(theme, look) {
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    const names = ['--lg-blur', '--lg-sat', '--lg-shine', '--lg-depth', '--col-radius'];
    if (theme !== 'liquid') {
      names.forEach((name) => style.removeProperty(name));
      return;
    }
    style.setProperty('--lg-blur', Math.round(4 + look.frost * 32) + 'px');
    style.setProperty('--lg-sat', String(1 + look.vibrancy * 1.2));
    style.setProperty('--lg-shine', String(look.shine));
    style.setProperty('--lg-depth', String(look.depth));
    style.setProperty('--col-radius', Math.round(12 + look.round * 32) + 'px');
  }, [theme, look.frost, look.vibrancy, look.shine, look.depth, look.round]);
}


// Themes with dark text on a light page. Over a dark picture their text would be hard to read, so their
// frosted panels are always at least this strong (see Wallpaper.jsx).
export const LIGHT_THEMES = ['light', 'paper'];
export const LIGHT_THEME_MIN_GLASS = 0.72;


// ======================================================================
// AUTO READABILITY
// ======================================================================
// Text is readable when it stands out enough from what is right behind it. That is measured as a "contrast ratio":
// 1 means no difference at all, 21 is black on white. Auto works out, for the background you chose, how much of the
// theme's colour (the Dim film and the Glass panels) has to go between the picture and the text so that:
//   - normal text reaches 7 : 1 (very easy to read)
//   - grey (muted) text reaches 3 : 1 (still clearly readable)
// It checks the picture's brightest AND darkest parts, so a busy picture with bright and dark patches is covered too.
const TEXT_TARGET = 7;
const MUTED_TARGET = 3;

// Brightness below is "how light it looks", 0 (black) to 1 (white). That is the scale the browser mixes colours on,
// but contrast has to be worked out from the real amount of light, so these two convert between them.
const toLight = (looks) => (looks <= 0.04045 ? looks / 12.92 : ((looks + 0.055) / 1.055) ** 2.4);
const lightOf = (r, g, b) => 0.2126 * toLight(r) + 0.7152 * toLight(g) + 0.0722 * toLight(b);
const toLooks = (light) => (light <= 0.0031308 ? light * 12.92 : 1.055 * light ** (1 / 2.4) - 0.055);

function contrast(a, b) {
  const [lighter, darker] = [toLight(a), toLight(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

// What a CSS colour on the page (like "var(--muted)") really is right now: { looks, alpha }.
// Some themes make grey text by fading the normal text colour, so the alpha (how see-through it is) matters.
export function colourOf(cssColour) {
  const probe = document.createElement('i');
  probe.style.cssText = `display:none;color:${cssColour}`;
  document.body.append(probe);
  const written = getComputedStyle(probe).color; // "rgb(1, 2, 3)", "rgba(1, 2, 3, 0.5)" or "color(srgb 0.1 0.2 0.3 / 0.5)"
  probe.remove();
  const numbers = (written.match(/[\d.]+/g) || []).map(Number);
  const scale = written.startsWith('color(') ? 1 : 255;
  const [r = 0, g = 0, b = 0] = numbers.map((n) => n / scale);
  return { looks: toLooks(lightOf(r, g, b)), alpha: numbers[3] ?? 1 };
}

// A background we can't measure (an animated wallpaper) is treated as one with near-white highlights and deep
// shadows, so the text stays readable whatever it shows.
export const UNKNOWN_TONES = { dark: 0.02, light: 0.95 };

// How much of the theme colour (0 = none, 1 = solid) must sit between the background and the text.
//   tones  the background's darkest and brightest parts, { dark, light }, each 0 to 1
//   text, muted, bg  the page's colours, from colourOf()
export function backingNeeded(tones, text, muted, bg) {
  function readable(cover) {
    return [tones.dark, tones.light].every((tone) => {
      const behind = tone * (1 - cover) + bg.looks * cover;
      const textOn = text.looks * text.alpha + behind * (1 - text.alpha);
      const mutedOn = muted.looks * muted.alpha + behind * (1 - muted.alpha);
      return contrast(textOn, behind) >= TEXT_TARGET && contrast(mutedOn, behind) >= MUTED_TARGET;
    });
  }
  if (readable(0)) return 0;
  if (!readable(1)) return 1; // not even a solid backing is enough (for example dark text on a dark theme)

  // Halve the gap 20 times to find the smallest backing that works.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2;
    if (readable(middle)) high = middle;
    else low = middle;
  }
  return high;
}

// The darkest and brightest parts of the picture or video behind the page, as { dark, light } (0 = black, 1 = white),
// or null if there is none or it can't be measured. The picture is shrunk to a tiny 24 x 24 copy (which also blurs it,
// like the frosted panels do, so a tiny glint doesn't count), and its darkest and brightest pixels are what count:
// text can land anywhere, so it has to be readable over both.
export function useBackdropTones(imageUrl, videoUrl) {
  const [tones, setTones] = useState(null);

  useEffect(() => {
    setTones(null);
    if (!imageUrl && !videoUrl) return;
    let current = true;
    const source = imageUrl ? new Image() : document.createElement('video');

    function measure() {
      if (!current) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, 0, 0, 24, 24);
        const { data } = ctx.getImageData(0, 0, 24, 24);
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) pixels.push(toLooks(lightOf(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)));
        setTones({ dark: Math.min(...pixels), light: Math.max(...pixels) });
      } catch {
        // the pixels can't be read: leave it unmeasured
      }
    }

    if (imageUrl) {
      source.onload = measure;
      source.src = imageUrl;
    } else {
      source.muted = true;
      source.preload = 'auto';
      source.onloadeddata = measure;
      source.src = videoUrl + '#t=0.5';
    }
    return () => {
      current = false;
    };
  }, [imageUrl, videoUrl]);

  return tones;
}


// ======================================================================
// FONTS
// ======================================================================
// A font choice replaces the theme's fonts. serif = headings, sans = body text, mono = small labels.
// `google` lists the Google Fonts the choice needs (as in a Google Fonts address, after "family=");
// they are only downloaded when needed. The fonts that are already loaded by index.html need none.
export const FONTS = [
  { id: 'theme', label: 'Theme default' },
  {
    id: 'editorial',
    label: 'Editorial',
    serif: '"Instrument Serif", Georgia, serif',
    sans: '"Geist", system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, monospace',
    google: [],
  },
  {
    id: 'instrument',
    label: 'Instrument Serif',
    serif: '"Instrument Serif", Georgia, serif',
    sans: '"Instrument Serif", Georgia, serif',
    mono: '"Instrument Serif", Georgia, serif',
    google: [],
  },
  {
    id: 'modern',
    label: 'Modern',
    serif: '"Inter", system-ui, sans-serif',
    sans: '"Inter", system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, monospace',
    google: ['Inter:wght@400;500;600'],
  },
  {
    id: 'classic',
    label: 'Classic',
    serif: '"Fraunces", Georgia, serif',
    sans: '"Lora", Georgia, serif',
    mono: '"Courier Prime", "Courier New", monospace',
    google: ['Fraunces:opsz,wght@9..144,400;600', 'Lora:wght@400;500;600', 'Courier+Prime'],
  },
  {
    id: 'rounded',
    label: 'Rounded',
    serif: '"Nunito", system-ui, sans-serif',
    sans: '"Nunito", system-ui, sans-serif',
    mono: '"Nunito", system-ui, sans-serif',
    google: ['Nunito:wght@400;600;700'],
  },
  {
    id: 'mono',
    label: 'Mono',
    serif: '"JetBrains Mono", ui-monospace, monospace',
    sans: '"JetBrains Mono", ui-monospace, monospace',
    mono: '"JetBrains Mono", ui-monospace, monospace',
    google: ['JetBrains+Mono:wght@400;500'],
  },
  {
    id: 'system',
    label: 'System',
    serif: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "Cascadia Mono", monospace',
    google: [],
  },
];

// The fonts each theme brings (see its block in appearance.css).
const THEME_FONTS = {
  liquid: ['Inter:wght@400;500;600'],
  paper: ['Fraunces:opsz,wght@9..144,400;600', 'Lora:wght@400;500;600', 'Courier+Prime'],
  terminal: ['JetBrains+Mono:wght@400;500'],
};

// Download a Google Font the first time it is needed, by adding a stylesheet link to the page.
const loadedFonts = new Set();
export function loadFonts(specs) {
  for (const spec of specs) {
    if (loadedFonts.has(spec)) continue;
    loadedFonts.add(spec);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
    document.head.appendChild(link);
  }
}

// Every font any theme or font choice uses. (The Settings screen calls this, so its previews show them.)
export function loadAllFonts() {
  loadFonts([...Object.values(THEME_FONTS).flat(), ...FONTS.flatMap((preset) => preset.google ?? [])]);
}

// Puts the chosen font on the page. "Theme default" removes the override, so the theme's own fonts show.
export function useApplyFont(theme, font) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const preset = FONTS.find((item) => item.id === font);

    loadFonts(THEME_FONTS[theme] ?? []);
    if (!preset || !preset.serif) {
      for (const name of ['--serif', '--sans', '--mono']) root.style.removeProperty(name);
      return;
    }
    loadFonts(preset.google);
    root.style.setProperty('--serif', preset.serif);
    root.style.setProperty('--sans', preset.sans);
    root.style.setProperty('--mono', preset.mono);
  }, [theme, font]);
}


// ======================================================================
// EACH WALLPAPER'S OWN SETTINGS (like the sliders in the Lively app)
// ======================================================================
// What you changed for one wallpaper is saved as { settingName: value }. A setting you haven't
// touched (or reset) is missing, and the default from the wallpaper's LivelyProperties.json is used.
const wallpaperSettingId = (id) => 'lively-' + id;

export function useWallpaperValues(id) {
  const state = useStore();
  const saved = state.settings[wallpaperSettingId(id)];
  return saved && !saved._deleted ? saved : {};
}

export function setWallpaperValue(id, name, value) {
  saveSetting(wallpaperSettingId(id), { [name]: value });
}

// Go back to the defaults for this wallpaper.
export function resetWallpaperValues(wallpaper) {
  const cleared = {};
  for (const property of wallpaper.properties) cleared[property.name] = null; // null = "use the default"
  saveSetting(wallpaperSettingId(wallpaper.id), cleared);
}

// The value to use for a setting: what you chose, or the wallpaper's default.
export function valueOf(property, values) {
  const chosen = values[property.name];
  if (chosen === null || chosen === undefined) return property.value;

  // A "pick a file" choice that points at a file that is no longer there (for example one that
  // came with an older version of the wallpaper) falls back to the default.
  if (property.type === 'folderDropdown') {
    const isKnownFile = property.files.includes(chosen);
    const isOurs = typeof chosen === 'string' && /^(photo|upload|video):/.test(chosen);
    if (!isKnownFile && !isOurs) return property.value;
  }
  return chosen;
}


// ======================================================================
// CHOOSING THE BACKGROUND (one at a time)
// ======================================================================
// There is ONE picture, chosen in the gallery. A wallpaper that shows a picture (Rain, Triangles & Light, Liquid)
// uses it, so the two tiles stay highlighted together. A wallpaper that doesn't (Fluids, a video) replaces it.
export function pickPicture(id) {
  setPictureId(id);
  const keepWallpaper = id !== NO_PICTURE && usesPicture(getState().settings[SETTING_ID]?.wallpaper);
  if (!keepWallpaper) setAppearance({ wallpaper: OFF });
}

export function pickWallpaper(id) {
  setAppearance({ wallpaper: id });
  const lively = findLively(id);
  if (!showsPicture(id === LIQUID ? LIQUID_INFO : lively)) {
    setPictureId(NO_PICTURE);
    return;
  }
  // A wallpaper that needs a picture (Rain) starts with its own default one, if none is chosen yet.
  const needed = lively?.properties.find(takesPicture);
  if (needed && getPictureId() === NO_PICTURE && /^photo:/.test(needed.value)) setPictureId(needed.value);
}


// ======================================================================
// THE BACKGROUND PICTURE
// ======================================================================
// A picture is chosen by an id:
//   'none'            no picture
//   'photo:misty-mountain'   one of the built-in photos (see wallpapers/pictures.js)
//   'upload:<id>'     a picture you added
const PICTURE_KEY = 'todolist:picture';
export const NO_PICTURE = 'none';

const pictureListeners = new Set();
function subscribeToPicture(listener) {
  pictureListeners.add(listener);
  return () => pictureListeners.delete(listener);
}

function getPictureId() {
  try {
    return localStorage.getItem(PICTURE_KEY) || NO_PICTURE;
  } catch {
    return NO_PICTURE;
  }
}

// The id of the chosen picture. Re-draws the component when it changes.
export function usePictureId() {
  return useSyncExternalStore(subscribeToPicture, getPictureId);
}

export function setPictureId(id) {
  try {
    localStorage.setItem(PICTURE_KEY, id);
  } catch {
    // storage unavailable: the choice just won't be remembered
  }
  pictureListeners.forEach((listener) => listener());
}

// Turn a picture or video id into an address the browser can show (a blob: URL). Cached, so each
// one is only prepared once. Resolves to null for 'none' or something that no longer exists.
const urlCache = new Map();
export function resolveMediaUrl(id) {
  if (!id || id === NO_PICTURE) return Promise.resolve(null);
  if (!urlCache.has(id)) urlCache.set(id, makeUrl(id));
  return urlCache.get(id);
}

async function makeUrl(id) {
  // A built-in photo is just a file in public/pictures/.
  if (id.startsWith('photo:')) return `/pictures/${id.slice('photo:'.length)}.jpg`;

  // 'upload:<id>' (a picture) and 'video:<id>' (a video) are both in the database.
  if (id.startsWith('upload:') || id.startsWith('video:')) {
    const record = await dbGet(id.slice(id.indexOf(':') + 1));
    return record ? URL.createObjectURL(record.blob) : null;
  }
  return null;
}

// Hook: the address for a picture or video id, or null while it's being prepared (or for 'none').
export function useMediaUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let current = true;
    resolveMediaUrl(id).then((result) => {
      if (current) setUrl(result);
    });
    return () => {
      current = false;
    };
  }, [id]);
  return url;
}


// ======================================================================
// THE PICTURES AND VIDEOS YOU ADD (stored in IndexedDB)
// ======================================================================
const DB_NAME = 'todolist-pictures';
const STORE = 'pictures';
const uploadListeners = new Set();

// Open the database (creating it the first time).
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Run one operation on the store and wait for its answer.
async function dbRun(mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = operation(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbGet = (id) => dbRun('readonly', (store) => store.get(id));
const dbAll = () => dbRun('readonly', (store) => store.getAll());
const dbPut = (record) => dbRun('readwrite', (store) => store.put(record));
const dbDelete = (id) => dbRun('readwrite', (store) => store.delete(id));

// Shrink a picture to at most 1920 pixels wide or tall and turn it into a JPEG, so it stays small.
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

// Add picture files. Returns the list of problems (empty if everything worked).
export async function addPictures(files) {
  const problems = [];
  let lastId = null;

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      problems.push(`${file.name} is not a picture.`);
      continue;
    }
    try {
      const id = crypto.randomUUID();
      await dbPut({ id, name: file.name, kind: 'image', blob: await shrink(file), added: Date.now() });
      lastId = id;
    } catch {
      problems.push(`Could not add ${file.name}.`);
    }
  }

  uploadListeners.forEach((listener) => listener());
  if (lastId) pickPicture('upload:' + lastId); // use the last one you added
  return problems;
}

// Add video files (.mp4 or .webm), for example from livelywallpaper.app. Videos are kept as they are.
// Returns the list of problems (empty if everything worked).
export async function addVideos(files) {
  const problems = [];
  let lastId = null;

  for (const file of files) {
    if (!file.type.startsWith('video/')) {
      problems.push(`${file.name} is not a video.`);
      continue;
    }
    try {
      const id = crypto.randomUUID();
      await dbPut({ id, name: file.name, kind: 'video', blob: file, added: Date.now() });
      lastId = id;
    } catch {
      problems.push(`Could not add ${file.name} (it may be too big for this browser's storage).`);
    }
  }

  uploadListeners.forEach((listener) => listener());
  if (lastId) pickWallpaper('video:' + lastId); // play the last one you added
  return problems;
}

// Add pictures and videos from one list of files (what the gallery's "Add" button and drag-and-drop give us).
// Returns the list of problems (empty if everything worked).
export async function addMedia(files) {
  const list = [...files];
  const images = list.filter((file) => file.type.startsWith('image/'));
  const videos = list.filter((file) => file.type.startsWith('video/'));
  const problems = list.filter((file) => !images.includes(file) && !videos.includes(file)).map((file) => `${file.name} is not a picture or video.`);

  if (images.length) problems.push(...(await addPictures(images)));
  if (videos.length) problems.push(...(await addVideos(videos)));
  return problems;
}

// Delete a picture ('upload:<id>') or a video ('video:<id>'), and stop using it if it was chosen.
export async function deleteMedia(fullId) {
  await dbDelete(fullId.slice(fullId.indexOf(':') + 1));
  const url = await urlCache.get(fullId);
  if (url) URL.revokeObjectURL(url); // (frees the memory of the copy shown on screen)
  urlCache.delete(fullId);
  if (getPictureId() === fullId) setPictureId(NO_PICTURE);
  if (getState().settings[SETTING_ID]?.wallpaper === fullId) setAppearance({ wallpaper: OFF });
  uploadListeners.forEach((listener) => listener());
}

// Hook: what you added, as [{ id, name, kind }] ('image' or 'video'), oldest first.
export function useUploads() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const records = await dbAll();
        records.sort((a, b) => a.added - b.added);
        if (current) setList(records.map(({ id, name, kind }) => ({ id, name, kind: kind ?? 'image' })));
      } catch {
        // IndexedDB unavailable (for example a private window): nothing added
      }
    }
    load();
    uploadListeners.add(load);
    return () => {
      current = false;
      uploadListeners.delete(load);
    };
  }, []);
  return list;
}
