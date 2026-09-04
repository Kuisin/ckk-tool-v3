/**
 * pg-listen.ts — Postgres LISTEN の 1 チャネル購読（カスタムサーバー専用・pg 直）。
 *
 * 管理画面（nextjs-web）は別プロセスなので、WS ブリッジを直接呼べない。
 * 両者が繋いでいる唯一の共有物（DB）を経由して合図だけを受け取る
 * （display-events.ts / kiosk-events.ts 参照）。接続は 1 チャネル 1 本で、
 * 切れたら指数バックオフで張り直す。
 *
 * ディスプレイ（ckk_display）と端末（ckk_kiosk）で同じ張り方を使うので
 * ここに 1 つだけ置く — 片方だけ再試行の癖が違う、を作らないため。
 *
 * ※ Next 依存なし（tsconfig.server.json からコンパイルされる）。
 */

import { Client } from "pg";

const LISTEN_RETRY_BASE_MS = 1_000;
const LISTEN_RETRY_MAX_MS = 30_000;

/**
 * `channel` を LISTEN し、届いた payload（文字列）を `onPayload` へ渡す。
 * 戻り値は購読解除。接続できないうちも例外にせず、黙って再試行し続ける —
 * 合図が届かなくても受け側は自分で追いつく前提（機能が落ちるだけで壊れない）。
 *
 * チャネル名は識別子として埋め込むので、呼び出し側の定数（英小文字と `_`）
 * 以外を渡さないこと。
 */
export function subscribeChannel(
  channel: string,
  onPayload: (payload: string) => void,
): () => void {
  if (!/^[a-z_][a-z0-9_]*$/.test(channel)) {
    throw new Error(`invalid channel name: ${channel}`);
  }

  let closed = false;
  let client: Client | undefined;
  let retryMs = LISTEN_RETRY_BASE_MS;
  let timer: NodeJS.Timeout | undefined;

  const connect = async (): Promise<void> => {
    if (closed) return;
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) return;
    const c = new Client({ connectionString });
    client = c;
    c.on("error", () => scheduleRetry());
    c.on("end", () => scheduleRetry());
    c.on("notification", (msg) => {
      if (msg.channel !== channel || !msg.payload) return;
      onPayload(msg.payload);
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${channel}`);
      retryMs = LISTEN_RETRY_BASE_MS;
    } catch {
      scheduleRetry();
    }
  };

  const scheduleRetry = (): void => {
    if (closed || timer) return;
    client?.removeAllListeners();
    void client?.end().catch(() => undefined);
    client = undefined;
    timer = setTimeout(() => {
      timer = undefined;
      void connect();
    }, retryMs);
    timer.unref?.();
    retryMs = Math.min(retryMs * 2, LISTEN_RETRY_MAX_MS);
  };

  void connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    client?.removeAllListeners();
    void client?.end().catch(() => undefined);
  };
}
