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
 * タブにつき SSE 接続 1 本を、購読者数で数えて共有する。
 *
 * 通知一覧ページではヘッダーのベルと一覧の両方がこのフックを使う。素直に
 * フックごとに EventSource を張ると 1 タブで 2 本になり、購読者が増えるほど
 * サーバー側の接続も倍々に増えていく。合図の中身は購読者によらず同じなので、
 * 接続は 1 本にして配るだけでよい。
 */
let sharedStream: {
  source: EventSource;
  handlers: Set<() => void>;
  timer: ReturnType<typeof setInterval>;
  onVisible: () => void;
} | null = null;

function subscribeToSignal(handler: () => void): () => void {
  if (!sharedStream) {
    const handlers = new Set<() => void>();
    const fanOut = () => {
      for (const h of handlers) h();
    };
    const source = new EventSource("/api/sse/notifications");
    source.addEventListener("ready", fanOut);
    source.addEventListener("notification", fanOut);
    // SSE が届かない環境（プロキシがストリームを潰す等）でも凍りつかない保険。
    const timer = setInterval(fanOut, FALLBACK_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fanOut();
    };
    document.addEventListener("visibilitychange", onVisible);
    sharedStream = { source, handlers, timer, onVisible };
  }

  const stream = sharedStream;
  stream.handlers.add(handler);

  return () => {
    stream.handlers.delete(handler);
    // 最後の購読者が消えたら接続も畳む（次の購読で張り直す）。
    if (stream.handlers.size === 0) {
      stream.source.close();
      clearInterval(stream.timer);
      document.removeEventListener("visibilitychange", stream.onVisible);
      if (sharedStream === stream) sharedStream = null;
    }
  };
}

/**
 * 通知の「更新された」合図を購読する（ベルと通知一覧の共通土台）。
 *
 * `onSignal` は ready（購読確立）と notification（変化）の両方で呼ぶ。
 * ready でも呼ぶのは、接続が張れるまでの隙間と再接続後の取りこぼしを
 * 同じ 1 本の道で埋めるため。
 *
 * 最新の `onSignal` は ref に持つ — 呼び出し側が useCallback を付け忘れても
 * 毎レンダリングで購読し直さない。
 */
export function useNotificationSignal(onSignal: () => void): void {
  const latest = useRef(onSignal);
  latest.current = onSignal;

  useEffect(() => subscribeToSignal(() => latest.current()), []);
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
