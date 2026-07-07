import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { commitSha } from './brand-kit/scripts/commit-sha.mjs'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT_SHA__: JSON.stringify(commitSha()),
  },
  resolve: {
    alias: {
      '@brand/BrandBanner': resolve(__dirname, 'brand-kit/component/BrandBanner.jsx'),
      '@brand/SplashScreen': resolve(__dirname, 'brand-kit/component/SplashScreen.jsx'),
      '@brand/UpdatePrompt': resolve(__dirname, 'brand-kit/component/UpdatePrompt.jsx'),
      '@brand/useUpdate': resolve(__dirname, 'brand-kit/component/useUpdate.js'),
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'brand-kit/static/css/brand.css', dest: 'brand' },
        { src: 'brand-kit/static/logo/logo-mark.svg', dest: 'brand' },
        { src: 'brand-kit/static/logo/logo-mark-light.svg', dest: 'brand' },
      ],
    }),
    VitePWA({
      registerType: 'prompt',
      // We already supply our own at public/manifest.json.
      manifest: false,
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2,json}'],
        // Always fetched fresh (no-store) to learn the latest build's commit —
        // must never be served stale from the precache.
        globIgnores: ['build-info.json'],
        // pdf.worker.mjs is ~2.2MB, just over the 2MB default.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
})
