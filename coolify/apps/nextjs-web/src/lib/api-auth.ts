/**
 * api-auth.ts — 外部 API（/api/v1）の認証。server-only.
 *
 * ■ なぜ Auth.js を使わないのか（設計の芯 — portal-auth.ts と同じ理由）
 *
 * lib/authz.ts の `sessionUserId()` はアプリ唯一の分岐点で、ここが非 null を
 * 返すと**既存の未編集コードが全部「社員がログインしている」と解釈する**:
 *   - auth.config.ts の `authorized = !!auth?.user` → 全内部ページが proxy を通る
 *   - authz-page.tsx `requireAppRead` → requiredPermission が null のアプリは即許可
 *   - share-grants.ts `shareAccessFor` → EVERYONE 行にマッチして全社共有が見える
 *   - audit.ts `getCurrentActorId` → 監査行の actor が機械になる
 *
 * この口は **Cookie を一切設定せず、`auth()` を一度も呼ばない**。だから
 * 上の 4 つは**1 行も触らずに fail-closed になる**。逆に言えば、ここに
 * `auth()` を足した瞬間にその保証が消える。足さないこと。
 *
 * ■ 拒否は全部同じ 401
 *
 * 理由（ApiAuthDenyReason）は 12 通りあるが、応答は 1 種類しかない。
 * 「そのトークンは存在するのか」を外から読ませないため。とくに CIDR 不一致を
 * 403 にしない — 403 は「トークンは正しい」を確定させる。
 * 理由は api_access_logs.deny_reason にだけ残る。
 *
 * ■ timingSafeEqual は使わない（lib/shared-token.ts とは事情が違う）
 *
 * あちらは**メモリ上の固定の秘密**と突き合わせるので、素の `===` が
 * 1 バイトずつ探る神託になる。こちらは秘密を比較せず、`sha256(生値)` を
 * 計算して**ダイジェストで索引を引く**。索引の探索時間はダイジェストの関数で、
 * sha256 は原像計算困難だから攻撃者はダイジェストを目標へ寄せられない。
 * 前方一致の神託が存在しないので timingSafeEqual を足しても何も守らず、
 * 「この索引引きは危ないのか」と次に読む人を誤解させるだけになる。
 *
 * 残る**存在のタイミング差**（見つかった方が 1 行ぶん多く働く）は塞ぎ切れない。
 * 緩和は (a) 1 クエリで済ませる (b) 認証段階で権限もスコープも引かない
 * (c) 送信元 IP ごとに失敗を数えて締める、の 3 つ。塞いだとは書かない。
 */

import "server-only";

import {
  type ApiAuthDenyReason,
  type ApiAuthRow,
  apiAuthDecision,
} from "./api-auth-core";
import { ipInAnyCidr } from "./cidr-core";
import { prisma } from "./db";
import { isDevFeatureEnabled } from "./dev-features";
import {
  checkPortalLimit,
  clearPortalLimit,
  recordPortalLimitFailure,
} from "./portal-rate-limit";
import { clientIpOf, forwardedChainOf, userAgentOf } from "./request-ip";
import { parseBearerToken, sha256hex } from "./token-core";

/** 認証を通った呼び出し元。`userId` が decide() / Access / 監査の主体。 */
export interface ApiClientContext {
  clientId: string;
  clientName: string;
  tokenId: string;
  /** app.users.id（group = SYSTEM）。 */
  userId: string;
  username: string;
  displayName: string;
  ip: string | null;
  forwardedFor: string | null;
  userAgent: string | null;
}

export type ApiAuthResult =
  | { ok: true; ctx: ApiClientContext }
  | { ok: false; reason: ApiAuthDenyReason };

/** 最終利用時刻を書き戻す最小間隔。毎回 UPDATE すると常時 polling で焼ける。 */
const TOUCH_MIN_INTERVAL_MS = 60_000;

const SELECT = {
  id: true,
  revokedAt: true,
  expiresAt: true,
  lastUsedAt: true,
  client: {
    select: {
      id: true,
      name: true,
      isActive: true,
      revokedAt: true,
      expiresAt: true,
      allowedCidrs: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          isActive: true,
        },
      },
    },
  },
} as const;

/**
 * Bearer トークンを解決する。**順序が設計** — DB を引く前に決まるものは
 * 先に決める（当てずっぽうの通信を DB に届かせない）。
 */
