import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3100';

// Mirrors the main system's app/api/pdf/* route handlers:
// client → POST /api/pdf → Gotenberg → PDF response
function pdfApiPlugin(): Plugin {
  return {
    name: 'pdf-api',
    configureServer(server) {
      server.middlewares.use('/api/pdf', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] ?? '';
            const gotenbergRes = await fetch(
              `${GOTENBERG_URL}/forms/chromium/convert/html`,
              { method: 'POST', headers: { 'content-type': contentType }, body },
            );
            if (!gotenbergRes.ok) {
              res.statusCode = gotenbergRes.status;
              res.end(`Gotenberg error: ${gotenbergRes.status}`);
              return;
            }
            const pdf = Buffer.from(await gotenbergRes.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('content-type', 'application/pdf');
            res.end(pdf);
          } catch (err) {
            console.error('[pdf-api]', err);
            res.statusCode = 500;
            res.end('PDF generation failed');
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfApiPlugin()],
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
    'import.meta.env.VITE_GOTENBERG_URL': JSON.stringify(GOTENBERG_URL),
  },
});
