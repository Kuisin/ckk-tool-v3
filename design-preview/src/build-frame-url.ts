export type FrameMode = 'page' | 'component';
export type Viewport = 'desktop' | 'mobile';

export function buildFrameUrl(params: {
  design: string;
  viewport: Viewport;
  scheme: 'light' | 'dark';
  mode: FrameMode;
  remountKey?: number;
}): string {
  const url = new URL('/frame.html', window.location.origin);
  url.searchParams.set('design', params.design);
  url.searchParams.set('viewport', params.viewport);
  url.searchParams.set('scheme', params.scheme);
  url.searchParams.set('mode', params.mode);
  if (params.remountKey != null) {
    url.searchParams.set('t', String(params.remountKey));
  }
  return `${url.pathname}${url.search}`;
}
