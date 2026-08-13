"use client";

/**
 * KioskShell.tsx — Mantine AppShell（nextjs-web の DashboardShell と同型:
 * ヘッダー + フッター、サイドバーなし。design.md §3/§4 準拠のキオスク版）。
 *
 * ヘッダー: 左 = アプリ識別 / 右 = **端末名**（常時表示、layout がサーバー解決）
 *   左のタイトルを 2.5 秒以内に 5 回タップすると隠し端末設定
 *   （/device-settings — 端末ごとの 6 桁コードで解錠）へ遷移する。
 * フッター: 会社名 + バージョン（web の AppFooter と同じ構成）
 * Main は flex column — 各ページは style={{flex:1}} の Center で縦中央に置ける。
 */

import {
  AppShell,
  Badge,
  Box,
  Group,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconDeviceTablet } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { BatteryStatus, HeaderClock } from "./StatusTray";

const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 36;

// 隠し端末設定の起動ジェスチャ: この時間内に 5 タップ
const SETTINGS_TAP_COUNT = 5;
const SETTINGS_TAP_WINDOW_MS = 2500;

type Props = {
  deviceName: string | null;
  registered: boolean;
  children: ReactNode;
};

export function KioskShell({ deviceName, registered, children }: Props) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const router = useRouter();
  const tapRef = useRef<{ count: number; first: number }>({
    count: 0,
    first: 0,
  });

  // 視覚的な手掛かりは出さない（隠し機能）。5 タップで端末設定へ。
  const handleTitleTap = () => {
    const now = Date.now();
    if (now - tapRef.current.first > SETTINGS_TAP_WINDOW_MS) {
      tapRef.current = { count: 1, first: now };
      return;
    }
    tapRef.current.count += 1;
    if (tapRef.current.count >= SETTINGS_TAP_COUNT) {
      tapRef.current = { count: 0, first: 0 };
      router.push("/device-settings");
    }
  };

  return (
    <AppShell
      footer={{ height: FOOTER_HEIGHT }}
      header={{ height: HEADER_HEIGHT }}
      padding={0}
    >
      <AppShell.Header style={{ position: "relative" }}>
        {/* 中央: 日付時刻（左右の幅に影響されない絶対中央配置） */}
        <Box
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        >
          <HeaderClock />
        </Box>
        <Group h="100%" justify="space-between" px="lg" wrap="nowrap">
          {/* 左: タイトル + バッテリー */}
          <Group gap="md" wrap="nowrap">
            <UnstyledButton
              aria-label="CKK 専用端末"
              onClick={handleTitleTap}
              style={{ cursor: "default" }}
            >
              <Group gap="xs" wrap="nowrap">
                <IconDeviceTablet
                  color="var(--mantine-color-blue-4)"
                  size={24}
                />
                <Text fw={700} size="md">
                  CKK 専用端末
                </Text>
              </Group>
            </UnstyledButton>
            {/* バッテリー（イマーシブでシステムバーが見えないため常時表示） */}
            <BatteryStatus />
          </Group>
          {/* 右: 接続ドット + 端末名 + 日付時刻 */}
          <Group gap={8} wrap="nowrap">
            {/* 接続状態ドット（灰=接続なし/赤=未登録/橙=ブラウザ/緑=専用アプリ、
                点滅=不安定）+ オフライン時の全画面オーバーレイ */}
            <ConnectionIndicator registered={registered} />
            {registered ? (
              <Text fw={600} maw={300} size="md" truncate>
                {deviceName ?? "（名称未設定）"}
              </Text>
            ) : (
              <Badge color="gray" variant="outline">
                未登録端末
              </Badge>
            )}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main
        style={{
          display: "flex",
          flexDirection: "column",
          // ヘッダーがフロー内配置のため Mantine の padding-top と二重になり、
          // minHeight: 100dvh では 56px はみ出して縦センターもずれていた。
          // 残り高さちょうどに固定し、はみ出すページは Main 内でスクロールする
          // （Center flex:1 のページは正確に縦中央・スクロールなしになる）。
          padding: 0,
          height: `calc(100dvh - ${HEADER_HEIGHT}px - ${FOOTER_HEIGHT}px)`,
          overflowY: "auto",
        }}
      >
        {children}
      </AppShell.Main>

      <AppShell.Footer
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <Group gap="lg" h="100%" justify="center" px="md">
          <Text c="dimmed" size="xs">
            シー・ケィ・ケー株式会社
          </Text>
          <Text c="dimmed" size="xs">
            v{version}
          </Text>
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
