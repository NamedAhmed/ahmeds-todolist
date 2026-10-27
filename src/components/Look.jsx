// Look.jsx = the appearance tabs of Settings, one export each:
//
//   StyleTab       Theme, Font, Glass look (Liquid theme only), and Text & readability
//   WallpaperTab   one gallery: None, Liquid, Lively wallpapers, photos, and your own pictures and videos,
//                  with the settings of the wallpaper you picked right under it
//   GeneralTab     Fire (the flames around a finished ring), Tasks layout, Reduce motion, and Reset appearance
//
// Everything here is saved with setAppearance() so it syncs between your devices (pictures and videos stay on this device).

import { useEffect } from 'react';
import Background from './Background.jsx';
import Slider from './Slider.jsx';
import Switch from './Switch.jsx';
import WallpaperSettings from './WallpaperSettings.jsx';
import FireArt from './FireArt.jsx';
import { FIRE_COLORS, FIRE_COVERAGES, FIRE_STYLES, fireColorStyle } from '../fire.js';
import { FONTS, MAX_DIM, MAX_GLASS, THEMES, loadAllFonts, resetAppearance, resetGlassLook, setAppearance, setGlassLook, useAppearance } from '../appearance.js';


// ======================================================================
// THEME CARDS
// ======================================================================
// Each card carries its own data-theme attribute, so the CSS draws it in that theme (its colours,
// corner shapes and fonts), whatever theme is active now.
function ThemeCard({ id, label, picked }) {
  return (
    <button type="button" className={'theme-card' + (picked ? ' picked' : '')} data-theme={id} onClick={() => setAppearance({ theme: id })}>
      <span className="theme-card-sample">
        <i className="dot" />
        <i className="bar" />
        <i className="bar short" />
      </span>
      <span className="tile-label">{label}</span>
    </button>
  );
}


// ======================================================================
// FONT CHOICES
// ======================================================================
// One font choice, shown in its own typeface so you can see what you are choosing.
// "Theme default" has no fonts of its own: it uses whatever the page uses now.
function FontChoice({ preset, picked }) {
  return (
    <button
      type="button"
      className={'font-choice' + (picked ? ' picked' : '')}
      aria-pressed={picked}
      onClick={() => setAppearance({ font: preset.id })}
    >
      <span className="font-sample" style={preset.serif ? { fontFamily: preset.serif } : undefined}>
        Aa
      </span>
      <span className="font-name" style={preset.sans ? { fontFamily: preset.sans } : undefined}>
        {preset.label}
      </span>
    </button>
  );
}


// One fire style, drawn small, in the colours chosen now (or the theme's own).
function FireStyleCard({ style, color, coverage, picked }) {
  return (
    <button
      type="button"
      className={'fire-style' + (picked ? ' picked' : '') + (color === 'rainbow' ? ' fire-rainbow' : '')}
      style={fireColorStyle(color)}
      aria-pressed={picked}
      onClick={() => setAppearance({ fireStyle: style.id })}
    >
      <svg viewBox={coverage === 'around' ? '-46 -46 292 292' : '0 -48 200 148'} aria-hidden="true">
        <FireArt style={style.id} coverage={coverage} still />
        {coverage === 'around' ? <circle className="fire-sample-ring" cx="100" cy="100" r="95" /> : <path className="fire-sample-ring" d="M5 100A95 95 0 0 1 195 100" />}
      </svg>
      <span className="tile-label">{style.label}</span>
    </button>
  );
}

// The sliders for the Liquid theme's glass: [setting, name].
const GLASS_CONTROLS = [
  ['frost', 'Frost'],
  ['vibrancy', 'Vibrancy'],
  ['shine', 'Shine'],
  ['depth', 'Depth'],
  ['round', 'Corners'],
];

// Quick choices for the text colour (the colour box next to them takes any other).
const TEXT_COLORS = ['#ffffff', '#f3ead9', '#ffd9a0', '#bfe3ff', '#b8ffc8', '#111111'];


