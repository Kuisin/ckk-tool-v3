/**
 * display-ws-db.ts — ディスプレイ WS サーバー専用の軽量 DB アクセス（pg 直）。
 *
 * ws-db.ts と同じ理由で Prisma を使わない（生成クライアントは import.meta を
 * 含み、カスタムサーバーの CJS ビルドに載らない）。
 */

import { Pool } from "pg";

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 2 });
  }
  return pool;
}

export type PresenceDisplay = {
  id: string;
  status: string;
  lastSeenAt: Date | null;
  profileId: string | null;
  appVersion: string | null;
};

/** upgrade 認証: トークンハッシュ → ACTIVE + 期限内のディスプレイ id。 */
export async function findActiveDisplayByTokenHash(
  tokenHash: string,
): Promise<string | null> {
  const res = await getPool().query<{ id: string }>(
    `SELECT id FROM app.display_devices
     WHERE device_token_hash = $1
       AND status = 'ACTIVE'
       AND device_token_expires_at > now()`,
    [tokenHash],
  );
  return res.rows[0]?.id ?? null;
}

/** WS 接続時に lastSeen を刻む。 */
export async function touchDisplaySeen(displayId: string): Promise<void> {
  await getPool().query(
    `UPDATE app.display_devices SET last_seen_at = now() WHERE id = $1`,
    [displayId],
  );
}

/**
 * WS 接続中のディスプレイの lastSeen をまとめて刻む（30s ごと）。
 * これで「WS 接続中 ⇒ last_seen_at は 30s 以内」が保証され、HTTP 側の
 * 死活判定はソケットの有無を知らずに済む（ws-db と同じ約束）。
 */
export async function touchConnectedDisplays(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await getPool().query(
    `UPDATE app.display_devices SET last_seen_at = now()
     WHERE id = ANY($1::uuid[])`,
    [ids],
  );
}

/** モニターへ返す一覧（取り消し済みは出さない）。 */
export async function listPresenceDisplays(): Promise<PresenceDisplay[]> {
  const res = await getPool().query<{
    id: string;
    status: string;
    last_seen_at: Date | null;
    display_profile_id: string | null;
    app_version: string | null;
  }>(
    `SELECT id, status, last_seen_at, display_profile_id, app_version
     FROM app.display_devices
     WHERE status IN ('ACTIVE', 'DISABLED')`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    status: r.status,
    lastSeenAt: r.last_seen_at,
    profileId: r.display_profile_id,
    appVersion: r.app_version,
  }));
}

/** 1 台分の現況（存在しなければ null）。 */
export async function getDisplayPresence(
  displayId: string,
): Promise<PresenceDisplay | null> {
  const res = await getPool().query<{
    id: string;
    status: string;
    last_seen_at: Date | null;
    display_profile_id: string | null;
    app_version: string | null;
  }>(
    `SELECT id, status, last_seen_at, display_profile_id, app_version
     FROM app.display_devices WHERE id = $1`,
    [displayId],
  );
  const row = res.rows[0];
  return row
    ? {
        id: row.id,
        status: row.status,
        lastSeenAt: row.last_seen_at,
        profileId: row.display_profile_id,
        appVersion: row.app_version,
      }
    : null;
}
