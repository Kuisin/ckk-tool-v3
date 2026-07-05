"use client";

/**
 * useViewport.ts — JS-driven responsive switches (_specs/design.md §1.7).
 *
 * `useIsMobile()` drives column counts, button sizes, table↔card swaps.
 * Defaults to desktop on SSR and first client paint to match server HTML;
 * updates after mount. Prefer CSS (`visibleFrom` / responsive style props)
 * when the DOM structure must not change between server and client.
 */

import { useMediaQuery } from "@mantine/hooks";

/** `sm` breakpoint — 768px (design.md §1.7). */
export const MOBILE_QUERY = "(max-width: 767px)";

/** `lg` breakpoint — 1024px. */
export const TABLET_QUERY = "(max-width: 1023px)";

export function useIsMobile(): boolean {
  return (
    useMediaQuery(MOBILE_QUERY, false, { getInitialValueInEffect: true }) ??
    false
  );
}

export function useIsTablet(): boolean {
  return (
    useMediaQuery(TABLET_QUERY, false, { getInitialValueInEffect: true }) ??
    false
  );
}
