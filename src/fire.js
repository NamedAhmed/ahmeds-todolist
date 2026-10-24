// fire.js = the fire that rises around the big ring when every daily is done: its shapes and its colours.
// (The ring itself is drawn by Calendar.jsx; the Fire section of Settings, Look.jsx, uses this for its previews.)
//
// The fire is two SVG paths (a tall back layer and a short front layer) built from circle maths.
// A STYLE says how many tongues each layer has, how tall they are and what their tips look like.
// A COLOUR is two shades: the back layer's and the front layer's.

// The big ring's outer edge is at radius 95 (see BigRing in Calendar.jsx). The fire starts a little INSIDE that,
// so it tucks behind the ring and there is never a gap between them, however the fire moves while it sways.
const RING_EDGE = 95;
const OVERLAP = 4;
const BASE = RING_EDGE - OVERLAP;

// tips: 'curve' = wavy tongues that lean, 'line' = sharp triangles, 'round' = rounded scallops.
export const FIRE_STYLES = [
  { id: 'wavy', label: 'Wavy', back: { tongues: 6, height: 42, curl: 0.1, tips: 'curve' }, front: { tongues: 7, height: 22, curl: -0.08, tips: 'curve' } },
  { id: 'spiky', label: 'Spiky', back: { tongues: 8, height: 46, curl: 0.05, tips: 'line' }, front: { tongues: 9, height: 24, curl: 0, tips: 'line' } },
  { id: 'soft', label: 'Soft', back: { tongues: 5, height: 34, curl: 0, tips: 'round' }, front: { tongues: 6, height: 18, curl: 0, tips: 'round' } },
  { id: 'blaze', label: 'Blaze', back: { tongues: 10, height: 54, curl: 0.15, tips: 'curve' }, front: { tongues: 11, height: 28, curl: -0.1, tips: 'curve' } },
];

// a = the back layer, b = the front layer (lighter). "Theme" has none: it uses the theme's own flame colours.
// "Rainbow" starts orange and cycles through every hue (see .fire-rainbow in app.css).
export const FIRE_COLORS = [
  { id: 'theme', label: 'Theme', a: null, b: null },
  { id: 'ember', label: 'Ember', a: '#ff8a3d', b: '#ffd27a' },
  { id: 'gold', label: 'Gold', a: '#ffb400', b: '#fff1b0' },
  { id: 'blue', label: 'Blue', a: '#3d8bff', b: '#bfe0ff' },
  { id: 'ice', label: 'Ice', a: '#7fd6ff', b: '#ffffff' },
  { id: 'green', label: 'Green', a: '#2fd16f', b: '#c9ffd9' },
  { id: 'purple', label: 'Purple', a: '#9b5cff', b: '#e2ccff' },
  { id: 'pink', label: 'Pink', a: '#ff5fa2', b: '#ffd0e6' },
  { id: 'rainbow', label: 'Rainbow', a: '#ff5a3d', b: '#ffd27a' },
];

export const DEFAULT_FIRE_STYLE = 'wavy';
export const DEFAULT_FIRE_COLOR = 'theme';

// The outline of one layer of fire as an SVG "path" (a list of curve instructions).
//   tongues  how many tongues of fire     height  how tall the tallest one is (above the ring)
//   curl     which way the tips lean      tips    the tip shape, see FIRE_STYLES
function layerPath({ tongues, height, curl, tips }) {
  // An angle (in degrees) and a distance from the centre of the ring, as the text "x y".
  function point(degrees, radius) {
    const x = 100 + radius * Math.cos((degrees * Math.PI) / 180);
    const y = 100 + radius * Math.sin((degrees * Math.PI) / 180);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  }

  const sizes = [1, 0.5, 0.82, 0.58, 1, 0.52, 0.86, 0.6]; // so the tongues aren't all the same height
  const from = -172; // start angle
  const span = 164;  // how many degrees of the ring the fire covers
  const step = span / tongues;

  let path = `M${point(from, BASE)}`; // "M" = move to the starting point

  for (let i = 0; i < tongues; i++) {
    const angle = from + i * step;

    // Tongues are tallest in the middle of the arc and shorter at the ends. (The fire starts OVERLAP below the
    // ring's edge, so that is added back to keep the visible height.)
    const middleBoost = 0.35 + 0.65 * Math.sin(Math.PI * ((i + 0.5) / tongues));
    const h = height * middleBoost * sizes[i % sizes.length] + OVERLAP;
    const tip = point(angle + step * (0.5 + curl * 2), BASE + h);

    if (tips === 'line') {
      // "L" = a straight line: up to the tip and back down, a triangle.
      path += ` L${tip} L${point(angle + step, BASE)}`;
    } else if (tips === 'round') {
      // One "C" = a smooth curve that bulges up and comes back down, like a scallop.
      path += ` C${point(angle - step * 0.1, BASE + h * 1.33)} ${point(angle + step * 1.1, BASE + h * 1.33)} ${point(angle + step, BASE)}`;
    } else {
      // Up the side of the tongue to its tip, then back down to the ring.
      path += ` C${point(angle - step * 0.05, BASE + h * 0.55)} ${point(angle + step * (0.3 + curl), BASE + h * 0.7)} ${tip}`;
      path += ` C${point(angle + step * 0.62, BASE + h * 0.5)} ${point(angle + step * 1.02, BASE + h * 0.4)} ${point(angle + step, BASE)}`;
    }
  }

  // Close the shape by drawing back along the ring to the start ("A" = arc, "Z" = close).
  return `${path} A${BASE} ${BASE} 0 0 0 ${point(from, BASE)} Z`;
}

// { back, front }: the two paths of a style. Built once per style, the first time it is needed.
const built = {};
export function firePaths(styleId) {
  const style = FIRE_STYLES.find((item) => item.id === styleId) ?? FIRE_STYLES[0];
  built[style.id] ??= { back: layerPath(style.back), front: layerPath(style.front) };
  return built[style.id];
}

// The inline style that gives the fire its colours (nothing for "Theme", so the CSS fallback shows).
export function fireColorStyle(colorId) {
  const color = FIRE_COLORS.find((item) => item.id === colorId);
  return color?.a ? { '--fire-a': color.a, '--fire-b': color.b } : undefined;
}
