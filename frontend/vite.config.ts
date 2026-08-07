import { execSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function getCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendHost = env.BACKEND_HOST || process.env.BACKEND_HOST || '127.0.0.1';
  const backendPort = env.BACKEND_PORT || process.env.BACKEND_PORT || '8003';
  const proxyTarget = env.VITE_PROXY_TARGET || process.env.VITE_PROXY_TARGET || `http://${backendHost}:${backendPort}`;

  return ({
  base: '/',
  define: {
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      // The web app manifest is hand-maintained at public/manifest.webmanifest
      // and linked directly from index.html — `manifest: false` stops the
      // plugin from generating a second, duplicate manifest + <link> tag.
      manifest: false,
      // Cache/precache logic (incl. runtime caching) now lives in src/sw.ts —
      // injectManifest strategy ignores the `workbox` generateSW options.
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/media': {
        target: proxyTarget,
        changeOrigin: true,
      },
      // Painel administrativo do Django (link em Administração > Painel Django,
      // rota /django-admin — não /admin, que já é usada pela página React de
      // Administração) e seus estáticos (CSS/JS do admin), servidos pelo
      // runserver em DEBUG.
      '/django-admin': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/static': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', './e2e/**'],
  },
  });
});
