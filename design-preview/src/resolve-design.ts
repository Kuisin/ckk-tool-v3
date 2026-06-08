import type { ComponentType } from 'react';
import { formatDesignLabel } from './file-tree';

type DesignModule = Record<string, unknown>;

/** Resolve a preview component from a design module (default or filename-matched named export). */
export function resolveDesignComponent(
  modulePath: string,
  mod: DesignModule,
): ComponentType {
  if (typeof mod.default === 'function') {
    return mod.default as ComponentType;
  }

  const baseName = modulePath.split('/').pop()?.replace(/\.tsx$/, '') ?? '';
  // `comp_`-prefixed files conventionally export the component without the prefix
  const candidates = [baseName, baseName.replace(/^comp_/, '')];
  for (const candidate of candidates) {
    const named = mod[candidate];
    if (typeof named === 'function') {
      return named as ComponentType;
    }
  }

  // Fallback: first component-like named export (function whose name is PascalCase).
  // Covers files whose export name doesn't match the filename — e.g. `_modals/`
  // popups (`cancel.tsx` → `CancelQuoteModal`) and layout helpers.
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === 'function' && /^[A-Z]/.test(name)) {
      return value as ComponentType;
    }
  }

  throw new Error(
    `${formatDesignLabel(modulePath)} has no usable export (expected a default export or a PascalCase component export)`,
  );
}
