// UpdatePrompt.jsx = the small card that says a new version of the app is ready (main.jsx tells it).
// The new version only starts when you press Reload, so a page never meets half-old, half-new files.

import { useEffect, useState } from 'react';

export default function UpdatePrompt() {
  const [update, setUpdate] = useState(null); // the function that installs the new version

  useEffect(() => {
    const ready = (event) => setUpdate(() => event.detail);
    window.addEventListener('todolist:update-ready', ready);
    return () => window.removeEventListener('todolist:update-ready', ready);
  }, []);

  if (!update) return null;
  return (
    <div className="push-prompt" role="dialog" aria-label="Update ready">
      <span>A new version is ready.</span>
      <button className="btn-add" onClick={() => update(true)}>
        Reload
      </button>
      <button className="btn-ghost" onClick={() => setUpdate(null)}>
        Later
      </button>
    </div>
  );
}
