/**
 * ws-server.ts — 端末プレゼンスの WebSocket サーバー（/api/kiosk/ws）。
 *
 * カスタムサーバー（src/server.ts）から起動され、Next のバンドルには含まれない
 * （ルートハンドラからは ws-bridge.ts の globalThis 経由で触る）。
 *
 * クライアント 2 種:
 *   device  — キオスク端末（kiosk_device Cookie で upgrade 認証）。
 *             接続中 = オンライン。切断しても直近 5分の活動があればオンライン扱い。
 *   monitor — nextjs-web 管理 UI（KIOSK_WS_SECRET の HMAC トークンで認証）。
 *             接続時に snapshot、以後は変化分の device_status +
 *             30s ごとの定期 snapshot（取りこぼしの自己修復・利用者の鮮度維持）。
 *
 * ONLINE/OFFLINE の遷移は app.kiosk_device_logs へ記録する（冪等 guarded
 * insert — ws-db.ts insertPresenceLog）。ハートビート行は書かない。
 *
 * メッセージ形状は nextjs-web 側 useKioskPresence.ts と twin — 両方同時に更新。
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ONLINE_WINDOW_MS, WS_SWEEP_INTERVAL_MS } from "./kiosk-auth-core";
import type { KioskWsBridge } from "./ws-bridge";
import {
  getDeviceActivity,
  insertPresenceLog,
  listPresenceDevices,
  type PresenceUser,
  touchConnectedDevices,
  touchDeviceActivity,
} from "./ws-db";

type DeviceStatusMessage = {
  type: "device_status";
  deviceId: string;
  isOnline: boolean;
  lastActivityAt: string | null;
  user: PresenceUser;
};

type SnapshotMessage = {
  type: "snapshot";
  devices: Array<{
    deviceId: string;
    isOnline: boolean;
    lastActivityAt: string | null;
    user: PresenceUser;
  }>;
};

type TrackedSocket = WebSocket & { isAlive?: boolean };

/** 前回観測した状態（変化検知・遷移ログ用）。 */
type CachedStatus = { online: boolean; userId: string | null };

export class KioskWsServer implements KioskWsBridge {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly deviceSockets = new Map<string, Set<WebSocket>>();
  private readonly monitors = new Set<WebSocket>();
  private readonly statusCache = new Map<string, CachedStatus>();

