/**
 * realtime.ts — リアルタイム配信バス（Postgres LISTEN/NOTIFY）。server-only.
 *
 * 送信は `publishRealtime()`（Prisma 経由の `pg_notify` — 追加接続なし）、
 * 受信は 1 プロセス 1 本の LISTEN 専用接続。受け取った合図はプロセス内の
 * 購読者（= SSE ストリーム）へ配る。
 *
 *   notify() ─ pg_notify ─▶ Postgres ─ LISTEN ─▶ 本モジュール ─▶ SSE ─▶ ベル
 *
 * Valkey を足さずに済み、レプリカが 2 台以上になっても正しく届く
 * （どのプロセスも同じチャネルを LISTEN する）ためこの方式を採った。
 *
 * **取りこぼしの扱い** — 再接続中に発生したイベントは失われる（NOTIFY に
 * 永続性はない）。これは設計として許容し、次の 2 段で自己回復させる:
 *   1. SSE 接続が確立するたびクライアントが再取得する（route の ready）。
 *   2. クライアントは低頻度のフォールバック再取得を回し続ける
 *      （hooks/useNotifications.ts）。
 * 通知は「早く気付くため」の仕組みで、正は常に DB の notifications 行。
 */

import { Client } from "pg";
import { prisma } from "./db";
import {
  decodeRealtimeEvent,
  encodeRealtimeEvent,
  REALTIME_CHANNEL,
  type RealtimeEvent,
} from "./realtime-events";

type Handler = (event: RealtimeEvent) => void;

interface Bus {
  handlers: Set<Handler>;
  client: Client | null;
  /** 接続処理中はその Promise（同時購読で二重接続しないため）。 */
  connecting: Promise<void> | null;
  retryTimer: NodeJS.Timeout | null;
  retryMs: number;
}

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

// dev の HMR でモジュールが再評価されても接続を 1 本に保つ。
const globalForBus = globalThis as unknown as { __ckkRealtimeBus?: Bus };

function getBus(): Bus {
  if (!globalForBus.__ckkRealtimeBus) {
    globalForBus.__ckkRealtimeBus = {
      handlers: new Set(),
      client: null,
      connecting: null,
      retryTimer: null,
      retryMs: RETRY_BASE_MS,
    };
  }
  return globalForBus.__ckkRealtimeBus;
}

function fanOut(bus: Bus, event: RealtimeEvent): void {
  for (const handler of bus.handlers) {
    // 1 つの購読者の例外で他の購読者への配信を止めない。
    try {
      handler(event);
    } catch (e) {
      console.error("[realtime] 購読ハンドラでエラー:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    }
  }
}

/** 接続が落ちたときの後始末 + 指数バックオフでの再接続予約。 */
function scheduleReconnect(bus: Bus): void {
  bus.client = null;
  // 購読者がいなければ再接続しない（次の subscribe が張り直す）。
  if (bus.handlers.size === 0 || bus.retryTimer) return;
  const delay = bus.retryMs;
  bus.retryMs = Math.min(bus.retryMs * 2, RETRY_MAX_MS);
  bus.retryTimer = setTimeout(() => {
    bus.retryTimer = null;
    void ensureConnected(bus).catch(
      (e) => console.error("[realtime] 再接続に失敗:", e), // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    );
  }, delay);
  // 再接続待ちのタイマーでプロセス終了を妨げない。
  bus.retryTimer.unref?.();
}

async function connect(bus: Bus): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = new Client({ connectionString });
  // error を拾わないと未処理例外でプロセスが落ちる。
  client.on("error", (e) => {
    console.error("[realtime] LISTEN 接続エラー:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    if (bus.client === client) scheduleReconnect(bus);
  });
  client.on("end", () => {
    if (bus.client === client) scheduleReconnect(bus);
  });
  client.on("notification", (msg) => {
    const event = decodeRealtimeEvent(msg.payload);
    if (event) fanOut(bus, event);
  });

  try {
    await client.connect();
    // チャネル名は本モジュールの定数（外部入力ではない）。
    await client.query(`LISTEN "${REALTIME_CHANNEL}"`);
  } catch (e) {
    // 接続はできたが LISTEN で落ちた場合、この client は bus に載らないため
    // 'end' ハンドラの `bus.client === client` にも掛からず、閉じる者が
    // いなくなる。再接続のたびに接続が 1 本ずつ残るので明示的に閉じる。
    await client.end().catch(() => {});
    throw e;
  }
  bus.client = client;
  bus.retryMs = RETRY_BASE_MS;
}

function ensureConnected(bus: Bus): Promise<void> {
  if (bus.client) return Promise.resolve();
  if (bus.connecting) return bus.connecting;
  bus.connecting = connect(bus)
    .catch((e) => {
      scheduleReconnect(bus);
      throw e;
    })
    .finally(() => {
      bus.connecting = null;
    });
  return bus.connecting;
}

/**
 * 配信を購読する。LISTEN が張れるまで待ってから解除関数を返すので、
 * 呼び出し側は「await した時点以降のイベントは届く」と考えてよい
 * （= await 後に初期取得すれば取りこぼさない）。
 *
 * 接続できない場合も購読は成立させる（例外にしない）。バックオフで
 * 再接続を続け、その間はクライアント側のフォールバック取得が支える。
 */
export async function subscribeRealtime(handler: Handler): Promise<() => void> {
  const bus = getBus();
  bus.handlers.add(handler);
  try {
    await ensureConnected(bus);
  } catch (e) {
    console.error("[realtime] LISTEN 開始に失敗（再試行します）:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
  return () => {
    bus.handlers.delete(handler);
  };
}

/**
 * 合図を配信する。業務処理を止めないため失敗はログのみ
 * （通知行の作成自体は既に成功している）。
 */
export async function publishRealtime(event: RealtimeEvent): Promise<void> {
  try {
    const payload = encodeRealtimeEvent(event);
    await prisma.$executeRaw`SELECT pg_notify(${REALTIME_CHANNEL}, ${payload})`;
  } catch (e) {
    console.error("[realtime] 配信に失敗:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
}

/** 対象ユーザーのベルを更新させる。 */
export async function publishNotificationEvent(
  userIds: string[],
): Promise<void> {
  await Promise.all(
    [...new Set(userIds)]
      .filter(Boolean)
      .map((userId) => publishRealtime({ kind: "notification", userId })),
  );
}
