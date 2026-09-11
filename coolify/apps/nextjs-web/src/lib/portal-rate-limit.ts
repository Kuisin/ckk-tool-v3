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

  // ★ **加算は DB 側で行う**（`{ increment: 1 }`）。読んだ値 +1 を書き戻す形だと、
  //   同時に飛んできた試行が全部「同じ加算前の値」を読むので、何本並べても
  //   カウンタは 1 しか進まない = 5 回の予算が事実上無くなる。キオスクの PIN
  //   カウンタが先に同じ穴を塞いでいる（kiosk/api/kiosk/pin/route.ts）。
  //   upsert の update 側は Prisma が 1 文の UPDATE に落とすので、行ロックの中で
  //   読み書きが閉じる。
  const bumped = await prisma.portalRateLimit
    .upsert({
      where: { bucket_keyRef: { bucket, keyRef: ref } },
      create: {
        bucket,
        keyRef: ref,
        failures: 1,
        windowStartedAt: now,
        lockedUntil: null,
      },
      update: { failures: { increment: 1 } },
      select: { failures: true, windowStartedAt: true, lockedUntil: true },
    })
    .catch(() => null);

  // 記録できなくてもログインの判断は変えない（best-effort）。
  if (!bumped) return { locked: false };

  // 既にロック中なら伸ばさない（ロック中の試行でロックが永久に伸びると、
  // 第三者が撃ち続けるだけで正規利用者を締め出せる）。加算はもう当たって
  // いるが、ロックが明けたときに窓ごと数え直すので害はない。
  if (isPortalLocked(now, bumped.lockedUntil)) {
    return { locked: true };
  }

  // nextPortalLimitState は「加算前の値」を取る（キオスクの
  // nextPinFailureState と同じ約束）ので、加算後の値から 1 戻して渡す。
  const next = nextPortalLimitState(now, cfg, {
    failures: bumped.failures - 1,
    windowStartedAt: bumped.windowStartedAt,
    lockedUntil: bumped.lockedUntil,
  });

  // 窓の繰り越し・ロック到達だけを書き戻す（増分はもう当たっている）。
  if (
    next.lockedUntil !== null ||
    next.failures !== bumped.failures ||
    next.windowStartedAt.getTime() !== bumped.windowStartedAt.getTime() ||
    // 期限切れのロック痕を残さない（判定は時刻式なので害は無いが、
    // 行を読んだ人に「まだロック中」と誤読させない）。
    bumped.lockedUntil !== null
  ) {
    await prisma.portalRateLimit
      .update({
        where: { bucket_keyRef: { bucket, keyRef: ref } },
        data: {
          failures: next.failures,
          windowStartedAt: next.windowStartedAt,
          lockedUntil: next.lockedUntil,
        },
      })
      .catch(() => {
        // best-effort（上と同じ）。
      });
  }

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
