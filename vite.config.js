import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Port 3000 matches Supabase's default Site URL, so emailed sign-in links land back here.
// The service worker precaches the built app so it opens offline. Google Fonts are NOT routed through it: a service worker
// fetching them is blocked by the site's own security policy and the fonts then never load (the browser's own cache keeps them).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // a new version waits until you press Reload (see components/UpdatePrompt.jsx), so a page never meets half-old files
      manifest: {
        name: "Ahmed's Todolist",
        short_name: 'Todolist',
        background_color: '#0c0b0a',
        theme_color: '#0c0b0a',
        display: 'standalone',
        id: '/',
        description: 'Tasks, dailies, reminders and notes that sync between your phone and laptop.',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        importScripts: ['push-sw.js'], // shows push notifications (see push.js)
        navigateFallbackDenylist: [/^\/auth/],
        runtimeCaching: [{
          // The photo backgrounds: saved the first time they are used, then served from the device.
          urlPattern: ({ url }) => url.pathname.startsWith('/pictures/'),
          handler: 'CacheFirst',
          options: { cacheName: 'heavy-assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } }
        }]
      }
    })
  ],
  server: { port: 3000, strictPort: true },
  // `npm test` (Vitest): the tests run in Node, with the bits of browser they need from src/test-setup.js.
  test: { setupFiles: ['src/test-setup.js'] }
});
