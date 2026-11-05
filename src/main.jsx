// main.jsx = the very first file that runs. It starts the app inside the empty
// <div id="root"> that sits in index.html.
//
// Where to look next:
//   App.jsx    the page layout and keyboard shortcuts
//   store.js   where all the data lives
//   sync.js    signing in and syncing to Supabase
//   lib.js     shared helpers (dates, the rude messages)

import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './base.css'; // basic styling: colours, fonts, buttons
import './app.css';  // styling for the specific parts of the app
import './appearance.css'; // themes and the animated wallpaper

// A new version of the app installs by itself. When it takes over, the page reloads onto it (anything you were typing is
// saved first: see noteSave.js and store.js, which write on pagehide). It also looks for a new version whenever the app
// comes back to the front, because an installed app is often resumed instead of opened afresh.
const hadWorker = !!navigator.serviceWorker?.controller; // the very first install must not reload the page
registerSW({
  onRegisteredSW(_url, registration) {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && registration?.update());
    setInterval(() => registration?.update(), 30 * 60 * 1000);
  },
});
let reloading = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!hadWorker || reloading) return;
  reloading = true;
  location.reload();
});

// A page from before a deploy asking for a file that no longer exists: just start over on the new version.
window.addEventListener('vite:preloadError', () => location.reload());

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