// ======================================================================
// THE TABS
// ======================================================================
export function StyleTab() {
  const { theme, font, dim, glass, autoFix, textColor, look } = useAppearance();

  // Fonts are downloaded when needed, so download them all now and every preview shows its own font.
  useEffect(() => {
    loadAllFonts();
  }, []);

  return (
    <div className="look">
      <div className="look-top">
        <section>
          <h3 className="mono">Theme</h3>
          <div className="theme-row">
            {THEMES.map(([id, label]) => (
              <ThemeCard key={id} id={id} label={label} picked={theme === id} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mono">Font</h3>
          <div className="font-row">
            {FONTS.map((preset) => (
              <FontChoice key={preset.id} preset={preset} picked={font === preset.id} />
            ))}
          </div>
        </section>
      </div>

      {theme === 'liquid' && (
        <section>
          <h3 className="mono">Glass look</h3>
          <div className="readability">
            {GLASS_CONTROLS.map(([key, name]) => (
              <label key={key} className="range-row">
                <span className="mono">{name}</span>
                <Slider min={0} max={100} value={Math.round(look[key] * 100)} onChange={(event) => setGlassLook({ [key]: event.target.value / 100 })} />
                <span className="mono">{Math.round(look[key] * 100)}%</span>
              </label>
            ))}
          </div>
          <p className="hint">
            Frost blurs the background, Vibrancy makes its colours richer, Shine is the light on the edges, Depth is the shadow under the panels.{' '}
            <button type="button" className="link-button" onClick={resetGlassLook}>
              Reset glass
            </button>
          </p>
        </section>
      )}

      <section>
        <h3 className="mono">Text &amp; readability</h3>
        <div className="readability">
          <div className="range-row text-row">
            <span className="mono">Text</span>
            <span className="text-colors">
              <button
                type="button"
                className={'text-swatch theme-swatch' + (textColor ? '' : ' picked')}
                aria-pressed={!textColor}
                onClick={() => setAppearance({ textColor: '' })}
              >
                Theme
              </button>
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={'text-swatch' + (textColor === color ? ' picked' : '')}
                  style={{ background: color }}
                  title={color}
                  aria-label={`Text colour ${color}`}
                  aria-pressed={textColor === color}
                  onClick={() => setAppearance({ textColor: color })}
                />
              ))}
              <input
                type="color"
                className="color"
                aria-label="Custom text colour"
                value={textColor || '#ffffff'}
                onChange={(event) => setAppearance({ textColor: event.target.value })}
              />
            </span>
          </div>
          <label className="range-row auto-row">
            <span className="mono">Auto</span>
            <Switch checked={autoFix} onChange={(on) => setAppearance({ autoFix: on })} />
            <span className="auto-note">adds just enough backing to keep text readable over any background</span>
          </label>
          {/* The Liquid theme lays nothing over the page, so there is no Dim there. */}
          {theme !== 'liquid' && (
            <label className="range-row">
              <span className="mono">Dim</span>
              <Slider min={0} max={Math.round(MAX_DIM * 100)} value={Math.round(dim * 100)} onChange={(event) => setAppearance({ dim: event.target.value / 100 })} />
              <span className="mono">{Math.round(dim * 100)}%</span>
            </label>
          )}
          <label className="range-row">
            <span className="mono">{theme === 'liquid' ? 'Backing' : 'Glass'}</span>
            <Slider min={0} max={Math.round(MAX_GLASS * 100)} value={Math.round(glass * 100)} onChange={(event) => setAppearance({ glass: event.target.value / 100 })} />
            <span className="mono">{Math.round(glass * 100)}%</span>
          </label>
        </div>
        <p className="hint">
          {theme === 'liquid'
            ? 'Liquid shows the background untouched. If text is hard to read over a bright background, change the text colour or raise Backing.'
            : 'Dim darkens the background. Glass frosts the panels behind the text. Turn them up, or change the text colour, if text is hard to read.'}
        </p>
      </section>
    </div>
  );
}

export function WallpaperTab() {
  return (
    <div className="look">
      <Background />
      <WallpaperSettings />
    </div>
  );
}

export function GeneralTab() {
  const { fireStyle, fireColor, fireCoverage, reduceMotion, taskGroups, showRepeating } = useAppearance();

  return (
    <div className="look">
      <section>
        <h3 className="mono">Celebration fire</h3>
        <div className="fire-row">
          {FIRE_STYLES.map((style) => (
            <FireStyleCard key={style.id} style={style} color={fireColor} coverage={fireCoverage} picked={fireStyle === style.id} />
          ))}
        </div>
        <div className="fire-coverage" role="group" aria-label="Where the fire is">
          {FIRE_COVERAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={'fire-where' + (fireCoverage === item.id ? ' picked' : '')}
              aria-pressed={fireCoverage === item.id}
              onClick={() => setAppearance({ fireCoverage: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="fire-colors" role="group" aria-label="Fire colour">
          {FIRE_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              className={'fire-swatch' + (fireColor === color.id ? ' picked' : '') + (color.id === 'rainbow' ? ' fire-rainbow' : '')}
              style={color.a ? { background: `linear-gradient(135deg, ${color.a} 50%, ${color.b} 50%)` } : undefined}
              title={color.label}
              aria-label={color.label}
              aria-pressed={fireColor === color.id}
              onClick={() => setAppearance({ fireColor: color.id })}
            >
              {!color.a && <span className="mono">Theme</span>}
            </button>
          ))}
        </div>
        <p className="hint">The flames that rise around the big ring when every daily is done.</p>
      </section>

      <section>
        <h3 className="mono">Tasks</h3>
        <div className="readability">
          <label className="range-row auto-row">
            <span className="mono">Groups</span>
            <Switch checked={taskGroups} onChange={(on) => setAppearance({ taskGroups: on })} />
            <span className="auto-note">sections (Today, Next 7 days, Next month, Later, No due date) instead of the time-period switcher</span>
          </label>
          <label className="range-row auto-row">
            <span className="mono">Repeating</span>
            <Switch checked={showRepeating} onChange={(on) => setAppearance({ showRepeating: on })} />
            <span className="auto-note">show repeating reminders in the task list</span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="mono">Motion</h3>
        <label className="range-row auto-row">
          <span className="mono">Reduce</span>
          <Switch checked={reduceMotion} onChange={(on) => setAppearance({ reduceMotion: on })} />
          <span className="auto-note">calmer, shorter animations in the app (your device's own setting is always respected)</span>
        </label>
      </section>

      <section>
        <h3 className="mono">Reset</h3>
        <div className="seg-row">
          <button type="button" className="btn-ghost danger" onClick={resetAppearance}>
            Reset appearance
          </button>
        </div>
        <p className="hint">Puts the theme, font, text colour, glass, wallpaper, fire and motion back to how they started. Your tasks and notes are not touched.</p>
      </section>
    </div>
  );
}
