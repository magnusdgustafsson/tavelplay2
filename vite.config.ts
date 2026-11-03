import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['awards/*.svg', 'logo.svg', 'logo-neon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'TavelPlay 2',
        short_name: 'TavelPlay 2',
        description: 'Track floorball game scores, goals, and player statistics',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
