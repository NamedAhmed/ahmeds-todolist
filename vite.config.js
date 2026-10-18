import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Port 3000 matches Supabase's default Site URL, so emailed sign-in links land back here.
// The service worker precaches the built app so it opens offline; Google Fonts are cached on first visit.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "Ahmed's Todolist",
        short_name: 'Todolist',
        background_color: '#0c0b0a',
        theme_color: '#0c0b0a',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        // The wallpaper pages (public/lively/) are separate web pages shown in a frame. They must not be
        // answered with the app's own page, and they are too big to save for offline use up front.
        navigateFallbackDenylist: [/^\/auth/, /^\/lively\//],
        globIgnores: ['lively/**'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 }, cacheableResponse: { statuses: [0, 200] } }
        }]
      }
    })
  ],
  server: { port: 3000, strictPort: true }
});
