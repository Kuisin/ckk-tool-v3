/**
 * portal-rate-limit.ts — 未認証エンドポイントのレート制限（DB 保存）。server-only.
 *
 * 判定式は portal-rate-limit-core.ts（純関数）。ここは読み書きだけ。
 *
 * **キーは必ず HMAC を通す**（correlationRef）。生のメールアドレスも生の
 * トークンもカウンタ表に入れない — 表が漏れたときに「誰が使っているか」
 * 「どのリンクが存在するか」が読めてしまう。
 */

import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "./db";
import { correlationRef } from "./login-attempts";
import {
  isPortalLocked,
  nextPortalLimitState,
  PORTAL_LIMITS,
  type PortalLimitBucket,
} from "./portal-rate-limit-core";

/**
 * カウンタのキー。相関キー（HMAC）に落とす。
 * pepper（LOGIN_ATTEMPT_PEPPER）が未設定の環境では correlationRef が null を
 * 返すので、そのときだけ sha256 に落として**制限自体は効かせる**
 * （pepper が無いことを理由に制限を外すと、そこが一番弱い口になる）。
 */
function keyRef(value: string): string {
  const ref = correlationRef(value);
  if (ref) return ref;
  // 相関の匿名性は落ちるが、値そのものは残らない。
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface PortalLimitCheck {
  locked: boolean;
}

/** いまロックされているか（**副作用なし** — 数えない）。 */
export async function checkPortalLimit(
  bucket: PortalLimitBucket,
  value: string,
): Promise<PortalLimitCheck> {
  const row = await prisma.portalRateLimit
    .findUnique({
      where: { bucket_keyRef: { bucket, keyRef: keyRef(value) } },
      select: { lockedUntil: true },
    })
    .catch(() => null);
  return { locked: isPortalLocked(new Date(), row?.lockedUntil ?? null) };
}

/**
 * 失敗を 1 つ数える。
 *
 * **形式不正の入力もここを通すこと** — キオスクの端末設定コード
 * （nextjs-kiosk/src/app/api/kiosk/device-settings/verify/route.ts）と同じ規則。
 * 通さないと、コードやトークンの「形」をタダで探れる面が残る。
 */
export async function recordPortalLimitFailure(
  bucket: PortalLimitBucket,
  value: string,
): Promise<{ locked: boolean }> {
  const now = new Date();
  const ref = keyRef(value);
  const cfg = PORTAL_LIMITS[bucket];

  const current = await prisma.portalRateLimit
    .findUnique({
      where: { bucket_keyRef: { bucket, keyRef: ref } },
      select: { failures: true, windowStartedAt: true, lockedUntil: true },
    })
    .catch(() => null);

  // 既にロック中なら伸ばさない（ロック中の試行でロックが永久に伸びると、
  // 第三者が撃ち続けるだけで正規利用者を締め出せる）。
  if (isPortalLocked(now, current?.lockedUntil ?? null)) {
    return { locked: true };
  }

  const next = nextPortalLimitState(
    now,
    cfg,
    current
      ? {
          failures: current.failures,
          windowStartedAt: current.windowStartedAt,
          lockedUntil: current.lockedUntil,
        }
      : null,
  );

  await prisma.portalRateLimit
    .upsert({
      where: { bucket_keyRef: { bucket, keyRef: ref } },
      create: {
        bucket,
        keyRef: ref,
        failures: next.failures,
        windowStartedAt: next.windowStartedAt,
        lockedUntil: next.lockedUntil,
      },
      update: {
        failures: next.failures,
        windowStartedAt: next.windowStartedAt,
        lockedUntil: next.lockedUntil,
      },
    })
    .catch(() => {
      // 記録できなくてもログインの判断は変えない（best-effort）。
    });

  return { locked: next.lockedUntil !== null };
}

/** 成功したのでカウンタを消す。 */
export async function clearPortalLimit(
  bucket: PortalLimitBucket,
  value: string,
): Promise<void> {
  await prisma.portalRateLimit
    .delete({ where: { bucket_keyRef: { bucket, keyRef: keyRef(value) } } })
    .catch(() => {
      // 無ければ何もしない。
    });
}
