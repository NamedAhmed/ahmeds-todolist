// Look.jsx = the tabs of Settings, one export each:
//
//   StyleTab       Theme with its main colour, four panels (Font, Text colour, the theme's own settings, and More: text size,
//                  corners, density and accent colour), and Background (None, the photos, and your own pictures and videos)
//   GeneralTab     Tasks layout, Notes editor, Notifications, Keyboard, and Reset appearance
//
// Everything here is saved with setAppearance() so it syncs between your devices (pictures and videos stay on this device).
// The rest of the look is automatic: readability over a background (Wallpaper.jsx), the Liquid theme's glass, and each
// theme's own fire (appearance.css).

import { useEffect, useState } from 'react';
import Icon from './Icons.jsx';
import Background from './Background.jsx';
import Slider from './Slider.jsx';
import Switch from './Switch.jsx';
import { disablePush, enablePush, pushEnabled, pushSupported, sendTestPush } from '../push.js';
import { ACCENT_COLORS, CORNERS, DENSITIES, FONTS, LIGHT_THEMES, MAIN_COLORS, TEXT_COLORS, TEXT_SIZES, THEMES, THEME_OPTIONS, contrastBetween, loadAllFonts, resetAppearance, setAppearance, useAppearance } from '../appearance.js';


// ======================================================================
// THEME CARDS
// ======================================================================
// Each card carries its own data-theme attribute, so the CSS draws it in that theme (its colours,
// corner shapes and fonts), whatever theme is active now.
export function ThemeCard({ id, label, picked }) {
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
// One font choice: just "Aa" in its own typeface; the name shows when you hover (and is read out by a screen reader).
function FontChoice({ preset, picked }) {
  return (
    <button
      type="button"
      className={'font-choice' + (picked ? ' picked' : '')}
      aria-pressed={picked}
      aria-label={preset.label}
      title={preset.label}
      onClick={() => setAppearance({ font: preset.id })}
    >
      <span className="font-sample" style={{ fontFamily: preset.serif }}>
        Aa
      </span>
    </button>
  );
}


// ======================================================================
// COLOUR ROWS
// ======================================================================
// "Theme" (the theme's own), some swatches, and a box that takes any colour. Used by Text colour, Main colour and Accent.
function ColourRow({ value, colours, onPick, label }) {
  return (
    <span className="text-colors">
      <button type="button" className={'text-swatch theme-swatch' + (value ? '' : ' picked')} aria-pressed={!value} onClick={() => onPick('')}>
        Theme
      </button>
      {colours.map((color) => (
        <button
          key={color}
          type="button"
          className={'text-swatch' + (value === color ? ' picked' : '')}
          style={{ background: color }}
          title={color}
          aria-label={`${label} ${color}`}
          aria-pressed={value === color}
          onClick={() => onPick(color)}
        />
      ))}
      <input type="color" className="color" aria-label={`Custom ${label.toLowerCase()}`} value={value || '#808080'} onChange={(event) => onPick(event.target.value)} />
    </span>
  );
}

// The colour the page is currently drawn with (a theme's variable, as #rrggbb, or '' if it is not plain).
function pageColour(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '';
}

function TextColour({ textColor }) {
  const background = pageColour('--bg');
  const hard = textColor && background && contrastBetween(textColor, background) < 3;
  return (
    <section>
      <h3 className="mono">Text colour</h3>
      <ColourRow value={textColor} colours={TEXT_COLORS} onPick={(color) => setAppearance({ textColor: color })} label="Text colour" />
      {hard && <p className="hint">That colour is hard to read on this theme.</p>}
    </section>
  );
}

// The page's own colour, under the theme cards. The panels and fields follow it.
function MainColour({ theme, mainColor, textColor }) {
  const colours = MAIN_COLORS[LIGHT_THEMES.includes(theme) ? 'light' : 'dark'];
  const text = textColor || pageColour('--text');
  const hard = mainColor && text && contrastBetween(text, mainColor) < 3;
  return (
    <section>
      <h3 className="mono">Main colour</h3>
      <ColourRow value={mainColor} colours={colours} onPick={(color) => setAppearance({ mainColor: color })} label="Main colour" />
      <p className="hint">{hard ? 'The text is hard to read on that colour: change the text colour too.' : 'The colour of the page. The panels and fields follow it.'}</p>
    </section>
  );
}


// ======================================================================
// THE THEME'S OWN TWO SETTINGS
// ======================================================================
// Every theme has two (see THEME_OPTIONS in appearance.js): a colour, an on/off switch or a slider.
function ThemeOptions({ theme, opts }) {
  const name = THEMES.find(([id]) => id === theme)?.[1];
  const set = (key, value) => setAppearance({ [`${theme}_${key}`]: value });
  return (
    <section>
      <h3 className="mono">{name}</h3>
      <div className="option-list">
        {THEME_OPTIONS[theme].map((o) => (
          <div key={o.key} className="option-row">
            <span className="mono">{o.label}</span>
            {o.kind === 'switch' && (
              <span className="control-cell">
                <Switch checked={opts[o.key]} onChange={(on) => set(o.key, on)} />
              </span>
            )}
            {o.kind === 'slider' && (
              <span className="control-cell">
                <Slider min={o.min} max={o.max} step={o.step} value={opts[o.key]} onChange={(event) => set(o.key, Number(event.target.value))} aria-label={o.label} />
                <span className="mono value">
                  {opts[o.key]}
                  {o.unit}
                </span>
              </span>
            )}
            {o.kind === 'swatch' && (
              <span className="text-colors">
                {o.choices.map(([id, label, colour]) => (
                  <button
                    key={id}
                    type="button"
                    className={'text-swatch' + (opts[o.key] === id ? ' picked' : '')}
                    style={{ background: colour ?? id }}
                    title={label}
                    aria-label={`${o.label}: ${label}`}
                    aria-pressed={opts[o.key] === id}
                    onClick={() => set(o.key, id)}
                  />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}


// ======================================================================
// MORE: TEXT SIZE, CORNERS, DENSITY AND ACCENT COLOUR
// ======================================================================
function Choice({ value, options, onPick, label }) {
  return (
    <span className="seg-row" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" className={'chip' + (value === id ? ' solid' : '')} aria-pressed={value === id} onClick={() => onPick(id)}>
          {text}
        </button>
      ))}
    </span>
  );
}

function More({ textSize, corners, density, accent }) {
  return (
    <section>
      <h3 className="mono">More</h3>
      <div className="option-list">
        <div className="option-row">
          <span className="mono">Text size</span>
          <Choice label="Text size" value={textSize} options={TEXT_SIZES} onPick={(v) => setAppearance({ textSize: v })} />
        </div>
        <div className="option-row">
          <span className="mono">Corners</span>
          <Choice label="Corner roundness" value={corners} options={CORNERS} onPick={(v) => setAppearance({ corners: v })} />
        </div>
        <div className="option-row">
          <span className="mono">Density</span>
          <Choice label="Density" value={density} options={DENSITIES} onPick={(v) => setAppearance({ density: v })} />
        </div>
        <div className="option-row">
          <span className="mono">Accent</span>
          <ColourRow value={accent} colours={ACCENT_COLORS} onPick={(color) => setAppearance({ accent: color })} label="Accent colour" />
        </div>
      </div>
    </section>
  );
}


// ======================================================================
// THE TABS
// ======================================================================
export function StyleTab() {
  const { theme, font, textColor, mainColor, accent, textSize, corners, density, opts } = useAppearance();

  // Fonts are downloaded when needed, so download them all now and every preview shows its own font.
  useEffect(() => {
    loadAllFonts();
  }, []);

  return (
    <div className="look">
      <div className="look-top">
        <div className="look-main">
          <section>
            <h3 className="mono">Theme</h3>
            <div className="theme-row">
              {THEMES.map(([id, label]) => (
                <ThemeCard key={id} id={id} label={label} picked={theme === id} />
              ))}
            </div>
          </section>
          <MainColour theme={theme} mainColor={mainColor} textColor={textColor} />
        </div>

        <div className="look-quad">
          <section>
            <h3 className="mono">Font</h3>
            <div className="font-row">
              {FONTS.map((preset) => (
                <FontChoice key={preset.id} preset={preset} picked={font === preset.id} />
              ))}
            </div>
          </section>
          <TextColour textColor={textColor} />
          <ThemeOptions theme={theme} opts={opts} />
          <More textSize={textSize} corners={corners} density={density} accent={accent} />
        </div>
      </div>

      <section>
        <h3 className="mono">Background</h3>
        <Background />
      </section>
    </div>
  );
}

// Settings > General > Notifications: turn push on for this device, and when to notify for tasks that only have a day.
function Notifications({ defaultTime, lead }) {
  const [on, setOn] = useState(pushEnabled);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action) {
    setBusy(true);
    setMessage((await action()) || '');
    setOn(pushEnabled());
    setBusy(false);
  }

  return (
    <section>
      <h3 className="mono">Notifications</h3>
      <div className="seg-row">
        {on ? (
          <>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(sendTestPush)}>
              Send a test
            </button>
            <button type="button" className="btn-ghost danger" disabled={busy} onClick={() => run(disablePush)}>
              Turn off on this device
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost" disabled={busy || !pushSupported()} onClick={() => run(enablePush)}>
            Turn on notifications
          </button>
        )}
      </div>
      <div className="readability">
        <label className="range-row auto-row">
          <span className="mono">Day only</span>
          <input
            type="time"
            className="field"
            value={defaultTime}
            onChange={(event) => setAppearance({ pushDefaultTime: event.target.value })}
            aria-label="Time to notify for tasks and reminders that only have a day"
          />
          <span className="auto-note">when to notify for things that have a day but no time (clear it for no notification)</span>
        </label>
      </div>
      <div className="readability">
        <label className="range-row auto-row">
          <span className="mono">Warn me</span>
          <select className="field" value={lead} onChange={(event) => setAppearance({ pushLead: Number(event.target.value) })} aria-label="Extra notification before the time">
            {[[0, 'No warning'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before']].map(([minutes, label]) => (
              <option key={minutes} value={minutes}>
                {label}
              </option>
            ))}
          </select>
          <span className="auto-note">an extra notification ahead of tasks and reminders that have a time (repeating ones too)</span>
        </label>
      </div>
      {message && <p className="error">{message}</p>}
      {!pushSupported() && (
        <p className="hint">
          {/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone
            ? 'On an iPhone: tap Share, then "Add to Home Screen", and open the app from there to turn notifications on.'
            : "This browser can't show notifications."}
        </p>
      )}
      <p className="hint">
        Tasks with a due time and reminders with a time notify you then, on this device and any other you turn it on for, even with the app closed.
        Needs an account (the Account button). On an iPhone, add the app to the Home Screen first.
      </p>
    </section>
  );
}

export function GeneralTab() {
  const { taskGroups, showRepeating, pushDefaultTime, noteEditor, pushLead } = useAppearance();
  const openWindow = (name) => window.dispatchEvent(new CustomEvent('todolist:open-modal', { detail: name }));

  return (
    <div className="look">
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
        <h3 className="mono">Notes editor</h3>
        <div className="seg-row" role="radiogroup" aria-label="Notes editor">
          {[
            ['rich', 'Rich'],
            ['blocks', 'Blocks'],
            ['markdown', 'Markdown'],
          ].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={noteEditor === id} className={'chip' + (noteEditor === id ? ' solid' : '')} onClick={() => setAppearance({ noteEditor: id })}>
              {label}
            </button>
          ))}
        </div>
        <p className="hint">
          Rich: like a word processor, select across lines freely. Blocks: move blocks by their handle, "/" menu. Markdown: plain text with # and - and **bold**.
          Every note opens in any of them, and nothing in it changes when you switch.
        </p>
      </section>

      <Notifications defaultTime={pushDefaultTime} lead={pushLead} />

      <section>
        <h3 className="mono">Keyboard</h3>
        <div className="seg-row">
          <button type="button" className="btn-ghost" onClick={() => openWindow('keys')}>
            <Icon name="help" size={16} /> Keyboard shortcuts
          </button>
        </div>
      </section>

      <section>
        <h3 className="mono">Reset</h3>
        <div className="seg-row">
          <button type="button" className="btn-ghost danger" onClick={resetAppearance}>
            Reset appearance
          </button>
        </div>
        <p className="hint">Puts the theme, font and background back to how they started. Your tasks and notes are not touched.</p>
      </section>
    </div>
  );
}
