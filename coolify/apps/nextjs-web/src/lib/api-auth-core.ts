/**
 * api-auth-core.ts — 外部 API（/api/v1）の認証判定（純関数・試験対象）。
 *
 * DB も env も触らない。`api-auth.ts` が 1 クエリで集めた行をここへ渡し、
 * ここが「通す / どの理由で弾く」を決める。
 *
 * ■ 理由は**外に出さない**
 *
 * 12 通りの拒否理由があるが、応答は**どれも同一の 401**（`api-problem.ts` の
 * `unauthorized()`）。理由を出し分けると「そのトークンは存在するのか」が
 * 外から読めてしまう。とくに CIDR 不一致を 403 にしないこと — 403 は
 * 「トークンは正しい」を確定させるので、漏れたトークンを持つ相手に
 * 一番知られたくない事実を教えることになる。
 *
 * 理由は `api_access_logs.deny_reason` にだけ残る。
 *
 * ■ 順序が仕様である
 *
 * 複数の条件が同時に成り立つ行（失効済みかつ期限切れかつクライアント無効…）は
 * 普通に起きる。返す理由が実行のたびに変わると調査ができないので、
 * `DENY_ORDER` の順に評価して**最初の 1 つ**を返す。試験がこの順序を固定する。
 */

/** 拒否理由。**サーバー側の記録専用** — 応答からは区別できない。 */
export type ApiAuthDenyReason =
  | "FEATURE_OFF"
  | "NO_HEADER"
  | "MALFORMED"
  | "RATE_LIMITED"
  | "UNKNOWN_TOKEN"
  | "TOKEN_REVOKED"
  | "TOKEN_EXPIRED"
  | "CLIENT_REVOKED"
  | "CLIENT_INACTIVE"
  | "CLIENT_EXPIRED"
  | "CIDR_DENIED"
  | "USER_INACTIVE";

/** 判定の順序 = 仕様。試験がこの並びを固定する。 */
export const DENY_ORDER: readonly ApiAuthDenyReason[] = [
  "FEATURE_OFF",
  "NO_HEADER",
  "MALFORMED",
  "RATE_LIMITED",
  "UNKNOWN_TOKEN",
  "TOKEN_REVOKED",
  "TOKEN_EXPIRED",
  "CLIENT_REVOKED",
  "CLIENT_INACTIVE",
  "CLIENT_EXPIRED",
  "CIDR_DENIED",
  "USER_INACTIVE",
] as const;

/** `api-auth.ts` の 1 クエリが返す形（Prisma の select と対応）。 */
export interface ApiAuthRow {
  id: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  client: {
    id: string;
    name: string;
    isActive: boolean;
    revokedAt: Date | null;
    expiresAt: Date | null;
    allowedCidrs: string[];
    user: {
      id: string;
      username: string;
      displayName: string;
      isActive: boolean;
    };
  };
}

export type ApiAuthDecision =
  | { ok: true }
  | { ok: false; reason: ApiAuthDenyReason };

const DENY = (reason: ApiAuthDenyReason): ApiAuthDecision => ({
  ok: false,
  reason,
});

/** 期限切れか。**境界はちょうどその時刻で切れる**（`<=`）。null = 無期限。 */
export function isExpired(at: Date | null, now: Date): boolean {
  return at !== null && at.getTime() <= now.getTime();
}

/**
 * クライアントの設定変更が**アクセスを広げるか**（SY0I の編集で使う）。
 *
 * 承認（`api_client.activate`）を経ずに広げられると、有効なクライアントの
 * 許可 IP を空（= 制限なし）にするだけで承認の意味が無くなる。そこで
 * 有効なクライアントでは広げる変更を拒否し、いったん無効化 → 変更 →
 * 承認つきで再有効化、の順を踏ませる。狭める変更は承認なしで通す
 * （アクセスを減らす操作を承認待ちにしない、という SY0I の約束）。
 *
 * 広げる = 次のどれか:
 *   - 許可 IP が制限ありから制限なし（空）になる
 *   - 新しい許可 IP のどれかが、元のどの範囲にも含まれない
 *   - 有効期限が外れる / 後ろへ延びる
 *
 * `contains(outer, inner)` は `lib/cidr-core.ts` の `cidrContains` を渡す。
 */
export function widensApiClientAccess(
  before: { allowedCidrs: readonly string[]; expiresAt: Date | null },
  after: { allowedCidrs: readonly string[]; expiresAt: Date | null },
  contains: (outer: unknown, inner: unknown) => boolean,
): boolean {
  if (before.allowedCidrs.length > 0) {
    if (after.allowedCidrs.length === 0) return true;
    const outside = after.allowedCidrs.some(
      (inner) => !before.allowedCidrs.some((outer) => contains(outer, inner)),
    );
    if (outside) return true;
  }
  if (before.expiresAt !== null) {
    if (after.expiresAt === null) return true;
    if (after.expiresAt.getTime() > before.expiresAt.getTime()) return true;
  }
  return false;
}

/**
 * 送信元 IP が許可されているか。
 *
 * **空配列 = 制限なし**（空を「全部拒否」にすると最初の 1 件目で必ず
 * 締め出される）。逆に、リストがあるのに IP が判らないときは**拒否**する —
 * 判らないことを理由に制限を外すと、そこが一番弱い口になる。
 *
 * `matcher` は `lib/cidr-core.ts` の `ipInAnyCidr` を渡す（ここを純粋に保つため
 * 注入する）。
 */
export function cidrAllowed(
  allowedCidrs: readonly string[],
  ip: string | null,
  matcher: (ip: unknown, cidrs: readonly unknown[]) => boolean,
): boolean {
  if (allowedCidrs.length === 0) return true;
  if (!ip) return false;
  return matcher(ip, allowedCidrs);
}

/**
 * 認証の可否。`row` が null = そのハッシュのトークンが無い。
 *
 * 呼び出し側は FEATURE_OFF / NO_HEADER / MALFORMED / RATE_LIMITED を
 * **これより前に**判定済みであること（DB を引く前に決まるため）。
 */
export function apiAuthDecision(
  row: ApiAuthRow | null,
  now: Date,
  ip: string | null,
  matcher: (ip: unknown, cidrs: readonly unknown[]) => boolean,
): ApiAuthDecision {
  if (!row) return DENY("UNKNOWN_TOKEN");
  if (row.revokedAt !== null) return DENY("TOKEN_REVOKED");
  if (isExpired(row.expiresAt, now)) return DENY("TOKEN_EXPIRED");

  const c = row.client;
  if (c.revokedAt !== null) return DENY("CLIENT_REVOKED");
  if (!c.isActive) return DENY("CLIENT_INACTIVE");
  if (isExpired(c.expiresAt, now)) return DENY("CLIENT_EXPIRED");
  if (!cidrAllowed(c.allowedCidrs, ip, matcher)) return DENY("CIDR_DENIED");
  if (!c.user.isActive) return DENY("USER_INACTIVE");

  return { ok: true };
}
