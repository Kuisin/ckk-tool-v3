import { createContext, useContext } from 'react';

export type Viewport = 'desktop' | 'mobile';

const ViewportCtx = createContext<Viewport>('desktop');

export const ViewportProvider = ViewportCtx.Provider;

export function useViewport(): Viewport {
  return useContext(ViewportCtx);
}

export function useIsMobile(): boolean {
  return useContext(ViewportCtx) === 'mobile';
}
