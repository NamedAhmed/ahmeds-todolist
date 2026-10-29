// FireArt.jsx = the fire around the big ring when every daily is done. It is the inside of an SVG with viewBox
// "0 0 200 200", in which the big ring is centred on (100, 100) and its outer edge is at radius 95 (see fire.js).
// Used by the ring (Calendar.jsx).
//
// It paints with the theme's two flame colours: --flame (the main one) and --flame-core (the hot, lighter one). Every
// theme sets its own (appearance.css).
//
// Props: coverage (one of FIRE_COVERAGES in fire.js: the top of the ring or all around),
//        still (true for a still picture: no moving filters, cheaper to draw).

import { useId } from 'react';
import { coverageOf, wavyPaths } from '../fire.js';

const A = 'var(--flame)';
const B = 'var(--flame-core)';


// ---- REALISTIC: the wavy tongues, painted like heat (white-hot at the ring, orange, then dark red fading to
// nothing) and rippled by moving noise, with a soft glow underneath. ----
function Realistic({ coverage, still }) {
  const id = useId().replace(/:/g, '');
  const arc = coverageOf(coverage);
  const paths = wavyPaths(coverage);
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
        <filter id={`flick-${id}`} filterUnits="userSpaceOnUse" {...arc.box}>
          <feTurbulence type="fractalNoise" baseFrequency="0.03 0.075" numOctaves="2" seed="4" result="noise">
            {moving && <animate attributeName="baseFrequency" dur="5s" values="0.03 0.075;0.036 0.095;0.03 0.075" repeatCount="indefinite" />}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" result="rippled" />
          <feGaussianBlur in="rippled" stdDeviation="0.8" />
        </filter>
        <filter id={`glow-${id}`} filterUnits="userSpaceOnUse" {...arc.box}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <path d={paths.back} fill={A} fillRule="evenodd" opacity="0.5" filter={`url(#glow-${id})`} />
      <path d={paths.back} fill={`url(#heat-${id})`} fillRule="evenodd" filter={`url(#flick-${id})`} />
      <path d={paths.front} fill={`url(#heat-${id})`} fillRule="evenodd" filter={`url(#flick-${id})`} />
    </>
  );
}


export default function FireArt({ coverage = 'top', still = false }) {
  return <Realistic coverage={coverage} still={still} />;
}
