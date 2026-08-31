/**
 * portal-otp.ts — 取引先ポータルの確認コードとバックアップコード。server-only.
 *
 * ■ アカウントの存在を漏らさない
 *
 * 発行の呼び出しは**常に同じものを返す**。未登録のアドレスでも
 * 「デコイのチャレンジ行」を書いて、行ができたかどうか・返るまでの時間で
 * アカウントの有無が読めないようにする（副産物としてレート制限にも数えられる）。
 *
 * ■ コードは DB にハッシュで置く
 *
 * このリポジトリには平文の前例（kiosk_link_requests.code、
 * kiosk_devices.settings_code）があるが、あれの根拠は「管理者が値を読み戻して
 * 現場に口頭で伝える」こと。ここは誰も読み戻さない — generateCode() から
 * sendMail() へ直行し、管理画面にも出ない。しかもコードは既にメールリレーと
 * 受信箱という 1 ホップに露出しているので、DB を 2 つ目の露出面にしない。
 *
 * ■ 焼くのはチャレンジだけ
 *
 * 試行上限に達したらそのチャレンジを consumed にするが、**アカウントは
 * ロックしない** — 第三者がチャレンジを焼くだけで顧客を締め出せてしまう。
 * アカウント側の保護はレート制限（portal-rate-limit.ts）が担う。
 */

import "server-only";

import { randomBytes } from "node:crypto";
import { generateCode, normalizeCode } from "./crockford";
import { prisma } from "./db";
import { correlationRef } from "./login-attempts";
import { hashPassword, verifyPassword } from "./password";
import {
  isPortalChallengeUsable,
  PORTAL_BACKUP_CODE_COUNT,
  PORTAL_BACKUP_CODE_LENGTH,
  PORTAL_OTP_LENGTH,
  PORTAL_OTP_MAX_ATTEMPTS,
  PORTAL_OTP_TTL_MS,
} from "./portal-auth-core";

/** 画面と往復させる公開ハンドル（コードではない）。 */
function mintChallengeRef(): string {
  return randomBytes(32).toString("base64url"); // 43 文字
}

/** アドレスの正規化。保存も照合もこの形で行う。 */
export function normalizePortalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function emailRefOf(email: string): string {
  // pepper 未設定でも空にはしない（相関キーが無いと調査ができない）。
  return correlationRef(email) ?? "";
}

export interface IssuedChallenge {
  challengeRef: string;
  /** 送るべきコード。**呼び出し側はメールに渡す以外に使わない**。 */
  code: string | null;
  /** null = デコイ（未登録・無効アカウント）。メールは送らない。 */
  accountId: string | null;
  /** デコイでない場合の宛先。 */
  email: string | null;
}

/**
 * チャレンジを 1 つ発行する。
 *
 * 実在しないアドレスでも**必ず行を作り、challengeRef を返す**。呼び出し側は
 * 戻り値の accountId が null かどうかで分岐せず、常に同じ画面を出すこと。
 */
export async function issuePortalChallenge(input: {
  email: string;
  linkId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<IssuedChallenge> {
  const email = normalizePortalEmail(input.email);
  const now = new Date();

  // 期限切れの残骸を掃除する（キオスクの setup/begin と同じ作法。
  // pg_cron は取りこぼしの受け皿）。
  await prisma.portalLoginChallenge
    .deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - 3600_000) } },
    })
    .catch(() => {});

  const account = await prisma.portalAccount
    .findUnique({
      where: { email },
      select: { id: true, isActive: true, email: true },
    })
    .catch(() => null);

  const live = account?.isActive === true;
  // デコイでも本物と同じ仕事をする（scrypt のコストまで込みで揃える）。
  const code = generateCode(PORTAL_OTP_LENGTH);
  const challengeRef = mintChallengeRef();

  await prisma.portalLoginChallenge
    .create({
      data: {
        challengeRef,
        portalAccountId: live ? account.id : null,
        linkId: input.linkId ?? null,
        emailRef: emailRefOf(email),
        codeHash: hashPassword(code),
        expiresAt: new Date(now.getTime() + PORTAL_OTP_TTL_MS),
        lastIpAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    })
    .catch(() => {
      // 行が書けなくても画面の応答は変えない（存在を漏らさない）。
    });

  return {
    challengeRef,
    code: live ? code : null,
    accountId: live ? account.id : null,
    email: live ? (account.email ?? email) : null,
  };
}

export type PortalVerifyFailure =
  | "NOT_FOUND"
  | "EXPIRED"
  | "ATTEMPTS"
  | "MISMATCH";

export type PortalVerifyResult =
  | { ok: true; accountId: string | null; linkId: string | null }
  | { ok: false; failure: PortalVerifyFailure };

/**
 * コードを照合する。
 *
 * 成功／失敗のどちらでも `attempts` を進めるので、同じチャレンジに対する
 * 総当たりは PORTAL_OTP_MAX_ATTEMPTS で止まる。
 */
