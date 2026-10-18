// main.jsx = the very first file that runs. It starts the app inside the empty
// <div id="root"> that sits in index.html.
//
// Where to look next:
//   App.jsx    the page layout and keyboard shortcuts
//   store.js   where all the data lives
//   sync.js    signing in and syncing to Supabase
//   lib.js     shared helpers (dates, the rude messages)

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './base.css'; // basic styling: colours, fonts, buttons
import './app.css';  // styling for the specific parts of the app

createRoot(document.getElementById('root')).render(<App />);
