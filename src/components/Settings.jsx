// Settings.jsx = the Settings sheet (three tabs) and the Account window.
//
//   Style       theme, font, text colour and readability (Look.jsx)
//   Wallpaper   the background gallery and the settings of the one you picked (Look.jsx)
//   General     fire, reduce motion and reset (Look.jsx)
//
// The Account window (signing in to sync your tasks between devices, and downloading a backup) opens from
// the Account button in the Calendar column's footer.
//
// It slides up from the bottom without covering the page (Sheet.jsx), so changes show up live.

import { useRef, useState } from 'react';
import { exportJson, importJson } from '../store.js';
import { PREVIOUS_BACKUP, sendCode, signOut, supabase, syncNow, useSync, verifyCode } from '../sync.js';
import { quip } from '../lib.js';
import Icon from './Icons.jsx';
import { GeneralTab, StyleTab, WallpaperTab } from './Look.jsx';
import Sheet from './Sheet.jsx';
import { toast } from './Fire.jsx';
import { Modal } from './Modals.jsx';


// ======================================================================
// ACCOUNT
// ======================================================================
// The sign-in part. How signing in works:
//   1. You type your email and press "Email me" -> sendCode() asks Supabase to email you.
//   2. The email has a link AND a code. Click the link, or type the code here -> verifyCode().
//   3. Once signed in, sync.js takes over and keeps your data in sync.
function Account() {
  const sync = useSync(); // { user, sync: 'signed-out' | 'syncing' | 'synced' | 'error' | 'off', error }

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);   // has the email been sent yet?
  const [busy, setBusy] = useState(false);   // waiting for the server?
  const [error, setError] = useState('');    // an error message to show

  // No Supabase keys in the settings file (.env.local): syncing is switched off.
  if (!supabase) {
    return <p className="hint">Sync is off: this copy has no Supabase keys, so everything stays in this browser.</p>;
  }

  // Already signed in: show who you are, plus Sync now and Sign out buttons.
  if (sync.user) {
    let statusText;
    if (sync.sync === 'syncing') statusText = 'Syncing…';
    else if (sync.sync === 'error') statusText = `Sync failed: ${sync.error}`;
    else statusText = 'Everything is synced.';

    return (
      <div className="stack">
        <p className="hint">
          Signed in as <b>{sync.user.email}</b>. {statusText}
        </p>
        <div className="seg-row">
          <button className="btn-ghost" onClick={syncNow}>
            Sync now
          </button>
          <button className="btn-ghost danger" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Run a slow action (talking to the server) while showing "Hold on…" and catching any error.
  async function runWithStatus(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || String(err));
    }
    setBusy(false);
  }

  // Runs when you press Enter or the main button.
  function submit(event) {
    event.preventDefault();

    if (sent) {
      // Step 2: check the code you typed.
      runWithStatus(async () => {
        await verifyCode(email, code.trim());
        toast(quip('synced'));
      });
    } else {
      // Step 1: send the email.
      runWithStatus(async () => {
        await sendCode(email);
        setSent(true);
      });
    }
  }

  // Go back to step 1 so you can use a different email.
  function useAnotherEmail() {
    setSent(false);
    setCode('');
  }

  // Text for the main button.
  let buttonText;
  if (busy) buttonText = 'Hold on…';
  else if (sent) buttonText = 'Sign in';
  else buttonText = 'Email me';

  return (
    <form className="stack" onSubmit={submit}>
      <p className="hint">
        {sent
          ? 'Check your email. Click the link in it, or type the code here.'
          : 'Sign in to sync between your laptop and phone. No password, just an email.'}
      </p>

      <input
        className="field"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        disabled={sent}
      />

      {/* The code box only appears after the email was sent */}
      {sent && (
        <input
          className="field"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Code from the email"
          aria-label="Code"
        />
      )}

      {error && <p className="error">{error}</p>}

      <div className="seg-row">
        <button className="btn-add" type="submit" disabled={busy}>
          {buttonText}
        </button>
        {sent && (
          <button type="button" className="btn-ghost" onClick={useAnotherEmail}>
            Use another email
          </button>
        )}
      </div>
    </form>
  );
}


// Backups get their own folder. Browsers that can (Chrome, Edge) ask where to save the first time and then
// remember that folder (that is what the picker `id` does), and Restore opens in the same folder.
// Safari, Firefox and phones can't choose a folder, so there it is an ordinary download and file chooser.
const BACKUP_PICKER = { id: 'todolist-backups', types: [{ description: 'Todolist backup', accept: { 'application/json': ['.json'] } }] };

