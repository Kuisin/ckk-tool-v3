/**
 * display-auth.ts — 管理ディスプレイの端末認証（Cookie + DB）。server-only.
 *
 * ckk_display Cookie ←→ display_devices.device_token_hash（365日）。
 * Cookie にはトークン生値（256bit ランダム）、DB には SHA-256 のみ。
 * ハッシュ化とトークン生成は kiosk-auth.ts のものをそのまま使う
 * （同じ意味の処理を 2 つ持たない）。
 *
 * キオスクと違って人セッションが無い — ディスプレイに利用者は居ない。
 * よってここにあるのは「この画面は登録済みか」だけ。
 */

import { cookies } from "next/headers";
import { prisma } from "./db";
import {
  DISPLAY_TOKEN_TTL_MS,
  isDisplayTokenAlive,
  normalizeScalePercent,
} from "./display-core";
import { deviceName } from "./format";
import { mintToken, sha256hex } from "./kiosk-auth";

export const DISPLAY_COOKIE = "ckk_display";

export type DisplayAuth = {
  id: string;
  name: string | null;
  location: string | null;
  plantId: number | null;
  /** 表示倍率（%）。画面の大きさに合わせる微調整。 */
  scalePercent: number;
};

export type DisplayAuthFailReason =
  | "NO_COOKIE" // 未ペアリング（新品 / Cookie を消した）
  // Cookie はあるが該当行が無い。**失効（取り消し）もここに来る** —
  // 取り消しはトークンのハッシュごと消すので、照合の側からは行が無いのと
  // 区別が付かない。画面の文言はそれを踏まえて書くこと（DisplayPairing.tsx）。
  | "NOT_FOUND"
  | "EXPIRED" // トークン期限切れ
  | "DISABLED" // 一時停止
  // 状態だけ REVOKED でトークンが残っている場合。通常の失効操作では
  // ハッシュを消すので、実際にはまず通らない。
  | "REVOKED";

export type DisplayAuthResult =
  | { ok: true; display: DisplayAuth }
  | { ok: false; reason: DisplayAuthFailReason };

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** 365日トークンを発行し Cookie に設定、ハッシュと期限を返す。 */
export async function setDisplayCookie(): Promise<{
  hash: string;
  expiresAt: Date;
}> {
  const { raw, hash } = mintToken();
  const store = await cookies();
  store.set(DISPLAY_COOKIE, raw, cookieOptions(DISPLAY_TOKEN_TTL_MS));
  return { hash, expiresAt: new Date(Date.now() + DISPLAY_TOKEN_TTL_MS) };
}

/**
 * Cookie を捨てる。**失効を検知したら必ず呼ぶ** — これがあるから、
 * 管理画面で「取り消し」を押すだけで Pi が自分からペアリング画面へ戻る
 * （現場に行って端末を触る必要がない）。
 */
export async function clearDisplayCookie(): Promise<void> {
  const store = await cookies();
  store.delete(DISPLAY_COOKIE);
}

/**
 * Cookie から登録済みディスプレイを解決。ACTIVE + 期限内のみ ok。
 * 失敗理由を型付きで返すのは、画面の出し分けに使うため
 * （NO_COOKIE = ペアリング画面 / それ以外 = 理由を出してからペアリングへ）。
 */
export async function getDisplay(): Promise<DisplayAuthResult> {
  const store = await cookies();
  const raw = store.get(DISPLAY_COOKIE)?.value;
  if (!raw) return { ok: false, reason: "NO_COOKIE" };

  const row = await prisma.displayDevice.findUnique({
    where: { deviceTokenHash: sha256hex(raw) },
    select: {
      id: true,
      name: true,
      location: true,
      plantId: true,
      scalePercent: true,
      status: true,
      deviceTokenExpiresAt: true,
    },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.status === "DISABLED") return { ok: false, reason: "DISABLED" };
  if (row.status !== "ACTIVE") return { ok: false, reason: "REVOKED" };
  if (!isDisplayTokenAlive(new Date(), row.deviceTokenExpiresAt)) {
    return { ok: false, reason: "EXPIRED" };
  }
  return {
    ok: true,
    display: {
      id: row.id,
      // 端末名は多言語 JSON。ディスプレイの画面は ja 固定（利用者が居ない）。
      name: deviceName(row.name),
      location: row.location,
      plantId: row.plantId,
      scalePercent: normalizeScalePercent(row.scalePercent),
    },
  };
}

/**
 * 生存を刻む。WS が張れている間は WS サーバー側が 30 秒ごとに更新するので、
 * こちらは HTTP ハートビートと設定取得のときだけ使う。
 * best-effort — 失敗しても画面は出し続ける。
 */
export async function touchDisplay(
  displayId: string,
  meta: {
    ipAddress?: string | null;
    userAgent?: string | null;
    appVersion?: string | null;
    machineId?: string | null;
    screenIndex?: number | null;
  } = {},
): Promise<void> {
  await prisma.displayDevice
    .update({
      where: { id: displayId },
      data: {
        lastSeenAt: new Date(),
        ...(meta.ipAddress !== undefined
          ? { lastIpAddress: meta.ipAddress }
          : {}),
        ...(meta.userAgent !== undefined ? { userAgent: meta.userAgent } : {}),
        ...(meta.appVersion !== undefined
          ? { appVersion: meta.appVersion }
          : {}),
        ...(meta.machineId !== undefined ? { machineId: meta.machineId } : {}),
        ...(meta.screenIndex !== undefined
          ? { screenIndex: meta.screenIndex }
          : {}),
      },
    })
    .catch(() => undefined);
}
