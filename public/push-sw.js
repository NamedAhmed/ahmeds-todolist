// push-sw.js = the part of the service worker that shows push notifications. The generated service worker loads
// it (see `importScripts` in vite.config.js). The server side is supabase/functions/send-push.

self.addEventListener('push', (event) => {
  let note = { title: 'Todolist', body: '' };
  try {
    note = { ...note, ...event.data.json() };
  } catch {
    // not JSON: show whatever text came
    note.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      tag: note.tag, // the same notification never shows twice
      icon: '/icon.svg',
      badge: '/icon.svg',
    })
  );
});

// Tapping a notification brings the app to the front (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const window of windows) {
        if ('focus' in window) return window.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
