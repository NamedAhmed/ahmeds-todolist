// WallpaperSettings.jsx = the settings card for the wallpaper you picked (shown under the gallery).
//
// For a Lively wallpaper (or the built-in Liquid) it lists that wallpaper's own settings (sliders, switches, colours...), made from
// its LivelyProperties.json, like in the Lively app. A wallpaper you can see through (Liquid, Triangles & Light)
// also gets "Picture behind", so a picture can sit under it.

import { useState } from 'react';
import Select from './Select.jsx';
import Slider from './Slider.jsx';
import Switch from './Switch.jsx';
import {
  LIQUID,
  GRAVITY,
  GRAVITY_INFO,
  LIQUID_INFO,
  MATRIX,
  MATRIX_INFO,
  findLively,
  resetWallpaperValues,
  setWallpaperValue,
  takesPicture,
  useAppearance,
  useWallpaperValues,
  valueOf,
} from '../appearance.js';

// ======================================================================
// THE CONTROLS
// ======================================================================
// "pexels-neosiam-601798.jpg" -> "Pexels neosiam": a file name made readable.
function friendlyName(file) {
  const name = file.replace(/\.[^.]+$/, '').replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

// The list in a "pick a file" setting: the files that come with the wallpaper.
// (A setting that takes a picture is not listed at all: the picture is chosen in the gallery.)
function folderGroups(wallpaper, property) {
  return [
    {
      label: 'With this wallpaper',
      options: property.files.map((file) => ({
        value: file,
        label: friendlyName(file),
        thumb: IMAGE_FILE.test(file) ? `/lively/${wallpaper.id}/${property.folder}/${file}` : undefined,
      })),
    },
  ];
}

// One control, made from one entry of the wallpaper's LivelyProperties.json.
// property.type is one of: slider, checkbox, dropdown, folderDropdown, color, label.
function Control({ wallpaper, property, values }) {
  const value = valueOf(property, values);
  const change = (newValue) => setWallpaperValue(wallpaper.id, property.name, newValue);

  if (property.type === 'label') return <h4 className="prop-label">{property.text}</h4>;

  let control = null;

  if (property.type === 'slider') {
    control = (
      <>
        <Slider min={property.min} max={property.max} step={property.step ?? 1} value={value} onChange={(event) => change(Number(event.target.value))} />
        <span className="mono prop-value">{value}</span>
      </>
    );
  } else if (property.type === 'checkbox') {
    control = <Switch checked={!!value} onChange={change} />;
  } else if (property.type === 'dropdown') {
    const options = property.items.map((item, index) => ({ value: index, label: item }));
    control = <Select value={value} groups={[{ options }]} onChange={change} />;
  } else if (property.type === 'folderDropdown') {
    control = <Select value={value} groups={folderGroups(wallpaper, property)} onChange={change} />;
  } else if (property.type === 'color') {
    control = (
      <>
        <span className="mono prop-value">{String(value).slice(0, 7)}</span>
        <input type="color" className="color" value={String(value).slice(0, 7)} onChange={(event) => change(event.target.value)} />
      </>
    );
  } else {
    return null; // a kind of setting this app doesn't show (buttons, text boxes)
  }

  return (
    <label className="prop">
      <span className="prop-name">{property.text}</span>
      <span className="prop-control">{control}</span>
    </label>
  );
}


// ======================================================================
// THE CARD
// ======================================================================
// How many settings are shown before "More settings". Wallpapers list their most useful ones first.
const SETTINGS_SHOWN = 6;

function Card({ wallpaper }) {
  const values = useWallpaperValues(wallpaper.id);
  const [expanded, setExpanded] = useState(false);
  const showsPicture = wallpaper.seeThrough || wallpaper.properties.some(takesPicture);
  const licenseUrl = wallpaper.licenseFile ? `/lively/${wallpaper.id}/${wallpaper.licenseFile}` : null;

  // The settings to list ("debug" is for the wallpaper's author, so it is left out).
  const properties = wallpaper.properties.filter((property) => property.name !== 'debug' && !takesPicture(property));
  const visible = expanded ? properties : properties.slice(0, SETTINGS_SHOWN);
  const hiddenCount = properties.length - visible.length;

  return (
    <section className="customize">
      <header className="customize-head">
        <div className="customize-title">
          <h3>{wallpaper.title}</h3>
          <p className="customize-meta">
            {wallpaper.author}
            {licenseUrl && (
              <>
                <span aria-hidden="true"> · </span>
                <a href={licenseUrl} target="_blank" rel="noreferrer">
                  License
                </a>
              </>
            )}
            {wallpaper.contact && (
              <>
                <span aria-hidden="true"> · </span>
                <a href={wallpaper.contact} target="_blank" rel="noreferrer">
                  Source
                </a>
              </>
            )}
          </p>
        </div>
        {properties.length > 0 && (
          <button type="button" className="btn-ghost" onClick={() => resetWallpaperValues(wallpaper)}>
            Reset
          </button>
        )}
      </header>

      <div className="props">
        {visible.map((property) => (
          <Control key={property.name} wallpaper={wallpaper} property={property} values={values} />
        ))}
      </div>
      {showsPicture && <p className="hint">Its picture is the photo picked in the gallery above.</p>}

      {properties.length > SETTINGS_SHOWN && (
        <button type="button" className="more-settings" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? 'Fewer settings' : `More settings (${hiddenCount})`}
        </button>
      )}
    </section>
  );
}

// Shows the card for the wallpaper that is on now (nothing for "off" or a video, which have no settings).
export default function WallpaperSettings() {
  const { wallpaper } = useAppearance();
  if (wallpaper === LIQUID) return <Card wallpaper={LIQUID_INFO} />;
  if (wallpaper === MATRIX) return <Card wallpaper={MATRIX_INFO} />;
  if (wallpaper === GRAVITY) return <Card wallpaper={GRAVITY_INFO} />;

  const lively = findLively(wallpaper);
  return lively ? <Card wallpaper={lively} /> : null;
}
