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

  throw new Error(
    `${formatDesignLabel(modulePath)} has no default export (expected \`export default\` or \`export function ${candidates.join('` / `')}\`)`,
  );
}
