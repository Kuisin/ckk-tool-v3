/**
 * ws-db.ts — カスタムサーバー（WS）専用の軽量 DB アクセス（pg 直）。
 *
 * 生成 Prisma クライアントは import.meta を含み CJS の tsc ビルドに載らない
 * ため、WS サーバーが必要とする 3 クエリだけ pg で直接叩く。
 * Next 側のルートは従来どおり lib/db.ts（Prisma）を使う。
 */

import { Pool } from "pg";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 3 });
  }
  return pool;
}

export type PresenceDevice = {
  id: string;
  status: string;
  lastActivityAt: Date | null;
};

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

/** プレゼンス対象（ACTIVE/DISABLED）の一覧。 */
export async function listPresenceDevices(): Promise<PresenceDevice[]> {
  const res = await getPool().query<{
    id: string;
    status: string;
    last_activity_at: Date | null;
  }>(
    `SELECT id, status, last_activity_at FROM app.kiosk_devices
     WHERE status IN ('ACTIVE', 'DISABLED')`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    status: r.status,
    lastActivityAt: r.last_activity_at,
  }));
}

/** 1 台分の lastActivity を取得（存在しなければ null）。 */
export async function getDeviceActivity(
  deviceId: string,
): Promise<{ lastActivityAt: Date | null } | null> {
  const res = await getPool().query<{ last_activity_at: Date | null }>(
    `SELECT last_activity_at FROM app.kiosk_devices WHERE id = $1`,
    [deviceId],
  );
  const row = res.rows[0];
  return row ? { lastActivityAt: row.last_activity_at } : null;
}
