// matrix.js = the built-in "Matrix" wallpaper: falling green code, made from scratch (the Lively one it replaces
// was a single colour with a fixed look).
//
// How it stays fast:
//   - Drawing text 5000 times a frame is slow, so every glyph is drawn ONCE into a hidden "atlas" (a sheet of
//     little pictures: each glyph at each brightness). A frame is then only copying pieces of that sheet.
//   - A falling stream is just a head position and a length. Nothing is stored per pixel; the trail's
//     brightness is worked out from how far behind the head a cell is.
//
// What makes it look better than the plain version:
//   - up to 3 DEPTH LAYERS: big bright glyphs in front, smaller dimmer and slower ones behind
//   - a white-hot head with a glow, a trail that fades smoothly, glyphs that flicker as they fall
//   - the glyphs are mirrored katakana, like the film
//   - colour, rainbow, speed, density, trail, size, glyph set and mouse light are all live settings
//
// startMatrix() is used by the full-screen wallpaper (Wallpaper.jsx) and by the small preview tile (Background.jsx).

const LEVELS = 10; // how many brightness steps the trail has (the head has its own extra sprite)
const TINTS = 16;  // in rainbow mode: how many hues the atlas holds

// The characters of each glyph set (the "Glyphs" setting is an index into this list).
const GLYPH_SETS = [
  'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:.=*+-<>¦|', // katakana, like the film
  '01',
  '0123456789',
  '0123456789ABCDEF',
  '+-*/=<>[]{}()#$%&@!?;:~^_|\\',
];
const MIRRORED = [true, false, false, false, false]; // only the katakana is flipped

// How each depth layer differs from the front one: size, fall speed and strength.
const LAYERS = [
  { size: 1, speed: 1, alpha: 1 },
  { size: 0.72, speed: 0.78, alpha: 0.62 },
  { size: 0.52, speed: 0.6, alpha: 0.38 },
];

const FONT = '"MS Gothic","Yu Gothic","Noto Sans Mono CJK JP","Noto Sans JP",monospace';

// "#00ff46" -> [0, 255, 70]
function rgb(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 255, 70] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// hue (0 to 360) -> [r, g, b] at full colour, a little lighter than pure
function hueToRgb(hue) {
  const h = (hue % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][Math.floor(h) % 6];
  return [Math.round(60 + r * 195), Math.round(60 + g * 195), Math.round(60 + b * 195)];
}

// Draw every glyph at every brightness (for every hue, in rainbow mode) onto one hidden canvas.
// Returns { canvas, cell, glyphs, rows } where a sprite is found at x = glyphIndex * cell, y = row * cell,
// and row = tint * (LEVELS + 1) + level (level LEVELS is the glowing head).
function buildAtlas({ glyphs, size, color, rainbow, glow, mirror }) {
  const cell = Math.ceil(size * 1.7); // room around the glyph for the glow
  const tints = rainbow ? TINTS : 1;
  const canvas = document.createElement('canvas');
  canvas.width = glyphs.length * cell;
  canvas.height = tints * (LEVELS + 1) * cell;
  const ctx = canvas.getContext('2d');
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let tint = 0; tint < tints; tint++) {
    const [r, g, b] = rainbow ? hueToRgb((tint * 360) / TINTS) : color;
    for (let level = 0; level <= LEVELS; level++) {
      const head = level === LEVELS;
      const strength = head ? 1 : 0.07 + 0.93 * (level / (LEVELS - 1)) ** 1.6;
      for (let i = 0; i < glyphs.length; i++) {
        const x = i * cell + cell / 2;
        const y = (tint * (LEVELS + 1) + level) * cell + cell / 2;
        ctx.save();
        ctx.translate(x, y);
        if (mirror) ctx.scale(-1, 1);
        if (head) {
          // the head: nearly white, with a glow in the colour
          if (glow) {
            ctx.shadowColor = `rgb(${r},${g},${b})`;
            ctx.shadowBlur = size * 0.9;
          }
          ctx.fillStyle = `rgb(${Math.round(r * 0.35 + 255 * 0.65)},${Math.round(g * 0.35 + 255 * 0.65)},${Math.round(b * 0.35 + 255 * 0.65)})`;
        } else {
          // the trail's top steps are the pure colour, the lower ones fade into the dark
          if (glow && level >= LEVELS - 2) {
            ctx.shadowColor = `rgba(${r},${g},${b},0.6)`;
            ctx.shadowBlur = size * 0.45;
          }
          ctx.fillStyle = `rgba(${r},${g},${b},${strength})`;
        }
        ctx.fillText(glyphs[i], 0, 0);
        ctx.restore();
      }
    }
  }
  return { canvas, cell, glyphs, tints };
}

