"use client";

/**
 * KioskShell.tsx — Mantine AppShell（nextjs-web の DashboardShell と同型:
 * ヘッダー + フッター、サイドバーなし。design.md §3/§4 準拠のキオスク版）。
 *
 * ヘッダー: 左 = **ログイン中の利用者**（未ログインは「未ログイン」）/ 中央 = 日付時刻 /
 *   右 = 接続状態 + **端末名**（常時表示、layout がサーバー解決）
 *
 * ★ **ログイン画面では利用者名を出さない。** 名前はサーバー側の layout が
 *   解決して props で降りてくるが、ログアウトは router.replace での画面遷移で、
 *   layout は同じものが使い回されるため**再描画されない**。つまり props は
 *   前の利用者の名前を持ったまま残る。これを「いま居る画面」で打ち消す —
 *   ログイン系の画面に居るなら、誰もログインしていないことが確実だから。
 *   （併せてログイン・ログアウトの各所で router.refresh() も呼んでいる。
 *     こちらは server 側の状態も正しくするためで、表示の担保はこの判定側。）
 * フッター: 左 = アプリ識別「CKK 専用端末」/ 中央 = 会社名 + バージョン /
 *   右 = バッテリー
 * Main は flex column — 各ページは style={{flex:1}} の Center で縦中央に置ける。
 *
 * **隠し端末設定は「左下」のタイトル 5 タップ**（2.5 秒以内）。以前は左上に
 * あったが、ヘッダー左は利用者名に譲ったのでタイトルごとフッターへ移した。
 * このジェスチャは**ログイン前にも要る**（端末のリセット・再リンク用）ので、
 * タイトルはログイン状態に関わらず常に出す。
 * Android ラッパーのメンテナンス退出は**右上** 5 タップで、こちらとは別物。
 */

import {
  AppShell,
  Badge,
  Box,
  Group,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconDeviceTablet, IconUserCircle } from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { BatteryStatus, HeaderClock } from "./StatusTray";

const HEADER_HEIGHT = 56;
// バッテリー（アイコン 18px + 数値）を載せるため 36 → 40
const FOOTER_HEIGHT = 40;

/** ログインしていないことが確実な画面。 */
export const LOGGED_OUT_ROUTES = ["/login", "/setup", "/device-error"];

/**
 * ヘッダーに出す利用者名。**ログイン系の画面では必ず null**。
 *
 * 名前はサーバー側の layout が解決して props で降りてくるが、ログアウトは
 * router.replace での画面遷移で layout が使い回されるため再描画されず、
 * props は前の利用者の名前を持ったまま残る。居る画面で打ち消す。
 */
export function headerUserName(
  pathname: string,
  userName: string | null,
): string | null {
  const loggedOut = LOGGED_OUT_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  return loggedOut ? null : userName;
}

// 隠し端末設定の起動ジェスチャ: この時間内に 5 タップ
const SETTINGS_TAP_COUNT = 5;
const SETTINGS_TAP_WINDOW_MS = 2500;

type Props = {
  deviceName: string | null;
  registered: boolean;
  /** ログイン中の利用者名（未ログインは null）。 */
  userName?: string | null;
  children: ReactNode;
};

export function KioskShell({
  deviceName,
  registered,
  userName = null,
  children,
}: Props) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const router = useRouter();
  const pathname = usePathname();
  // ここに居るなら誰もログインしていない（上のコメントの理由で props は信用しない）
  const currentUser = headerUserName(pathname, userName);
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
          {/* 左: ログイン中の利用者。**未ログインは「未ログイン」と出す** —
              空欄だと「誰かのままなのか、誰も居ないのか」が読み取れない。
              未登録端末はまだ登録の話をしている段階なので出さない。 */}
          <Box style={{ minWidth: 0 }}>
            {currentUser ? (
              <Group gap="xs" wrap="nowrap">
                <IconUserCircle color="var(--mantine-color-blue-4)" size={26} />
                <Text fw={600} maw={280} size="md" truncate>
                  {currentUser}
                </Text>
              </Group>
            ) : (
              registered && (
                <Group gap="xs" wrap="nowrap">
                  <IconUserCircle
                    color="var(--mantine-color-dimmed)"
                    size={26}
                  />
                  <Text c="dimmed" fw={600} size="md">
                    未ログイン
                  </Text>
                </Group>
              )
            )}
          </Box>
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
          // Mantine 側の min-height: 100dvh も上書きしないと height が負ける
          height: `calc(100dvh - ${HEADER_HEIGHT}px - ${FOOTER_HEIGHT}px)`,
          minHeight: `calc(100dvh - ${HEADER_HEIGHT}px - ${FOOTER_HEIGHT}px)`,
          overflowY: "auto",
        }}
      >
        {children}
      </AppShell.Main>

      <AppShell.Footer
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          position: "relative",
        }}
      >
        {/* 中央: 会社名 + バージョン（左右の幅に影響されない絶対中央配置） */}
        <Box
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        >
          <Group gap="lg" wrap="nowrap">
            <Text c="dimmed" size="xs">
              シー・ケィ・ケー株式会社
            </Text>
            <Text c="dimmed" size="xs">
              v{version}
            </Text>
          </Group>
        </Box>
        <Group h="100%" justify="space-between" px="lg" wrap="nowrap">
          {/* 左: アプリ識別。**5 タップで隠し端末設定**（視覚的な手掛かりは
              出さない）。ログイン前にも要る操作なので常時表示する。 */}
          <UnstyledButton
            aria-label="CKK 専用端末"
            onClick={handleTitleTap}
            style={{ cursor: "default" }}
          >
            <Group gap={6} wrap="nowrap">
              <IconDeviceTablet color="var(--mantine-color-blue-4)" size={18} />
              <Text fw={600} size="xs">
                CKK 専用端末
              </Text>
            </Group>
          </UnstyledButton>
          {/* 右: バッテリー（イマーシブでシステムバーが見えないため常時表示） */}
          <BatteryStatus />
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
