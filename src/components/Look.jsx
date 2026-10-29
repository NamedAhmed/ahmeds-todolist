// Look.jsx = the tabs of Settings, one export each:
//
//   StyleTab       Theme, Font, and Background (None, the photos, and your own pictures and videos)
//   GeneralTab     Tasks layout, Notes editor, Notifications, Keyboard, and Reset appearance
//
// Everything here is saved with setAppearance() so it syncs between your devices (pictures and videos stay on this device).
// The rest of the look is automatic: readability over a background (Wallpaper.jsx), the Liquid theme's glass, and each
// theme's own fire (appearance.css).

import { useEffect, useState } from 'react';
import Icon from './Icons.jsx';
import Background from './Background.jsx';
import Switch from './Switch.jsx';
import { disablePush, enablePush, pushEnabled, pushSupported, sendTestPush } from '../push.js';
import { FONTS, THEMES, loadAllFonts, resetAppearance, setAppearance, useAppearance } from '../appearance.js';


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


// ======================================================================
// THE TABS
// ======================================================================
export function StyleTab() {
  const { theme, font } = useAppearance();

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
