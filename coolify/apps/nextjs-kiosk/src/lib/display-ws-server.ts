/**
 * display-ws-server.ts — ディスプレイの WS（/api/display/ws）。
 *
 * KioskWsServer の兄弟。**分けている**のは、扱う表も語彙も別だから
 * （あちらは「人がタブレットを触っている形跡」、こちらは「Pi が生きている」）。
 * 1 クラスにまとめると、片方の都合の変更がもう片方を黙って壊す。
 *
 * クライアント 2 種:
 *   display — Raspberry Pi（ckk_display Cookie で upgrade 認証）。
 *             接続中 = オンライン。切れても直近 5 分の生存でオンライン扱い。
 *             サーバーからは config_changed / revoked を送る。
 *   monitor — nextjs-web の管理 UI（KIOSK_WS_SECRET の HMAC トークン）。
 *             接続時に snapshot、以後は変化分 + 30s ごとの定期 snapshot。
 *
 * 遷移ログは**書かない**（display_device_logs を作っていない — 掲示板の
 * 点いた/消えたを台帳に残す必要が無い）。
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  DISPLAY_ONLINE_WINDOW_MS,
  DISPLAY_SWEEP_INTERVAL_MS,
} from "./display-core";
import type { DisplayWsBridge } from "./display-ws-bridge";
import {
  getDisplayPresence,
  listPresenceDisplays,
  touchConnectedDisplays,
  touchDisplaySeen,
} from "./display-ws-db";

type DisplayStatusMessage = {
  type: "display_status";
  displayId: string;
  isOnline: boolean;
  lastSeenAt: string | null;
  profileId: string | null;
  appVersion: string | null;
};

type SnapshotMessage = {
  type: "snapshot";
  displays: Array<{
    displayId: string;
    isOnline: boolean;
    lastSeenAt: string | null;
    profileId: string | null;
    appVersion: string | null;
  }>;
};

type TrackedSocket = WebSocket & { isAlive?: boolean };

export class DisplayWsServer implements DisplayWsBridge {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly displaySockets = new Map<string, Set<WebSocket>>();
  private readonly monitors = new Set<WebSocket>();
  private readonly onlineCache = new Map<string, boolean>();

  constructor() {
    const timer = setInterval(() => {
      for (const ws of this.wss.clients as Set<TrackedSocket>) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
      void this.tick();
    }, DISPLAY_SWEEP_INTERVAL_MS);
    timer.unref();
  }

  private async tick(): Promise<void> {
    try {
      await touchConnectedDisplays([...this.displaySockets.keys()]);
    } catch {
      // DB 一時障害はスキップ（オンライン判定はソケット存在で維持される）
    }
    await this.sweep();
  }

  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    client: { kind: "display"; displayId: string } | { kind: "monitor" },
  ): void {
    this.wss.handleUpgrade(req, socket, head, (ws: TrackedSocket) => {
      ws.isAlive = true;
      ws.on("pong", () => {
        ws.isAlive = true;
      });
      if (client.kind === "display") {
        this.attachDisplay(ws, client.displayId);
      } else {
        this.attachMonitor(ws);
      }
    });
  }

  private attachDisplay(ws: WebSocket, displayId: string): void {
    let set = this.displaySockets.get(displayId);
    if (!set) {
      set = new Set();
      this.displaySockets.set(displayId, set);
    }
    set.add(ws);
    ws.on("close", () => {
      const sockets = this.displaySockets.get(displayId);
      sockets?.delete(ws);
      if (sockets && sockets.size === 0) this.displaySockets.delete(displayId);
      void this.refresh(displayId);
    });
    void this.touch(displayId);
  }

  private attachMonitor(ws: WebSocket): void {
    this.monitors.add(ws);
    ws.on("close", () => {
      this.monitors.delete(ws);
    });
    void this.sendSnapshot(ws);
  }

  // ─── DisplayWsBridge（Next 側から globalThis 経由で呼ばれる） ──────────────

  notifyConfigChanged(displayId: string): void {
    this.sendToDisplay(displayId, { type: "config_changed" });
    void this.refresh(displayId, { force: true });
  }

  notifyRevoked(displayId: string): void {
    this.sendToDisplay(displayId, { type: "revoked" });
    // 失効したので繋ぎ直させる（次の接続は upgrade 認証で弾かれる）
    for (const ws of this.displaySockets.get(displayId) ?? []) ws.close();
    void this.refresh(displayId, { force: true });
  }

  notifyDisplayChanged(displayId: string): void {
    void this.refresh(displayId, { force: true });
  }

  // ─── 内部 ────────────────────────────────────────────────────────────────

  private sendToDisplay(displayId: string, message: { type: string }): void {
    const payload = JSON.stringify(message);
    for (const ws of this.displaySockets.get(displayId) ?? []) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }

  private isOnline(displayId: string, lastSeenAt: Date | null): boolean {
    if ((this.displaySockets.get(displayId)?.size ?? 0) > 0) return true;
    if (!lastSeenAt) return false;
    return Date.now() - lastSeenAt.getTime() < DISPLAY_ONLINE_WINDOW_MS;
  }

  private async touch(displayId: string): Promise<void> {
    try {
      await touchDisplaySeen(displayId);
    } catch {
      // 行が消えていても WS 側は落とさない
    }
    await this.refresh(displayId);
  }

  /** 1 台分の現況を再計算し、変化していればモニターへ配信。 */
  private async refresh(
    displayId: string,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    try {
      const row = await getDisplayPresence(displayId);
      const online = row ? this.isOnline(displayId, row.lastSeenAt) : false;
      const changed = this.onlineCache.get(displayId) !== online;
      this.onlineCache.set(displayId, online);
      if (!opts.force && !changed) return;
      this.broadcast({
        type: "display_status",
        displayId,
        isOnline: online,
        lastSeenAt: row?.lastSeenAt?.toISOString() ?? null,
        profileId: row?.profileId ?? null,
        appVersion: row?.appVersion ?? null,
      });
    } catch {
      // DB 一時障害はスキップ（次の sweep で再計算）
    }
  }

  private async sweep(): Promise<void> {
    try {
      const message = await this.buildSnapshot();
      if (this.monitors.size === 0) return;
      const payload = JSON.stringify(message);
      for (const ws of this.monitors) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    } catch {
      // 次の sweep で再試行
    }
  }

  private async sendSnapshot(ws: WebSocket): Promise<void> {
    try {
      const message = await this.buildSnapshot();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    } catch {
      // 失敗時はクライアント側の再接続に任せる
    }
  }

  private async buildSnapshot(): Promise<SnapshotMessage> {
    const rows = await listPresenceDisplays();
    return {
      type: "snapshot",
      displays: rows.map((d) => {
        const online = this.isOnline(d.id, d.lastSeenAt);
        this.onlineCache.set(d.id, online);
        return {
          displayId: d.id,
          isOnline: online,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          profileId: d.profileId,
          appVersion: d.appVersion,
        };
      }),
    };
  }

  private broadcast(message: DisplayStatusMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.monitors) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
