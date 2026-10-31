import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
      build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], backend: ['@supabase/supabase-js'] } } } },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        includeAssets: ['favicon.png', 'icon-192.png', 'icon-512.png', 'manifest.json'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,webp,svg,json}'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          // User chooses when to install an update; never reload during bar service.
          skipWaiting: false,
          clientsClaim: true,
        },
      })],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
});
