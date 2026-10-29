// appearance.js = the look of the app: the theme, the font, and what is behind the page (a photo, or a picture or
// video you added).
//
//   - the choices are saved with saveSetting() (store.js), so they sync between your devices.
//   - the pictures and videos you add are too big to sync. They live in this browser only, in
//     IndexedDB (a small database inside the browser). Which picture is chosen syncs like the other choices.
//
// Readability over a background is automatic (see AUTO READABILITY). The colours of each theme live in appearance.css.

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { getState, saveSetting, subscribe, useStore } from './store.js';
import { onSynced } from './sync.js';

// Each theme: [id used in appearance.css, name shown in Settings].
// ("ember" is the original look; it is shown as "Default".) A theme is more than colours: it also sets
// corner shapes, borders, the material of panels (flat or glass) and its own fonts. See appearance.css.
export const THEMES = [
  ['ember', 'Default'],
  ['light', 'Light'],
  ['liquid', 'Liquid'],
  ['paper', 'Paper'],
  ['terminal', 'Terminal'],
  ['dusk', 'Dusk'],
];


// ======================================================================
// THE WALLPAPER CHOICE
// ======================================================================
// What plays over the background picture:
//   'off'              nothing (just the picture, or no picture)
//   'video:<id>'       a video you added
export const OFF = 'off';

// ======================================================================
// EACH THEME'S OWN TWO SETTINGS (Settings > Style)
// ======================================================================
// kind: 'swatch' (pick a colour), 'switch' (on or off) or 'slider'. Saved as `<theme>_<key>`, so every theme remembers its own.
export const THEME_OPTIONS = {
  ember: [{ key: 'lines', label: 'Divider lines', kind: 'switch', default: true }],
  light: [{ key: 'lines', label: 'Divider lines', kind: 'switch', default: true }],
  liquid: [
    { key: 'backing', label: 'Backing', kind: 'slider', min: 0, max: 90, step: 1, unit: '%', default: 43 },
    { key: 'blur', label: 'Blur', kind: 'slider', min: 0, max: 30, step: 1, unit: 'px', default: 9 },
  ],
  paper: [
    { key: 'grain', label: 'Paper grain', kind: 'switch', default: true },
    { key: 'ink', label: 'Ink shadows', kind: 'switch', default: true },
  ],
  terminal: [
    { key: 'phosphor', label: 'Phosphor', kind: 'swatch', choices: [['green', 'Green', '#39ff7a'], ['amber', 'Amber', '#ffb000'], ['cyan', 'Cyan', '#4dd7ff'], ['white', 'White', '#e8e2d6']], default: 'green' },
    { key: 'scan', label: 'Scan lines', kind: 'switch', default: true },
  ],
  dusk: [{ key: 'glow', label: 'Glow', kind: 'slider', min: 0, max: 100, step: 1, unit: '%', default: 40 }],
};

// The accent colours offered ('' = the theme's own), the base colours for dark and for light themes, the text sizes,
// corner styles and densities (Settings > Style).
export const ACCENT_COLORS = ['#ff6b57', '#f0b35a', '#7ee0a1', '#5eb8ff', '#c59bff', '#ff8fc7'];
export const MAIN_COLORS = {
  dark: ['#0c0b0a', '#0b0f1a', '#0d1410', '#150d16', '#17181b', '#1a1208'],
  light: ['#f6f2ea', '#ffffff', '#e9f1ec', '#eaf0f8', '#f4eaf0', '#f1ece0'],
};
export const TEXT_SIZES = [['s', 'Small', 0.92], ['m', 'Normal', 1], ['l', 'Large', 1.12]];
// Focus: how much of the extras the app shows. 'default' is everything; 'normal' drops the eye-catching extras (the
// late-task jabs, streak badges) and half of the jokes; 'strict' also drops the jokes and the decoration.
export const FOCUS = [['strict', 'Strict'], ['normal', 'Normal'], ['default', 'Default']];
export const FOCUS_NOTES = {
  strict: 'No jokes or decoration. Only what you need.',
  normal: 'Calmer: no jabs or streak badges, fewer jokes. Colours stay.',
  default: 'Everything.',
};
export const DENSITIES = [['roomy', 'Roomy'], ['normal', 'Normal'], ['compact', 'Compact']];

// The text colours offered (the box next to them takes any other). '' = the theme's own.
export const TEXT_COLORS = ['#ffffff', '#f3ead9', '#ffd9a0', '#bfe3ff', '#b8ffc8', '#111111'];

