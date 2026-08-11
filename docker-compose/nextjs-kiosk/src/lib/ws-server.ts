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
 *             接続時に snapshot、以後は変化分の device_status を受信。
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ONLINE_WINDOW_MS, WS_SWEEP_INTERVAL_MS } from "./kiosk-auth-core";
import type { KioskWsBridge } from "./ws-bridge";
import {
  getDeviceActivity,
  listPresenceDevices,
  touchConnectedDevices,
  touchDeviceActivity,
} from "./ws-db";

type DeviceStatusMessage = {
  type: "device_status";
  deviceId: string;
  isOnline: boolean;
  lastActivityAt: string | null;
};

type SnapshotMessage = {
  type: "snapshot";
  devices: Array<{
    deviceId: string;
    isOnline: boolean;
    lastActivityAt: string | null;
  }>;
};

type TrackedSocket = WebSocket & { isAlive?: boolean };

export class KioskWsServer implements KioskWsBridge {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly deviceSockets = new Map<string, Set<WebSocket>>();
  private readonly monitors = new Set<WebSocket>();
  /** 前回ブロードキャストしたオンライン状態（変化検知用）。 */
  private readonly statusCache = new Map<string, boolean>();

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
      if (!opts.force && this.statusCache.get(deviceId) === online) return;
      this.statusCache.set(deviceId, online);
      this.broadcast({
        type: "device_status",
        deviceId,
        isOnline: online,
        lastActivityAt: device?.lastActivityAt?.toISOString() ?? null,
      });
    } catch {
      // DB 一時障害はスキップ（次回 sweep で再計算）
    }
  }

  /**
   * 全 ACTIVE 端末のオンライン判定を回し、変化分だけ配信。
   * モニター不在でも常時実行する（statusCache を最新に保ち、将来の
   * 遷移ログ書き込みの土台にする）。broadcast はモニター不在なら no-op。
   */
  private async sweep(): Promise<void> {
    try {
      const devices = await listPresenceDevices();
      for (const d of devices) {
        const online = this.isOnline(d.id, d.lastActivityAt);
        if (this.statusCache.get(d.id) === online) continue;
        this.statusCache.set(d.id, online);
        this.broadcast({
          type: "device_status",
          deviceId: d.id,
          isOnline: online,
          lastActivityAt: d.lastActivityAt?.toISOString() ?? null,
        });
      }
    } catch {
      // 次回 sweep で再試行
    }
  }

  private async sendSnapshot(ws: WebSocket): Promise<void> {
    try {
      const devices = await listPresenceDevices();
      const message: SnapshotMessage = {
        type: "snapshot",
        devices: devices.map((d) => ({
          deviceId: d.id,
          isOnline: this.isOnline(d.id, d.lastActivityAt),
          lastActivityAt: d.lastActivityAt?.toISOString() ?? null,
        })),
      };
      for (const d of message.devices)
        this.statusCache.set(d.deviceId, d.isOnline);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    } catch {
      // snapshot 失敗時はクライアント側の再接続に任せる
    }
  }

  private broadcast(message: DeviceStatusMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.monitors) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
