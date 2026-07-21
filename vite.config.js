import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.png', 'apple-touch-icon.png'],
      workbox: {
        globDirectory: 'dist',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
        globIgnores: ['**/CommunityDetail-*.js', '**/TrackingHub-*.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https?:\/\/.*supabase\.co\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'medstudy-navigation',
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'medstudy-general',
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: 'MedStudy OS',
        short_name: 'MedStudy',
        description: 'Your all-in-one medical study platform — Curriculum, Anki, UWorld, Pomodoro & Session Tracking',
        start_url: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        background_color: '#0B1120',
        theme_color: '#0B1120',
        orientation: 'any',
        categories: ['education', 'medical', 'productivity'],
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://medstudy-api.medstudy.workers.dev',
        changeOrigin: true,
        headers: { 'x-dev-mode': 'true' },
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          recharts: ['recharts'],
          sqljs: ['sql.js'],
          jszip: ['jszip'],
        },
      },
    },
  },
})
