import { formatDesignLabel } from './file-tree';

export const designModules = import.meta.glob('../designs/**/*.tsx') as Record<
  string,
  () => Promise<Record<string, unknown>>
>;

export const designPaths = Object.keys(designModules)
  .filter((p) => !p.includes('/lib/'))
  .sort((a, b) => formatDesignLabel(a).localeCompare(formatDesignLabel(b)));

export function isComponentFile(modulePath: string): boolean {
  const basename = modulePath.split('/').pop() ?? '';
  return basename.startsWith('comp_');
}

export function isLayoutFile(modulePath: string): boolean {
  return modulePath.includes('/layout/') && !isComponentFile(modulePath);
}

export function isAppLauncherFile(modulePath: string): boolean {
  return modulePath.endsWith('comp_AppLauncher.tsx');
}

/** `_modals/` popups are controlled components — previewed in an opened state. */
export function isModalFile(modulePath: string): boolean {
  return modulePath.includes('/_modals/');
}
