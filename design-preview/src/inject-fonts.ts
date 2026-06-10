/**
 * inject-fonts.ts — register the Noto Sans JP web fonts into a document.
 *
 * Shared by both entry points so the outer app shell (main.tsx) and the
 * system-page preview iframe (frame.tsx) render with identical weights —
 * otherwise the iframe has no @font-face and falls back to the system font.
 *
 * Use STATIC faces (not the variable TTF, whose wght axis defaults to 100 and
 * renders heavy/uneven in Chromium). Every CSS weight is mapped ONE STEP
 * LIGHTER than its name so the whole app reads thinner (thinner stroke = less
 * visual width):
 *   CSS 400 (body)         → Light  (300)
 *   CSS 500–600 (semibold) → Regular(400)
 *   CSS 700 (bold)         → Medium (500)
 */
export function injectFonts(doc: Document = document): void {
  const base = `${import.meta.env.BASE_URL}design-assets/fonts`;
  const style = doc.createElement('style');
  style.dataset.notoSansJp = 'true';
  style.textContent = `
    @font-face {
      font-family: 'Noto Sans JP';
      src: url('${base}/NotoSansJP-Light.ttf') format('truetype');
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: 'Noto Sans JP';
      src: url('${base}/NotoSansJP-Regular.ttf') format('truetype');
      font-weight: 500 600;
      font-display: swap;
    }
    @font-face {
      font-family: 'Noto Sans JP';
      src: url('${base}/NotoSansJP-Medium.ttf') format('truetype');
      font-weight: 700;
      font-display: swap;
    }
    body {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  `;
  doc.head.appendChild(style);
}
