"use client";

/**
 * useDisplayPresence — ディスプレイのオンライン状態をライブ購読するフック。
 *
 * キオスクの useKioskPresence と同じ形（WS 優先 + 30 秒ポーリングの
 * フォールバック + 権限エラーで恒久停止）。**別フックにしている**のは、
 * 繋ぐ先も語彙も違うから — あちらは端末とログイン中の人、こちらは
 * 画面の生死だけで、人は出てこない。
 *
 * 接続先は `NEXT_PUBLIC_KIOSK_WS_URL` の末尾を差し替えて作る。ディスプレイの
 * WS は同じ nextjs-kiosk アプリの別パス（/api/display/ws）なので、
 * ホスト名を 2 つ持たせない（設定を増やすと片方だけ古くなる）。
 *
 * メッセージ形状は nextjs-kiosk の display-ws-server.ts と対 — 変えるときは両方。
 */

import { useEffect, useRef, useState } from "react";
import {
  fetchDisplayPresence,
  mintDisplayWsToken,
} from "@/app/(dashboard)/settings/kiosk-devices/displays/actions";

const RECONNECT_DELAY_MS = 5000;
const POLL_INTERVAL_MS = 30_000;

export interface DisplayPresenceEntry {
  isOnline: boolean;
  lastSeenAt: string | null;
}

type PresenceDisplay = {
  displayId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
};

type PresenceMessage =
  | { type: "snapshot"; displays: PresenceDisplay[] }
  | ({ type: "display_status" } & PresenceDisplay);

export type DisplayPresenceTransport = "ws" | "poll" | "none";

/** キオスク WS の URL からディスプレイ WS の URL を作る。 */
function displayWsUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_KIOSK_WS_URL;
  if (!base) return undefined;
  return base.replace(/\/api\/kiosk\/ws\/?$/, "/api/display/ws");
}

export function useDisplayPresence(): {
  presence: ReadonlyMap<string, DisplayPresenceEntry>;
  live: boolean;
  transport: DisplayPresenceTransport;
} {
  const [presence, setPresence] = useState<Map<string, DisplayPresenceEntry>>(
    () => new Map(),
  );
  const [transport, setTransport] = useState<DisplayPresenceTransport>("none");
  const disposedRef = useRef(false);
  const wsLiveRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollAllowed = true;

    const toMap = (displays: PresenceDisplay[]) =>
      new Map(
        displays.map((d) => [
          d.displayId,
          { isOnline: d.isOnline, lastSeenAt: d.lastSeenAt },
        ]),
      );

    const poll = async () => {
      if (disposedRef.current || wsLiveRef.current || !pollAllowed) return;
      try {
        const result = await fetchDisplayPresence();
        if (disposedRef.current || wsLiveRef.current) return;
        if (!result.ok) {
          pollAllowed = false; // 権限なし — 以後試さない
          return;
        }
        setPresence(
          new Map(
            result.data.map((d) => [
              d.id,
              { isOnline: d.isOnline, lastSeenAt: d.lastSeenAt },
            ]),
          ),
        );
        setTransport("poll");
      } catch {
        // 一時障害 — 次の interval で再試行
      }
    };

    const url = displayWsUrl();

    const scheduleReconnect = () => {
      if (disposedRef.current || timer) return;
      timer = setTimeout(() => {
        timer = null;
        void connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = async () => {
      if (!url || disposedRef.current) return;
      let token: string | null = null;
      try {
        const result = await mintDisplayWsToken();
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
          setPresence(toMap(message.displays));
          wsLiveRef.current = true;
          setTransport("ws");
        } else if (message.type === "display_status") {
          setPresence((prev) => {
            const next = new Map(prev);
            next.set(message.displayId, {
              isOnline: message.isOnline,
              lastSeenAt: message.lastSeenAt,
            });
            return next;
          });
        }
      };
      ws.onclose = () => {
        wsLiveRef.current = false;
        setTransport((t) => (t === "ws" ? "none" : t));
        scheduleReconnect();
        void poll();
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    void connect();
    if (!url) void poll();
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      disposedRef.current = true;
      wsLiveRef.current = false;
      if (timer) clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      ws?.close();
    };
  }, []);

  return { presence, live: transport !== "none", transport };
}
