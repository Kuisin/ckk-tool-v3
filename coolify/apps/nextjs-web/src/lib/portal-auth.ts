/**
 * portal-auth.ts — 取引先ポータルのセッション（Cookie + DB）。server-only.
 *
 * ■ なぜ Auth.js を使わないのか（設計の芯）
 *
 * lib/authz.ts の `sessionUserId()` はアプリ唯一の分岐点で、ここが非 null を
 * 返すと**既存の未編集コードが全部「社員がログインしている」と解釈する**:
 *   - auth.config.ts の `authorized = !!auth?.user` → 全内部ページが proxy を通る
 *   - authz-page.tsx `requireAppRead` → requiredPermission が null のアプリは即許可
 *   - share-grants.ts `shareAccessFor` → EVERYONE 行にマッチして全社共有が見える
 *   - privileged-access.ts → セッション区分の概念が無い
 *   - audit.ts `getCurrentActorId` → 監査行の actor が社外の人になる
 *
 * Auth.js に相乗りすると、上の全部と**今後書かれる全ページ**に区分チェックを
 * 足して永久に維持することになる。失敗モードは静かな過剰露出。
 *
 * 独立 Cookie なら逆で、`sessionUserId()` はポータル訪問者に対して null を返す
 * ⇒ proxy は /login へ 307、checkPermission は「ログインが必要です」、
 * shareAccessFor は全 false。**既存コードを 1 行も触らずに 3 層が独立に
 * fail-closed になる。**
 *
 * ■ キオスク（kiosk-auth.ts）との差分
 *
 * 作りは写経だが Cookie の path が違う: **path=/portal に限定する**。
 * ポータルの資格情報が内部ルートへ送信される経路を構造的に消すため。
 * だからポータルの API も /portal/api/... 配下に置く。
 *
 * 生トークン（256bit）は Cookie にだけ。DB は SHA-256 のみ
 * （portal_sessions.id が**そのハッシュそのもの**）。
 */

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { isDevFeatureEnabled } from "./dev-features";
import {
  isPortalSessionAlive,
  PORTAL_LINK_SESSION_TTL_MS,
  PORTAL_SESSION_TTL_MS,
} from "./portal-auth-core";

export const PORTAL_SESSION_COOKIE = "portal_session";

/** ポータルの Cookie スコープ。内部ルートへは送信させない。 */
export const PORTAL_COOKIE_PATH = "/portal";

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256hex(raw) };
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: PORTAL_COOKIE_PATH,
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

export type PortalLoginMethod = "PORTAL_OTP" | "PORTAL_BACKUP" | "PORTAL_LINK";

export interface PortalSession {
  /** portal_sessions.id（= Cookie 生値の sha256）。 */
  sessionId: string;
  /** 通常ログインなら非 null。リンク限定セッションでは null。 */
  accountId: string | null;
  /** リンク限定セッションのときの対象リンク。 */
  linkId: string | null;
  method: PortalLoginMethod;
  /** 表示名（アカウント or リンクのラベル）。 */
  displayName: string;
  locale: string;
  expiresAt: Date;
  lastActivityAt: Date;
}

/**
 * セッションを作り Cookie を張る。
 *
 * accountId / linkId のどちらか一方は必須（DB 側にも CHECK は置いていないが、
 * ここが唯一の生成口なので不正な組み合わせは作られない）。
 */
export async function createPortalSession(input: {
  accountId?: string | null;
  linkId?: string | null;
  method: PortalLoginMethod;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const accountId = input.accountId ?? null;
  const linkId = input.linkId ?? null;
  if (!accountId && !linkId) {
    throw new Error("portal session needs an account or a link");
  }
  // リンク限定は「その 1 件を今見せる」ためのものなので短い。
  const ttl = accountId ? PORTAL_SESSION_TTL_MS : PORTAL_LINK_SESSION_TTL_MS;
  const now = new Date();
  const { raw, hash } = mintToken();

  await prisma.portalSession.create({
    data: {
      id: hash,
      portalAccountId: accountId,
      linkId,
      method: input.method,
      expiresAt: new Date(now.getTime() + ttl),
      lastActivityAt: now,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
    },
  });

  const jar = await cookies();
  jar.set(PORTAL_SESSION_COOKIE, raw, cookieOptions(ttl));
}

/**
 * 現在のセッション。無効なら null。
 *
 * **有効判定は毎回ここで時刻式で行う**（cron は表を短く保つだけで判定に
 * 関与しない — portal-cron.sql の頭のコメント参照）。アカウントが無効化
 * されていれば、セッションが生きていても null を返す。
 *
 * 機能フラグが OFF の環境では、Cookie があっても常に null
 * （main に行が残っていてもセッションとして復活しない）。
 */
export async function getPortalSession(): Promise<PortalSession | null> {
  if (!isDevFeatureEnabled("portal")) return null;

  const jar = await cookies();
  const raw = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!raw) return null;

  const row = await prisma.portalSession.findUnique({
    where: { id: sha256hex(raw) },
    select: {
      id: true,
      portalAccountId: true,
      linkId: true,
      method: true,
      expiresAt: true,
      lastActivityAt: true,
      revokedAt: true,
      account: {
        select: { id: true, displayName: true, locale: true, isActive: true },
      },
      link: { select: { id: true, label: true, revokedAt: true } },
    },
  });
  if (!row) return null;

  const now = new Date();
  if (
    !isPortalSessionAlive(now, row.expiresAt, row.lastActivityAt, row.revokedAt)
  ) {
    return null;
  }
  // アカウントを無効にしたら、生きているセッションも即座に効かなくなる。
  if (row.portalAccountId && !row.account?.isActive) return null;
  // リンクを失効させたら、そのリンクで開いたセッションも終わる。
  if (row.linkId && row.link?.revokedAt) return null;

  return {
    sessionId: row.id,
    accountId: row.portalAccountId,
    linkId: row.linkId,
    method: row.method as PortalLoginMethod,
    displayName: row.account?.displayName ?? row.link?.label ?? "",
    locale: row.account?.locale ?? "ja",
    expiresAt: row.expiresAt,
    lastActivityAt: row.lastActivityAt,
  };
}

/**
 * アイドル窓を延ばす。
 *
 * 書き込みを間引くのはキオスクの ACTIVITY_PING_MIN_INTERVAL_MS と同じ理由で、
 * ページを 1 枚開くたびに UPDATE を撃たないため。
 */
const ACTIVITY_WRITE_MIN_INTERVAL_MS = 60_000;

export async function touchPortalSession(
  session: PortalSession,
): Promise<void> {
  const now = new Date();
  if (
    now.getTime() - session.lastActivityAt.getTime() <
    ACTIVITY_WRITE_MIN_INTERVAL_MS
  ) {
    return;
  }
  await prisma.portalSession
    .update({
      where: { id: session.sessionId },
      data: { lastActivityAt: now },
    })
    .catch(() => {
      // 掃除と競合して行が消えていることはある。次のリクエストで判定し直す。
    });
}

/** ログアウト。行を失効させ Cookie を落とす。 */
export async function destroyPortalSession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (raw) {
    await prisma.portalSession
      .update({
        where: { id: sha256hex(raw) },
        data: { revokedAt: new Date() },
      })
      .catch(() => {
        // 既に消えている / 存在しない Cookie。Cookie を落とせれば十分。
      });
  }
  jar.set(PORTAL_SESSION_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
}
