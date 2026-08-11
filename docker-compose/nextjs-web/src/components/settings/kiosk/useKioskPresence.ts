"use client";

/**
 * useKioskPresence — キオスク端末のオンライン状態をライブ購読するフック。
 *
 * kiosk 側の WS（`NEXT_PUBLIC_KIOSK_WS_URL` = wss://<kiosk-host>/api/kiosk/ws）に
 * サーバーアクション mintKioskWsToken の短命 HMAC トークンで接続し、
 * `snapshot`（接続時の全端末）→ `device_status`（変化分）を Map に反映する。
 *
 * フォールバック: 環境変数未設定・接続失敗時は `live=false` のまま —
 * 呼び出し側はサーバー計算の initialOnline（lastActivityAt 5分以内）を使う。
 * 切断時は 5 秒後に新しいトークンで自動再接続。
 */

import { useEffect, useRef, useState } from "react";
import { mintKioskWsToken } from "@/app/(dashboard)/settings/kiosk-devices/actions";

export interface KioskPresenceEntry {
  isOnline: boolean;
  lastActivityAt: string | null;
}

type PresenceMessage =
  | {
      type: "snapshot";
      devices: Array<{
        deviceId: string;
        isOnline: boolean;
        lastActivityAt: string | null;
      }>;
    }
  | {
      type: "device_status";
      deviceId: string;
      isOnline: boolean;
      lastActivityAt: string | null;
    };

const RECONNECT_DELAY_MS = 5000;

export function useKioskPresence(): {
  /** deviceId → プレゼンス。live=false の間は空のまま。 */
  presence: ReadonlyMap<string, KioskPresenceEntry>;
  /** WS 接続中（snapshot 受信済み）か。false ならフォールバック表示。 */
  live: boolean;
} {
  const [presence, setPresence] = useState<Map<string, KioskPresenceEntry>>(
    () => new Map(),
  );
  const [live, setLive] = useState(false);
  // 再接続タイマー・WS の後始末用。
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const url = process.env.NEXT_PUBLIC_KIOSK_WS_URL;
    if (!url) return; // 未設定 — 静的フォールバックのみ

    const scheduleReconnect = () => {
      if (disposedRef.current || timer) return;
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      if (disposedRef.current) return;
      let token: string | null = null;
      try {
        const result = await mintKioskWsToken();
        if (!result.ok) return; // 権限なし — 再試行しない
        token = result.data.token;
      } catch {
        scheduleReconnect();
        return;
      }
      if (!token) return; // シークレット未設定 — 静的フォールバック
      if (disposedRef.current) return;

      try {
        ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onmessage = (event) => {
        let message: PresenceMessage;
        try {
          message = JSON.parse(String(event.data)) as PresenceMessage;
        } catch {
          return;
        }
        if (message.type === "snapshot") {
          setPresence(
            new Map(
              message.devices.map((d) => [
                d.deviceId,
                { isOnline: d.isOnline, lastActivityAt: d.lastActivityAt },
              ]),
            ),
          );
          setLive(true);
        } else if (message.type === "device_status") {
          setPresence((prev) => {
            const next = new Map(prev);
            next.set(message.deviceId, {
              isOnline: message.isOnline,
              lastActivityAt: message.lastActivityAt,
            });
            return next;
          });
        }
      };
      ws.onclose = () => {
        setLive(false);
        scheduleReconnect();
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      disposedRef.current = true;
      if (timer) clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return { presence, live };
}
