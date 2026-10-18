// Settings.jsx = the Settings sheet. Two tabs:
//
//   Look      everything about how the app looks (Look.jsx)
//   Account   signing in (to sync your tasks between devices) and downloading a backup
//
// It slides up from the bottom without covering the page (Sheet.jsx), so changes show up live.

import { useState } from 'react';
import { exportJson } from '../store.js';
import { sendCode, signOut, supabase, syncNow, useSync, verifyCode } from '../sync.js';
import { quip } from '../lib.js';
import Icon from './Icons.jsx';
import Look from './Look.jsx';
import Sheet from './Sheet.jsx';
import { toast } from './Fire.jsx';


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


// "Download a backup": makes a temporary link to a .json file and clicks it for you.
function downloadBackup() {
  const file = new Blob([exportJson()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = 'todolist-backup.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function AccountTab() {
  return (
    <div className="look">
      <section>
        <h3 className="mono">Account</h3>
        <Account />
      </section>

      <section>
        <h3 className="mono">Backup</h3>
        <div className="seg-row">
          <button className="btn-ghost" onClick={downloadBackup}>
            Download a backup
          </button>
        </div>
        <p className="hint">Ctrl+Z undoes anything. Ctrl+Shift+Z brings it back, in case you regret your regret.</p>
      </section>
    </div>
  );
}


// ======================================================================
// THE SHEET
// ======================================================================
// The tabs: [id, label].
const TABS = [
  ['look', 'Look', 'palette'],
  ['account', 'Account', 'user'],
];

export function SettingsSheet({ onClose }) {
  const [tab, setTab] = useState('look');

  const tabs = (
    <div className="tabs" role="tablist">
      {TABS.map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-label={label}
          title={label}
          className={'tab' + (tab === id ? ' active' : '')}
          onClick={() => setTab(id)}
        >
          <Icon name={icon} size={18} />
        </button>
      ))}
    </div>
  );

  return (
    <Sheet title="Settings" tabs={tabs} onClose={onClose}>
      {tab === 'look' ? <Look /> : <AccountTab />}
    </Sheet>
  );
}