const optionDefaults = Object.fromEntries(Object.entries(THEME_OPTIONS).flatMap(([theme, list]) => list.map((o) => [`${theme}_${o.key}`, o.default])));

const DEFAULTS = {
  theme: 'ember', wallpaper: OFF, font: 'instrument', taskGroups: false, showRepeating: true, pushDefaultTime: '09:00', noteEditor: 'blocks', pushLead: 0,
  textColor: '', mainColor: '', accent: '', textSize: 'm', focus: 'default', density: 'normal', wallBright: 100, wallVibrance: 100,
  ...optionDefaults,
};
export const MAX_GLASS = 0.9;

// The film over the background (Dim) and the frosted panels behind the text (Glass) start here; Auto readability
// (Wallpaper.jsx) adds just enough on top for the text to stay readable. The Liquid theme is different: no film, and its
// glass is always exactly this (a 43% dark tint, blurred by 43% of 20px), whatever the picture.
const DIM = 0.3;
const GLASS = 0.4;
export const LIQUID_GLASS = 0.43;
const SETTING_ID = 'appearance'; // the one record in the settings table that holds theme, wallpaper and dim

// The current choices, as { theme, wallpaper, dim, glass, font, look, taskGroups, showRepeating, ... }.
// Anything unknown (for example from a newer version of the app) falls back to the default.
export function useAppearance() {
  const state = useStore();
  const saved = state.settings[SETTING_ID];
  const choices = { ...DEFAULTS, ...(saved && !saved._deleted ? saved : {}) };

  const theme = THEMES.some(([id]) => id === choices.theme) ? choices.theme : DEFAULTS.theme;
  const dim = theme === 'liquid' ? 0 : DIM;
  // This theme's own two settings, each checked against what it allows (anything odd falls back to the default).
  const opts = {};
  for (const o of THEME_OPTIONS[theme]) {
    const value = choices[`${theme}_${o.key}`];
    if (o.kind === 'switch') opts[o.key] = typeof value === 'boolean' ? value : o.default;
    else if (o.kind === 'slider') opts[o.key] = Number.isFinite(Number(value)) ? Math.min(o.max, Math.max(o.min, Number(value))) : o.default;
    else opts[o.key] = o.choices.some(([id]) => id === value) ? value : o.default;
  }
  const glass = theme === 'liquid' ? opts.backing / 100 : GLASS;
  const liquidBlur = theme === 'liquid' ? opts.blur : null;
  const textColor = /^#[0-9a-f]{6}$/i.test(choices.textColor ?? '') ? choices.textColor : '';
  const hex = (value) => (/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '');
  const mainColor = hex(choices.mainColor);
  const accent = hex(choices.accent);
  const textSize = TEXT_SIZES.some(([id]) => id === choices.textSize) ? choices.textSize : 'm';
  const focus = FOCUS.some(([id]) => id === choices.focus) ? choices.focus : 'default';
  const density = DENSITIES.some(([id]) => id === choices.density) ? choices.density : 'normal';
  // The background picture's brightness and vibrance, in percent (100 = as it is).
  const clampTo = (value, min, max) => (Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : 100);
  const wallBright = clampTo(choices.wallBright, 40, 160);
  const wallVibrance = clampTo(choices.wallVibrance, 0, 200);
  // (A wallpaper from an older version, like an animated one that no longer exists, falls back to none.)
  const wallpaper = typeof choices.wallpaper === 'string' && choices.wallpaper.startsWith('video:') ? choices.wallpaper : OFF;

  const font = FONTS.some((preset) => preset.id === choices.font) ? choices.font : DEFAULTS.font;

  const pushDefaultTime = /^\d{2}:\d{2}$/.test(choices.pushDefaultTime ?? '') ? choices.pushDefaultTime : choices.pushDefaultTime === '' ? '' : DEFAULTS.pushDefaultTime; // '' = none
  const noteEditor = ['rich', 'blocks', 'markdown'].includes(choices.noteEditor) ? choices.noteEditor : DEFAULTS.noteEditor; // which editor notes open in
  const pushLead = [0, 5, 10, 15, 30, 60, 120, 1440].includes(Number(choices.pushLead)) ? Number(choices.pushLead) : 0; // minutes of warning before a timed task or reminder; 0 = none
  const taskGroups = choices.taskGroups === true; // Tasks: sections by date instead of the time-period switcher
  const showRepeating = choices.showRepeating !== false; // Tasks: show repeating reminders in the list

  return { theme, wallpaper, dim, glass, liquidBlur, font, look: GLASS_LOOK, opts, textColor, mainColor, accent, textSize, focus, density, wallBright, wallVibrance, taskGroups, showRepeating, pushDefaultTime, noteEditor, pushLead };
}

