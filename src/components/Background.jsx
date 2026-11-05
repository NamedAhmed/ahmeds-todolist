// Background.jsx = ONE gallery for what can be behind the page (Settings > Style). Pick one:
//
//   None · the built-in photos · pictures and videos you added (a video plays as a wallpaper) · Add
//
// Pictures and videos you add stay on this device.

import { useRef, useState } from 'react';
import { NO_PICTURE, OFF, addMedia, deleteMedia, pickPicture, pickWallpaper, useAppearance, useMediaUrl, usePictureId, useUploads } from '../appearance.js';
import { PICTURES } from '../wallpapers/pictures.js';


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
  const { wallpaper } = useAppearance();
  const pictureId = usePictureId();
  const uploads = useUploads();

  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');       // problems adding files
  const [dropping, setDropping] = useState(false);  // is a file being dragged over the gallery?
  const fileInput = useRef(null);

  // The search box filters by name.
  const search = query.trim().toLowerCase();
  const matches = (text) => !search || text.toLowerCase().includes(search);
  const showNone = matches('none');
  const photos = PICTURES.filter((picture) => matches(picture.title));
  const yours = uploads.filter((upload) => matches(upload.name));
  const nothing = !showNone && photos.length + yours.length === 0;

  async function addFiles(files) {
    setMessage('');
    const problems = await addMedia(files);
    if (problems.length) setMessage(problems.join(' '));
  }

  // A picture is "picked" while no video is playing over it.
  const pictureIsOn = (id) => pictureId === id && wallpaper === OFF;

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
        {photos.map((picture) => (
          <MediaTile key={picture.id} id={'photo:' + picture.id} label={picture.title} picked={pictureIsOn('photo:' + picture.id)} />
        ))}
        {yours.map((upload) => {
          const id = (upload.kind === 'video' ? 'video:' : 'upload:') + upload.id;
          const picked = upload.kind === 'video' ? wallpaper === id : pictureIsOn(id);
          return <MediaTile key={upload.id} id={id} label={withoutExtension(upload.name)} picked={picked} onDelete={() => deleteMedia(id)} />;
        })}
        {!search && (
          <button type="button" className="tile tile-add" onClick={() => fileInput.current.click()} title="Add your own pictures or videos. They stay on this device.">
            <span className="tile-preview">
              <span className="tile-off">+</span>
            </span>
            <span className="tile-label">Add</span>
          </button>
        )}
      </div>

      {nothing && <p className="hint">Nothing matches "{query}".</p>}
      {message && <p className="error">{message}</p>}
      <p className="hint">Add your own pictures and videos, or drag them here. They stay on this device.</p>

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
