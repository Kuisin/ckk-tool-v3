/**
 * server.ts — カスタムサーバー: Next + WebSocket (/api/kiosk/ws)。
 *
 * Next 単体では HTTP サーバーの upgrade イベントに触れないため、ここで
 * createServer し、/api/kiosk/ws の upgrade だけ自前で認証して ws に渡す。
 * それ以外は全て Next のリクエストハンドラへ。
 *
 * ビルド: `pnpm build:server`（tsc → dist/）、起動: `node dist/src/server.js`。
 * 開発で WS まで試すときは `pnpm build:server && NODE_ENV=development node dist/src/server.js`
 * （通常の UI 開発は `pnpm dev` で可 — WS は無くてもアプリは動く）。
 */

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import { verifyMonitorToken } from "./lib/ws-auth";
import { findActiveDeviceByTokenHash } from "./lib/ws-db";
import { KioskWsServer } from "./lib/ws-server";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(
      part.slice(eq + 1).trim(),
    );
  }
  return out;
}

async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<{ kind: "device"; deviceId: string } | { kind: "monitor" } | null> {
  const url = new URL(req.url ?? "/", "http://localhost");

  // モニター（管理 UI）: ?token= の HMAC 短命トークン
  const token = url.searchParams.get("token");
  if (token) {
    const secret = process.env.KIOSK_WS_SECRET;
    if (secret && verifyMonitorToken(secret, token)) return { kind: "monitor" };
    return null;
  }

  // 端末: kiosk_device Cookie → SHA-256 → ACTIVE + 期限内
  const raw = parseCookies(req).kiosk_device;
  if (!raw) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const deviceId = await findActiveDeviceByTokenHash(hash);
  if (!deviceId) return null;
  return { kind: "device", deviceId };
}

async function main(): Promise<void> {
  const app = next({ dev, dir: process.cwd() });
  await app.prepare();
  const handle = app.getRequestHandler();
  const handleUpgrade = app.getUpgradeHandler();

  const kioskWs = new KioskWsServer();
  // Next のルートハンドラ（別モジュールグラフ）から ws-bridge.ts 経由で参照
  (globalThis as { __kioskWs?: KioskWsServer }).__kioskWs = kioskWs;

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/api/kiosk/ws") {
      // Next(dev) の HMR 用 upgrade は Next へ委譲
      void handleUpgrade(req, socket, head);
      return;
    }
    void authenticateUpgrade(req)
      .then((client) => {
        if (!client) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        kioskWs.handleUpgrade(req, socket, head, client);
      })
      .catch(() => {
        socket.destroy();
      });
  });

  server.listen(port, hostname, () => {
    console.log(
      `nextjs-kiosk ready on http://${hostname}:${port} (dev=${dev})`,
    );
  });
}

void main();
