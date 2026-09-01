"use client";

/**
 * ActivityMonitor.tsx — アイドル監視（共有端末の要）。
 *
 * 操作イベントを監視し、最短 30 秒間隔で /api/kiosk/activity に ping。
 * サーバー応答の残り時間を基準にカウントダウンし、残り 3 分でチップ表示、
 * 0 で自動ログアウト（/login へ）。ping が 401 なら即ログアウト。
 */

import { Badge } from "@mantine/core";
import { IconClockExclamation } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fillMessage } from "@/lib/i18n";
import {
  ACTIVITY_PING_MIN_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  IDLE_WARN_MS,
} from "@/lib/kiosk-auth-core";
import { playLogoutSound, playWarnSound } from "@/lib/sound";
import { useI18n } from "./I18nProvider";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keypress",
  "scroll",
  "touchstart",
  "click",
] as const;

export function ActivityMonitor() {
  const router = useRouter();
  const { m } = useI18n();
  // 最後にサーバーへ ping が通った時刻（カウントダウンの基準）
  const lastAckRef = useRef<number>(Date.now());
  const lastPingRef = useRef<number>(0);
  const pendingRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState<number>(IDLE_TIMEOUT_MS);

  const logout = useCallback(async () => {
    playLogoutSound();
    try {
      await fetch("/api/kiosk/session", { method: "DELETE" });
    } finally {
      router.replace("/login");
      // 同上 — layout が持つ利用者名を捨てさせる
      router.refresh();
    }
  }, [router]);

  const ping = useCallback(async () => {
    lastPingRef.current = Date.now();
    pendingRef.current = false;
    try {
      const res = await fetch("/api/kiosk/activity", { method: "POST" });
      if (res.status === 401) {
        void logout();
        return;
      }
      if (res.ok) lastAckRef.current = Date.now();
    } catch {
      // 一時的な通信断 — 次の活動で再試行（カウントダウンは進み続ける）
    }
  }, [logout]);

  // 操作イベント → スロットル付き ping
  useEffect(() => {
    const onActivity = () => {
      const now = Date.now();
      if (now - lastPingRef.current >= ACTIVITY_PING_MIN_INTERVAL_MS) {
        void ping();
      } else {
        pendingRef.current = true; // 次の tick で間隔が空いていれば送る
      }
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [ping]);

  // 1 秒 tick: カウントダウン + 保留 ping の送出 + 0 で自動ログアウト
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (
        pendingRef.current &&
        now - lastPingRef.current >= ACTIVITY_PING_MIN_INTERVAL_MS
      ) {
        void ping();
      }
      const remaining = IDLE_TIMEOUT_MS - (now - lastAckRef.current);
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timer);
        void logout();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ping, logout]);

  // 警告表示に入った瞬間に 1 回だけ警告音（活動で解除されたらリセット）
  const warned = remainingMs <= IDLE_WARN_MS;
  const warnedRef = useRef(false);
  useEffect(() => {
    if (warned && !warnedRef.current) playWarnSound();
    warnedRef.current = warned;
  }, [warned]);

  if (remainingMs > IDLE_WARN_MS) return null;

  const min = Math.floor(remainingMs / 60_000);
  const sec = Math.floor((remainingMs % 60_000) / 1000);
  return (
    <Badge
      color="yellow"
      leftSection={<IconClockExclamation size={16} />}
      size="lg"
      style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000 }}
      variant="filled"
    >
      {fillMessage(m.activity.autoLogout, {
        time: `${min}:${String(sec).padStart(2, "0")}`,
      })}
    </Badge>
  );
}
