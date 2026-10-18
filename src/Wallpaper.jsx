// Wallpaper.jsx = the animated background behind the whole app. It also applies the theme and font.
//
// It is a stack of layers behind everything (see .wallpaper in appearance.css):
//   1. your background picture (if you chose one)
//   2. the wallpaper: a Lively web page in an <iframe>, the built-in liquid canvas, or a video you added
//   3. a film in the theme's colour over all of it, so text stays readable (the "Dim" slider)
//
// A Lively wallpaper is just a web page. Lively (the Windows app) shows it and then tells it
// its settings by calling a function the page defines: livelyPropertyListener(name, value).
// This file does the same job here, so each wallpaper gets its settings (see LivelyFrame below).

import { useEffect, useRef } from 'react';
import {
  LIGHT_THEMES,
  LIGHT_THEME_MIN_GLASS,
  LIQUID,
  NO_PICTURE,
  findLively,
  resolveMediaUrl,
  useAppearance,
  useApplyFont,
  useApplyTheme,
  liquidSettings,
  takesPicture,
  useApplyGlass,
  useApplyTextColor,
  useBrightness,
  useMediaUrl,
  usePictureId,
  valueOf,
  useWallpaperValues,
} from './appearance.js';
import { startLiquid } from './wallpapers/liquid.js';

// Work out what to send a wallpaper for one of its settings, then send it.
// Lively sends sliders as numbers, checkboxes as true/false, dropdowns as the chosen position (0, 1, 2...),
// colours as text like "#ff0000", and "pick a file from a folder" settings as the file's path.
// Returns false if the page wasn't ready for it yet (so the caller can try again), otherwise true.
async function sendProperty(frameWindow, wallpaper, property, value) {
  if (property.type === 'label' || property.type === 'button') return true; // these have no value
  // While the page is still loading (or if it failed to load), the browser refuses access to it. That
  // means "not ready yet", so the caller tries again shortly.
  try {
    if (typeof frameWindow.livelyPropertyListener !== 'function') return false;
  } catch {
    return false;
  }

  let sent = value;
  if (property.type === 'folderDropdown') {
    if (typeof value === 'string' && value.startsWith('photo:')) {
      sent = `/pictures/${value.slice('photo:'.length)}.jpg`; // one of the app's built-in photos
    } else if (typeof value === 'string' && /^(upload|video):/.test(value)) {
      // One of YOUR pictures or videos. Wallpapers decide how to load a file from its ending, so a
      // fake ending is added to the address (anything after a # is ignored when loading it).
      const url = await resolveMediaUrl(value);
      if (!url) return true; // that file isn't on this device: leave the wallpaper's own choice
      sent = url + (value.startsWith('video:') ? '#.webm' : '#.jpg');
    } else {
      sent = `${property.folder}/${value}`; // a file bundled with the wallpaper, e.g. media/photo.jpg
    }
  }

  try {
    frameWindow.livelyPropertyListener(property.name, sent);
    return true;
  } catch {
    return false; // the page has not finished starting: try again shortly
  }
}

