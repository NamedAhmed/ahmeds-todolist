// ErrorBoundary.jsx = what you see if the app itself breaks, instead of a blank page. It never touches your data: it
// only offers Reload and a backup download of what this device has stored.

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  backup() {
    try {
      const text = localStorage.getItem('todolist:v2') ?? '{}';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      link.download = 'todolist-device-backup.json';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      // storage unavailable: nothing to save
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Something broke.</h1>
        <p>Your tasks and notes are safe: they are stored on this device and (if you signed in) in your account.</p>
        <div className="seg-row">
          <button className="btn-add" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn-ghost" onClick={() => this.backup()}>
            Download a backup
          </button>
        </div>
      </div>
    );
  }
}
