"use client";

/**
 * DevicePresence — 端末プレゼンス用 WS クライアント（何も描画しない）。
 *
 * 登録済み端末で全ルート（/login 含む）にマウントされ、/api/kiosk/ws への
 * 接続を保持する。接続中 = オンライン（サーバー側は kiosk_device Cookie で
 * upgrade 認証し、30s ごとに lastActivityAt を刻む）。これによりログアウト中の
 * 通電タブレットも SY09 でオンライン表示される。
 *
 * `next dev`（カスタムサーバーなし）では接続に失敗し続けるため、
 * 再接続はサイレントに指数バックオフ（5s → 最大 30s）。
 */

import { useEffect, useRef } from "react";

const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 30_000;

export function DevicePresence() {
  const wsRef = useRef<WebSocket | null>(null);
  const retryMsRef = useRef(INITIAL_RETRY_MS);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const scheduleReconnect = () => {
      if (stoppedRef.current || timerRef.current !== null) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        connect();
      }, retryMsRef.current);
      retryMsRef.current = Math.min(retryMsRef.current * 2, MAX_RETRY_MS);
    };

    const connect = () => {
      if (stoppedRef.current) return;
      const current = wsRef.current;
      if (
        current &&
        (current.readyState === WebSocket.OPEN ||
          current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/api/kiosk/ws`);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        retryMsRef.current = INITIAL_RETRY_MS;
      };
      ws.onclose = () => {
        wsRef.current = null;
        scheduleReconnect();
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    // 画面復帰・ネットワーク復帰時は待たずに即再接続
    const reconnectNow = () => {
      if (document.visibilityState === "hidden") return;
      retryMsRef.current = INITIAL_RETRY_MS;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", reconnectNow);
    window.addEventListener("online", reconnectNow);
    return () => {
      stoppedRef.current = true;
      document.removeEventListener("visibilitychange", reconnectNow);
      window.removeEventListener("online", reconnectNow);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return null;
}
