export type FrameMode = 'page' | 'component';
export type Viewport = 'desktop' | 'mobile';

export function buildFrameUrl(params: {
  design: string;
  viewport: Viewport;
  scheme: 'light' | 'dark';
  mode: FrameMode;
  remountKey?: number;
}): string {
  // Resolve frame.html against Vite's base path so it works under a
  // sub-path deploy (e.g. GitHub Pages /ckk-tool-v3/design-preview/),
  // not just at the origin root. BASE_URL always ends with a slash.
  const base = import.meta.env.BASE_URL;
  const url = new URL(`${base}frame.html`, window.location.origin);
  url.searchParams.set('design', params.design);
  url.searchParams.set('viewport', params.viewport);
  url.searchParams.set('scheme', params.scheme);
  url.searchParams.set('mode', params.mode);
  if (params.remountKey != null) {
    url.searchParams.set('t', String(params.remountKey));
  }
  return `${url.pathname}${url.search}`;
}