// Change one or more choices, e.g. setAppearance({ theme: 'forest' }).
export function setAppearance(patch) {
  saveSetting(SETTING_ID, patch);
}

// Put every choice back to how it started.
export function resetAppearance() {
  setAppearance({ ...DEFAULTS });
}

// Puts the text colour on the page. It replaces the theme's text shades (normal, soft, muted, faint) with the one colour at
// different strengths, and tints the lines too, so the whole page follows it. '' removes it, so the theme's own colours show.
const TEXT_COLOR_MIXES = { '--text-soft': 88, '--muted': 62, '--faint': 36, '--faint-text': 62, '--line': 14, '--line-mid': 22, '--line-hi': 34, '--track': 10 };
export function useApplyTextColor(color) {
  useLayoutEffect(() => {
    const style = document.documentElement.style;
    const names = ['--text', ...Object.keys(TEXT_COLOR_MIXES)];
    if (!color) {
      for (const name of names) style.removeProperty(name);
      return;
    }
    style.setProperty('--text', color);
    for (const [name, percent] of Object.entries(TEXT_COLOR_MIXES)) style.setProperty(name, `color-mix(in srgb, ${color} ${percent}%, transparent)`);
  }, [color]);
}

// How easy `color` is to read on `background` (both #rrggbb): 1 is no difference, 21 is black on white. 4.5 is the usual minimum for text.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastBetween(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Puts the theme's own settings on the page (on/off ones as attributes appearance.css reads, sliders as CSS variables).
export function useApplyThemeOptions(theme, opts) {
  const key = JSON.stringify(opts);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.removeProperty('--dusk-glow');
    for (const name of ['data-lines', 'data-grain', 'data-ink', 'data-phosphor', 'data-scan']) root.removeAttribute(name);

    if ((theme === 'ember' || theme === 'light') && !opts.lines) root.setAttribute('data-lines', 'off');
    if (theme === 'paper') {
      if (!opts.grain) root.setAttribute('data-grain', 'off');
      if (!opts.ink) root.setAttribute('data-ink', 'off');
    }
    if (theme === 'terminal') {
      if (opts.phosphor !== 'green') root.setAttribute('data-phosphor', opts.phosphor);
      if (!opts.scan) root.setAttribute('data-scan', 'off');
    }
    if (theme === 'dusk') root.style.setProperty('--dusk-glow', String(opts.glow / 100));
  }, [theme, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The look that applies to every theme: a main (page) colour, an accent colour, the text size, how round the corners
// are, and how tight the rows are. Each is "off" (the theme's own) until chosen.
const mixHex = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const lightness = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 255000;
};
export function useApplyLook(theme, { mainColor, accent, textSize, focus, density }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const style = root.style;

    // accent
    if (accent) style.setProperty('--accent', accent);
    else style.removeProperty('--accent');

    // main colour: the page, and the panels and fields built from it
    const main = ['--bg', '--surface', '--panel-a', '--panel-b', '--panel-c', '--track'];
    if (mainColor) {
      const dark = lightness(mainColor) < 0.5;
      const toward = dark ? '#ffffff' : '#000000';
      const mix = (amount) => mixHex(mainColor, toward, amount);
      style.setProperty('--bg', mainColor);
      style.setProperty('--surface', mix(dark ? 0.05 : 0.04));
      style.setProperty('--panel-a', mix(dark ? 0.03 : 0.02));
      style.setProperty('--panel-b', mix(dark ? 0.08 : 0.05));
      style.setProperty('--panel-c', mix(dark ? 0.05 : 0.035));
      style.setProperty('--track', mix(dark ? 0.07 : 0.06));
      root.setAttribute('data-main', '');
    } else {
      main.forEach((name) => style.removeProperty(name));
      root.removeAttribute('data-main');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#0c0b0a');

    // text size: the whole page is scaled (heights that depend on the window are divided by the same number in the CSS)
    const zoom = TEXT_SIZES.find(([id]) => id === textSize)?.[2] ?? 1;
    style.setProperty('--zoom', String(zoom));
    style.zoom = zoom === 1 ? '' : String(zoom);

    // focus: appearance.css hides the extras and mutes the colours for this attribute
    root.setAttribute('data-focus', focus);

    // density: tighter or looser rows (appearance.css reads the attribute)
    root.setAttribute('data-density', density);
  }, [theme, mainColor, accent, textSize, focus, density]);
}

