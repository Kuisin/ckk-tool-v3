"use client";

/**
 * useKioskPresence — キオスク端末のオンライン状態 + 利用者をライブ購読するフック。
 *
 * kiosk 側の WS（`NEXT_PUBLIC_KIOSK_WS_URL` = wss://<kiosk-host>/api/kiosk/ws）に
 * サーバーアクション mintKioskWsToken の短命 HMAC トークンで接続し、
 * `snapshot`（接続時 + 30s ごとの定期配信）→ `device_status`（変化分）を
 * Map に反映する。メッセージ形状は kiosk 側 ws-server.ts と twin — 両方同時更新。
 *
 * フォールバック: WS が使えない間（環境変数未設定・接続失敗・切断中）は
 * サーバーアクション fetchKioskPresence を 30 秒間隔でポーリングし、
 * 一覧・フロアマップが画面ロード時の状態で凍結しないようにする。
 * 権限エラー時はどちらも再試行しない。WS 切断時は 5 秒後に自動再接続。
 */

import { useEffect, useRef, useState } from "react";
import {
  fetchKioskPresence,
  mintKioskWsToken,
} from "@/app/(dashboard)/settings/kiosk-devices/actions";

export interface KioskPresenceUser {
  userId: string;
  displayName: string;
}

export interface KioskPresenceEntry {
  isOnline: boolean;
  lastActivityAt: string | null;
  /** 現在ログイン中のユーザー（いなければ null）。 */
  user: KioskPresenceUser | null;
}

type PresenceDevice = {
  deviceId: string;
  isOnline: boolean;
  lastActivityAt: string | null;
  user: KioskPresenceUser | null;
};

type PresenceMessage =
  | { type: "snapshot"; devices: PresenceDevice[] }
  | ({ type: "device_status" } & PresenceDevice);

const RECONNECT_DELAY_MS = 5000;
const POLL_INTERVAL_MS = 30_000;

/** プレゼンスデータの供給元。none = サーバー計算の初期値のみ。 */
export type KioskPresenceTransport = "ws" | "poll" | "none";

export function useKioskPresence(): {
  /** deviceId → プレゼンス。live=false の間は空のまま。 */
  presence: ReadonlyMap<string, KioskPresenceEntry>;
  /** presence Map が生きたデータ（WS またはポーリング）か。 */
  live: boolean;
  transport: KioskPresenceTransport;
} {
  const [presence, setPresence] = useState<Map<string, KioskPresenceEntry>>(
    () => new Map(),
  );
  const [transport, setTransport] = useState<KioskPresenceTransport>("none");
  // 再接続タイマー・WS の後始末用。
  const disposedRef = useRef(false);
  // WS 接続中はポーリングを止めるためのフラグ（interval から参照）。
  const wsLiveRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollAllowed = true; // 権限エラーで false（以後ポーリングしない）

    const toMap = (devices: PresenceDevice[]) =>
      new Map(
        devices.map((d) => [
          d.deviceId,
          {
            isOnline: d.isOnline,
            lastActivityAt: d.lastActivityAt,
            user: d.user,
          },
        ]),
      );

    // ── ポーリングフォールバック（WS 不通時のみ） ────────────────────────
    const poll = async () => {
      if (disposedRef.current || wsLiveRef.current || !pollAllowed) return;
      try {
        const result = await fetchKioskPresence();
        if (disposedRef.current || wsLiveRef.current) return;
        if (!result.ok) {
          pollAllowed = false; // 権限なし — 以後試さない
          return;
        }
        setPresence(toMap(result.data.devices));
        setTransport("poll");
      } catch {
        // 一時障害 — 次の interval で再試行
      }
    };

    // ── WS（優先経路） ────────────────────────────────────────────────────
    const url = process.env.NEXT_PUBLIC_KIOSK_WS_URL;

    const scheduleReconnect = () => {
      if (disposedRef.current || timer) return;
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      if (!url || disposedRef.current) return;
      let token: string | null = null;
      try {
        const result = await mintKioskWsToken();
        if (!result.ok) return; // 権限なし — 再試行しない
        token = result.data.token;
      } catch {
        scheduleReconnect();
        return;
      }
      if (!token) return; // シークレット未設定 — ポーリングに任せる
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
          setPresence(toMap(message.devices));
          wsLiveRef.current = true;
          setTransport("ws");
        } else if (message.type === "device_status") {
          setPresence((prev) => {
            const next = new Map(prev);
            next.set(message.deviceId, {
              isOnline: message.isOnline,
              lastActivityAt: message.lastActivityAt,
              user: message.user,
            });
            return next;
          });
        }
      };
      ws.onclose = () => {
        wsLiveRef.current = false;
        setTransport((t) => (t === "ws" ? "none" : t));
        scheduleReconnect();
        void poll(); // 切断中もすぐ鮮度を回復
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    if (!url) void poll(); // WS が構成されていなければ即時ポーリング
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      disposedRef.current = true;
      wsLiveRef.current = false;
      if (timer) clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  return { presence, live: transport !== "none", transport };
}