// The <iframe> for one Lively wallpaper, and the code that sends it its settings.
function LivelyFrame({ wallpaper }) {
  const frame = useRef(null);
  const saved = useWallpaperValues(wallpaper.id);
  const picture = usePictureId();
  // The wallpaper's picture comes from the gallery's choice, not from its own settings: one place to choose it.
  const values = { ...saved };
  if (picture !== NO_PICTURE) {
    for (const property of wallpaper.properties) if (takesPicture(property)) values[property.name] = picture;
  }
  const latest = useRef(values);   // the newest settings, for use inside timers
  const delivered = useRef({});    // what the page has already been told: { settingName: value }
  const alive = useRef(true);
  latest.current = values;

  // Send every setting the page hasn't received yet (or that changed). Each one is sent ONCE,
  // because some wallpapers restart themselves when they get a setting (The Hill does for its
  // background colour). Returns true if something couldn't be sent yet.
  async function deliver() {
    const frameWindow = frame.current?.contentWindow;
    if (!frameWindow) return false;

    let missed = false;
    for (const property of wallpaper.properties) {
      const value = valueOf(property, latest.current);
      if (delivered.current[property.name] === value) continue;

      const ok = await sendProperty(frameWindow, wallpaper, property, value);
      if (ok) delivered.current[property.name] = value;
      else missed = true;
    }
    return missed;
  }

  // Once the page has loaded, send the settings. If it wasn't ready, try again a few times.
  async function onLoad() {
    for (let attempt = 0; attempt < 8 && alive.current; attempt++) {
      const missed = await deliver();
      if (!missed) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // When you change a setting in Settings, tell the page about just that one.
  useEffect(() => {
    deliver();
  }, [saved, picture]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return (
    <iframe
      ref={frame}
      className="wallpaper-frame"
      title={wallpaper.title}
      src={`/lively/${wallpaper.id}/${wallpaper.entry}`}
      tabIndex={-1}
      sandbox="allow-scripts allow-same-origin"
      onLoad={onLoad}
    />
  );
}

// The built-in liquid wallpaper: a small canvas that startLiquid() draws on (see wallpapers/liquid.js).
function LiquidCanvas({ theme, pointer }) {
  const canvas = useRef(null);
  const values = useWallpaperValues('liquid');
  const settings = useRef({}); // read by the animation on every frame, so a changed setting shows without a restart
  Object.assign(settings.current, liquidSettings(values));

  // Start it, and start again when the theme changes (the colours change) or the window is resized.
  useEffect(() => {
    let stop = () => {};
    function start() {
      stop();
      stop = startLiquid(canvas.current, {
        width: Math.ceil(window.innerWidth / 9),
        height: Math.ceil(window.innerHeight / 9),
        pointer: pointer.current,
        settings: settings.current,
        still: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
    }
    start();
    window.addEventListener('resize', start);
    return () => {
      window.removeEventListener('resize', start);
      stop();
    };
  }, [theme, pointer]);

  return <canvas ref={canvas} className="liquid-canvas" />;
}

export default function Wallpaper() {
  const { theme, wallpaper, dim, glass, font, autoFix, textColor, look } = useAppearance();
  const pictureId = usePictureId();
  const pictureUrl = useMediaUrl(pictureId);
  const lively = findLively(wallpaper);
  const videoUrl = useMediaUrl(wallpaper.startsWith('video:') ? wallpaper : NO_PICTURE);
  const frameBox = useRef(null);
  const pointer = useRef({ x: 0.5, y: 0.5, active: false }); // the mouse, as a fraction of the window (0 to 1)

  useApplyTheme(theme); // put the theme on the page (this component is always on screen)
  useApplyFont(theme, font);
  useApplyTextColor(textColor);
  useApplyGlass(theme, look);

  const isLiquid = wallpaper === LIQUID;
  const showsSomething = pictureUrl || lively || videoUrl || isLiquid;

  // Auto readability: if the picture or video is hard to read text over (bright for a dark theme, dark for a light
  // one), add dimming and backing on top of what is set in Settings, just enough to make the text clear.
  const measured = useBrightness(videoUrl ? null : pictureUrl, videoUrl);
  const isLightTheme = LIGHT_THEMES.includes(theme);
  const difficulty = measured === null ? 0 : isLightTheme ? 1 - measured : measured; // 0 = easy to read over, 1 = hard
  const auto = autoFix ? Math.min(1, Math.max(0, (difficulty - 0.4) / 0.4)) : 0;
  const dimNow = Math.max(dim, auto * 0.4);

  // Tell the page's CSS whether something is behind the columns, and how frosted to make them
  // (see "html[data-backdrop] .col" in appearance.css).
  useEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute('data-backdrop', !!showsSomething);
    root.toggleAttribute('data-animated', !!(lively || videoUrl || isLiquid)); // moving: the glass blur is capped (appearance.css)
    let strength = Math.max(glass, auto * 0.6);
    if (isLightTheme) strength = Math.max(strength, LIGHT_THEME_MIN_GLASS); // dark text needs a pale panel behind it
    root.style.setProperty('--glass', Math.round(strength * 100) + '%');
    root.style.setProperty('--glass-blur', Math.round(strength * 20) + 'px'); // more glass = a stronger blur too
  }, [showsSomething, lively, videoUrl, isLiquid, glass, auto, theme, isLightTheme]);

  // Follow the mouse. It is used two ways:
  //   - the liquid wallpaper has a blob that chases the mouse
  //   - a Lively wallpaper is behind everything and can't get the mouse itself, so it is passed on. The event
  //     is sent to whatever is under the mouse INSIDE the page (for example its <canvas>), and rises up from
  //     there, so listeners on the canvas, the document and the window all hear it.
  useEffect(() => {
    let timer;
    let frame = 0; // a pending forward to the wallpaper page
    function onMove(event) {
      const mouse = pointer.current;
      mouse.x = event.clientX / window.innerWidth;
      mouse.y = event.clientY / window.innerHeight;
      mouse.active = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        mouse.active = false; // the mouse has been still for a while
      }, 3000);

      // At most once per frame: the mouse can move many times per frame, and each forward reaches into the page.
      if (lively && !frame) {
        const { clientX, clientY } = event;
        frame = requestAnimationFrame(() => {
          frame = 0;
          try {
            const frameDocument = frameBox.current?.querySelector('iframe')?.contentDocument;
            const target = frameDocument?.elementFromPoint(clientX, clientY) ?? frameDocument?.body;
            target?.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
          } catch {
            // the wallpaper page isn't available right now: skip this movement
          }
        });
      }
    }
    window.addEventListener('pointermove', onMove);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, [lively]);

  return (
    <>
      <div className="wallpaper" aria-hidden="true" style={{ '--dim': dimNow }} ref={frameBox}>
        {pictureUrl && <div className="wallpaper-image" style={{ backgroundImage: `url(${pictureUrl})` }} />}
        {videoUrl && <video className="wallpaper-video" src={videoUrl} autoPlay loop muted playsInline />}
        {isLiquid && <LiquidCanvas theme={theme} pointer={pointer} />}
        {lively && <LivelyFrame key={lively.id} wallpaper={lively} />}
        {showsSomething && <div className="wallpaper-dim" />}
      </div>
    </>
  );
}
