// Background.jsx = ONE gallery for everything that can be behind the page. Pick one:
//
//   None · Liquid · Lively wallpapers (they move; point at one to see it)
//   Photos (built in)
//   Yours: pictures and videos you added (a video plays as a wallpaper)
//
// There is one picture. A wallpaper that shows a picture (Rain, Triangles & Light, Liquid) uses it, so both tiles
// are highlighted. A wallpaper that doesn't (Fluids, a video) replaces it; so does choosing None.
//
// Pictures and videos you add stay on this device. The Lively wallpapers come from src/wallpapers/catalog.json,
// made by scripts/import-lively.mjs.

import { useEffect, useRef, useState } from 'react';
import {
  LIQUID,
  GRAVITY,
  LIVELY,
  MATRIX,
  gravitySettings,
  matrixSettings,
  NO_PICTURE,
  OFF,
  addMedia,
  deleteMedia,
  pickPicture,
  pickWallpaper,
  useAppearance,
  usesPicture,
  useMediaUrl,
  usePictureId,
  useUploads,
} from '../appearance.js';
import { PICTURES } from '../wallpapers/pictures.js';
import { startLiquid } from '../wallpapers/liquid.js';
import { startGravity } from '../wallpapers/gravity.js';
import { startMatrix } from '../wallpapers/matrix.js';

const LIVELY_SITE = 'https://livelywallpaper.app/live-wallpapers/';


// ======================================================================
// TILES
// ======================================================================

// "None": no picture and no wallpaper.
function NoneTile({ picked }) {
  return (
    <button type="button" className={'tile' + (picked ? ' picked' : '')} onClick={() => pickPicture(NO_PICTURE)} aria-pressed={picked}>
      <span className="tile-preview">
        <span className="tile-off">None</span>
      </span>
      <span className="tile-label">None</span>
    </button>
  );
}

