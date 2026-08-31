/**
 * portal-rate-limit-core.ts — 未認証エンドポイントのレート制限（純ロジック）。
 *
 * auth.ts のインメモリ Map は「単一コンテナ運用では十分」という但し書きつきで
 * 成立している。その前提は**インターネットに面した未認証の口**では成立しない:
 * プロセス再起動で消えるし、呼び出し側が識別子（メールアドレス）を自由に選べる。
 * なので状態は DB（app.portal_rate_limits）に置き、判定式だけをここに置く。
 *
 * 形は kiosk の nextPinFailureState（kiosk-auth-core.ts）に合わせてある。
 */

export const PORTAL_LIMIT_BUCKETS = [
  /** OTP の発行（アドレス単位）。**登録の有無に関わらず数える** — 数え方の差が
   *  そのままアカウント存在のオラクルになるため。 */
  "OTP_ISSUE_EMAIL",
  /** OTP の発行（IP 単位）。アドレスを変えながらの総当たりを止める。 */
  "OTP_ISSUE_IP",
  /** OTP の照合。 */
  "OTP_VERIFY",
  /** バックアップコードの照合。単回使用なので発行枚数ぶん試されると困る。 */
  "BACKUP_VERIFY",
  /** 書類リンクの解決（トークン単位）。 */
  "LINK_RESOLVE",
] as const;

export type PortalLimitBucket = (typeof PORTAL_LIMIT_BUCKETS)[number];

export interface PortalLimitConfig {
  /** この回数**に達したら**ロックする。 */
  max: number;
  /** 失敗回数を数える窓。窓を過ぎたら数え直す。 */
  windowMs: number;
  /** ロックの長さ。 */
  lockMs: number;
}

export const PORTAL_LIMITS: Record<PortalLimitBucket, PortalLimitConfig> = {
  // 発行はメールを送る = 迷惑メールの増幅器になりうるので、照合より厳しくする。
  OTP_ISSUE_EMAIL: { max: 5, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
  // 1 つの回線から複数の取引先が入ることはある（同じ会社の複数人）ので緩め。
  OTP_ISSUE_IP: { max: 20, windowMs: 60 * 60_000, lockMs: 60 * 60_000 },
  OTP_VERIFY: { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  // バックアップコードは再発行が管理者の手作業なので、ロックを長めにして
  // 総当たりのコストを上げる。
  BACKUP_VERIFY: { max: 5, windowMs: 15 * 60_000, lockMs: 60 * 60_000 },
  LINK_RESOLVE: { max: 30, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
};

export interface PortalLimitState {
  failures: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
}

/** いまロック中か。 */
export function isPortalLocked(now: Date, lockedUntil: Date | null): boolean {
  return lockedUntil !== null && now.getTime() < lockedUntil.getTime();
}

/**
 * 失敗を 1 つ数えた後の状態。
 *
 * **形式不正の入力も 1 失敗として通すこと** — キオスクの端末設定コード
 * （nextjs-kiosk/src/app/api/kiosk/device-settings/verify/route.ts）と同じ規則で、
 * これをやらないとコードの形をタダで探れる面が残る。
 */
export function nextPortalLimitState(
  now: Date,
  cfg: PortalLimitConfig,
  current: PortalLimitState | null,
): PortalLimitState {
  // 窓を過ぎている（または初回）なら数え直す。
  const withinWindow =
    current !== null &&
    now.getTime() - current.windowStartedAt.getTime() < cfg.windowMs;

  const failures = withinWindow ? current.failures + 1 : 1;
  const windowStartedAt = withinWindow ? current.windowStartedAt : now;

  if (failures >= cfg.max) {
    return {
      // ロック満了後は数え直す（キオスクの nextPinFailureState と同じ）。
      failures: 0,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + cfg.lockMs),
    };
  }
  return { failures, windowStartedAt, lockedUntil: null };
}

/** ロック解除までの残り ms（負値なし）。画面には出さない（存在を漏らすため）。 */
export function portalLockRemainingMs(
  now: Date,
  lockedUntil: Date | null,
): number {
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil.getTime() - now.getTime());
}
