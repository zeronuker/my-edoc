import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: { '@brand/BrandBanner': resolve(__dirname, 'brand-kit/component/BrandBanner.jsx') },
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
  ],
})