// Start the animation on a canvas.
//   canvas   the <canvas> to draw on
//   options  width, height: the size of the canvas in pixels
//            pointer: { x, y, active } with x and y from 0 to 1 (the mouse), optional
//            still: true to draw one frame and stop (for people who prefer less motion)
//            settings: { matrixColor, rainbow, rainbowSpeed, speed, density, trail, size, glyphs, depth, glow, mouse }
//              (see MATRIX_INFO in appearance.js). It is read on every frame, so a changed setting shows straight away.
// Returns a function that stops it.
export function startMatrix(canvas, { width, height, pointer, still = false, settings = {} }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  const layers = [];     // one per depth layer: { atlas, size, cols, rows, streams, chars }
  let builtKey = '';     // what the atlases were built for
  const setting = (name, fallback) => settings[name] ?? fallback;

  // A new stream for one column: where its head is, how fast it falls and how long its trail is.
  function newStream(layer, spread) {
    const trail = setting('trail', 20);
    const density = setting('density', 0.8);
    const length = Math.max(4, Math.round(trail * (0.6 + Math.random() * 0.8)));
    return {
      y: spread ? Math.random() * (layer.rows + length) - length : -length - Math.random() * 6,
      speed: (11 + Math.random() * 13) * LAYERS[layer.index].speed,
      length,
      // "Density": a column rests for a while before its next stream (a dense rain barely rests)
      wait: spread ? 0 : (1 - density) * Math.random() * 7,
    };
  }

  // (Re)build the atlases and the streams when a setting that changes them has changed.
  function build(populate) {
    const glyphIndex = Math.min(GLYPH_SETS.length - 1, Math.max(0, Math.round(setting('glyphs', 0))));
    const glyphs = [...GLYPH_SETS[glyphIndex]];
    const baseSize = Math.round(setting('size', 16));
    const depth = Math.min(3, Math.max(1, Math.round(setting('depth', 3))));
    const color = rgb(setting('matrixColor', '#00ff46'));
    const rainbow = !!setting('rainbow', false);
    const glow = setting('glow', true) !== false;
    const key = [glyphIndex, baseSize, depth, color.join(), rainbow, glow, width, height].join('|');
    if (key === builtKey && !populate) return;
    builtKey = key;

    layers.length = 0;
    for (let index = 0; index < depth; index++) {
      const size = Math.max(6, Math.round(baseSize * LAYERS[index].size));
      const cols = Math.ceil(width / size);
      const rows = Math.ceil(height / size) + 1;
      const layer = { index, size, cols, rows, streams: [], chars: new Uint8Array(cols * rows) };
      layer.atlas = buildAtlas({ glyphs, size, color, rainbow, glow, mirror: MIRRORED[glyphIndex] });
      for (let i = 0; i < layer.chars.length; i++) layer.chars[i] = Math.floor(Math.random() * glyphs.length);
      for (let c = 0; c < cols; c++) layer.streams.push(newStream(layer, true));
      layers.push(layer);
    }
  }

  const mouse = { x: -1e4, y: -1e4 };

  // Move every stream on by `dt` seconds, then draw the layers from the back to the front.
  function frame(dt, time) {
    build(false);
    const speed = setting('speed', 1);
    const follow = setting('mouse', true) !== false && pointer?.active;
    if (follow) {
      mouse.x = pointer.x * width;
      mouse.y = pointer.y * height;
    } else {
      mouse.x = mouse.y = -1e4;
    }
    const rainbow = !!setting('rainbow', false);
    const rainbowSpeed = setting('rainbowSpeed', 40) / 100;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    for (let li = layers.length - 1; li >= 0; li--) {
      const layer = layers[li];
      const { atlas, size, rows, cols, chars } = layer;
      const cell = atlas.cell;
      const glyphCount = atlas.glyphs.length;
      const margin = (cell - size) / 2;
      ctx.globalAlpha = LAYERS[layer.index].alpha;
      const reach = (size * 9) ** 2; // the mouse lights glyphs this close (squared)

      for (let c = 0; c < cols; c++) {
        const stream = layer.streams[c];
        if (stream.wait > 0) {
          stream.wait -= dt;
          continue;
        }
        stream.y += stream.speed * speed * dt;
        const headRow = Math.floor(stream.y);
        if (headRow - stream.length > rows) {
          layer.streams[c] = newStream(layer, false);
          continue;
        }

        // The hue of this column in rainbow mode drifts with time.
        const tint = rainbow ? Math.floor(((c * 0.9 + time * rainbowSpeed * 9) % TINTS + TINTS) % TINTS) : 0;
        const tintRow = tint * (LEVELS + 1);
        const x = c * size - margin;

        for (let d = 0; d <= stream.length; d++) {
          const row = headRow - d;
          if (row < 0 || row >= rows) continue;
          const at = c * rows + row;

          // A new glyph appears under the head; the trail flickers a little as it falls.
          if (d === 0 || Math.random() < 0.012) chars[at] = Math.floor(Math.random() * glyphCount);

          const y = row * size - margin;
          let level;
          if (d === 0) {
            level = LEVELS; // the glowing head
          } else {
            const fade = 1 - d / (stream.length + 1);
            level = Math.max(0, Math.min(LEVELS - 1, Math.round(fade ** 1.4 * (LEVELS - 1))));
          }

          // The mouse lights up glyphs near it and makes them flicker.
          if (follow) {
            const dx = x + margin + size / 2 - mouse.x;
            const dy = y + margin + size / 2 - mouse.y;
            const near = dx * dx + dy * dy;
            if (near < reach) {
              const lift = 1 - near / reach;
              level = Math.min(LEVELS, level + Math.ceil(lift * 5));
              if (Math.random() < 0.25 * lift) chars[at] = Math.floor(Math.random() * glyphCount);
            }
          }

          ctx.drawImage(atlas.canvas, chars[at] * cell, (tintRow + level) * cell, cell, cell, x, y, cell, cell);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  build(true);

  if (still) {
    // Let it fall for a few seconds first, so the single frame looks like a moment of rain.
    for (let i = 0; i < 90; i++) frame(1 / 30, i / 30);
    return () => {};
  }

  let handle;
  let clock = 0;
  let last = performance.now();
  function tick(now) {
    handle = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden) return; // paused while the tab is hidden
    clock += dt;
    frame(dt, clock);
  }
  handle = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(handle);
}
