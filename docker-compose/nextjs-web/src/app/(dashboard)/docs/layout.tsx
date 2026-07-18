import { Box, Group } from "@mantine/core";
import type { ReactNode } from "react";
import { DocsMobileBar } from "./DocsMobileBar";
import { DocsNav } from "./DocsNav";
import styles from "./docs.module.css";

// サイドバー（DocsNav）が useSearchParams を使うため動的レンダリング。
export const dynamic = "force-dynamic";

/**
 * /docs 共通レイアウト — 左サイドバー（デスクトップ, sticky）+ 本文。
 * モバイルはサイドバーを隠し、本文上部の目次ボタン → Drawer で操作する。
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Group align="flex-start" gap="xl" wrap="nowrap">
      <Box className={styles.sidebar} component="aside" visibleFrom="md">
        <DocsNav />
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <DocsMobileBar />
        {children}
      </Box>
    </Group>
  );
}
