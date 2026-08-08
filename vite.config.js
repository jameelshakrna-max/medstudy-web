import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolveApiOrigin, renderWorkerSource } from './config/api-origins.mjs'

// Emit dist/_worker.js (Pages advanced-mode Function) with the API origin for
// the current build mode baked in. Staging builds proxy to the staging Worker,
// production builds to the production Worker — never the other way around.
// See config/api-origins.mjs for the origin map and regression tests.
function medstudyPagesWorker(apiOrigin) {
  return {
    name: 'medstudy-pages-worker-origin',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_worker.js',
        source: renderWorkerSource(apiOrigin),
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    medstudyPagesWorker(resolveApiOrigin(mode)),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'favicon.png', 'apple-touch-icon.png'],
      workbox: {
        globDirectory: 'dist',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm}'],
        globIgnores: ['**/CommunityDetail-*.js', '**/TrackingHub-*.js', '_worker.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        importScripts: ['sw-cache-migration.js'],
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
        target: resolveApiOrigin('production'),
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
}))
