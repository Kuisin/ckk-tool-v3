import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3100';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@/components/layout': fileURLToPath(new URL('./designs/layout', import.meta.url)),
      'next/link': fileURLToPath(new URL('./src/shims/next-link.tsx', import.meta.url)),
      'next/navigation': fileURLToPath(new URL('./src/shims/next-navigation.ts', import.meta.url)),
      'next/image': fileURLToPath(new URL('./src/shims/next-image.tsx', import.meta.url)),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    'process.env.NEXT_PUBLIC_APP_VERSION': JSON.stringify('preview'),
  },
  server: {
    proxy: {
      '/api/gotenberg': {
        target: GOTENBERG_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gotenberg/, ''),
      },
    },
  },
});