// One Lively wallpaper. Shows a still picture, and the animated preview while pointed at.
function WallpaperTile({ wallpaper, picked }) {
  const [hovered, setHovered] = useState(false);
  const folder = `/lively/${wallpaper.id}/`;
  const still = wallpaper.thumbnail ? folder + wallpaper.thumbnail : null;
  const animated = wallpaper.preview ? folder + wallpaper.preview : null;

  return (
    <button
      type="button"
      className={'tile' + (picked ? ' picked' : '')}
      onClick={() => pickWallpaper('lively:' + wallpaper.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-pressed={picked}
    >
      <span className="tile-preview">{still && <img src={hovered && animated ? animated : still} alt="" loading="lazy" />}</span>
      <span className="tile-label">{wallpaper.title}</span>
      <span className="tile-author">{wallpaper.author}</span>
    </button>
  );
}

// The built-in liquid wallpaper. Its preview is the real thing drawn very small, and it runs only
// while the tile is pointed at (so it costs nothing the rest of the time).
function LiquidTile({ picked, theme }) {
  const canvas = useRef(null);
  const stop = useRef(() => {});

  // Draw one still frame, again whenever the theme changes (the colours change).
  useEffect(() => {
    startLiquid(canvas.current, { width: 80, height: 45, still: true });
  }, [theme]);

  function play() {
    stop.current();
    stop.current = startLiquid(canvas.current, { width: 80, height: 45 });
  }
  function pause() {
    stop.current();
    stop.current = () => {};
  }
  useEffect(() => () => stop.current(), []);

  return (
    <button
      type="button"
      className={'tile' + (picked ? ' picked' : '')}
      onClick={() => pickWallpaper(LIQUID)}
      onMouseEnter={play}
      onMouseLeave={pause}
      onFocus={play}
      onBlur={pause}
      aria-pressed={picked}
    >
      <span className="tile-preview liquid-preview">
        <canvas ref={canvas} className="liquid-canvas" />
      </span>
      <span className="tile-label">Liquid</span>
      <span className="tile-author">Built in</span>
    </button>
  );
}

// A built-in wallpaper drawn on a canvas (Matrix, Gravity). Like the Liquid tile: a still frame, and it moves only
// while the tile is pointed at. `preview` holds settings that suit a small picture (finer glyphs and so on).
function CanvasTile({ id, title, author, start, preview, picked }) {
  const canvas = useRef(null);
  const stop = useRef(() => {});
  const size = { width: 160, height: 90 };

  useEffect(() => {
    start(canvas.current, { ...size, still: true, settings: preview });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function play() {
    stop.current();
    stop.current = start(canvas.current, { ...size, settings: preview });
  }
  function pause() {
    stop.current();
    stop.current = () => {};
  }
  useEffect(() => () => stop.current(), []);

  return (
    <button
      type="button"
      className={'tile' + (picked ? ' picked' : '')}
      onClick={() => pickWallpaper(id)}
      onMouseEnter={play}
      onMouseLeave={pause}
      onFocus={play}
      onBlur={pause}
      aria-pressed={picked}
    >
      <span className="tile-preview matrix-preview">
        <canvas ref={canvas} className="matrix-canvas" />
      </span>
      <span className="tile-label">{title}</span>
      <span className="tile-author">{author}</span>
    </button>
  );
}

// The settings the Matrix tile uses: bigger glyphs would look like blobs at this size, so they are finer.
const MATRIX_PREVIEW = { ...matrixSettings({}), size: 8, depth: 2, trail: 12 };
const GRAVITY_PREVIEW = { ...gravitySettings({}), particles: 70, points: 2 };

// A picture (built in, or one you added) or a video you added. `id` is 'photo:...', 'upload:...' or 'video:...'.
// Things you added get a small × to delete them.
function MediaTile({ id, label, picked, onDelete }) {
  const isVideo = id.startsWith('video:');
  const url = useMediaUrl(id);

  return (
    <div className={'tile picture-tile' + (picked ? ' picked' : '')}>
      <button
        type="button"
        className="tile-hit"
        onClick={() => (isVideo ? pickWallpaper(id) : pickPicture(id))}
        aria-pressed={picked}
        aria-label={label}
      >
        <span className="tile-preview">
          {url && (isVideo ? <video src={url + '#t=0.5'} muted preload="metadata" /> : <img src={url} alt="" />)}
        </span>
        <span className="tile-label">{label}</span>
      </button>
      {onDelete && (
        <button type="button" className="tile-delete" aria-label={`Delete ${label}`} onClick={onDelete}>
          ×
        </button>
      )}
    </div>
  );
}


// ======================================================================
// THE GALLERY
// ======================================================================
const withoutExtension = (name) => name.replace(/\.[^.]+$/, '');

export default function Background() {
  const { wallpaper, theme } = useAppearance();
  const pictureId = usePictureId();
  const uploads = useUploads();

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');       // problems adding files
  const [dropping, setDropping] = useState(false);  // is a file being dragged over the gallery?
  const fileInput = useRef(null);

  // The search box filters every group by name.
  const search = query.trim().toLowerCase();
  const matches = (text) => !search || text.toLowerCase().includes(search);
  const showNone = matches('none');
  const showLiquid = matches('liquid glowing blobs built in');
  const showMatrix = matches('matrix falling code green rain built in');
  const showGravity = matches('gravity particles points space built in akimitsu hamamuro');
  const wallpapers = LIVELY.filter((item) => matches(`${item.title} ${item.author} ${item.desc}`));
  const photos = PICTURES.filter((picture) => matches(picture.title));
  const yours = uploads.filter((upload) => matches(upload.name));
  const nothing = !showNone && !showLiquid && !showMatrix && !showGravity && wallpapers.length + photos.length + yours.length === 0;

  async function addFiles(files) {
    setMessage('');
    const problems = await addMedia(files);
    if (problems.length) setMessage(problems.join(' '));
  }

  // A picture is "picked" while no wallpaper is on, or while the wallpaper is one that shows it (Rain, Liquid...).
  const pictureIsOn = (id) => pictureId === id && (wallpaper === OFF || usesPicture(wallpaper));

  return (
    <div
      className={'background' + (dropping ? ' dropping' : '')}
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDropping(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="wp-toolbar">
        <input
          className="field"
          type="search"
          placeholder="Search backgrounds…"
          aria-label="Search backgrounds"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="tile-grid">
        {showNone && <NoneTile picked={wallpaper === OFF && pictureId === NO_PICTURE} />}
        {showLiquid && <LiquidTile picked={wallpaper === LIQUID} theme={theme} />}
        {showMatrix && <CanvasTile id={MATRIX} title="Matrix" author="Built in" start={startMatrix} preview={MATRIX_PREVIEW} picked={wallpaper === MATRIX} />}
        {showGravity && <CanvasTile id={GRAVITY} title="Gravity" author="Akimitsu Hamamuro" start={startGravity} preview={GRAVITY_PREVIEW} picked={wallpaper === GRAVITY} />}
        {wallpapers.map((item) => (
          <WallpaperTile key={item.id} wallpaper={item} picked={wallpaper === 'lively:' + item.id} />
        ))}

        {photos.length > 0 && <h4 className="tile-group">Photos</h4>}
        {photos.map((picture) => (
          <MediaTile key={picture.id} id={'photo:' + picture.id} label={picture.title} picked={pictureIsOn('photo:' + picture.id)} />
        ))}

        <h4 className="tile-group">
          Yours <span>pictures and videos stay on this device. Drag files here, or add video wallpapers from{' '}
            <a href={LIVELY_SITE} target="_blank" rel="noreferrer">livelywallpaper.app</a>.</span>
        </h4>
        {yours.map((upload) => {
          const id = (upload.kind === 'video' ? 'video:' : 'upload:') + upload.id;
          const picked = upload.kind === 'video' ? wallpaper === id : pictureIsOn(id);
          return <MediaTile key={upload.id} id={id} label={withoutExtension(upload.name)} picked={picked} onDelete={() => deleteMedia(id)} />;
        })}
        {!search && (
          <button type="button" className="tile tile-add" onClick={() => fileInput.current.click()}>
            <span className="tile-preview">
              <span className="tile-off">+</span>
            </span>
            <span className="tile-label">Add</span>
          </button>
        )}
      </div>

      {nothing && <p className="hint">Nothing matches "{query}".</p>}
      {message && <p className="error">{message}</p>}

      <input
        ref={fileInput}
        className="file-hidden"
        type="file"
        accept="image/*,video/mp4,video/webm,video/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = ''; // so choosing the same file again still works
        }}
      />
    </div>
  );
}
