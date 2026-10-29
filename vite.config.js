import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Port 3000 matches Supabase's default Site URL, so emailed sign-in links land back here.
// The service worker precaches the built app so it opens offline; Google Fonts are cached on first visit.
// The wallpaper pages run sandboxed with no origin of their own, so their own images and shaders count as another
// site's files and need this header to be usable in WebGL (vercel.json sends the same header in production).
function openWallpaperFiles() {
  // (It must return nothing: Vite would run a returned function as a second step.)
  const allow = (server) => {
    server.middlewares.use((request, response, next) => {
      if (/^\/(lively|pictures)\//.test(request.url)) response.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
  };
  return { name: 'open-wallpaper-files', configureServer: allow, configurePreviewServer: allow };
}

export default defineConfig({
  plugins: [
    openWallpaperFiles(),
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
        // The wallpaper pages (public/lively/) are separate web pages shown in a frame. They must not be
        // answered with the app's own page, and they are too big to save for offline use up front.
        importScripts: ['push-sw.js'], // shows push notifications (see push.js)
        navigateFallbackDenylist: [/^\/auth/, /^\/lively\//],
        globIgnores: ['lively/**', '**/cases-catalog-*.js'], // too big to download for everyone; cached the first time Cases opens
        runtimeCaching: [{
          // The Cases list and the photo wallpapers: saved the first time they are used, then served from the device.
          urlPattern: ({ url }) => /cases-catalog-.*\.js$/.test(url.pathname) || url.pathname.startsWith('/pictures/') || url.pathname.startsWith('/lively/'),
          handler: 'CacheFirst',
          options: { cacheName: 'heavy-assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } }
        }, {
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } }
        }]
      }
    })
  ],
  server: { port: 3000, strictPort: true },
  // `npm test` (Vitest): the tests run in Node, with the bits of browser they need from src/test-setup.js.
  test: { setupFiles: ['src/test-setup.js'] }
});
