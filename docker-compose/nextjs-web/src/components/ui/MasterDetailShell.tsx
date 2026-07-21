"use client";

/**
 * MasterDetailShell — 設定アプリ共通のマスタ/詳細レイアウト。
 *
 * 構成: 上部にページヘッダー（header, 全幅）→ その下に master｜detail の縦分割。
 * デスクトップ: 2 ペイン。中央のハンドルをドラッグして幅を変更でき、幅は basePath
 * ごとに localStorage に保存する。詳細は Next のルート（[id]/new/index）で切り替わり、
 * レイアウトは保持されるので左の一覧はそのまま右ペインだけ更新（スプリットペイン）。
 * モバイル: 1 カラム。一覧ルートは header + master、詳細ルートは detail のみ（別ページ）。
 *
 * ページ名はこの header に一度だけ出す（各ペインでは繰り返さない）。
 */

import { Box, Flex, Stack } from "@mantine/core";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useIsMobile } from "@/hooks/useViewport";

export function MasterDetailShell({
  basePath,
  header,
  master,
  children,
  initialMasterWidth = 300,
  minMasterWidth = 200,
  maxMasterWidth = 560,
}: {
  /** 一覧（index）ルートのパス。モバイルでここにいるとき master を表示。 */
  basePath: string;
  /** 上部の全幅ページヘッダー（ページ名・パンくず・主要アクション）。 */
  header?: ReactNode;
  /** 左ペイン（一覧）。 */
  master: ReactNode;
  /** 右ペイン（詳細 = ルートの children）。 */
  children: ReactNode;
  initialMasterWidth?: number;
  minMasterWidth?: number;
  maxMasterWidth?: number;
}) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const onList = pathname === basePath || pathname === `${basePath}/`;
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [width, setWidth] = useState(initialMasterWidth);

  // 保存済みの幅を復元（basePath 単位）。
  useEffect(() => {
    const saved = Number(localStorage.getItem(`mdshell:${basePath}`));
    if (saved >= minMasterWidth && saved <= maxMasterWidth) setWidth(saved);
  }, [basePath, minMasterWidth, maxMasterWidth]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !containerRef.current) return;
      const left = containerRef.current.getBoundingClientRect().left;
      const w = Math.min(
        maxMasterWidth,
        Math.max(minMasterWidth, e.clientX - left),
      );
      setWidth(w);
    },
    [minMasterWidth, maxMasterWidth],
  );
  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      localStorage.setItem(`mdshell:${basePath}`, String(Math.round(width)));
    },
    [basePath, width],
  );
  // キーボード操作（←/→ で 16px 調整）。
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const delta =
        e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0;
      if (!delta) return;
      e.preventDefault();
      setWidth((w) => {
        const next = Math.min(
          maxMasterWidth,
          Math.max(minMasterWidth, w + delta),
        );
        localStorage.setItem(`mdshell:${basePath}`, String(Math.round(next)));
        return next;
      });
    },
    [basePath, minMasterWidth, maxMasterWidth],
  );

  if (isMobile) {
    if (!onList) return children;
    return (
      <Stack gap="md">
        {header}
        {master}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {header}
      <Flex
        align="stretch"
        gap={0}
        ref={containerRef}
        style={{ minHeight: 360 }}
      >
        <Box
          style={{
            width,
            flexShrink: 0,
            alignSelf: "flex-start",
            position: "sticky",
            top: 8,
            maxHeight: "calc(100vh - 210px)",
            overflowY: "auto",
          }}
        >
          {master}
        </Box>
        {/* biome-ignore lint/a11y/useSemanticElements: interactive drag splitter needs role=separator with aria-valuenow, not a semantic <hr> */}
        <Box
          aria-label="ペイン幅を調整"
          aria-orientation="vertical"
          aria-valuemax={maxMasterWidth}
          aria-valuemin={minMasterWidth}
          aria-valuenow={Math.round(width)}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="separator"
          style={{
            width: 12,
            flexShrink: 0,
            cursor: "col-resize",
            display: "flex",
            justifyContent: "center",
            touchAction: "none",
            alignSelf: "stretch",
          }}
          tabIndex={0}
        >
          <Box
            style={{
              width: 1,
              background: "var(--mantine-color-default-border)",
            }}
          />
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </Flex>
    </Stack>
  );
}
