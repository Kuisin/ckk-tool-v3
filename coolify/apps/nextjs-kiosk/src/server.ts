/**
 * server.ts — カスタムサーバー: Next + WebSocket
 * (/api/kiosk/ws = 共有端末 / /api/display/ws = 管理ディスプレイ)。
 *
 * Next 単体では HTTP サーバーの upgrade イベントに触れないため、ここで
 * createServer し、2 つの WS パスだけ自前で認証して ws に渡す。
 * それ以外は全て Next のリクエストハンドラへ。
 *
 * 端末とディスプレイで**サーバーを分けている**のは、扱う表も語彙も別だから
 * （kiosk_devices の「人が触った形跡」と display_devices の「Pi が生きている」）。
 * モニタートークンだけは共通（KIOSK_WS_SECRET — 秘密を増やさない）。
 *
 * ビルド: `pnpm build:server`（tsc → dist/）、起動: `node dist/src/server.js`。
 * 開発で WS まで試すときは `pnpm build:server && NODE_ENV=development node dist/src/server.js`
 * （通常の UI 開発は `pnpm dev` で可 — WS は無くてもアプリは動く）。
 */

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import {
  attestationRequired,
  attestSecret,
  verifyAttestCookie,
} from "./lib/attest-core";
import { findActiveDisplayByTokenHash } from "./lib/display-ws-db";
import { DisplayWsServer } from "./lib/display-ws-server";
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
  const device = await findActiveDeviceByTokenHash(hash);
  if (!device) return null;
  // KIOSK_ATTESTATION=required: WS もアテスト Cookie（12h）を要求。
  // fingerprint を照合に含めるので、鍵リセット後の古い Cookie は通らない。
  if (attestationRequired()) {
    const secret = attestSecret();
    const attest = parseCookies(req).kiosk_attest;
    if (
      !secret ||
      !attest ||
      !verifyAttestCookie(secret, attest, device.id, device.fingerprint)
    ) {
      return null;
    }
  }
  return { kind: "device", deviceId: device.id };
}

/** /api/display/ws の upgrade 認証（ckk_display Cookie か モニタートークン）。 */
async function authenticateDisplayUpgrade(
  req: IncomingMessage,
): Promise<
  { kind: "display"; displayId: string } | { kind: "monitor" } | null
> {
  const url = new URL(req.url ?? "/", "http://localhost");

  const token = url.searchParams.get("token");
  if (token) {
    const secret = process.env.KIOSK_WS_SECRET;
    if (secret && verifyMonitorToken(secret, token)) return { kind: "monitor" };
    return null;
  }

  // **窓ごとの Cookie。** 同じブラウザで 2 画面を出しているとき、どちらの
  // 画面として繋いだのかを取り違えないため（?screen= はクライアントが付ける）。
  // tsc の CJS ビルドなので lib/display-core は読み込まず、名前の規則だけ写す
  // （規則の正は displayCookieName — 変えるときは両方直すこと）。
  const screen = Number(url.searchParams.get("screen"));
  const cookieName =
    Number.isInteger(screen) && screen > 1
      ? `ckk_display_${screen}`
      : "ckk_display";
  const raw = parseCookies(req)[cookieName];
  if (!raw) return null;
  const hash = createHash("sha256").update(raw).digest("hex");
  const displayId = await findActiveDisplayByTokenHash(hash);
  return displayId ? { kind: "display", displayId } : null;
}

/**
 * アテステーション必須なのに専用シークレットが無い構成を起動時に 1 度だけ言う。
 * attestSecret() は KIOSK_WS_SECRET へ黙って落ちる（互換のため変えない）が、
 * 2 つの秘密が同じ値になっていることは運用者に見えていてほしい。
 */
function warnAttestSecretFallback(): void {
  if (!attestationRequired() || process.env.KIOSK_ATTEST_SECRET) return;
  console.warn(
    process.env.KIOSK_WS_SECRET
      ? "[attest] KIOSK_ATTESTATION=required ですが KIOSK_ATTEST_SECRET が未設定です。KIOSK_WS_SECRET を流用します（専用の値を設定してください）" // i18n-ignore — サーバーログのみ
      : "[attest] KIOSK_ATTESTATION=required ですが KIOSK_ATTEST_SECRET も KIOSK_WS_SECRET も未設定です。端末のアテステーションを検証できず、端末 API は全て拒否されます", // i18n-ignore — サーバーログのみ
  );
}

async function main(): Promise<void> {
  warnAttestSecretFallback();
  const app = next({ dev, dir: process.cwd() });
  await app.prepare();
  const handle = app.getRequestHandler();
  const handleUpgrade = app.getUpgradeHandler();

  const kioskWs = new KioskWsServer();
  // Next のルートハンドラ（別モジュールグラフ）から ws-bridge.ts 経由で参照
  (globalThis as { __kioskWs?: KioskWsServer }).__kioskWs = kioskWs;

  const displayWs = new DisplayWsServer();
  (globalThis as { __displayWs?: DisplayWsServer }).__displayWs = displayWs;

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const reject = () => {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
    };

    if (pathname === "/api/kiosk/ws") {
      void authenticateUpgrade(req)
        .then((client) => {
          if (!client) return reject();
          kioskWs.handleUpgrade(req, socket, head, client);
        })
        .catch(() => socket.destroy());
      return;
    }

    if (pathname === "/api/display/ws") {
      void authenticateDisplayUpgrade(req)
        .then((client) => {
          if (!client) return reject();
          displayWs.handleUpgrade(req, socket, head, client);
        })
        .catch(() => socket.destroy());
      return;
    }

    // Next(dev) の HMR 用 upgrade は Next へ委譲
    void handleUpgrade(req, socket, head);
  });

  server.listen(port, hostname, () => {
    console.log(
      `nextjs-kiosk ready on http://${hostname}:${port} (dev=${dev})`,
    );
  });
}

void main();
