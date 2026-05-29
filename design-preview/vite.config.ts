import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'next/link': new URL('./src/shims/next-link.tsx', import.meta.url).pathname,
      'next/navigation': new URL('./src/shims/next-navigation.ts', import.meta.url).pathname,
      'next/image': new URL('./src/shims/next-image.tsx', import.meta.url).pathname,
    },
  },
});