// Puts the theme on the page: <html data-theme="forest">. appearance.css reads that attribute.
export function useApplyTheme(theme) {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    // The browser's own bar (and the iPhone status bar) takes the theme's background instead of staying black.
    const colour = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (colour) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colour);
  }, [theme]);
}


// ---- The look of the Liquid theme's glass, fixed. Every setting is 0 to 1:
//   frost      how blurry it is                  vibrancy   how much the colours behind it are boosted
//   shine      how bright the light on the edges is    depth      how deep the shadow under the panels is
//   round      how round the corners are
// (Clear glass, rich colour, bright edges, deep shadow, very round corners.)
export const GLASS_LOOK = { frost: 0, vibrancy: 1, shine: 1, depth: 1, round: 1 };

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

// The picture's own colour, for the Liquid theme's flames: the average of its pixels weighted by how vivid they are (so a grey
// sky doesn't wash out a red sunset), pushed to a fire-bright { flame, core } pair of hex colours. null for a grey picture.
function flameColours(pixels) {
  let r = 0, g = 0, b = 0, total = 0;
  for (const [pr, pg, pb] of pixels) {
    const vivid = (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) ** 2;
    r += pr * vivid; g += pg * vivid; b += pb * vivid; total += vivid;
  }
  if (total < 0.5) return null;
  const [h, s] = rgbToHsl(r / total, g / total, b / total);
  return { flame: hslToHex(h, Math.max(s, 0.65), 0.55), core: hslToHex(h, Math.max(s, 0.65), 0.88) };
}
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// The darkest and brightest parts of the picture or video behind the page, as { dark, light } (0 = black, 1 = white),
// plus its flame colours { flame, core } (see flameColours), or null if there is none or it can't be measured. The picture is shrunk to a tiny 24 x 24 copy (which also blurs it,
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
        const colours = [];
        for (let i = 0; i < data.length; i += 4) {
          const rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
          colours.push(rgb);
          pixels.push(toLooks(lightOf(...rgb)));
        }
        setTones({ dark: Math.min(...pixels), light: Math.max(...pixels), fire: flameColours(colours) });
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
  {
    id: 'instrument',
    label: 'Instrument Serif',
    serif: '"Instrument Serif", Georgia, serif',
    sans: '"Instrument Serif", Georgia, serif',
    mono: '"Instrument Serif", Georgia, serif',
    google: [],
  },
  {
    id: 'geist',
    label: 'Geist',
    serif: '"Geist", system-ui, sans-serif',
    sans: '"Geist", system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, monospace',
    google: [],
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
  dusk: ['DM+Serif+Display:ital@0;1', 'DM+Sans:opsz,wght@9..40,400;500;600', 'DM+Mono:wght@400;500'],
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
// CHOOSING THE BACKGROUND (one at a time)
// ======================================================================
// There is ONE background, chosen in the gallery: a picture, or a video you added (which replaces the picture).
export function pickPicture(id) {
  setPictureId(id);
  setAppearance({ wallpaper: OFF });
}

export function pickWallpaper(id) {
  setAppearance({ wallpaper: id });
  setPictureId(NO_PICTURE);
}


// ======================================================================
// THE BACKGROUND PICTURE
// ======================================================================
// A picture is chosen by an id:
//   'none'            no picture
//   'photo:misty-mountain'   one of the built-in photos (see wallpapers/pictures.js)
//   'upload:<id>'     a picture you added
const PICTURE_KEY = 'todolist:picture'; // where the choice was kept before it synced (still read, until a choice is saved)
export const NO_PICTURE = 'none';

// The choice is part of the synced `appearance` setting, so every device shows the same picture.
function getPictureId() {
  const saved = getState().settings[SETTING_ID];
  if (saved && !saved._deleted && typeof saved.picture === 'string') return saved.picture;
  try {
    return localStorage.getItem(PICTURE_KEY) || NO_PICTURE;
  } catch {
    return NO_PICTURE;
  }
}

// The id of the chosen picture. Re-draws the component when it changes.
export function usePictureId() {
  return useSyncExternalStore(subscribe, getPictureId);
}

export function setPictureId(id) {
  setAppearance({ picture: id });
}

// Turn a picture or video id into an address the browser can show (a blob: URL). Cached, so each
// one is only prepared once. Resolves to null for 'none' or something that no longer exists.
const urlCache = new Map();
export function resolveMediaUrl(id) {
  if (!id || id === NO_PICTURE) return Promise.resolve(null);
  if (!urlCache.has(id)) {
    // (a picture that isn't here yet may arrive from another device, so "not found" is not remembered)
    urlCache.set(id, makeUrl(id).then((url) => {
      if (!url) urlCache.delete(id);
      return url;
    }));
  }
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
  const [arrivals, setArrivals] = useState(0); // goes up when pictures are added, deleted or arrive from another device
  useEffect(() => {
    const bump = () => setArrivals((count) => count + 1);
    uploadListeners.add(bump);
    return () => uploadListeners.delete(bump);
  }, []);
  useEffect(() => {
    let current = true;
    resolveMediaUrl(id).then((result) => {
      if (current) setUrl(result);
    });
    return () => {
      current = false;
    };
  }, [id, arrivals]);
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
      saveSetting(uploadSettingId(id), { name: file.name }); // the next sync uploads the picture itself
      lastId = id;
    } catch {
      problems.push(`Could not add ${file.name}.`);
    }
  }

  uploadListeners.forEach((listener) => listener());
  if (lastId) pickPicture('upload:' + lastId); // use the last one you added
  return problems;
}