export async function verifyPortalChallenge(input: {
  challengeRef: string;
  code: string;
}): Promise<PortalVerifyResult> {
  const row = await prisma.portalLoginChallenge
    .findUnique({
      where: { challengeRef: input.challengeRef },
      select: {
        id: true,
        portalAccountId: true,
        linkId: true,
        codeHash: true,
        attempts: true,
        consumedAt: true,
        expiresAt: true,
      },
    })
    .catch(() => null);

  if (!row) return { ok: false, failure: "NOT_FOUND" };

  const now = new Date();
  if (row.consumedAt || now >= row.expiresAt) {
    return {
      ok: false,
      failure: row.attempts >= PORTAL_OTP_MAX_ATTEMPTS ? "ATTEMPTS" : "EXPIRED",
    };
  }
  if (!isPortalChallengeUsable(now, row)) {
    return { ok: false, failure: "ATTEMPTS" };
  }

  const matched = verifyPassword(normalizeCode(input.code), row.codeHash);

  if (!matched) {
    const attempts = row.attempts + 1;
    await prisma.portalLoginChallenge
      .update({
        where: { id: row.id },
        data: {
          attempts,
          // 上限に達したらこのチャレンジだけを焼く（アカウントは無事）。
          consumedAt: attempts >= PORTAL_OTP_MAX_ATTEMPTS ? now : null,
        },
      })
      .catch(() => {});
    return {
      ok: false,
      failure: attempts >= PORTAL_OTP_MAX_ATTEMPTS ? "ATTEMPTS" : "MISMATCH",
    };
  }

  // 単回使用: 未使用の行を条件付きで閉じる。同時に 2 回通らない。
  const consumed = await prisma.portalLoginChallenge.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: now, attempts: row.attempts + 1 },
  });
  if (consumed.count !== 1) return { ok: false, failure: "EXPIRED" };

  // デコイ（未登録アドレス）に正解しても、開ける先は無い。
  if (!row.portalAccountId && !row.linkId) {
    return { ok: false, failure: "NOT_FOUND" };
  }
  return { ok: true, accountId: row.portalAccountId, linkId: row.linkId };
}

// ─── バックアップコード ──────────────────────────────────────────────────────

/**
 * 発行する。**平文はこの戻り値にしか存在しない** — 表示は 1 回きりで、
 * 以後どこからも読み戻せない。
 *
 * 再発行は同じトランザクションで未使用の旧行を消す（古い紙が生き続けない）。
 */
export async function issuePortalBackupCodes(input: {
  accountId: string;
  issuedBy: string;
}): Promise<string[]> {
  const codes = Array.from({ length: PORTAL_BACKUP_CODE_COUNT }, () =>
    generateCode(PORTAL_BACKUP_CODE_LENGTH),
  );

  await prisma.$transaction(async (tx) => {
    await tx.portalBackupCode.deleteMany({
      where: { portalAccountId: input.accountId },
    });
    await tx.portalBackupCode.createMany({
      data: codes.map((code, i) => ({
        portalAccountId: input.accountId,
        codeHash: hashPassword(code),
        ordinal: i + 1,
        issuedBy: input.issuedBy,
      })),
    });
  });

  return codes;
}

/**
 * バックアップコードを照合して 1 枚消費する。
 *
 * 消費は `updateMany({ where: { id, usedAt: null } })` の count === 1 で
 * 判定する（useElevation と同じ手口で check-then-use の隙間を作らない）。
 */
export async function consumePortalBackupCode(input: {
  email: string;
  code: string;
  ipAddress?: string | null;
}): Promise<{ ok: true; accountId: string } | { ok: false }> {
  const email = normalizePortalEmail(input.email);
  const account = await prisma.portalAccount
    .findUnique({ where: { email }, select: { id: true, isActive: true } })
    .catch(() => null);
  if (!account?.isActive) return { ok: false };

  const normalized = normalizeCode(input.code);
  const rows = await prisma.portalBackupCode.findMany({
    where: { portalAccountId: account.id, usedAt: null },
    select: { id: true, codeHash: true },
    orderBy: { ordinal: "asc" },
  });

  for (const row of rows) {
    if (!verifyPassword(normalized, row.codeHash)) continue;
    const used = await prisma.portalBackupCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date(), usedIp: input.ipAddress ?? null },
    });
    if (used.count !== 1) return { ok: false }; // 同時に使われた
    return { ok: true, accountId: account.id };
  }
  return { ok: false };
}

/** 残り枚数（管理画面の表示用）。 */
export async function countPortalBackupCodes(
  accountId: string,
): Promise<{ total: number; unused: number }> {
  const [total, unused] = await Promise.all([
    prisma.portalBackupCode.count({ where: { portalAccountId: accountId } }),
    prisma.portalBackupCode.count({
      where: { portalAccountId: accountId, usedAt: null },
    }),
  ]);
  return { total, unused };
}
