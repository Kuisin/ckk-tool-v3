"use client";

/**
 * useNotifications — ヘッダーベルの通知データ（ポーリング）。
 *
 * /api/notifications を一定間隔 + タブ復帰時に取得する。
 * SSE 化は将来の置き換えポイント（このフックの内部実装だけ変わる）。
 */

import { useCallback, useEffect, useState } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  linkPath: string | null;
  isRead: boolean;
  createdAt: string; // ISO
}

const POLL_MS = 30_000;

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
      // オフライン等 — 次のポーリングで回復
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

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