// Add video files (.mp4 or .webm). Videos are kept as they are.
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
  if (fullId.startsWith('upload:')) saveSetting(uploadSettingId(fullId.slice('upload:'.length)), { removed: true }); // other devices drop it too
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


// ======================================================================
// SYNCING THE PICTURES YOU ADD
// ======================================================================
// The pictures are small (shrunk to 1920px JPEGs), so they sync through a private Supabase Storage bucket,
// one file per picture at <your user id>/<picture id>.jpg. Videos are too big and stay on the device they were added on.
// Which pictures exist (and their names) is kept in the synced settings table, one record per picture:
// { name } while it exists, { removed: true } once deleted, so a device that still has a copy knows to drop it.
const BUCKET = 'wallpapers';
const UPLOAD_PREFIX = 'upload-';
const uploadSettingId = (id) => UPLOAD_PREFIX + id;

let syncingPictures = false;
async function syncPictures(supabase, user) {
  if (syncingPictures) return;
  syncingPictures = true;
  try {
    const bucket = supabase.storage.from(BUCKET);
    const { data: files, error } = await bucket.list(user.id, { limit: 1000 });
    if (error) throw error;
    const remote = new Set(files.map((file) => file.name.replace(/\.jpg$/, '')));

    const known = Object.entries(getState().settings)
      .filter(([key, record]) => key.startsWith(UPLOAD_PREFIX) && record && !record._deleted)
      .map(([key, record]) => ({ id: key.slice(UPLOAD_PREFIX.length), ...record }));
    const local = new Map((await dbAll()).filter((record) => record.kind !== 'video').map((record) => [record.id, record]));
    let changed = false;

    for (const entry of known) {
      if (entry.removed) {
        if (local.has(entry.id)) {
          await deleteMedia('upload:' + entry.id); // also stops using it if it was the chosen one
          changed = true;
        }
        if (remote.has(entry.id)) await bucket.remove([`${user.id}/${entry.id}.jpg`]);
      } else if (!local.has(entry.id) && remote.has(entry.id)) {
        const { data: blob, error: downloadError } = await bucket.download(`${user.id}/${entry.id}.jpg`);
        if (downloadError) continue;
        await dbPut({ id: entry.id, name: entry.name || 'Picture', kind: 'image', blob, added: Date.now() });
        changed = true;
      }
    }

    // Pictures that are only on this device: record them, and upload the ones the bucket doesn't have yet.
    const knownIds = new Set(known.map((entry) => entry.id));
    for (const record of local.values()) {
      if (!knownIds.has(record.id)) saveSetting(uploadSettingId(record.id), { name: record.name });
      else if (known.find((entry) => entry.id === record.id)?.removed) continue;
      if (!remote.has(record.id)) {
        await bucket.upload(`${user.id}/${record.id}.jpg`, record.blob, { contentType: 'image/jpeg', upsert: true });
      }
    }

    if (changed) uploadListeners.forEach((listener) => listener());
  } finally {
    syncingPictures = false;
  }
}

onSynced(syncPictures);
