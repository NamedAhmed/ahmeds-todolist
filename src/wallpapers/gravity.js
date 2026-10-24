// gravity.js = the built-in "Gravity" wallpaper: tiny particles streak through the dark and get pulled into
// glowing "gravity points". Points that touch merge into a bigger one, and one that grows too big collapses.
//
// This is a port of "Gravity Points" by Akimitsu Hamamuro (https://codepen.io/akm2/full/AGgarW), rewritten as a
// small ES module. What changed from the original:
//   - the original adds a point when you click, but this wallpaper sits BEHIND the page, so points appear on
//     their own instead (the "Gravity points" setting is how many it keeps alive) and the mouse pulls on the
//     particles like an invisible point
//   - particles wrap around the edges, so they never drift away forever
//   - the dat.GUI panel is replaced by the settings in the app
//
// startGravity() is used by the full-screen wallpaper (Wallpaper.jsx) and by the small preview tile (Background.jsx).

const PARTICLE_SPEED_LIMIT = 12;
const POINT_RADIUS = 10;
const POINT_RADIUS_LIMIT = 65; // a point that grows past this collapses

// "#0b3338" -> [11, 51, 56]
function rgb(hex, fallback) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  return Number.isNaN(n) ? fallback : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Start the animation on a canvas.
//   canvas   the <canvas> to draw on
//   options  width, height: the size of the canvas in pixels
//            pointer: { x, y, active } with x and y from 0 to 1 (the mouse), optional
//            still: true to draw one frame and stop (for people who prefer less motion)
//            settings: { particles, points, mouse, background, accent } (see GRAVITY_INFO in appearance.js).
//              It is read on every frame, so a changed setting shows straight away.
// Returns a function that stops it.
export function startGravity(canvas, { width, height, pointer, still = false, settings = {} }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const trails = document.createElement('canvas'); // the particles' streaks, faded a little every frame
  trails.width = width;
  trails.height = height;
  const trailCtx = trails.getContext('2d');

  const k = Math.min(2, Math.max(0.5, height / 900)); // sizes and speeds scale with the screen
  const setting = (name, fallback) => settings[name] ?? fallback;

  // The soft dark edge around the screen.
  const centreX = width / 2;
  const centreY = height / 2;
  const vignette = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, Math.hypot(centreX, centreY));
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.35)');

  const particles = [];
  const points = [];
  let sinceSpawn = 0;

  function addParticle() {
    const x = Math.random() * width;
    const y = Math.random() * height;
    particles.push({ x, y, px: x, py: y, vx: Math.random() * 2 - 1, vy: Math.random() * 2 - 1 });
  }

  function addPoint(x = Math.random() * width, y = Math.random() * height) {
    const radius = POINT_RADIUS * k;
    points.push({ x, y, radius, shown: radius * 0.5, gravity: 0.05, vx: 0, vy: 0, ease: 0, collapsing: false, destroyed: false });
  }

  // Pull a particle towards (x, y) with the given strength.
  function pull(particle, x, y, strength) {
    const dx = x - particle.x;
    const dy = y - particle.y;
    const length = Math.hypot(dx, dy);
    if (length) {
      particle.vx += (dx / length) * strength;
      particle.vy += (dy / length) * strength;
    }
  }

  // One gravity point: pulls every particle and every other point, absorbs a smaller one it touches, and
  // collapses when it has grown too big.
  function stepPoint(point) {
    for (const particle of particles) pull(particle, point.x, point.y, point.gravity * k);

    point.ease = (point.ease + (point.radius - point.shown) * 0.07) * 0.95;
    point.shown = Math.max(0, point.shown + point.ease);

    if (point.collapsing) {
      point.radius *= 0.75;
      if (point.shown < 1) point.destroyed = true;
      return;
    }

    const area = point.radius * point.radius * Math.PI;
    for (const other of points) {
      if (other === point || other.destroyed) continue;
      const distance = Math.hypot(other.x - point.x, other.y - point.y);
      if (point.shown >= other.radius && distance < (point.shown + other.radius) * 0.85) {
        other.destroyed = true;
        point.gravity += other.gravity;
        const absorb = (other.radius / point.radius) * 0.5;
        point.vx += (other.x - point.x) * absorb;
        point.vy += (other.y - point.y) * absorb;
        const otherArea = other.radius * other.radius * Math.PI;
        point.shown = Math.sqrt((area + otherArea * 3) / Math.PI);
        point.radius = Math.sqrt((area + otherArea) / Math.PI);
      }
      // (the points pull on each other, so they drift together)
      const dx = point.x - other.x;
      const dy = point.y - other.y;
      const length = Math.hypot(dx, dy) || 1;
      other.vx += (dx / length) * point.gravity * k;
      other.vy += (dy / length) * point.gravity * k;
    }

    point.x += point.vx;
    point.y += point.vy;
    point.vx = point.vy = 0;

    if (point.shown > POINT_RADIUS_LIMIT * k) {
      point.shown *= 1.75;
      point.collapsing = true;
    }
  }

  // A point is a dark hole with a coloured rim that flickers, inside a faint shadow.
  function drawPoint(point, accent) {
    ctx.save();
    let gradient = ctx.createRadialGradient(point.x, point.y, point.radius, point.x, point.y, point.radius * 5);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius * 5, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    const inner = Math.random() * point.shown * 0.7 + point.shown * 0.3;
    gradient = ctx.createRadialGradient(point.x, point.y, inner, point.x, point.y, point.shown);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
    gradient.addColorStop(1, Math.random() < 0.2 ? 'rgba(255, 196, 0, 0.15)' : `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0.75)`);
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.shown, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  function frame() {
    // Keep the right number of particles and points.
    const wantedParticles = Math.round(setting('particles', 150));
    while (particles.length < wantedParticles) addParticle();
    particles.length = Math.min(particles.length, wantedParticles);

    const wantedPoints = Math.round(setting('points', 3));
    const live = points.filter((point) => !point.destroyed && !point.collapsing).length;
    sinceSpawn++;
    if (live < wantedPoints && sinceSpawn > 70) {
      addPoint();
      sinceSpawn = 0;
    }

    const [r, g, b] = rgb(setting('background', '#0b3338'), [11, 51, 56]);
    const accent = rgb(setting('accent', '#67b5bf'), [103, 181, 191]);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    for (const point of points) {
      stepPoint(point);
      drawPoint(point, accent);
    }
    for (let i = points.length - 1; i >= 0; i--) if (points[i].destroyed) points.splice(i, 1);

    // The mouse pulls on the particles like an invisible gravity point.
    const mouseOn = setting('mouse', true) !== false && pointer?.active;

    // Fade the old streaks, then draw each particle's streak from where it was to where it is now.
    trailCtx.save();
    trailCtx.globalCompositeOperation = 'destination-out';
    trailCtx.globalAlpha = 0.35;
    trailCtx.fillRect(0, 0, width, height);
    trailCtx.restore();

    const limit = PARTICLE_SPEED_LIMIT * k;
    trailCtx.save();
    trailCtx.fillStyle = trailCtx.strokeStyle = '#fff';
    trailCtx.lineCap = trailCtx.lineJoin = 'round';
    trailCtx.lineWidth = k * 2;
    trailCtx.beginPath();
    for (const particle of particles) {
      if (mouseOn) pull(particle, pointer.x * width, pointer.y * height, 0.05 * k);
      const speed = Math.hypot(particle.vx, particle.vy);
      if (speed > limit) {
        particle.vx = (particle.vx / speed) * limit;
        particle.vy = (particle.vy / speed) * limit;
      }
      particle.px = particle.x;
      particle.py = particle.y;
      particle.x += particle.vx;
      particle.y += particle.vy;

      // off one edge: come back in on the other side (without a streak across the whole screen)
      if (particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height) {
        particle.x = (particle.x + width) % width;
        particle.y = (particle.y + height) % height;
        particle.px = particle.x;
        particle.py = particle.y;
      }
      trailCtx.moveTo(particle.x, particle.y);
      trailCtx.lineTo(particle.px, particle.py);
    }
    trailCtx.stroke();
    trailCtx.beginPath();
    for (const particle of particles) {
      trailCtx.moveTo(particle.x, particle.y);
      trailCtx.arc(particle.x, particle.y, k, 0, Math.PI * 2);
    }
    trailCtx.fill();
    trailCtx.restore();

    ctx.drawImage(trails, 0, 0);
  }

  if (still) {
    // Let it run for a few seconds first, so the single frame has points and streaks in it.
    for (let i = 0; i < 240; i++) frame();
    return () => {};
  }

  // The physics is counted in frames, so run it at a steady 60 steps a second whatever the screen's refresh rate.
  let handle;
  let owed = 0;
  let last = performance.now();
  function tick(now) {
    handle = requestAnimationFrame(tick);
    owed = Math.min(owed + (now - last) / (1000 / 60), 3);
    last = now;
    if (document.hidden) return; // paused while the tab is hidden
    if (owed >= 1) {
      frame();
      owed -= 1;
    }
  }
  handle = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(handle);
}
