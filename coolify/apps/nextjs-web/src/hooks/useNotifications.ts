"use client";

/**
 * useNotifications — ヘッダーベルの通知データ（SSE + フォールバック取得）。
 *
 * /api/sse/notifications を購読し、合図が来たら /api/notifications を
 * 取り直す。SSE には本文を載せていない（lib/realtime-events.ts）ので、
 * 表示に使うデータの出どころは従来どおり /api/notifications 1 本のまま。
 *
 * 保険が 3 段ある — SSE が届かない環境（プロキシがストリームを潰す等）でも
 * ベルが凍りつかないため:
 *   1. 接続が死んだら自前で開き直す（shouldReopenAfterError）
 *   2. 低頻度のフォールバック取得（FALLBACK_POLL_MS）
 *   3. タブ復帰時の取得
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Tr } from "@/lib/i18n";

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

/** 自前で開き直すときの待ち（指数バックオフ）。 */
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * error のあと、ブラウザ任せでよいか / こちらが開き直すべきか。
 *
 * EventSource が自動で繋ぎ直すのは**転送が切れたとき**だけで、そのとき
 * readyState は CONNECTING に戻る。対して 200 以外の HTTP 応答 —
 * デプロイでコンテナが入れ替わる最中の 502、セッション切れで proxy.ts に
 * /login へ 307 されて HTML が返る、など — は「接続の失敗」として CLOSED に
 * なり、ブラウザは**二度と**繋ぎ直さない。そこを放っておくと、タブを開いた
 * ままデプロイをまたいだ人のベルが以後フォールバック取得（5 分）まで
 * 沈黙する。ここだけは自前で開き直す。
 *
 * 数値リテラルで比べているのは、この判定を DOM 無し（vitest の node 環境）で
 * 試せるようにするため。2 = EventSource.CLOSED。
 */
export function shouldReopenAfterError(readyState: number): boolean {
  return readyState === 2;
}

/** 次回の待ち時間（上限まで倍々）。 */
export function nextReconnectDelay(currentMs: number): number {
  return Math.min(currentMs * 2, RECONNECT_MAX_MS);
}

/**
 * タブにつき SSE 接続 1 本を、購読者数で数えて共有する。
 *
 * 通知一覧ページではヘッダーのベルと一覧の両方がこのフックを使う。素直に
 * フックごとに EventSource を張ると 1 タブで 2 本になり、購読者が増えるほど
 * サーバー側の接続も倍々に増えていく。合図の中身は購読者によらず同じなので、
 * 接続は 1 本にして配るだけでよい。
 */
interface SignalStream {
  /** 再接続待ちの間は null。 */
  source: EventSource | null;
  handlers: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  onVisible: () => void;
  /** 次の再接続までの待ち。接続が生きた時点で base に戻す。 */
  reconnectMs: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  /** 購読者が居なくなって畳んだ後。以降は開き直さない。 */
  closed: boolean;
}

let sharedStream: SignalStream | null = null;

function fanOut(stream: SignalStream): void {
  // ハンドラの中で購読解除されても回り切るようコピーしてから回す。
  for (const handler of [...stream.handlers]) handler();
}

function openSource(stream: SignalStream): void {
  if (stream.closed) return;
  const source = new EventSource("/api/sse/notifications");
  const onSignal = () => {
    // 届いた = 生きている。次に落ちたときは 1 秒から数え直す。
    stream.reconnectMs = RECONNECT_BASE_MS;
    fanOut(stream);
  };
  source.addEventListener("ready", onSignal);
  source.addEventListener("notification", onSignal);
  source.addEventListener("error", () => {
    // 開き直した後に古い source の error が遅れて来ることがある。
    if (stream.source !== source) return;
    if (!shouldReopenAfterError(source.readyState)) return;
    scheduleReopen(stream);
  });
  stream.source = source;
}

function scheduleReopen(stream: SignalStream): void {
  if (stream.closed || stream.reconnectTimer) return;
  stream.source?.close();
  stream.source = null;
  const delay = stream.reconnectMs;
  stream.reconnectMs = nextReconnectDelay(delay);
  stream.reconnectTimer = setTimeout(() => {
    stream.reconnectTimer = null;
    // 開き直せたら ready が来て fanOut → 落ちていた間の分を取り直す。
    openSource(stream);
  }, delay);
}

function createStream(): SignalStream {
  const stream: SignalStream = {
    source: null,
    handlers: new Set(),
    timer: null,
    onVisible: () => {},
    reconnectMs: RECONNECT_BASE_MS,
    reconnectTimer: null,
    closed: false,
  };
  // SSE が届かない環境（プロキシがストリームを潰す等）でも凍りつかない保険。
  stream.timer = setInterval(() => fanOut(stream), FALLBACK_POLL_MS);
  stream.onVisible = () => {
    if (document.visibilityState !== "visible") return;
    fanOut(stream);
    // 裏で落ちたまま戻ってきたなら、バックオフの残りを待たずに繋ぎ直す。
    if (!stream.source) {
      if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
      stream.reconnectTimer = null;
      stream.reconnectMs = RECONNECT_BASE_MS;
      openSource(stream);
    }
  };
  document.addEventListener("visibilitychange", stream.onVisible);
  openSource(stream);
  return stream;
}

function teardown(stream: SignalStream): void {
  stream.closed = true;
  stream.source?.close();
  stream.source = null;
  if (stream.timer) clearInterval(stream.timer);
  if (stream.reconnectTimer) clearTimeout(stream.reconnectTimer);
  stream.timer = null;
  stream.reconnectTimer = null;
  document.removeEventListener("visibilitychange", stream.onVisible);
  if (sharedStream === stream) sharedStream = null;
}

/**
 * 合図の購読（useNotificationSignal の中身）。解除関数を返す。
 * React 抜きで再接続の挙動を試せるよう、フックとは別に公開している。
 */
export function subscribeToSignal(handler: () => void): () => void {
  if (!sharedStream) sharedStream = createStream();
  const stream = sharedStream;
  stream.handlers.add(handler);

  return () => {
    stream.handlers.delete(handler);
    // 最後の購読者が消えたら接続も畳む（次の購読で張り直す）。
    if (stream.handlers.size === 0) teardown(stream);
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
export function relativeTime(iso: string, tr: Tr): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return tr("common.justNow");
  if (minutes < 60) return tr("common.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr("common.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return tr("common.yesterday");
  if (days < 7) return tr("common.daysAgo", { n: days });
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