export async function resolveApiClient(
  request: Request,
): Promise<ApiAuthResult> {
  // 1. 機能ごと閉じている環境では、そもそも存在しない（呼び出し側は 404 にする）。
  if (!isDevFeatureEnabled("api")) return { ok: false, reason: "FEATURE_OFF" };

  // 2. 形が違えば DB を引かない。ここで漏れるのは「トークンの形式」だけで、
  //    それは公開情報。
  const header = request.headers.get("authorization");
  if (!header) return { ok: false, reason: "NO_HEADER" };
  const raw = parseBearerToken(header);
  if (!raw) return { ok: false, reason: "MALFORMED" };

  const ip = clientIpOf(request);

  // 3. 失敗の数え上げ（送信元 IP 単位）。トークンそのものでは数えない —
  //    総当たりは毎回違う値で来るので、値ごとに数えるとロックが一度もかからない。
  const limitKey = ip ?? "unknown";
  if ((await checkPortalLimit("API_AUTH_IP", limitKey)).locked) {
    return { ok: false, reason: "RATE_LIMITED" };
  }

  // 4. 1 クエリ。ここで権限もスコープも引かない（認証と認可を混ぜない）。
  const row = (await prisma.apiClientToken
    .findUnique({ where: { tokenHash: sha256hex(raw) }, select: SELECT })
    .catch(() => null)) as (ApiAuthRow & { lastUsedAt: Date | null }) | null;

  const now = new Date();
  const decision = apiAuthDecision(row, now, ip, ipInAnyCidr);

  if (!decision.ok) {
    await recordPortalLimitFailure("API_AUTH_IP", limitKey).catch(() => {});
    return decision;
  }
  // row は decision.ok の時点で非 null（apiAuthDecision が null を弾いている）。
  const t = row as ApiAuthRow & { lastUsedAt: Date | null };

  // 成功したら失敗カウンタを落とす（正しい鍵を持つ相手を巻き込まない）。
  await clearPortalLimit("API_AUTH_IP", limitKey).catch(() => {});
  void touch(t, now, ip);

  return {
    ok: true,
    ctx: {
      clientId: t.client.id,
      clientName: t.client.name,
      tokenId: t.id,
      userId: t.client.user.id,
      username: t.client.user.username,
      displayName: t.client.user.displayName,
      ip,
      forwardedFor: forwardedChainOf(request),
      userAgent: userAgentOf(request),
    },
  };
}

/** 最終利用の書き戻し（間引き・失敗しても認証は通す）。 */
async function touch(
  t: ApiAuthRow & { lastUsedAt: Date | null },
  now: Date,
  ip: string | null,
): Promise<void> {
  const last = t.lastUsedAt?.getTime() ?? 0;
  if (now.getTime() - last < TOUCH_MIN_INTERVAL_MS) return;
  await prisma
    .$transaction([
      prisma.apiClientToken.update({
        where: { id: t.id },
        data: { lastUsedAt: now, useCount: { increment: 1 } },
      }),
      prisma.apiClient.update({
        where: { id: t.client.id },
        data: { lastUsedAt: now, lastUsedIp: ip ?? undefined },
      }),
    ])
    .catch(() => {});
}

export interface ApiAccessLogInput {
  clientId?: string | null;
  tokenId?: string | null;
  method: string;
  path: string;
  status: number;
  denyReason?: ApiAuthDenyReason | null;
  permissionCode?: string | null;
  durationMs?: number | null;
  ip?: string | null;
  forwardedFor?: string | null;
  userAgent?: string | null;
}

/**
 * 1 リクエスト = 1 行。**記録の失敗でリクエストを落とさない**（recordAudit と
 * 同じ姿勢）。`path` は pathname だけ — クエリは誤用でトークンを載せうる。
 */
export async function logApiAccess(input: ApiAccessLogInput): Promise<void> {
  try {
    await prisma.apiAccessLog.create({
      data: {
        clientId: input.clientId ?? null,
        tokenId: input.tokenId ?? null,
        method: input.method.slice(0, 8),
        path: input.path.slice(0, 256),
        status: input.status,
        denyReason: input.denyReason ?? null,
        permissionCode: input.permissionCode ?? null,
        durationMs: input.durationMs ?? null,
        ipAddress: input.ip ?? null,
        forwardedFor: input.forwardedFor?.slice(0, 200) ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });
  } catch (e) {
    console.error("[api-access-log]", e);
  }
}
