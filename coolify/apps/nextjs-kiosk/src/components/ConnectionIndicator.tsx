"use client";

/**
 * ConnectionIndicator.tsx — ヘッダー右上の接続状態ドット + オフラインオーバーレイ。
 *
 * 疎通判定はこの URL 自身（/api/healthz — 静的・DB なし）への定期プローブ。
 * インターネット到達性は見ない — キオスク URL が LAN 内で解決される環境でも
 * 正しく「接続あり」になる。加えて:
 *   - navigator.onLine=false は即「接続なし」（OS がネットワーク断のとき）
 *   - DevicePresence の WS 切断イベント（kiosk:ws）は「不安定」の材料
 *
 * 連続 2 回プローブ失敗（または OS オフライン）で全画面のオフライン
 * オーバーレイを表示し、疎通回復で自動的に閉じる（オフラインモード）。
 */

import { Box, Loader, Stack, Text, Tooltip } from "@mantine/core";
import { IconWifiOff } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { INDICATOR_COLOR, resolveIndicator } from "@/lib/connection-status";
import { fillMessage } from "@/lib/i18n";
import { getBridge } from "@/lib/wrapper-bridge";
import { useI18n } from "./I18nProvider";

const PROBE_INTERVAL_MS = 10_000; // 通常時
const PROBE_RETRY_MS = 4_000; // 失敗中は短間隔で再試行
const PROBE_TIMEOUT_MS = 5_000;
const OFFLINE_AFTER_FAILURES = 2; // 連続失敗数 → オフライン扱い
const UNSTABLE_WINDOW_MS = 45_000; // 直近この時間に失敗/WS 断があれば「不安定」

export function ConnectionIndicator({ registered }: { registered: boolean }) {
  const { m } = useI18n();
  const [online, setOnline] = useState(true);
  const [consecFails, setConsecFails] = useState(0);
  const [hasBridge, setHasBridge] = useState(false);
  const [unstable, setUnstable] = useState(false);

  const lastBlipRef = useRef(0);
  const unstableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 失敗・WS 断の「痕跡」を記録し、45 秒間は不安定表示にする
  const markBlip = () => {
    lastBlipRef.current = Date.now();
    setUnstable(true);
    if (unstableTimerRef.current) clearTimeout(unstableTimerRef.current);
    unstableTimerRef.current = setTimeout(() => {
      if (Date.now() - lastBlipRef.current >= UNSTABLE_WINDOW_MS) {
        setUnstable(false);
      }
    }, UNSTABLE_WINDOW_MS + 500);
  };
  const markBlipRef = useRef(markBlip);
  markBlipRef.current = markBlip;

  // ブリッジ検出はマウント後 1 回（注入はページロード時に完了している）
  useEffect(() => {
    setHasBridge(getBridge() != null);
    setOnline(navigator.onLine);
  }, []);

  // /api/healthz プローブループ（失敗中は短間隔）
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failing = false;

    const schedule = (ms: number) => {
      if (stopped) return;
      timer = setTimeout(probe, ms);
    };

    const probe = async () => {
      try {
        const res = await fetch("/api/healthz", {
          cache: "no-store",
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(String(res.status));
        if (stopped) return;
        if (failing) markBlipRef.current(); // 回復直後は不安定表示を継続
        failing = false;
        setConsecFails(0);
        schedule(PROBE_INTERVAL_MS);
      } catch {
        if (stopped) return;
        failing = true;
        markBlipRef.current();
        setConsecFails((n) => n + 1);
        schedule(PROBE_RETRY_MS);
      }
    };

    void probe();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // OS のオンライン/オフライン + DevicePresence の WS イベント
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onWs = (e: Event) => {
      const up = (e as CustomEvent<{ up: boolean }>).detail?.up;
      if (up === false) markBlipRef.current();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("kiosk:ws", onWs);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("kiosk:ws", onWs);
    };
  }, []);

  const serverReachable = consecFails < OFFLINE_AFTER_FAILURES;
  const state = resolveIndicator(
    {
      online,
      serverReachable,
      registered,
      hasBridge,
      unstable,
    },
    {
      none: m.shell.connectionNone,
      deviceUnregistered: m.shell.connectionDeviceUnregistered,
      app: m.shell.connectionApp,
      browser: m.shell.connectionBrowser,
      unstableSuffix: m.shell.connectionUnstableSuffix,
    },
  );
  const offline = !online || !serverReachable;

  return (
    <>
      <Tooltip
        events={{ hover: true, focus: true, touch: true }}
        label={state.label}
        withinPortal
      >
        <Box
          aria-label={fillMessage(m.shell.connectionStatus, {
            label: state.label,
          })}
          className={state.blinking ? "kiosk-dot-blink" : undefined}
          component="output"
          h={10}
          style={{
            borderRadius: "50%",
            background: INDICATOR_COLOR[state.level],
            flexShrink: 0,
          }}
          w={10}
        />
      </Tooltip>

      {/* オフラインモード: 全画面オーバーレイ（疎通回復で自動で閉じる） */}
      {offline && (
        <Box
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(18, 19, 34, 0.96)",
          }}
        >
          <Stack align="center" gap="md" px="xl">
            <IconWifiOff color="var(--mantine-color-gray-5)" size={64} />
            <Text fw={700} size="xl">
              {m.shell.offlineTitle}
            </Text>
            <Text c="dimmed" size="md" ta="center">
              {m.shell.offlineMessage}
              <br />
              {m.shell.offlineRecovery}
            </Text>
            <Loader size="sm" />
          </Stack>
        </Box>
      )}
    </>
  );
}
