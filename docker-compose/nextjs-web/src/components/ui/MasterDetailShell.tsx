"use client";

/**
 * MasterDetailShell — 設定アプリ共通のマスタ/詳細レイアウト（一覧 + 詳細）。
 *
 * デスクトップ: 左に一覧（master, sticky + 内部スクロール）、右に詳細（children）を
 * 並べた 2 ペイン。詳細は Next のルート（[id] / new / index）で切り替わり、レイアウトは
 * 保持されるので一覧はそのまま、右ペインだけが更新される（アプリ内スプリットペイン）。
 * モバイル: 1 カラム。一覧ルート（basePath）では master、詳細ルートでは children を表示
 * （= 別ページ遷移）。design.md §1.7 の useIsMobile による構造スイッチ。
 *
 * 使い方: 各設定アプリの `layout.tsx` で一覧データを取得し master に渡す。index の
 * `page.tsx` はデスクトップ右ペインのプレースホルダ（「選択してください」）にする。
 */

import { Box, Flex } from "@mantine/core";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useViewport";

export function MasterDetailShell({
  basePath,
  master,
  children,
  masterWidth = 340,
}: {
  /** 一覧（index）ルートのパス。ここにいるときモバイルでは master を表示。 */
  basePath: string;
  /** 左ペイン（一覧）。 */
  master: ReactNode;
  /** 右ペイン（詳細 = ルートの children）。 */
  children: ReactNode;
  /** 左ペインの幅(px, デスクトップ)。 */
  masterWidth?: number;
}) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const onList = pathname === basePath || pathname === `${basePath}/`;

  if (isMobile) return <>{onList ? master : children}</>;

  return (
    <Flex align="flex-start" gap="lg">
      <Box
        style={{
          width: masterWidth,
          flexShrink: 0,
          position: "sticky",
          top: 8,
          alignSelf: "flex-start",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
        }}
      >
        {master}
      </Box>
      <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Flex>
  );
}
