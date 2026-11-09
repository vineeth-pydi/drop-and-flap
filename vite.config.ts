import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const basePath = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    // main.tsx registers the worker using import.meta.env.BASE_URL.
    injectRegister: false,
    scope: basePath,
    includeAssets: ['icons/*.png', 'models/*.task', 'wasm/*', 'licenses/*', 'model-assets.json'],
    manifest: {
      name: 'Drop & Flap', short_name: 'Drop & Flap',
      description: 'Your pushups power a pixel arcade. Private, on-device play.',
      id: basePath,
      start_url: basePath,
      scope: basePath,
      theme_color: '#cefa63', background_color: '#10120f',
      display: 'standalone', orientation: 'portrait',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg,task,wasm}'],
      maximumFileSizeToCacheInBytes: 15000000,
      navigateFallback: `${basePath}index.html`,
      cleanupOutdatedCaches: true
    }
  })],
  optimizeDeps: { esbuildOptions: { tsconfigRaw: { compilerOptions: { target: 'ES2022' } } } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true }
});
