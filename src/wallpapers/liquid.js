// liquid.js = the built-in "Liquid" wallpaper: glowing blobs of liquid that drift, stretch and merge.
//
// The trick is called "metaballs". Every blob adds to a "field" that is strong near the blob's centre
// and fades with distance. Where the fields of two blobs add up, they join into one smooth shape.
// We work the field out for a SMALL grid of pixels (cheap), then the browser scales the little
// canvas up and blurs it (see .liquid-canvas in appearance.css), which turns the grid into soft liquid.
//
// startLiquid() is used by the full-screen wallpaper (Wallpaper.jsx) and by the small preview in the
// background gallery (Background.jsx).

// Turn any CSS colour ("#5eb8ff", "rgb(...)", "rgba(...)") into [red, green, blue].
function parseColor(css) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#888888'; // used if the colour can't be read
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

// Other colour sets to choose from in Settings (the first one, "Theme", uses the page's own colours).
const PALETTES = [
  [[94, 234, 180], [110, 150, 255], [180, 110, 255], [90, 220, 255]], // Aurora
  [[255, 120, 90], [255, 180, 90], [230, 90, 150], [150, 90, 220]],   // Sunset
  [[40, 140, 255], [40, 200, 230], [90, 110, 255], [120, 230, 255]],  // Ocean
  [[255, 255, 255], [190, 190, 200], [130, 130, 140], [230, 230, 235]], // Mono
];

// The four theme colours the liquid is made of, read from the CSS variables on the page.
function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  return ['--accent', '--blue', '--green', '--warn'].map((name) => parseColor(styles.getPropertyValue(name).trim()));
}

// A value that goes smoothly from 0 to 1 as x goes from a to b.
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Start the animation on a canvas.
//   canvas   the <canvas> to draw on
//   options  width, height: the size of the grid in pixels (the canvas is shown larger)
//            pointer: { x, y, active } with x and y from 0 to 1 (the mouse), optional
//            still: true to draw one frame and stop (for people who prefer less motion)
//            settings: { speed, blobs, size, colors, mouse } (see LIQUID_INFO in appearance.js). It is read on
//              every frame, so changing it while the liquid runs shows straight away.
// Returns a function that stops it.
export function startLiquid(canvas, { width, height, pointer, still = false, settings = {} }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const themePalette = readPalette();
  const aspect = width / height;

  // The blobs. Each one drifts around a loop of its own (x and y wobble at different speeds).
  const blobs = [];
  function addBlob() {
    blobs.push({
      color: themePalette[0],
      radius: 0.16 + Math.random() * 0.1,        // how big (as a fraction of the height)
      cx: 0.15 + Math.random() * 0.7,            // the middle of its loop
      cy: 0.15 + Math.random() * 0.7,
      ax: 0.1 + Math.random() * 0.25,            // how far it travels
      ay: 0.1 + Math.random() * 0.22,
      sx: 0.08 + Math.random() * 0.14,           // how fast
      sy: 0.07 + Math.random() * 0.13,
      phase: Math.random() * 6.3,
      x: 0.5,
      y: 0.5,
    });
  }

  function frame(t) {
    // Add or remove blobs to match the setting, and give each its colour.
    const count = Math.round(settings.blobs ?? 7);
    while (blobs.length < count) addBlob();
    blobs.length = count;
    const palette = PALETTES[(settings.colors ?? 0) - 1] ?? themePalette;
    blobs.forEach((blob, index) => (blob.color = palette[index % palette.length]));
    const size = settings.size ?? 1;
    const follow = settings.mouse !== false && pointer?.active;

    // Move the blobs. The first blob is pulled toward the mouse when the mouse is moving.
    blobs.forEach((blob, index) => {
      let goalX = blob.cx + Math.sin(t * blob.sx + blob.phase) * blob.ax;
      let goalY = blob.cy + Math.cos(t * blob.sy + blob.phase * 1.3) * blob.ay;
      if (index === 0 && follow) {
        goalX = pointer.x;
        goalY = pointer.y;
      }
      blob.x += (goalX - blob.x) * (index === 0 && follow ? 0.06 : 1);
      blob.y += (goalY - blob.y) * (index === 0 && follow ? 0.06 : 1);
    });

    // Work out the colour of every pixel from the blobs' fields.
    const data = image.data;
    let i = 0;
    for (let py = 0; py < height; py++) {
      const y = py / height;
      for (let px = 0; px < width; px++) {
        const x = px / width;

        let field = 0;
        let red = 0;
        let green = 0;
        let blue = 0;
        for (const blob of blobs) {
          const dx = (x - blob.x) * aspect; // aspect makes the blobs round, not oval
          const dy = y - blob.y;
          const strength = (blob.radius * size * blob.radius * size) / (dx * dx + dy * dy + 0.0006);
          field += strength;
          red += strength * blob.color[0];
          green += strength * blob.color[1];
          blue += strength * blob.color[2];
        }

        // Inside the liquid (field high): solid colour with a bright rim. Outside: a soft glow that fades out.
        const solid = smoothstep(0.7, 1.25, field);
        const rim = smoothstep(0.85, 1.0, field) * (1 - smoothstep(1.0, 1.5, field));
        // (Kept fairly dark and see-through, so text on top of it stays easy to read.)
        const mix = 0.42 + 0.3 * solid + rim * 0.25;

        data[i] = Math.min(255, (red / field) * mix + rim * 35);
        data[i + 1] = Math.min(255, (green / field) * mix + rim * 35);
        data[i + 2] = Math.min(255, (blue / field) * mix + rim * 35);
        data[i + 3] = Math.min(255, 255 * (0.1 * Math.min(field, 1) + 0.6 * solid));
        i += 4;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  if (still) {
    frame(12);
    return () => {};
  }

  // The clock only runs forward, and at the chosen speed, so changing the speed never makes the blobs jump.
  let handle;
  let clock = 0;
  let last = performance.now();
  function tick(now) {
    handle = requestAnimationFrame(tick);
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden) return; // paused while the tab is hidden
    clock += seconds * (settings.speed ?? 1);
    frame(clock);
  }
  handle = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(handle);
}
