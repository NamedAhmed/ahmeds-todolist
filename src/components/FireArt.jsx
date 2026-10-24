// FireArt.jsx = the drawings of each fire style. It is the inside of an SVG with viewBox "0 0 200 200", in which the big ring
// is centred on (100, 100) and its outer edge is at radius 95 (see fire.js). Used by the ring (Calendar.jsx) and by
// the previews in Settings (Look.jsx).
//
// Every style paints with two colours from the page: --fire-a (the main one) and --fire-b (the lighter one).
// (Those are set by the Fire colour setting; with "Theme" they fall back to the theme's flame colours.)
//
// Props: style (one of FIRE_STYLES in fire.js), still (true in a preview: no moving filters, cheaper to draw).

import { useId } from 'react';
import { BASE, polar, wavyPaths } from '../fire.js';

const A = 'var(--fire-a, var(--flame))';
const B = 'var(--fire-b, var(--flame-core))';
const TOP = [-170, -10]; // the fire fills this part of the ring, in degrees (the top half)

// A small steady random number generator, so a style always looks the same (no flicker of the whole picture
// whenever the page re-draws). Returns a function that gives numbers from 0 to 1.
function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How tall a tongue is, so the middle of the arc is tallest and the ends are short (0.35 to 1).
const middleBoost = (fraction) => 0.35 + 0.65 * Math.sin(Math.PI * fraction);


// ---- WAVY: the original two layers of wavy tongues ----
function Wavy() {
  const paths = wavyPaths();
  return (
    <>
      <path className="fire-back" d={paths.back} />
      <path className="fire-front" d={paths.front} />
    </>
  );
}


// ---- CANDLE: separate teardrop flames with gaps between them, each swaying on its own ----
// A teardrop pointing up from (0, 0): round at the bottom, pointed at the top.
function teardrop(width, height) {
  const w = width / 2;
  return (
    `M0 ${-height} C${w * 0.25} ${-height * 0.72} ${w * 1.15} ${-height * 0.42} ${w} ${-height * 0.14} ` +
    `Q${w * 0.8} ${height * 0.06} 0 ${height * 0.06} Q${-w * 0.8} ${height * 0.06} ${-w} ${-height * 0.14} ` +
    `C${-w * 1.15} ${-height * 0.42} ${-w * 0.25} ${-height * 0.72} 0 ${-height}Z`
  );
}

