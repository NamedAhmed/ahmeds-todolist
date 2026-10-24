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
export const BASE = RING_EDGE - OVERLAP;

// The styles of fire. Wavy is the original: two layers of wavy tongues. The others are drawn in FireArt.jsx.
export const FIRE_STYLES = [
  { id: 'wavy', label: 'Wavy' },
  { id: 'candle', label: 'Candles' },
  { id: 'embers', label: 'Embers' },
  { id: 'lava', label: 'Lava' },
  { id: 'realistic', label: 'Realistic' },
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

// Where the fire is: along the top of the ring, or all the way around it. `from` and `to` are angles in degrees
// (-90 is the top); `box` is the area the moving effects (blur, noise) are allowed to draw in.
export const FIRE_COVERAGES = [
  { id: 'top', label: 'Top', from: -170, to: -10, full: false, box: { x: -60, y: -100, width: 320, height: 250 } },
  { id: 'around', label: 'All around', from: -90, to: 270, full: true, box: { x: -60, y: -60, width: 320, height: 320 } },
];
export const coverageOf = (id) => FIRE_COVERAGES.find((item) => item.id === id) ?? FIRE_COVERAGES[0];

// How tall the fire is at an angle, 0 to 1. Along the top it is tallest in the middle and short at the ends;
// all the way around it is tallest at the top (flames rise) and low at the bottom.
export function heightAt(degrees, coverage) {
  const arc = coverageOf(coverage);
  if (arc.full) return 0.65 + 0.35 * -Math.sin((degrees * Math.PI) / 180);
  return 0.35 + 0.65 * Math.sin((Math.PI * (degrees - arc.from)) / (arc.to - arc.from));
}

export const DEFAULT_FIRE_COVERAGE = 'top';
export const DEFAULT_FIRE_STYLE = 'wavy';
export const DEFAULT_FIRE_COLOR = 'theme';

// An angle (in degrees, 0 = right, -90 = top) and a distance from the ring's centre, as [x, y] in the drawing.
export function polar(degrees, radius) {
  const radians = (degrees * Math.PI) / 180;
  return [100 + radius * Math.cos(radians), 100 + radius * Math.sin(radians)];
}

// The outline of one layer of WAVY fire as an SVG "path" (a list of curve instructions).
//   tongues  how many tongues of fire     height  how tall the tallest one is (above the ring)
//   curl     which way the tips lean
function layerPath(tongues, height, curl, coverage) {
  // The same as polar(), as the text "x y".
  const point = (degrees, radius) => polar(degrees, radius).map((n) => n.toFixed(1)).join(' ');

  const sizes = [1, 0.5, 0.82, 0.58, 1, 0.52, 0.86, 0.6]; // so the tongues aren't all the same height
  const arc = coverageOf(coverage);
  const from = arc.full ? arc.from : -172; // start angle
  const span = arc.full ? 360 : 164;       // how many degrees of the ring the fire covers
  const step = span / tongues;

  let path = `M${point(from, BASE)}`; // "M" = move to the starting point

  for (let i = 0; i < tongues; i++) {
    const angle = from + i * step;

    // Tongues are tallest in the middle of the arc and shorter at the ends. (The fire starts OVERLAP below the
    // ring's edge, so that is added back to keep the visible height.)
    const h = height * heightAt(angle + step / 2, coverage) * sizes[i % sizes.length] + OVERLAP;

    // "C" = draw a curve: up the side of the tongue to its tip, then back down to the ring.
    path += ` C${point(angle - step * 0.05, BASE + h * 0.55)} ${point(angle + step * (0.3 + curl), BASE + h * 0.7)} ${point(angle + step * (0.5 + curl * 2), BASE + h)}`;
    path += ` C${point(angle + step * 0.62, BASE + h * 0.5)} ${point(angle + step * 1.02, BASE + h * 0.4)} ${point(angle + step, BASE)}`;
  }

  // All the way around: the outline ends where it began, so close it and cut a round hole (BASE is the radius) so the
  // inside of the ring stays empty. (The paths are filled "evenodd": the hole is where two outlines overlap.)
  if (arc.full) return `${path} Z M${100 + BASE} 100 A${BASE} ${BASE} 0 1 0 ${100 - BASE} 100 A${BASE} ${BASE} 0 1 0 ${100 + BASE} 100 Z`;

  // Along the top: close the shape by drawing back along the ring to the start ("A" = arc, "Z" = close).
  return `${path} A${BASE} ${BASE} 0 0 0 ${point(from, BASE)} Z`;
}

// { back, front }: the two paths of the wavy fire (a tall back layer and a short front layer), built once for each
// coverage. All the way around needs more tongues to fill the longer ring.
const wavy = {};
export function wavyPaths(coverage = DEFAULT_FIRE_COVERAGE) {
  const arc = coverageOf(coverage);
  wavy[arc.id] ??= arc.full
    ? { back: layerPath(13, 42, 0.1, arc.id), front: layerPath(15, 22, -0.08, arc.id) }
    : { back: layerPath(6, 42, 0.1, arc.id), front: layerPath(7, 22, -0.08, arc.id) };
  return wavy[arc.id];
}

// The inline style that gives the fire its colours (nothing for "Theme", so the CSS fallback shows).
export function fireColorStyle(colorId) {
  const color = FIRE_COLORS.find((item) => item.id === colorId);
  return color?.a ? { '--fire-a': color.a, '--fire-b': color.b } : undefined;
}
