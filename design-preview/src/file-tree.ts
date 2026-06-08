export interface FileTreeNode {
  name: string;
  /** import.meta.glob key — present only on leaf files */
  modulePath?: string;
  children?: FileTreeNode[];
}

const DESIGNS_PREFIX = '../designs/';

export interface BuildFileTreeOptions {
  prefix?: string;
  ext?: string;
  /** Include files/folders whose name starts with `_` (e.g. `_modals/`, `_AppHeader`). Default: false. */
  includeUnderscore?: boolean;
}

/** Convert glob paths into a nested folder tree. */
export function buildFileTree(modulePaths: string[], options: BuildFileTreeOptions = {}): FileTreeNode[] {
  const { prefix = DESIGNS_PREFIX, ext = 'tsx', includeUnderscore = false } = options;
  const root: FileTreeNode[] = [];
  const extRe = new RegExp(`\\.${ext}$`);

  for (const modulePath of modulePaths) {
    const relative = modulePath.replace(prefix, '').replace(extRe, '');
    const segments = relative.split('/');

    // Skip underscore-prefixed segments unless explicitly included (hidden by default).
    if (!includeUnderscore && segments.some((seg) => seg.startsWith('_'))) {
      continue;
    }

    let level = root;
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      const isFile = i === segments.length - 1;
      let node = level.find((n) => n.name === name);

      if (!node) {
        node = isFile ? { name, modulePath } : { name, children: [] };
        level.push(node);
      } else if (isFile) {
        node.modulePath = modulePath;
      }

      if (!isFile) {
        node.children ??= [];
        level = node.children;
      }
    }
  }

  return sortTree(root);
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) =>
      node.children
        ? { ...node, children: sortTree(node.children) }
        : node,
    )
    .sort((a, b) => {
      const aIsFolder = Boolean(a.children?.length);
      const bIsFolder = Boolean(b.children?.length);
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Human-readable label from a glob path */
export function formatDesignLabel(modulePath: string, prefix = DESIGNS_PREFIX, ext = 'tsx'): string {
  return modulePath.replace(prefix, '').replace(new RegExp(`\\.${ext}$`), '');
}