function Candle() {
  const count = 7;
  const rand = random(11);
  const span = TOP[1] - TOP[0];
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const angle = TOP[0] + (span * (i + 0.5)) / count;
        const height = (24 + 22 * middleBoost((i + 0.5) / count)) * (0.85 + rand() * 0.3);
        const width = height * 0.5;
        const [x, y] = polar(angle, BASE + 2);
        const delay = `${(-rand() * 2).toFixed(2)}s`;
        // The group places and turns the flame (its "up" points away from the ring); the paths inside sway.
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle + 90})`}>
            <path className="candle-flame" d={teardrop(width, height)} fill={A} style={{ animationDelay: delay }} />
            <path className="candle-flame candle-core" d={teardrop(width * 0.5, height * 0.55)} fill={B} style={{ animationDelay: delay }} />
          </g>
        );
      })}
    </>
  );
}


// ---- EMBERS: a glowing band along the ring, with sparks floating up and fading ----
function Embers() {
  const rand = random(7);
  const sparks = Array.from({ length: 34 }, (_, i) => {
    const angle = TOP[0] + rand() * (TOP[1] - TOP[0]);
    const [x, y] = polar(angle, BASE + 6);
    const distance = 16 + rand() * 40;
    const lift = 8 + rand() * 14; // sparks drift upwards as well as outwards
    const radians = (angle * Math.PI) / 180;
    return {
      key: i,
      x: x.toFixed(1),
      y: y.toFixed(1),
      dx: (Math.cos(radians) * distance + (rand() - 0.5) * 16).toFixed(1),
      dy: (Math.sin(radians) * distance - lift).toFixed(1),
      r: (1 + rand() * 1.8).toFixed(1),
      time: (2 + rand() * 2.2).toFixed(2),
      delay: (-rand() * 4).toFixed(2),
      light: i % 3 === 0,
    };
  });
  // The glow is two arcs just outside the ring: a wide soft one and a thin bright one.
  const arcAt = (radius) => {
    const [x1, y1] = polar(TOP[0], radius);
    const [x2, y2] = polar(TOP[1], radius);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${radius} ${radius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  return (
    <>
      <path className="ember-glow" d={arcAt(99)} stroke={A} />
      <path className="ember-glow ember-glow-core" d={arcAt(97.5)} stroke={B} />
      {sparks.map((spark) => (
        <circle
          key={spark.key}
          className="ember"
          cx={spark.x}
          cy={spark.y}
          r={spark.r}
          fill={spark.light ? B : A}
          style={{ '--dx': spark.dx + 'px', '--dy': spark.dy + 'px', animationDuration: spark.time + 's', animationDelay: spark.delay + 's' }}
        />
      ))}
    </>
  );
}


// ---- LAVA: round blobs rise from the ring, shrink and pinch off. A "gooey" filter (blur, then sharpen the
// edge) makes touching blobs melt into each other. ----
function Lava() {
  const id = useId().replace(/:/g, '');
  const rand = random(23);
  const blobs = Array.from({ length: 11 }, (_, i) => {
    const angle = TOP[0] + 8 + rand() * (TOP[1] - TOP[0] - 16);
    const [x, y] = polar(angle, BASE + 5);
    const radians = (angle * Math.PI) / 180;
    const distance = 22 + rand() * 40 * middleBoost((angle - TOP[0]) / (TOP[1] - TOP[0]));
    return {
      key: i,
      x: x.toFixed(1),
      y: y.toFixed(1),
      dx: (Math.cos(radians) * distance).toFixed(1),
      dy: (Math.sin(radians) * distance).toFixed(1),
      r: (7.5 + rand() * 6).toFixed(1),
      time: (2.6 + rand() * 2).toFixed(2),
      delay: (-rand() * 4).toFixed(2),
      light: i % 4 === 0,
    };
  });
  const [x1, y1] = polar(TOP[0], 98);
  const [x2, y2] = polar(TOP[1], 98);
  return (
    <>
      <defs>
        <filter id={`goo-${id}`} filterUnits="userSpaceOnUse" x="-60" y="-100" width="320" height="250">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6.5" />
        </filter>
      </defs>
      <g filter={`url(#goo-${id})`}>
        <path d={`M${x1.toFixed(1)} ${y1.toFixed(1)}A98 98 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={A} strokeWidth="11" />
        {blobs.map((blob) => (
          <circle
            key={blob.key}
            className="lava-blob"
            cx={blob.x}
            cy={blob.y}
            r={blob.r}
            fill={blob.light ? B : A}
            style={{ '--dx': blob.dx + 'px', '--dy': blob.dy + 'px', animationDuration: blob.time + 's', animationDelay: blob.delay + 's' }}
          />
        ))}
      </g>
    </>
  );
}


// ---- REALISTIC: the wavy tongues, painted like heat (white-hot at the ring, orange, then dark red fading to
// nothing) and rippled by moving noise, with a soft glow underneath. ----
function Realistic({ still }) {
  const id = useId().replace(/:/g, '');
  const paths = wavyPaths();
  // (Moving noise re-draws the picture every frame, so it is left out for people who prefer less motion.)
  const moving = !still && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <>
      <defs>
        {/* Heat by distance from the ring's centre: hot colour at the base, main colour in the middle, dark and clear at the tips. */}
        <radialGradient id={`heat-${id}`} gradientUnits="userSpaceOnUse" cx="100" cy="100" r="150">
          <stop offset="0.6" style={{ stopColor: B }} />
          <stop offset="0.67" style={{ stopColor: B }} />
          <stop offset="0.76" style={{ stopColor: A }} />
          <stop offset="0.87" style={{ stopColor: `color-mix(in srgb, ${A} 60%, #4a0800)`, stopOpacity: 0.85 }} />
          <stop offset="0.97" style={{ stopColor: `color-mix(in srgb, ${A} 60%, #4a0800)`, stopOpacity: 0 }} />
        </radialGradient>
        <filter id={`flick-${id}`} filterUnits="userSpaceOnUse" x="-60" y="-100" width="320" height="250">
          <feTurbulence type="fractalNoise" baseFrequency="0.03 0.075" numOctaves="2" seed="4" result="noise">
            {moving && <animate attributeName="baseFrequency" dur="5s" values="0.03 0.075;0.036 0.095;0.03 0.075" repeatCount="indefinite" />}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" result="rippled" />
          <feGaussianBlur in="rippled" stdDeviation="0.8" />
        </filter>
        <filter id={`glow-${id}`} filterUnits="userSpaceOnUse" x="-60" y="-100" width="320" height="250">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <path d={paths.back} fill={A} opacity="0.5" filter={`url(#glow-${id})`} />
      <path d={paths.back} fill={`url(#heat-${id})`} filter={`url(#flick-${id})`} />
      <path d={paths.front} fill={`url(#heat-${id})`} filter={`url(#flick-${id})`} />
    </>
  );
}


const STYLES = { wavy: Wavy, candle: Candle, embers: Embers, lava: Lava, realistic: Realistic };

export default function FireArt({ style, still = false }) {
  const Style = STYLES[style] ?? Wavy;
  return <Style still={still} />;
}
