import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

const GOTENBERG_URL = process.env.GOTENBERG_URL ?? 'http://localhost:3100';
const TEMPLATES_DIR = fileURLToPath(new URL('./pdf-templates', import.meta.url));
// Shared assets (logos, fonts) from the project root — served at /design-assets/
const ASSETS_DIR = fileURLToPath(new URL('../_assets', import.meta.url));

const MIME: Record<string, string> = {
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.ttf':   'font/ttf',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
};

/** Recursively copies src directory into dst. */
async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath);
    } else {
      await copyFile(srcPath, dstPath);
    }
  }
}

/** Serves /_assets/** at /design-assets/** so designs and PDF previews can reference real logos and fonts. */
function designAssetsPlugin(): Plugin {
  return {
    name: 'design-assets',
    configureServer(server) {
      server.middlewares.use('/design-assets', (req, res, next) => {
        void (async () => {
          try {
            const url = (req.url ?? '/').split('?')[0];
            const filePath = path.resolve(ASSETS_DIR, url.replace(/^\/+/, ''));
            // Guard against path traversal
            if (!filePath.startsWith(ASSETS_DIR + path.sep) && filePath !== ASSETS_DIR) {
              res.statusCode = 400; res.end(); return;
            }
            const s = await stat(filePath).catch(() => null);
            if (!s?.isFile()) { next(); return; }

            const ext = path.extname(filePath).toLowerCase();
            res.setHeader('content-type', MIME[ext] ?? 'application/octet-stream');
            res.setHeader('cache-control', 'public, max-age=3600');
            res.end(await readFile(filePath));
          } catch { next(); }
        })();
      });
    },
    async closeBundle() {
      // Copy _assets into dist/design-assets so production builds include logos and fonts
      const outDir = path.resolve(rootDir, 'dist', 'design-assets');
      await copyDir(ASSETS_DIR, outDir);
    },
  };
}

// Mirrors the main system's app/api/pdf/* route handlers: the server owns the
// template, renders it server-side, and streams the generated file back.
//   client → POST /api/pdf?template=<name> → read HTML on server → Gotenberg → PDF download
function pdfApiPlugin(): Plugin {
  return {
    name: 'pdf-api',
    configureServer(server) {
      server.middlewares.use('/api/pdf', (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }
        void (async () => {
          try {
            const { searchParams } = new URL(req.url ?? '', 'http://localhost');
            const template = searchParams.get('template');
            if (!template) {
              res.statusCode = 400;
              res.end('Missing "template" query parameter');
              return;
            }

            // Resolve the template on the server and guard against path traversal.
            const filePath = path.resolve(TEMPLATES_DIR, template);
            if (!filePath.startsWith(TEMPLATES_DIR + path.sep)) {
              res.statusCode = 400;
              res.end('Invalid template path');
              return;
            }

            let html: string;
            try {
              html = await readFile(filePath, 'utf8');
            } catch {
              res.statusCode = 404;
              res.end(`Template not found: ${template}`);
              return;
            }

            const form = new FormData();
            form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
            // Default to A4 (210mm × 297mm); Gotenberg otherwise falls back to US Letter.
            form.append('paperWidth', '210mm');
            form.append('paperHeight', '297mm');
            const gotenbergRes = await fetch(
              `${GOTENBERG_URL}/forms/chromium/convert/html`,
              { method: 'POST', body: form },
            );
            if (!gotenbergRes.ok) {
              res.statusCode = gotenbergRes.status;
              res.end(`Gotenberg error: ${gotenbergRes.status}`);
              return;
            }

            const pdf = Buffer.from(await gotenbergRes.arrayBuffer());
            const downloadName = path.basename(template).replace(/\.html?$/i, '.pdf');
            res.statusCode = 200;
            res.setHeader('content-type', 'application/pdf');
            res.setHeader(
              'content-disposition',
              `attachment; filename="${downloadName}"`,
            );
            res.end(pdf);
          } catch (err) {
            console.error('[pdf-api]', err);
            res.statusCode = 500;
            res.end('PDF generation failed');
          }
        })();
      });
    },
  };
}

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), pdfApiPlugin(), designAssetsPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(rootDir, 'index.html'),
        frame: path.resolve(rootDir, 'frame.html'),
      },
    },
  },
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
});
