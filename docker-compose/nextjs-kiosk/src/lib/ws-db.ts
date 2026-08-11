/**
 * ws-db.ts — カスタムサーバー（WS）専用の軽量 DB アクセス（pg 直）。
 *
 * 生成 Prisma クライアントは import.meta を含み CJS の tsc ビルドに載らない
 * ため、WS サーバーが必要とする 3 クエリだけ pg で直接叩く。
 * Next 側のルートは従来どおり lib/db.ts（Prisma）を使う。
 */

import { Pool } from "pg";
import { IDLE_TIMEOUT_MS } from "./kiosk-auth-core";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 3 });
  }
  return pool;
}

/** 現在ログイン中のユーザー（ライブセッションがなければ null）。 */
export type PresenceUser = { userId: string; displayName: string } | null;

export type PresenceDevice = {
  id: string;
  status: string;
  lastActivityAt: Date | null;
  user: PresenceUser;
};

/**
 * 端末の最新ライブセッション（失効なし・期限内・アイドル窓内）を 1 件選ぶ
 * LATERAL 句。IDLE_TIMEOUT_MS（kiosk-auth-core）を秒で $1 に渡すこと。
 */
const LIVE_SESSION_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT s.user_id FROM app.kiosk_sessions s
    WHERE s.device_id = d.id
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND s.last_activity_at > now() - make_interval(secs => $1)
    ORDER BY s.created_at DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN app.users u ON u.id = s.user_id`;

const IDLE_TIMEOUT_SECS = IDLE_TIMEOUT_MS / 1000;

function toPresenceUser(row: {
  user_id: string | null;
  display_name: string | null;
}): PresenceUser {
  return row.user_id
    ? { userId: row.user_id, displayName: row.display_name ?? "" }
    : null;
}

/** upgrade 認証: トークンハッシュ → ACTIVE + 期限内の端末 id。 */
export async function findActiveDeviceByTokenHash(
  tokenHash: string,
): Promise<string | null> {
  const res = await getPool().query<{ id: string }>(
    `SELECT id FROM app.kiosk_devices
     WHERE device_token_hash = $1
       AND status = 'ACTIVE'
       AND device_token_expires_at > now()`,
    [tokenHash],
  );
  return res.rows[0]?.id ?? null;
}

/** WS 接続時に lastActivity を刻む。 */
export async function touchDeviceActivity(deviceId: string): Promise<void> {
  await getPool().query(
    `UPDATE app.kiosk_devices SET last_activity_at = now() WHERE id = $1`,
    [deviceId],
  );
}

/**
 * WS 接続中の端末の lastActivity をまとめて刻む（30s ごとのハートビート）。
 * これにより「WS 接続中 ⇒ last_activity_at は 30s 以内」が保証され、
 * 5分窓の判定（SY09 のフォールバック含む）がソケットの有無を知らずに済む。
 */
export async function touchConnectedDevices(
  deviceIds: string[],
): Promise<void> {
  if (deviceIds.length === 0) return;
  await getPool().query(
    `UPDATE app.kiosk_devices SET last_activity_at = now()
     WHERE id = ANY($1::uuid[])`,
    [deviceIds],
  );
}

/** プレゼンス対象（ACTIVE/DISABLED）の一覧（ログイン中ユーザー付き）。 */
export async function listPresenceDevices(): Promise<PresenceDevice[]> {
  const res = await getPool().query<{
    id: string;
    status: string;
    last_activity_at: Date | null;
    user_id: string | null;
    display_name: string | null;
  }>(
    `SELECT d.id, d.status, d.last_activity_at, s.user_id, u.display_name
     FROM app.kiosk_devices d
     ${LIVE_SESSION_LATERAL}
     WHERE d.status IN ('ACTIVE', 'DISABLED')`,
    [IDLE_TIMEOUT_SECS],
  );
  return res.rows.map((r) => ({
    id: r.id,
    status: r.status,
    lastActivityAt: r.last_activity_at,
    user: toPresenceUser(r),
  }));
}

/** 1 台分の lastActivity + ログイン中ユーザーを取得（存在しなければ null）。 */
export async function getDeviceActivity(deviceId: string): Promise<{
  lastActivityAt: Date | null;
  user: PresenceUser;
} | null> {
  const res = await getPool().query<{
    last_activity_at: Date | null;
    user_id: string | null;
    display_name: string | null;
  }>(
    `SELECT d.last_activity_at, s.user_id, u.display_name
     FROM app.kiosk_devices d
     ${LIVE_SESSION_LATERAL}
     WHERE d.id = $2`,
    [IDLE_TIMEOUT_SECS, deviceId],
  );
  const row = res.rows[0];
  return row
    ? { lastActivityAt: row.last_activity_at, user: toPresenceUser(row) }
    : null;
}

/**
 * ONLINE/OFFLINE 遷移ログの冪等 insert。
 * 端末の最新 ONLINE/OFFLINE 行と異なるときだけ 1 行書く（履歴なし = OFFLINE
 * とみなす）ため、どの書き手（refresh/sweep/pg_cron）が何度呼んでも重複しない。
 */
export async function insertPresenceLog(
  deviceId: string,
  type: "ONLINE" | "OFFLINE",
  source: string,
): Promise<void> {
  await getPool().query(
    `INSERT INTO app.kiosk_device_logs (device_id, type, source)
     SELECT $1, $2::app."KIOSK_DEVICE_LOG_TYPE", $3
     WHERE COALESCE((
       SELECT l.type::text FROM app.kiosk_device_logs l
       WHERE l.device_id = $1 AND l.type IN ('ONLINE', 'OFFLINE')
       ORDER BY l.id DESC
       LIMIT 1
     ), 'OFFLINE') IS DISTINCT FROM $2`,
    [deviceId, type, source],
  );
}
