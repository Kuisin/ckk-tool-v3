export interface FileTreeNode {
  name: string;
  /** import.meta.glob key — present only on leaf .tsx files */
  modulePath?: string;
  children?: FileTreeNode[];
}

const DESIGNS_PREFIX = '../designs/';

/** Convert glob paths into a nested folder tree. */
export function buildFileTree(modulePaths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const modulePath of modulePaths) {
    const relative = modulePath
      .replace(DESIGNS_PREFIX, '')
      .replace(/\.tsx$/, '');
    const segments = relative.split('/');

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

/** Human-readable label: "pages/ListPage" */
export function formatDesignLabel(modulePath: string): string {
  return modulePath.replace(DESIGNS_PREFIX, '').replace(/\.tsx$/, '');
}
