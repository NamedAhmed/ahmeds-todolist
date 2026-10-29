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
import UpdatePrompt from './components/UpdatePrompt.jsx';
import './base.css'; // basic styling: colours, fonts, buttons
import './app.css';  // styling for the specific parts of the app
import './appearance.css'; // themes and the animated wallpaper

// A new version of the app is downloaded in the background and waits; the card in UpdatePrompt installs it.
const updateSW = registerSW({
  onNeedRefresh: () => window.dispatchEvent(new CustomEvent('todolist:update-ready', { detail: updateSW })),
});

// A page from before a deploy asking for a file that no longer exists: just start over on the new version.
window.addEventListener('vite:preloadError', () => location.reload());

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
    <UpdatePrompt />
  </ErrorBoundary>
);