// "ahmeds-todolist-backup-14-05-24-10-26.json": hour-minute-day-month-year.
function backupName(now = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  const stamp = [now.getHours(), now.getMinutes(), now.getDate(), now.getMonth() + 1, now.getFullYear() % 100].map(two).join('-');
  return `ahmeds-todolist-backup-${stamp}.json`;
}

// "Download a backup": saves into the backup folder, or (where the browser can't) makes a temporary link and clicks it.
async function downloadBackup() {
  const name = backupName();
  const text = exportJson();

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ ...BACKUP_PICKER, suggestedName: name });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (error) {
      if (error.name === 'AbortError') return; // you closed the save window: nothing to do
      // Any other failure (for example a page where the picker is blocked): save as a normal download instead.
    }
  }

  const file = new Blob([text], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

// "Restore a backup": reads the .json file you pick and puts its tasks, notes and dailies back (see importJson in store.js).
// Nothing is deleted: an item with the same id is replaced, the rest is added. Ctrl+Z (or the toast's Undo) undoes it all.
function RestoreBackup() {
  const input = useRef(null);
  const [error, setError] = useState('');

  async function restore(file) {
    setError('');
    if (file.size > 20 * 1024 * 1024) {
      setError('That file is too big to be a backup.');
      return;
    }
    try {
      const { added, replaced } = importJson(await file.text());
      const parts = [added && `${added} added`, replaced && `${replaced} replaced`].filter(Boolean);
      toast(`Backup restored: ${parts.join(', ')}.`, { undoable: true });
    } catch (err) {
      setError(err.message || String(err));
    }
  }

  // Open the backup folder to choose from, or (where the browser can't) the ordinary file chooser.
  async function choose() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker(BACKUP_PICKER);
        restore(await handle.getFile());
        return;
      } catch (error) {
        if (error.name === 'AbortError') return; // you closed the window: nothing to do
        // Any other failure: use the ordinary chooser below.
      }
    }
    input.current.click();
  }

  return (
    <>
      <button className="btn-ghost" onClick={choose} aria-label="Restore a backup" title="Restore a backup">
        <Icon name="upload" size={16} /> Restore
      </button>
      <input
        ref={input}
        className="file-hidden"
        type="file"
        accept=".json,application/json"
        aria-label="Backup file"
        onChange={(event) => {
          const file = event.target.files[0];
          event.target.value = ''; // so choosing the same file again still works
          if (file) restore(file);
        }}
      />
      {error && <p className="error">{error}</p>}
    </>
  );
}

// If another account used this device before you signed in, its data was cleared from the screen but a copy was kept.
function PreviousAccountBackup() {
  let saved = null;
  try {
    saved = localStorage.getItem(PREVIOUS_BACKUP);
  } catch {
    // storage blocked: nothing to offer
  }
  if (!saved) return null;
  function download() {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([saved], { type: 'application/json' }));
    link.download = 'todolist-previous-account-backup.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return (
    <p className="hint">
      Another account used this device before you. A copy of its data was kept here.{' '}
      <button type="button" className="link-button" onClick={download}>
        Download it
      </button>
    </p>
  );
}

export function AccountModal({ onClose }) {
  return (
    <Modal title="Account" onClose={onClose}>
      <div className="look account-window">
      <section>
        <h3 className="mono">Sync</h3>
        <Account />
      </section>

      <section>
        <h3 className="mono">Backup</h3>
        <div className="seg-row">
          <button className="btn-ghost" onClick={downloadBackup} aria-label="Download a backup" title="Download a backup">
            <Icon name="download" size={16} /> Download
          </button>
          <RestoreBackup />
        </div>
        <p className="hint">Ctrl+Z undoes anything. Ctrl+Shift+Z brings it back, in case you regret your regret.</p>
        <PreviousAccountBackup />
      </section>
      </div>
    </Modal>
  );
}


// ======================================================================
// THE SHEET
// ======================================================================
// The tabs: [id, label].
const TABS = [
  ['style', 'Style', 'palette'],
  ['wallpaper', 'Wallpaper', 'image'],
  ['general', 'General', 'sliders'],
];

export function SettingsSheet({ onClose }) {
  const [tab, setTab] = useState('style');

  const tabs = (
    <div className="tabs" role="tablist">
      {TABS.map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={'tab' + (tab === id ? ' active' : '')}
          onClick={() => setTab(id)}
        >
          <Icon name={icon} size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <Sheet title="Settings" tabs={tabs} onClose={onClose}>
      {tab === 'style' ? <StyleTab /> : tab === 'wallpaper' ? <WallpaperTab /> : <GeneralTab />}
    </Sheet>
  );
}
