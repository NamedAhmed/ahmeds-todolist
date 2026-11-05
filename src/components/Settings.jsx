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
import { allIncludingTrashed, commit, deletePermanently, exportJson, importJson, TRASH_RETENTION_MS, useStore } from '../store.js';
import { PREVIOUS_BACKUP, sendCode, signOut, supabase, syncNow, useSync, verifyCode } from '../sync.js';
import { quip } from '../lib.js';
import Icon from './Icons.jsx';
import { GeneralTab, StyleTab } from './Look.jsx';
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

// What to tell you when signing in fails. Supabase's own messages are written for developers, so the usual ones are
// put in plain words; anything else is shown as it is.
function signInProblem(error) {
  const text = String(error?.message || error || '');
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(text)) return 'That code is wrong or has expired. Ask for a new email and use the newest code.';
  if (/rate limit|too many|only request this after|security purposes/i.test(text)) return 'Too many emails asked for in a short time. Wait a minute, then try again.';
  if (/invalid.*email|email.*invalid|validate email/i.test(text)) return "That doesn't look like an email address.";
  if (/failed to fetch|network|load failed|offline/i.test(text)) return "Can't reach the server. Check your internet connection and try again.";
  return text || 'Something went wrong. Try again.';
}

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
      setError(signInProblem(err));
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

// Sign-in, sync and backup. It is shown in the Account window on a computer and as a tab of the Settings page on a phone.
function AccountPanel() {
  return (
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
  );
}

export function AccountModal({ onClose }) {
  return (
    <Modal title="Account" onClose={onClose}>
      <AccountPanel />
    </Modal>
  );
}


// ======================================================================
// THE SHEET
// ======================================================================
// The tabs: [id, label].
const TABS = [
  ['style', 'Style', 'palette'],
  ['general', 'General', 'sliders'],
  ['deleted', 'Recently Deleted', 'trash'],
];

// On a phone Settings is a page of its own (a tab in the bottom bar) instead of a sheet, with Account as one more tab.
// Props: tab and setTab are kept by App.jsx so other buttons can open the Account tab.
const PAGE_TABS = [...TABS, ['account', 'Account', 'user']];

const DELETED_TABLES = [
  ['tasks', 'Task', 'Tasks'],
  ['dailies', 'Daily', 'Dailies'],
  ['reminders', 'Reminder', 'Reminders'],
  ['notes', 'Note', 'Notes'],
];
const DAY_MS = 24 * 60 * 60 * 1000;

function deletedAt(item) {
  if (item.trashed == null || item.trashed === '') return null;
  if (typeof item.trashed === 'number') return item.trashed;
  const value = Number(item.trashed);
  if (Number.isFinite(value)) return value;
  const parsed = Date.parse(item.trashed);
  return Number.isFinite(parsed) ? parsed : null;
}

function deletedTitle(table, item) {
  if (table === 'dailies') return item.name || 'Untitled daily';
  if (table === 'reminders') return item.title || 'Untitled reminder';
  if (table === 'notes') return item.title || 'Untitled note';
  return item.title || (item.parent ? 'Untitled step' : 'Untitled task');
}

function recentlyDeletedItems(state, now = Date.now()) {
  const cutoff = now - TRASH_RETENTION_MS;
  const items = DELETED_TABLES.flatMap(([table, kind]) =>
    allIncludingTrashed(state, table)
      .filter((item) => {
        const at = deletedAt(item);
        return at !== null && at > cutoff;
      })
      .map((item) => ({
        table,
        kind: table === 'tasks' ? (item.parent ? 'Step' : item.kind === 'project' ? 'Project' : 'Task') : kind,
        item,
        at: deletedAt(item),
      }))
  );
  const tasks = items.filter((entry) => entry.table === 'tasks');
  const groupedChildren = new Set();
  const projects = tasks.filter(({ item }) => !item.parent);
  for (const project of projects) {
    project.members = [project, ...tasks.filter(({ item }) => item.trash_group === project.item.id)];
    for (const child of project.members.slice(1)) groupedChildren.add(child.item.id);
  }
  return items
    .filter((entry) => entry.table !== 'tasks' || !entry.item.parent || !groupedChildren.has(entry.item.id))
    .sort((a, b) => b.at - a.at);
}

function entryRecords(entries) {
  return entries.flatMap((entry) => entry.members ?? [entry]);
}

