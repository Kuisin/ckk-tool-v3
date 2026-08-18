"use client";

/**
 * useNotifications — ヘッダーベルの通知データ（SSE + フォールバック取得）。
 *
 * /api/sse/notifications を購読し、合図が来たら /api/notifications を
 * 取り直す。SSE には本文を載せていない（lib/realtime-events.ts）ので、
 * 表示に使うデータの出どころは従来どおり /api/notifications 1 本のまま。
 *
 * 保険が 2 段ある — SSE が届かない環境（プロキシがストリームを潰す等）でも
 * ベルが凍りつかないため:
 *   1. 低頻度のフォールバック取得（FALLBACK_POLL_MS）
 *   2. タブ復帰時の取得
 * EventSource の再接続はブラウザ任せ（retry はサーバーが指定）。
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  linkPath: string | null;
  isRead: boolean;
  createdAt: string; // ISO
}

/**
 * SSE が生きていれば使われない保険の取得間隔。SSE が張れない環境でも
 * この間隔でベルが追いつく（従来のポーリングは 30 秒だった）。
 */
const FALLBACK_POLL_MS = 300_000;

/**
 * 通知の「更新された」合図を購読する（ベルと通知一覧の共通土台）。
 *
 * `onSignal` は ready（購読確立）と notification（変化）の両方で呼ぶ。
 * ready でも呼ぶのは、接続が張れるまでの隙間と再接続後の取りこぼしを
 * 同じ 1 本の道で埋めるため。
 *
 * 最新の `onSignal` は ref に持つ — 呼び出し側が useCallback を付け忘れても
 * 毎レンダリングで EventSource を張り直さない（接続が暴れると通知どころか
 * サーバーの接続数まで巻き添えになる）。
 */
export function useNotificationSignal(onSignal: () => void): void {
  const latest = useRef(onSignal);
  latest.current = onSignal;

  useEffect(() => {
    const source = new EventSource("/api/sse/notifications");
    const handler = () => latest.current();
    source.addEventListener("ready", handler);
    source.addEventListener("notification", handler);

    // SSE が届かない環境（プロキシがストリームを潰す等）でも凍りつかない保険。
    const timer = setInterval(handler, FALLBACK_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") handler();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      source.removeEventListener("ready", handler);
      source.removeEventListener("notification", handler);
      source.close();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

export function useNotifications(): {
  unreadCount: number;
  items: NotificationItem[];
  refresh: () => Promise<void>;
} {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        unreadCount: number;
        items: NotificationItem[];
      };
      setUnreadCount(data.unreadCount);
      setItems(data.items);
    } catch {
      // オフライン等 — 次の合図・フォールバック取得で回復
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useNotificationSignal(useCallback(() => void refresh(), [refresh]));

  return { unreadCount, items, refresh };
}

/** 通知タイムスタンプの相対表示（design.md §17.3: X分前 / X時間前 / 昨日）。 */
export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨日";
  if (days < 7) return `${days}日前`;
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