  constructor() {
    // 30s ごと: ping/pong 生存確認 + 接続中端末のハートビート + オンライン再計算
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
    }, WS_SWEEP_INTERVAL_MS);
    timer.unref();
  }

  /** 30s ごとの定期処理: 接続中端末の lastActivity 更新 → オンライン再計算。 */
  private async tick(): Promise<void> {
    try {
      await touchConnectedDevices([...this.deviceSockets.keys()]);
    } catch {
      // DB 一時障害はスキップ（オンライン判定はソケット存在で維持される）
    }
    await this.sweep();
  }

  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    client: { kind: "device"; deviceId: string } | { kind: "monitor" },
  ): void {
    this.wss.handleUpgrade(req, socket, head, (ws: TrackedSocket) => {
      ws.isAlive = true;
      ws.on("pong", () => {
        ws.isAlive = true;
      });
      if (client.kind === "device") {
        this.attachDevice(ws, client.deviceId);
      } else {
        this.attachMonitor(ws);
      }
    });
  }

  private attachDevice(ws: WebSocket, deviceId: string): void {
    let set = this.deviceSockets.get(deviceId);
    if (!set) {
      set = new Set();
      this.deviceSockets.set(deviceId, set);
    }
    set.add(ws);
    ws.on("close", () => {
      const sockets = this.deviceSockets.get(deviceId);
      sockets?.delete(ws);
      if (sockets && sockets.size === 0) this.deviceSockets.delete(deviceId);
      void this.refreshDevice(deviceId);
    });
    void this.touchDevice(deviceId);
  }

  private attachMonitor(ws: WebSocket): void {
    this.monitors.add(ws);
    ws.on("close", () => {
      this.monitors.delete(ws);
    });
    void this.sendSnapshot(ws);
  }

  // ─── KioskWsBridge（Next ルートハンドラから globalThis 経由で呼ばれる） ────

  notifyActivity(deviceId: string): void {
    void this.refreshDevice(deviceId);
  }

  notifyDeviceChanged(deviceId: string): void {
    void this.refreshDevice(deviceId, { force: true });
  }

  // ─── 内部 ────────────────────────────────────────────────────────────────

  private isOnline(deviceId: string, lastActivityAt: Date | null): boolean {
    if ((this.deviceSockets.get(deviceId)?.size ?? 0) > 0) return true;
    if (!lastActivityAt) return false;
    return Date.now() - lastActivityAt.getTime() < ONLINE_WINDOW_MS;
  }

  /**
   * 観測した状態を cache に反映し、ONLINE/OFFLINE が変わっていれば遷移ログを
   * 書く（冪等 insert なので再起動直後の初観測でも重複しない）。
   * 戻り値: 前回から（online か userId が）変化したか。
   */
  private observe(
    deviceId: string,
    online: boolean,
    userId: string | null,
    source: "ws" | "sweep",
  ): boolean {
    const prev = this.statusCache.get(deviceId);
    if (!prev || prev.online !== online) {
      insertPresenceLog(deviceId, online ? "ONLINE" : "OFFLINE", source).catch(
        () => undefined, // ログ失敗でプレゼンス配信は止めない
      );
    }
    this.statusCache.set(deviceId, { online, userId });
    return !prev || prev.online !== online || prev.userId !== userId;
  }

  /** WS 接続時に lastActivityAt を刻んでからブロードキャスト。 */
  private async touchDevice(deviceId: string): Promise<void> {
    try {
      await touchDeviceActivity(deviceId);
    } catch {
      // 端末行が消えていても WS 側は落とさない
    }
    await this.refreshDevice(deviceId);
  }

  /** 1 台分のオンライン状態を再計算し、変化していればモニターへ配信。 */
  private async refreshDevice(
    deviceId: string,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    try {
      const device = await getDeviceActivity(deviceId);
      const online = device
        ? this.isOnline(deviceId, device.lastActivityAt)
        : false;
      const user = device?.user ?? null;
      const changed = this.observe(
        deviceId,
        online,
        user?.userId ?? null,
        "ws",
      );
      if (!opts.force && !changed) return;
      this.broadcast({
        type: "device_status",
        deviceId,
        isOnline: online,
        lastActivityAt: device?.lastActivityAt?.toISOString() ?? null,
        user,
      });
    } catch {
      // DB 一時障害はスキップ（次回 sweep で再計算）
    }
  }

  /**
   * 全 ACTIVE 端末のオンライン判定を回して遷移をログし、モニターへ定期
   * snapshot を配信する。モニター不在でも常時実行（遷移ログのため）。
   */
  private async sweep(): Promise<void> {
    try {
      const message = await this.buildSnapshot("sweep");
      if (this.monitors.size === 0) return;
      const payload = JSON.stringify(message);
      for (const ws of this.monitors) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      }
    } catch {
      // 次回 sweep で再試行
    }
  }

  private async sendSnapshot(ws: WebSocket): Promise<void> {
    try {
      const message = await this.buildSnapshot("ws");
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    } catch {
      // snapshot 失敗時はクライアント側の再接続に任せる
    }
  }

  /** 全端末の現況スナップショットを構築（cache 更新 + 遷移ログ込み）。 */
  private async buildSnapshot(
    source: "ws" | "sweep",
  ): Promise<SnapshotMessage> {
    const devices = await listPresenceDevices();
    return {
      type: "snapshot",
      devices: devices.map((d) => {
        const online = this.isOnline(d.id, d.lastActivityAt);
        this.observe(d.id, online, d.user?.userId ?? null, source);
        return {
          deviceId: d.id,
          isOnline: online,
          lastActivityAt: d.lastActivityAt?.toISOString() ?? null,
          user: d.user,
        };
      }),
    };
  }

  private broadcast(message: DeviceStatusMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.monitors) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