function discardChanges(entries, state) {
  const items = entryRecords(entries);
  const changes = items.map(({ table, item }) => ({ t: table, id: item.id, set: null }));
  const related = new Set(items.filter(({ table }) => table === 'dailies' || table === 'reminders').map(({ item }) => item.id));
  for (const completion of allIncludingTrashed(state, 'completions')) {
    if (related.has(completion.ref)) changes.push({ t: 'completions', id: completion.id, set: null });
  }
  deletePermanently(changes);
}

function RecentlyDeleted() {
  const state = useStore();
  const [filter, setFilter] = useState('all');
  const items = recentlyDeletedItems(state);
  const visible = filter === 'all' ? items : items.filter((entry) => entry.table === filter);
  const counts = Object.fromEntries(DELETED_TABLES.map(([table]) => [table, items.filter((entry) => entry.table === table).length]));

  function restore(entry) {
    const changes = entryRecords([entry]).map(({ table, item }) => ({ t: table, id: item.id, patch: { trashed: null, trash_group: null } }));
    commit('item restored', changes);
    toast(`${entry.kind} restored.`, { undoable: true });
  }

  function deleteForever(entries) {
    const titles = entries.length === 1 ? `“${deletedTitle(entries[0].table, entries[0].item)}”` : `${entries.length} items`;
    if (!window.confirm(`Permanently delete ${titles}? This can't be undone.`)) return;
    discardChanges(entries, state);
  }

  return (
    <section className="recently-deleted" aria-label="Recently Deleted">
      <header className="deleted-heading">
        <div>
          <h3>Recently Deleted</h3>
          <p className="hint">Deleted items stay here for 30 days, then they’re permanently removed.</p>
        </div>
        {items.length > 0 && (
          <button className="btn-ghost danger" type="button" onClick={() => deleteForever(items)}>
            Empty Recently Deleted
          </button>
        )}
      </header>

      <div className="deleted-filters" role="group" aria-label="Filter deleted items">
        <button type="button" className={'chip' + (filter === 'all' ? ' solid' : '')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All <span>{items.length}</span>
        </button>
        {DELETED_TABLES.map(([table, , plural]) => (
          <button key={table} type="button" className={'chip' + (filter === table ? ' solid' : '')} aria-pressed={filter === table} onClick={() => setFilter(table)}>
            {plural} <span>{counts[table]}</span>
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <ul className="deleted-list">
          {visible.map((entry) => {
            const daysLeft = Math.max(1, Math.ceil((entry.at + TRASH_RETENTION_MS - Date.now()) / DAY_MS));
            const when = new Date(entry.at).toLocaleDateString([], { dateStyle: 'medium' });
            return (
              <li className="deleted-item" key={`${entry.table}:${entry.item.id}`}>
                <div className="deleted-copy">
                  <span className="deleted-kind mono">{entry.kind}</span>
                  <strong>{deletedTitle(entry.table, entry.item)}</strong>
                  <span className="deleted-meta">
                    Deleted {when} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                    {entry.members?.length > 1 && ` · includes ${entry.members.length - 1} ${entry.members.length === 2 ? 'step' : 'steps'}`}
                  </span>
                </div>
                <div className="deleted-actions">
                  <button className="btn-ghost" type="button" onClick={() => restore(entry)} aria-label={`Restore ${deletedTitle(entry.table, entry.item)}`}>
                    Restore
                  </button>
                  <button className="btn-ghost danger" type="button" onClick={() => deleteForever([entry])} aria-label={`Delete ${deletedTitle(entry.table, entry.item)} forever`}>
                    Delete forever
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="deleted-empty">
          <Icon name="trash" size={24} />
          <p>{items.length ? `No deleted ${filter} yet.` : 'Nothing deleted recently.'}</p>
          <span className="hint">Items you delete from Tasks, Dailies, Reminders, or Notes will show up here.</span>
        </div>
      )}
    </section>
  );
}

export function SettingsPage({ tab, setTab }) {
  return (
    <section className="col col-settings" aria-label="Settings">
      <header className="col-head">
        <h1>Settings</h1>
      </header>
      <div className="tabs" role="tablist">
        {PAGE_TABS.map(([id, label, icon]) => (
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
      <div className="settings-page-body">
        {tab === 'style' ? <StyleTab /> : tab === 'general' ? <GeneralTab /> : tab === 'deleted' ? <RecentlyDeleted /> : <AccountPanel />}
      </div>
    </section>
  );
}

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
      {tab === 'style' ? <StyleTab /> : tab === 'general' ? <GeneralTab /> : <RecentlyDeleted />}
    </Sheet>
  );
}
